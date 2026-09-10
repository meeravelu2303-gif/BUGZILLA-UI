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
  /** Browser -> bug count within the current scope. */
  counts: Record<string, number>;
  /** True when the scope contains at least one browser-tagged bug. */
  hasBrowsers: boolean;
}

/**
 * `stats` must be the BROWSER facet's breakdown - `useFacetStats().for('browser')` -
 * meaning every other active filter applied and the browser selection itself not.
 *
 * This used to take the unfiltered stats and issue its own second request scoped
 * to the product, because the stats it was handed ignored the filters entirely.
 * That compensation is gone: `useFacetStats` already scopes correctly, and doing
 * it again here meant the column and the filter bar could answer from two
 * different queries - which is precisely the disagreement this hook exists to
 * prevent.
 */
export function useBrowserScope(filters: BugFilters, stats?: BugStats): BrowserScope {
  const counts = stats?.byBrowser ?? {};

  /*
   * A browser the reader has actively filtered on keeps the axis alive even at
   * zero results: hiding the column and the control at that moment would erase
   * the evidence of what is narrowing the list, leaving an empty table with no
   * visible cause.
   */
  const hasBrowsers = Object.keys(counts).length > 0 || filters.browser.length > 0;

  return { counts, hasBrowsers };
}
