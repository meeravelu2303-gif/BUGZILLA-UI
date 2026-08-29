import { randomUUID } from 'node:crypto';

/**
 * Where the two servers live, and which account the suite signs in as.
 *
 * The UI is the Vite dev server; the API is the BFF. Both are addressed
 * directly rather than going through Vite's `/api` proxy for API-level specs,
 * so a proxy misconfiguration shows up as a proxy failure rather than as a
 * confusing auth failure three layers down.
 */
export const UI_URL = process.env.E2E_UI_URL ?? 'http://localhost:5175';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/**
 * A dedicated Bugzilla account, NOT a real person's.
 *
 * Two of these suites are destructive to whoever owns the credentials: the LRU
 * specs deliberately evict sessions, and the rate-limit specs deliberately burn
 * an attempt budget. Pointed at a human's account they would sign that person
 * out of their own browser mid-workday and lock them out for five minutes.
 *
 * The account must belong to every product group the UI specs read, because the
 * products are MANDATORY-gated - an account outside them sees an empty list and
 * every UI assertion passes vacuously against no rows at all.
 */
export const TEST_USER = {
  login: process.env.E2E_LOGIN ?? 'qa-e2e@kpost.local',
  password: process.env.E2E_PASSWORD ?? 'E2e-Test-Passw0rd!',
};

/**
 * A sacrificial account for the one spec that must trip BUGZILLA's own account
 * lockout (as opposed to the BFF's rate limiter).
 *
 * Separate from TEST_USER because that lockout is server-side and long-lived -
 * Bugzilla's `loginfailure_interval`, 30 minutes by default - so running it
 * against the shared account would leave every later spec unable to sign in.
 * This one holds no group memberships and is used for nothing else, so leaving
 * it locked costs nothing.
 *
 * Deliberately NOT a random address: Bugzilla only locks accounts that exist,
 * so this specific probe has to be a real account.
 */
export const LOCKOUT_PROBE = {
  login: process.env.E2E_LOCKOUT_LOGIN ?? 'qa-e2e-lockout@kpost.local',
};

/** Products the fixtures know about, by the axis they exercise. */
export const PRODUCTS = {
  ui: process.env.E2E_UI_PRODUCT ?? 'KPost UI',
  api: process.env.E2E_API_PRODUCT ?? 'KPost API',
};

/**
 * A login address no other test has used, or will.
 *
 * This is how the suite resets rate-limiter state, and it is worth explaining
 * because the obvious alternatives are both worse.
 *
 * The limiter keys on `${ip}|${email}`. Every worker shares the client IP, so
 * the email is the only half a test can control - and a fresh random address
 * yields a bucket guaranteed to be untouched, with a full attempt budget, that
 * no other spec can contend with. Isolation by construction rather than by
 * cleanup.
 *
 * Rejected: a `POST /api/test/reset-rate-limit` endpoint. Resetting in-process
 * memory from outside the process needs a route, and a route that clears
 * brute-force protection is a route an attacker wants - one misread env guard
 * in one deployment and the protection is off with nothing failing to say so.
 * A test suite should not require the product to ship a switch that disables
 * its own security control.
 *
 * Rejected: restarting the BFF between specs. It works - the state is in memory
 * - but it also wipes every session in MemoryStore, which is precisely what the
 * LRU specs are asserting on, and signs out any human using the app.
 *
 * The addresses intentionally do not exist in Bugzilla. Every attempt against
 * them fails at credential check, which is what the failure-path specs want,
 * and none of them can lock out a real account.
 */
export function uniqueLogin(prefix = 'rl'): string {
  return `${prefix}-${randomUUID()}@e2e.invalid`;
}

/** Matches the backend's own constants (backend/src/lib/loginRateLimit.ts). */
export const RATE_LIMIT = {
  maxFailures: 10,
  lockoutSeconds: 300,
};

/** Matches MAX_SESSIONS_PER_USER in backend/src/lib/sessionRegistry.ts. */
export const MAX_SESSIONS = 3;
