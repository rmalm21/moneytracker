'use client';
/**
 * 9.4 Arena celebrations, one after another: a full card for the big moments (welcome, badge, level, perisai,
 * challenge, all missions, api bareng), a pop when today's flame lights, a toast when a mission is done. With
 * confetti, a sound and a buzz (both can be turned off in Pengaturan → Tampilan).
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Emoji } from '../emoji';
import { Flame } from './flame';
import { confetti } from './confetti';
import { nextCelebration, useGame, type Celebration } from './game-store';
import { BADGES, flameOf, levelOf, nextFlame, streakTier, TIERS, titleOfLevel, type Tier } from '@/lib/game';
import { play } from '@/lib/game-sound';

const FIRE = ['#ff7a1a', '#ffc24b', '#ff4d1a', '#fff2b3', '#ff4d6d'];
const TIER_COLORS: Record<Tier, string[]> = { perunggu: ['#e9a66b', '#c27a3d', '#ffd7b0', '#fff'], perak: ['#eef2f6', '#c0c7d1', '#9aa4b1', '#ffffff', '#cfe3ff'], emas: ['#ffe58a', '#f4c542', '#ffb800', '#fff6cc', '#ffffff'], legenda: ['#b06bff', '#ff6bd6', '#6bd0ff', '#ffe58a', '#ffffff'] };
const ORDER: Tier[] = ['perunggu', 'perak', 'emas', 'legenda'];
const toneOf = (t: Tier) => t === 'legenda' ? 'legend' : t === 'perunggu' ? 'bronze' : t === 'perak' ? 'silver' : 'gold';
const topTier = (tiers: Tier[]) => tiers.reduce<Tier>((a, t) => ORDER.indexOf(t) > ORDER.indexOf(a) ? t : a, 'perunggu');
function useCount(to: number, ms = 900, from = 0) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(to); return; }
    const start = performance.now(); let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); setN(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [to, ms, from]);
  return n;
}

/** A big celebration waits while another window is open (a dialog, "Apa yang baru", the PIN screen): a modal there
 * holds every tap outside it, so the celebration's button could not be pressed. */
const BUSY = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], .pin-screen, .onboarding, .mg-overlay';
const big = (c?: Celebration) => Boolean(c) && !['lit', 'mission', 'shield-full', 'note'].includes(c!.kind);
function useFree(wanted: boolean) {
  const [free, setFree] = useState(false);
  useEffect(() => {
    if (!wanted) { setFree(false); return; }
    const check = () => setFree(!document.querySelector(BUSY));
    check(); const t = window.setInterval(check, 600); return () => window.clearInterval(t);
  }, [wanted]);
  return free;
}

export function Celebrations() {
  const { queue, state } = useGame();
  const head = queue[0], free = useFree(big(head));
  const item = big(head) && !free ? undefined : head;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Sound, buzz and confetti as each one appears; the small ones go by themselves.
  useEffect(() => {
    if (!item) return;
    const k = item.kind;
    if (k === 'lit') { play('lit'); confetti({ count: 60, colors: FIRE, spread: .6, origin: { x: .5, y: .62 } }); }
    else if (k === 'mission') play('mission');
    else if (k === 'level') { play('level'); confetti({ count: 180 }); }
    else if (k === 'badge') { play('badge'); confetti({ count: 200, colors: TIER_COLORS[streakTier(item.days)] }); }
    else if (k === 'challenge' || k === 'shared-badge') { play('badge'); confetti({ count: 200, colors: k === 'challenge' ? undefined : FIRE }); }
    else if (k === 'missions-all') { play('badge'); confetti({ count: 140 }); }
    else if (k === 'shield-earned' || k === 'shield-used') play('shield');
    else if (k === 'welcome') { play('welcome'); confetti({ count: 160, colors: FIRE }); }
    else if (k === 'shield-full') play('mission');
    else if (k === 'broken') play('broken');
    else if (k === 'achievements') { play('achievement'); confetti({ count: 220, colors: TIER_COLORS[topTier(item.items.map(x => x.tier))] }); const t = window.setTimeout(() => confetti({ count: 120, origin: { x: .2, y: .5 } }), 500), u = window.setTimeout(() => confetti({ count: 120, origin: { x: .8, y: .5 } }), 800); return () => { window.clearTimeout(t); window.clearTimeout(u); }; }
    if (k === 'mission' || k === 'shield-full' || k === 'note') { const t = window.setTimeout(nextCelebration, 2600); return () => window.clearTimeout(t); }
    if (k === 'lit') { const t = window.setTimeout(nextCelebration, 3200); return () => window.clearTimeout(t); }
  }, [item]);
  if (!mounted || !item) return null;
  const k = item.kind;
  if (k === 'note') return createPortal(<div className="cel-toast is-note" role="status" onClick={nextCelebration}>
    <span className="cel-toast-ic"><Emoji e="🔥"/></span>
    <span><b>{item.title}</b><small>{item.text}</small></span>
  </div>, document.body);
  if (k === 'mission' || k === 'shield-full') return createPortal(<div className="cel-toast" role="status" onClick={nextCelebration}>
    <span className="cel-toast-ic"><Emoji e={k === 'mission' ? '✅' : '🛡️'}/></span>
    <span><b>{k === 'mission' ? 'Misi selesai!' : 'Perisai sudah penuh'}</b><small>{k === 'mission' ? item.title : 'Diganti jadi XP'}</small></span>
    <strong className="cel-xp">+{item.xp} XP</strong>
  </div>, document.body);
  if (k === 'lit') return createPortal(<LitPop streak={item.streak} xp={item.xp} checkin={item.checkin}/>, document.body);
  return createPortal(<BigCard item={item} xp={state?.xp || 0}/>, document.body);
}

