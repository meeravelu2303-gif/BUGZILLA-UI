import type { Env } from '../config/env';
import { BugzillaClient } from './bugzillaClient';
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
}

export interface BugSnapshot {
  rows: SnapshotBug[];
  builtAt: number;
}

interface RawRow {
  id: number;
  product?: string;
  component?: string;
  status?: string;
  resolution?: string;
  is_open?: boolean;
  severity?: string;
  priority?: string;
  whiteboard?: string;
  assigned_to?: string;
  creator?: string;
  creator_detail?: { real_name?: string; name?: string };
  creation_time?: string;
  last_change_time?: string;
}

let current: BugSnapshot | null = null;
let inFlight: Promise<BugSnapshot> | null = null;
let invalidatedAt = 0;

async function fetchAll(env: Env): Promise<BugSnapshot> {
  const client = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
  const resp = await client.get<{ bugs: RawRow[] }>('/bug', {
    limit: 0,
    include_fields:
      'id,product,component,status,resolution,is_open,severity,priority,whiteboard,assigned_to,creator,creator_detail,creation_time,last_change_time',
  });
  const rows: SnapshotBug[] = (resp.bugs ?? []).map((b) => ({
    id: b.id,
    product: b.product ?? '',
    component: b.component ?? '',
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
  }));
  return { rows, builtAt: Date.now() };
}

let timer: NodeJS.Timeout | null = null;

/** One refresh at a time; concurrent callers share it. Re-arms the background timer when done. */
function refresh(env: Env): Promise<BugSnapshot> {
  if (!inFlight) {
    inFlight = fetchAll(env)
      .then((snap) => {
        current = snap;
        return snap;
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
