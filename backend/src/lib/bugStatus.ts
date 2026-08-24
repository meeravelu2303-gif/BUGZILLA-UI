import type { BugzillaClient } from './bugzillaClient';

/**
 * Which bug statuses Bugzilla itself treats as closed.
 *
 * Read from `GET /field/bug/bug_status`, whose values carry an `is_open` flag,
 * rather than hard-coding `['RESOLVED', 'VERIFIED']`: this instance's workflow
 * is admin-editable, and a site that renames a status or adds a closed one
 * would silently defeat a hard-coded list.
 *
 * Cached process-wide because the answer changes only when an admin edits the
 * workflow, and unlike bug data it is not user-specific - every user sees the
 * same status definitions, so there is nothing to leak across sessions.
 */

const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; closed: Set<string> } | null = null;

interface StatusField {
  fields?: { values?: { name?: string; is_open?: boolean }[] }[];
}

export async function closedStatuses(client: BugzillaClient): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.closed;

  const resp = await client.get<StatusField>('/field/bug/bug_status');
  const values = resp.fields?.[0]?.values ?? [];
  const closed = new Set(values.filter((v) => v.is_open === false && v.name).map((v) => v.name as string));

  // Never cache an empty answer: if the shape ever changes, treating "no closed
  // statuses" as fact would quietly disable the reassignment guard.
  if (closed.size > 0) cache = { at: Date.now(), closed };
  return closed;
}

/** Test seam, and for when a workflow edit should take effect immediately. */
export function clearClosedStatusCache(): void {
  cache = null;
}
