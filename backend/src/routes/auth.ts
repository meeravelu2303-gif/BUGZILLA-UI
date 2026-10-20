import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME, type Env } from '../config/env';
import { loginToBugzilla, logoutFromBugzilla } from '../lib/bugzillaAuth';
import { BugzillaClient } from '../lib/bugzillaClient';
import { AppError } from '../lib/errors';
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  checkLoginRateLimit,
  clearLoginFailures,
  loginRateLimitKey,
  recordLoginFailure,
} from '../lib/loginRateLimit';
import { changeOwnPassword } from '../lib/changePassword';
import { completePasswordReset, requestPasswordReset, validateResetToken } from '../lib/passwordReset';
import {
  CHANGE_PASSWORD_ATTEMPTS_PER_USER,
  RESET_ATTEMPTS_PER_IP,
  RESET_DAILY_WINDOW_MS,
  RESET_REQUESTS_PER_ACCOUNT,
  RESET_REQUESTS_PER_ACCOUNT_PER_DAY,
  RESET_REQUESTS_PER_IP,
  RESET_WINDOW_MS,
  checkSlot,
  clientIp,
  recordHit,
  requestedLogin,
  takeSlot,
} from '../lib/passwordResetRateLimit';
import {
  MAX_SESSIONS_PER_USER,
  forgetSession,
  registerSession,
  sessionsFor,
} from '../lib/sessionRegistry';
import { parseInput } from '../lib/validate';
import {
  changePasswordInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  resetPasswordInputSchema,
  resetTokenSchema,
} from '../schemas/auth';
import { derivePermissions, userDetailSchema } from '../schemas/common';
import { requireAuth } from '../middleware/auth';
import type { SessionUser } from '../types/express';

/** Names the browser install across logins so it reuses its own session slot. */
const DEVICE_COOKIE_NAME = 'bz_device';
/** A year: this identifies a device, and outliving any one session is the point. */
const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The device id this browser last used, if any.
 *
 * Reads the `Cookie` header directly rather than pulling in `cookie-parser`:
 * this is the only cookie the app reads itself (express-session parses its own
 * internally), and a new runtime dependency for one lookup is not a trade this
 * codebase makes elsewhere.
 *
 * Purely an optimisation for slot reuse - never trusted as identity. The UUID
 * shape is enforced so a hand-written value cannot smuggle anything odd into a
 * registry key, and `sessionsFor` only ever matches it against sessions of the
 * account that just authenticated, so it cannot reach another user's sessions.
 */
function readDeviceId(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== DEVICE_COOKIE_NAME) continue;

    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
  }
  return undefined;
}

/**
 * Destroys one session's server-side record and forgets it.
 *
 * Best-effort by design: this runs while completing someone else's successful
 * login, and a store hiccup evicting a stale record must not fail that login.
 * The registry entry is dropped either way, so the slot is freed even if the
 * store write failed.
 */
function destroySession(req: Request, sessionId: string): void {
  forgetSession(sessionId);
  req.sessionStore.destroy(sessionId, (err) => {
    if (err) console.warn(`[auth] could not destroy evicted session ${sessionId}:`, err);
  });
}

/**
 * Refuses a login only while its (IP + account) key is already in cooldown.
 *
 * Deliberately does NOT count this attempt: the counter moves in the route
 * handler, once the credentials have actually been judged. Counting here is
 * what made the old limiter treat a successful sign-in as an attack and lock
 * people out of their own accounts after ten valid logins.
 */
function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const state = checkLoginRateLimit(loginRateLimitKey(req));
  if (!state.limited) {
    next();
    return;
  }

  const minutes = Math.max(1, Math.ceil(state.retryAfterSec / 60));
  res.setHeader('Retry-After', String(state.retryAfterSec));
  next(
    new AppError(
      429,
      'RATE_LIMITED',
      `Too many failed sign-in attempts for this account from this device. Try again in ${minutes} minute(s).`,
      undefined,
      {
        retryAfterSeconds: state.retryAfterSec,
        // Absolute instant as well as the delay: a client that queues a retry
        // does not have to trust its own clock drift against ours.
        retryAt: new Date(Date.now() + state.retryAfterSec * 1000).toISOString(),
        limit: LOGIN_MAX_FAILURES,
        remaining: 0,
        windowSeconds: Math.round(LOGIN_WINDOW_MS / 1000),
        // Names the axis so a UI can say "this account, from this device"
        // rather than implying the account is locked everywhere.
        scope: 'ip+account',
      }
    )
  );
}

