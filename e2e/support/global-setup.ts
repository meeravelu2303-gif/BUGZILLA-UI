import { request } from '@playwright/test';
import { API_URL, TEST_USER, UI_URL } from './env';

/**
 * Fails the whole run, loudly and early, when a precondition is missing.
 *
 * Every check here is one that would otherwise surface as a confusing assertion
 * failure deep in a spec: a dead BFF reads as "login returned nothing", a test
 * account outside the product groups reads as "the table is empty", and a
 * rate-limited account reads as "valid credentials were rejected". Naming the
 * real cause once, up front, is worth more than the twenty minutes each of
 * those costs to diagnose from a screenshot.
 */
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL: API_URL });
  const problems: string[] = [];

  // --- the BFF is up -------------------------------------------------------
  try {
    const health = await api.get('/api/health', { failOnStatusCode: false });
    if (!health.ok()) problems.push(`BFF /api/health returned ${health.status()} (expected 200)`);
  } catch {
    problems.push(`BFF is unreachable at ${API_URL}. Start it with: cd backend && npm run dev`);
  }

  // --- the Vite dev server is up ------------------------------------------
  try {
    const ui = await request.newContext();
    const res = await ui.get(UI_URL, { failOnStatusCode: false });
    if (!res.ok()) problems.push(`UI at ${UI_URL} returned ${res.status()} (expected 200)`);
    await ui.dispose();
  } catch {
    problems.push(`UI is unreachable at ${UI_URL}. Start it with: cd frontend && npm run dev`);
  }

  // --- the test account works, and is not mid-cooldown ---------------------
  if (problems.length === 0) {
    const res = await api.post('/api/auth/login', {
      data: { login: TEST_USER.login, password: TEST_USER.password },
      failOnStatusCode: false,
    });

    if (res.status() === 429) {
      /*
       * A previous run left the account locked. Say so explicitly with the
       * remaining time - the alternative is every auth spec failing on
       * "expected 200, got 429" and looking like a product bug.
       */
      const body = await res.json().catch(() => null);
      const wait = body?.details?.retryAfterSeconds ?? '≤300';
      problems.push(
        `Test account ${TEST_USER.login} is rate-limited; ${wait}s remain. ` +
          `Wait it out, or restart the BFF to clear the in-memory limiter.`
      );
    } else if (!res.ok()) {
      problems.push(
        `Test account ${TEST_USER.login} could not sign in (HTTP ${res.status()}). ` +
          `Check E2E_LOGIN / E2E_PASSWORD, and that the account exists in Bugzilla.`
      );
    } else {
      // Visible bugs are a precondition for every UI spec: the products are
      // MANDATORY-gated, so an account outside their groups sees an empty list
      // and the table assertions would pass against no rows at all.
      const counts = await api.get('/api/bugs/count', { failOnStatusCode: false });
      const total = (await counts.json().catch(() => null))?.counts?.total ?? 0;
      if (total === 0) {
        problems.push(
          `Test account ${TEST_USER.login} can see 0 bugs. Add it to the product groups ` +
            `(KPost API / KPost UI) or the UI specs will assert against an empty table.`
        );
      }
      await api.post('/api/auth/logout', { failOnStatusCode: false });
    }
  }

  await api.dispose();

  if (problems.length > 0) {
    throw new Error(
      ['E2E preconditions not met:', ...problems.map((p) => `  • ${p}`)].join('\n')
    );
  }
}
