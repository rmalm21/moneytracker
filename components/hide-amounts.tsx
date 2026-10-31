'use client';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { firstMoneyWord, hasAmount, hasBareAmount, hasMoneyWord, maskAmounts, maskBareAmounts, maskImportantAmounts } from '@/lib/privacy';

/**
 * Privacy switch: amounts on screen show as "Rp•••••" (lib/privacy.ts).
 * It works on the text the pages already render, so every page, dialog, toast and chart tooltip
 * is covered without each one knowing about it. Inputs keep their value, so forms still work.
 * Chosen per device and remembered, with three levels (8.3): every amount, the important ones, or Beranda & Dompet.
 * 8.3.1: tooltips and screen-reader labels (title, aria-label), chart axes and chat messages ("kopi 25rb") too.
 */
const KEY = 'dompet-ajaib:hide-amounts';
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
/** Masked text nodes and attributes with what the page wrote, so turning the switch off puts it back. */
const masked = new Map<Text, { original: string; shown: string }>();
const maskedAttrs = new Map<Element, Record<string, { original: string; shown: string }>>();
const ATTRS = ['title', 'aria-label'];
let observer: MutationObserver | null = null;
export type HideLevel = 'ketat' | 'penting' | 'beranda';
let level: HideLevel = 'ketat';

const views = (list: string[]) => list.map(view => `[data-view="${view}"]`);
const widgets = (list: string[]) => list.map(card => `[data-widget="${card}"]`);
/** "Angka penting": balances, income, savings, debts and what is owed to you; everything in these places is hidden. */
const IMPORTANT_VIEWS = ['wallets', 'funds', 'wishlist', 'debts', 'receivables', 'claims', 'splitbill', 'owedReport', 'owedArchive', 'forecast'];
const IMPORTANT_PLACES = views(IMPORTANT_VIEWS).join(', ');
const IMPORTANT = ['.home-hero', '.report-position', '.book-head', '.book-widget > summary', '.book-section.is-income', '.tx-wallet-text', '.fc-wallet-text', '.wallet-balance', '.pocket-pick-text', '.pocket-total', '.pocket-members',
  '.wallet-delete-head', '.wallet-archive-text', '.portion-intro', '.qp-balance', 'option',
  ...widgets(['free', 'money', 'safeDaily', 'income', 'cashFlow', 'lastCycle', 'wallets', 'assets', 'netWorth', 'reserved', 'assetMix', 'kantong', 'emergency', 'forecast', 'liabilities', 'debts', 'receivables', 'splitBill', 'claims', 'funds'])].join(', ');
/** Everyday spending: shown at "Angka penting", whatever words are near it ("Bayar utang" is still spending). */
const EVERYDAY = ['.donut-layout', '.book-section.is-expense', '.budget-tiles',
  ...widgets(['budget', 'budgets', 'budgetAlerts', 'expenses', 'avgDaily', 'topCategories', 'categoryDonut', 'expenseTrend', 'weekSpend', 'bigExpenses', 'topMerchants', 'categoryChanges', 'bills']),
  ...views(['budgets', 'categories'])].join(', ');
