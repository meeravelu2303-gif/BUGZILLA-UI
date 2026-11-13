import { randomUUID } from 'node:crypto';
import { accessSnapshot } from '../services/access.service';
import type { RequestHandler } from 'express';
import { env, SESSION_COOKIE_NAME } from '../config/app.config';
import { loginToBugzilla, logoutFromBugzilla } from '../clients/bugzillaAuth.client';
import { BugzillaClient } from '../clients/bugzilla.client';
import { AppError } from '../helpers/errors.helper';
import { tooManyRequests } from '../middleware/rateLimit.middleware';
import { clearLoginFailures, loginRateLimitKey, recordLoginFailure } from '../services/loginRateLimit.service';
import { changeOwnPassword } from '../services/changePassword.service';
import { completePasswordReset, requestPasswordReset, validateResetToken } from '../services/passwordReset.service';
import {
  CHANGE_PASSWORD_ATTEMPTS_PER_USER,
  RESET_DAILY_WINDOW_MS,
  RESET_REQUESTS_PER_ACCOUNT_PER_DAY,
  checkSlot,
  recordHit,
  takeSlot,
} from '../services/passwordResetRateLimit.service';
import {
  MAX_SESSIONS_PER_USER,
  forgetSession,
  registerSession,
  sessionsFor,
} from '../services/sessionRegistry.service';
import { parseInput } from '../helpers/validate.helper';
import {
  changePasswordInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  resetPasswordInputSchema,
  resetTokenSchema,
} from '../dto/auth.dto';
import { derivePermissions, userDetailSchema } from '../dto/common.dto';
import type { SessionUser } from '../types/express';
import { asyncHandler, sendNoContent, sendSuccess } from '../helpers/response.helper';
import {
  DEVICE_COOKIE_MAX_AGE_MS,
  DEVICE_COOKIE_NAME,
  destroySession,
  maskLogin,
  readDeviceId,
} from '../services/auth.service';

export const forgotPassword = asyncHandler(async (req, res) => {
  const { login } = parseInput(forgotPasswordInputSchema, req.body);

  const dailyKey = `day|${login.toLowerCase()}`;
  const daily = checkSlot(dailyKey, RESET_REQUESTS_PER_ACCOUNT_PER_DAY, RESET_DAILY_WINDOW_MS);
  if (!daily.allowed) {
    throw tooManyRequests(
      res,
      daily.retryAfterSeconds,
      `password reset emails for this address (limit ${RESET_REQUESTS_PER_ACCOUNT_PER_DAY} per 24 hours)`,
      {
        windowMs: RESET_DAILY_WINDOW_MS,
        scope: 'password-reset-daily',
        limit: RESET_REQUESTS_PER_ACCOUNT_PER_DAY,
      },
    );
  }

  const outcome = await requestPasswordReset(env.BUGZILLA_URL, login);
  console.info(`[auth] password reset requested for ${maskLogin(login)}: ${outcome}`);
  if (outcome !== 'too_soon') recordHit(dailyKey, RESET_DAILY_WINDOW_MS);
  sendSuccess(
    res,
    {
      accepted: true,
      cooldownMinutes: 10,
      linkValidDays: 3,
      dailyLimit: RESET_REQUESTS_PER_ACCOUNT_PER_DAY,
    },
    202,
  );
});

export const checkResetToken = asyncHandler(async (req, res) => {
  const token = parseInput(resetTokenSchema, (req.body as { token?: unknown } | undefined)?.token);
  const valid = await validateResetToken(env.BUGZILLA_URL, token);
  res.set('Cache-Control', 'no-store').json({ valid });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = parseInput(resetPasswordInputSchema, req.body);
  await completePasswordReset(env.BUGZILLA_URL, token, password);
  console.info('[auth] password reset completed');
  sendNoContent(res);
});

export const loginUser: RequestHandler = async (req, res, next) => {
  const rateKey = loginRateLimitKey(req);
  try {
    const input = parseInput(loginInputSchema, req.body);

    let id: number;
    let token: string;
    try {
      ({ id, token } = await loginToBugzilla(env.BUGZILLA_URL, input.login, input.password));
    } catch (err) {
      if (err instanceof AppError && (err.status === 401 || err.status === 400)) {
        recordLoginFailure(rateKey);
      }
      throw err;
    }

    clearLoginFailures(rateKey);

    const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'token', token });
    void accessSnapshot(client, id).catch(() => undefined);
    const userResponse = await client.get<{ users: unknown[] }>(`/user/${id}`);
    const user = userDetailSchema.parse(userResponse.users[0]);
    const permissions = derivePermissions(user.groups);

    const sessionUser: SessionUser = {
      bzUserId: id,
      bzToken: token,
      email: user.email,
      realName: user.real_name || user.email,
      permissions,
    };

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    const deviceId = readDeviceId(req) ?? randomUUID();
    const now = Date.now();

    req.session.bzUserId = sessionUser.bzUserId;
    req.session.bzToken = sessionUser.bzToken;
    req.session.email = sessionUser.email;
    req.session.realName = sessionUser.realName;
    req.session.permissions = sessionUser.permissions;
    req.session.deviceId = deviceId;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

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

    for (const stale of evicted) destroySession(req, stale.sessionId);

    res.cookie(DEVICE_COOKIE_NAME, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.COOKIE_SECURE === 'true' || (env.COOKIE_SECURE === 'auto' && req.secure),
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
    });

    sendSuccess(res, {
      user: { id, email: sessionUser.email, realName: sessionUser.realName, permissions },
      session: {
        deviceId,
        activeSessions: sessionsFor(id).length,
        maxSessions: MAX_SESSIONS_PER_USER,
        evictedSessions: evicted.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const logoutUser: RequestHandler = async (req, res, next) => {
  forgetSession(req.sessionID);
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
    sendNoContent(res);
  });
};

export const changePassword = asyncHandler(async (req, res) => {
  const user = req.sessionUser!;
  const input = parseInput(changePasswordInputSchema, req.body);
  const slot = takeSlot(`chpw|${user.bzUserId}`, CHANGE_PASSWORD_ATTEMPTS_PER_USER);
  if (!slot.allowed)
    throw tooManyRequests(res, slot.retryAfterSeconds, 'password change attempts', { scope: 'change-password' });

  await changeOwnPassword(env.BUGZILLA_URL, user.bzToken, input.currentPassword, input.newPassword, user.realName);

  let signedOut = 0;
  for (const other of sessionsFor(user.bzUserId)) {
    if (other.sessionId === req.sessionID) continue;
    destroySession(req, other.sessionId);
    signedOut++;
  }
  console.info(`[auth] password changed for user ${user.bzUserId}; ${signedOut} other session(s) signed out`);
  sendSuccess(res, { changed: true, otherSessionsSignedOut: signedOut });
});

export const getMe: RequestHandler = (req, res) => {
  const sessionUser = req.sessionUser!;
  sendSuccess(res, {
    user: {
      id: sessionUser.bzUserId,
      email: sessionUser.email,
      realName: sessionUser.realName,
      permissions: sessionUser.permissions,
    },
  });
};
