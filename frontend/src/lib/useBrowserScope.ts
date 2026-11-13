import type { BugFilters, BugStats } from '../types';

/** Whether "browser" means anything in the current view, and which browsers are in it. */
export interface BrowserScope {
  counts: Record<string, number>;
  hasBrowsers: boolean;
}

/** stats must be the BROWSER facet's breakdown. */
export function useBrowserScope(filters: BugFilters, stats?: BugStats): BrowserScope {
  const counts = stats?.byBrowser ?? {};

  const hasBrowsers = Object.keys(counts).length > 0 || filters.browser.length > 0;

  return { counts, hasBrowsers };
}
