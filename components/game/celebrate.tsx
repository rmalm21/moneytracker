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
import { flameOf, levelOf, nextFlame, titleOfLevel } from '@/lib/game';
import { play } from '@/lib/game-sound';

const FIRE = ['#ff7a1a', '#ffc24b', '#ff4d1a', '#fff2b3', '#ff4d6d'];
function useCount(to: number, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(to); return; }
    const start = performance.now(); let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return n;
}

/** A big celebration waits while another window is open (a dialog, "Apa yang baru", the PIN screen): a modal there
 * holds every tap outside it, so the celebration's button could not be pressed. */
const BUSY = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], .pin-screen, .onboarding';
const big = (c?: Celebration) => Boolean(c) && !['lit', 'mission', 'shield-full'].includes(c!.kind);
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
    else if (k === 'badge' || k === 'challenge' || k === 'shared-badge') { play('badge'); confetti({ count: 200, colors: k === 'challenge' ? undefined : FIRE }); }
    else if (k === 'missions-all') { play('badge'); confetti({ count: 140 }); }
    else if (k === 'shield-earned' || k === 'shield-used') play('shield');
    else if (k === 'welcome') { play('lit'); confetti({ count: 120, colors: FIRE }); }
    else if (k === 'shield-full') play('mission');
    if (k === 'mission' || k === 'shield-full') { const t = window.setTimeout(nextCelebration, 2600); return () => window.clearTimeout(t); }
    if (k === 'lit') { const t = window.setTimeout(nextCelebration, 3200); return () => window.clearTimeout(t); }
  }, [item]);
  if (!mounted || !item) return null;
  const k = item.kind;
  if (k === 'mission' || k === 'shield-full') return createPortal(<div className="cel-toast" role="status" onClick={nextCelebration}>
    <span className="cel-toast-ic"><Emoji e={k === 'mission' ? '✅' : '🛡️'}/></span>
    <span><b>{k === 'mission' ? 'Misi selesai!' : 'Perisai sudah penuh'}</b><small>{k === 'mission' ? item.title : 'Diganti jadi XP'}</small></span>
    <strong className="cel-xp">+{item.xp} XP</strong>
  </div>, document.body);
  if (k === 'lit') return createPortal(<LitPop streak={item.streak} xp={item.xp} checkin={item.checkin}/>, document.body);
  return createPortal(<BigCard item={item} xp={state?.xp || 0}/>, document.body);
}

function LitPop({ streak, xp, checkin }: { streak: number; xp: number; checkin: boolean }) {
  const n = useCount(streak, 800), f = flameOf(streak);
  return <div className="cel-pop" role="status" onClick={nextCelebration}>
    <div className="cel-pop-flame"><Flame tier={f.tier} size={96}/></div>
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
        <ul className="cel-rules"><li><Emoji e="🔥"/> Catat atau cek-in tiap hari, apimu makin besar dan berubah warna</li><li><Emoji e="🛡️"/> Perisai Api menyelamatkan streak kalau kamu lupa sehari</li><li><Emoji e="🎯"/> 3 misi harian dan 1 tantangan mingguan buat kumpulin XP</li><li><Emoji e="🏆"/> Naik level dan buka lencana di 3, 7, 14, 30 sampai 365 hari</li></ul></>;
      reward = [item.xp ? `+${item.xp} XP bonus pembuka` : '', item.shields ? `${item.shields} Perisai hadiah` : ''].filter(Boolean).join(' · '); button = 'Gas, mulai!'; break;
    }
    case 'badge': visual = <span className="cel-emoji"><Emoji e="🏆"/></span>; kicker = 'Lencana baru'; title = item.name; body = <p><b>{item.days} hari</b> berturut-turut mencatat. Keren banget!</p>; reward = `+${item.xp} XP`; tone = 'gold'; break;
    case 'level': { const next = titleOfLevel(item.level + 1); visual = <span className="cel-level"><span className="cel-level-n">{item.level}</span><span className="cel-level-emoji"><Emoji e={item.emoji}/></span></span>; kicker = 'Naik level!'; title = item.title; body = <p>Kamu sekarang <b>Level {item.level}</b>. Berikutnya: {next.title} di {next.from.toLocaleString('id-ID')} XP.</p>; tone = 'level'; break; }
    case 'shield-earned': visual = <span className="cel-emoji"><Emoji e="🛡️"/></span>; kicker = 'Hadiah 7 hari'; title = 'Dapat Perisai Api!'; body = <p>Kamu punya <b>{item.shields} perisai</b>. Kalau lupa mencatat sehari, perisai otomatis menyelamatkan apimu.</p>; tone = 'ice'; break;
    case 'shield-used': visual = <span className="cel-emoji is-shake"><Emoji e="🛡️"/></span>; kicker = 'Fiuh, selamat!'; title = 'Perisai menyelamatkan apimu'; body = <p>{item.days.length > 1 ? `${item.days.length} hari` : 'Kemarin'} kamu belum mencatat, tapi api <b>{item.streak} hari</b> tetap aman. Yuk catat hari ini!</p>; tone = 'ice'; break;
    case 'broken': visual = <Flame tier={0} size={130}/>; kicker = 'Apimu padam'; title = `Streak ${item.was} hari berakhir`; body = <p>Nggak apa-apa! Rekormu tetap <b>{item.best} hari</b>. Catat 1 transaksi atau cek-in hari ini untuk menyalakan lagi.</p>; button = 'Nyalakan lagi'; calm = true; tone = 'calm'; break;
    case 'missions-all': visual = <span className="cel-emoji"><Emoji e="🎉"/></span>; kicker = 'Misi harian'; title = 'Semua misi hari ini tuntas!'; body = <p>Besok ada 3 misi baru. Pertahankan!</p>; reward = `+${item.xp} XP bonus`; tone = 'level'; break;
    case 'challenge': visual = <span className="cel-emoji"><Emoji e="🎯"/></span>; kicker = 'Tantangan mingguan'; title = 'Tantangan berhasil!'; body = <p>{item.title}</p>; reward = `+${item.xp} XP`; tone = 'gold'; break;
    case 'shared-badge': visual = <Flame tier={flameOf(item.days).tier} size={140}/>; kicker = `Api bareng ${item.space}`; title = `${item.days} hari nyala bareng!`; body = <p>Lencana bareng: <b>{item.name}</b>. Semua anggota mencatat {item.days} hari berturut-turut.</p>; tone = 'gold'; break;
    default: return null;
  }
  const nf = item.kind === 'welcome' ? nextFlame(item.streak) : null;
  return <div className={`cel-overlay tone-${tone} ${calm ? 'is-calm' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) nextCelebration(); }}>
    {!calm && <div className="cel-rays" aria-hidden="true"/>}
    <div className="cel-card">
      <div className="cel-visual">{visual}</div>
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
