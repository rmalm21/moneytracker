'use client';
/**
 * 9.4 Arena Catat on Beranda (Pribadi): the flame and its streak, this week's days, level and XP, today's missions and
 * this week's challenge, "Hari ini aman" for a day with nothing to record; tap for the whole Arena (badges, rules).
 */
import { useEffect, useState } from 'react';
import { ChevronRight, Lock, Volume2, VolumeX } from 'lucide-react';
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { Dialog, DialogContent } from '../ui/dialog';
import { Flame } from './flame';
import { arenaHidden, gameActions, setArenaHidden, useGame } from './game-store';
import { rupiah } from '@/lib/accounting';
import { addDays, BADGES, flameOf, levelOf, MAX_SHIELDS, MISSION_BONUS, missionById, mondayOf, nextFlame, streakOf, titleOfLevel, type GameState } from '@/lib/game';
import { setSoundOn, soundOn } from '@/lib/game-sound';
import { todayInTimeZone } from '@/lib/period';

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** "Hari ini aman": asked twice so it is a real answer, not a slip of the thumb. */
function CheckinButton({ compact = false }: { compact?: boolean }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = window.setTimeout(() => setSure(false), 3500); return () => window.clearTimeout(t); }, [sure]);
  return <button type="button" className={`arena-checkin ${sure ? 'is-sure' : ''} ${compact ? 'is-compact' : ''}`} onClick={e => { e.stopPropagation(); if (sure) { setSure(false); gameActions().checkin(); } else setSure(true); }}>
    {sure ? 'Yakin nggak ada transaksi? Ketuk lagi' : <><Emoji e="✅"/> Hari ini aman</>}
  </button>;
}

function useArena() {
  const g = useGame(), { personalProfile } = useApp();
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  return { g, today, v: g.state ? viewOf(g.state, today) : null };
}
function viewOf(s: GameState, today: string) {
  const st = streakOf(s.days, s.frozen, today), flame = flameOf(st.current), lv = levelOf(s.xp), monday = mondayOf(today);
  const week = DAYS.map((label, i) => { const day = addDays(monday, i); return { label, day, state: s.days.includes(day) ? 'lit' : s.frozen.includes(day) ? 'ice' : day === today ? 'today' : day > today ? 'future' : 'miss' }; });
  const created = Object.values(s.txCounted || {}).reduce((n, v) => n + v, 0);
  const missions = (s.missionDay === today ? s.missionIds : []).map(id => ({ m: missionById(id)!, done: s.missionsDone.includes(id) })).filter(x => x.m);
  return { s, st, flame, lv, week, created, missions };
}

