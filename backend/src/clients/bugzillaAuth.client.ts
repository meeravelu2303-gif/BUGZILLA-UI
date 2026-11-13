import { AppError } from '../helpers/errors.helper';
import { rpcCall } from './bugzilla.client';

interface LoginResponse {
  id: number;
  token: string;
}

/** Authenticates a user against Bugzilla's own User.login. */
export async function loginToBugzilla(baseUrl: string, login: string, password: string): Promise<LoginResponse> {
  const body = await rpcCall<{ id?: unknown; token?: unknown }>(baseUrl, 'User.login', { login, password });

  if (typeof body?.id !== 'number' || typeof body?.token !== 'string' || body.token.length === 0) {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Bugzilla did not return a login token.');
  }
  return { id: body.id, token: body.token };
}

/** Invalidates a Bugzilla session token server-side. */
export async function logoutFromBugzilla(baseUrl: string, token: string): Promise<void> {
  try {
    await rpcCall(baseUrl, 'User.logout', {}, { kind: 'token', token });
  } catch (err) {
    console.warn(
      '[auth] Bugzilla logout failed (session cookie cleared anyway):',
      err instanceof Error ? err.message : err,
    );
  }
}
