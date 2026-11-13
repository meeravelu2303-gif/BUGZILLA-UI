import { expect, test } from '@playwright/test';
import { device, login, logout, me } from '../support/api';
import { MAX_SESSIONS, TEST_USER } from '../support/env';

test.describe.configure({ mode: 'serial' });

test.describe('multi-device sessions @security', () => {
  test(`${MAX_SESSIONS} devices can hold sessions at once`, async () => {
    const devices = await Promise.all(Array.from({ length: MAX_SESSIONS }, () => device()));

    for (const [i, context] of devices.entries()) {
      const res = await login(context, TEST_USER.login, TEST_USER.password);
      expect(res.status, `device ${i + 1} should sign in`).toBe(200);
    }

    for (const [i, context] of devices.entries()) {
      const res = await me(context);
      expect(res.status, `device ${i + 1} should still be authenticated`).toBe(200);
      expect(res.body?.user?.email).toBe(TEST_USER.login);
    }

    await Promise.all(
      devices.map((apiRequestContext) => logout(apiRequestContext).then(() => apiRequestContext.dispose())),
    );
  });

  test('a 4th sign-in is granted and evicts only the least recently used', async () => {
    const [firstDevice, secondDevice, thirdDevice, fourthDevice] = await Promise.all([
      device(),
      device(),
      device(),
      device(),
    ]);

    for (const context of [firstDevice, secondDevice, thirdDevice]) {
      expect((await login(context, TEST_USER.login, TEST_USER.password)).status).toBe(200);
    }

    expect((await me(secondDevice)).status).toBe(200);
    expect((await me(thirdDevice)).status).toBe(200);

    const fourth = await login(fourthDevice, TEST_USER.login, TEST_USER.password);
    expect(fourth.status, 'a 4th device must be let in, not blocked').toBe(200);

    expect(fourth.body?.session?.maxSessions).toBe(MAX_SESSIONS);
    expect(fourth.body?.session?.evictedSessions).toBeGreaterThanOrEqual(1);

    expect((await me(firstDevice)).status, 'the least recently used session must be revoked').toBe(401);
    for (const [i, context] of [secondDevice, thirdDevice, fourthDevice].entries()) {
      expect((await me(context)).status, `device ${i + 2} must be untouched by the eviction`).toBe(200);
    }

    await Promise.all(
      [secondDevice, thirdDevice, fourthDevice].map((apiRequestContext) =>
        logout(apiRequestContext).then(() => apiRequestContext.dispose()),
      ),
    );
    await firstDevice.dispose();
  });

  test('signing out one device leaves the others signed in', async () => {
    const [firstDevice, secondDevice] = await Promise.all([device(), device()]);
    for (const context of [firstDevice, secondDevice]) {
      expect((await login(context, TEST_USER.login, TEST_USER.password)).status).toBe(200);
    }

    expect(await logout(firstDevice)).toBe(204);

    expect((await me(firstDevice)).status, 'the signed-out device is revoked').toBe(401);
    expect((await me(secondDevice)).status, 'the other device keeps its own session').toBe(200);

    await logout(secondDevice);
    await Promise.all([firstDevice.dispose(), secondDevice.dispose()]);
  });

  test('a revoked session cannot reach data endpoints, not just /me', async () => {
    const [firstDevice, secondDevice, thirdDevice, fourthDevice] = await Promise.all([
      device(),
      device(),
      device(),
      device(),
    ]);
    for (const context of [firstDevice, secondDevice, thirdDevice, fourthDevice]) {
      expect((await login(context, TEST_USER.login, TEST_USER.password)).status).toBe(200);
    }

    const bugs = await firstDevice.get('/api/bugs?limit=1', { failOnStatusCode: false });
    expect(bugs.status(), 'an evicted session must be refused by data routes too').toBe(401);

    await Promise.all(
      [firstDevice, secondDevice, thirdDevice, fourthDevice].map((apiRequestContext) =>
        logout(apiRequestContext).then(() => apiRequestContext.dispose()),
      ),
    );
  });
});
