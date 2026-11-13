import { AppError, badRequest } from '../helpers/errors.helper';

const UPSTREAM_TIMEOUT_MS = 15_000;

/** http://host/bugzilla/rest + token.cgi -> http://host/bugzilla/token.cgi. */
export function cgiUrlFor(restBase: string, script: string): string {
  return restBase.replace(/\/+$/, '').replace(/\/rest$/, '') + '/' + script;
}

export function tokenCgiUrlFor(restBase: string): string {
  return cgiUrlFor(restBase, 'token.cgi');
}

/** Fetches one of Bugzilla's HTML pages from the server side. */
export async function fetchBugzillaPage(
  restBase: string,
  script: string,
  options: {
    method?: 'GET' | 'POST';
    fields?: Record<string, string>;
    query?: Record<string, string>;
    cookie?: string;
  } = {},
): Promise<string> {
  const method = options.method ?? 'POST';
  const queryString = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
  const headers: Record<string, string> = { Accept: 'text/html' };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (options.cookie) headers.Cookie = options.cookie;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(cgiUrlFor(restBase, script) + queryString, {
      method,
      headers,
      body: method === 'POST' ? new URLSearchParams(options.fields ?? {}).toString() : undefined,
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
  return decodeEntities(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The <title> Bugzilla's header template renders, whitespace-normalised. */
export function pageTitle(html: string): string {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return match ? collapse(match[1]) : '';
}

/** The body of Bugzilla's #error_msg block (user-error / code-error pages), as plain text. */
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
  if (/\bmail\b|smtp|sendmail/i.test(detail)) {
    return new AppError(
      502,
      'UPSTREAM_ERROR',
      'The server could not send the email. Please contact your administrator.',
    );
  }
  return new AppError(502, 'UPSTREAM_ERROR', `Bugzilla could not ${doing}.`);
}

/** Why the request did or did not go out. */
export type ResetRequestOutcome = 'sent' | 'too_soon' | 'account_disabled';

/** Asks Bugzilla to issue a password token and email it to login. */
export async function requestPasswordReset(restBase: string, login: string): Promise<ResetRequestOutcome> {
  const fields = { a: 'reqpw', loginname: login };
  let page = await postTokenCgi(restBase, fields);

  if (pageTitle(page) === 'Suspicious Action') {
    const token = hiddenField(page, 'token');
    if (!token) throw new AppError(502, 'UPSTREAM_ERROR', 'Bugzilla did not provide a confirmation token.');
    page = await postTokenCgi(restBase, { ...fields, token });
  }

  const title = pageTitle(page);
  switch (title) {
    case 'Request to Change Password':
      return 'sent';
    case 'Too Soon For New Token':
      return 'too_soon';
    case 'Account Disabled':
      return 'account_disabled';
    case 'Invalid Email Address':
      throw badRequest('Enter a valid email address.');
    case 'Password Change Requests Not Allowed':
      throw new AppError(502, 'UPSTREAM_ERROR', 'Password reset is not enabled on the Bugzilla server.');
  }
  throw unexpectedPage(page, 'request a password reset');
}

const INVALID_TOKEN_MESSAGE = 'This reset link is invalid, has expired, or has already been used. Request a new one.';

/** True when the token is one Bugzilla would accept a new password for right now. */
export async function validateResetToken(restBase: string, token: string): Promise<boolean> {
  const page = await postTokenCgi(restBase, { a: 'cfmpw', t: token });
  if (/\bname="matchpassword"/i.test(page)) return true;
  if (/\btoken\b/i.test(pageTitle(page))) return false;
  throw unexpectedPage(page, 'check the reset link');
}

/** Sets a new password for the account the token was issued to. */
export async function completePasswordReset(restBase: string, token: string, password: string): Promise<void> {
  const page = await postTokenCgi(restBase, { a: 'chgpw', t: token, password, matchpassword: password });
  const title = pageTitle(page);

  if (title === 'Password Changed') return;

  if (/\btoken\b/i.test(title)) {
    throw badRequest(INVALID_TOKEN_MESSAGE, undefined, { reason: 'invalid_token' });
  }
  if (/^password/i.test(title)) {
    throw badRequest(errorText(page) ?? title, undefined, { reason: 'password_rejected' });
  }
  throw unexpectedPage(page, 'change the password');
}
