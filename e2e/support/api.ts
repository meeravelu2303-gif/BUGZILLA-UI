import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { API_URL } from './env';

/**
 * Thin helpers over the BFF, used by the specs that assert on the wire contract
 * rather than on rendered pixels.
 *
 * Each `device()` is its own APIRequestContext with its own cookie jar, which is
 * what makes it a distinct device as far as the session registry is concerned -
 * separate session cookie, separate device cookie, separate slot.
 */

export interface LoginResult {
  status: number;
  body: any;
  headers: Record<string, string>;
}

/** A fresh, cookie-isolated client. One per simulated device. */
export async function device(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL });
}

async function read(res: APIResponse): Promise<LoginResult> {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is itself a finding - the BFF's contract is that every
    // response is JSON - so it is surfaced rather than swallowed.
    body = { _raw: text };
  }
  return { status: res.status(), body, headers: res.headers() };
}

export async function login(ctx: APIRequestContext, login: string, password: string): Promise<LoginResult> {
  return read(await ctx.post('/api/auth/login', { data: { login, password }, failOnStatusCode: false }));
}

export async function me(ctx: APIRequestContext): Promise<LoginResult> {
  return read(await ctx.get('/api/auth/me', { failOnStatusCode: false }));
}

export async function logout(ctx: APIRequestContext): Promise<number> {
  return (await ctx.post('/api/auth/logout', { failOnStatusCode: false })).status();
}

/**
 * Fails a login `times` times and returns every response.
 *
 * Sequential rather than concurrent on purpose: the limiter increments per
 * request, and firing ten at once makes "which attempt tripped the threshold"
 * a race. These specs assert on the exact attempt number, so the order has to
 * be deterministic.
 */
export async function failLogin(
  ctx: APIRequestContext,
  email: string,
  times: number,
  password = 'definitely-not-the-password'
): Promise<LoginResult[]> {
  const out: LoginResult[] = [];
  for (let i = 0; i < times; i += 1) out.push(await login(ctx, email, password));
  return out;
}
