import type { Request } from 'express';

/**
 * Brute-force protection for the login endpoint, keyed on (client IP + account).
 *
 * Login proxies straight through to Bugzilla's own auth, so without a limiter a
 * caller can grind credentials against Bugzilla with no friction. Kept
 * in-process deliberately: this BFF has no database drivers and runs
 * single-instance (see index.ts). The trade-offs that follow from that are
 * stated at the bottom of this file rather than left to be discovered.
 *
 * ---------------------------------------------------------------------------
 * What the previous version got wrong, because both faults are easy to
 * reintroduce:
 *
 *  1. It keyed on `req.ip` ALONE. Every person behind one office NAT, VPN or
 *     reverse proxy shared a single 10-attempt budget, so one colleague
 *     fat-fingering a password locked out the whole floor.
 *
 *  2. It counted EVERY request, not every failure - and incremented before the
 *     password was checked, then never cleared on success. Ten *successful*
 *     logins inside one window was enough to lock an account out. That is the
 *     "Too many login attempts" seen while simply signing in on a second
 *     device, and it is why the counter below moves only on a real failure.
 *
 * The shape that fixes both: a failure counter per (IP, account), cleared the
 * instant a password verifies. Someone logging in correctly on five devices
 * touches nothing; someone guessing one account's password from one host still
 * runs out after ten tries.
 */

/**
 * How long a key stays locked once the failure threshold trips.
 *
 * Five minutes, not fifteen: this limiter exists to make credential-grinding
 * expensive, and ten guesses per five minutes does that just as well as ten per
 * fifteen. What the longer window really cost was the person who mistyped their
 * password a few times - they sat out a quarter of an hour for a typo. A
 * cooldown short enough to wait out is one people report instead of working
 * around.
 */
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

/**
 * How long an unfinished run of failures is remembered.
 *
 * Separate from the lockout, and needed for two reasons. Without it a partial
 * count lives forever: nine typos spread across a month would lock someone out
 * on a tenth attempt they had no way to connect to the others. And nothing
 * would ever evict a key that failed a few times and then went quiet, so the
 * map would grow for the life of the process.
 *
 * Note this expiry is idle-based - each new failure restarts it - whereas the
 * lockout below is fixed and never extends. That asymmetry is deliberate:
 * "still actively guessing" should keep the count alive, but nothing an
 * attacker does should be able to lengthen a lock.
 */
export const LOGIN_ATTEMPT_TTL_MS = 5 * 60 * 1000;

/**
 * Kept as an alias because the 429 payload reports it as `windowSeconds`, and
 * that field is a published part of the error contract the frontend formats.
 */
export const LOGIN_WINDOW_MS = LOGIN_LOCKOUT_MS;

/** Failures allowed per (IP, account) before the cooldown starts. */
export const LOGIN_MAX_FAILURES = 10;

interface Bucket {
  failures: number;
  /** Epoch ms after which an un-locked failure count is forgotten. */
  attemptsExpireAt: number;
  /**
   * Epoch ms the lock ends, or null when merely counting.
   *
   * Set ONCE, at the moment the threshold is reached, and never written again
   * while it is in the future - that is what stops a caller hammering the
   * endpoint from pushing their own unlock time away forever.
   */
  lockedUntil: number | null;
}

const buckets = new Map<string, Bucket>();

/**
 * The composite key: client IP plus the account being attempted.
 *
 * Both halves are needed and neither alone is enough. IP alone punishes
 * everyone sharing an egress address. Account alone lets anyone lock any
 * colleague out of their account from anywhere, just by guessing at it - a
 * denial-of-service handed to unauthenticated callers.
 *
 * The account is lower-cased so `Meera@x.com` and `meera@x.com` cannot be used
 * as two separate budgets against one login. A request with no usable account
 * in the body still gets a key (`ip|<none>`), so a flood of malformed requests
 * is limited rather than waved through.
 */
export function loginRateLimitKey(req: Request): string {
  const ip = req.ip ?? 'unknown';
  const body = req.body as { login?: unknown } | undefined;
  const login = typeof body?.login === 'string' ? body.login.trim().toLowerCase() : '';
  return `${ip}|${login || '<none>'}`;
}

export interface RateLimitState {
  limited: boolean;
  /** Seconds until the window resets. Only meaningful when `limited`. */
  retryAfterSec: number;
  /** Failures still allowed in this window before the cooldown starts. */
  remaining: number;
}

/**
 * Reports whether a key is in cooldown WITHOUT recording anything.
 *
 * Read-only on purpose: an attempt is only counted once its outcome is known,
 * by `recordFailure`. Checking and counting in one step is exactly how the old
 * limiter came to punish successful logins.
 */
