import type { Request } from 'express';

/**
 * Sliding-window limits for the password-reset endpoints.
 *
 * Different shape from lib/loginRateLimit.ts on purpose. Login counts
 * *failures* and clears on success, because the cost it guards against is
 * credential guessing. Here every request has a cost whether or not it
 * "succeeds": each forgot-password call makes Bugzilla send an email to
 * whoever was named, so the thing to cap is requests, full stop.
 *
 * Two keys on the request endpoint: (IP, address) stops one caller flooding
 * one inbox, and IP alone stops the same caller walking through a list of
 * addresses. Bugzilla adds its own floor underneath - one token per account
 * per ACCOUNT_CHANGE_INTERVAL (10 min) - which this does not rely on, since
 * Bugzilla reports that case with a page that would reveal the account exists.
 *
 * In-process, like the login limiter, and with the same caveats (per process,
 * reset on restart, `req.ip` only as good as TRUST_PROXY).
 */

export const RESET_WINDOW_MS = 15 * 60 * 1000;
/** Reset emails one caller may trigger for one address per window. */
export const RESET_REQUESTS_PER_ACCOUNT = 3;
/** Reset emails one caller may trigger in total per window. */
export const RESET_REQUESTS_PER_IP = 10;
/** Token checks + password submissions one caller may make per window. */
export const RESET_ATTEMPTS_PER_IP = 20;

/**
 * Change-password attempts per signed-in account per window. A stolen session
 * cookie must not become a way to guess the account's current password, so
 * every attempt counts, right or wrong.
 */
export const CHANGE_PASSWORD_ATTEMPTS_PER_USER = 5;

/**
 * The policy limit, keyed on the ADDRESS alone: three reset emails per account
 * per rolling 24 hours, whoever asks and from wherever. The per-IP limits above
 * are abuse brakes; this one is the rule people are told about ("3 per day").
 * Only requests that actually made Bugzilla issue a token count - an attempt
 * inside Bugzilla's 10-minute interval sends nothing and costs nothing.
 */
export const RESET_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RESET_REQUESTS_PER_ACCOUNT_PER_DAY = 3;

export interface SlotResult {
  allowed: boolean;
  /** Seconds until a slot frees up. Only meaningful when `allowed` is false. */
  retryAfterSec: number;
}

const hits = new Map<string, number[]>();
let calls = 0;

function recentHits(key: string, windowMs: number, now: number): number[] {
  const since = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > since);
  hits.set(key, recent);
  return recent;
}

/** Reports whether `key` has a free slot in the window, without taking it. */
export function checkSlot(key: string, limit: number, windowMs = RESET_WINDOW_MS, now = Date.now()): SlotResult {
  const recent = recentHits(key, windowMs, now);
  if (recent.length >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Counts one hit against `key`. */
export function recordHit(key: string, windowMs = RESET_WINDOW_MS, now = Date.now()): void {
  if (++calls % 500 === 0) sweep(now);
  recentHits(key, windowMs, now).push(now);
}

/** Records one hit against `key` if under `limit` in the window; otherwise says how long to wait. */
export function takeSlot(key: string, limit: number, windowMs = RESET_WINDOW_MS, now = Date.now()): SlotResult {
  const result = checkSlot(key, limit, windowMs, now);
  if (result.allowed) recordHit(key, windowMs, now);
  return result;
}

export function clientIp(req: Request): string {
  return req.ip ?? 'unknown';
}

/** Lower-cased so one inbox cannot be hit three times per capitalisation. */
export function requestedLogin(req: Request): string {
  const body = req.body as { login?: unknown } | undefined;
  return typeof body?.login === 'string' ? body.login.trim().toLowerCase() : '<none>';
}

/** Drops keys with nothing left inside the longest window, so the map cannot grow for the life of the process. */
function sweep(now: number): void {
  const since = now - RESET_DAILY_WINDOW_MS;
  for (const [key, times] of hits) {
    const recent = times.filter((t) => t > since);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}

/** Test seam. */
export function resetPasswordResetRateLimit(): void {
  hits.clear();
}
