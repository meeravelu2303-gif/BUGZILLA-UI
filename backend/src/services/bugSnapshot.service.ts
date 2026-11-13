import type { Env } from '../config/app.config';
import { BugzillaClient } from '../clients/bugzilla.client';
import { memo } from '../helpers/memo.helper';
import {
  BUGZILLA_PRIORITIES,
  BUGZILLA_SEVERITIES,
  browsersOf,
  categoryOf,
  isUrgent,
  nextDay,
  sourceOf,
  type BugFilters,
  type Priority,
  type Severity,
} from './classification.service';

/** One in-memory copy of every bug's summary fields, shared by every request. */
export interface SnapshotBug {
  id: number;
  product: string;
  component: string;
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

const serviceClient = (env: Env) =>
  new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });

async function fetchAll(env: Env): Promise<BugSnapshot> {
  const response = await serviceClient(env).get<{ bugs: RawRow[] }>('/bug', {
    limit: 0,
    include_fields: SNAPSHOT_FIELDS,
  });
  return { rows: (response.bugs ?? []).map(toRow), builtAt: Date.now() };
}

function toRow(row: RawRow): SnapshotBug {
  return {
    id: row.id,
    product: row.product ?? '',
    component: row.component ?? '',
    subcomponent: row.cf_subcomponent || '---',
    status: row.status ?? '',
    resolution: row.resolution ?? '',
    isOpen: Boolean(row.is_open),
    severity: (row.severity ?? '').toLowerCase(),
    priority: row.priority ?? '',
    whiteboard: row.whiteboard ?? '',
    assignedTo: (row.assigned_to ?? '').toLowerCase(),
    creator: (row.creator ?? '').toLowerCase(),
    creatorName: row.creator_detail?.real_name || row.creator_detail?.name || row.creator || '',
    creationTime: row.creation_time ?? '',
    lastChangeTime: row.last_change_time ?? '',
    raw: row as unknown as Record<string, unknown>,
  };
}

const patchedAt = new Map<number, number>();
let refreshStartedAt = 0;

export async function patchBugSnapshot(env: Env, ids: number[]): Promise<void> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0 || !current) return;
  const now = Date.now();
  for (const id of unique) patchedAt.set(id, now);
  const response = await serviceClient(env).get<{ bugs: RawRow[] }>('/bug', {
    id: unique,
    include_fields: SNAPSHOT_FIELDS,
  });
  const fresh = new Map((response.bugs ?? []).map((bug) => [bug.id, toRow(bug)]));
  if (!current) return;
  const rows = current.rows
    .filter((row) => !unique.includes(row.id) || fresh.has(row.id))
    .map((row) => fresh.get(row.id) ?? row);
  for (const [id, row] of fresh) if (!current.rows.some((existing) => existing.id === id)) rows.push(row);
  current = { rows, builtAt: current.builtAt };
}

let timer: NodeJS.Timeout | null = null;

function refresh(env: Env): Promise<BugSnapshot> {
  if (!inFlight) {
    refreshStartedAt = Date.now();
    const startedAt = refreshStartedAt;
    inFlight = fetchAll(env)
      .then(async (snapshot) => {
        current = snapshot;
        const stale = [...patchedAt].filter(([, at]) => at >= startedAt).map(([id]) => id);
        for (const [id, at] of patchedAt) if (at < startedAt) patchedAt.delete(id);
        if (stale.length) await patchBugSnapshot(env, stale).catch(() => undefined);
        return current!;
      })
      .finally(() => {
        inFlight = null;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refresh(env).catch(() => undefined), env.STATS_CACHE_TTL_MS);
        timer.unref();
      });
  }
  return inFlight;
}

