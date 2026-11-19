'use client';
/**
 * 9.4 Api bareng on a Ruang Bersama's Beranda: the space's flame lights when every member is lit in this space that
 * day. 9.5: lit here means recorded in this space, or tapped "Hari ini aman" here (that one lights only this space's
 * flame, not their Pribadi one). Shows who is lit today, and "Colek" for someone who is not yet (opens the group with
 * a message ready; you send it). 10.3.3: the space's own Perisai bareng (one every 7 days lit together, at most 2) keeps
 * the flame going when someone forgets a day; shown here, with the day it saved lately.
 */
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { Flame } from './flame';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { arenaMini, cachedShared, cachedSpaceFire, gameActions, setArenaMini, useGame } from './game-store';
import { CheckinButton } from './arena';
import { addDays, daysBetween, flameOf, MAX_SHIELDS, nextFlame, spaceFireView } from '@/lib/game';
import { openGroup } from '@/lib/space-chat';
import { todayInTimeZone } from '@/lib/period';
import { play } from '@/lib/game-sound';

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export function SpaceFire() {
  const { space, account, personalProfile } = useApp(), g = useGame();
  if (!space || !account || space.memberIds.length < 2) return null;
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  // 9.6 The last seen on this device until the live one arrives.
  const members = g.shared[space.id] || cachedShared(space.id, account.uid) || {};
  const stored = g.spaceFire[space.id] !== undefined ? g.spaceFire[space.id] : cachedSpaceFire(space.id, account.uid);
  const sh = spaceFireView(stored, members, space.memberIds, today, g.hour), f = flameOf(sh.current), nf = nextFlame(sh.current);
  // The latest day the perisai covered in this run, while it is fresh (a week).
  const lastSaved = sh.saved[sh.saved.length - 1], savedNote = lastSaved && daysBetween(lastSaved, today) <= 7
    ? lastSaved === addDays(today, -1) ? 'Kemarin diselamatkan perisai' : `Diselamatkan perisai ${new Date(`${lastSaved}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : '';
  const shields = <span className="arena-shields" title="Perisai bareng" aria-label={`Perisai bareng ${sh.shields} dari ${MAX_SHIELDS}`}>{Array.from({ length: MAX_SHIELDS }, (_, i) => <span key={i} className={i < sh.shields ? 'on' : ''}><Emoji e="🛡️"/></span>)}<small>Perisai bareng</small></span>;
  const mineLit = (members[account.uid] || []).includes(today);
  const checkin = () => gameActions().checkinSpace(space.id);
  const waiting = sh.members.filter(m => !m.litToday);
  const mini = arenaMini(account.uid, space.id), toggle = () => { play('pop'); setArenaMini(account.uid, space.id, !mini); };
  if (mini) return <section className={`arena-card is-mini is-shared t${sh.current ? f.tier : 0} ${sh.litToday ? 'is-lit' : ''} ${sh.atRisk && g.hour >= 19 ? 'is-danger' : ''}`} aria-label={`Api bareng ${space.name} (kecil)`}>
    <span className="arena-bg" aria-hidden="true"/>
    <div className="arena-mini-main is-static">
      <span className="arena-flame"><Flame tier={sh.current ? f.tier : 0} size={40} dim={!sh.litToday && sh.current > 0}/></span>
      <span className="arena-mini-text"><b>{sh.current} hari <span>· Api bareng · <Emoji e="🛡️"/>{sh.shields}</span></b><small>{sh.litToday ? 'Semua sudah nyala ✓' : `Belum: ${waiting.map(m => m.id === account.uid ? 'kamu' : first(space.members[m.id]?.name || 'anggota')).join(', ')}`}</small></span>
      <span className="arena-mini-dots" aria-hidden="true">{sh.members.map(m => <i key={m.id} className={m.litToday ? 'on' : ''}>{m.litToday ? <Emoji e="🔥"/> : (space.members[m.id]?.name || '?')[0].toUpperCase()}</i>)}</span>
    </div>
    {!mineLit && <CheckinButton compact short onConfirm={checkin}/>}
    <button type="button" className="arena-min-btn" onClick={toggle} aria-label="Tampilkan api bareng lengkap" title="Tampilkan lengkap"><ChevronDown size={16}/></button>
  </section>;
  return <section className={`arena-card is-shared t${sh.current ? f.tier : 0} ${sh.litToday ? 'is-lit' : ''} ${sh.atRisk && g.hour >= 19 ? 'is-danger' : ''}`} aria-label={`Api bareng ${space.name}`}>
    <span className="arena-bg" aria-hidden="true"/>
    <button type="button" className="arena-min-btn is-corner" onClick={toggle} aria-label="Kecilkan api bareng" title="Kecilkan"><ChevronUp size={16}/></button>
    <div className="arena-top is-static">
      <span className="arena-flame"><Flame tier={sh.current ? f.tier : 0} size={70} dim={!sh.litToday && sh.current > 0}/><b className="arena-count">{sh.current}</b></span>
      <span className="arena-head">
        <small className="arena-kicker">Api bareng · {space.name}</small>
        <strong className="arena-streak">{sh.current} hari<span> nyala bareng</span></strong>
        <small className="arena-status">{sh.litToday ? 'Hari ini semua sudah nyala. Kompak!' : waiting.length === sh.members.length ? 'Nyala kalau semua anggota mencatat di ruang ini hari ini' : `Tinggal ${waiting.length} orang lagi hari ini`}{nf && sh.current ? ` · ${nf.from - sh.current} hari lagi jadi ${nf.name}` : ''}</small>
      </span>
    </div>
    <ul className="sf-members">{sh.members.map(m => {
      const me = m.id === account.uid, name = me ? 'Kamu' : first(space.members[m.id]?.name || 'Anggota');
      return <li key={m.id} className={m.litToday ? 'is-lit' : ''}>
        <span className="sf-av">{m.litToday ? <Emoji e="🔥"/> : (space.members[m.id]?.name || '?')[0].toUpperCase()}</span>
        <span className="sf-name"><b>{name}</b><small>{m.litToday ? 'sudah nyala' : me ? 'catat di ruang ini atau cek-in' : 'belum'}</small></span>
        {!m.litToday && !me && <button type="button" className="sf-poke" onClick={() => { play('poke'); openGroup(`@${first(space.members[m.id]?.name || '')} yuk nyalain api bareng hari ini! 🔥`); }}>Colek</button>}
        {!m.litToday && me && !mineLit && <CheckinButton compact short onConfirm={checkin}/>}
      </li>;
    })}</ul>
    <div className="sf-foot">{shields}{savedNote && <span className="sf-saved"><Emoji e="🛡️"/> {savedNote}</span>}</div>
    <small className="sf-note">Api bareng dihitung dari catatan dan cek-in di ruang ini (cek-in di sini cuma buat api bareng, bukan api Pribadi). Tiap 7 hari nyala bareng, ruang ini dapat 1 perisai bareng (maks {MAX_SHIELDS}) yang otomatis menjaga api kalau ada yang lupa sehari.</small>
  </section>;
}
