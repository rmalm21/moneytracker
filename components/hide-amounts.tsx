'use client';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { firstMoneyWord, hasAmount, hasMoneyWord, maskAmounts, maskImportantAmounts } from '@/lib/privacy';

/**
 * Privacy switch: amounts on screen show as "Rp•••••" (lib/privacy.ts).
 * It works on the text the pages already render, so every page, dialog, toast and chart tooltip
 * is covered without each one knowing about it. Inputs keep their value, so forms still work.
 * Chosen per device and remembered, with three levels (8.3): every amount, the important ones, or Beranda only.
 */
const KEY = 'dompet-ajaib:hide-amounts';
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
/** Masked text nodes with what the page wrote, so turning the switch off puts it back. */
const masked = new Map<Text, { original: string; shown: string }>();
let observer: MutationObserver | null = null;
export type HideLevel = 'ketat' | 'penting' | 'beranda';
let level: HideLevel = 'ketat';
/** "Angka penting": places that only show balances, income, savings or debts, so every amount there is hidden. */
const IMPORTANT = ['.home-hero', ...['free', 'money', 'safeDaily', 'income', 'wallets', 'assets', 'netWorth', 'reserved', 'assetMix', 'kantong', 'emergency', 'forecast', 'liabilities', 'debts', 'receivables', 'funds'].map(card => `[data-widget="${card}"]`), '.report-position', '.book-section.is-income', '.tx-hero-split .amount-positive', '.data-row-side .amount-positive', '.tx-day-sum.amount-positive', '.report-flow .amount-positive', ...['wallets', 'funds', 'debts', 'receivables', 'owedReport', 'owedArchive', 'forecast'].map(view => `[data-view="${view}"]`)].join(', ');
/** Where the label of an amount ends: its own card, row or chat bubble. */
const CARD = 'li, tr, section, .panel, .stat-card, .data-row, .report-row, [role="row"], .gl-card, .cm-bubble, [role="dialog"]';
/** The text shown before an amount in its card ("Uang bebas" above "Rp7.200.000"), a space between elements. */
function labelBefore(node: Text) {
  let el = node.parentElement, before = '';
  for (let i = 0; el && i < 5; i++, el = el.parentElement) {
    const parts: string[] = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text && text !== node; text = walker.nextNode()) parts.push(text.nodeValue || '');
    before = parts.join(' ').slice(-80);
    if (hasMoneyWord(before) || before.length >= 80 || el.matches(CARD)) break;
  }
  return before;
}
function maskFor(value: string, node: Text, parent: Element) {
  if (level === 'ketat') return maskAmounts(value);
  if (level === 'beranda') return parent.closest('.home-dash') ? maskAmounts(value) : value;
  if (parent.closest(IMPORTANT)) return maskAmounts(value);
  // In an answer (chat or Tanya), an amount without a label of its own ("BCA Rp6,5 jt", the big figure on top)
  // follows what the answer is about.
  const label = labelBefore(node), answer = hasMoneyWord(label) ? null : parent.closest('.cm-bubble, .qa-card');
  return maskImportantAmounts(value, answer ? `${firstMoneyWord(answer.textContent || '')} ${label}` : label);
}
function maskNode(node: Text) {
  const value = node.nodeValue || '', record = masked.get(node);
  if (record && value === record.shown) return;
  if (!hasAmount(value)) { if (record) masked.delete(node); return; }
  const parent = node.parentElement;
  // Samples that show what each level hides keep their figures (data-keep-amounts).
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[contenteditable="true"], [data-keep-amounts]')) return;
  const shown = maskFor(value, node, parent);
  if (shown === value) { masked.delete(node); return; }
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

function startMasking(chosen: HideLevel) {
  if (observer) return;
  level = chosen;
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
/** How much is hidden, chosen in Pengaturan → Tampilan. */
const LEVEL_KEY = 'dompet-ajaib:hide-amounts-level', LEVEL_CHANGED = 'dompet-ajaib:hide-amounts-level-changed';
export function readHideLevel(): HideLevel { try { const saved = localStorage.getItem(LEVEL_KEY); return saved === 'penting' || saved === 'beranda' ? saved : 'ketat'; } catch { return 'ketat'; } }
export function setHideLevel(next: HideLevel) {
  try { localStorage.setItem(LEVEL_KEY, next); } catch { /* this visit only */ }
  window.dispatchEvent(new CustomEvent(LEVEL_CHANGED, { detail: next }));
}
function readSaved() { try { return readAlwaysHide() || localStorage.getItem(KEY) === '1'; } catch { return false; } }

export function useHideAmounts() {
  const [hidden, setHidden] = useState(readSaved), [chosen, setChosen] = useState(readHideLevel);
  // Turning "Selalu sembunyikan" on hides amounts at once, on every eye button.
  useEffect(() => { const sync = (event: Event) => { if ((event as CustomEvent).detail === true) setHidden(true); }; window.addEventListener(CHANGED, sync); return () => window.removeEventListener(CHANGED, sync); }, []);
  // A new level applies at once: what was hidden comes back, then the new set is hidden.
  useEffect(() => { const sync = (event: Event) => setChosen((event as CustomEvent<HideLevel>).detail); window.addEventListener(LEVEL_CHANGED, sync); return () => window.removeEventListener(LEVEL_CHANGED, sync); }, []);
  useLayoutEffect(() => {
    if (!hidden) { document.documentElement.removeAttribute('data-hide-amounts'); return; }
    document.documentElement.setAttribute('data-hide-amounts', chosen);
    startMasking(chosen);
    return () => { stopMasking(); document.documentElement.removeAttribute('data-hide-amounts'); };
  }, [hidden, chosen]);
  const toggle = useCallback(() => setHidden(current => { const next = !current; try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* still works for this visit */ } return next; }), []);
  return [hidden, toggle] as const;
}

/** Eye button in the top bar, left of the bell. */
export function AmountToggle() {
  const [hidden, toggle] = useHideAmounts();
  const label = hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal';
  return <button type="button" className={`eye-button ${hidden ? 'is-on' : ''}`} aria-pressed={hidden} aria-label={label} title={label} onClick={toggle}>{hidden ? <EyeOff size={19}/> : <Eye size={19}/>}</button>;
}
