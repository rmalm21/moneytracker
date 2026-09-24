// Dompet Ajaib service worker: fast app shell, offline fallback, and user-approved updates.
const VERSION = 'v7';
const STATE = 'dompet-ajaib-state';
const SHELL = `dompet-ajaib-shell-${VERSION}`;
const RUNTIME = `dompet-ajaib-runtime-${VERSION}`;
const PRECACHE = ['/', '/login/', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== RUNTIME && key !== STATE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
  await Promise.all(show.map(([title, body, url, tag]) => self.registration.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/maskable-192.png', data: { url } })));
}
self.addEventListener('periodicsync', event => { if (event.tag === 'dompet-reminders') event.waitUntil(checkReminders()); });
