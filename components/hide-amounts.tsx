'use client';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { hasAmount, hasBareAmount, maskAmounts, maskBareAmounts } from '@/lib/privacy';
import { featureUsed } from './feature-tips-events';

/**
 * Privacy switch: amounts on screen show as "Rp•••••" (lib/privacy.ts).
 * It works on the text the pages already render, so every page, dialog, toast and chart tooltip
 * is covered without each one knowing about it. Inputs keep their value, so forms still work.
 * Chosen per device and remembered, with two levels: every amount (Super ketat), or Beranda & Dompet. (8.4: the
 * "Angka penting saja" level of 8.3 was removed; a device that had it falls back to Super ketat.)
 * 8.3.1: tooltips and screen-reader labels (title, aria-label), chart axes and chat messages ("kopi 25rb") too.
 */
const KEY = 'dompet-ajaib:hide-amounts';
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
/** Masked text nodes and attributes with what the page wrote, so turning the switch off puts it back. */
const masked = new Map<Text, { original: string; shown: string }>();
const maskedAttrs = new Map<Element, Record<string, { original: string; shown: string }>>();
const ATTRS = ['title', 'aria-label'];
let observer: MutationObserver | null = null;
export type HideLevel = 'ketat' | 'beranda';
let level: HideLevel = 'ketat';

/** "Beranda & Dompet": the dashboard, the Dompet menu, and dialogs opened from them (not the chat or notifications). */
const HOME = '.home-dash, [data-view="wallets"]';
const viewBehind = () => document.querySelector('main[data-view]')?.getAttribute('data-view') || '';
const openedFromHome = (el: Element) => !!el.closest('[role="dialog"]') && !el.closest('.chat-panel, .notification-dialog') && ['dashboard', 'wallets'].includes(viewBehind());
/** Whether this level hides the amounts in a place: "Super ketat" hides every amount. */
const hides = (el: Element) => level === 'ketat' || !!el.closest(HOME) || openedFromHome(el);
/** Amounts written without "Rp": chart axes, chat messages, and what Catat otomatis read from a sentence. */
const bareZone = (el: Element) => !!el.closest('.recharts-wrapper, .recharts-surface, #recharts_measurement_span, .cm-bubble, .gc-bubble, .gc-asked, .chat-chip, .quick-preview');
function maskFor(value: string, parent: Element) {
  if (!hides(parent)) return value;
  return bareZone(parent) ? maskBareAmounts(maskAmounts(value)) : maskAmounts(value);
}
function maskNode(node: Text) {
  const value = node.nodeValue || '', record = masked.get(node);
  if (record && value === record.shown) return;
  const parent = node.parentElement;
  if (!hasAmount(value) && !(parent && bareZone(parent) && hasBareAmount(value))) { if (record) masked.delete(node); return; }
  // Samples that show what each level hides keep their figures (data-keep-amounts).
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[contenteditable="true"], [data-keep-amounts]')) return;
  const shown = maskFor(value, parent);
  if (shown === value) { masked.delete(node); return; }
  masked.set(node, { original: value, shown });
  node.nodeValue = shown;
}
/** A tooltip or screen-reader label with an amount ("Lihat detail GrabFood Rp47.000"). */
function maskAttrs(el: Element) {
  for (const name of ATTRS) {
    const value = el.getAttribute(name), saved = maskedAttrs.get(el)?.[name];
    if (value === null || saved && value === saved.shown) continue;
    if (!hasAmount(value) || el.closest('[data-keep-amounts]')) continue;
    const shown = hides(el) ? maskAmounts(value) : value;
    if (shown === value) continue;
    maskedAttrs.set(el, { ...maskedAttrs.get(el), [name]: { original: value, shown } });
    el.setAttribute(name, shown);
  }
}
function maskTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { maskNode(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) maskNode(node as Text);
  const el = root as Element;
  if (ATTRS.some(name => el.hasAttribute(name))) maskAttrs(el);
  el.querySelectorAll('[title], [aria-label]').forEach(maskAttrs);
}
function forgetRemoved() {
  if (masked.size > 4000) for (const node of masked.keys()) if (!node.isConnected) masked.delete(node);
  if (maskedAttrs.size > 2000) for (const el of maskedAttrs.keys()) if (!el.isConnected) maskedAttrs.delete(el);
}

