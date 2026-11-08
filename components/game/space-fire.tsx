'use client';
/**
 * 9.4 Api bareng on a Ruang Bersama's Beranda: the space's flame lights when every member's own flame is lit that
 * day (recorded, or "Hari ini aman"). Shows who is lit today, "Hari ini aman" for yourself, and "Colek" for someone
 * who is not yet (opens the group with a message ready; you send it).
 */
import { useApp } from '../app-provider';
import { Emoji } from '../emoji';
import { Flame } from './flame';
import { gameActions, useGame } from './game-store';
import { flameOf, nextFlame, sharedStreak, streakOf } from '@/lib/game';
import { openGroup } from '@/lib/space-chat';
import { todayInTimeZone } from '@/lib/period';

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

export function SpaceFire() {
  const { space, account, personalProfile } = useApp(), g = useGame();
  if (!space || !account || space.memberIds.length < 2) return null;
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  const members = { ...(g.shared[space.id] || {}) };
  // Your own days count at once (before they come back from the server).
  if (g.state) members[account.uid] = [...new Set([...(members[account.uid] || []), ...g.state.days, ...g.state.frozen])];
  const sh = sharedStreak(members, space.memberIds, today), f = flameOf(sh.current), nf = nextFlame(sh.current);
  const mineLit = g.state ? streakOf(g.state.days, g.state.frozen, today).litToday : false;
  const waiting = sh.members.filter(m => !m.litToday);
  return <section className={`arena-card is-shared t${sh.current ? f.tier : 0} ${sh.litToday ? 'is-lit' : ''} ${sh.atRisk && g.hour >= 19 ? 'is-danger' : ''}`} aria-label={`Api bareng ${space.name}`}>
    <span className="arena-bg" aria-hidden="true"/>
    <div className="arena-top is-static">
      <span className="arena-flame"><Flame tier={sh.current ? f.tier : 0} size={70} dim={!sh.litToday && sh.current > 0}/><b className="arena-count">{sh.current}</b></span>
      <span className="arena-head">
        <small className="arena-kicker">Api bareng · {space.name}</small>
        <strong className="arena-streak">{sh.current} hari<span> nyala bareng</span></strong>
        <small className="arena-status">{sh.litToday ? 'Hari ini semua sudah nyala. Kompak!' : waiting.length === sh.members.length ? 'Nyala kalau semua anggota mencatat atau cek-in hari ini' : `Tinggal ${waiting.length} orang lagi hari ini`}{nf && sh.current ? ` · ${nf.from - sh.current} hari lagi jadi ${nf.name}` : ''}</small>
      </span>
    </div>
    <ul className="sf-members">{sh.members.map(m => {
      const me = m.id === account.uid, name = me ? 'Kamu' : first(space.members[m.id]?.name || 'Anggota');
      return <li key={m.id} className={m.litToday ? 'is-lit' : ''}>
        <span className="sf-av">{m.litToday ? <Emoji e="🔥"/> : (space.members[m.id]?.name || '?')[0].toUpperCase()}</span>
        <span className="sf-name"><b>{name}</b><small>{m.litToday ? 'sudah nyala' : 'belum'}</small></span>
        {!m.litToday && !me && <button type="button" className="sf-poke" onClick={() => openGroup(`@${first(space.members[m.id]?.name || '')} yuk nyalain api bareng hari ini! 🔥`)}>Colek</button>}
        {!m.litToday && me && !mineLit && <button type="button" className="sf-poke is-me" onClick={() => gameActions().checkin()}>Hari ini aman</button>}
      </li>;
    })}</ul>
    {!g.state && g.ready && <small className="sf-note">Buka Beranda Pribadi sekali supaya apimu ikut dihitung.</small>}
  </section>;
}
