import { expect, test } from '@playwright/test';
import { device, login, logout, me } from '../support/api';
import { MAX_SESSIONS, TEST_USER } from '../support/env';

/**
 * Multi-device sessions and least-recently-used eviction.
 *
 * A "device" here is an APIRequestContext with its own cookie jar - separate
 * session cookie, separate device cookie - which is exactly what the server
 * counts as a distinct device. Reusing one context would look like one device
 * signing in repeatedly, which the server correctly collapses into a single
 * slot, and the eviction would never trigger.
 *
 * Serial within the file: every spec signs the SAME account in and out, so two
 * running together would evict each other's sessions and each would blame the
 * product.
 */
test.describe.configure({ mode: 'serial' });

test.describe('multi-device sessions @security', () => {
  test(`${MAX_SESSIONS} devices can hold sessions at once`, async () => {
    const devices = await Promise.all(Array.from({ length: MAX_SESSIONS }, () => device()));

    for (const [i, ctx] of devices.entries()) {
      const res = await login(ctx, TEST_USER.login, TEST_USER.password);
      expect(res.status, `device ${i + 1} should sign in`).toBe(200);
    }

    // All three must still be usable - a cap of three that only leaves the last
    // one working would pass a naive "did login return 200" check.
    for (const [i, ctx] of devices.entries()) {
      const res = await me(ctx);
      expect(res.status, `device ${i + 1} should still be authenticated`).toBe(200);
      expect(res.body?.user?.email).toBe(TEST_USER.login);
    }

    await Promise.all(devices.map((c) => logout(c).then(() => c.dispose())));
  });

  test('a 4th sign-in is granted and evicts only the least recently used', async () => {
    const [d1, d2, d3, d4] = await Promise.all([device(), device(), device(), device()]);

    // Sign in oldest-first so d1 is unambiguously the LRU candidate.
    for (const ctx of [d1, d2, d3]) {
      expect((await login(ctx, TEST_USER.login, TEST_USER.password)).status).toBe(200);
    }

    /*
     * Touch d2 and d3 so "least recently used" and "first to sign in" are the
     * same device here. Without this the test would still pass, but it would
     * not distinguish LRU from plain FIFO - and the server promises LRU.
     */
    expect((await me(d2)).status).toBe(200);
    expect((await me(d3)).status).toBe(200);

    // The whole point: the 4th device is admitted, never refused.
    const fourth = await login(d4, TEST_USER.login, TEST_USER.password);
    expect(fourth.status, 'a 4th device must be let in, not blocked').toBe(200);

    // And the server says what it did, rather than silently signing someone out.
    expect(fourth.body?.session?.maxSessions).toBe(MAX_SESSIONS);
    expect(fourth.body?.session?.evictedSessions).toBeGreaterThanOrEqual(1);

    expect((await me(d1)).status, 'the least recently used session must be revoked').toBe(401);
    for (const [i, ctx] of [d2, d3, d4].entries()) {
      expect((await me(ctx)).status, `device ${i + 2} must be untouched by the eviction`).toBe(200);
    }

    await Promise.all([d2, d3, d4].map((c) => logout(c).then(() => c.dispose())));
    await d1.dispose();
  });

  test('signing out one device leaves the others signed in', async () => {
    const [d1, d2] = await Promise.all([device(), device()]);
    for (const ctx of [d1, d2]) {
      expect((await login(ctx, TEST_USER.login, TEST_USER.password)).status).toBe(200);
    }

    expect(await logout(d1)).toBe(204);

    expect((await me(d1)).status, 'the signed-out device is revoked').toBe(401);
    expect((await me(d2)).status, 'the other device keeps its own session').toBe(200);

    await logout(d2);
    await Promise.all([d1.dispose(), d2.dispose()]);
  });

  test('a revoked session cannot reach data endpoints, not just /me', async () => {
    const [d1, d2, d3, d4] = await Promise.all([device(), device(), device(), device()]);
    for (const ctx of [d1, d2, d3, d4]) {
      expect((await login(ctx, TEST_USER.login, TEST_USER.password)).status).toBe(200);
    }

    /*
     * `/me` is the cheap check, but the one that matters is whether an evicted
     * cookie can still read bugs. A revocation that only guarded the identity
     * endpoint would be no revocation at all.
     */
    const bugs = await d1.get('/api/bugs?limit=1', { failOnStatusCode: false });
    expect(bugs.status(), 'an evicted session must be refused by data routes too').toBe(401);

    await Promise.all([d1, d2, d3, d4].map((c) => logout(c).then(() => c.dispose())));
  });
});
