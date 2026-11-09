'use client';
/**
 * 9.4 Arena Catat on Beranda (Pribadi): the flame and its streak, this week's days, level and XP, today's missions and
 * this week's challenge, "Hari ini aman" for a day with nothing to record; tap for the whole Arena (badges, rules).
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Lock, Volume2, VolumeX } from 'lucide-react';
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { Dialog, DialogContent } from '../ui/dialog';
import { Flame } from './flame';
import { arenaHidden, arenaMini, cachedState, gameActions, setArenaHidden, setArenaMini, useGame } from './game-store';
import { rupiah } from '@/lib/accounting';
import { addDays, COIN_XP_CAP, emptyState, BADGE_GROUPS, BADGE_TOTAL, badgeList, flameOf, levelOf, MAX_SHIELDS, MISSION_BONUS, missionById, mondayOf, nearestBadge, nextFlame, streakOf, TIERS, titleOfLevel, type BadgeView, type GameState } from '@/lib/game';
import { HowToPlay } from './how-to-play';
import { ARENA_GAMES_EVENT, launchMinigame, useMiniGameStatus } from './minigame-status';
import { confetti } from './confetti';
import { play, setSoundOn, soundOn } from '@/lib/game-sound';
import { todayInTimeZone } from '@/lib/period';

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** "Hari ini aman": asked twice so it is a real answer, not a slip of the thumb. */
export function CheckinButton({ compact = false, short = false, onConfirm }: { compact?: boolean; short?: boolean; /** 9.5 A space's api bareng instead of the person's own flame. */ onConfirm?: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = window.setTimeout(() => setSure(false), 3500); return () => window.clearTimeout(t); }, [sure]);
  return <button type="button" className={`arena-checkin ${sure ? 'is-sure' : ''} ${compact ? 'is-compact' : ''}`} onClick={e => { e.stopPropagation(); if (sure) { setSure(false); (onConfirm || gameActions().checkin)(); } else { setSure(true); play('tick'); } }}>
    {sure ? (short ? 'Yakin? Ketuk lagi' : 'Yakin nggak ada transaksi? Ketuk lagi') : <><Emoji e="✅"/> Hari ini aman</>}
  </button>;
}

function useArena() {
  const g = useGame(), { personalProfile, account } = useApp();
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  // 9.6 Until the game arrives, the one last seen on this device (so the card is there from the start).
  const s = g.state || (account ? cachedState(account.uid) : null);
  return { g, today, v: s ? viewOf({ ...emptyState(), ...s }, today) : null };
}
function viewOf(s: GameState, today: string) {
  const st = streakOf(s.days, s.frozen, today), flame = flameOf(st.current), lv = levelOf(s.xp), monday = mondayOf(today);
  const on = (day: string) => s.days.includes(day) || s.frozen.includes(day);
  const week = DAYS.map((label, i) => { const day = addDays(monday, i); return { label, day, state: s.days.includes(day) ? 'lit' : s.frozen.includes(day) ? 'ice' : day === today ? 'today' : day > today ? 'future' : 'miss', joinL: i > 0 && on(day) && on(addDays(day, -1)), joinR: i < 6 && on(day) && on(addDays(day, 1)) }; });
  const created = Object.values(s.txCounted || {}).reduce((n, v) => n + v, 0);
  const missions = (s.missionDay === today ? s.missionIds : []).map(id => ({ m: missionById(id)!, done: s.missionsDone.includes(id) })).filter(x => x.m);
  return { s, st, flame, lv, week, created, missions };
}

