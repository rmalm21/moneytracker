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
import { saveTipState } from '@/lib/firestore';
import { todayInTimeZone } from '@/lib/period';
import { readAlwaysHide } from './hide-amounts';
import { loadChat, loadSettings as loadChatSettings } from '@/lib/chat/store';
import { CLOSE_SUGGESTION_DAYS, HIDE_DAYS, addDays, cardTips, derivedUsed, pickSuggestion, suggestionsFor, usedSet, type Suggestion, type Tip, type TipMenu, type TipTry } from '@/lib/feature-tips';

import { TIP_USED as USED, askToTry, featureUsed, useTipTry } from './feature-tips-events';
export { askToTry, featureUsed, useTipTry };

/** Points at a button: scrolls to it and makes it glow for a moment. */
function pulse(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('ft-pulse'); void el.offsetWidth; el.classList.add('ft-pulse');
  window.setTimeout(() => el.classList.remove('ft-pulse'), 2600);
  return true;
}

function useTipUsage() {
  const { user, profile, data } = useApp();
  const uid = user?.uid || '';
  const local = useMemo(() => {
    if (!uid) return {};
    let chatUsed = false;
    try { chatUsed = loadChat(uid, loadChatSettings(uid).keepDays).messages.some(m => m.role === 'user'); } catch { /* only a convenience */ }
    return { chatUsed, alwaysHide: readAlwaysHide() };
  }, [uid]);
  const derived = useMemo(() => derivedUsed({ profile, data: { ...data, splitBills: (data as { splitBills?: [] }).splitBills }, layout: profile?.dashboardWidgets || [], local }), [profile, data, local]);
  const state = profile?.featureTips;
  return { uid, state, used: usedSet(state, derived), derived, today: todayInTimeZone(profile?.timeZone) };
}

/** Mounted once: keeps "this feature was used" with the account, once per feature. */
export function FeatureTipsBridge() {
  const { uid, used } = useTipUsage();
  const usedRef = useRef(used), sent = useRef(new Set<string>()); usedRef.current = used;
  useEffect(() => {
    if (!uid) return;
    const on = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id || usedRef.current.has(id) || sent.current.has(id)) return;
      sent.current.add(id);
      void saveTipState(uid, { used: id }).catch(() => sent.current.delete(id));
    };
    window.addEventListener(USED, on); return () => window.removeEventListener(USED, on);
  }, [uid]);
  return null;
}

/** The card of a menu, or (once its features are known or it is hidden) one suggestion that fits the moment. */
export function FeatureTips({ menu, navigate, className = '' }: { menu: TipMenu; navigate?: (view: string, focus?: string) => void; className?: string }) {
  const { profile, data, cycle } = useApp();
  const { uid, state, used, today } = useTipUsage();
  const card = cardTips(menu, used, state, today);
  const suggestion = useMemo<Suggestion | null>(() => {
    if (card.length) return null;
    const list = suggestionsFor(menu, {
      used, today, layout: profile?.dashboardWidgets || [], daysUntilSalary: cycle.daysRemaining,
      transactions: data.transactions, recurring: data.recurring, budgets: data.budgets, categories: data.categories,
      quickActions: profile?.quickActions || [], pendingDrafts: data.drafts.filter(d => d.status === 'pending').length,
    });
    return pickSuggestion(menu, list, state, today);
  }, [card.length, menu, used, today, profile?.dashboardWidgets, profile?.quickActions, cycle.daysRemaining, data, state]);
  // The day's suggestion for this menu is kept, so no other one shows that day.
  useEffect(() => {
    if (!uid || !suggestion || state?.suggested?.[menu]?.day === today) return;
    void saveTipState(uid, { suggested: { menu, day: today, id: suggestion.id } }).catch(() => {});
  }, [uid, suggestion?.id, menu, today, state?.suggested]);

  const run = (how: TipTry, id: string) => {
    if ('go' in how) navigate?.(how.go[0], how.go[1]);
    else if ('pulse' in how) { if (!pulse(how.pulse)) askToTry(id); }
    else askToTry(id);
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
    <button type="button" className="ft-suggest-go" onClick={() => run(suggestion.try, suggestion.tip)}>{suggestion.label}</button>
    <button type="button" className="ft-x" aria-label="Tutup saran ini" onClick={() => void saveTipState(uid, { closed: { id: suggestion.id, until: addDays(today, CLOSE_SUGGESTION_DAYS) } }).catch(() => {})}><X size={14}/></button>
  </div>;
  return null;
}
