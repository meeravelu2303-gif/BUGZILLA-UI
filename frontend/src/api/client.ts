import type { ApiErrorBody } from '../types';

export class ApiError extends Error {
  status: number;
  code: ApiErrorBody['code'];
  details?: ApiErrorBody['details'];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.status;
    this.code = body.code;
    this.details = body.details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok || (body && body.error === true)) {
    throw new ApiError(body ?? { error: true, status: res.status, code: 'INTERNAL', message: 'Unexpected error.' });
  }

  return body as T;
}

/** Fetches a file from the API as a Blob, with the server's suggested filename. */
export async function downloadFile(
  path: string,
): Promise<{ blob: Blob; filename: string | null; rows: number | null }> {
  const res = await fetch(`/api${path}`, { credentials: 'include' });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body ?? { error: true, status: res.status, code: 'INTERNAL', message: 'Download failed.' });
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
  const rowsHeader = res.headers.get('X-Export-Rows');
  return { blob: await res.blob(), filename, rows: rowsHeader === null ? null : Number(rowsHeader) };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  deleteWithBody: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'DELETE', body: JSON.stringify(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
};

/** Array values become repeated keys (?severity=Critical&severity=Major). */
export function buildQuery(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item !== '') search.append(key, String(item));
      continue;
    }
    search.set(key, String(value));
  }
  const queryString = search.toString();
  return queryString ? `?${queryString}` : '';
}
