/**
 * Each list page's filters, kept until the reader changes them.
 *
 * Filters live in the URL (`useBugFilters`), so leaving My Bugs for All Bugs and clicking back
 * through the sidebar opened a bare `/my-bugs` - every filter gone. This keeps the last query
 * string of each list page, per signed-in user, and `useBugFilters` puts it back when the page is
 * reached WITHOUT one. Clearing the filters stores the empty query, so a cleared page stays clear.
 *
 * `localStorage`, so it lasts across tabs and browser restarts ("until I change it"); keyed by
 * user so two people sharing a browser never inherit each other's filters. Pagination is not
 * kept: coming back to page 7 of a list that has since shrunk shows an empty table. Every access
 * is guarded - losing a saved filter must never break the page.
 */

const PREFIX = 'kpost.bugzilla.filters';

const keyFor = (user: string, pathname: string) => `${PREFIX}:${user.toLowerCase()}:${pathname}`;

/** Stores the page's query string (without pagination); an empty one records "no filters". */
export function saveFilters(user: string, pathname: string, search: string): void {
  const params = new URLSearchParams(search);
  params.delete('offset');
  try {
    localStorage.setItem(keyFor(user, pathname), params.toString());
  } catch {
    // Storage unavailable: the page simply opens unfiltered next time.
  }
}

/** The saved query string (no leading `?`), or '' when there is none. */
export function savedFilters(user: string, pathname: string): string {
  try {
    return localStorage.getItem(keyFor(user, pathname)) ?? '';
  } catch {
    return '';
  }
}
