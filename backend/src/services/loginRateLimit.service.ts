import type { Request } from 'express';

/** Brute-force protection for the login endpoint, keyed on (client IP + account). */
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

/** How long an unfinished run of failures is remembered. */
export const LOGIN_ATTEMPT_TTL_MS = 5 * 60 * 1000;

/** Kept as an alias because the 429 payload reports it as windowSeconds. */
export const LOGIN_WINDOW_MS = LOGIN_LOCKOUT_MS;

/** Failures allowed per (IP, account) before the cooldown starts. */
export const LOGIN_MAX_FAILURES = 10;

interface Bucket {
  failures: number;
  attemptsExpireAt: number;
  lockedUntil: number | null;
}

const buckets = new Map<string, Bucket>();

/** The composite key: client IP plus the account being attempted. */
export function loginRateLimitKey(req: Request): string {
  const ip = req.ip ?? 'unknown';
  const body = req.body as { login?: unknown } | undefined;
  const login = typeof body?.login === 'string' ? body.login.trim().toLowerCase() : '';
  return `${ip}|${login || '<none>'}`;
}

export interface RateLimitState {
  limited: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

/** Reports whether a key is in cooldown WITHOUT recording anything. */
export function checkLoginRateLimit(key: string, now = Date.now()): RateLimitState {
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket) return { limited: false, retryAfterSeconds: 0, remaining: LOGIN_MAX_FAILURES };

  if (bucket.lockedUntil !== null) {
    if (now < bucket.lockedUntil) {
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
        remaining: 0,
      };
    }

    buckets.delete(key);
    return { limited: false, retryAfterSeconds: 0, remaining: LOGIN_MAX_FAILURES };
  }

  if (now >= bucket.attemptsExpireAt) {
    buckets.delete(key);
    return { limited: false, retryAfterSeconds: 0, remaining: LOGIN_MAX_FAILURES };
  }

  return {
    limited: false,
    retryAfterSeconds: 0,
    remaining: Math.max(0, LOGIN_MAX_FAILURES - bucket.failures),
  };
}

/** Records one failed credential check. */
export function recordLoginFailure(key: string, now = Date.now()): RateLimitState {
  const bucket = buckets.get(key);

  if (bucket && bucket.lockedUntil !== null && now < bucket.lockedUntil) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
      remaining: 0,
    };
  }

  if (!bucket || bucket.lockedUntil !== null || now >= bucket.attemptsExpireAt) {
    const fresh: Bucket = {
      failures: 1,
      attemptsExpireAt: now + LOGIN_ATTEMPT_TTL_MS,
      lockedUntil: null,
    };
    buckets.set(key, fresh);
    return { limited: false, retryAfterSeconds: 0, remaining: LOGIN_MAX_FAILURES - 1 };
  }

  bucket.failures += 1;
  bucket.attemptsExpireAt = now + LOGIN_ATTEMPT_TTL_MS;

  if (bucket.failures >= LOGIN_MAX_FAILURES) {
    bucket.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return { limited: true, retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000), remaining: 0 };
  }

  return {
    limited: false,
    retryAfterSeconds: 0,
    remaining: LOGIN_MAX_FAILURES - bucket.failures,
  };
}

/** Clears a key's failures. */
export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    const done = bucket.lockedUntil !== null ? now >= bucket.lockedUntil : now >= bucket.attemptsExpireAt;
    if (done) buckets.delete(key);
  }
}

/** Test seam. */
export function resetLoginRateLimit(): void {
  buckets.clear();
}
