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
  promise.catch(() => {
    if (cache!.get(key)?.promise === promise) cache!.delete(key);
  });
  return promise;
}

export function clearMemo(cacheName: string): void {
  caches.get(cacheName)?.clear();
}
