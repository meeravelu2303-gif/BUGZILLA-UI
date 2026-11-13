import { useCallback, useEffect, useMemo } from 'react';
import { subcomponentName } from './utils';
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useMe } from '../api/hooks';
import type { BugFilters, Category, Priority, Severity } from '../types';
import { describeRange, type DateField } from './dateRange';
import { rememberListView } from './lastListView';
import { saveFilters, savedFilters } from './savedFilters';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The single filter contract for every list view. */
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

/** Resolution values offered in the UI. */
export const RESOLUTION_VALUES = ['Unresolved', 'FIXED', 'INVALID', 'DUPLICATE', 'WONTFIX', 'WORKSFORME'] as const;

/** Params the list/count/stats endpoints understand, built from the URL. */
export type BugQueryParams = Record<string, string | number | string[] | undefined>;

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
  queryParams: BugQueryParams;
  isFiltered: boolean;
  activeChips: ActiveChip[];
  toggleFacet: (key: FacetKey, value: string) => void;
  setFacet: (key: FacetKey, values: string[]) => void;
  setSearch: (value: string) => void;
  setDateRange: (range: { field: DateField; from?: string; to?: string }) => void;
  removeChip: (chip: ActiveChip) => void;
  clearAll: () => void;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  toggleSort: (key: string) => void;
  offset: number;
  setOffset: (offset: number) => void;
  showDeleted: boolean;
  setShowDeleted: (on: boolean) => void;
}

export function useBugFilters(defaults?: { sortBy?: string; sortDir?: 'asc' | 'desc' }): UseBugFilters {
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  useEffect(() => {
    rememberListView(location.pathname, location.search);
  }, [location.pathname, location.search]);

  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const user = useMe().data?.user.email;
  useEffect(() => {
    if (!user) return;
    if (!location.search && navigationType !== 'REPLACE') {
      const saved = savedFilters(user, location.pathname);
      if (saved) {
        navigate({ pathname: location.pathname, search: `?${saved}` }, { replace: true });
        return;
      }
    }
    saveFilters(user, location.pathname, location.search);
  }, [user, location.pathname, location.search, navigationType, navigate]);

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
    [params],
  );

  const sortBy = params.get('sortBy') ?? defaults?.sortBy ?? 'id';
  const sortDir = (params.get('sortDir') as 'asc' | 'desc') ?? defaults?.sortDir ?? 'asc';
  const offset = Number(params.get('offset') ?? 0);

  const commit = useCallback(
    (mutate: (next: URLSearchParams) => void, options?: { keepOffset?: boolean }) => {
      const next = new URLSearchParams(params);
      mutate(next);
      if (!options?.keepOffset) next.delete('offset');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setFacet = useCallback(
    (key: FacetKey, values: string[]) =>
      commit((next) => {
        next.delete(key);
        for (const value of values) next.append(key, value);
      }),
    [commit],
  );

  const toggleFacet = useCallback(
    (key: FacetKey, value: string) =>
      commit((next) => {
        const current = next.getAll(key);
        next.delete(key);
        const updated = current.includes(value)
          ? current.filter((existing) => existing !== value)
          : [...current, value];
        for (const selectedValue of updated) next.append(key, selectedValue);
      }),
    [commit],
  );

  const setSearch = useCallback(
    (value: string) =>
      commit((next) => {
        if (value) next.set('search', value);
        else next.delete('search');
      }),
    [commit],
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
    [commit],
  );

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = FACET_KEYS.flatMap((key) =>
      readAll(params, key).map((value) => ({
        key,
        value,
        label: `${FACET_LABELS[key]}: ${key === 'subcomponent' ? subcomponentName(value) || 'None' : value}`,
      })),
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
      chips.unshift({
        key: 'date',
        value: `${filters.from}..${filters.to}`,
        label: `${what}: ${describeRange({ from: filters.from || undefined, to: filters.to || undefined })}`,
      });
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
        const remaining = next.getAll(chip.key).filter((value) => value !== chip.value);
        next.delete(chip.key);
        for (const remainingValue of remaining) next.append(chip.key, remainingValue);
      }),
    [commit],
  );

  const clearAll = useCallback(
    () =>
      commit((next) => {
        for (const key of FACET_KEYS) next.delete(key);
        for (const k of ['search', 'dateField', 'from', 'to', 'urgent', ...PERSON_KEYS]) next.delete(k);
      }),
    [commit],
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
        { keepOffset: false },
      ),
    [commit, sortBy, sortDir],
  );

  const setOffset = useCallback(
    (value: number) =>
      commit(
        (next) => {
          if (value > 0) next.set('offset', String(value));
          else next.delete('offset');
        },
        { keepOffset: true },
      ),
    [commit],
  );

  const showDeleted = params.get('deleted') === 'only';

  const assignmentParam = params.get('assignment');
  const assignment = assignmentParam === 'picked' || assignmentParam === 'queued' ? assignmentParam : undefined;
  const setShowDeleted = useCallback(
    (on: boolean) =>
      commit((next) => {
        if (on) next.set('deleted', 'only');
        else next.delete('deleted');
      }),
    [commit],
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
