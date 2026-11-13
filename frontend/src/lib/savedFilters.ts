const PREFIX = 'kpost.bugzilla.filters';

const keyFor = (user: string, pathname: string) => `${PREFIX}:${user.toLowerCase()}:${pathname}`;

/** Stores the page's query string (without pagination); an empty one records "no filters". */
export function saveFilters(user: string, pathname: string, search: string): void {
  const params = new URLSearchParams(search);
  params.delete('offset');
  try {
    localStorage.setItem(keyFor(user, pathname), params.toString());
  } catch {}
}

/** The saved query string (no leading ?), or '' when there is none. */
export function savedFilters(user: string, pathname: string): string {
  try {
    return localStorage.getItem(keyFor(user, pathname)) ?? '';
  } catch {
    return '';
  }
}
