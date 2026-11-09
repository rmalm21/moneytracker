'use client';
/**
 * 9.8 The pet next to the chat button, with its name floating above it. Tap: pet it. Hold: play (its special move).
 * Tap the name: its panel (needs, name, accessories, other pets). Hungry: a bowl shows next to it (tap to feed; meals
 * are yours to give, not tied to transactions). It cheers when you record, dances when the flame is lit, is startled
 * by a big expense, grows, and now and then says something useful (tap the bubble: the assistant).
 * Rules: lib/pet.ts. Loaded after the first screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { askToTry } from '../feature-tips-events';
import { celebrate, useGame } from '../game/game-store';
import { PetParts, PetSprite, SPECIAL_FX, usePetFx } from './pet-view';
import { cachedPet, openPetSheet, PET_HIDE_EVENT, petHidden, setPetStore, subscribePet, usePetStore, cachePet } from './pet-store';
import { commitPet, hourIn, hourKey, petSound, waitText } from './pet-actions';
import { ACCESSORIES, collectEgg, eggReady, emptyPet, feed, hematScore, MEALS_A_DAY, moodOf, needsAt, pet, petTip, play as playPet, PETS, readTip, STAGES, syncPet, type PetEvent, type PetState } from '@/lib/pet';
import { canScratch, canSpin, hash, streakOf, type GameState } from '@/lib/game';
import { todayInTimeZone } from '@/lib/period';
import { play } from '@/lib/game-sound';
import type { LedgerTx } from '@/lib/types';

const PetSheet = dynamic(() => import('./pet-sheet').then(m => m.PetSheet), { ssr: false });
type Bubble = { id: number; text: string; tip?: boolean };

const gamesOf = (s: GameState) => (s.stats?.coinGames || 0) + (s.stats?.spins || 0) + (s.stats?.scratches || 0) + Object.values(s.arcade || {}).reduce((n, a) => n + (a?.plays || 0), 0);
const recordedOf = (s: GameState, today: string) => (s.txDay === today ? Object.values(s.txCounted || {}).reduce((n, v) => n + v, 0) : 0);
const countersOf = (p: PetState) => JSON.stringify([p.seenTx, p.litDay, p.missionsSeen, p.gamesSeen, p.xpSeen]);

export function PetDock() {
  const { account, data, space, personalProfile } = useApp();
  const g = useGame(), ps = usePetStore();
  const uid = account?.uid || '', tz = personalProfile?.timeZone || 'Asia/Jakarta';
  const hourOf = useMemo(() => hourIn(tz), [tz]);
  const [hidden, setHidden] = useState(() => (uid ? petHidden(uid) : false));
  const [bubble, setBubble] = useState<Bubble | null>(null), [, tick] = useState(0);
  const { fx, parts, run } = usePetFx();
  const queue = useRef<(() => void)[]>([]), busy = useRef(false), press = useRef<{ t: number; x: number; y: number; long: boolean } | null>(null), bubbleTimer = useRef(0);
  const today = g.today || todayInTimeZone(tz);

  // The pet from the account (the phone's copy first).
  useEffect(() => {
    if (!uid) return;
    setPetStore({ uid, state: cachedPet(uid), ready: false });
    return subscribePet(uid, st => { const next = st || emptyPet(); setPetStore({ uid, state: next, ready: true }); cachePet(uid, next); });
  }, [uid]);
  useEffect(() => { const on = () => setHidden(uid ? petHidden(uid) : false); window.addEventListener(PET_HIDE_EVENT, on); return () => window.removeEventListener(PET_HIDE_EVENT, on); }, [uid]);
  // The needs move with time: look again every minute.
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 60_000); return () => window.clearInterval(t); }, []);

  const state = ps.state, rec = state?.active ? state.pets[state.active] : undefined, info = rec ? PETS[rec.kind] : null;
  // The gecko's thrift: today's spending against the usual day (personal records only).
  const hemat = useMemo(() => {
    if (!rec || rec.kind !== 'tokek' || space) return undefined;
    const exp = data.transactions.filter((t: LedgerTx) => t.type === 'expense' && !t.interest);
    const from = new Date(`${today}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 30); const start = from.toISOString().slice(0, 10);
    const todaySpent = exp.filter(t => t.date === today).reduce((n, t) => n + (t.amount || 0), 0);
    const usual = exp.filter(t => t.date >= start && t.date < today).reduce((n, t) => n + (t.amount || 0), 0) / 30;
    return hematScore(todaySpent, usual);
  }, [rec, space, data.transactions, today]);

  // Saying things, one after another.
  function say(text: string, tip = false, ms = tip ? 8000 : 3200) {
    window.clearTimeout(bubbleTimer.current); setBubble({ id: Math.random(), text, tip });
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }
  function enqueue(f: () => void) { queue.current.push(f); if (!busy.current) next(); }
  function next() { const f = queue.current.shift(); if (!f) { busy.current = false; return; } busy.current = true; f(); window.setTimeout(next, 2300); }
  function react(ev: PetEvent) {
    if (!rec || !info) return;
    if (ev.kind === 'recorded') enqueue(() => { run('dance'); petSound(info.voice); say(ev.n > 1 ? `Mantap, ${ev.n} transaksi udah dicatat!` : 'Mantap, transaksinya udah dicatat!'); });
    if (ev.kind === 'walk') enqueue(() => { run('dance'); petSound(info.voice); say('Api nyala, asik jalan-jalan!'); });
    if (ev.kind === 'missions') enqueue(() => { run('dance'); petSound(info.voice); say('Misi beres! Aku ikut semangat.'); });
    if (ev.kind === 'games') enqueue(() => { run('fly'); petSound(info.voice); say('Wush! Abis main, aku terbang lagi.'); });
    if (ev.kind === 'level') enqueue(() => {
      run('level'); play('level');
      const acc = ACCESSORIES.find(a => a.id === ev.acc);
      say(`${rec.name} naik ke Lv ${ev.level}!${ev.stageUp ? ` Sekarang ${STAGES[ev.stage].name}.` : ''}${acc ? ` Dapat ${acc.name.toLowerCase()} baru.` : ''}`, false, 4200);
      if (ev.stageUp) celebrate([{ kind: 'note', title: `${rec.name} berevolusi!`, text: `${info.species} kesayanganmu sekarang ${STAGES[ev.stage].name} (Lv ${ev.level}).${acc ? ` Dapat ${acc.name.toLowerCase()} ${acc.emoji}.` : ''}` }]);
    });
  }

  // What happened since the last look: meals, the flame, missions, games, Arena XP.
  useEffect(() => {
    if (!ps.ready || !state || !g.state) return;
    const s = g.state;
    const r = syncPet(state, { today, recordedToday: recordedOf(s, today), lit: s.days.includes(today), missions: s.stats?.missions || 0, games: gamesOf(s), xp: s.xp || 0, now: Date.now() }, hourOf, hemat);
    if (r.events.length || countersOf(r.state) !== countersOf(state)) commitPet(r.state);
    r.events.forEach(react);
  }, [ps.ready, state, g.state, today, hemat]); // eslint-disable-line react-hooks/exhaustive-deps

  // A big expense just recorded: it jumps.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const list = data.transactions;
    if (!seen.current) { seen.current = new Set(list.map(t => t.id)); return; }
    const fresh = list.filter(t => !seen.current!.has(t.id)); fresh.forEach(t => seen.current!.add(t.id));
    if (!rec || !fresh.length) return;
    const amounts = list.filter(t => t.type === 'expense').slice(0, 60).map(t => t.amount || 0).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)] || 0, line = Math.max(150_000, median * 3);
    if (fresh.some(t => t.type === 'expense' && (t.amount || 0) >= line)) enqueue(() => { run('kaget'); play('wow'); say('Waduh, pengeluaran gede! Nggak apa-apa, yang penting dicatat.'); });
  }, [data.transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Now and then, something useful (once a while after opening, then every 40 minutes).
  useEffect(() => {
    if (!rec || hidden) return;
    const show = () => {
      const st = g.state, now = Date.now(), hour = hourOf(now); if (!st || moodOf(rec, needsAt(rec, now, hourOf, hemat), hour).id === 'tidur') return;
      const t = petTip(rec, needsAt(rec, now, hourOf, hemat), { hour, recordedToday: recordedOf(st, today), litToday: st.days.includes(today), streak: streakOf(st.days, st.frozen || [], today).current,
        missionsLeft: st.missionDay === today ? Math.max(0, (st.missionIds?.length || 3) - (st.missionsDone?.length || 0)) : 3, spinReady: canSpin(st, today), scratchReady: canScratch(st, today), index: hash(`${uid}:${today}`) + (state?.tipsRead || 0) });
      enqueue(() => { petSound(PETS[rec.kind].voice); say(t.text, true); });
    };
    let first = 0; try { if (!sessionStorage.getItem('dompet-ajaib:pet-tip')) { sessionStorage.setItem('dompet-ajaib:pet-tip', '1'); first = window.setTimeout(show, 14_000); } } catch { first = window.setTimeout(show, 14_000); }
    const every = window.setInterval(show, 40 * 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(every); };
  }, [rec?.kind, hidden, g.state ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!uid || hidden || !ps.state) return ps.sheet ? <PetSheet/> : null;
  const now = Date.now(), hour = hourOf(now);
  const needs = rec ? needsAt(rec, now, hourOf, hemat) : null, mood = rec && needs ? moodOf(rec, needs, hour) : null;
  const egg = rec && needs ? eggReady(rec, needs, today) : false, hungry = Boolean(needs && needs.kenyang < 40 && mood?.id !== 'tidur');
  function giveFood() {
    if (!state || !rec || !info) return;
    const r = feed(state, Date.now(), today, hourOf);
    if (r.ok) { commitPet(r.state); run('eat', info.food.emoji); play('munch'); say(`Nyam! ${capital(info.food.name)} enak, makasih!`); r.events.forEach(react); return; }
    play('bonk');
    say(r.reason === 'full' ? `${rec.name} masih kenyang.` : r.reason === 'limit' ? `Udah ${MEALS_A_DAY}× makan hari ini. Besok lagi ya!` : `Barusan makan. Bisa makan lagi ${waitText(r.waitMs || 0)}.`);
  }

  function tap() {
    if (!state || !rec || !info) return;
    const r = pet(state, Date.now(), hourKey(tz), hourOf);
    if (r.counted) commitPet(r.state);
    run('elus');
    if (mood?.id === 'tidur') { say('Zzz… hoaam, masih ngantuk.'); return; }
    if (rec.kind === 'kucing') play('purr'); else petSound(info.voice);
    if (!r.counted && Math.random() < 0.3) say('Hehe, udah puas dielus. Makasih!');
    r.events.forEach(react);
  }
  function hold() {
    if (!state || !rec || !info) return;
    const r = playPet(state, Date.now(), hourOf);
    if (r.counted) commitPet(r.state);
    run(SPECIAL_FX[rec.kind]); petSound(info.voice);
    if (rec.kind === 'kucing') window.setTimeout(() => play('purr'), 1600);
    r.events.forEach(react);
  }
  const down = (e: React.PointerEvent) => {
    press.current = { t: window.setTimeout(() => { if (press.current) { press.current.long = true; hold(); } }, 450), x: e.clientX, y: e.clientY, long: false };
  };
  const up = () => { const p = press.current; press.current = null; if (!p) return; window.clearTimeout(p.t); if (!p.long) tap(); };
  const cancel = (e?: React.PointerEvent) => { const p = press.current; if (!p) return; if (e && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12) return; window.clearTimeout(p.t); press.current = null; };

  return <>
    <div className={`pet-dock ${rec ? `kind-${rec.kind}` : 'is-empty'} ${mood ? `mood-${mood.id}` : ''}`} aria-live="polite">
      {bubble && <button type="button" key={bubble.id} className={`pet-bubble ${bubble.tip ? 'is-tip' : ''}`} onClick={() => { if (bubble.tip && state) { commitPet(readTip(state, Date.now(), hourOf)); askToTry('home_chat'); } setBubble(null); }}>
        <span>{bubble.text}</span>{bubble.tip && <small>Ketuk buat tanya asisten</small>}
      </button>}
      {rec && info && needs && mood ? <>
        <button type="button" className="pet-name" onClick={() => { play('pop'); openPetSheet(); }} aria-label={`${rec.name}, ${info.species}. ${mood.text} Buka panel pet`}>
          <span className="pet-name-text">{rec.name}</span>{mood.id !== 'biasa' && <Emoji e={mood.emoji}/>}
        </button>
        <button type="button" className="pet-hit" onPointerDown={down} onPointerUp={up} onPointerMove={cancel} onPointerLeave={() => cancel()} onPointerCancel={() => cancel()} onContextMenu={e => e.preventDefault()} aria-label={`Elus ${rec.name} (tahan buat main)`}>
          <PetSprite kind={rec.kind} growth={rec.growth} acc={rec.acc} size={46} sleeping={mood.id === 'tidur'} fx={fx}/>
          <PetParts parts={parts}/>
        </button>
        {hungry && <button type="button" className="pet-food" onClick={giveFood} aria-label={`Kasih ${info.food.name} ke ${rec.name}`}><Emoji e={info.food.emoji}/></button>}
        {egg && <button type="button" className="pet-egg" onClick={() => { if (!state) return; const n = (rec.eggs || 0) + 1; commitPet(collectEgg(state, today)); run('egg'); play('gem'); say(`Telur emas ke-${n}! Makasih udah ngerawat ${rec.name}.`); }} aria-label="Ambil telur emas"><Emoji e="🥚"/></button>}
      </> : <button type="button" className="pet-adopt" onClick={() => { play('pop'); openPetSheet(); }} aria-label="Adopsi pet"><Emoji e="🎁"/><span>Adopsi pet</span></button>}
    </div>
    {ps.sheet && <PetSheet/>}
  </>;
}
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