/** "Beranda & Dompet". */
const HOME = '.home-dash, [data-view="wallets"]';
/** Where the label of an amount ends: its own card, row or chat bubble. */
const CARD = 'li, tr, section, article, .panel, .stat-card, .data-row, .report-row, [role="row"], .gl-card, .cm-bubble, [role="dialog"]';
const AMOUNT = /Rp\s?(?:\d|•)/;
/** The text shown before an amount in its card ("Uang bebas" above "Rp7.200.000"), a space between elements. */
function labelBefore(node: Node) {
  let el = node.parentElement, before = '';
  for (let i = 0; el && i < 5; i++, el = el.parentElement) {
    // A list of amounts (rows, chips, cards): one item's label never comes from the item before it.
    if (i > 0 && [...el.children].filter(child => AMOUNT.test(child.textContent || '')).length >= 2) break;
    const parts: string[] = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text && text !== node; text = walker.nextNode()) parts.push(text.nodeValue || '');
    before = parts.join(' ').slice(-80);
    if (hasMoneyWord(before) || before.length >= 80 || el.matches(CARD)) break;
  }
  return before;
}
/** The menu open behind a dialog: a dialog opened from Dompet is as private as Dompet. */
const viewBehind = () => document.querySelector('main[data-view]')?.getAttribute('data-view') || '';
const inDialogOf = (el: Element, list: string[]) => !!el.closest('[role="dialog"]') && !el.closest('.chat-panel, .notification-dialog') && list.includes(viewBehind());
/** This level's decision for a place: hide everything, show everything, or (null) read the words around it. */
function verdict(el: Element): 'mask' | 'show' | null {
  if (level === 'ketat') return 'mask';
  if (level === 'beranda') return el.closest(HOME) || inDialogOf(el, ['dashboard', 'wallets']) ? 'mask' : 'show';
  // Menus about money you have or owe hide everything, spending in them too (a wallet's history adds up to its balance).
  if (el.closest(IMPORTANT_PLACES) || inDialogOf(el, IMPORTANT_VIEWS)) return 'mask';
  const marked = el.closest('[data-amounts]');
  if (marked) return marked.getAttribute('data-amounts') === 'penting' ? 'mask' : 'show';
  if (el.closest(IMPORTANT)) return 'mask';
  if (el.closest(EVERYDAY) || inDialogOf(el, ['budgets', 'categories'])) return 'show';
  // Elsewhere money in is hidden and money out shown. (A transaction row marks its own amount: a transfer moves your
  // own money and is hidden like a balance.)
  if (el.closest('.amount-positive')) return 'mask';
  if (el.closest('.amount-negative')) return 'show';
  return null;
}
/** Amounts written without "Rp": chart axes, chat messages, and what Catat otomatis read from a sentence. */
const bareZone = (el: Element) => !!el.closest('.recharts-wrapper, .recharts-surface, #recharts_measurement_span, .cm-bubble, .chat-chip, .quick-preview');
const all = (value: string, bare: boolean) => bare ? maskBareAmounts(maskAmounts(value)) : maskAmounts(value);
function maskFor(value: string, node: Node, parent: Element) {
  const bare = bareZone(parent), decided = verdict(parent);
  if (decided === 'mask') return all(value, bare);
  if (decided === 'show') return value;
  // In an answer (chat or Tanya), an amount without a label of its own ("BCA Rp6,5 jt", the big figure on top)
  // follows what the answer is about.
  const label = labelBefore(node), answer = hasMoneyWord(label) ? null : parent.closest('.cm-bubble, .qa-card');
  return maskImportantAmounts(value, answer ? `${firstMoneyWord(answer.textContent || '')} ${label}` : label, bare);
}
function maskNode(node: Text) {
  const value = node.nodeValue || '', record = masked.get(node);
  if (record && value === record.shown) return;
  const parent = node.parentElement;
  if (!hasAmount(value) && !(parent && bareZone(parent) && hasBareAmount(value))) { if (record) masked.delete(node); return; }
  // Samples that show what each level hides keep their figures (data-keep-amounts).
  if (!parent || SKIP.has(parent.tagName) || parent.closest('[contenteditable="true"], [data-keep-amounts]')) return;
  const shown = maskFor(value, node, parent);
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
    // A row's label follows the amount it shows (a transaction row marks its amount with data-amounts).
    const inner = el.querySelector('[data-amounts]'), decided = verdict(el) ?? (inner && verdict(inner));
    const shown = decided === 'mask' ? maskAmounts(value) : decided === 'show' ? value : maskImportantAmounts(value);
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
/** System notifications are outside the page: at "Super ketat" their amounts are hidden too (bills and budgets are
 * spending, so the other levels show them). The service worker reads the same choice for reminders sent in the background. */
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
  const toggle = useCallback(() => setHidden(current => { const next = !current; try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* still works for this visit */ } return next; }), []);
  return [hidden, toggle] as const;
}

/** Eye button in the top bar, left of the bell. */
export function AmountToggle() {
  const [hidden, toggle] = useHideAmounts();
  const label = hidden ? 'Tampilkan nominal' : 'Sembunyikan nominal';
  return <button type="button" className={`eye-button ${hidden ? 'is-on' : ''}`} aria-pressed={hidden} aria-label={label} title={label} onClick={toggle}>{hidden ? <EyeOff size={19}/> : <Eye size={19}/>}</button>;
}
