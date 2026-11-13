import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../helpers/errors.helper';
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  checkLoginRateLimit,
  loginRateLimitKey,
} from '../services/loginRateLimit.service';
import {
  RESET_ATTEMPTS_PER_IP,
  RESET_REQUESTS_PER_ACCOUNT,
  RESET_REQUESTS_PER_IP,
  RESET_WINDOW_MS,
  clientIp,
  requestedLogin,
  takeSlot,
} from '../services/passwordResetRateLimit.service';

/** Refuses a login only while its (IP + account) key is already in cooldown. */
export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const state = checkLoginRateLimit(loginRateLimitKey(req));
  if (!state.limited) {
    next();
    return;
  }

  const minutes = Math.max(1, Math.ceil(state.retryAfterSeconds / 60));
  res.setHeader('Retry-After', String(state.retryAfterSeconds));
  next(
    new AppError(
      429,
      'RATE_LIMITED',
      `Too many failed sign-in attempts for this account from this device. Try again in ${minutes} minute(s).`,
      undefined,
      {
        retryAfterSeconds: state.retryAfterSeconds,
        retryAt: new Date(Date.now() + state.retryAfterSeconds * 1000).toISOString(),
        limit: LOGIN_MAX_FAILURES,
        remaining: 0,
        windowSeconds: Math.round(LOGIN_WINDOW_MS / 1000),
        scope: 'ip+account',
      },
    ),
  );
}

/** 429 in the same shape the login limiter uses, so the client's one cooldown branch covers both. */
export function tooManyRequests(
  res: Response,
  retryAfterSeconds: number,
  what: string,
  extra: { windowMs?: number; scope?: string; limit?: number } = {},
): AppError {
  const windowMs = extra.windowMs ?? RESET_WINDOW_MS;
  const retryAt = new Date(Date.now() + retryAfterSeconds * 1000);
  const wait =
    retryAfterSeconds >= 3600
      ? `after ${retryAt.toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}`
      : `in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s)`;
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return new AppError(429, 'RATE_LIMITED', `Too many ${what}. Try again ${wait}.`, undefined, {
    retryAfterSeconds: retryAfterSeconds,
    retryAt: retryAt.toISOString(),
    windowSeconds: Math.round(windowMs / 1000),
    scope: extra.scope ?? 'password-reset',
    ...(extra.limit !== undefined ? { limit: extra.limit } : {}),
  });
}

/** Caps reset emails per (IP, address) and per IP. */
export function forgotPasswordRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const perIp = takeSlot(`ip|${ip}`, RESET_REQUESTS_PER_IP);
  if (!perIp.allowed) return next(tooManyRequests(res, perIp.retryAfterSeconds, 'password reset requests'));
  const perAccount = takeSlot(`acct|${ip}|${requestedLogin(req)}`, RESET_REQUESTS_PER_ACCOUNT);
  if (!perAccount.allowed)
    return next(tooManyRequests(res, perAccount.retryAfterSeconds, 'password reset requests for this address'));
  next();
}

/** Caps token checks and password submissions per IP, so a link cannot be guessed at. */
export function resetAttemptRateLimit(req: Request, res: Response, next: NextFunction): void {
  const slot = takeSlot(`attempt|${clientIp(req)}`, RESET_ATTEMPTS_PER_IP);
  if (!slot.allowed) return next(tooManyRequests(res, slot.retryAfterSeconds, 'password reset attempts'));
  next();
}
