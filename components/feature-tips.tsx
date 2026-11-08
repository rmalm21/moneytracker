'use client';
/**
 * 8.10 "Bisa dicoba di sini" card and the one-line suggestion that follows it (rules in lib/feature-tips.ts).
 *
 * Pages call `featureUsed(id)` when a feature is really used; the bridge (mounted once in the app) keeps it with the
 * account. A page starts its own features when a tip asks for it, through `useTipTry`.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useApp } from './app-provider';
import { saveTipState, usedInHistory } from '@/lib/firestore';
import { todayInTimeZone } from '@/lib/period';
import { readAlwaysHide } from './hide-amounts';
import { usePeriodTransactions } from './period-selector';
import { loadChat, loadSettings as loadChatSettings } from '@/lib/chat/store';
import { CLOSE_SUGGESTION_DAYS, HIDE_DAYS, HISTORY_TIPS, addDays, cardTips, derivedUsed, pickSuggestion, suggestionsFor, tipById, usedSet, type Suggestion, type Tip, type TipMenu, type TipPayload, type TipTry } from '@/lib/feature-tips';

import { TIP_USED as USED, askToTry, featureUsed, pulseElement, useTipTry } from './feature-tips-events';
export { askToTry, featureUsed, pulseElement, useTipTry };

const pulse = (selector: string) => pulseElement(document.querySelector<HTMLElement>(selector));

/** Has this account chatted on this device: read once (the chat history can be long), then remembered. */
const chatSeen = new Set<string>();
function chatUsedHere(uid: string) {
  if (chatSeen.has(uid)) return true;
  try { if (loadChat(uid, loadChatSettings(uid).keepDays).messages.some(m => m.role === 'user')) chatSeen.add(uid); } catch { /* only a convenience */ }
  return chatSeen.has(uid);
}

function useTipUsage() {
  const { user, profile, data } = useApp();
  const uid = user?.uid || '';
  const local = useMemo(() => uid ? { chatUsed: chatUsedHere(uid), alwaysHide: readAlwaysHide() } : {}, [uid]);
  const derived = useMemo(() => derivedUsed({ profile, data: { ...data, splitBills: (data as { splitBills?: [] }).splitBills }, layout: profile?.dashboardWidgets || [], local }), [profile, data, local]);
  const state = profile?.featureTips;
  const used = useMemo(() => usedSet(state, derived), [state, derived]);
  return { uid, state, used, derived, today: todayInTimeZone(profile?.timeZone) };
}

/** Mounted once: keeps "this feature was used" with the account, once per feature. */
export function FeatureTipsBridge() {
  const { loading, profile } = useApp();
  const { uid, state, used, derived } = useTipUsage();
  const usedRef = useRef(used), sent = useRef(new Set<string>()); usedRef.current = used;
  useEffect(() => { sent.current = new Set(); }, [uid]);
  useEffect(() => {
    if (!uid) return;
    const on = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id || (state?.used || []).includes(id) || sent.current.has(id)) return;
      sent.current.add(id);
      void saveTipState(uid, { used: id }).catch(() => sent.current.delete(id));
    };
    window.addEventListener(USED, on); return () => window.removeEventListener(USED, on);
  }, [uid, state?.used]);
  // What the person's own records show is kept as well, so a feature stays known after those records leave the months
  // the app keeps loaded (a transfer from last year, a chat history that expired).
  useEffect(() => {
    if (!uid || !profile) return;
    const kept = new Set(state?.used || []);
    const fresh = [...derived].filter(id => tipById.has(id) && !kept.has(id) && !sent.current.has(id));
    if (!fresh.length) return;
    fresh.forEach(id => sent.current.add(id));
    void saveTipState(uid, { used: fresh }).catch(() => fresh.forEach(id => sent.current.delete(id)));
  }, [uid, Boolean(profile), derived, state?.used]);
  // Once per account, a few seconds after opening: features used long ago (one small query each, online only, since
  // a cache-only answer could miss them).
  useEffect(() => {
    if (!uid || !profile || loading || state?.scanned) return;
    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return;
      const want = HISTORY_TIPS.filter(id => !usedRef.current.has(id));
      void (want.length ? usedInHistory(uid, want) : Promise.resolve([])).then(found => saveTipState(uid, { used: found, scanned: 1 })).catch(() => { /* tried again next time */ });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [uid, Boolean(profile), loading, state?.scanned]);
  return null;
}

