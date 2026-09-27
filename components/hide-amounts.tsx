'use client';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { hasAmount, maskAmounts } from '@/lib/privacy';

/**
 * Privacy switch: every amount on screen shows as "Rp•••••" (lib/privacy.ts).
 * It works on the text the pages already render, so every page, dialog, toast and chart tooltip
 * is covered without each one knowing about it. Inputs keep their value, so forms still work.
 * Chosen per device and remembered.
 */
const KEY = 'dompet-ajaib:hide-amounts';
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
/** Masked text nodes with what the page wrote, so turning the switch off puts it back. */
const masked = new Map<Text, { original: string; shown: string }>();
let observer: MutationObserver | null = null;

function maskNode(node: Text) {
  const value = node.nodeValue || '', record = masked.get(node);
  if (record && value === record.shown) return;
  if (!hasAmount(value)) { if (record) masked.delete(node); return; }
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[contenteditable="true"]')) return;
  const shown = maskAmounts(value);
  masked.set(node, { original: value, shown });
  node.nodeValue = shown;
}
function maskTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { maskNode(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) maskNode(node as Text);
}
function forgetRemoved() { if (masked.size > 4000) for (const node of masked.keys()) if (!node.isConnected) masked.delete(node); }

function startMasking() {
  if (observer) return;
  maskTree(document.body);
  // Pages keep updating (new data, counters); new or changed text is masked before it is painted.
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') maskNode(record.target as Text);
      else record.addedNodes.forEach(maskTree);
    }
    forgetRemoved();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}
function stopMasking() {
  observer?.disconnect(); observer = null;
  for (const [node, { original, shown }] of masked) if (node.isConnected && node.nodeValue === shown) node.nodeValue = original;
  masked.clear();
}

/** "Selalu sembunyikan nominal": every time the app opens, amounts start hidden (the eye can still show them for a while). */
const ALWAYS_KEY = 'dompet-ajaib:hide-amounts-always';
const CHANGED = 'dompet-ajaib:hide-amounts-changed';
export function readAlwaysHide() { try { return localStorage.getItem(ALWAYS_KEY) === '1'; } catch { return false; } }
export function setAlwaysHide(on: boolean) {
  try { localStorage.setItem(ALWAYS_KEY, on ? '1' : '0'); if (on) localStorage.setItem(KEY, '1'); } catch { /* this visit only */ }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: on ? true : undefined }));
}
function readSaved() { try { return readAlwaysHide() || localStorage.getItem(KEY) === '1'; } catch { return false; } }

export function useHideAmounts() {
  const [hidden, setHidden] = useState(readSaved);
  // Turning "Selalu sembunyikan" on hides amounts at once, on every eye button.
  useEffect(() => { const sync = (event: Event) => { if ((event as CustomEvent).detail === true) setHidden(true); }; window.addEventListener(CHANGED, sync); return () => window.removeEventListener(CHANGED, sync); }, []);
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-hide-amounts', hidden);
    if (!hidden) return;
    startMasking();
    return () => { stopMasking(); document.documentElement.removeAttribute('data-hide-amounts'); };
  }, [hidden]);
  const toggle = useCallback(() => setHidden(current => { const next = !current; try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* still works for this visit */ } return next; }), []);
  return [hidden, toggle] as const;
}

/** Eye button in the top bar, left of the bell. */
export function AmountToggle() {
  const [hidden, toggle] = useHideAmounts();
  const label = hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal';
  return <button type="button" className={`eye-button ${hidden ? 'is-on' : ''}`} aria-pressed={hidden} aria-label={label} title={label} onClick={toggle}>{hidden ? <EyeOff size={19}/> : <Eye size={19}/>}</button>;
}
