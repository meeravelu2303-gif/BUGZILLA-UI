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
  await page.getByLabel('Password', { exact: true }).fill(password);
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

  test('a malformed email is rejected client-side, without calling the API', async ({ page }) => {
    /*
     * The no-request assertion is the important half. A malformed address
     * cannot succeed, and sending it anyway spends one of the ten attempts the
     * limiter allows for this (IP, account) pair - so a few typos would march
     * someone toward a five-minute lockout for a mistake the browser could see.
     */
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/login')) calls.push(r.url());
    });

    await page.goto(`${UI_URL}/login`);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('whatever');
    await page.getByRole('button', { name: /sign in/i }).click();

    const fieldError = page.locator('#login-email-error');
    await expect(fieldError).toBeVisible();
    await expect(fieldError).toContainText(/valid work email address/i);
    expect(calls, 'no login request should have been sent').toHaveLength(0);

    // The field is marked invalid for assistive tech, not only in colour.
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');

    // Correcting it clears the message without needing another submit.
    await page.getByLabel('Email').fill('someone@example.com');
    await expect(fieldError).toHaveCount(0);
  });

  test('an empty email is caught before submission', async ({ page }) => {
    await page.goto(`${UI_URL}/login`);
    await page.getByLabel('Password', { exact: true }).fill('whatever');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('#login-email-error')).toContainText(/required/i);
  });

  test('an empty password is reported rather than silently ignored', async ({ page }) => {
    /*
     * This regressed once already. The handler read `if (!password) return;` -
     * so pressing Sign in with the password box empty did nothing whatsoever:
     * no message, no request, no focus change. A control that appears to
     * ignore the click is indistinguishable from one that is broken, and the
     * only recourse a user has is to press it again.
     */
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/auth/login')) calls.push(r.url());
    });

    await page.goto(`${UI_URL}/login`);
    await page.getByLabel('Email').fill(TEST_USER.login);
    await page.getByRole('button', { name: /sign in/i }).click();

    const fieldError = page.locator('#login-password-error');
    await expect(fieldError).toBeVisible();
    await expect(fieldError).toContainText(/required/i);
    expect(calls, 'no login request should have been sent').toHaveLength(0);

    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-invalid', 'true');

    // Typing clears it without needing a second submit.
    await page.getByLabel('Password', { exact: true }).fill('x');
    await expect(fieldError).toHaveCount(0);
  });

  test('both fields blank reports both problems at once', async ({ page }) => {
    /*
     * Short-circuiting the two checks would surface the email error, then the
     * password error only after the first was fixed and the form submitted
     * again - two round trips through the user's attention for one mistake.
     */
    await page.goto(`${UI_URL}/login`);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('#login-email-error')).toBeVisible();
    await expect(page.locator('#login-password-error')).toBeVisible();
  });

  test('focus moves to the first field that needs attention', async ({ page }) => {
    // The messages render BELOW their inputs, so on a short viewport the field
    // being described can be the one scrolled out of view. Focus also makes the
    // error reachable to a screen reader, which coloured text alone does not.
    await page.goto(`${UI_URL}/login`);
    await page.getByLabel('Email').fill(TEST_USER.login);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('#login-password')).toBeFocused();

    // With the email at fault it is the email that takes focus, not the password.
    await page.goto(`${UI_URL}/login`);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('whatever');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('#login-email')).toBeFocused();
  });

  test('the password can be revealed and re-hidden', async ({ page }) => {
    await page.goto(`${UI_URL}/login`);
    const field = page.getByLabel('Password', { exact: true });
    await field.fill('Sup3r-Secret-Value-123');

    // Masked by default - revealing must be a deliberate act, never the
    // starting state.
    await expect(field).toHaveAttribute('type', 'password');

    const toggle = page.getByRole('button', { name: /show password/i });
    await toggle.click();
    await expect(field, 'the value should now be readable').toHaveAttribute('type', 'text');
    await expect(field).toHaveValue('Sup3r-Secret-Value-123');

    // The control announces its state, not just its icon.
    await expect(page.getByRole('button', { name: /hide password/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await page.getByRole('button', { name: /hide password/i }).click();
    await expect(field).toHaveAttribute('type', 'password');
  });

  test('revealing the password does not submit the form', async ({ page }) => {
    /*
     * A bare <button> inside a <form> defaults to type="submit". Without an
     * explicit type="button" the toggle would fire a sign-in attempt on every
     * click - burning the rate-limit budget and, worse, submitting a
     * half-typed password.
     */
    await page.goto(`${UI_URL}/login`);
    await page.getByLabel('Email').fill(uniqueLogin('toggle'));
    await page.getByLabel('Password', { exact: true }).fill('partial');

    await page.getByRole('button', { name: /show password/i }).click();
    await page.waitForTimeout(700);

    await expect(page.getByRole('alert'), 'no sign-in should have been attempted').toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });

  test('a valid sign-in still works after a failed one', async ({ page }) => {
    await attemptSignIn(page, TEST_USER.login, 'wrong-password');
    await expect(page.getByRole('alert')).toBeVisible();

    // Same form, same account, correct password: the earlier failure must not
    // stand in the way.
    await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  });
});