export function ArenaCard() {
  const { account } = useApp();
  const a = useArena(), [open, setOpen] = useState(false);
  if (!account || arenaHidden(account.uid)) return null;
  if (!a.v) return a.g.ready ? <section className="arena-card is-loading" aria-label="Arena Catat"><Flame tier={1} size={56}/><div><strong>Menyalakan Arena Catat…</strong><small>Menghitung apimu dari catatan selama ini</small></div></section> : null;
  const { s, st, flame, lv, week, created, missions } = a.v, g = a.g;
  const evening = g.hour >= 18 && st.atRisk, left = 24 - g.hour;
  const doneCount = missions.filter(x => x.done).length;
  const status = st.litToday ? (s.checkins.includes(a.today) ? 'Hari aman tercatat. Api tetap nyala!' : 'Hari ini sudah nyala. Mantap!')
    : st.current ? (evening ? `Hampir padam! Sisa ±${left} jam lagi` : 'Belum nyala hari ini. Catat 1 transaksi atau cek-in')
    : 'Nyalakan api: catat 1 transaksi hari ini';
  const ch = s.challenge, cv = g.challengeView;
  return <>
    <section className={`arena-card t${flame.tier} ${evening ? 'is-danger' : ''} ${st.litToday ? 'is-lit' : ''}`} aria-label="Arena Catat">
      <span className="arena-bg" aria-hidden="true"/>
      <button type="button" className="arena-top" onClick={() => setOpen(true)} aria-label={`Buka Arena Catat. Streak ${st.current} hari, level ${lv.level}`}>
        <span className="arena-flame"><Flame tier={st.current ? flame.tier : 0} size={78} dim={!st.litToday && st.current > 0}/><b className="arena-count">{st.current}</b></span>
        <span className="arena-head">
          <small className="arena-kicker">Arena Catat · {flame.name}</small>
          <strong className="arena-streak">{st.current} hari<span> berturut-turut</span></strong>
          <small className={`arena-status ${evening ? 'is-warn' : ''}`}>{status}</small>
        </span>
        <span className="arena-lv" style={{ '--p': `${Math.round(lv.progress * 100)}%` } as React.CSSProperties}><span className="arena-lv-ring"/><b>{lv.level}</b><small>Lv</small></span>
      </button>
      <div className="arena-week" role="list" aria-label="Minggu ini">{week.map(d => <span key={d.day} role="listitem" className={`aw-day is-${d.state}`} title={d.day}><i>{d.state === 'lit' ? <Emoji e="🔥"/> : d.state === 'ice' ? <Emoji e="🛡️"/> : null}</i><small>{d.label}</small></span>)}</div>
      <div className="arena-xp"><span className="arena-xp-bar"><i style={{ width: `${Math.round(lv.progress * 100)}%` }}/></span><small><Emoji e={lv.emoji}/> {lv.title} · {(s.xp - lv.from).toLocaleString('id-ID')}/{(lv.to - lv.from).toLocaleString('id-ID')} XP{s.xpToday ? <b> · +{s.xpToday} hari ini</b> : null}</small></div>
      <ul className="arena-missions">{missions.map(({ m, done }) => <li key={m.id} className={done ? 'is-done' : ''}>
        <span className="am-check" aria-hidden="true">{done ? '✓' : ''}</span>
        <span className="am-text">{m.title}{m.target && !done ? <small> {Math.min(created, m.target)}/{m.target}</small> : null}</span>
        <b className="am-xp">+{m.xp}</b>
      </li>)}</ul>
      {!ch && s.week === mondayOf(a.today) && <div className="arena-challenge is-waiting"><span className="ac-ic"><Emoji e="🎯"/></span><span className="ac-text"><small>Tantangan mingguan</small><b>Tantangan baru mulai Senin</b></span></div>}
      {ch && <button type="button" className={`arena-challenge ${s.challengeDone ? 'is-done' : s.challengeLost ? 'is-lost' : ''}`} onClick={() => setOpen(true)}>
        <span className="ac-ic"><Emoji e="🎯"/></span>
        <span className="ac-text"><small>Tantangan minggu ini{s.challengeDone ? ' · berhasil!' : s.challengeLost ? ' · coba lagi minggu depan' : ''}</small><b>{ch.title}</b>{cv && !s.challengeDone && <span className="ac-bar"><i style={{ width: `${Math.min(100, Math.round(cv.value / Math.max(1, ch.target) * 100))}%` }} className={ch.lower ? 'is-lower' : ''}/></span>}</span>
        <span className="ac-val">{ch.id === 'hemat' ? (cv ? rupiah(cv.value) : '') : cv ? `${cv.value}/${ch.target}` : ''}</span>
      </button>}
      <div className="arena-foot">
        <span className="arena-shields" title="Perisai Api">{Array.from({ length: MAX_SHIELDS }, (_, i) => <span key={i} className={i < s.shields ? 'on' : ''}><Emoji e="🛡️"/></span>)}<small>Perisai</small></span>
        <span className="arena-mcount"><Emoji e="🎯"/> Misi {doneCount}/{missions.length || 3}</span>
        {!st.litToday ? <CheckinButton compact/> : <button type="button" className="arena-more" onClick={() => setOpen(true)}>Lihat Arena <ChevronRight size={15}/></button>}
      </div>
    </section>
    {open && <ArenaPanel onClose={() => setOpen(false)}/>}
  </>;
}