/** The snapshot to answer from. */
export async function getBugSnapshot(env: Env): Promise<BugSnapshot> {
  const ttl = env.STATS_CACHE_TTL_MS;
  if (current && current.builtAt > invalidatedAt) {
    const age = Date.now() - current.builtAt;
    if (age < 2 * ttl) {
      if (age >= ttl) void refresh(env).catch(() => undefined);
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

const lower = (value: string) => value.toLowerCase();

/** The caller's product scope, exactly as scopeToAccessibleProducts applies it to a Bugzilla query: an. */
export function inScope(row: SnapshotBug, accessible: string[] | null, filters: BugFilters): boolean {
  if (filters.product?.length) return filters.product.some((product) => lower(product) === lower(row.product));
  if (accessible === null) return true;
  return accessible.some((value) => lower(value) === lower(row.product));
}

/** Does this bug match the filters? */
export function matchesFilters(row: SnapshotBug, filters: BugFilters): boolean {
  const bands = (filters.severity ?? []).filter((severity) => severity !== 'Unclassified') as Exclude<
    Severity,
    'Unclassified'
  >[];
  if (bands.length > 0 && !new Set(bands.flatMap((band) => BUGZILLA_SEVERITIES[band])).has(row.severity)) return false;
  const priorities = (filters.priority ?? []).filter((priority) => priority !== 'Unclassified') as Exclude<
    Priority,
    'Unclassified'
  >[];
  if (
    priorities.length > 0 &&
    !new Set(priorities.flatMap((priority) => BUGZILLA_PRIORITIES[priority])).has(row.priority)
  )
    return false;

  if (filters.component?.length && !filters.component.some((component) => lower(component) === lower(row.component)))
    return false;
  if (filters.subcomponent?.length && !filters.subcomponent.includes(row.subcomponent)) return false;
  if (filters.status?.length && !filters.status.includes(row.status)) return false;
  if (filters.resolution?.length) {
    const wanted = filters.resolution.map((resolution) =>
      resolution === '' || resolution === 'Unresolved' ? '' : resolution,
    );
    if (!wanted.includes(row.resolution)) return false;
  }
  if (filters.assignedTo && lower(filters.assignedTo) !== row.assignedTo) return false;
  if (filters.creator && lower(filters.creator) !== row.creator) return false;

  if (filters.category?.length) {
    const cat = categoryOf(row.whiteboard, undefined);
    if (!filters.category.includes(cat)) return false;
  }
  if (filters.browser?.length) {
    const seen = browsersOf(row.whiteboard);
    if (!filters.browser.some((browser) => seen.includes(browser))) return false;
  }
  const sources = [...new Set(filters.source ?? [])];
  if (sources.length === 1 && sourceOf(row.whiteboard, undefined) !== sources[0]) return false;

  if (filters.from || filters.to) {
    const stamp = (filters.dateField === 'updated' ? row.lastChangeTime : row.creationTime).slice(0, 10);
    let [from, to] = [filters.from, filters.to];
    if (from && to && from > to) [from, to] = [to, from];
    if (from && stamp < from) return false;
    if (to && stamp >= nextDay(to)) return false;
  }

  if (filters.urgent && !isUrgent(row.severity, row.priority)) return false;

  const deleted = filters.deleted ?? 'exclude';
  if (deleted === 'only' && row.resolution !== 'DELETED') return false;
  if (deleted === 'exclude' && row.resolution === 'DELETED') return false;
  return true;
}

type Key = (bug: SnapshotBug) => number | string;

async function selectSortKeys(env: Env): Promise<Map<string, Map<string, number>>> {
  return memo('snapshot-sortkeys', 'all', 10 * 60 * 1000, async () => {
    const response = await new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY }).get<{
      fields: { name: string; values?: { name: string | null; sort_key?: number; sortkey?: number }[] }[];
    }>('/field/bug', { names: ['bug_severity', 'priority', 'bug_status'] });
    return new Map(
      (response.fields ?? []).map((field) => [
        field.name,
        new Map(
          (field.values ?? [])
            .filter(
              (value): value is { name: string; sort_key?: number; sortkey?: number } => typeof value.name === 'string',
            )
            .map((value) => [value.name.toLowerCase(), value.sort_key ?? value.sortkey ?? 0]),
        ),
      ]),
    );
  });
}

export async function snapshotSorter(
  env: Env,
  sortBy: string,
  sortDir: 'asc' | 'desc',
): Promise<((left: SnapshotBug, right: SnapshotBug) => number) | null> {
  const text = (value: unknown) => String(value ?? '').toLowerCase();
  let keys: Key[];
  switch (sortBy) {
    case 'id':
      keys = [(bug) => bug.id];
      break;
    case 'creation_time':
      keys = [(bug) => bug.creationTime];
      break;
    case 'last_change_time':
      keys = [(bug) => bug.lastChangeTime];
      break;
    case 'summary':
      keys = [(bug) => text(bug.raw.summary)];
      break;
    case 'product':
      keys = [(bug) => text(bug.product)];
      break;
    case 'component':
      keys = [(bug) => text(bug.component)];
      break;
    case 'assigned_to':
      keys = [(bug) => bug.assignedTo];
      break;
    case 'status_whiteboard':
      keys = [(bug) => text(bug.whiteboard)];
      break;
    case 'severity':
    case 'priority':
    case 'status':
    case 'importance': {
      const sortKeys = await selectSortKeys(env).catch(() => null);
      if (!sortKeys) return null;
      const by =
        (field: string, value: (bug: SnapshotBug) => string): Key =>
        (bug) =>
          sortKeys.get(field)?.get(value(bug).toLowerCase()) ?? 9999;
      const sev = by('bug_severity', (bug) => bug.severity);
      const pri = by('priority', (bug) => bug.priority);
      keys =
        sortBy === 'severity'
          ? [sev]
          : sortBy === 'priority'
            ? [pri]
            : sortBy === 'status'
              ? [by('bug_status', (bug) => bug.status)]
              : [sev, pri];
      break;
    }
    default:
      return null;
  }
  const dir = sortDir === 'desc' ? -1 : 1;
  return (left, right) => {
    for (const key of keys) {
      const x = key(left);
      const y = key(right);
      if (x < y) return -dir;
      if (x > y) return dir;
    }
    return left.id - right.id;
  };
}
