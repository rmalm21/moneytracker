// Dompet Ajaib service worker: fast app shell, offline fallback, and user-approved updates.
const VERSION = 'v6';
const SHELL = `dompet-ajaib-shell-${VERSION}`;
const RUNTIME = `dompet-ajaib-runtime-${VERSION}`;
const PRECACHE = ['/', '/login/', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== RUNTIME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });

const timeout = (ms, promise) => new Promise((resolve, reject) => { const id = setTimeout(() => reject(new Error('timeout')), ms); promise.then(value => { clearTimeout(id); resolve(value); }, error => { clearTimeout(id); reject(error); }); });

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: try the network briefly, then fall back to the cached shell so the app opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(timeout(4000, fetch(request)).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(SHELL).then(cache => cache.put(url.pathname.startsWith('/login') ? '/login/' : '/', copy)); }
      return response;
    }).catch(() => caches.match(url.pathname.startsWith('/login') ? '/login/' : '/').then(page => page || caches.match('/'))));
    return;
  }
  // Hashed build files never change: serve from cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(request).then(saved => saved || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(RUNTIME).then(cache => cache.put(request, copy)); }
      return response;
    })));
    return;
  }
  // Everything else on this site: show the cached copy immediately and refresh it in the background.
  event.respondWith(caches.match(request).then(saved => {
    const network = fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(RUNTIME).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(() => saved || Response.error());
    return saved || network;
  }));
});