export function ArenaPanel({ onClose }: { onClose: () => void }) {
  const { account } = useApp();
  const a = useArena(), [sound, setSound] = useState(soundOn);
  if (!a.v) return null;
  const { s, st, flame, lv, missions, created } = a.v, g = a.g;
  const nf = nextFlame(st.current), next = titleOfLevel(lv.level + 1), ch = s.challenge, cv = g.challengeView;
  const daysLeft = 6 - ((new Date(`${a.today}T12:00:00`).getDay() + 6) % 7);
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent title="Arena Catat" className={`arena-panel t${flame.tier}`}>
      <div className="ap-hero">
        <Flame tier={st.current ? flame.tier : 0} size={132} dim={!st.litToday && st.current > 0}/>
        <strong className="ap-streak">{st.current} hari</strong>
        <span className="ap-flame">{flame.name}{nf ? ` · ${nf.from - st.current} hari lagi jadi ${nf.name}` : ' · level api tertinggi!'}</span>
        {!st.litToday && <CheckinButton/>}
      </div>
      <div className="ap-stats">
        <span><b>{s.best}</b><small>Rekor hari</small></span>
        <span><b>{s.days.length}</b><small>Hari nyala</small></span>
        <span><b>{s.shields}/{MAX_SHIELDS}</b><small>Perisai</small></span>
        <span><b>{s.xp.toLocaleString('id-ID')}</b><small>Total XP</small></span>
      </div>
      <section className="ap-sec">
        <h3><Emoji e={lv.emoji}/> Level {lv.level} · {lv.title}</h3>
        <div className="arena-xp is-light"><span className="arena-xp-bar"><i style={{ width: `${Math.round(lv.progress * 100)}%` }}/></span><small>{(lv.to - s.xp).toLocaleString('id-ID')} XP lagi ke Level {lv.level + 1} · {next.title}</small></div>
      </section>
      <section className="ap-sec">
        <h3><Emoji e="🎯"/> Misi hari ini</h3>
        <ul className="ap-missions">{missions.map(({ m, done }) => <li key={m.id} className={done ? 'is-done' : ''}><span className="am-check">{done ? '✓' : ''}</span><span><b>{m.title}{m.target && !done ? ` (${Math.min(created, m.target)}/${m.target})` : ''}</b><small>{m.hint}</small></span><em>+{m.xp} XP</em></li>)}</ul>
        <small className="muted">Selesaikan ketiganya untuk bonus +{MISSION_BONUS} XP. Misi baru setiap hari.</small>
      </section>
      {!ch && <section className="ap-sec"><h3><Emoji e="🏆"/> Tantangan minggu ini</h3><div className="ap-challenge"><b>Tantangan baru mulai Senin</b><small>Tantangan mingguan dipilih dari kebiasaanmu sendiri tiap Senin. Sambil menunggu, jaga apimu tetap nyala.</small></div></section>}
      {ch && <section className="ap-sec">
        <h3><Emoji e="🏆"/> Tantangan minggu ini</h3>
        <div className={`ap-challenge ${s.challengeDone ? 'is-done' : s.challengeLost ? 'is-lost' : ''}`}>
          <b>{ch.title}</b><small>{ch.hint}</small>
          {cv && <div className="arena-xp is-light"><span className="arena-xp-bar"><i style={{ width: `${Math.min(100, Math.round(cv.value / Math.max(1, ch.target) * 100))}%` }}/></span><small>{ch.id === 'hemat' ? `${rupiah(cv.value)} dari batas ${rupiah(ch.target)}` : `${cv.value} dari ${ch.lower ? 'maksimal ' : ''}${ch.target}`}</small></div>}
          <small className="ap-ch-foot">{s.challengeDone ? `Berhasil! +${ch.xp} XP sudah masuk` : s.challengeLost ? 'Kali ini belum berhasil. Minggu depan ada tantangan baru.' : `${daysLeft ? `${daysLeft} hari lagi` : 'Hari terakhir'} · hadiah +${ch.xp} XP${ch.endOfWeek ? ' (dinilai saat minggu berakhir)' : ''}`}</small>
        </div>
      </section>}
      <section className="ap-sec">
        <h3><Emoji e="🏆"/> Lencana</h3>
        <div className="ap-badges">{BADGES.map(b => { const got = s.badges.includes(b.days); return <span key={b.days} className={`ap-badge ${got ? 'is-got' : ''}`}><span className="ap-badge-ic">{got ? <Emoji e="🔥"/> : <Lock size={16}/>}<b>{b.days}</b></span><small>{b.name}</small></span>; })}</div>
      </section>
      <section className="ap-sec ap-rules">
        <h3><Emoji e="💡"/> Cara main</h3>
        <ul>
          <li>Api nyala kalau hari itu kamu mencatat minimal 1 transaksi, atau ketuk <b>Hari ini aman</b> kalau memang nggak ada transaksi.</li>
          <li>Tiap 7 hari berturut-turut kamu dapat 1 <b>Perisai Api</b> (maksimal {MAX_SHIELDS}). Kalau lupa, perisai otomatis dipakai dan apimu selamat.</li>
          <li>XP: +10 tiap transaksi (maksimal 5 per hari, jadi nggak perlu mencatat yang nggak ada), +20 saat api nyala ditambah bonus streak, plus misi, tantangan, dan lencana.</li>
          <li>Di Ruang Bersama ada <b>Api bareng</b>: nyala kalau semua anggota nyalain apinya hari itu.</li>
          <li>Semua dihitung di HP dari catatanmu sendiri, tersimpan di akunmu jadi sama di semua HP.</li>
        </ul>
      </section>
      <div className="ap-settings">
        <button type="button" onClick={() => { setSoundOn(!sound); setSound(!sound); }}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>} Suara & getar {sound ? 'nyala' : 'mati'}</button>
        {account && <button type="button" onClick={() => { setArenaHidden(account.uid, true); onClose(); }}>Sembunyikan dari Beranda</button>}
      </div>
    </DialogContent>
  </Dialog>;
}
