import { useCallback, useEffect, useMemo } from 'react';
import { subcomponentName } from './utils';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { BugFilters, Category, Priority, Severity } from '../types';
import { describeRange, type DateField } from './dateRange';
import { rememberListView } from './lastListView';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The single filter contract for every list view.
 *
 * State lives in the URL, not component state, so a filtered view is
 * shareable, survives reload, and works with back/forward. Multi-select is
 * expressed as a repeated key (`?severity=Critical&severity=Major`), which is
 * exactly what the backend's Zod schema accepts and what Bugzilla ORs together.
 *
 * BugList, MyBugs and AdvancedSearch all read from here. A second filter
 * implementation would inevitably drift from this one and from the API.
 */

/** Array-valued facets. Everything else in BugFilters is scalar. */
export const FACET_KEYS = [
  'severity',
  'priority',
  'category',
  'browser',
  'source',
  'product',
  'component',
  'subcomponent',
  'status',
  'resolution',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
  severity: 'Severity',
  priority: 'Priority',
  category: 'Category',
  browser: 'Browser',
  source: 'Source',
  product: 'Product',
  component: 'Component',
  subcomponent: 'Sub-component',
  status: 'Status',
  resolution: 'Resolution',
};

/**
 * Resolution values offered in the UI.
 *
 * Status cannot answer "what did we actually fix?" — FIXED, INVALID and DUPLICATE are all
 * RESOLVED, and on this product they mean very different things: a genuine fix, a finding that
 * was never a defect, and a re-filed copy of one. `Unresolved` is Bugzilla's `---`, translated
 * server-side so the sentinel never reaches the URL.
 */
export const RESOLUTION_VALUES = [
  'Unresolved',
  'FIXED',
  'INVALID',
  'DUPLICATE',
  'WONTFIX',
  'WORKSFORME',
] as const;

/** Params the list/count/stats endpoints understand, built from the URL. */
export type BugQueryParams = Record<string, string | number | string[] | undefined>;

/**
 * People filters arriving from links (the dashboards' "Open full list" and
 * stat cards). Single-valued and passed straight to the API's assignee /
 * reporter filters; shown as chips so a filtered list never looks like the
 * whole one.
 */
const PERSON_KEYS = ['assignedTo', 'creator'] as const;
type PersonKey = (typeof PERSON_KEYS)[number];
const PERSON_LABELS: Record<PersonKey, string> = { assignedTo: 'Assigned to', creator: 'Reported by' };

export interface ActiveChip {
  key: FacetKey | PersonKey | 'search' | 'date' | 'urgent';
  value: string;
  label: string;
}

function readAll(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).filter(Boolean);
}

export interface UseBugFilters {
  filters: BugFilters;
  /** Non-pagination params to send to the API. */
  queryParams: BugQueryParams;
  /** True when anything is narrowing the result set. */
  isFiltered: boolean;
  activeChips: ActiveChip[];
  toggleFacet: (key: FacetKey, value: string) => void;
  setFacet: (key: FacetKey, values: string[]) => void;
  setSearch: (value: string) => void;
  /** Sets (or, with no from/to, clears) the date range. */
  setDateRange: (range: { field: DateField; from?: string; to?: string }) => void;
  removeChip: (chip: ActiveChip) => void;
  clearAll: () => void;
  /** Sorting lives alongside the filters so the whole view is one URL. */
  sortBy: string;
  sortDir: 'asc' | 'desc';
  toggleSort: (key: string) => void;
  offset: number;
  setOffset: (offset: number) => void;
  /** The testers' "Deleted bugs" view (`?deleted=only`). */
  showDeleted: boolean;
  setShowDeleted: (on: boolean) => void;
}

