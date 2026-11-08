'use client';
/**
 * 9.4 Api bareng on a Ruang Bersama's Beranda: the space's flame lights when every member is lit in this space that
 * day. 9.5: lit here means recorded in this space, or tapped "Hari ini aman" here (that one lights only this space's
 * flame, not their Pribadi one). Shows who is lit today, and "Colek" for someone who is not yet (opens the group with
 * a message ready; you send it).
 */
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { Flame } from './flame';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { arenaMini, gameActions, setArenaMini, useGame } from './game-store';
import { CheckinButton } from './arena';
import { flameOf, nextFlame, sharedStreak } from '@/lib/game';
import { openGroup } from '@/lib/space-chat';
import { todayInTimeZone } from '@/lib/period';
import { play } from '@/lib/game-sound';

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export function SpaceFire() {
  const { space, account, personalProfile } = useApp(), g = useGame();
  if (!space || !account || space.memberIds.length < 2) return null;
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  const members = g.shared[space.id] || {};
  const sh = sharedStreak(members, space.memberIds, today), f = flameOf(sh.current), nf = nextFlame(sh.current);
  const mineLit = (members[account.uid] || []).includes(today);
  const checkin = () => gameActions().checkinSpace(space.id);
  const waiting = sh.members.filter(m => !m.litToday);
  const mini = arenaMini(account.uid, space.id), toggle = () => { play('pop'); setArenaMini(account.uid, space.id, !mini); };
  if (mini) return <section className={`arena-card is-mini is-shared t${sh.current ? f.tier : 0} ${sh.litToday ? 'is-lit' : ''} ${sh.atRisk && g.hour >= 19 ? 'is-danger' : ''}`} aria-label={`Api bareng ${space.name} (kecil)`}>
    <span className="arena-bg" aria-hidden="true"/>
    <div className="arena-mini-main is-static">
      <span className="arena-flame"><Flame tier={sh.current ? f.tier : 0} size={40} dim={!sh.litToday && sh.current > 0}/></span>
      <span className="arena-mini-text"><b>{sh.current} hari <span>· Api bareng</span></b><small>{sh.litToday ? 'Semua sudah nyala ✓' : `Belum: ${waiting.map(m => m.id === account.uid ? 'kamu' : first(space.members[m.id]?.name || 'anggota')).join(', ')}`}</small></span>
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
    <small className="sf-note">Api bareng dihitung dari catatan dan cek-in di ruang ini. Cek-in di sini cuma buat api bareng, bukan api Pribadi.</small>
  </section>;
}
