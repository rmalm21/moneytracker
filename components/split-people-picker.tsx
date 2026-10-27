'use client';
import { useMemo, useRef, useState } from 'react';
import { Check, Search, UserPlus, Users, X } from 'lucide-react';
import { Button } from './ui/button';
import { Emoji } from './emoji';
import { PersonAvatar } from './split-bill-shared';
import type { SplitBill, SplitGroup, SplitParticipant, SplitPerson } from '@/lib/types';

const low = (s: string) => s.trim().toLocaleLowerCase('id-ID');
/** Lower case without accents, so "ip" finds Ipul and "rene" finds René. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('id-ID');

/** How well a person matches what was typed: 0 the name starts with it, 1 a word does, 2 it is inside a word; -1 not at all. */
function rank(person: SplitPerson, q: string) {
  let best = -1;
  for (const text of [person.name, person.nickname || '']) {
    const t = fold(text), at = t.indexOf(q);
    if (at < 0) continue;
    const score = at === 0 ? 0 : t.split(/[\s.'’-]+/).some(word => word.startsWith(q)) ? 1 : 2;
    if (best < 0 || score < best) best = score;
  }
  return best;
}
/** Everyone whose name or nickname holds the typed letters, best matches first (Ipul, Ipan before Arip). */
export function searchPeople(people: SplitPerson[], query: string) {
  const q = fold(query);
  if (!q) return people;
  return people.map(person => ({ person, score: rank(person, q) })).filter(row => row.score >= 0).sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name, 'id')).map(row => row.person);
}
const letterOf = (name: string) => { const c = fold(name).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };

/** The typed letters in bold inside a name (only when accents did not change its length). */
function Marked({ text, q }: { text: string; q: string }) {
  const t = fold(text), at = q ? t.indexOf(q) : -1, lead = text.length - text.trimStart().length;
  if (at < 0 || t.length !== text.trim().length) return <>{text}</>;
  const from = at + lead;
  return <>{text.slice(0, from)}<mark>{text.slice(from, from + q.length)}</mark>{text.slice(from + q.length)}</>;
}

/**
 * Saved people as a list with a tick. Without a search it is split by first letter (sticky letter headings and a row of
 * letters to jump to); with a search it is one list, best matches first, the typed letters marked.
 */
