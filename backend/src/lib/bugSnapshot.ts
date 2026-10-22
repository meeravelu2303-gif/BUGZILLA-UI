import type { Env } from '../config/env';
import { BugzillaClient } from './bugzillaClient';
import { memo } from './memo';
import {
  BUGZILLA_PRIORITIES,
  BUGZILLA_SEVERITIES,
  PRIORITY_FOR_SEVERITY,
  browsersOf,
  categoryOf,
  nextDay,
  sourceOf,
  type BugFilters,
  type Priority,
  type Severity,
} from './classification';

/**
 * One in-memory copy of every bug's summary fields, shared by every request.
 *
 * WHY. Bugzilla here runs under plain CGI: each REST call forks a Perl
 * process and recompiles Bugzilla before doing any work - ~700 ms of overhead
 * on a trivial call, 1.5-4 s to stream all 13,000 bugs. The database behind
 * it answers in milliseconds; the Perl layer is the cost. The counts and
 * breakdowns the dashboards and filter bars show used to re-fetch the whole
 * bug table through that layer on EVERY card and EVERY facet (a dashboard
 * load was 8-12 such calls), which is where the latency came from.
 *
 * WHAT. The table is read ONCE, on the service key, into memory: id, product,
 * component, status, resolution, open flag, severity, priority, whiteboard,
 * assignee, reporter and the two timestamps - about 2 MB for 13k bugs. Every
 * count and every stat is then answered from this copy in a millisecond, with
 * the caller's product scope applied in memory. It is refreshed after
 * `env.STATS_CACHE_TTL_MS` (60 s by default), and dropped immediately after any
 * write through this app, so a change a user just made is reflected in the
 * next count they see.
 *
 * WHAT NOT. Lists still come from Bugzilla (they need titles, people and
 * paging), and so do counts that filter on free text or CC, which this copy
 * does not hold - `canServeFromSnapshot` says which.
 */

export interface SnapshotBug {
  id: number;
  product: string;
  component: string;
  /** Stored sub-component value (`<name> [<component id>]`), `---` for none. */
  subcomponent: string;
  status: string;
  resolution: string;
  isOpen: boolean;
  severity: string;
  priority: string;
  whiteboard: string;
  assignedTo: string;
  creator: string;
  creatorName: string;
  creationTime: string;
  lastChangeTime: string;
  /**
   * The bug as Bugzilla's search returns it, with every field a LIST row needs
   * (rawBugSchema's required ones plus assignee/reporter details), so lists can
   * be served from this copy too - not only counts.
   */
  raw: Record<string, unknown>;
}

export interface BugSnapshot {
  rows: SnapshotBug[];
  builtAt: number;
}

interface RawRow {
  id: number;
  product?: string;
  component?: string;
  cf_subcomponent?: string;
  status?: string;
  resolution?: string;
  is_open?: boolean;
  severity?: string;
  priority?: string;
  whiteboard?: string;
  assigned_to?: string;
  creator?: string;
  creator_detail?: { real_name?: string; name?: string };
  assigned_to_detail?: unknown;
  summary?: string;
  version?: string;
  op_sys?: string;
  platform?: string;
  target_milestone?: string;
  alias?: unknown;
  cf_mantis_ref?: string;
  creation_time?: string;
  last_change_time?: string;
}

let current: BugSnapshot | null = null;
let inFlight: Promise<BugSnapshot> | null = null;
let invalidatedAt = 0;

const SNAPSHOT_FIELDS =
  'id,alias,summary,product,component,cf_subcomponent,version,op_sys,platform,target_milestone,status,resolution,is_open,severity,priority,whiteboard,assigned_to,assigned_to_detail,creator,creator_detail,cf_mantis_ref,creation_time,last_change_time';

const serviceClient = (env: Env) => new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });

async function fetchAll(env: Env): Promise<BugSnapshot> {
  const resp = await serviceClient(env).get<{ bugs: RawRow[] }>('/bug', { limit: 0, include_fields: SNAPSHOT_FIELDS });
  return { rows: (resp.bugs ?? []).map(toRow), builtAt: Date.now() };
}

function toRow(b: RawRow): SnapshotBug {
  return {
    id: b.id,
    product: b.product ?? '',
    component: b.component ?? '',
    subcomponent: b.cf_subcomponent || '---',
    status: b.status ?? '',
    resolution: b.resolution ?? '',
    isOpen: Boolean(b.is_open),
    severity: (b.severity ?? '').toLowerCase(),
    priority: b.priority ?? '',
    whiteboard: b.whiteboard ?? '',
    assignedTo: (b.assigned_to ?? '').toLowerCase(),
    creator: (b.creator ?? '').toLowerCase(),
    creatorName: b.creator_detail?.real_name || b.creator_detail?.name || b.creator || '',
    creationTime: b.creation_time ?? '',
    lastChangeTime: b.last_change_time ?? '',
    raw: b as unknown as Record<string, unknown>,
  };
}

