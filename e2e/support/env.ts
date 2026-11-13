import { randomUUID } from 'node:crypto';

/** Where the two servers live, and which account the suite signs in as. */
export const UI_URL = process.env.E2E_UI_URL ?? 'http://localhost:5175';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** A dedicated Bugzilla account, NOT a real person's. */
export const TEST_USER = {
  login: process.env.E2E_LOGIN ?? 'qa-e2e@kpost.local',
  password: process.env.E2E_PASSWORD ?? 'E2e-Test-Passw0rd!',
};

/** A sacrificial account for the one spec that must trip BUGZILLA's own account lockout (as opposed to. */
export const LOCKOUT_PROBE = {
  login: process.env.E2E_LOCKOUT_LOGIN ?? 'qa-e2e-lockout@kpost.local',
};

/** Products the fixtures know about, by the axis they exercise. */
export const PRODUCTS = {
  ui: process.env.E2E_UI_PRODUCT ?? 'KPost UI',
  api: process.env.E2E_API_PRODUCT ?? 'KPost API',
};

/** A login address no other test has used, or will. */
export function uniqueLogin(prefix = 'rl'): string {
  return `${prefix}-${randomUUID()}@e2e.invalid`;
}

/** Matches the backend's own constants (backend/src/services/loginRateLimit.service.ts). */
export const RATE_LIMIT = {
  maxFailures: 10,
  lockoutSeconds: 300,
};

/** Matches MAX_SESSIONS_PER_USER in backend/src/services/sessionRegistry.service.ts. */
export const MAX_SESSIONS = 3;