function PeopleList({ people, query, state, onToggle }: { people: SplitPerson[]; query: string; state: (person: SplitPerson) => { on: boolean; stuck?: boolean }; onToggle: (person: SplitPerson) => void }) {
  const box = useRef<HTMLUListElement>(null);
  const q = fold(query);
  const groups = useMemo(() => {
    if (q) return [];
    const map = new Map<string, SplitPerson[]>();
    for (const person of [...people].sort((a, b) => a.name.localeCompare(b.name, 'id'))) { const k = letterOf(person.name); map.set(k, [...(map.get(k) || []), person]); }
    return [...map.entries()].sort(([a], [b]) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
  }, [people, q]);
  const row = (person: SplitPerson) => {
    const { on, stuck } = state(person);
    return <li key={person.id}><button type="button" aria-pressed={on} className={on ? 'is-on' : ''} disabled={stuck} title={stuck ? 'Sudah membayar, tidak bisa dikeluarkan.' : undefined} onClick={() => onToggle(person)}>
      <PersonAvatar person={person} size="sm"/><span className="sb-pick-name"><strong><Marked text={person.name} q={q}/></strong>{person.nickname && <small><Marked text={person.nickname} q={q}/></small>}</span><span className="sb-pick-tick" aria-hidden="true">{on && <Check size={14}/>}</span>
    </button></li>;
  };
  const jump = (letter: string) => { const list = box.current, head = list?.querySelector<HTMLElement>(`[data-letter="${letter}"]`); if (list && head) list.scrollTo({ top: head.offsetTop - list.offsetTop - 2, behavior: 'smooth' }); };
  if (q) return <ul className="sb-pick-list is-results">{people.map(row)}</ul>;
  return <>
    {groups.length > 2 && people.length > 6 && <div className="sb-pick-az" role="toolbar" aria-label="Lompat ke huruf">{groups.map(([letter]) => <button type="button" key={letter} onClick={() => jump(letter)}>{letter}</button>)}</div>}
    <ul className="sb-pick-list is-grouped" ref={box}>{groups.map(([letter, list]) => <li key={letter} className="sb-pick-group" data-letter={letter}>
      <span className="sb-pick-letter"><b>{letter}</b><small>{list.length}</small></span>
      <ul>{list.map(row)}</ul>
    </li>)}</ul>
  </>;
}

/**
 * Choosing who splits a bill from the saved people: one search box that also adds a new name, groups in one row,
 * the people most often on a bill first, and everyone else as a list with a tick (tap again to take someone off).
 */
export function PeoplePicker({ people, groups, bills, participants, locked, groupId, me, onAdd, onAddNew, onRemove, onGroup, onToggleMe, onManage, onDone }: {
  people: SplitPerson[]; groups: SplitGroup[]; bills: SplitBill[]; participants: SplitParticipant[];
  /** Participants who already paid something: they cannot be taken off. */
  locked: Set<string>; groupId?: string | null; me: boolean;
  onAdd: (person: SplitPerson) => void; onAddNew: (name: string, remember: boolean) => void; onRemove: (participantId: string) => void;
  onGroup: (group: SplitGroup, on: boolean) => void; onToggleMe: (on: boolean) => void; onManage: () => void; onDone: () => void;
}) {
  const [query, setQuery] = useState(''), [remember, setRemember] = useState(true);
  const q = low(query);
  // A saved person is on the bill when linked to it, or when added earlier under the same name.
  const onBill = (person: SplitPerson) => participants.find(row => !row.isMe && (row.personId === person.id || (!row.personId && low(row.name) === low(person.name))));
  const often = useMemo(() => {
    const count = new Map<string, { n: number; last: string }>();
    for (const bill of bills) if (bill.status !== 'cancelled') for (const row of bill.participants) if (row.personId) { const c = count.get(row.personId) || { n: 0, last: '' }; c.n++; if (bill.date > c.last) c.last = bill.date; count.set(row.personId, c); }
    return people.filter(person => count.has(person.id)).sort((a, b) => count.get(b.id)!.n - count.get(a.id)!.n || count.get(b.id)!.last.localeCompare(count.get(a.id)!.last)).slice(0, 8);
  }, [bills, people]);
  const matches = useMemo(() => searchPeople(people, query), [people, query]);
  const exact = q && people.some(person => low(person.name) === q);
  const typedOnBill = q && participants.some(row => !row.isMe && low(row.name) === q);
  const chosen = participants.filter(row => !row.isMe).length;
  function toggle(person: SplitPerson) {
    const row = onBill(person);
    if (row) { if (!locked.has(row.id)) onRemove(row.id); }
    else onAdd(person);
  }
  function submit() {
    if (!q) return;
    const saved = people.find(person => low(person.name) === q) || (matches.length === 1 ? matches[0] : null);
    if (saved) { if (!onBill(saved)) onAdd(saved); }
    else if (!typedOnBill) onAddNew(query.trim(), remember);
    setQuery('');
  }
  const groupOn = (group: SplitGroup) => group.memberIds.length > 0 && group.memberIds.every(id => { const person = people.find(p => p.id === id); return !person || onBill(person); });
  return <div className="sb-pick">
    <form className="sb-pick-search" onSubmit={e => { e.preventDefault(); submit(); }}>
      <Search size={16} aria-hidden="true"/>
      <input value={query} maxLength={60} onChange={e => setQuery(e.target.value)} placeholder={people.length ? 'Cari atau ketik nama baru' : 'Ketik nama orang'} aria-label="Cari atau tambah orang" autoComplete="off" autoFocus/>
      {query && <button type="button" className="sb-pick-clear" aria-label="Hapus pencarian" onClick={() => setQuery('')}><X size={15}/></button>}
    </form>

    {q && !exact && !typedOnBill && <div className="sb-pick-new">
      <button type="button" onClick={submit}><UserPlus size={16}/><span>Tambah <b>“{query.trim()}”</b> sebagai orang baru</span></button>
      <label className="check-row sb-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Simpan ke Orang tersimpan</label>
    </div>}

    {!q && groups.length > 0 && <section className="sb-pick-sec"><h5>Grup</h5>
      <div className="sb-pick-groups">{groups.map(group => { const on = groupOn(group); return <button type="button" key={group.id} aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => onGroup(group, !on)}>
        <Emoji e={group.emoji || '👥'}/><span><strong>{group.name}</strong><small>{on ? 'Sudah masuk' : `${group.memberIds.length} orang`}</small></span>{on && <Check size={14} aria-hidden="true"/>}
      </button>; })}</div>
    </section>}

    {!q && often.length > 0 && <section className="sb-pick-sec"><h5>Sering diajak</h5>
      <div className="sb-pick-often">{often.map(person => { const row = onBill(person), on = Boolean(row); return <button type="button" key={person.id} aria-pressed={on} className={on ? 'is-on' : ''} disabled={Boolean(row && locked.has(row.id))} onClick={() => toggle(person)}>
        <span className="sb-pick-face"><PersonAvatar person={person}/>{on && <i><Check size={11}/></i>}</span><small>{person.nickname || person.name}</small>
      </button>; })}</div>
    </section>}

    {people.length > 0 && (matches.length > 0 || !q) && <section className="sb-pick-sec"><h5>{q ? `Hasil (${matches.length})` : `Semua orang · ${people.length}`}</h5>
      <PeopleList people={matches} query={query} state={person => { const row = onBill(person); return { on: Boolean(row), stuck: Boolean(row && locked.has(row.id)) }; }} onToggle={toggle}/>
    </section>}

    <label className="check-row"><input type="checkbox" checked={me} onChange={e => onToggleMe(e.target.checked)}/> Saya ikut patungan</label>
    <div className="sb-pick-foot">
      <button type="button" className="sb-link" onClick={onManage}><Users size={14}/> Kelola orang & grup</button>
      <Button type="button" className="small" onClick={onDone}>Selesai{chosen ? ` · ${chosen} orang` : ''}</Button>
    </div>
  </div>;
}

/** Members of a saved group: the same ticked list, with a search box once the list gets long. */
export function MemberList({ people, value, onChange }: { people: SplitPerson[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('');
  const chosen = new Set(value), list = useMemo(() => searchPeople(people, query), [people, query]);
  return <div className="sb-pick sb-members">
    {people.length > 8 && <div className="sb-pick-search"><Search size={16} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama" aria-label="Cari anggota" autoComplete="off"/>{query && <button type="button" className="sb-pick-clear" aria-label="Hapus pencarian" onClick={() => setQuery('')}><X size={15}/></button>}</div>}
    <small className="muted">{value.length ? `${value.length} orang dipilih` : 'Belum ada yang dipilih'}</small>
    {list.length ? <PeopleList people={list} query={query} state={person => ({ on: chosen.has(person.id) })} onToggle={person => onChange(chosen.has(person.id) ? value.filter(id => id !== person.id) : [...value, person.id])}/> : <p className="muted">Tidak ada nama yang cocok.</p>}
  </div>;
}
