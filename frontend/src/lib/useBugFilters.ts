import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BugFilters, Category, Priority, Severity } from '../types';

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
export const FACET_KEYS = ['severity', 'priority', 'category', 'product', 'component', 'status', 'tier'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
  severity: 'Severity',
  priority: 'Priority',
  category: 'Category',
  product: 'Product',
  component: 'Component',
  status: 'Status',
  tier: 'Tier',
};

/** Params the list/count/stats endpoints understand, built from the URL. */
export type BugQueryParams = Record<string, string | number | string[] | undefined>;

export interface ActiveChip {
  key: FacetKey | 'search';
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
  removeChip: (chip: ActiveChip) => void;
  clearAll: () => void;
  /** Sorting lives alongside the filters so the whole view is one URL. */
  sortBy: string;
  sortDir: 'asc' | 'desc';
  toggleSort: (key: string) => void;
  offset: number;
  setOffset: (offset: number) => void;
}

export function useBugFilters(defaults?: { sortBy?: string; sortDir?: 'asc' | 'desc' }): UseBugFilters {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<BugFilters>(
    () => ({
      severity: readAll(params, 'severity') as Severity[],
      priority: readAll(params, 'priority') as Priority[],
      category: readAll(params, 'category') as Category[],
      product: readAll(params, 'product'),
      component: readAll(params, 'component'),
      status: readAll(params, 'status'),
      tier: readAll(params, 'tier').map(Number).filter(Number.isFinite),
      search: params.get('search') ?? '',
    }),
    [params]
  );

  const sortBy = params.get('sortBy') ?? defaults?.sortBy ?? 'importance';
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

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = FACET_KEYS.flatMap((key) =>
      readAll(params, key).map((value) => ({
        key,
        value,
        label: `${FACET_LABELS[key]}: ${key === 'tier' ? `Tier ${value}` : value}`,
      }))
    );
    const search = params.get('search');
    if (search) chips.push({ key: 'search', value: search, label: `Search: ${search}` });
    return chips;
  }, [params]);

  const removeChip = useCallback(
    (chip: ActiveChip) =>
      commit((next) => {
        if (chip.key === 'search') {
          next.delete('search');
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
        next.delete('search');
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

  const queryParams = useMemo<BugQueryParams>(() => {
    const out: BugQueryParams = {};
    for (const key of FACET_KEYS) {
      const values = filters[key] as (string | number)[];
      if (values.length > 0) out[key] = values.map(String);
    }
    if (filters.search) out.search = filters.search;
    return out;
  }, [filters]);

  return {
    filters,
    queryParams,
    isFiltered: activeChips.length > 0,
    activeChips,
    toggleFacet,
    setFacet,
    setSearch,
    removeChip,
    clearAll,
    sortBy,
    sortDir,
    toggleSort,
    offset,
    setOffset,
  };
}
