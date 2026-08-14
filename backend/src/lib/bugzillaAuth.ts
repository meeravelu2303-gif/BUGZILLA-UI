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

  const body = (await response.json()) as { error?: boolean; code?: number; message?: string; id?: number; token?: string };
  if (!response.ok || body.error === true) {
    throw mapBugzillaError(response.status, body);
  }

  return { id: body.id as number, token: body.token as string };
}
