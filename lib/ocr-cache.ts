/**
 * Reader scripts saved on the phone before the app became cross-origin isolated (3.3) lack the header the browser now
 * asks of a worker script, so the browser refuses to start them ("Pembaca struk belum bisa dimuat"), even with an old
 * service worker still in charge. Those few small scripts are removed from the cache and fetched again; the models
 * themselves (plain downloads, not scripts) stay. Returns whether anything was removed.
 */
export async function healReaderCache() {
  if (typeof caches === 'undefined' || typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated) return false;
  let removed = false;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (!/^\/(ocr|_next\/static)\/.*\.m?js$/.test(new URL(request.url).pathname)) continue;
        const saved = await cache.match(request);
        if (saved && !saved.headers.get('cross-origin-embedder-policy')) { await cache.delete(request); removed = true; }
      }
    }
  } catch { /* the cache is only an optimisation */ }
  return removed;
}
let healing: Promise<boolean> | null = null;
/** Once per page load is enough: what was removed is fetched again with the right headers. */
export const healReaderCacheOnce = () => (healing ||= healReaderCache());