/*
 * ------------------------------------------------------------- live patching
 *
 * When bugs change - through this app, or found by the change watcher
 * (lib/liveUpdates.ts) - only THOSE bugs are re-read and swapped into the copy,
 * one quick Bugzilla call instead of rebuilding all 13,000 (about 6 s). Every
 * screen that refreshes a moment later is then answered from the patched copy.
 *
 * A full refresh that was already in flight may have read the bugs before they
 * changed, so patches made while it runs are re-applied when it lands.
 */
const patchedAt = new Map<number, number>();
let refreshStartedAt = 0;

export async function patchBugSnapshot(env: Env, ids: number[]): Promise<void> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0 || !current) return;
  const now = Date.now();
  for (const id of unique) patchedAt.set(id, now);
  const resp = await serviceClient(env).get<{ bugs: RawRow[] }>('/bug', { id: unique, include_fields: SNAPSHOT_FIELDS });
  const fresh = new Map((resp.bugs ?? []).map((b) => [b.id, toRow(b)]));
  if (!current) return;
  const rows = current.rows.filter((r) => !unique.includes(r.id) || fresh.has(r.id)).map((r) => fresh.get(r.id) ?? r);
  for (const [id, row] of fresh) if (!current.rows.some((r) => r.id === id)) rows.push(row);
  current = { rows, builtAt: current.builtAt };
}

let timer: NodeJS.Timeout | null = null;

/** One refresh at a time; concurrent callers share it. Re-arms the background timer when done. */
function refresh(env: Env): Promise<BugSnapshot> {
  if (!inFlight) {
    refreshStartedAt = Date.now();
    const startedAt = refreshStartedAt;
    inFlight = fetchAll(env)
      .then(async (snap) => {
        current = snap;
        // Re-apply patches made while this read was running (it may predate them).
        const stale = [...patchedAt].filter(([, at]) => at >= startedAt).map(([id]) => id);
        for (const [id, at] of patchedAt) if (at < startedAt) patchedAt.delete(id);
        if (stale.length) await patchBugSnapshot(env, stale).catch(() => undefined);
        return current!;
      })
      .finally(() => {
        inFlight = null;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refresh(env).catch(() => undefined), env.STATS_CACHE_TTL_MS);
        timer.unref(); // never keeps the process alive on its own
      });
  }
  return inFlight;
}

/**
 * The snapshot to answer from.
 *
 * Once loaded, the copy refreshes ITSELF every TTL in the background, so a
 * reader is never the one who pays for the reload: the only waits are the
 * very first read after the server starts, and the first read after a write
 * (`invalidateBugSnapshot`), when serving the old copy would hide the change
 * the user just made. If the background timer has somehow lapsed (more than
 * two TTLs without a refresh) the reader waits for a fresh copy rather than
 * trusting an old one.
 */
export async function getBugSnapshot(env: Env): Promise<BugSnapshot> {
  const ttl = env.STATS_CACHE_TTL_MS;
  if (current && current.builtAt > invalidatedAt) {
    const age = Date.now() - current.builtAt;
    if (age < 2 * ttl) {
      if (age >= ttl) void refresh(env).catch(() => undefined); // timer lapsed: refresh behind the reader
      return current;
    }
  }
  return refresh(env);
}

/** Called after any write made through this app, so the next read is exact. */
export function invalidateBugSnapshot(): void {
  invalidatedAt = Date.now();
}

/** The filters this copy cannot evaluate (free text needs titles; CC needs the CC lists). */
export function canServeFromSnapshot(filters: BugFilters): boolean {
  return !filters.search?.trim() && !filters.cc;
}

const lower = (s: string) => s.toLowerCase();

/**
 * The caller's product scope, exactly as `scopeToAccessibleProducts` applies
 * it to a Bugzilla query: an explicit product filter wins; otherwise a
 * non-admin sees only the products they hold a group for; an admin (`null`)
 * sees everything.
 */
export function inScope(row: SnapshotBug, accessible: string[] | null, filters: BugFilters): boolean {
  if (filters.product?.length) return filters.product.some((p) => lower(p) === lower(row.product));
  if (accessible === null) return true;
  return accessible.some((p) => lower(p) === lower(row.product));
}

/**
 * Does this bug match the filters? Mirrors `toBugzillaQuery` term for term,
 * so a count served from memory agrees with the list Bugzilla returns for
 * the same filters.
 */
