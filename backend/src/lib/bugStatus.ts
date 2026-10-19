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
let allCache: { at: number; all: Set<string> } | null = null;

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

/**
 * Every status this instance defines, open and closed alike.
 *
 * Needed because Bugzilla SILENTLY DISCARDS a `bug_status` value it does not
 * recognise instead of matching nothing. A search for a status that does not
 * exist therefore comes back as "every bug you can see" - and a count built on
 * it reads as a real figure rather than an error. That is how a dashboard tile
 * for REOPENED reported 971 on an instance holding zero reopened bugs.
 *
 * Knowing the real set lets a caller answer such a query honestly - nothing
 * matches - rather than forwarding it and trusting the result.
 */
export async function allStatuses(client: BugzillaClient): Promise<Set<string>> {
  if (allCache && Date.now() - allCache.at < TTL_MS) return allCache.all;

  const resp = await client.get<StatusField>('/field/bug/bug_status');
  const values = resp.fields?.[0]?.values ?? [];
  const all = new Set(values.filter((v) => v.name).map((v) => v.name as string));

  // Same reasoning as above: an empty answer is a shape change, not a fact.
  if (all.size > 0) allCache = { at: Date.now(), all };
  return all;
}

/**
 * Narrows a requested status filter to the ones this instance defines.
 *
 * Returns `null` when every requested status is unknown, which the caller must
 * treat as "no bug can match" - NOT as "no filter". Dropping the condition is
 * exactly the failure this exists to prevent.
 *
 * Statuses OR together, so an unknown value among known ones simply contributes
 * nothing and is removed.
 */
export async function narrowStatusFilter(
  client: BugzillaClient,
  requested: string[]
): Promise<string[] | null> {
  if (requested.length === 0) return [];
  let known: Set<string>;
  try {
    known = await allStatuses(client);
  } catch {
    // Workflow unreadable: forward the filter unchanged rather than refusing
    // to answer. The old behaviour, but only as a fallback.
    return requested;
  }
  if (known.size === 0) return requested;
  const kept = requested.filter((s) => known.has(s));
  return kept.length > 0 ? kept : null;
}

/** Test seam, and for when a workflow edit should take effect immediately. */
export function clearClosedStatusCache(): void {
  cache = null;
  allCache = null;
}