export function ArenaCard() {
  const { account } = useApp();
  const a = useArena(), [open, setOpenRaw] = useState(false);
  const setOpen = (o: boolean) => { if (o) play('open'); setOpenRaw(o); };
  const [focus, setFocus] = useState<'games' | undefined>();
  // 9.7 A game started from the Arena's list comes back to the list when it closes.
  useEffect(() => {
    const back = () => { setFocus('games'); setOpenRaw(true); };
    window.addEventListener(ARENA_GAMES_EVENT, back); return () => window.removeEventListener(ARENA_GAMES_EVENT, back);
  }, []);
  if (!account || arenaHidden(account.uid)) return null;
  // Nothing seen yet on this device: the card's place is kept from the start (no jump when it arrives).
  if (!a.v) return <section className={`arena-card is-loading ${arenaMini(account.uid, 'me') ? 'is-mini' : ''}`} aria-label="Arena Catat" aria-busy="true"><span className="arena-bg" aria-hidden="true"/><Flame tier={1} size={arenaMini(account.uid, 'me') ? 40 : 56}/><div><strong>{a.g.ready ? 'Menyalakan Arena Catat…' : 'Arena Catat'}</strong><small>{a.g.ready ? 'Menghitung apimu dari catatan selama ini' : 'Memuat apimu…'}</small></div></section>;
  const { s, st, flame, lv, week, created, missions } = a.v, g = a.g;
  const evening = g.hour >= 18 && st.atRisk, left = 24 - g.hour;
  const doneCount = missions.filter(x => x.done).length;
  const status = st.litToday ? (s.checkins.includes(a.today) ? 'Hari aman tercatat. Api tetap nyala!' : 'Hari ini sudah nyala. Mantap!')
    : st.current ? (evening ? `Hampir padam! Sisa ±${left} jam lagi` : 'Belum nyala hari ini. Catat 1 transaksi atau cek-in')
    : 'Nyalakan api: catat 1 transaksi hari ini';
  const ch = s.challenge, cv = g.challengeView;
  const mini = arenaMini(account.uid, 'me'), toggle = () => { play('pop'); setArenaMini(account.uid, 'me', !mini); };
  const gotBadges = s.badges.length + Object.keys(s.achievements || {}).length;
  // Mini: one row with the flame, the streak, today's state, level and missions (tap for the whole Arena).
  if (mini) return <>
    <section className={`arena-card is-mini t${flame.tier} ${evening ? 'is-danger' : ''} ${st.litToday ? 'is-lit' : ''}`} aria-label="Arena Catat (kecil)">
      <span className="arena-bg" aria-hidden="true"/>
      <button type="button" className="arena-mini-main" onClick={() => setOpen(true)} aria-label={`Buka Arena Catat. Streak ${st.current} hari, level ${lv.level}`}>
        <span className="arena-flame"><span className="arena-ember" aria-hidden="true"/><Flame tier={st.current ? flame.tier : 0} size={40} dim={!st.litToday && st.current > 0}/></span>
        <span className="arena-mini-text"><b>{st.current} hari <span>· {flame.name}</span></b><small className={evening ? 'is-warn' : ''}>{st.litToday ? 'Sudah nyala hari ini ✓' : evening ? `Hampir padam! ±${left} jam lagi` : 'Belum nyala hari ini'}</small></span>
        <span className="arena-mini-chips"><span className="amc-lv">Lv {lv.level}</span><span className="amc-m"><Emoji e="🎯"/> {doneCount}/{missions.length || 3}</span></span>
      </button>
      {!st.litToday && <CheckinButton compact short/>}
      <button type="button" className="arena-min-btn" onClick={toggle} aria-label="Tampilkan Arena lengkap" title="Tampilkan lengkap"><ChevronDown size={16}/></button>
    </section>
    {open && <ArenaPanel focus={focus} onClose={() => { setOpen(false); setFocus(undefined); }}/>}
  </>;
  return <>
    <section className={`arena-card t${flame.tier} ${evening ? 'is-danger' : ''} ${st.litToday ? 'is-lit' : ''}`} aria-label="Arena Catat">
      <span className="arena-bg" aria-hidden="true"/>
      <button type="button" className="arena-min-btn is-corner" onClick={toggle} aria-label="Kecilkan Arena" title="Kecilkan"><ChevronUp size={16}/></button>
      <button type="button" className="arena-top" onClick={() => setOpen(true)} aria-label={`Buka Arena Catat. Streak ${st.current} hari, level ${lv.level}`}>
        <span className="arena-flame"><span className="arena-ember" aria-hidden="true"/><Flame tier={st.current ? flame.tier : 0} size={78} dim={!st.litToday && st.current > 0}/><b className="arena-count">{st.current}</b></span>
        <span className="arena-head">
          <small className="arena-kicker">Arena Catat · {flame.name}</small>
          <strong className="arena-streak">{st.current} hari<span> berturut-turut</span></strong>
          <small className={`arena-status ${evening ? 'is-warn' : ''}`}>{status}</small>
        </span>
        <span className="arena-lv" style={{ '--p': `${Math.round(lv.progress * 100)}%` } as React.CSSProperties}><span className="arena-lv-ring"/><b>{lv.level}</b><small>Lv</small></span>
      </button>
      <div className="arena-week" role="list" aria-label="Minggu ini">{week.map(d => <span key={d.day} role="listitem" className={`aw-day is-${d.state} ${d.joinL ? 'j-l' : ''} ${d.joinR ? 'j-r' : ''}`} title={d.day}><i>{d.state === 'lit' ? <Emoji e="🔥"/> : d.state === 'ice' ? <Emoji e="🛡️"/> : null}</i><small>{d.label}</small></span>)}</div>
      <div className="arena-xp"><span className="arena-xp-bar"><i style={{ width: `${Math.round(lv.progress * 100)}%` }}/></span><small><Emoji e={lv.emoji}/> {lv.title} · {(s.xp - lv.from).toLocaleString('id-ID')}/{(lv.to - lv.from).toLocaleString('id-ID')} XP{s.xpToday ? <b> · +{s.xpToday} hari ini</b> : null}</small></div>
      <ul className="arena-missions">{missions.map(({ m, done }) => <li key={m.id} className={done ? 'is-done' : ''}>
        <span className="am-check" aria-hidden="true">{done ? '✓' : ''}</span>
        <span className="am-text">{m.title}{m.target && !done ? <small> {Math.min(created, m.target)}/{m.target}</small> : null}{m.target && !done ? <span className="am-bar"><i style={{ width: `${Math.round(Math.min(created, m.target) / m.target * 100)}%` }}/></span> : null}</span>
        <b className="am-xp">+{m.xp}</b>
      </li>)}</ul>
      {!ch && s.week === mondayOf(a.today) && <div className="arena-challenge is-waiting"><span className="ac-ic"><Emoji e="🎯"/></span><span className="ac-text"><small>Tantangan mingguan</small><b>Tantangan baru mulai Senin</b></span></div>}
      {ch && <button type="button" className={`arena-challenge ${s.challengeDone ? 'is-done' : s.challengeLost ? 'is-lost' : ''}`} onClick={() => setOpen(true)}>
        <span className="ac-ic"><Emoji e="🎯"/></span>
        <span className="ac-text"><small>Tantangan minggu ini{s.challengeDone ? ' · berhasil!' : s.challengeLost ? ' · coba lagi minggu depan' : ''}</small><b>{ch.title}</b>{cv && !s.challengeDone && <span className="ac-bar"><i style={{ width: `${Math.min(100, Math.round(cv.value / Math.max(1, ch.target) * 100))}%` }} className={ch.lower ? 'is-lower' : ''}/></span>}</span>
        <span className="ac-val">{ch.id === 'hemat' ? (cv ? rupiah(cv.value) : '') : cv ? `${cv.value}/${ch.target}` : ''}</span>
      </button>}
      <GameRow onMore={() => { setFocus('games'); setOpen(true); }}/>
      <div className="arena-foot">
        <span className="arena-shields" title="Perisai Api">{Array.from({ length: MAX_SHIELDS }, (_, i) => <span key={i} className={i < s.shields ? 'on' : ''}><Emoji e="🛡️"/></span>)}<small>Perisai</small></span>
        <span className="arena-mcount"><Emoji e="🎯"/> Misi {doneCount}/{missions.length || 3}</span>
        <button type="button" className="arena-mcount is-badges" onClick={() => setOpen(true)} aria-label={`Lencana ${gotBadges} dari ${BADGE_TOTAL}`}><Emoji e="🏅"/> {gotBadges}/{BADGE_TOTAL}</button>
        {!st.litToday ? <CheckinButton compact/> : <button type="button" className="arena-more" onClick={() => setOpen(true)}>Lihat Arena <ChevronRight size={15}/></button>}
      </div>
    </section>
    {open && <ArenaPanel focus={focus} onClose={() => { setOpen(false); setFocus(undefined); }}/>}
  </>;
}

