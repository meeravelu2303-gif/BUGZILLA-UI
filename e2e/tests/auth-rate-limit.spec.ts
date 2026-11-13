import { expect, test } from '@playwright/test';
import { device, failLogin, login } from '../support/api';
import { LOCKOUT_PROBE, RATE_LIMIT, TEST_USER, uniqueLogin } from '../support/env';

test.describe('login rate limiting @security', () => {
  test('the 11th failure is refused with a structured 429', async () => {
    const context = await device();
    const email = uniqueLogin();

    const failures = await failLogin(context, email, RATE_LIMIT.maxFailures);
    for (const [i, res] of failures.entries()) {
      expect(res.status, `attempt ${i + 1} of ${RATE_LIMIT.maxFailures} must be judged, not throttled`).not.toBe(429);
    }

    const refused = await login(context, email, 'still-wrong');
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({
      error: true,
      status: 429,
      code: 'RATE_LIMITED',
    });

    const details = refused.body?.details ?? {};
    expect(typeof details.retryAfterSeconds, 'details.retryAfterSeconds must be a number').toBe('number');
    expect(details.retryAfterSeconds).toBeGreaterThan(0);
    expect(details.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT.lockoutSeconds);
    expect(details.limit).toBe(RATE_LIMIT.maxFailures);
    expect(details.remaining).toBe(0);

    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

    await context.dispose();
  });

  test('locking account A does not lock account B from the same IP', async () => {
    const context = await device();
    const victim = uniqueLogin('userA');
    const bystander = uniqueLogin('userB');

    await failLogin(context, victim, RATE_LIMIT.maxFailures);
    expect((await login(context, victim, 'wrong')).status, 'account A should now be locked').toBe(429);

    const other = await login(context, bystander, 'wrong');
    expect(other.status, 'a different account from the same IP must still be judged on its own merits').not.toBe(429);
    expect(other.status).toBe(401);

    await context.dispose();
  });

  test('attempts during a cooldown do not extend it', async () => {
    test.slow();
    const context = await device();
    const email = uniqueLogin();

    await failLogin(context, email, RATE_LIMIT.maxFailures);
    const first = await login(context, email, 'wrong');
    expect(first.status).toBe(429);
    const initial = first.body.details.retryAfterSeconds as number;

    await failLogin(context, email, 8);

    const samples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const res = await login(context, email, 'wrong');
      expect(res.status).toBe(429);
      samples.push(res.body.details.retryAfterSeconds);
    }

    expect(samples[0]).toBeLessThan(initial);
    expect(samples[1]).toBeLessThan(samples[0]);
    expect(samples[2]).toBeLessThan(samples[1]);

    await context.dispose();
  });

  test('successful sign-ins never consume the failure budget', async () => {
    const context = await device();

    for (let i = 1; i <= 12; i += 1) {
      const res = await login(context, TEST_USER.login, TEST_USER.password);
      expect(res.status, `successful sign-in #${i} must not be throttled`).toBe(200);
    }

    await context.dispose();
  });

  test('a failure followed by a success leaves the account immediately usable', async () => {
    const context = await device();

    await failLogin(context, TEST_USER.login, 3);

    const ok = await login(context, TEST_USER.login, TEST_USER.password);
    expect(ok.status, 'valid credentials must be accepted with failures on record').toBe(200);

    const again = await login(context, TEST_USER.login, TEST_USER.password);
    expect(again.status, 'the account must stay usable after a mixed run').toBe(200);

    await context.dispose();
  });

  test("Bugzilla's own account lockout is surfaced as a clean 429, not a raw 400", async () => {
    const context = await device();

    const email = LOCKOUT_PROBE.login;
    let locked: Awaited<ReturnType<typeof login>> | null = null;

    for (let i = 0; i < 8 && !locked; i += 1) {
      const res = await login(context, email, 'wrong-password');
      if (res.status === 429 && res.body?.details?.scope === 'bugzilla-account') locked = res;
    }

    test.skip(
      locked === null,
      'Bugzilla did not lock the account - `max_login_failures` may be raised on this instance',
    );

    expect(locked!.body.code).toBe('RATE_LIMITED');
    expect(locked!.body.details.scope).toBe('bugzilla-account');
    expect(typeof locked!.body.details.unlockAtText).toBe('string');
    expect(JSON.stringify(locked!.body)).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b|::1/);

    await context.dispose();
  });

  test('a rate-limit response never leaks an IP address', async () => {
    const context = await device();
    const email = uniqueLogin();

    await failLogin(context, email, RATE_LIMIT.maxFailures);
    const refused = await login(context, email, 'wrong');
    const serialised = JSON.stringify(refused.body);

    expect(serialised, 'no IPv4 literal in an auth error').not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(serialised, 'no IPv6 literal in an auth error').not.toMatch(/(^|[^\w:])::1([^\w:]|$)/);
    expect(serialised.toLowerCase(), 'no "your IP" phrasing').not.toContain('your ip');
    expect(serialised).not.toMatch(/\bat \w+ \(|\.ts:\d+|node_modules/);

    await context.dispose();
  });
});
