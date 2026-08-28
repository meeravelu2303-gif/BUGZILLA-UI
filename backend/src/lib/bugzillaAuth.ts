import { AppError, mapBugzillaError } from './errors';

const UPSTREAM_TIMEOUT_MS = 15_000;

interface LoginResponse {
  id: number;
  token: string;
}

/**
 * Authenticates a user directly against Bugzilla's own /login endpoint.
 * Deliberately bypasses BugzillaClient (which always injects a credential)
 * since login itself carries no prior credential.
 */
export async function loginToBugzilla(baseUrl: string, login: string, password: string): Promise<LoginResponse> {
  const url = new URL(baseUrl.replace(/\/+$/, '') + '/login');
  url.searchParams.set('login', login);
  url.searchParams.set('password', password);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Bugzilla did not respond in time.');
    }
    throw new AppError(502, 'UPSTREAM_UNREACHABLE', 'Could not reach the Bugzilla server.');
  } finally {
    clearTimeout(timeout);
  }

  /*
   * Read as text and parse defensively - `response.json()` throws a raw
   * SyntaxError when Bugzilla answers with something that is not JSON, and that
   * escapes as an unhandled rejection reading "Unexpected token '<'", which says
   * nothing about what actually went wrong.
   *
   * Bugzilla does this for real: when it cannot reach its own database, Perl
   * serves an HTML `<h1>Software error:</h1>` page - with a 200 status - instead
   * of the REST envelope. Mirrors the handling BugzillaClient already applies to
   * every other call; login is the one path that bypasses that client.
   */
  const text = await response.text();
  let body: { error?: boolean; code?: number; message?: string; id?: number; token?: string };
  try {
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    throw new AppError(
      502,
      'UPSTREAM_ERROR',
      'Bugzilla returned an error page instead of a response. It is most likely misconfigured or cannot reach its database.'
    );
  }

  if (!response.ok || body.error === true) {
    throw mapBugzillaError(response.status, body);
  }

  // A 200 carrying neither a token nor an error is not a successful login; without
  // this the session would be created holding `undefined` and fail later, far from
  // the cause.
  if (typeof body.id !== 'number' || typeof body.token !== 'string') {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Bugzilla did not return a login token.');
  }

  return { id: body.id, token: body.token };
}