export function ArenaPanel({ onClose, focus }: { onClose: () => void; /** 9.7 Open at the mini games. */ focus?: 'games' }) {
  const { account } = useApp();
  const a = useArena(), [sound, setSound] = useState(soundOn), [poked, setPoked] = useState(0), flameRef = useRef<HTMLButtonElement>(null), gamesRef = useRef<HTMLElement>(null);
  useEffect(() => { if (focus !== 'games') return; const t = window.setTimeout(() => gamesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350); return () => window.clearTimeout(t); }, [focus]);
  if (!a.v) return null;
  // Tap the flame: it crackles and throws sparks.
  const poke = () => {
    play('crackle'); setPoked(n => n + 1);
    const r = flameRef.current?.getBoundingClientRect();
    if (r) confetti({ count: 34, colors: ['#ff7a1a', '#ffc24b', '#ff4d1a', '#fff2b3'], spread: .5, origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * .35) / window.innerHeight } });
  };
  const { s, st, flame, lv, missions, created } = a.v, g = a.g;
  const nf = nextFlame(st.current), next = titleOfLevel(lv.level + 1), ch = s.challenge, cv = g.challengeView;
  const daysLeft = 6 - ((new Date(`${a.today}T12:00:00`).getDay() + 6) % 7);
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent title="Arena Catat" className={`arena-panel t${flame.tier}`}>
      <div className="ap-hero">
        <span className="ap-hero-bg" aria-hidden="true"/>
        <span className="ap-hero-ring" aria-hidden="true"/>
        <button type="button" ref={flameRef} className="ap-flame-btn" onClick={poke} aria-label="Ketuk apinya"><span key={poked} className={poked ? 'is-poked' : ''}><Flame tier={st.current ? flame.tier : 0} size={132} dim={!st.litToday && st.current > 0}/></span></button>
        <strong className="ap-streak">{st.current} hari</strong>
        <span className="ap-flame">{flame.name}{nf ? ` · ${nf.from - st.current} hari lagi jadi ${nf.name}` : ' · level api tertinggi!'}</span>
        {!st.litToday && <CheckinButton/>}
      </div>
      <div className="ap-stats">
        <span><Emoji e="🏆"/><b>{s.best}</b><small>Rekor hari</small></span>
        <span><Emoji e="🔥"/><b>{s.days.length}</b><small>Hari nyala</small></span>
        <span><Emoji e="🛡️"/><b>{s.shields}/{MAX_SHIELDS}</b><small>Perisai</small></span>
        <span><Emoji e="⭐"/><b>{s.xp.toLocaleString('id-ID')}</b><small>Total XP</small></span>
      </div>
      <section className="ap-sec">
        <h3><Emoji e={lv.emoji}/> Level {lv.level} · {lv.title}</h3>
        <div className="arena-xp is-light"><span className="arena-xp-bar"><i style={{ width: `${Math.round(lv.progress * 100)}%` }}/></span><small>{(lv.to - s.xp).toLocaleString('id-ID')} XP lagi ke Level {lv.level + 1} · {next.title}</small></div>
        <ol className="ap-path" aria-label="Jalur level">{[lv.level, lv.level + 1, lv.level + 2, lv.level + 3].map(n => { const t = titleOfLevel(n); return <li key={n} className={n === lv.level ? 'is-now' : ''}><span className="ap-path-ic"><Emoji e={t.emoji}/></span><b>Lv {n}</b><small>{t.title}</small></li>; })}</ol>
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
      <section className="ap-sec ap-games" ref={gamesRef}><h3><Emoji e="🎮"/> Mini game</h3><GameRow big onBefore={onClose}/></section>
      <BadgeShelf s={s} today={a.today}/>
      <section className="ap-sec ap-rules">
        <h3><Emoji e="💡"/> Cara main</h3>
        <HowToPlay/>
        <small className="muted">Semua dihitung di HP dari catatanmu sendiri, tersimpan di akunmu jadi sama di semua HP.</small>
      </section>
      <div className="ap-settings">
        <button type="button" onClick={() => { setSoundOn(!sound); setSound(!sound); }}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>} Suara & getar {sound ? 'nyala' : 'mati'}</button>
        {account && <button type="button" onClick={() => { setArenaHidden(account.uid, true); onClose(); }}>Sembunyikan dari Beranda</button>}
      </div>
    </DialogContent>
  </Dialog>;
}

