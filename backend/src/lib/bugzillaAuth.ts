import { AppError } from './errors';
import { rpcCall } from './bugzillaClient';

interface LoginResponse {
  id: number;
  token: string;
}

/**
 * Authenticates a user against Bugzilla's own `User.login`.
 *
 * Sent as a JSON-RPC POST with `login` and `password` in the request body.
 * Bugzilla 5.2's REST transport only offers `GET /login?login=…&password=…`,
 * which put every password into the web server's access log; the JSON-RPC
 * method is the same login code reached through a body the log never records.
 *
 * The token Bugzilla returns is the same session token REST issues, and every
 * later call sends it in the body too (see bugzillaClient.ts).
 */
export async function loginToBugzilla(baseUrl: string, login: string, password: string): Promise<LoginResponse> {
  const body = await rpcCall<{ id?: unknown; token?: unknown }>(baseUrl, 'User.login', { login, password });

  // A success carrying neither a token nor an error is not a successful login;
  // without this the session would be created holding `undefined` and fail
  // later, far from the cause.
  if (typeof body?.id !== 'number' || typeof body?.token !== 'string' || body.token.length === 0) {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Bugzilla did not return a login token.');
  }
  return { id: body.id, token: body.token };
}

/**
 * Invalidates a Bugzilla session token server-side.
 *
 * Best effort: logout must succeed for the user even if Bugzilla is briefly
 * unreachable, so failures are logged, never thrown. Without this the token
 * would stay valid in Bugzilla's `logincookies` table until it expired.
 */
export async function logoutFromBugzilla(baseUrl: string, token: string): Promise<void> {
  try {
    await rpcCall(baseUrl, 'User.logout', {}, { kind: 'token', token });
  } catch (err) {
    console.warn('[auth] Bugzilla logout failed (session cookie cleared anyway):', err instanceof Error ? err.message : err);
  }
}