/** 429 in the same shape the login limiter uses, so the client's one cooldown branch covers both. */
function tooManyRequests(
  res: Response,
  retryAfterSec: number,
  what: string,
  extra: { windowMs?: number; scope?: string; limit?: number } = {}
): AppError {
  const windowMs = extra.windowMs ?? RESET_WINDOW_MS;
  const retryAt = new Date(Date.now() + retryAfterSec * 1000);
  const wait =
    retryAfterSec >= 3600
      ? `after ${retryAt.toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}`
      : `in ${Math.max(1, Math.ceil(retryAfterSec / 60))} minute(s)`;
  res.setHeader('Retry-After', String(retryAfterSec));
  return new AppError(429, 'RATE_LIMITED', `Too many ${what}. Try again ${wait}.`, undefined, {
    retryAfterSeconds: retryAfterSec,
    retryAt: retryAt.toISOString(),
    windowSeconds: Math.round(windowMs / 1000),
    scope: extra.scope ?? 'password-reset',
    ...(extra.limit !== undefined ? { limit: extra.limit } : {}),
  });
}

/**
 * Caps reset emails per (IP, address) and per IP. Counted up front, success
 * or not: the cost being limited is the email Bugzilla sends, and that is
 * incurred before the outcome is known.
 */
function forgotPasswordRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const perIp = takeSlot(`ip|${ip}`, RESET_REQUESTS_PER_IP);
  if (!perIp.allowed) return next(tooManyRequests(res, perIp.retryAfterSec, 'password reset requests'));
  const perAccount = takeSlot(`acct|${ip}|${requestedLogin(req)}`, RESET_REQUESTS_PER_ACCOUNT);
  if (!perAccount.allowed) return next(tooManyRequests(res, perAccount.retryAfterSec, 'password reset requests for this address'));
  next();
}

/** Caps token checks and password submissions per IP, so a link cannot be guessed at. */
function resetAttemptRateLimit(req: Request, res: Response, next: NextFunction): void {
  const slot = takeSlot(`attempt|${clientIp(req)}`, RESET_ATTEMPTS_PER_IP);
  if (!slot.allowed) return next(tooManyRequests(res, slot.retryAfterSec, 'password reset attempts'));
  next();
}

/** `m***@example.com` - enough to follow a reset in the server log, not enough to harvest. */
function maskLogin(login: string): string {
  const at = login.indexOf('@');
  return at > 0 ? `${login[0]}***${login.slice(at)}` : '***';
}

