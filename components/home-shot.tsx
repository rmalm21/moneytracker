'use client';
/**
 * 9.9.2 Beranda at once: the app keeps a copy of how Beranda last looked on this phone, shows it the moment the app
 * opens (before the account and its data have loaded: a second, or several on a slow phone), and swaps it for the live
 * Beranda as soon as that is drawn with all its data. The copy is only a picture: taps go to the live app beneath it.
 *
 * It is never shown when the app will open on something else: a PIN lock (no copy is kept while a PIN is on), another
 * mode (Pribadi or a Ruang Bersama), amounts hidden while the copy shows them, a newer app version, or after 3 days.
 */
import { useEffect, useLayoutEffect } from 'react';
import { APP_VERSION } from '@/lib/version';
import { HOME_SHOT_ID as ID, homeShotKey as KEY } from '@/lib/home-shot-boot';

type Shot = { v: string; at: number; mode: string; hidden: boolean; attrs: Record<string, string>; html: string };

export const homeShotOn = () => typeof document !== 'undefined' && !!document.getElementById(ID);
export function dropHomeShot() { document.documentElement.classList.remove('home-shot-on'); document.getElementById(ID)?.remove(); }
export function forgetHomeShot(uid: string) { try { localStorage.removeItem(KEY(uid)); } catch { /* nothing kept */ } }

/** The live Beranda takes over once it is drawn with its data (charts in, nothing still loading); anything else at once. */
const LOADING = '.chart-skeleton, [aria-busy="true"], .is-loading';
export function HomeShotSwap({ show, ready }: { show: boolean; ready: boolean }) {
  useLayoutEffect(() => {
    if (!homeShotOn()) return;
    if (!show) { dropHomeShot(); return; }
    if (!ready) return;
    let frame = 0;
    const until = performance.now() + 2500;
    const look = () => {
      const live = document.querySelector('body > .app-layout .home-dash');
      if ((live && !live.querySelector(LOADING)) || performance.now() > until) { dropHomeShot(); return; }
      frame = requestAnimationFrame(look);
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [show, ready]);
  return null;
}
/** Something other than Beranda is opening (sign-in, PIN, onboarding, an error): the copy goes at once. */
export function HomeShotOff() {
  useLayoutEffect(() => { dropHomeShot(); }, []);
  return null;
}

/** Nothing on top of Beranda and nothing still loading: what the copy should look like. */
function quiet() {
  const root = document.documentElement, live = document.querySelector('body > .app-layout');
  if (!live || homeShotOn()) return null;
  if (!live.querySelector('main[data-view="dashboard"] .home-dash .home-hero') || live.querySelector(LOADING)) return null;
  if (root.classList.contains('chat-is-open') || root.classList.contains('chat-locked') || document.body.hasAttribute('data-scroll-locked')) return null;
  if (document.querySelector('[role="dialog"], [role="alertdialog"], .modal-overlay, .chat-panel, .add-menu, .cel-overlay, .mg-overlay, .wn-overlay, .wr-overlay, .splash, details.dashboard-period[open], details.more-actions[open]')) return null;
  // Beranda's cards start open every time the app opens: a card folded now would not match the next opening.
  if (live.querySelector('details.widget-details:not([open])')) return null;
  return live;
}
/** Keeps the copy up to date while Beranda is on screen (a moment after it changes, and when the app is left). */
export function useHomeShotKeeper({ uid, active, pin, mode }: { uid?: string; active: boolean; pin: boolean; mode: string }) {
  useEffect(() => { if (uid && pin) forgetHomeShot(uid); }, [uid, pin]);
  useEffect(() => {
    if (!uid || pin || !active) return;
    const take = () => {
      const live = quiet(); if (!live) return;
      const root = document.documentElement, attrs: Record<string, string> = {};
      for (const a of Array.from(root.attributes)) if (a.name.startsWith('data-') || a.name === 'style') attrs[a.name] = a.value;
      const clone = live.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.pet-bubble').forEach(el => el.remove());
      // Only what fits on the first screen: the rest is never seen under the copy, and leaving it out keeps the copy light.
      const fold = window.innerHeight + 80, scrolled = window.scrollY, pick = '.home-dash > *, .home-dash > * > *';
      const liveParts = live.querySelectorAll(pick), cloneParts = clone.querySelectorAll(pick);
      if (liveParts.length === cloneParts.length) liveParts.forEach((el, i) => { if (el.getBoundingClientRect().top + scrolled > fold) cloneParts[i].remove(); });
      const pet = document.querySelector('body > .pet-dock');
      const shot: Shot = { v: APP_VERSION, at: Date.now(), mode, hidden: root.hasAttribute('data-hide-amounts'), attrs, html: clone.outerHTML + (pet ? pet.outerHTML : '') };
      try { localStorage.setItem(KEY(uid), JSON.stringify(shot)); } catch { forgetHomeShot(uid); }
    };
    const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    let timer = 0;
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => (idle ? idle(take, { timeout: 2000 }) : take()), 2500); };
    const leave = () => { if (document.visibilityState === 'hidden') take(); };
    later();
    const watch = new MutationObserver(later);
    const live = document.querySelector('body > .app-layout');
    if (live) watch.observe(live, { subtree: true, childList: true, characterData: true });
    document.addEventListener('visibilitychange', leave);
    return () => { window.clearTimeout(timer); watch.disconnect(); document.removeEventListener('visibilitychange', leave); };
  }, [uid, pin, active, mode]);
}
