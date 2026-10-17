import { AppError } from './errors';

/**
 * Forgot / reset password, driven through Bugzilla's own `token.cgi`.
 *
 * Bugzilla 5.2 has no WebService method for this. The only implementation is
 * the HTML flow behind token.cgi: `reqpw` issues a one-time token and emails
 * it, `cfmpw` shows the form for a valid token, `chgpw` consumes the token and
 * sets the password. This module drives that flow from the server with form
 * POSTs - nothing in a query string, so nothing in the Apache access log - and
 * reads the outcome off the page Bugzilla renders.
 *
 * Bugzilla's templates give an outcome exactly one stable marker: the page
 * `<title>`, set per message/error in messages.html.tmpl and user-error.html.tmpl.
 * Every branch below keys on those titles; the strings are quoted verbatim
 * from the templates next to each case so a Bugzilla upgrade can be checked
 * against them.
 *
 * The email Bugzilla sends links to its own token.cgi unless the custom mail
 * template from ops/bugzilla/setup-password-reset.pl is installed, which points
 * it at this app's /reset-password page instead.
 */

const UPSTREAM_TIMEOUT_MS = 15_000;

/** `http://host/bugzilla/rest` + `token.cgi` -> `http://host/bugzilla/token.cgi`. */
export function cgiUrlFor(restBase: string, script: string): string {
  return restBase.replace(/\/+$/, '').replace(/\/rest$/, '') + '/' + script;
}

export function tokenCgiUrlFor(restBase: string): string {
  return cgiUrlFor(restBase, 'token.cgi');
}

/**
 * Fetches one of Bugzilla's HTML pages from the server side.
 *
 * `fields` are always sent as a form body, never a query string, so nothing
 * secret reaches the access log; `query` is for the non-secret selector a
 * GET needs (e.g. `tab=account`). `cookie` lets the request act as a signed-in
 * user - see bugzillaLoginCookie.
 */
export async function fetchBugzillaPage(
  restBase: string,
  script: string,
  opts: { method?: 'GET' | 'POST'; fields?: Record<string, string>; query?: Record<string, string>; cookie?: string } = {}
): Promise<string> {
  const method = opts.method ?? 'POST';
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
  const headers: Record<string, string> = { Accept: 'text/html' };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (opts.cookie) headers.Cookie = opts.cookie;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(cgiUrlFor(restBase, script) + qs, {
      method,
      headers,
      body: method === 'POST' ? new URLSearchParams(opts.fields ?? {}).toString() : undefined,
      signal: controller.signal,
      redirect: 'manual',
    });
    return await response.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Bugzilla did not respond in time.');
    }
    throw new AppError(502, 'UPSTREAM_UNREACHABLE', 'Could not reach the Bugzilla server.');
  } finally {
    clearTimeout(timeout);
  }
}

function postTokenCgi(restBase: string, fields: Record<string, string>): Promise<string> {
  return fetchBugzillaPage(restBase, 'token.cgi', { fields });
}