export function authRouter(env: Env): Router {
  const router = Router();

  /*
   * Forgot password. Always 202 once the input is well formed - whether the
   * address has an account, is disabled, or asked ten minutes ago is not
   * revealed to an unauthenticated caller. The real outcome goes to the server
   * log only. Bugzilla sends the email itself (see lib/passwordReset.ts).
   */
  router.post('/forgot-password', forgotPasswordRateLimit, async (req, res, next) => {
    try {
      const { login } = parseInput(forgotPasswordInputSchema, req.body);

      // The "3 per day" rule, on the address itself. Checked here, after
      // validation, so a typo does not spend one of the three.
      const dailyKey = `day|${login.toLowerCase()}`;
      const daily = checkSlot(dailyKey, RESET_REQUESTS_PER_ACCOUNT_PER_DAY, RESET_DAILY_WINDOW_MS);
      if (!daily.allowed) {
        throw tooManyRequests(res, daily.retryAfterSec, `password reset emails for this address (limit ${RESET_REQUESTS_PER_ACCOUNT_PER_DAY} per 24 hours)`, {
          windowMs: RESET_DAILY_WINDOW_MS,
          scope: 'password-reset-daily',
          limit: RESET_REQUESTS_PER_ACCOUNT_PER_DAY,
        });
      }

      const outcome = await requestPasswordReset(env.BUGZILLA_URL, login);
      console.info(`[auth] password reset requested for ${maskLogin(login)}: ${outcome}`);
      // Bugzilla sent nothing inside its 10-minute interval, so that attempt is not one of the three.
      if (outcome !== 'too_soon') recordHit(dailyKey, RESET_DAILY_WINDOW_MS);
      res.status(202).json({
        accepted: true,
        // What the UI tells people to wait before asking again: Bugzilla's own
        // per-account interval (ACCOUNT_CHANGE_INTERVAL), after which a fresh
        // token can be issued.
        cooldownMinutes: 10,
        // MAX_TOKEN_AGE: how long the emailed link stays valid.
        linkValidDays: 3,
        dailyLimit: RESET_REQUESTS_PER_ACCOUNT_PER_DAY,
      });
    } catch (err) {
      next(err);
    }
  });

  /*
   * Is this link still good? Lets the reset page say "expired, request a new
   * one" before the person types a password, instead of after. The token
   * travels in the body (never a query string) on both hops.
   */
  router.post('/reset-password/validate', resetAttemptRateLimit, async (req, res, next) => {
    try {
      const token = parseInput(resetTokenSchema, (req.body as { token?: unknown } | undefined)?.token);
      const valid = await validateResetToken(env.BUGZILLA_URL, token);
      res.set('Cache-Control', 'no-store').json({ valid });
    } catch (err) {
      next(err);
    }
  });

  /*
   * Reset password. Bugzilla consumes the token, sets the password and drops
   * every Bugzilla login session of that account - so any BFF session still
   * holding one of those tokens fails its next upstream call with a 401 and
   * the browser is sent back to sign in. No separate eviction is needed here.
   */
  router.post('/reset-password', resetAttemptRateLimit, async (req, res, next) => {
    try {
      const { token, password } = parseInput(resetPasswordInputSchema, req.body);
      await completePasswordReset(env.BUGZILLA_URL, token, password);
      console.info('[auth] password reset completed');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', loginRateLimit, async (req, res, next) => {
    const rateKey = loginRateLimitKey(req);
    try {
      const input = parseInput(loginInputSchema, req.body);

      let id: number;
      let token: string;
      try {
        ({ id, token } = await loginToBugzilla(env.BUGZILLA_URL, input.login, input.password));
      } catch (err) {
        /*
         * Count only a genuine credential rejection. A Bugzilla outage or a
         * timeout is not a failed guess, and charging the user's budget for it
         * would lock them out of a system that was never going to let them in
         * anyway - then keep them out for the whole window after it recovered.
         */
        if (err instanceof AppError && (err.status === 401 || err.status === 400)) {
          recordLoginFailure(rateKey);
        }
        throw err;
      }

      // Verified. Clear the slate so earlier typos do not follow the user
      // through the rest of the window.
      clearLoginFailures(rateKey);

      const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token });
      const userResp = await client.get<{ users: unknown[] }>(`/user/${id}`);
      const user = userDetailSchema.parse(userResp.users[0]);
      const permissions = derivePermissions(user.groups);

      const sessionUser: SessionUser = { bzUserId: id, bzToken: token, email: user.email, realName: user.real_name || user.email, permissions };

      // New session id on privilege change, so a pre-login id can't be replayed.
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      /*
       * `deviceId` identifies the browser install, `sessionId` this particular
       * sign-in on it. Both live in the session record, never in the cookie -
       * the cookie stays an opaque signed id, so neither is client-supplied and
       * neither can be forged to impersonate another device.
       *
       * A returning device reuses its own id (sent back as a cookie the client
       * may keep), so signing in twice on the same laptop replaces that
       * laptop's session rather than consuming a second of the three slots.
       */
      const deviceId = readDeviceId(req) ?? randomUUID();
      const now = Date.now();

      req.session.bzUserId = sessionUser.bzUserId;
      req.session.bzToken = sessionUser.bzToken;
      req.session.email = sessionUser.email;
      req.session.realName = sessionUser.realName;
      req.session.permissions = sessionUser.permissions;
      req.session.deviceId = deviceId;

      // Persist to the store before replying, so the very next request finds it.
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      /*
       * Retire this device's previous session for the same account before
       * counting slots, so re-logging in on one machine is never what pushes a
       * colleague's phone out.
       */
      for (const existing of sessionsFor(id)) {
        if (existing.deviceId === deviceId && existing.sessionId !== req.sessionID) {
          destroySession(req, existing.sessionId);
        }
      }

      const evicted = registerSession(id, {
        sessionId: req.sessionID,
        deviceId,
        createdAt: now,
        lastSeenAt: now,
        userAgent: (req.get('user-agent') ?? 'unknown').slice(0, 200),
      });

      // Over the ceiling: drop the least recently used sessions' server-side
      // records. Their cookies survive but now resolve to nothing, so those
      // devices get a 401 on their next request and are asked to sign in again.
      for (const stale of evicted) destroySession(req, stale.sessionId);

      res.cookie(DEVICE_COOKIE_NAME, deviceId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'true' || (env.COOKIE_SECURE === 'auto' && req.secure),
        path: '/',
        maxAge: DEVICE_COOKIE_MAX_AGE_MS,
      });

      res.json({
        user: { id, email: sessionUser.email, realName: sessionUser.realName, permissions },
        session: {
          deviceId,
          activeSessions: sessionsFor(id).length,
          maxSessions: MAX_SESSIONS_PER_USER,
          /*
           * Told plainly rather than left as a mystery logout on the other
           * device: a person who is signed in on four machines should learn
           * that here, not by finding one silently signed out later.
           */
          evictedSessions: evicted.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    // Free this device's slot immediately. Signing out on one device must not
    // disturb the same account's other sessions - they keep their own records.
    forgetSession(req.sessionID);
    // Invalidate the Bugzilla token too, so it cannot be replayed from a backup
    // or log after the cookie is gone. Best effort - see logoutFromBugzilla.
    const token = req.session.bzToken;
    if (token) await logoutFromBugzilla(env.BUGZILLA_URL, token);
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE === 'true' || (env.COOKIE_SECURE === 'auto' && req.secure),
        path: '/',
      });
      res.status(204).end();
    });
  });

  /*
   * Change password, signed in. Bugzilla verifies the current password and
   * applies its own rules (lib/changePassword.ts), then ends every other login
   * of the account while keeping this one. The BFF mirrors that for its own
   * sessions straight away, so another device is signed out on its next
   * request rather than whenever its Bugzilla call next fails.
   */
  router.post('/change-password', requireAuth(env), async (req, res, next) => {
    try {
      const user = req.sessionUser!;
      // Validated first: a mismatched confirmation never reaches Bugzilla, so it costs no attempt.
      const input = parseInput(changePasswordInputSchema, req.body);
      const slot = takeSlot(`chpw|${user.bzUserId}`, CHANGE_PASSWORD_ATTEMPTS_PER_USER);
      if (!slot.allowed) throw tooManyRequests(res, slot.retryAfterSec, 'password change attempts', { scope: 'change-password' });

      await changeOwnPassword(env.BUGZILLA_URL, user.bzToken, input.currentPassword, input.newPassword, user.realName);

      let signedOut = 0;
      for (const other of sessionsFor(user.bzUserId)) {
        if (other.sessionId === req.sessionID) continue;
        destroySession(req, other.sessionId);
        signedOut++;
      }
      console.info(`[auth] password changed for user ${user.bzUserId}; ${signedOut} other session(s) signed out`);
      res.json({ changed: true, otherSessionsSignedOut: signedOut });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth(env), (req, res) => {
    const u = req.sessionUser!;
    res.json({ user: { id: u.bzUserId, email: u.email, realName: u.realName, permissions: u.permissions } });
  });

  return router;
}

