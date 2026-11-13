import { useQueries } from '@tanstack/react-query';
import { api, buildQuery } from '../api/client';
import type { BugStats } from '../types';
import type { BugQueryParams } from './useBugFilters';

/** Per-value counts for the filter bar, under the filters that are actually applied. */
export const COUNTED_FACETS = [
  'product',
  'severity',
  'priority',
  'category',
  'component',
  'subcomponent',
  'browser',
  'source',
  'status',
  'resolution',
] as const;
export type CountedFacet = (typeof COUNTED_FACETS)[number];

export interface FacetStats {
  all?: BugStats;
  for: (facet: CountedFacet) => BugStats | undefined;
  isLoading: boolean;
}

export function useFacetStats(base: BugQueryParams, queryParams: BugQueryParams): FacetStats {
  const applied: BugQueryParams = { ...base, ...queryParams };

  const selected = COUNTED_FACETS.filter((facet) => {
    const value = applied[facet];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });

  const specs: { facet: CountedFacet | null; params: BugQueryParams }[] = [
    { facet: null, params: applied },
    ...selected.map((facet) => {
      const params = { ...applied };
      delete params[facet];
      return { facet, params };
    }),
  ];

  const results = useQueries({
    queries: specs.map((spec) => ({
      queryKey: ['bugs', 'stats', spec.params],
      queryFn: () => api.get<BugStats>(`/bugs/stats${buildQuery(spec.params)}`),
      staleTime: 30 * 1000,
    })),
  });

  const byFacet = new Map<CountedFacet | null, BugStats | undefined>();
  specs.forEach((spec, i) => byFacet.set(spec.facet, results[i]?.data));

  return {
    all: byFacet.get(null),
    for: (facet) => byFacet.get(facet) ?? byFacet.get(null),
    isLoading: results.some((result) => result.isLoading),
  };
}
