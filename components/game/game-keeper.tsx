'use client';
/**
 * 9.4 Arena Catat's keeper (mounted once in the app): watches what the person records (in Pribadi and in their spaces),
 * moves the game forward (lib/game.ts advance), saves it, shares the lit days with their spaces ("api bareng"), warns
 * in the evening when a flame is about to go out (in the bell, while the app is open), and queues the celebrations.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '../app-provider';
import { useNotify } from '../notifications';
import { transactionExpense } from '@/lib/accounting';
import { addDays, advance, BADGES, challengeProgress, localDay, mondayOf, sharedDays, sharedStreak, streakOf, weekCtx, type GameState, type Habits, type Observation, type WeekRaw } from '@/lib/game';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';
import { celebrate, gameNow, markVisited, onceToday, saveGameState, setGame, setGameActions, shareFire, subscribeGameState, subscribeSharedFire, useGame, visitedToday } from './game-store';
import { play } from '@/lib/game-sound';
import { openGroup } from '@/lib/space-chat';

const createdMs = (t: LedgerTx) => { const c = t.createdAt as { toMillis?: () => number; seconds?: number } | null | undefined; return c?.toMillis ? c.toMillis() : c?.seconds ? c.seconds * 1000 : null; };
export const VIEW_EVENT = 'dompet-ajaib:view';

export function GameKeeper({ navigate }: { navigate: (view: string, focus?: string) => void }) {
  const { account, personalProfile, data, loading, space, spaces } = useApp();
  const { push } = useNotify();
  const uid = account?.uid, tz = personalProfile?.timeZone || 'Asia/Jakarta';
  const name = personalProfile?.displayName || account?.displayName || (account?.email || '').split('@')[0] || 'Anggota';
  const remote = useRef<{ state: GameState | null; loaded: boolean }>({ state: null, loaded: false });
  const latest = useRef<GameState | null>(null), saving = useRef(''), checkinWanted = useRef(false);
  const since = useRef(0);
  const nav = useRef(navigate); nav.current = navigate;
  const dataRef = useRef(data); dataRef.current = data;

  // The game of this person (from the server the first time).
  useEffect(() => {
    remote.current = { state: null, loaded: false }; latest.current = null; setGame({ state: null, ready: false });
    if (!uid) return;
    return subscribeGameState(uid, state => { remote.current = { state, loaded: true }; latest.current = state; setGame({ state, ready: true }); step(); });
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /** One look at the records now, turned into an observation for the rules. */
  const observe = useCallback((today: string, hour: number, first: boolean): Observation | null => {
    if (!uid) return null;
    const d = dataRef.current, root = space ? `space:${space.id}` : uid;
    const mine = (t: LedgerTx) => !t.interest && (!space || t.createdBy === uid);
    const dayOf = (t: LedgerTx) => { const ms = createdMs(t); return ms ? localDay(ms, tz) : t.date; };
    const todays = d.transactions.filter(t => mine(t) && dayOf(t) === today);
    const flows = todays.filter(t => t.type === 'expense' || t.type === 'income');
    const hourOf = (ms: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(ms)));
    const o: Observation = {
      today, hour, seed: uid, root, recordedToday: todays.length, checkin: checkinWanted.current,
      mission: {
        categorized: flows.every(t => Boolean(t.categoryId || t.splits?.some(l => l.categoryId))),
        withNotes: todays.some(t => Boolean(t.notes?.trim())), quick: todays.some(t => t.origin === 'quick'), scan: todays.some(t => t.origin === 'scan'),
        morning: todays.some(t => { const ms = createdMs(t); return ms ? hourOf(ms) < 12 : false; }), adjust: todays.some(t => t.type === 'adjustment'),
        visited: visitedToday(uid, today),
      },
    };
    if (!space) {
      const own = d.transactions.filter(t => !t.interest);
      if (first) o.history = [...new Set(own.map(t => { const ms = createdMs(t); return ms ? localDay(ms, tz) : ''; }).filter(Boolean))];
      const monday = mondayOf(today), weekOf = (from: string, to: string): WeekRaw => {
        const spend = own.filter(t => t.date >= from && t.date <= to && transactionExpense(t) > 0), counts: Record<string, number> = {};
        for (const t of spend) { const id = t.subcategoryId || t.categoryId; if (id) counts[id] = (counts[id] || 0) + 1; }
        return { recorded: own.filter(t => { const day = dayOf(t); return day >= from && day <= to; }).length, spent: spend.reduce((n, t) => n + transactionExpense(t), 0), spendDays: [...new Set(spend.map(t => t.date))], categoryCount: counts };
      };
      o.week = weekOf(monday, today); o.lastWeek = weekOf(addDays(monday, -7), addDays(monday, -1));
      // Habits of the last four whole weeks: how much they record, and the spending they do most often.
      const from = addDays(monday, -28), to = addDays(monday, -1), past = weekOf(from, to);
      const top = Object.entries(past.categoryCount).sort((a, b) => b[1] - a[1])[0];
      const cat = top && d.categories.find(c => c.id === top[0]);
      const habits: Habits = { weeklyRecorded: past.recorded / 4, lastWeekSpent: o.lastWeek.spent, topCategory: top && cat ? { id: top[0], name: cat.name, perWeek: top[1] / 4 } : null };
      o.habits = habits;
    }
    return o;
  }, [uid, space, tz]);

  /** Moves the game forward with what is seen now; saves and celebrates what changed. */
  const step = useCallback(() => {
    if (!uid || !remote.current.loaded || loading) return;
    const prev = latest.current, first = !prev;
    // The very first time, wait for the person's own records (so the streak can start from their history).
    if (first && (space || (!dataRef.current.transactions.length && Date.now() - since.current < 4000))) return;
    const now = dateInTimeZone(new Date(), tz), today = todayInTimeZone(tz), hour = now.getHours();
    setGame({ today, hour });
    const o = observe(today, hour, first); if (!o) return;
    const { state, events } = advance(prev, o);
    checkinWanted.current = false;
    const text = JSON.stringify(state);
    if (text !== JSON.stringify(prev)) {
      latest.current = state; setGame({ state });
      if (saving.current !== text) { saving.current = text; void saveGameState(uid, state).catch(() => { saving.current = ''; }); }
    }
    if (o.week && state.challenge) setGame({ challengeView: challengeProgress(state.challenge, weekCtx(state.days, mondayOf(today), today, o.week), false) });
    const shown = events.filter(e => e.kind !== 'xp');
    if (shown.length) celebrate(shown);
  }, [uid, loading, space, tz, observe]);

  // Look again when the records change, every minute (a new day, the evening), and when asked.
  useEffect(() => { if (!loading && !since.current) since.current = Date.now(); }, [loading]);
  useEffect(() => { step(); }, [step, data.transactions]);
  useEffect(() => { const t = window.setInterval(step, 60_000), late = window.setTimeout(step, 4500); return () => { window.clearInterval(t); window.clearTimeout(late); }; }, [step]);
  useEffect(() => {
    setGameActions({ checkin: () => { checkinWanted.current = true; step(); } });
    const onView = (e: Event) => { const view = (e as CustomEvent<string>).detail; if (uid && markVisited(uid, todayInTimeZone(tz), view)) step(); };
    // The menu already open when the keeper starts (it loads a moment after the first screen).
    const current = document.querySelector('main[data-view]')?.getAttribute('data-view');
    if (uid && current && markVisited(uid, todayInTimeZone(tz), current)) step();
    window.addEventListener(VIEW_EVENT, onView); return () => window.removeEventListener(VIEW_EVENT, onView);
  }, [step, uid, tz]);

  // Api bareng: each space's members' days, live; this person's own days shared with every space they are in.
  const spaceIds = spaces.map(s => s.id).join('|');
  useEffect(() => {
    if (!uid || !spaces.length) return;
    const stops = spaces.map(s => subscribeSharedFire(s.id, members => setGame(g => ({ shared: { ...g.shared, [s.id]: members } }))));
    return () => stops.forEach(stop => stop());
  }, [uid, spaceIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useGameStateRef();
  useEffect(() => {
    if (!uid || !state || !spaces.length) return;
    const days = sharedDays(state), sig = days.join(','), shared = gameNow().shared;
    for (const s of spaces) if ((shared[s.id]?.[uid] || []).join(',') !== sig && shared[s.id] !== undefined) void shareFire(s.id, uid, name, days).catch(() => {});
  });

  // Evening: a flame about to go out (yours, or a space's), said once a day in the bell. Milestones of api bareng.
  useEffect(() => {
    if (!uid) return;
    const check = () => {
      const g = gameNow(); if (!g.state || !g.today) return;
      const today = g.today, hour = g.hour, st = streakOf(g.state.days, g.state.frozen, today);
      if (hour >= 18 && st.atRisk && onceToday(`dompet-ajaib:arena-warned:${uid}`, today)) {
        push({ title: `Api kamu hampir padam! 🔥 ${st.current} hari`, body: 'Catat 1 transaksi atau ketuk "Hari ini aman" sebelum tengah malam.', kind: 'info', history: true, open: () => nav.current('dashboard') });
        play('soft');
      }
      for (const s of spaces) {
        const members = g.shared[s.id]; if (!members) continue;
        const sh = sharedStreak(members, s.memberIds, today);
        if (hour >= 19 && sh.atRisk && onceToday(`dompet-ajaib:arena-warned:${uid}:${s.id}`, today)) {
          const waiting = sh.members.filter(m => !m.litToday).map(m => m.id === uid ? 'kamu' : s.members[m.id]?.name || 'anggota');
          push({ title: `Api bareng ${s.name} hampir padam 🔥 ${sh.current} hari`, body: `Belum nyala: ${waiting.join(', ')}.`, kind: 'info', history: true, open: () => openGroup() });
        }
        if (sh.litToday) for (const b of BADGES) if (sh.current === b.days && onceToday(`dompet-ajaib:arena-shared:${s.id}:${b.days}`, today)) celebrate([{ kind: 'shared-badge', days: b.days, name: b.name, space: s.name }]);
      }
    };
    check(); const t = window.setInterval(check, 60_000); return () => window.clearInterval(t);
  }, [uid, spaceIds, push]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Re-renders the keeper when the saved game changes (to share the days). */
function useGameStateRef() { return useGame().state; }