const NO_RANGE = { start: '', end: '' };

/** The card of a menu, or (once its features are known or it is hidden) one suggestion that fits the moment. */
export function FeatureTips({ menu, navigate, className = '' }: { menu: TipMenu; navigate?: (view: string, focus?: string) => void; className?: string }) {
  const { profile, data, cycle } = useApp();
  const { uid, state, used, today } = useTipUsage();
  const card = cardTips(menu, used, state, today);
  // "Muncul tiap bulan" looks three months back, more than the app keeps loaded: read them only when it can show.
  const closedUntil = state?.closed?.trans_make_recurring;
  const wantMonths = menu === 'transactions' && !card.length && used.has('trans_recurring') && !(closedUntil && closedUntil > today);
  const months = usePeriodTransactions(wantMonths ? { start: addDays(today, -92), end: addDays(today, 1) } : NO_RANGE);
  const transactions = useMemo(() => {
    if (!wantMonths || !months.items.length) return data.transactions;
    const seen = new Set(data.transactions.map(t => t.id));
    return [...data.transactions, ...months.items.filter(t => !seen.has(t.id))];
  }, [wantMonths, months.items, data.transactions]);
  const suggestion = useMemo<Suggestion | null>(() => {
    if (card.length) return null;
    const list = suggestionsFor(menu, {
      used, today, layout: profile?.dashboardWidgets || [], daysUntilSalary: cycle.daysRemaining,
      transactions, recurring: data.recurring, budgets: data.budgets, categories: data.categories,
      quickActions: profile?.quickActions || [], pendingDrafts: data.drafts.filter(d => d.status === 'pending').length,
    });
    return pickSuggestion(menu, list, state, today);
  }, [card.length, menu, used, today, profile?.dashboardWidgets, profile?.quickActions, cycle.daysRemaining, transactions, data.recurring, data.budgets, data.categories, data.drafts, state]);
  // The day's suggestion for this menu is kept, so no other one shows that day.
  useEffect(() => {
    if (!uid || !suggestion || state?.suggested?.[menu]?.day === today) return;
    void saveTipState(uid, { suggested: { menu, day: today, id: suggestion.id } }).catch(() => {});
  }, [uid, suggestion?.id, menu, today, state?.suggested]);

  const run = (how: TipTry, id: string, payload?: TipPayload) => {
    if ('go' in how) navigate?.(how.go[0], how.go[1]);
    else if ('pulse' in how) { if (!pulse(how.pulse)) askToTry(id, payload); }
    else askToTry(id, payload);
  };
  if (!uid) return null;
  if (card.length) return <section className={`ft-card ${className}`} aria-label="Bisa dicoba di sini">
    <header><span className="ft-mark" aria-hidden="true"><Sparkles size={15}/></span><strong>Bisa dicoba di sini</strong>
      <button type="button" className="ft-x" aria-label="Sembunyikan selama 7 hari" title="Sembunyikan selama 7 hari" onClick={() => void saveTipState(uid, { hideMenu: menu, until: addDays(today, HIDE_DAYS) }).catch(() => {})}><X size={15}/></button></header>
    <ul>{card.map((tip: Tip) => <li key={tip.id}><button type="button" className="ft-row" onClick={() => run(tip.try, tip.id)}>
      <span className="ft-emoji" aria-hidden="true">{tip.emoji}</span><span className="ft-text"><b>{tip.title}</b><small>{tip.text}</small></span><span className="ft-go">Coba</span>
    </button></li>)}</ul>
  </section>;
  if (suggestion) return <div className={`ft-suggest ${className}`} role="note">
    <span className="ft-mark" aria-hidden="true"><Sparkles size={14}/></span><span className="ft-suggest-text">{suggestion.text}</span>
    <button type="button" className="ft-suggest-go" onClick={() => run(suggestion.try, suggestion.tip, suggestion.payload)}>{suggestion.label}</button>
    <button type="button" className="ft-x" aria-label="Tutup saran ini" title="Tutup saran ini" onClick={() => void saveTipState(uid, { closed: { id: suggestion.id, until: addDays(today, CLOSE_SUGGESTION_DAYS) } }).catch(() => {})}><X size={14}/></button>
  </div>;
  return null;
}
