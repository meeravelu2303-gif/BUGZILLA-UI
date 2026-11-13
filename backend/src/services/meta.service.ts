import type { Env } from '../config/app.config';
import { BugzillaClient, type QueryParams } from '../clients/bugzilla.client';

import { getBugSnapshot } from './bugSnapshot.service';
import { memo } from '../helpers/memo.helper';

export async function bugReporters(env: Env): Promise<Map<string, { email: string; name: string }>> {
  const snapshot = await getBugSnapshot(env);
  const value = new Map<string, { email: string; name: string }>();
  for (const row of snapshot.rows) {
    if (!row.creator || value.has(row.creator)) continue;
    value.set(row.creator, { email: row.creator, name: row.creatorName || row.creator });
  }
  return value;
}

let fieldCache: { at: number; value: unknown } | null = null;

export async function fieldDefinitions(client: BugzillaClient): Promise<unknown> {
  if (fieldCache && Date.now() - fieldCache.at < 5 * 60 * 1000) return fieldCache.value;
  const value = await client.get('/field/bug');
  fieldCache = { at: Date.now(), value };
  return value;
}

export const DIRECTORY_CACHE = 'directory';

export function memoizedDirectory(env: Env): { get<T>(path: string, params?: QueryParams): Promise<T> } {
  const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
  return {
    get: <T>(path: string, params?: QueryParams) =>
      memo<T>(DIRECTORY_CACHE, path + ' ' + JSON.stringify(params ?? {}), 5 * 60 * 1000, () =>
        client.get<T>(path, params),
      ),
  };
}