function LitPop({ streak, xp, checkin }: { streak: number; xp: number; checkin: boolean }) {
  const n = useCount(streak, 700, Math.max(0, streak - 1)), f = flameOf(streak);
  return <div className="cel-pop" role="status" onClick={nextCelebration}>
    <div className="cel-pop-flame"><span className="cel-pop-ring" aria-hidden="true"/><Flame tier={f.tier} size={96}/></div>
    <div className="cel-pop-text"><small>{checkin ? 'Hari aman tercatat' : 'Api nyala!'}</small><strong>Hari ke-{n}</strong><span className="cel-xp">+{xp} XP</span></div>
  </div>;
}

function BigCard({ item, xp }: { item: Celebration; xp: number }) {
  const lv = levelOf(xp);
  let visual: React.ReactNode, kicker = '', title = '', body: React.ReactNode = null, reward = '', button = 'Mantap!', calm = false, tone = 'fire';
  switch (item.kind) {
    case 'welcome': {
      const f = flameOf(item.streak);
      visual = <Flame tier={f.tier || 1} size={150}/>; kicker = 'Fitur baru'; title = 'Selamat datang di Arena Catat!';
      body = <><p>{item.streak ? <>Dari catatanmu selama ini, apimu sudah nyala <b>{item.streak} hari</b> berturut-turut. Jaga terus!</> : <>Nyalakan api pertamamu hari ini: catat 1 transaksi, atau ketuk <b>Hari ini aman</b> kalau memang nggak ada transaksi.</>}</p>
        <ul className="cel-rules"><li><Emoji e="🔥"/> Catat atau cek-in tiap hari, apimu makin besar dan berubah warna</li><li><Emoji e="🛡️"/> Perisai Api menyelamatkan streak kalau kamu lupa sehari</li><li><Emoji e="🎯"/> 3 misi harian dan 1 tantangan mingguan buat kumpulin XP</li><li><Emoji e="🏅"/> Naik level dan kumpulkan 30 lencana, dari Perunggu sampai Legenda</li></ul></>;
      reward = [item.xp ? `+${item.xp} XP bonus pembuka` : '', item.shields ? `${item.shields} Perisai hadiah` : ''].filter(Boolean).join(' · '); button = 'Gas, mulai!'; break;
    }
    case 'badge': { const b = BADGES.find(x => x.days === item.days), t = streakTier(item.days); visual = <span className={`cel-medal tier-${t}`}><Emoji e={b?.emoji || '🔥'}/></span>; kicker = `Lencana ${TIERS[t].name}`; title = item.name; } body = <p><b>{item.days} hari</b> berturut-turut mencatat. Keren banget!</p>; reward = `+${item.xp} XP`; tone = toneOf(streakTier(item.days)); break;
    case 'level': { const next = titleOfLevel(item.level + 1); visual = <span className="cel-level"><span className="cel-level-n">{item.level}</span><span className="cel-level-emoji"><Emoji e={item.emoji}/></span></span>; kicker = 'Naik level!'; title = item.title; body = <p>Kamu sekarang <b>Level {item.level}</b>. Berikutnya: {next.title} di {next.from.toLocaleString('id-ID')} XP.</p>; tone = 'level'; break; }
    case 'shield-earned': visual = <span className="cel-emoji"><Emoji e="🛡️"/></span>; kicker = 'Hadiah 7 hari'; title = 'Dapat Perisai Api!'; body = <p>Kamu punya <b>{item.shields} perisai</b>. Kalau lupa mencatat sehari, perisai otomatis menyelamatkan apimu.</p>; tone = 'ice'; break;
    case 'shield-used': visual = <span className="cel-emoji is-shake"><Emoji e="🛡️"/></span>; kicker = 'Fiuh, selamat!'; title = 'Perisai menyelamatkan apimu'; body = <p>{item.days.length > 1 ? `${item.days.length} hari` : 'Kemarin'} kamu belum mencatat, tapi api <b>{item.streak} hari</b> tetap aman. Yuk catat hari ini!</p>; tone = 'ice'; break;
    case 'broken': visual = <Flame tier={0} size={130}/>; kicker = 'Apimu padam'; title = `Streak ${item.was} hari berakhir`; body = <p>Nggak apa-apa! Rekormu tetap <b>{item.best} hari</b>. Catat 1 transaksi atau cek-in hari ini untuk menyalakan lagi.</p>; button = 'Nyalakan lagi'; calm = true; tone = 'calm'; break;
    case 'missions-all': visual = <span className="cel-emoji"><Emoji e="🎉"/></span>; kicker = 'Misi harian'; title = 'Semua misi hari ini tuntas!'; body = <p>Besok ada 3 misi baru. Pertahankan!</p>; reward = `+${item.xp} XP bonus`; tone = 'level'; break;
    case 'challenge': visual = <span className="cel-emoji"><Emoji e="🎯"/></span>; kicker = 'Tantangan mingguan'; title = 'Tantangan berhasil!'; body = <p>{item.title}</p>; reward = `+${item.xp} XP`; tone = 'gold'; break;
    case 'achievements': {
      const items = item.items, top = topTier(items.map(x => x.tier)), sum = items.reduce((n, x) => n + x.xp, 0);
      visual = items.length === 1 ? <span className={`cel-medal tier-${items[0].tier}`}><Emoji e={items[0].emoji}/></span>
        : <span className="cel-medals">{items.slice(0, 4).map((x, i) => <span key={x.id} className={`cel-medal is-small tier-${x.tier}`} style={{ '--i': i } as React.CSSProperties}><Emoji e={x.emoji}/></span>)}</span>;
      kicker = items.length === 1 ? `Lencana ${TIERS[items[0].tier].name}` : 'Lencana baru';
      title = items.length === 1 ? items[0].name : `${items.length} lencana sekaligus!`;
      body = items.length === 1 ? <p>{items[0].desc}</p> : <ul className="cel-ach">{items.map(x => <li key={x.id} className={`tier-${x.tier}`}><Emoji e={x.emoji}/><span><b>{x.name}</b><small>{TIERS[x.tier].name} · {x.desc}</small></span></li>)}</ul>;
      reward = `+${sum} XP`; tone = toneOf(top); button = 'Keren!'; break;
    }
    case 'shared-badge': visual = <Flame tier={flameOf(item.days).tier} size={140}/>; kicker = `Api bareng ${item.space}`; title = `${item.days} hari nyala bareng!`; body = <p>Lencana bareng: <b>{item.name}</b>. Semua anggota mencatat {item.days} hari berturut-turut.</p>; tone = 'gold'; break;
    default: return null;
  }
  const nf = item.kind === 'welcome' ? nextFlame(item.streak) : null;
  return <div className={`cel-overlay tone-${tone} ${calm ? 'is-calm' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) nextCelebration(); }}>
    {!calm && <div className="cel-rays" aria-hidden="true"/>}
    <div className="cel-card">
      <div className="cel-visual">{!calm && <><span className="cel-shock" aria-hidden="true"/><span className="cel-stars" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg`, '--d': `${(i % 3) * 0.25}s` } as React.CSSProperties}/>)}</span></>}{visual}</div>
      <small className="cel-kicker">{kicker}</small>
      <h2 className="cel-title">{title}</h2>
      <div className="cel-body">{body}</div>
      {nf && item.kind === 'welcome' && item.streak > 0 && <small className="cel-next">{nf.from - item.streak} hari lagi jadi {nf.name}</small>}
      {reward && <div className="cel-reward">{reward}</div>}
      <small className="cel-total">Level {lv.level} · {lv.title} · {xp.toLocaleString('id-ID')} XP</small>
      <button type="button" className="cel-btn" onClick={nextCelebration} autoFocus>{button}</button>
    </div>
  </div>;
}
