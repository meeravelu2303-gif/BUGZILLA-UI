import { request } from '@playwright/test';
import { API_URL, TEST_USER, UI_URL } from './env';

/** Fails the whole run, loudly and early, when a precondition is missing. */
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL: API_URL });
  const problems: string[] = [];

  try {
    const health = await api.get('/api/health', { failOnStatusCode: false });
    if (!health.ok()) problems.push(`BFF /api/health returned ${health.status()} (expected 200)`);
  } catch {
    problems.push(`BFF is unreachable at ${API_URL}. Start it with: cd backend && npm run dev`);
  }

  try {
    const ui = await request.newContext();
    const res = await ui.get(UI_URL, { failOnStatusCode: false });
    if (!res.ok()) problems.push(`UI at ${UI_URL} returned ${res.status()} (expected 200)`);
    await ui.dispose();
  } catch {
    problems.push(`UI is unreachable at ${UI_URL}. Start it with: cd frontend && npm run dev`);
  }

  if (problems.length === 0) {
    const res = await api.post('/api/auth/login', {
      data: { login: TEST_USER.login, password: TEST_USER.password },
      failOnStatusCode: false,
    });

    if (res.status() === 429) {
      const body = await res.json().catch(() => null);
      const wait = body?.details?.retryAfterSeconds ?? '≤300';
      problems.push(
        `Test account ${TEST_USER.login} is rate-limited; ${wait}s remain. ` +
          `Wait it out, or restart the BFF to clear the in-memory limiter.`,
      );
    } else if (!res.ok()) {
      problems.push(
        `Test account ${TEST_USER.login} could not sign in (HTTP ${res.status()}). ` +
          `Check E2E_LOGIN / E2E_PASSWORD, and that the account exists in Bugzilla.`,
      );
    } else {
      const counts = await api.get('/api/bugs/count', { failOnStatusCode: false });
      const total = (await counts.json().catch(() => null))?.counts?.total ?? 0;
      if (total === 0) {
        problems.push(
          `Test account ${TEST_USER.login} can see 0 bugs. Add it to the product groups ` +
            `(KPost API / KPost UI) or the UI specs will assert against an empty table.`,
        );
      }
      await api.post('/api/auth/logout', { failOnStatusCode: false });
    }
  }

  await api.dispose();

  if (problems.length > 0) {
    throw new Error(['E2E preconditions not met:', ...problems.map((problem) => `  • ${problem}`)].join('\n'));
  }
}
