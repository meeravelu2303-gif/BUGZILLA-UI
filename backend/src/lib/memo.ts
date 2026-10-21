/**
 * Tiny named in-memory caches for upstream reads that change rarely.
 *
 * Bugzilla here runs under CGI, so every call costs ~700 ms before it does
 * any work (see lib/bugSnapshot.ts). Group membership and product lists
 * change only when an admin edits them, yet were re-read on every request
 * that needed a people list or the admin Products page. Each cache is named
 * so the write that changes the underlying data can clear exactly that one.
 */
const caches = new Map<string, Map<string, { at: number; promise: Promise<unknown> }>>();

export function memo<T>(cacheName: string, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  let cache = caches.get(cacheName);
  if (!cache) {
    cache = new Map();
    caches.set(cacheName, cache);
  }
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = load();
  cache.set(key, { at: Date.now(), promise });
  // a failed load must not be served for the rest of the TTL
  promise.catch(() => {
    if (cache!.get(key)?.promise === promise) cache!.delete(key);
  });
  return promise;
}

export function clearMemo(cacheName: string): void {
  caches.get(cacheName)?.clear();
}
