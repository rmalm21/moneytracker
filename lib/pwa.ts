'use client';
import { useSyncExternalStore } from 'react';

/** Service-worker updates and the install prompt, shared with the notification centre and Settings. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type State = { updateReady: boolean; canInstall: boolean; installed: boolean; ios: boolean };
let state: State = { updateReady: false, canInstall: false, installed: false, ios: false };
let waiting: ServiceWorker | null = null;
let installEvent: InstallEvent | null = null;
let started = false;
const listeners = new Set<() => void>();
const set = (changes: Partial<State>) => { state = { ...state, ...changes }; listeners.forEach(listener => listener()); };

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  set({ installed: standalone, ios: /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event as InstallEvent; set({ canInstall: true }); });
  window.addEventListener('appinstalled', () => { installEvent = null; set({ canInstall: false, installed: true }); });
  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
  let reloading = false, openedAt = performance.timeOrigin || Date.now();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') openedAt = Date.now(); });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; window.location.reload(); });
  // The app opens from the saved page; the service worker fetches the page meanwhile and says whether a new build came
  // with it. Just opened and nothing being edited: switch now. Otherwise the update notice offers it.
  const fresh = () => !document.querySelector('[role="dialog"]') && Date.now() - openedAt < 20000;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'PAGE_CHANGED' || !event.data.changed) return;
    if (fresh() && !reloading) { reloading = true; window.location.reload(); } else set({ updateReady: true });
  });
  navigator.serviceWorker.controller?.postMessage('PAGE_CHANGED?');
  // A screen not opened yet on this device may belong to a build that is no longer online (the saved page is one build
  // behind for a moment after a deploy): load the current page once instead of showing an error.
  const stale = (text: string) => /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
  const recover = (text: string) => { if (!stale(text)) return; try { if (sessionStorage.getItem('dompet-ajaib:chunk-reload')) return; sessionStorage.setItem('dompet-ajaib:chunk-reload', '1'); } catch { return; } window.location.reload(); };
  window.addEventListener('error', event => recover(String(event.message || event.error?.name || '')));
  window.addEventListener('unhandledrejection', event => recover(String((event.reason as Error)?.name || '') + ' ' + String((event.reason as Error)?.message || event.reason || '')));
  window.setTimeout(() => { try { sessionStorage.removeItem('dompet-ajaib:chunk-reload'); } catch { /* ignore */ } }, 30000);
  navigator.serviceWorker.register('/sw.js').then(registration => {
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
        waiting = worker; set({ updateReady: true });
        // Found just after opening (or coming back to) the app and nothing is being edited: use it right away, so a
        // deployed fix is not stuck behind an update notice. Otherwise the notice stays for the person to tap.
        if (Date.now() - openedAt < 20000 && !document.querySelector('[role="dialog"]')) worker.postMessage('SKIP_WAITING');
      };
      check(); worker.addEventListener('statechange', check);
    };
    track(registration.waiting);
    registration.addEventListener('updatefound', () => track(registration.installing));
    // Look for a new version when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void registration.update().catch(() => {}); });
  }).catch(() => {});
}

export function usePwa() {
  start();
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state, () => state);
}
/** Last resort when a device keeps showing an old build: drop this site's service worker and app caches, then reload. Reminder settings stay. */
export async function hardRefresh() {
  try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map(r => r.unregister())); } catch { /* ignore */ }
  try { const keys = await caches.keys(); await Promise.all(keys.filter(k => k !== 'dompet-ajaib-state').map(k => caches.delete(k))); } catch { /* ignore */ }
  window.location.reload();
}
export function applyUpdate() { if (waiting) waiting.postMessage('SKIP_WAITING'); else window.location.reload(); }
export async function promptInstall() { if (!installEvent) return false; await installEvent.prompt(); const choice = await installEvent.userChoice; installEvent = null; set({ canInstall: false }); return choice.outcome === 'accepted'; }