/** 9.5 Every badge, by group, in its tier's colour; tap one to see what it takes. */
function BadgeShelf({ s, today }: { s: GameState; today: string }) {
  const list = badgeList(s, today), got = list.filter(b => b.got).length, near = nearestBadge(list);
  const [pick, setPick] = useState<BadgeView | null>(null);
  const tap = (b: BadgeView) => { play(b.got ? 'coin' : 'tick'); setPick(p => p?.id === b.id ? null : b); };
  return <section className="ap-sec ap-shelf">
    <h3><Emoji e="🏅"/> Lencana <span className="ap-count">{got}/{list.length}</span></h3>
    <div className="ap-shelf-bar" aria-hidden="true"><i style={{ width: `${Math.round(got / list.length * 100)}%` }}/></div>
    {near && <button type="button" className={`ap-near tier-${near.tier}`} onClick={() => tap(near)}><span className="ap-medal-ic"><Emoji e={near.emoji}/></span><span><small>Hampir dapat</small><b>{near.name}</b><span className="ap-near-bar"><i style={{ width: `${Math.round(near.value / near.target * 100)}%` }}/></span></span><em>{near.value}/{near.target}</em></button>}
    {BADGE_GROUPS.map(g => { const items = list.filter(b => b.group === g.id); if (!items.length) return null; const n = items.filter(b => b.got).length; return <div key={g.id} className="ap-group">
      <div className="ap-group-head"><span><Emoji e={g.emoji}/> {g.id}</span><small>{g.hint} · {n}/{items.length}</small></div>
      <div className="ap-medals">{items.map((b, i) => <button type="button" key={b.id} className={`ap-medal tier-${b.tier} ${b.got ? 'is-got' : ''} ${pick?.id === b.id ? 'is-picked' : ''}`} onClick={() => tap(b)} aria-label={`${b.name}, ${TIERS[b.tier].name}, ${b.got ? 'sudah didapat' : `${b.value} dari ${b.target}`}`} aria-pressed={pick?.id === b.id}>
        <span className="ap-medal-ic" style={{ '--p': `${Math.round(b.value / b.target * 100)}%`, '--d': (i % 5) * .5 } as React.CSSProperties}><Emoji e={b.emoji}/>{!b.got && <span className="ap-lock-badge" aria-hidden="true"><Lock size={11} strokeWidth={2.4}/></span>}{b.group === 'Api' && <b className="ap-medal-n">{b.target}</b>}</span>
        <small>{b.name}</small>
      </button>)}</div>
      {pick && pick.group === g.id && <div className={`ap-detail tier-${pick.tier}`} role="status">
        <span className="ap-medal-ic big"><Emoji e={pick.emoji}/></span>
        <span className="ap-detail-text"><small className="ap-tier-pill">{TIERS[pick.tier].name}</small><b>{pick.name}</b><span>{pick.desc}</span>
          {pick.got ? <em><Emoji e="✅"/> Sudah didapat{pick.got !== 'ya' ? ` · ${new Date(`${pick.got}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</em>
            : <span className="ap-detail-prog"><span className="ap-near-bar"><i style={{ width: `${Math.round(pick.value / pick.target * 100)}%` }}/></span><small>{pick.value}/{pick.target} · hadiah +{pick.xp} XP</small></span>}
        </span>
      </div>}
    </div>; })}
  </section>;
}

/** 9.7 The mini games. On the card: the two daily ones (Putar Roda, Gosok Berhadiah) and a way to the rest; in the
 * Arena: all five. */
function GameRow({ big = false, onBefore, onMore }: { big?: boolean; onBefore?: () => void; onMore?: () => void }) {
  const m = useMiniGameStatus(); if (!m) return null;
  const go = (kind: Parameters<typeof launchMinigame>[0]) => (e: React.MouseEvent) => { e.stopPropagation(); launchMinigame(kind, onBefore); };
  const spin = <button type="button" key="spin" className={`ag-btn is-spin ${m.ready ? 'is-ready' : ''}`} onClick={go('spin')}>
    <span className="ag-ic"><Emoji e="🎡"/></span>
    <span className="ag-text"><b>Putar Roda</b><small>{m.ready ? 'Siap diputar!' : m.spun ? `Besok lagi${m.prize ? ` · ${m.prize.shield ? 'Perisai' : `${m.prize.label} XP`}` : ''}` : 'Nyalakan api dulu'}</small></span>
  </button>;
  const scratch = <button type="button" key="scratch" className={`ag-btn is-scratch ${m.scratchReady ? 'is-ready' : ''}`} onClick={go('scratch')}>
    <span className="ag-ic"><Emoji e="🎟️"/></span>
    <span className="ag-text"><b>Gosok Berhadiah</b><small>{m.scratchReady ? 'Siap digosok!' : m.scratched ? `Besok lagi${m.scratchPrize ? ` · ${m.scratchPrize.label}` : ''}` : `Misi ${m.missionsDone}/${m.missionsTotal}`}</small></span>
  </button>;
  if (!big) {
    const xp = (COIN_XP_CAP - m.xpLeft) + (m.match.cap - m.match.xpLeft) + (m.shop.cap - m.shop.xpLeft), cap = COIN_XP_CAP + m.match.cap + m.shop.cap;
    return <div className="arena-games">
      {spin}{scratch}
      <button type="button" className="ag-more" onClick={e => { e.stopPropagation(); onMore?.(); }} aria-label={`Game lain: Tangkap Koin, Cocok Cuan, Belanja Bijak. XP game hari ini ${xp} dari ${cap}`}>
        <span className="ag-more-ics" aria-hidden="true">{['🪙', '💵', '🛒'].map((e, i) => <i key={e} style={{ '--i': i } as React.CSSProperties}><Emoji e={e}/></i>)}</span>
        <span className="ag-more-text"><b>Game lain <span className={`ag-more-xp ${xp >= cap ? 'is-full' : ''}`}>{xp >= cap ? 'XP penuh' : `XP ${xp}/${cap}`}</span></b><small>Tangkap Koin · Cocok Cuan · Belanja Bijak</small></span>
        <span className="ag-more-go" aria-hidden="true"><ChevronRight size={17}/></span>
      </button>
    </div>;
  }
  return <div className="arena-games is-big">
    {spin}{scratch}
    <button type="button" className="ag-btn is-coin" onClick={go('coin')}><span className="ag-ic"><Emoji e="🪙"/></span><span className="ag-text"><b>Tangkap Koin</b><small>{m.best ? `Rekor ${m.best}` : '40 detik'} · XP {COIN_XP_CAP - m.xpLeft}/{COIN_XP_CAP}</small></span></button>
    <button type="button" className="ag-btn is-match" onClick={go('match')}><span className="ag-ic"><Emoji e="💵"/></span><span className="ag-text"><b>Cocok Cuan</b><small>{m.match.best ? `Rekor ${m.match.best.toLocaleString('id-ID')}` : '25 langkah'} · XP {m.match.cap - m.match.xpLeft}/{m.match.cap}</small></span></button>
    <button type="button" className="ag-btn is-shop" onClick={go('shop')}><span className="ag-ic"><Emoji e="🛒"/></span><span className="ag-text"><b>Belanja Bijak</b><small>{m.shop.best ? `Rekor ${m.shop.best}` : 'Skor 0–100'} · XP {m.shop.cap - m.shop.xpLeft}/{m.shop.cap}</small></span></button>
  </div>;
}
