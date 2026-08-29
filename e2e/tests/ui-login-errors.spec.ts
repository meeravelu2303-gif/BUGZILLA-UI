import { expect, test } from '@playwright/test';
import { RATE_LIMIT, TEST_USER, UI_URL, uniqueLogin } from '../support/env';

/**
 * What the sign-in form actually SAYS when things go wrong.
 *
 * Sign-in is the one screen where the error is the entire interface: no
 * navigation, no context, and a reader who cannot tell whether the fault is
 * theirs. These specs assert on rendered copy rather than on the API payload,
 * because a backend that returns a clean structured error and a form that
 * prints `[object Object]` is still a broken product.
 */

async function attemptSignIn(page: import('@playwright/test').Page, login: string, password: string) {
  await page.goto(`${UI_URL}/login`);
  await page.getByLabel('Email').fill(login);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('sign-in error copy @security', () => {
  test('bad credentials get a plain, actionable message', async ({ page }) => {
    await attemptSignIn(page, uniqueLogin('badcreds'), 'wrong-password');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid email or password/i);

    // Bugzilla's own wording ("The login or password you entered is not
    // valid.") travels in `upstream` and must not be what the user reads.
    await expect(alert).not.toContainText(/upstream|bugzilla returned/i);
  });

  test('a rate-limited sign-in shows a formatted wait, and never an IP', async ({ page }) => {
    const email = uniqueLogin('uilock');

    /*
     * Burn the budget over the API rather than through the form: eleven full
     * page interactions would take most of the timeout, and the browser context
     * shares the client IP either way, so the limiter sees the same key.
     */
    const api = await page.request;
    for (let i = 0; i < RATE_LIMIT.maxFailures; i += 1) {
      await api.post('http://localhost:4000/api/auth/login', {
        data: { login: email, password: 'wrong' },
        failOnStatusCode: false,
      });
    }

    await attemptSignIn(page, email, 'wrong');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    const text = (await alert.innerText()).trim();

    // A human-readable wait, formatted from the structured payload.
    expect(text).toMatch(/too many failed sign-in attempts/i);
    expect(text, 'should state when to retry').toMatch(/try again in \d+ (second|minute)s?/i);

    // The whole point of the sanitiser.
    expect(text, 'no IPv4 literal').not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(text, 'no IPv6 literal').not.toMatch(/::1/);
    expect(text.toLowerCase(), 'no "your IP" phrasing').not.toContain('your ip');

    // No leaked internals.
    expect(text).not.toMatch(/\.ts:\d+|node_modules|at \w+ \(/);
    expect(text, 'never render a raw object').not.toContain('[object Object]');
  });

  test('the error is announced to assistive technology', async ({ page }) => {
    // A sighted user sees the red box; a screen-reader user needs the live
    // region. Without role=alert the failure is silent for them.
    await attemptSignIn(page, uniqueLogin('a11y'), 'wrong-password');
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('the password is never echoed into the page or the URL', async ({ page }) => {
    const secret = 'Sup3r-Secret-Value-123';
    await attemptSignIn(page, uniqueLogin('leak'), secret);
    await expect(page.getByRole('alert')).toBeVisible();

    expect(page.url(), 'credentials must not reach the query string').not.toContain(secret);
    const html = await page.content();
    // The password input legitimately holds the value; nothing else should.
    const outsideInput = html.replace(/<input[^>]*>/g, '');
    expect(outsideInput, 'the password must not be echoed into the DOM').not.toContain(secret);
  });

  test('a valid sign-in still works after a failed one', async ({ page }) => {
    await attemptSignIn(page, TEST_USER.login, 'wrong-password');
    await expect(page.getByRole('alert')).toBeVisible();

    // Same form, same account, correct password: the earlier failure must not
    // stand in the way.
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  });
});
