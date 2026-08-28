import { useBugStats } from '../api/hooks';
import type { BugFilters, BugStats } from '../types';

/**
 * Whether "browser" means anything in the current view, and which browsers are
 * in it.
 *
 * One source of truth for two questions that must never disagree: whether the
 * filter bar offers a Browser control, and whether the table renders a Browser
 * column. Answering them separately is how you get a column with no way to
 * filter it, or a filter for a column nobody can see.
 *
 * The signal is DATA, not a product name. Nothing here knows that "KPost UI" is
 * the UI bench - it asks which browsers exist in the selected scope and reports
 * the answer. A renamed product, or a third bench added later, needs no change.
 *
 * Deliberately NOT derived from the rows on screen. `bugs.some(b => …)` looks
 * equivalent and is worse: the current page of a filtered list may hold no
 * browser-tagged bug while the next one does, so the column would appear and
 * vanish as the reader pages through, shifting every other column sideways as
 * it went. Scope-level counts are stable across pagination and sorting.
 */
export interface BrowserScope {
  /** Browser -> bug count within the current product scope. */
  counts: Record<string, number>;
  /** True when the scope contains at least one browser-tagged bug. */
  hasBrowsers: boolean;
}

export function useBrowserScope(filters: BugFilters, unscopedStats?: BugStats): BrowserScope {
  const isProductFiltered = filters.product.length > 0;

  /*
   * `unscopedStats` is fetched without filters on purpose, so every facet count
   * describes the whole product set rather than shrinking as you narrow. That
   * makes it the wrong source for this one question: its `byBrowser` stays
   * populated even once you have narrowed to the API product, which would leave
   * a Browser column standing over nothing but em dashes.
   *
   * So when a product filter is active we ask again, scoped to it. React Query
   * dedupes by key, so the filter bar and the table asking together is one
   * request, not two.
   */
  const scoped = useBugStats(isProductFiltered ? { product: filters.product } : {}, {
    enabled: isProductFiltered,
  });

  const counts = (isProductFiltered ? scoped.data?.byBrowser : unscopedStats?.byBrowser) ?? {};

  /*
   * A browser the reader has actively filtered on keeps the axis alive even at
   * zero results: hiding the column and the control at that moment would erase
   * the evidence of what is narrowing the list, leaving an empty table with no
   * visible cause.
   */
  const hasBrowsers = Object.keys(counts).length > 0 || filters.browser.length > 0;

  return { counts, hasBrowsers };
}
