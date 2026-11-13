const KEY = 'kpost.bugzilla.lastListView';

const LIST_ROUTES = ['/bugs', '/my-bugs', '/search'];

export function isListRoute(pathname: string): boolean {
  return LIST_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}?`));
}

/** Records pathname + search when the reader is on a list view. */
export function rememberListView(pathname: string, search: string): void {
  if (!isListRoute(pathname)) return;
  try {
    sessionStorage.setItem(KEY, `${pathname}${search}`);
  } catch {}
}

/** The remembered list view, or /bugs when there is none — a deep link, a fresh tab, or storage that. */
export function lastListView(): string {
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored && isListRoute(stored.split('?')[0])) return stored;
  } catch {}
  return '/bugs';
}

/** Label for the back link, so it names where the reader is actually going. */
export function lastListLabel(): string {
  const path = lastListView().split('?')[0];
  if (path === '/my-bugs') return 'Back to my bugs';
  if (path === '/search') return 'Back to search';
  return 'Back to bugs';
}
