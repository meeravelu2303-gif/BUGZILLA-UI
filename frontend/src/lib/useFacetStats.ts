import { useQueries } from '@tanstack/react-query';
import { api, buildQuery } from '../api/client';
import type { BugStats } from '../types';
import type { BugQueryParams } from './useBugFilters';

/**
 * Per-value counts for the filter bar, under the filters that are actually
 * applied.
 *
 * The rule this implements is the standard one for faceted search: a facet's
 * counts reflect every OTHER active filter, but not its own selection.
 *
 * Both halves matter, and getting either wrong is a real bug:
 *
 *  - Applying the other filters is what makes the numbers true. The previous
 *    version passed only `product`, so filtering to Status = CONFIRMED left the
 *    Category dropdown still reading "Functional 628" while the table below it
 *    held 92 rows. A count that contradicts the list it sits above is worse than
 *    no count at all, because it is read as fact.
 *
 *  - NOT applying the facet's own selection is what keeps it usable. Fold a
 *    facet into its own counts and every sibling option collapses to zero the
 *    moment you pick one - so after choosing Category = Security you can no
 *    longer see that 628 Functional bugs are one click away. The dropdown stops
 *    being a way to navigate and becomes a readout of what you already chose.
 *
 * Cost is bounded: one baseline request, plus one per counted facet that is
 * CURRENTLY narrowing the list. Only four facets show counts, so the ceiling is
 * five requests and the everyday case - nothing selected, or one thing selected
 * - is one or two. React Query dedupes by key, so the filter bar and the table
 * asking for the same breakdown is a single request.
 */

/** The facets whose dropdowns render a per-value count. */
export const COUNTED_FACETS = ['severity', 'category', 'component', 'browser'] as const;
export type CountedFacet = (typeof COUNTED_FACETS)[number];

export interface FacetStats {
  /** Every active filter applied - the honest breakdown of the current view. */
  all?: BugStats;
  /** Counts to show beside `facet`'s options: all other filters, not this one. */
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
      // Same key shape as `useBugStats`, so an identical breakdown requested by
      // any other caller is served from one cache entry rather than refetched.
      queryKey: ['bugs', 'stats', spec.params],
      queryFn: () => api.get<BugStats>(`/bugs/stats${buildQuery(spec.params)}`),
      staleTime: 30 * 1000,
    })),
  });

  const byFacet = new Map<CountedFacet | null, BugStats | undefined>();
  specs.forEach((spec, i) => byFacet.set(spec.facet, results[i]?.data));

  return {
    all: byFacet.get(null),
    /*
     * Falls back to the baseline when a facet has no selection of its own -
     * with nothing to exclude, "every other filter" and "every filter" are the
     * same query, and asking twice would be a duplicate request.
     */
    for: (facet) => byFacet.get(facet) ?? byFacet.get(null),
    isLoading: results.some((r) => r.isLoading),
  };
}