export function useBugFilters(defaults?: { sortBy?: string; sortDir?: 'asc' | 'desc' }): UseBugFilters {
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  /*
   * Record where the reader is, so a bug's "Back to bugs" returns to this exact view rather
   * than a bare `/bugs`. Every list view already routes its filters, sort and pagination
   * through this hook, so recording here covers BugList, MyBugs and AdvancedSearch at once and
   * cannot fall out of step with them.
   */
  useEffect(() => {
    rememberListView(location.pathname, location.search);
  }, [location.pathname, location.search]);

  const filters = useMemo<BugFilters>(
    () => ({
      severity: readAll(params, 'severity') as Severity[],
      priority: readAll(params, 'priority') as Priority[],
      category: readAll(params, 'category') as Category[],
      browser: readAll(params, 'browser'),
      source: readAll(params, 'source'),
      product: readAll(params, 'product'),
      component: readAll(params, 'component'),
      subcomponent: readAll(params, 'subcomponent'),
      status: readAll(params, 'status'),
      resolution: readAll(params, 'resolution'),
      search: params.get('search') ?? '',
      dateField: params.get('dateField') === 'updated' ? 'updated' : 'created',
      from: DAY.test(params.get('from') ?? '') ? params.get('from')! : '',
      to: DAY.test(params.get('to') ?? '') ? params.get('to')! : '',
    }),
    [params]
  );

  // Default: by bug id ascending (KPA-001, 002, 003…). A stable, sequential order rather than
  // "importance", which interleaves ids and reads as scrambled.
  const sortBy = params.get('sortBy') ?? defaults?.sortBy ?? 'id';
  const sortDir = (params.get('sortDir') as 'asc' | 'desc') ?? defaults?.sortDir ?? 'asc';
  const offset = Number(params.get('offset') ?? 0);

  /**
   * Any change to a filter resets pagination: staying on page 7 of a result set
   * that just shrank to two pages shows an empty table and looks like a bug.
   */
  const commit = useCallback(
    (mutate: (next: URLSearchParams) => void, opts?: { keepOffset?: boolean }) => {
      const next = new URLSearchParams(params);
      mutate(next);
      if (!opts?.keepOffset) next.delete('offset');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const setFacet = useCallback(
    (key: FacetKey, values: string[]) =>
      commit((next) => {
        next.delete(key);
        for (const v of values) next.append(key, v);
      }),
    [commit]
  );

  const toggleFacet = useCallback(
    (key: FacetKey, value: string) =>
      commit((next) => {
        const current = next.getAll(key);
        next.delete(key);
        const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        for (const v of updated) next.append(key, v);
      }),
    [commit]
  );

  const setSearch = useCallback(
    (value: string) =>
      commit((next) => {
        if (value) next.set('search', value);
        else next.delete('search');
      }),
    [commit]
  );

  const setDateRange = useCallback(
    ({ field, from, to }: { field: DateField; from?: string; to?: string }) =>
      commit((next) => {
        for (const k of ['dateField', 'from', 'to']) next.delete(k);
        if (!from && !to) return;
        if (field === 'updated') next.set('dateField', 'updated');
        if (from) next.set('from', from);
        if (to) next.set('to', to);
      }),
    [commit]
  );

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = FACET_KEYS.flatMap((key) =>
      readAll(params, key).map((value) => ({
        key,
        value,
        // Sub-components travel as stored values (`Login [42]`); the chip shows the name.
        label: `${FACET_LABELS[key]}: ${key === 'subcomponent' ? subcomponentName(value) || 'None' : value}`,
      }))
    );
    for (const key of PERSON_KEYS) {
      const who = params.get(key);
      if (who) chips.push({ key, value: who, label: `${PERSON_LABELS[key]}: ${who}` });
    }
    const search = params.get('search');
    if (search) chips.push({ key: 'search', value: search, label: `Search: ${search}` });
    if (params.get('urgent') === '1') chips.push({ key: 'urgent', value: '1', label: 'Top priority: Critical or P0' });
    if (filters.from || filters.to) {
      const what = filters.dateField === 'updated' ? 'Updated' : 'Created';
      chips.unshift({ key: 'date', value: `${filters.from}..${filters.to}`, label: `${what}: ${describeRange({ from: filters.from || undefined, to: filters.to || undefined })}` });
    }
    return chips;
  }, [params, filters.from, filters.to, filters.dateField]);

  const removeChip = useCallback(
    (chip: ActiveChip) =>
      commit((next) => {
        if (chip.key === 'search') {
          next.delete('search');
          return;
        }
        if (chip.key === 'date') {
          for (const k of ['dateField', 'from', 'to']) next.delete(k);
          return;
        }
        const remaining = next.getAll(chip.key).filter((v) => v !== chip.value);
        next.delete(chip.key);
        for (const v of remaining) next.append(chip.key, v);
      }),
    [commit]
  );

  const clearAll = useCallback(
    () =>
      commit((next) => {
        for (const key of FACET_KEYS) next.delete(key);
        for (const k of ['search', 'dateField', 'from', 'to', 'urgent', ...PERSON_KEYS]) next.delete(k);
      }),
    [commit]
  );

  const toggleSort = useCallback(
    (key: string) =>
      commit(
        (next) => {
          if (sortBy === key) {
            next.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
          } else {
            next.set('sortBy', key);
            next.set('sortDir', 'asc');
          }
        },
        { keepOffset: false }
      ),
    [commit, sortBy, sortDir]
  );

  const setOffset = useCallback(
    (value: number) =>
      commit(
        (next) => {
          if (value > 0) next.set('offset', String(value));
          else next.delete('offset');
        },
        { keepOffset: true }
      ),
    [commit]
  );

  const showDeleted = params.get('deleted') === 'only';

  /*
   * `?assignment=picked|queued` - who owns the bug, in the sense the dashboard
   * tiles use. Passed straight through to the API, which resolves it against
   * each component's default owner; there is no Bugzilla search term for it.
   */
  const assignmentParam = params.get('assignment');
  const assignment = assignmentParam === 'picked' || assignmentParam === 'queued' ? assignmentParam : undefined;
  const setShowDeleted = useCallback(
    (on: boolean) =>
      commit((next) => {
        if (on) next.set('deleted', 'only');
        else next.delete('deleted');
      }),
    [commit]
  );

  const queryParams = useMemo<BugQueryParams>(() => {
    const out: BugQueryParams = {};
    for (const key of FACET_KEYS) {
      const values = filters[key] as (string | number)[];
      if (values.length > 0) out[key] = values.map(String);
    }
    if (filters.search) out.search = filters.search;
    if (filters.from || filters.to) {
      if (filters.dateField === 'updated') out.dateField = 'updated';
      if (filters.from) out.from = filters.from;
      if (filters.to) out.to = filters.to;
    }
    if (showDeleted) out.deleted = 'only';
    if (assignment) out.assignment = assignment;
    // Critical severity OR P0 priority - from the dashboards' Top priority tiles.
    if (params.get('urgent') === '1') out.urgent = '1';
    for (const key of PERSON_KEYS) {
      const who = params.get(key)?.trim();
      if (who) out[key] = who;
    }
    return out;
  }, [filters, showDeleted, assignment, params]);

  return {
    filters,
    queryParams,
    isFiltered: activeChips.length > 0,
    activeChips,
    toggleFacet,
    setFacet,
    setSearch,
    setDateRange,
    removeChip,
    clearAll,
    sortBy,
    sortDir,
    toggleSort,
    offset,
    setOffset,
    showDeleted,
    setShowDeleted,
  };
}
