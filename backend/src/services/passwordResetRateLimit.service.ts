import type { Request } from 'express';

/** Sliding-window limits for the password-reset endpoints. */
export const RESET_WINDOW_MS = 15 * 60 * 1000;
/** Reset emails one caller may trigger for one address per window. */
export const RESET_REQUESTS_PER_ACCOUNT = 3;
/** Reset emails one caller may trigger in total per window. */
export const RESET_REQUESTS_PER_IP = 10;
/** Token checks + password submissions one caller may make per window. */
export const RESET_ATTEMPTS_PER_IP = 20;

/** Change-password attempts per signed-in account per window. */
export const CHANGE_PASSWORD_ATTEMPTS_PER_USER = 5;

/** The policy limit, keyed on the ADDRESS alone: three reset emails per account per rolling 24 hours. */
export const RESET_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RESET_REQUESTS_PER_ACCOUNT_PER_DAY = 3;

export interface SlotResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const hits = new Map<string, number[]>();
let calls = 0;

function recentHits(key: string, windowMs: number, now: number): number[] {
  const since = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((value) => value > since);
  hits.set(key, recent);
  return recent;
}

/** Reports whether key has a free slot in the window, without taking it. */
export function checkSlot(key: string, limit: number, windowMs = RESET_WINDOW_MS, now = Date.now()): SlotResult {
  const recent = recentHits(key, windowMs, now);
  if (recent.length >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Counts one hit against key. */
export function recordHit(key: string, windowMs = RESET_WINDOW_MS, now = Date.now()): void {
  if (++calls % 500 === 0) sweep(now);
  recentHits(key, windowMs, now).push(now);
}

/** Records one hit against key if under limit in the window; otherwise says how long to wait. */
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

function sweep(now: number): void {
  const since = now - RESET_DAILY_WINDOW_MS;
  for (const [key, times] of hits) {
    const recent = times.filter((time) => time > since);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}

/** Test seam. */
export function resetPasswordResetRateLimit(): void {
  hits.clear();
}