// ---------------------------------------------------------------- page reading

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function collapse(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** The `<title>` Bugzilla's header template renders, whitespace-normalised. */
export function pageTitle(html: string): string {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return match ? collapse(match[1]) : '';
}

/** The body of Bugzilla's `#error_msg` block (user-error / code-error pages), as plain text. */
export function errorText(html: string): string | null {
  const match = /<(div|td)[^>]*\bid="error_msg"[^>]*>([\s\S]*?)<\/\1>/i.exec(html);
  return match ? collapse(match[2]) : null;
}

/** A hidden input's value, whichever order its attributes were written in. */
export function hiddenField(html: string, name: string): string | null {
  const byNameFirst = new RegExp(`<input[^>]*\\bname="${name}"[^>]*\\bvalue="([^"]*)"`, 'i').exec(html);
  if (byNameFirst) return decodeEntities(byNameFirst[1]);
  const byValueFirst = new RegExp(`<input[^>]*\\bvalue="([^"]*)"[^>]*\\bname="${name}"`, 'i').exec(html);
  return byValueFirst ? decodeEntities(byValueFirst[1]) : null;
}

export function unexpectedPage(html: string, doing: string): AppError {
  const detail = errorText(html) ?? pageTitle(html) ?? '(no title)';
  console.error(`[password-reset] unexpected Bugzilla page while trying to ${doing}: ${detail}`);
  // `mail_send_error` (code-error.html.tmpl) is the one operators actually hit:
  // SMTP refused the message. Say so instead of a generic upstream apology.
  if (/\bmail\b|smtp|sendmail/i.test(detail)) {
    return new AppError(502, 'UPSTREAM_ERROR', 'The server could not send the email. Please contact your administrator.');
  }
  return new AppError(502, 'UPSTREAM_ERROR', `Bugzilla could not ${doing}.`);
}

// --------------------------------------------------------------------- request

/**
 * Why the request did or did not go out. All three are reported to the caller
 * as "accepted": whether an address has an account, is disabled, or asked ten
 * minutes ago is not something an unauthenticated caller gets to learn.
 */
export type ResetRequestOutcome = 'sent' | 'too_soon' | 'account_disabled';

/**
 * Asks Bugzilla to issue a password token and email it to `login`.
 *
 * token.cgi guards `reqpw` with an anti-CSRF hash token. Posting without one
 * does not fail: Bugzilla answers with its "Suspicious Action" confirmation
 * page, which carries a fresh token for exactly this action and this caller,
 * and a second POST with that token goes through. Two round trips, no scraping
 * of the login page.
 */
export async function requestPasswordReset(restBase: string, login: string): Promise<ResetRequestOutcome> {
  const fields = { a: 'reqpw', loginname: login };
  let page = await postTokenCgi(restBase, fields);

  // global/confirm-action.html.tmpl: title = "Suspicious Action"
  if (pageTitle(page) === 'Suspicious Action') {
    const token = hiddenField(page, 'token');
    if (!token) throw new AppError(502, 'UPSTREAM_ERROR', 'Bugzilla did not provide a confirmation token.');
    page = await postTokenCgi(restBase, { ...fields, token });
  }

  const title = pageTitle(page);
  switch (title) {
    case 'Request to Change Password': // messages.html.tmpl: password_change_request
      return 'sent';
    case 'Too Soon For New Token': // user-error: too_soon_for_new_token (ACCOUNT_CHANGE_INTERVAL = 10 min)
      return 'too_soon';
    case 'Account Disabled': // user-error: account_disabled
      return 'account_disabled';
    case 'Invalid Email Address': // user-error: illegal_email_address
      throw new AppError(400, 'VALIDATION', 'Enter a valid email address.');
    case 'Password Change Requests Not Allowed': // user-error: user_verify_class without DB
      throw new AppError(502, 'UPSTREAM_ERROR', 'Password reset is not enabled on the Bugzilla server.');
  }
  throw unexpectedPage(page, 'request a password reset');
}

// -------------------------------------------------------------------- complete

const INVALID_TOKEN_MESSAGE = 'This reset link is invalid, has expired, or has already been used. Request a new one.';

/** True when the token is one Bugzilla would accept a new password for right now. */
export async function validateResetToken(restBase: string, token: string): Promise<boolean> {
  const page = await postTokenCgi(restBase, { a: 'cfmpw', t: token });
  // account/password/set-forgotten-password.html.tmpl renders the form only for a live token.
  if (/\bname="matchpassword"/i.test(page)) return true;
  // "Token Does Not Exist" / "Wrong Token ..." - every token failure title names the token.
  if (/\btoken\b/i.test(pageTitle(page))) return false;
  throw unexpectedPage(page, 'check the reset link');
}

/**
 * Sets a new password for the account the token was issued to.
 *
 * Bugzilla deletes the token, every other password token of that user, and all
 * of the user's Bugzilla login sessions as part of `chgpw`; this BFF's own
 * sessions for the user are left to the caller (routes/auth.ts).
 */
export async function completePasswordReset(restBase: string, token: string, password: string): Promise<void> {
  const page = await postTokenCgi(restBase, { a: 'chgpw', t: token, password, matchpassword: password });
  const title = pageTitle(page);

  if (title === 'Password Changed') return; // messages.html.tmpl: password_changed

  if (/\btoken\b/i.test(title)) {
    throw new AppError(400, 'VALIDATION', INVALID_TOKEN_MESSAGE, undefined, { reason: 'invalid_token' });
  }
  // "Password Too Short", "Passwords Don't Match", "Password Fails Requirements":
  // the policy lives in Bugzilla (USER_PASSWORD_MIN_LENGTH, password_complexity),
  // so its own sentence is the accurate one to show.
  if (/^password/i.test(title)) {
    throw new AppError(400, 'VALIDATION', errorText(page) ?? title, undefined, { reason: 'password_rejected' });
  }
  throw unexpectedPage(page, 'change the password');
}
