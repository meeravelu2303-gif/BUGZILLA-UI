/**
 * The list view a reader came from, so returning to it keeps their filters.
 *
 * Filters live in the URL (`useBugFilters`), which makes a filtered view shareable and
 * reload-proof — but the detail route carries only a bug id, so the query string is gone by the
 * time "Back to bugs" renders. That link pointed at a bare `/bugs`, and every trip into a bug
 * threw away the filtering that found it: narrow to 42 open Criticals, open one, come back to
 * all 409. On a list this size that is the difference between triaging a set and losing your
 * place in it every time you look at something.
 *
 * Remembering the URL rather than the filter object keeps this to one concern. Filters, sort and
 * pagination are already encoded there, so scroll-restoring back into page 4 of a sorted,
 * filtered list needs no extra state and cannot drift from what the list actually reads.
 *
 * `sessionStorage`, not a module variable, so the return path survives a reload of the detail
 * page and a middle-click into a new tab — and dies with the tab, which is the right lifetime
 * for "where I was just looking". Every access is guarded: Safari's private mode throws on
 * access rather than returning null, and losing the return path must never break the page.
 */

const KEY = 'kpost.bugzilla.lastListView';

/** Routes whose URL is worth returning to. A detail page must never record itself. */
const LIST_ROUTES = ['/bugs', '/my-bugs', '/search'];

export function isListRoute(pathname: string): boolean {
  return LIST_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}?`));
}

/** Records `pathname + search` when the reader is on a list view. */
export function rememberListView(pathname: string, search: string): void {
  if (!isListRoute(pathname)) return;
  try {
    sessionStorage.setItem(KEY, `${pathname}${search}`);
  } catch {
    // Storage unavailable (private mode, blocked cookies). The back link falls back to /bugs.
  }
}

/**
 * The remembered list view, or `/bugs` when there is none — a deep link, a fresh tab, or
 * storage that refused to answer.
 */
export function lastListView(): string {
  try {
    const stored = sessionStorage.getItem(KEY);
    // Only ever hand back an in-app list path; anything else is treated as absent.
    if (stored && isListRoute(stored.split('?')[0])) return stored;
  } catch {
    /* fall through to the default */
  }
  return '/bugs';
}

/** Label for the back link, so it names where the reader is actually going. */
export function lastListLabel(): string {
  const path = lastListView().split('?')[0];
  if (path === '/my-bugs') return 'Back to my bugs';
  if (path === '/search') return 'Back to search';
  return 'Back to bugs';
}
