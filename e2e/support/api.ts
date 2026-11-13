import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { API_URL } from './env';

/** Thin helpers over the BFF, used by the specs that assert on the wire contract rather than on rendered pixels. */
export interface LoginResult {
  status: number;
  body: any;
  headers: Record<string, string>;
}

/** A fresh, cookie-isolated client. */
export async function device(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: API_URL });
}

async function read(res: APIResponse): Promise<LoginResult> {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  return { status: res.status(), body, headers: res.headers() };
}

export async function login(context: APIRequestContext, login: string, password: string): Promise<LoginResult> {
  return read(await context.post('/api/auth/login', { data: { login, password }, failOnStatusCode: false }));
}

export async function me(context: APIRequestContext): Promise<LoginResult> {
  return read(await context.get('/api/auth/me', { failOnStatusCode: false }));
}

export async function logout(context: APIRequestContext): Promise<number> {
  return (await context.post('/api/auth/logout', { failOnStatusCode: false })).status();
}

/** Fails a login times times and returns every response. */
export async function failLogin(
  context: APIRequestContext,
  email: string,
  times: number,
  password = 'definitely-not-the-password',
): Promise<LoginResult[]> {
  const out: LoginResult[] = [];
  for (let i = 0; i < times; i += 1) out.push(await login(context, email, password));
  return out;
}