export function matchesFilters(row: SnapshotBug, f: BugFilters): boolean {
  // severity bands pin a paired priority set; priority filters intersect it
  const bands = (f.severity ?? []).filter((s) => s !== 'Unclassified') as Exclude<Severity, 'Unclassified'>[];
  let prioritySet: Set<string> | null = null;
  if (bands.length > 0) {
    const sevSet = new Set(bands.flatMap((b) => BUGZILLA_SEVERITIES[b]));
    if (!sevSet.has(row.severity)) return false;
    prioritySet = new Set(bands.flatMap((b) => BUGZILLA_PRIORITIES[PRIORITY_FOR_SEVERITY[b] as Exclude<Priority, 'Unclassified'>]));
  }
  const prios = (f.priority ?? []).filter((p) => p !== 'Unclassified') as Exclude<Priority, 'Unclassified'>[];
  if (prios.length > 0) {
    const wanted = new Set(prios.flatMap((p) => BUGZILLA_PRIORITIES[p]));
    prioritySet = prioritySet ? new Set([...prioritySet].filter((p) => wanted.has(p))) : wanted;
  }
  if (prioritySet && !prioritySet.has(row.priority)) return false;

  if (f.component?.length && !f.component.some((c) => lower(c) === lower(row.component))) return false;
  if (f.subcomponent?.length && !f.subcomponent.includes(row.subcomponent)) return false;
  if (f.status?.length && !f.status.includes(row.status)) return false;
  if (f.resolution?.length) {
    const wanted = f.resolution.map((r) => (r === '' || r === 'Unresolved' ? '' : r));
    if (!wanted.includes(row.resolution)) return false;
  }
  if (f.assignedTo && lower(f.assignedTo) !== row.assignedTo) return false;
  if (f.creator && lower(f.creator) !== row.creator) return false;

  // the whiteboard-backed facets
  if (f.category?.length) {
    const cat = categoryOf(row.whiteboard, undefined);
    if (!f.category.includes(cat)) return false;
  }
  if (f.browser?.length) {
    const seen = browsersOf(row.whiteboard);
    if (!f.browser.some((b) => seen.includes(b))) return false;
  }
  const sources = [...new Set(f.source ?? [])];
  if (sources.length === 1 && sourceOf(row.whiteboard, undefined) !== sources[0]) return false;

  if (f.from || f.to) {
    const stamp = (f.dateField === 'updated' ? row.lastChangeTime : row.creationTime).slice(0, 10);
    let [from, to] = [f.from, f.to];
    if (from && to && from > to) [from, to] = [to, from];
    if (from && stamp < from) return false;
    if (to && stamp >= nextDay(to)) return false;
  }

  const deleted = f.deleted ?? 'exclude';
  if (deleted === 'only' && row.resolution !== 'DELETED') return false;
  if (deleted === 'exclude' && row.resolution === 'DELETED') return false;
  return true;
}

/*
 * ------------------------------------------------------------------ sorting
 *
 * The list's sort columns, evaluated on the snapshot exactly as Bugzilla's own
 * ORDER BY does it (routes/bugs.ts SORT_FIELDS): select fields - severity,
 * priority, status - by their per-value `sortkey`, not alphabetically; text
 * case-insensitively; and bug id ascending as the final tiebreaker, so pages
 * never shuffle. An unknown sort returns null and the caller asks Bugzilla.
 */
type Key = (r: SnapshotBug) => number | string;

async function selectSortKeys(env: Env): Promise<Map<string, Map<string, number>>> {
  return memo('snapshot-sortkeys', 'all', 10 * 60 * 1000, async () => {
    const resp = await new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY }).get<{
      fields: { name: string; values?: { name: string | null; sort_key?: number; sortkey?: number }[] }[];
    }>('/field/bug', { names: ['bug_severity', 'priority', 'bug_status'] });
    return new Map(
      (resp.fields ?? []).map((f) => [
        f.name,
        // Bugzilla lists one unnamed status (the "no status yet" slot); skip it.
        new Map((f.values ?? []).filter((v): v is { name: string; sort_key?: number; sortkey?: number } => typeof v.name === 'string').map((v) => [v.name.toLowerCase(), v.sort_key ?? v.sortkey ?? 0])),
      ])
    );
  });
}

export async function snapshotSorter(
  env: Env,
  sortBy: string,
  sortDir: 'asc' | 'desc'
): Promise<((a: SnapshotBug, b: SnapshotBug) => number) | null> {
  const text = (v: unknown) => String(v ?? '').toLowerCase();
  let keys: Key[];
  switch (sortBy) {
    case 'id': keys = [(r) => r.id]; break;
    case 'creation_time': keys = [(r) => r.creationTime]; break;
    case 'last_change_time': keys = [(r) => r.lastChangeTime]; break;
    case 'summary': keys = [(r) => text(r.raw.summary)]; break;
    case 'product': keys = [(r) => text(r.product)]; break;
    case 'component': keys = [(r) => text(r.component)]; break;
    case 'assigned_to': keys = [(r) => r.assignedTo]; break;
    case 'status_whiteboard': keys = [(r) => text(r.whiteboard)]; break;
    case 'severity':
    case 'priority':
    case 'status':
    case 'importance': {
      const sk = await selectSortKeys(env).catch(() => null);
      if (!sk) return null;
      const by = (field: string, value: (r: SnapshotBug) => string): Key => (r) => sk.get(field)?.get(value(r).toLowerCase()) ?? 9999;
      const sev = by('bug_severity', (r) => r.severity);
      const pri = by('priority', (r) => r.priority);
      keys = sortBy === 'severity' ? [sev] : sortBy === 'priority' ? [pri] : sortBy === 'status' ? [by('bug_status', (r) => r.status)] : [sev, pri];
      break;
    }
    default:
      return null;
  }
  const dir = sortDir === 'desc' ? -1 : 1;
  return (a, b) => {
    for (const key of keys) {
      const x = key(a);
      const y = key(b);
      if (x < y) return -dir;
      if (x > y) return dir;
    }
    return a.id - b.id;
  };
}
