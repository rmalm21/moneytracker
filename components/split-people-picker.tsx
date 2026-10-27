'use client';
import { useMemo, useState } from 'react';
import { Check, Search, UserPlus, Users, X } from 'lucide-react';
import { Button } from './ui/button';
import { Emoji } from './emoji';
import { PersonAvatar } from './split-bill-shared';
import type { SplitBill, SplitGroup, SplitParticipant, SplitPerson } from '@/lib/types';

const low = (s: string) => s.trim().toLocaleLowerCase('id-ID');

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
  const matches = q ? people.filter(person => low(person.name).includes(q) || low(person.nickname || '').includes(q)) : people;
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
  // Letter headings only help in a long list; with fewer names each letter would stand alone.
  const letters = !q && people.length > 40;
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
      <ul className="sb-pick-list">{matches.map((person, i) => {
        const row = onBill(person), on = Boolean(row), stuck = Boolean(row && locked.has(row.id));
        const letter = person.name.trim().charAt(0).toUpperCase(), head = letters && (i === 0 || matches[i - 1].name.trim().charAt(0).toUpperCase() !== letter);
        return <li key={person.id}>{head && <span className="sb-pick-letter">{letter}</span>}
          <button type="button" aria-pressed={on} className={on ? 'is-on' : ''} disabled={stuck} title={stuck ? 'Sudah membayar, tidak bisa dikeluarkan.' : undefined} onClick={() => toggle(person)}>
            <PersonAvatar person={person} size="sm"/><span className="sb-pick-name"><strong>{person.name}</strong>{person.nickname && <small>{person.nickname}</small>}</span><span className="sb-pick-tick" aria-hidden="true">{on && <Check size={14}/>}</span>
          </button></li>;
      })}</ul>
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
  const q = low(query), chosen = new Set(value);
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const list = q ? sorted.filter(person => low(person.name).includes(q) || low(person.nickname || '').includes(q)) : sorted;
  return <div className="sb-pick sb-members">
    {people.length > 8 && <div className="sb-pick-search"><Search size={16} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama" aria-label="Cari anggota" autoComplete="off"/>{query && <button type="button" className="sb-pick-clear" aria-label="Hapus pencarian" onClick={() => setQuery('')}><X size={15}/></button>}</div>}
    <small className="muted">{value.length ? `${value.length} orang dipilih` : 'Belum ada yang dipilih'}</small>
    {list.length ? <ul className="sb-pick-list">{list.map(person => { const on = chosen.has(person.id); return <li key={person.id}>
      <button type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => onChange(on ? value.filter(id => id !== person.id) : [...value, person.id])}>
        <PersonAvatar person={person} size="sm"/><span className="sb-pick-name"><strong>{person.name}</strong>{person.nickname && <small>{person.nickname}</small>}</span><span className="sb-pick-tick" aria-hidden="true">{on && <Check size={14}/>}</span>
      </button></li>; })}</ul> : <p className="muted">Tidak ada nama yang cocok.</p>}
  </div>;
}
