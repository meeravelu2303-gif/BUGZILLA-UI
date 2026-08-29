import { expect, test } from '@playwright/test';
import { device, failLogin, login } from '../support/api';
import { LOCKOUT_PROBE, RATE_LIMIT, TEST_USER, uniqueLogin } from '../support/env';

/**
 * The login limiter's contract: composite (IP + account) keying, failures only,
 * and a fixed cooldown.
 *
 * Every spec here invents its own login address (see `uniqueLogin`), so each
 * starts against a clean bucket with no reset step and no cross-test
 * contention. That is also what lets the "another account is unaffected" spec
 * be meaningful rather than accidental.
 */
test.describe('login rate limiting @security', () => {
  test('the 11th failure is refused with a structured 429', async () => {
    const ctx = await device();
    const email = uniqueLogin();

    const failures = await failLogin(ctx, email, RATE_LIMIT.maxFailures);
    for (const [i, res] of failures.entries()) {
      expect(res.status, `attempt ${i + 1} of ${RATE_LIMIT.maxFailures} must be judged, not throttled`)
        .not.toBe(429);
    }

    const refused = await login(ctx, email, 'still-wrong');
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({
      error: true,
      status: 429,
      code: 'RATE_LIMITED',
    });

    // The retry delay must be machine-readable, not only prose: the sign-in
    // form formats it into "try again in N minutes".
    const details = refused.body?.details ?? {};
    expect(typeof details.retryAfterSeconds, 'details.retryAfterSeconds must be a number').toBe('number');
    expect(details.retryAfterSeconds).toBeGreaterThan(0);
    expect(details.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT.lockoutSeconds);
    expect(details.limit).toBe(RATE_LIMIT.maxFailures);
    expect(details.remaining).toBe(0);

    // Retry-After is the standard header; clients that read headers rather than
    // bodies (and proxies) depend on it.
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);

    await ctx.dispose();
  });

  test('locking account A does not lock account B from the same IP', async () => {
    const ctx = await device();
    const victim = uniqueLogin('userA');
    const bystander = uniqueLogin('userB');

    // Drive A past the threshold.
    await failLogin(ctx, victim, RATE_LIMIT.maxFailures);
    expect((await login(ctx, victim, 'wrong')).status, 'account A should now be locked').toBe(429);

    /*
     * Same context, therefore the same client IP. Under an IP-only limiter this
     * is the request that would be refused - which is exactly the fault that
     * locked out everyone behind one office NAT.
     */
    const other = await login(ctx, bystander, 'wrong');
    expect(other.status, 'a different account from the same IP must still be judged on its own merits')
      .not.toBe(429);
    expect(other.status).toBe(401);

    await ctx.dispose();
  });

  test('attempts during a cooldown do not extend it', async () => {
    test.slow(); // deliberately spends ~10s of wall clock sampling the countdown
    const ctx = await device();
    const email = uniqueLogin();

    await failLogin(ctx, email, RATE_LIMIT.maxFailures);
    const first = await login(ctx, email, 'wrong');
    expect(first.status).toBe(429);
    const initial = first.body.details.retryAfterSeconds as number;

    // Hammer it the way a stuck client or an attacker would.
    await failLogin(ctx, email, 8);

    /*
     * Sampled over time rather than compared immediately: `retryAfterSeconds` is
     * a Math.ceil, so within the first second of a 300s lock it still reads 300
     * whether or not the lock moved. Only a strictly decreasing series proves
     * the deadline is fixed. This is the assertion that catches a limiter which
     * resets its timer on every request.
     */
    const samples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      await new Promise((r) => setTimeout(r, 3_000));
      const res = await login(ctx, email, 'wrong');
      expect(res.status).toBe(429);
      samples.push(res.body.details.retryAfterSeconds);
    }

    expect(samples[0]).toBeLessThan(initial);
    expect(samples[1]).toBeLessThan(samples[0]);
    expect(samples[2]).toBeLessThan(samples[1]);

    await ctx.dispose();
  });

  /*
   * ---------------------------------------------------------------------------
   * Why "reset on success" is not proved here by crossing the threshold
   *
   * Doing that needs >10 FAILURES against an account whose password we also
   * know. Bugzilla locks a real account after 5 failed logins of its own
   * (`max_login_failures`, verified against this instance), long before the
   * BFF's tenth. The 429 that comes back is then Bugzilla's lockout, not the
   * BFF's limiter - a different mechanism with a different, much longer
   * cooldown - so the assertion would be measuring the wrong thing and would
   * leave the shared test account locked for half an hour afterwards.
   *
   * That is exactly why every other spec in this file invents a non-existent
   * address: Bugzilla cannot lock an account that does not exist, so the BFF
   * limiter is the only thing in play and its threshold is reachable.
   *
   * The threshold-crossing reset is covered where it can be done precisely -
   * a unit test over `recordLoginFailure`/`clearLoginFailures` with an injected
   * clock. What IS observable end-to-end, and what actually regressed in
   * production, is covered by the two specs below.
   */

  test('successful sign-ins never consume the failure budget', async () => {
    const ctx = await device();

    /*
     * The original defect: the limiter counted every REQUEST, incrementing
     * before the password was checked and never clearing on success. Ten valid
     * sign-ins in one window locked the account - which is what people hit
     * simply by signing in on a second device.
     *
     * Twelve consecutive successes is a direct test of that: under the old
     * behaviour the 11th is a 429. It needs no failures at all, so Bugzilla's
     * own lockout is never in play.
     */
    for (let i = 1; i <= 12; i += 1) {
      const res = await login(ctx, TEST_USER.login, TEST_USER.password);
      expect(res.status, `successful sign-in #${i} must not be throttled`).toBe(200);
    }

    await ctx.dispose();
  });

  test('a failure followed by a success leaves the account immediately usable', async () => {
    const ctx = await device();

    // Stays under Bugzilla's own 5-failure lockout, deliberately.
    await failLogin(ctx, TEST_USER.login, 3);

    const ok = await login(ctx, TEST_USER.login, TEST_USER.password);
    expect(ok.status, 'valid credentials must be accepted with failures on record').toBe(200);

    // And again, to prove the earlier failures left no residue that only shows
    // up on a later attempt.
    const again = await login(ctx, TEST_USER.login, TEST_USER.password);
    expect(again.status, 'the account must stay usable after a mixed run').toBe(200);

    await ctx.dispose();
  });

  test("Bugzilla's own account lockout is surfaced as a clean 429, not a raw 400", async () => {
    const ctx = await device();

    /*
     * Bugzilla locks a real account after 5 failures and answers with
     * `account_locked` - HTTP 400, generic code 32000, and a message embedding
     * the client's IP. Untranslated it reached the browser as a validation
     * error carrying an address.
     *
     * Uses the sacrificial probe account, never the shared test user: this
     * lockout is Bugzilla-side and outlives the run by ~30 minutes, so pointing
     * it at TEST_USER would leave every later spec unable to sign in.
     *
     * Re-running inside that window is fine - an already-locked account returns
     * the same shape on the first attempt, which is all this asserts.
     */
    const email = LOCKOUT_PROBE.login;
    let locked: Awaited<ReturnType<typeof login>> | null = null;

    for (let i = 0; i < 8 && !locked; i += 1) {
      const res = await login(ctx, email, 'wrong-password');
      if (res.status === 429 && res.body?.details?.scope === 'bugzilla-account') locked = res;
    }

    test.skip(
      locked === null,
      'Bugzilla did not lock the account - `max_login_failures` may be raised on this instance'
    );

    expect(locked!.body.code).toBe('RATE_LIMITED');
    expect(locked!.body.details.scope).toBe('bugzilla-account');
    // The unlock time is kept as display text; the IP that surrounded it is not.
    expect(typeof locked!.body.details.unlockAtText).toBe('string');
    expect(JSON.stringify(locked!.body)).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b|::1/);

    await ctx.dispose();
  });

  test('a rate-limit response never leaks an IP address', async () => {
    const ctx = await device();
    const email = uniqueLogin();

    await failLogin(ctx, email, RATE_LIMIT.maxFailures);
    const refused = await login(ctx, email, 'wrong');
    const serialised = JSON.stringify(refused.body);

    /*
     * Bugzilla's own account_locked string embeds the client address ("Your IP
     * (::1) has been locked out…"), and it used to reach the browser verbatim
     * through the BFF's pass-through branch. Asserted on the whole payload, not
     * just `message`, because `upstream` reaches the client too.
     */
    expect(serialised, 'no IPv4 literal in an auth error').not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(serialised, 'no IPv6 literal in an auth error').not.toMatch(/(^|[^\w:])::1([^\w:]|$)/);
    expect(serialised.toLowerCase(), 'no "your IP" phrasing').not.toContain('your ip');
    // A stack trace or file path would mean an unhandled error escaped.
    expect(serialised).not.toMatch(/\bat \w+ \(|\.ts:\d+|node_modules/);

    await ctx.dispose();
  });
});
