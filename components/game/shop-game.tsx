'use client';
/**
 * 9.7 Belanja Bijak on screen: a week's money, one card at a time. Swipe right (or Beli) to buy, left (or Lewat) to
 * skip; something urgent has to be paid (Bayar), extra money is taken (Terima). Each decision says right away whether
 * it was wise. The end: score, stars, the 50/30/20 report, the day's mission, tips, the five best. Rules: lib/belanja.ts.
 */
import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Emoji } from '../emoji';
import { confetti } from './confetti';
import { gameActions, useGame, type ArcadeOutcome } from './game-store';
import { useMiniGameStatus } from './minigame-status';
import { useApp } from '../app-provider';
import { dealRound, SCENARIOS, scoreRound, SHOP_STAR, shopMission, shopMissionDone, verdict, type Scenario, type ShopItem, type ShopResult, type Verdict } from '@/lib/belanja';
import { play } from '@/lib/game-sound';
import { todayInTimeZone } from '@/lib/period';

const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const KIND_LABEL = { need: 'Kebutuhan', want: 'Keinginan', trap: 'Godaan', urgent: 'Darurat!', bonus: 'Uang masuk' } as const;

export function ShopGame({ onClose }: { onClose: () => void }) {
  const st = useMiniGameStatus(), { account, personalProfile } = useApp(), g = useGame();
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  const mission = shopMission(account?.uid || '', today);
  const [round, setRound] = useState<{ scenario: Scenario; cards: ShopItem[] }>(() => dealRound(Math.random));
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [k, setK] = useState(0), [buys, setBuys] = useState<boolean[]>([]), [got, setGot] = useState<boolean[]>([]), [left, setLeft] = useState(round.scenario.budget);
  const [fly, setFly] = useState<'l' | 'r' | 'up' | null>(null), [say, setSay] = useState<(Verdict & { id: number }) | null>(null), [streak, setStreak] = useState(0);
  const [result, setResult] = useState<{ r: ShopResult; out: ArcadeOutcome | null; missionOk: boolean; wasDone: boolean } | null>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null), cardRef = useRef<HTMLDivElement>(null), sayTimer = useRef(0);

  function start() { const next = dealRound(Math.random); setRound(next); setK(0); setBuys([]); setGot([]); setLeft(next.scenario.budget); setResult(null); setSay(null); setStreak(0); setPhase('play'); play('go'); }
  const tell = (v: Verdict) => { window.clearTimeout(sayTimer.current); setSay({ ...v, id: Math.random() }); sayTimer.current = window.setTimeout(() => setSay(null), 2200); };
  function decide(buy: boolean) {
    if (fly || phase !== 'play') return;
    const card = round.cards[k]; let bought = buy, paid = true;
    if (card.kind === 'bonus') { bought = true; setLeft(l => l + card.price); play('coin'); }
    else if (card.kind === 'urgent') { bought = true; paid = card.price <= left; setLeft(l => Math.max(0, l - card.price)); play(paid ? 'step' : 'bonk'); }
    else if (buy && card.price > left) { bought = false; tell({ tone: 'bad', text: `Uangnya kurang buat ${card.name.toLowerCase()}. Nggak jadi kebeli.` }); play('bonk'); }
    else if (buy) { setLeft(l => l - card.price); play(card.kind === 'trap' ? 'bonk' : 'coin'); }
    else play('step');
    const v = verdict(card, buy, paid);
    if (!(buy && card.price > left && card.kind !== 'bonus' && card.kind !== 'urgent')) tell(v);
    if (card.kind !== 'bonus' && card.kind !== 'urgent') setStreak(s => v.tone === 'good' ? s + 1 : 0);
    setFly(card.kind === 'bonus' || card.kind === 'urgent' ? 'up' : bought ? 'r' : 'l');
    const nextBuys = [...buys, card.kind === 'bonus' || card.kind === 'urgent' ? true : buy]; setGot(list => [...list, bought]);
    window.setTimeout(() => {
      setFly(null); setBuys(nextBuys);
      if (k + 1 >= round.cards.length) finish(nextBuys); else setK(k + 1);
      const el = cardRef.current; if (el) el.style.transform = '';
    }, 280);
  }
  function finish(all: boolean[]) {
    const r = scoreRound(round.scenario, round.cards, all), missionOk = shopMissionDone(mission, r), wasDone = Boolean(st?.shop.missionDone);
    const out = gameActions().arcadeDone('shop', r.score, missionOk);
    play(out?.record ? 'jackpot' : r.stars >= 2 ? 'achievement' : 'over');
    if (r.stars === 3 || out?.record) confetti({ count: 200, colors: ['#7dffc0', '#ffe58a', '#9be7ff', '#ffffff'] });
    setResult({ r, out, missionOk, wasDone }); setPhase('over');
  }
  // Swipe the card.
  const card = round.cards[k], sc = round.scenario, forced = card?.kind === 'urgent' || card?.kind === 'bonus';
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, dx: 0 }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current, el = cardRef.current; if (!d || !el) return; d.dx = e.clientX - d.x; el.style.transform = `translateX(${d.dx}px) rotate(${d.dx / 18}deg)`; el.dataset.lean = forced ? (Math.abs(d.dx) > 30 ? 'r' : '') : d.dx > 30 ? 'r' : d.dx < -30 ? 'l' : ''; };
  const onUp = () => { const d = drag.current, el = cardRef.current; drag.current = null; if (!d) return; if (el) el.dataset.lean = ''; if (Math.abs(d.dx) > 80) decide(forced ? true : d.dx > 0); else if (el) el.style.transform = ''; };

  const total = sc.budget + round.cards.slice(0, k).filter(c => c.kind === 'bonus').reduce((n, c) => n + c.price, 0);
  const leftPct = Math.max(0, Math.min(100, left / Math.max(total, 1) * 100));
  const needs = round.cards.filter(c => c.kind === 'need');
  const boughtIds = new Set(round.cards.filter((c, i) => got[i]).map(c => c.id));
  const missionNote = (x: NonNullable<typeof result>) => !x.missionOk ? 'Belum tercapai, coba lagi!' : x.out?.missionXp ? `+${x.out.missionXp} XP bonus misi` : x.wasDone ? 'Bonus misi hari ini sudah diambil' : 'XP hari ini sudah penuh, bonusnya nggak nambah lagi';
  return <div className="mg-overlay mg-shop" role="dialog" aria-modal="true" aria-label="Belanja Bijak">
    <div className="mg-hud">
      <button type="button" className="mg-close is-inline" onClick={onClose} aria-label="Tutup"><X size={20}/></button>
      <span className="mg-score"><Emoji e="👛"/><b>{rp(left)}</b></span>
      {phase === 'play' && <span className="mg-wave">{k + 1}/{round.cards.length}</span>}
    </div>
    {phase === 'play' && card && <>
      <div className="bb-scene"><Emoji e={sc.emoji}/><b>{sc.title}</b><small>{sc.who}: {rp(sc.budget)}</small></div>
      <div className="bb-wallet" aria-hidden="true"><i style={{ width: `${leftPct}%` }} className={leftPct < 20 ? 'is-low' : ''}/></div>
      <div className="bb-needs">{needs.map(n => <span key={n.id} className={boughtIds.has(n.id) ? 'is-got' : ''} title={n.name}><Emoji e={n.emoji}/>{boughtIds.has(n.id) && <Check size={10}/>}</span>)}<small>kebutuhan</small>{streak >= 3 && <em className="bb-streak"><Emoji e="🔥"/> {streak} tepat</em>}</div>
      <div className="bb-stage">
        {round.cards[k + 1] && <div className="bb-card is-next" aria-hidden="true"/>}
        <div key={card.id + k} ref={cardRef} className={`bb-card kind-${card.kind} ${fly ? `fly-${fly}` : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {forced ? <span className="bb-stamp is-buy">{card.kind === 'bonus' ? 'TERIMA' : 'BAYAR'}</span> : <><span className="bb-stamp is-buy">BELI</span><span className="bb-stamp is-skip">LEWAT</span></>}
          <span className="bb-emoji"><Emoji e={card.emoji}/></span>
          <small className="bb-kind">{KIND_LABEL[card.kind]}</small>
          <strong>{card.name}</strong>
          <b className="bb-price">{card.kind === 'bonus' ? '+' : ''}{rp(card.price)}</b>
          {card.kind === 'urgent' && <small className="bb-warn">{card.price > left ? `Uangmu tinggal ${rp(left)}, sisanya jadi utang` : 'Harus dibayar sekarang'}</small>}
          {!forced && card.price > left && <small className="bb-warn">Uangmu tinggal {rp(left)}</small>}
        </div>
      </div>
      <p className={`bb-say ${say ? `is-${say.tone}` : 'is-empty'}`} role="status" key={say?.id}>{say?.text || ' '}</p>
      <div className="bb-actions">
        {forced ? <button type="button" className="bb-btn is-buy is-wide" onClick={() => decide(true)}><Check size={24}/><span>{card.kind === 'bonus' ? 'Terima' : 'Bayar'}</span></button>
          : <><button type="button" className="bb-btn is-skip" onClick={() => decide(false)} aria-label="Lewat"><X size={26}/><span>Lewat</span></button>
            <button type="button" className="bb-btn is-buy" onClick={() => decide(true)} aria-label="Beli"><Check size={26}/><span>Beli</span></button></>}
      </div>
    </>}
    {phase === 'ready' && <div className="mg-card is-intro">
      <span className="mg-card-ic"><Emoji e="🛒"/></span>
      <h2>Belanja Bijak</h2>
      <p>Kamu dapat <b>uang seminggu</b>. Barang muncul satu per satu: geser <b>kanan buat beli</b>, <b>kiri buat lewat</b>.</p>
      <ul className="bb-rules">
        <li><Emoji e="✅"/><span>Penuhi semua <b>kebutuhan</b></span></li>
        <li><Emoji e="🛍️"/><span>Hindari <b>godaan</b>: flash sale, paylater, pinjol, investasi bodong</span></li>
        <li><Emoji e="🔧"/><span>Ada <b>kejadian darurat</b> di tengah jalan. Sisakan uang biar nggak ngutang</span></li>
        <li><Emoji e="🐷"/><span>Sisakan minimal <b>20%</b> buat ditabung</span></li>
      </ul>
      <div className="bb-scenes" aria-label="Skenario">{SCENARIOS.map(s => <span key={s.id}><Emoji e={s.emoji}/>{s.title}</span>)}</div>
      <div className={`mg-mission ${st?.shop.missionDone ? 'is-done' : ''}`}><small>Misi hari ini {st?.shop.missionDone ? '· selesai ✓' : '· +5 XP'}</small><b>{mission.text}</b></div>
      <small className="mg-meta">Bintang di {SHOP_STAR.join(' · ')} · Rekor <b>{st?.shop.best || 0}</b> · XP hari ini {st ? st.shop.cap - st.shop.xpLeft : 0}/{st?.shop.cap ?? 20}</small>
      <button type="button" className="mg-btn is-gold" onClick={start}>Mulai belanja</button>
    </div>}
    {phase === 'over' && result && <div className="mg-card is-result">
      {result.out?.record && <span className="mg-record">Rekor baru!</span>}
      <span className="mg-stars-row" aria-label={`${result.r.stars} bintang`}>{[1, 2, 3].map(n => <i key={n} className={n <= result.r.stars ? 'on' : ''} style={{ '--i': n } as React.CSSProperties}><Emoji e="⭐"/></i>)}</span>
      <span className="bb-ring" style={{ '--p': `${result.r.score}%` } as React.CSSProperties}><b>{result.r.score}</b><small>/100</small></span>
      <strong className="bb-title">{result.r.title}</strong>
      <div className="bb-split" aria-label="Rapor 50/30/20">
        <div className="bb-split-bar"><i className="is-need" style={{ width: `${result.r.split.needs}%` }}/><i className="is-want" style={{ width: `${result.r.split.wants}%` }}/><i className="is-save" style={{ width: `${result.r.split.saved}%` }}/></div>
        <div className="bb-split-legend">
          <span><i className="is-need"/>Kebutuhan <b>{result.r.split.needs}%</b><small>patokan 50%</small></span>
          <span><i className="is-want"/>Keinginan <b>{result.r.split.wants}%</b><small>patokan 30%</small></span>
          <span><i className="is-save"/>Ditabung <b>{result.r.split.saved}%</b><small>patokan 20%</small></span>
        </div>
      </div>
      <div className="mg-stats"><span><Emoji e="✅"/><b>{result.r.needsGot}/{result.r.needsTotal}</b><small>kebutuhan</small></span><span><Emoji e="🛍️"/><b>{result.r.trapsBought.length}</b><small>kena godaan</small></span><span><Emoji e="🔧"/><b>{result.r.urgentPaid ? 'Aman' : 'Utang'}</b><small>darurat</small></span><span><Emoji e="🎯"/><b>{result.r.good}/{result.r.decisions}</b><small>keputusan tepat</small></span></div>
      <div className={`mg-mission ${result.missionOk ? 'is-done' : ''}`}><small>Misi hari ini</small><b>{result.missionOk ? '✓ ' : ''}{mission.text}</b><small>{missionNote(result)}</small></div>
      <ul className="bb-tips">{result.r.tips.map(t => <li key={t}>{t}</li>)}</ul>
      <p className="mg-xp">{result.out ? result.out.xp ? `+${result.out.xp} XP` : 'XP hari ini sudah penuh. Coba skenario lain buat rekor!' : ''}</p>
      {(result.out?.top || []).length > 0 && <ol className="mg-top" aria-label="Skor terbaikmu">{result.out!.top.map((n, i) => <li key={i} className={n === result.r.score ? 'is-now' : ''}><small>#{i + 1}</small><b>{n}</b></li>)}</ol>}
      <small className="mg-meta">{sc.emoji} {sc.who}: {rp(sc.budget)}{result.r.income ? ` + uang masuk ${rp(result.r.income)}` : ''} · sisa {rp(result.r.left)}</small>
      <div className="mg-row"><button type="button" className="mg-btn" onClick={onClose}>Selesai</button><button type="button" className="mg-btn is-gold" onClick={start}>Main lagi</button></div>
    </div>}
  </div>;
}
