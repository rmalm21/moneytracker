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
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; window.location.reload(); });
  navigator.serviceWorker.register('/sw.js').then(registration => {
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) { waiting = worker; set({ updateReady: true }); } };
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
export function applyUpdate() { if (waiting) waiting.postMessage('SKIP_WAITING'); else window.location.reload(); }
export async function promptInstall() { if (!installEvent) return false; await installEvent.prompt(); const choice = await installEvent.userChoice; installEvent = null; set({ canInstall: false }); return choice.outcome === 'accepted'; }
