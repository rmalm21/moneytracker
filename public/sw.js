// Dompet Ajaib service worker: fast app shell, offline fallback, and user-approved updates.
// Stamped with the app version by scripts/stamp-sw.mjs after every build (a new name per release clears old caches).
const VERSION = 'v16';
const STATE = 'dompet-ajaib-state';
const SHELL = `dompet-ajaib-shell-${VERSION}`;
const RUNTIME = `dompet-ajaib-runtime-${VERSION}`;
const PRECACHE = ['/', '/login/', '/manifest.webmanifest', '/icon.svg', '/icons/badge-96.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== RUNTIME && key !== STATE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
// The page asks, once it is up, whether the background check (below) found a newer build.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  else if (event.data === 'PAGE_CHANGED?' && event.source) event.waitUntil(refreshing.then(changed => event.source.postMessage({ type: 'PAGE_CHANGED', changed })));
});

let refreshing = Promise.resolve(false);

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: open at once from the saved copy (no waiting on the network), and fetch the page in the background. When
  // that copy differs (a new build was deployed), it is saved for the next opening and the page is told, so it can
  // switch over right away. With nothing saved yet (first visit), the network is used.
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/login'))) {
    const key = url.pathname.startsWith('/login') ? '/login/' : '/';
    const fresh = fetch(request, { cache: 'no-cache' }).then(response => (response.ok && !response.redirected ? { page: response, copy: response.clone() } : null)).catch(() => null);
    const update = Promise.all([fresh, caches.match(key)]).then(async ([got, saved]) => {
      if (!got) return false;
      const text = await got.copy.clone().text();
      const changed = Boolean(saved) && (await saved.text()) !== text;
      await caches.open(SHELL).then(cache => cache.put(key, got.copy));
      return changed;
    }).catch(() => false);
    refreshing = update;
    event.waitUntil(update);
    event.respondWith(caches.match(key).then(saved => saved || fresh.then(got => got ? got.page : caches.match('/'))).then(response => response || Response.error()));
    return;
  }
  // Other pages (the receipt benchmark): the network, or the saved app if offline.
  if (request.mode === 'navigate') { event.respondWith(fetch(request).catch(() => caches.match('/').then(page => page || Response.error()))); return; }
  // Hashed build files never change, and the receipt readers' models and runtime (/ocr: Tesseract, PP-OCRv6, ONNX
  // Runtime) only change with a new app version: serve from cache first, download once.
  // The page is cross-origin isolated (for the receipt reader's threads), and the browser then only starts a worker whose
  // script says so too: every copy served from here carries those headers, also a copy saved before they existed.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/ocr/')) {
    event.respondWith(caches.match(request).then(saved => saved || fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(RUNTIME).then(cache => cache.put(request, copy)); }
      return response;
    })).then(isolated));
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

// Reminders: open the right screen when a notification is tapped.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) { if ('focus' in client) { if ('navigate' in client) client.navigate(url).catch(() => {}); return client.focus(); } }
    return self.clients.openWindow(url);
  }));
});

// Background check (Android, installed app): the browser wakes the worker now and then; show a reminder that is due.
function isolated(response) {
  if (!response || response.type === 'opaque' || response.headers.get('cross-origin-embedder-policy')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp'); headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
const readJson = key => caches.open(STATE).then(cache => cache.match(key)).then(hit => hit ? hit.json() : null).catch(() => null);
const writeJson = (key, value) => caches.open(STATE).then(cache => cache.put(key, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })));
const toMinutes = time => { const [h, m] = String(time).split(':').map(Number); return h * 60 + m; };
const pad = n => String(n).padStart(2, '0');
async function checkReminders() {
  const config = await readJson('/__reminders.json');
  if (!config || (!config.balanceEnabled && !config.billsEnabled)) return;
  const now = new Date(), day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, current = now.getHours() * 60 + now.getMinutes();
  const state = await readJson('/__reminders-fired.json'), fired = state && state.date === day ? state.fired : [];
  const consumed = [], show = [];
  if (config.balanceEnabled) {
    const open = (config.times || []).filter(t => toMinutes(t) <= current && !fired.includes(`balance@${t}`));
    if (open.some(t => current - toMinutes(t) <= 180)) show.push(['Waktunya update saldo 💰', 'Cocokkan saldo dompetmu dan catat transaksi yang terlewat hari ini.', '/?view=wallets', 'balance']);
    consumed.push(...open.map(t => `balance@${t}`));
  }
  if (config.billsEnabled && toMinutes(config.billTime) <= current && !fired.includes(`bills@${config.billTime}`)) {
    consumed.push(`bills@${config.billTime}`);
    const last = new Date(now); last.setDate(last.getDate() + (config.billDaysBefore || 0));
    const limit = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    const due = (config.bills || []).filter(b => b.date >= day && b.date <= limit);
    if (due.length && current - toMinutes(config.billTime) <= 180) show.push([due.length === 1 ? `Tagihan: ${due[0].title}` : `${due.length} tagihan segera jatuh tempo`, due.slice(0, 3).map(b => `${b.title} Rp${Number(b.amount).toLocaleString('id-ID')}`).join('\n'), '/?view=upcoming', 'bills']);
  }
  if (!consumed.length) return;
  await writeJson('/__reminders-fired.json', { date: day, fired: [...fired, ...consumed] });
  await Promise.all(show.map(([title, body, url, tag]) => self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url }, lang: 'id', renotify: true, vibrate: [120, 60, 120], timestamp: Date.now(), actions: [{ action: 'open', title: 'Buka' }] })));
}
self.addEventListener('periodicsync', event => { if (event.tag === 'dompet-reminders') event.waitUntil(checkReminders()); });