export function checkLoginRateLimit(key: string, now = Date.now()): RateLimitState {
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket) return { limited: false, retryAfterSec: 0, remaining: LOGIN_MAX_FAILURES };

  if (bucket.lockedUntil !== null) {
    if (now < bucket.lockedUntil) {
      /*
       * Locked. Reporting the remaining time is the ONLY thing that happens
       * here - the record is not touched. Reading state must never move it, or
       * a client polling the endpoint would keep resetting its own unlock.
       */
      return {
        limited: true,
        retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
        remaining: 0,
      };
    }

    // Lock elapsed: forget the key entirely, so the next attempt starts from a
    // full budget rather than one failure away from locking again.
    buckets.delete(key);
    return { limited: false, retryAfterSec: 0, remaining: LOGIN_MAX_FAILURES };
  }

  if (now >= bucket.attemptsExpireAt) {
    buckets.delete(key);
    return { limited: false, retryAfterSec: 0, remaining: LOGIN_MAX_FAILURES };
  }

  return {
    limited: false,
    retryAfterSec: 0,
    remaining: Math.max(0, LOGIN_MAX_FAILURES - bucket.failures),
  };
}

/**
 * Records one failed credential check, locking the key for a fixed
 * LOGIN_LOCKOUT_MS once the threshold is reached.
 *
 * The lock is stamped at the moment of the tenth failure, not the first. Timing
 * it from the first failure - which this did previously - meant ten failures
 * spread over four minutes bought a lock of only sixty seconds, and a patient
 * caller could stay permanently just under the threshold. Stamping it here
 * makes the cooldown the same five minutes no matter how the failures arrived.
 */
export function recordLoginFailure(key: string, now = Date.now()): RateLimitState {
  const bucket = buckets.get(key);

  /*
   * Already locked: return untouched. Nothing an attempt does during a cooldown
   * may lengthen it - the lock ends when it was always going to end.
   *
   * Unreachable through the HTTP path, where the middleware refuses a locked
   * key before any credential is checked. Kept because this is the invariant
   * the whole change is about, and it should hold for any future caller too.
   */
  if (bucket && bucket.lockedUntil !== null && now < bucket.lockedUntil) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
      remaining: 0,
    };
  }

  // No record, an expired lock, or a stale count: start a fresh run.
  if (!bucket || bucket.lockedUntil !== null || now >= bucket.attemptsExpireAt) {
    const fresh: Bucket = {
      failures: 1,
      attemptsExpireAt: now + LOGIN_ATTEMPT_TTL_MS,
      lockedUntil: null,
    };
    buckets.set(key, fresh);
    return { limited: false, retryAfterSec: 0, remaining: LOGIN_MAX_FAILURES - 1 };
  }

  bucket.failures += 1;
  // Each failure keeps the run alive; only the lock below is immovable.
  bucket.attemptsExpireAt = now + LOGIN_ATTEMPT_TTL_MS;

  if (bucket.failures >= LOGIN_MAX_FAILURES) {
    bucket.lockedUntil = now + LOGIN_LOCKOUT_MS;
    return { limited: true, retryAfterSec: Math.ceil(LOGIN_LOCKOUT_MS / 1000), remaining: 0 };
  }

  return {
    limited: false,
    retryAfterSec: 0,
    remaining: LOGIN_MAX_FAILURES - bucket.failures,
  };
}

/**
 * Clears a key's failures. Called the moment a password verifies, so a person
 * who mistypes twice and then gets it right starts from a clean slate instead
 * of carrying those two failures for the rest of the window.
 */
export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}

/**
 * Drops finished buckets so the map cannot grow without bound across many keys.
 *
 * A locked key is kept until its lock ends even if its attempt TTL passed long
 * ago - deleting it early would release the cooldown, which is exactly what
 * this is meant to prevent.
 */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    const done =
      bucket.lockedUntil !== null ? now >= bucket.lockedUntil : now >= bucket.attemptsExpireAt;
    if (done) buckets.delete(key);
  }
}

/** Test seam. Not used by the running server. */
export function resetLoginRateLimit(): void {
  buckets.clear();
}

/*
 * Known limits of an in-process limiter, so nobody has to rediscover them:
 *
 *  - State is per process. Run this BFF behind more than one instance and each
 *    keeps its own counts, multiplying the effective budget by the instance
 *    count. Moving to a shared store is the fix, and is the point at which the
 *    Redis-backed limiter this file deliberately is not becomes worth adding.
 *  - State is lost on restart, which releases every cooldown early. Acceptable
 *    here because sessions live in MemoryStore and do not survive a restart
 *    either.
 *  - `req.ip` is only as trustworthy as Express's `trust proxy` setting. Behind
 *    a reverse proxy without it configured, every request appears to come from
 *    the proxy and the IP half of the key stops discriminating - the account
 *    half still does, which is part of why the key is composite.
 */