function startMasking(chosen: HideLevel) {
  if (observer) return;
  level = chosen;
  maskTree(document.body);
  // Pages keep updating (new data, counters); new or changed text is masked before it is painted.
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') maskNode(record.target as Text);
      else if (record.type === 'attributes') maskAttrs(record.target as Element);
      else record.addedNodes.forEach(maskTree);
    }
    forgetRemoved();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function stopMasking() {
  observer?.disconnect(); observer = null;
  for (const [node, { original, shown }] of masked) if (node.isConnected && node.nodeValue === shown) node.nodeValue = original;
  for (const [el, saved] of maskedAttrs) for (const [name, { original, shown }] of Object.entries(saved)) if (el.isConnected && el.getAttribute(name) === shown) el.setAttribute(name, original);
  masked.clear(); maskedAttrs.clear();
}

/** "Selalu sembunyikan nominal": every time the app opens, amounts start hidden (the eye can still show them for a while). */
const ALWAYS_KEY = 'dompet-ajaib:hide-amounts-always';
const CHANGED = 'dompet-ajaib:hide-amounts-changed';
export function readAlwaysHide() { try { return localStorage.getItem(ALWAYS_KEY) === '1'; } catch { return false; } }
export function setAlwaysHide(on: boolean) { if (on) featureUsed('settings_hide');
  try { localStorage.setItem(ALWAYS_KEY, on ? '1' : '0'); if (on) localStorage.setItem(KEY, '1'); } catch { /* this visit only */ }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: on ? true : undefined }));
}
/** How much is hidden, chosen in Pengaturan → Tampilan. */
const LEVEL_KEY = 'dompet-ajaib:hide-amounts-level', LEVEL_CHANGED = 'dompet-ajaib:hide-amounts-level-changed';
export function readHideLevel(): HideLevel { try { return localStorage.getItem(LEVEL_KEY) === 'beranda' ? 'beranda' : 'ketat'; } catch { return 'ketat'; } }
export function setHideLevel(next: HideLevel) {
  try { localStorage.setItem(LEVEL_KEY, next); } catch { /* this visit only */ }
  window.dispatchEvent(new CustomEvent(LEVEL_CHANGED, { detail: next }));
}
function readSaved() { try { return readAlwaysHide() || localStorage.getItem(KEY) === '1'; } catch { return false; } }
/** System notifications are outside the page: at "Super ketat" their amounts are hidden too (they are not part of
 * Beranda or Dompet). The service worker reads the same choice for reminders sent in the background. */
export const systemNoticeText = (text: string) => readSaved() && readHideLevel() === 'ketat' ? maskAmounts(text) : text;
function shareWithWorker(ketat: boolean) {
  try { void caches.open('dompet-ajaib-state').then(cache => cache.put('/__hide-amounts.json', new Response(JSON.stringify({ ketat }), { headers: { 'content-type': 'application/json' } }))).catch(() => {}); } catch { /* Cache Storage is optional. */ }
}

export function useHideAmounts() {
  const [hidden, setHidden] = useState(readSaved), [chosen, setChosen] = useState(readHideLevel);
  // Turning "Selalu sembunyikan" on hides amounts at once, on every eye button.
  useEffect(() => { const sync = (event: Event) => { if ((event as CustomEvent).detail === true) setHidden(true); }; window.addEventListener(CHANGED, sync); return () => window.removeEventListener(CHANGED, sync); }, []);
  // A new level applies at once: what was hidden comes back, then the new set is hidden.
  useEffect(() => { const sync = (event: Event) => setChosen((event as CustomEvent<HideLevel>).detail); window.addEventListener(LEVEL_CHANGED, sync); return () => window.removeEventListener(LEVEL_CHANGED, sync); }, []);
  useEffect(() => shareWithWorker(hidden && chosen === 'ketat'), [hidden, chosen]);
  useLayoutEffect(() => {
    if (!hidden) { document.documentElement.removeAttribute('data-hide-amounts'); return; }
    document.documentElement.setAttribute('data-hide-amounts', chosen);
    startMasking(chosen);
    return () => { stopMasking(); document.documentElement.removeAttribute('data-hide-amounts'); };
  }, [hidden, chosen]);
  const toggle = useCallback(() => setHidden(current => { const next = !current; featureUsed('home_eye'); try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* still works for this visit */ } return next; }), []);
  return [hidden, toggle] as const;
}

/** Eye button in the top bar, left of the bell. */
export function AmountToggle() {
  const [hidden, toggle] = useHideAmounts();
  const label = hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal';
  return <button type="button" className={`eye-button ${hidden ? 'is-on' : ''}`} aria-pressed={hidden} aria-label={label} title={label} onClick={toggle}>{hidden ? <EyeOff size={19}/> : <Eye size={19}/>}</button>;
}
