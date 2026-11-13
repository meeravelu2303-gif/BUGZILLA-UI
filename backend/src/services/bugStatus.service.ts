import type { BugzillaClient } from '../clients/bugzilla.client';

const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; closed: Set<string> } | null = null;
let allCache: { at: number; all: Set<string> } | null = null;

interface StatusField {
  fields?: { values?: { name?: string; is_open?: boolean }[] }[];
}

export async function closedStatuses(client: BugzillaClient): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.closed;

  const response = await client.get<StatusField>('/field/bug/bug_status');
  const values = response.fields?.[0]?.values ?? [];
  const closed = new Set(
    values.filter((value) => value.is_open === false && value.name).map((value) => value.name as string),
  );

  if (closed.size > 0) cache = { at: Date.now(), closed };
  return closed;
}

/** Every status this instance defines, open and closed alike. */
export async function allStatuses(client: BugzillaClient): Promise<Set<string>> {
  if (allCache && Date.now() - allCache.at < TTL_MS) return allCache.all;

  const response = await client.get<StatusField>('/field/bug/bug_status');
  const values = response.fields?.[0]?.values ?? [];
  const all = new Set(values.filter((value) => value.name).map((value) => value.name as string));

  if (all.size > 0) allCache = { at: Date.now(), all };
  return all;
}

/** Narrows a requested status filter to the ones this instance defines. */
export async function narrowStatusFilter(client: BugzillaClient, requested: string[]): Promise<string[] | null> {
  if (requested.length === 0) return [];
  let known: Set<string>;
  try {
    known = await allStatuses(client);
  } catch {
    return requested;
  }
  if (known.size === 0) return requested;
  const kept = requested.filter((value) => known.has(value));
  return kept.length > 0 ? kept : null;
}

/** Test seam, and for when a workflow edit should take effect immediately. */
export function clearClosedStatusCache(): void {
  cache = null;
  allCache = null;
}
