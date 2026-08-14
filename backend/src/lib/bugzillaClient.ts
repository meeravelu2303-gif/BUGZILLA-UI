import { AppError, mapBugzillaError } from './errors';

const UPSTREAM_TIMEOUT_MS = 15_000;

export type BugzillaCredential = { kind: 'token'; token: string } | { kind: 'api_key'; apiKey: string };

type QueryValue = string | number | boolean | undefined | null | Array<string | number>;
export type QueryParams = Record<string, QueryValue>;

interface UpstreamErrorBody {
  error?: boolean;
  code?: number;
  message?: string;
}

function buildUrl(base: string, path: string, params: QueryParams, credential: BugzillaCredential): string {
  const url = new URL(base.replace(/\/+$/, '') + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  if (credential.kind === 'token') {
    url.searchParams.set('token', credential.token);
  } else {
    url.searchParams.set('api_key', credential.apiKey);
  }
  return url.toString();
}

async function request<T>(
  base: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  credential: BugzillaCredential,
  options: { params?: QueryParams; body?: unknown } = {}
): Promise<T> {
  const url = buildUrl(base, path, options.params ?? {}, credential);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Bugzilla did not respond in time.');
    }
    throw new AppError(502, 'UPSTREAM_UNREACHABLE', 'Could not reach the Bugzilla server.');
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Bugzilla returned a response that could not be parsed.');
  }

  const body = json as UpstreamErrorBody;
  if (!response.ok || body.error === true) {
    throw mapBugzillaError(response.status, body);
  }

  return json as T;
}

export class BugzillaClient {
  constructor(private readonly baseUrl: string, private readonly credential: BugzillaCredential) {}

  get<T>(path: string, params: QueryParams = {}): Promise<T> {
    return request<T>(this.baseUrl, 'GET', path, this.credential, { params });
  }

  post<T>(path: string, body: unknown, params: QueryParams = {}): Promise<T> {
    return request<T>(this.baseUrl, 'POST', path, this.credential, { params, body });
  }

  put<T>(path: string, body: unknown, params: QueryParams = {}): Promise<T> {
    return request<T>(this.baseUrl, 'PUT', path, this.credential, { params, body });
  }
}
