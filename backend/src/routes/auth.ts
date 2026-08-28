import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME, type Env } from '../config/env';
import { loginToBugzilla } from '../lib/bugzillaAuth';
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
import {
  MAX_SESSIONS_PER_USER,
  forgetSession,
  registerSession,
  sessionsFor,
} from '../lib/sessionRegistry';
import { parseInput } from '../lib/validate';
import { loginInputSchema } from '../schemas/auth';
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

export function authRouter(env: Env): Router {
  const router = Router();

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
        secure: env.COOKIE_SECURE,
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

  router.post('/logout', (req, res, next) => {
    // Free this device's slot immediately. Signing out on one device must not
    // disturb the same account's other sessions - they keep their own records.
    forgetSession(req.sessionID);
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
        path: '/',
      });
      res.status(204).end();
    });
  });

  router.get('/me', requireAuth(env), (req, res) => {
    const u = req.sessionUser!;
    res.json({ user: { id: u.bzUserId, email: u.email, realName: u.realName, permissions: u.permissions } });
  });

  return router;
}
