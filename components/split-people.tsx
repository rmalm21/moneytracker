'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { Empty, Field, Input } from './fields';
import { Emoji } from './emoji';
import { EmojiSearchButton } from './visual-identity';
import { PersonAvatar } from './split-bill-shared';
import { deleteSplitGroup, deleteSplitPerson, saveSplitGroup, saveSplitPerson } from '@/lib/split-bill-store';
import type { SplitBill, SplitGroup, SplitPerson } from '@/lib/types';

/** Saved people and groups for Split Bill: a tidy list (A–Z, search, how often each was used) to edit or delete. */
export function PeopleManager({ people, groups, bills = [], onClose }: { people: SplitPerson[]; groups: SplitGroup[]; bills?: SplitBill[]; onClose: () => void }) {
  const { user } = useApp();
  const { track } = useNotify();
  const [tab, setTab] = useState<'people' | 'groups'>('people');
  const [person, setPerson] = useState<Partial<SplitPerson> | null>(null), [group, setGroup] = useState<Partial<SplitGroup> | null>(null), [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // How often each saved person was in a bill (not cancelled): shown in the list, busiest people are the ones to keep.
  const used = useMemo(() => { const count = new Map<string, number>(); for (const bill of bills) { if (bill.status === 'cancelled') continue; for (const p of bill.participants) if (p.personId) count.set(p.personId, (count.get(p.personId) || 0) + 1); } return count; }, [bills]);
  const query = search.trim().toLocaleLowerCase('id-ID');
  const sorted = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name, 'id')).filter(row => !query || `${row.name} ${row.nickname || ''} ${row.notes || ''}`.toLocaleLowerCase('id-ID').includes(query)), [people, query]);
  function savePerson(event: FormEvent) {
    event.preventDefault(); if (!user || !person) return;
    if (!person.name?.trim()) { setError('Isi nama orangnya.'); return; }
    const uid = user.uid, record = person;
    setPerson(null); setError('');
    track(saveSplitPerson(uid, { name: record.name!, nickname: record.nickname, emoji: record.emoji, notes: record.notes }, record.id), { pending: 'Menyimpan…', success: record.id ? 'Orang diperbarui.' : 'Orang disimpan.', failure: 'Belum tersimpan' });
  }
  function saveGroup(event: FormEvent) {
    event.preventDefault(); if (!user || !group) return;
    if (!group.name?.trim()) { setError('Isi nama grupnya.'); return; }
    const uid = user.uid, record = group;
    setGroup(null); setError('');
    track(saveSplitGroup(uid, { name: record.name!, emoji: record.emoji, memberIds: record.memberIds || [] }, record.id), { pending: 'Menyimpan…', success: record.id ? 'Grup diperbarui.' : 'Grup disimpan.', failure: 'Belum tersimpan' });
  }
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Orang & grup" className="sb-people-dialog"><div className="form-stack">
    <div className="ip-seg sb-seg" role="tablist"><button type="button" role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>Orang tersimpan</button><button type="button" role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Grup</button></div>
    {tab === 'people' ? <>
      <p className="muted">Teman yang sering ikut patungan. Mereka tidak perlu punya akun Dompet Ajaib.</p>
      {person ? <form className="form-stack sb-edit" onSubmit={savePerson}>
        <div className="form-grid"><Field label="Nama"><Input autoFocus value={person.name || ''} maxLength={60} onChange={e => setPerson({ ...person, name: e.target.value })}/></Field><Field label="Panggilan (opsional)"><Input value={person.nickname || ''} maxLength={40} onChange={e => setPerson({ ...person, nickname: e.target.value })}/></Field></div>
        <div className="sb-emoji-row"><span className="sb-emoji-now">{person.emoji ? <Emoji e={person.emoji}/> : '—'}</span><EmojiSearchButton value={person.emoji} onPick={emoji => setPerson({ ...person, emoji })} label="Pilih emoji"/>{person.emoji && <button type="button" className="link-button" onClick={() => setPerson({ ...person, emoji: '' })}>Tanpa emoji</button>}</div>
        <Field label="Catatan (opsional)"><Input value={person.notes || ''} maxLength={300} onChange={e => setPerson({ ...person, notes: e.target.value })}/></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setPerson(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form> : <Button variant="secondary" onClick={() => setPerson({ name: '' })}><Plus size={16}/> Tambah orang</Button>}
      {people.length > 5 && !person && <label className="search-box sb-people-search"><Search size={17} aria-hidden="true"/><input className="search-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cari di ${people.length} orang`} aria-label="Cari orang"/></label>}
      {people.length ? <ul className="sb-people-tidy">{sorted.map(row => { const n = used.get(row.id) || 0, inGroups = groups.filter(g => g.memberIds.includes(row.id)).map(g => g.name); return <li key={row.id}>
        <PersonAvatar person={row}/>
        <span className="sb-person-main"><strong>{row.name}{row.nickname ? <small> · {row.nickname}</small> : null}</strong><small>{[bills.length ? (n ? `${n} tagihan` : 'Belum dipakai') : '', inGroups.length ? `grup ${inGroups.join(', ')}` : '', row.notes || ''].filter(Boolean).join(' · ')}</small></span>
        <button type="button" className="icon-btn" aria-label={`Ubah ${row.name}`} onClick={() => { setPerson(row); setError(''); }}><Edit3 size={15}/></button>
        {user && <Confirm title={`Hapus ${row.name}?`} description={`${n ? `${row.name} ada di ${n} tagihan; tagihan itu tetap memakai namanya. ` : ''}Hanya daftar Orang tersimpan${inGroups.length ? ' dan grupnya' : ''} yang berubah.`} confirmLabel="Hapus" onConfirm={() => track(deleteSplitPerson(user.uid, row.id), { pending: 'Menghapus…', success: `${row.name} dihapus dari daftar.`, failure: 'Belum terhapus' })}><button type="button" className="icon-btn is-danger" aria-label={`Hapus ${row.name}`}><Trash2 size={15}/></button></Confirm>}
      </li>; })}{!sorted.length && <li className="muted sb-people-none">Tidak ada yang cocok dengan “{search.trim()}”.</li>}</ul> : !person && <Empty message="Belum ada orang tersimpan. Orang yang kamu tambahkan saat membuat Split Bill bisa disimpan di sini."/>}
    </> : <>
      <p className="muted">Pilih grup saat membuat Split Bill, semua anggotanya langsung ikut.</p>
      {group ? <form className="form-stack sb-edit" onSubmit={saveGroup}>
        <Field label="Nama grup"><Input autoFocus value={group.name || ''} maxLength={60} onChange={e => setGroup({ ...group, name: e.target.value })} placeholder="Misalnya Bultang, Kantor, Trip"/></Field>
        <div className="sb-emoji-row"><span className="sb-emoji-now"><Emoji e={group.emoji || '👥'}/></span><div className="sb-chips">{['🏸', '💼', '🏖️', '👥', '🍜', '⚽', '🎮', '🏠'].map(emoji => <button type="button" key={emoji} className={`sb-chip ${group.emoji === emoji ? 'is-on' : ''}`} onClick={() => setGroup({ ...group, emoji })}><Emoji e={emoji}/></button>)}</div><EmojiSearchButton value={group.emoji} onPick={emoji => setGroup({ ...group, emoji })} label="Lainnya"/></div>
        <Field label="Anggota">{people.length ? <div className="sb-chips">{people.map(row => { const on = (group.memberIds || []).includes(row.id); return <button type="button" key={row.id} className={`sb-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => setGroup({ ...group, memberIds: on ? (group.memberIds || []).filter(id => id !== row.id) : [...(group.memberIds || []), row.id] })}><PersonAvatar person={row} size="sm"/><span>{row.name}</span></button>; })}</div> : <p className="muted">Tambahkan orang di tab Orang tersimpan dulu.</p>}</Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setGroup(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form> : <Button variant="secondary" onClick={() => setGroup({ name: '', emoji: '👥', memberIds: [] })}><Plus size={16}/> Buat grup</Button>}
      {groups.length ? <div className="sb-people-list">{groups.map(row => <div className="sb-person-row is-static" key={row.id}><span className="sb-avatar is-md"><Emoji e={row.emoji || '👥'}/></span><span className="sb-person-main"><strong>{row.name}</strong><small>{row.memberIds.map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(', ') || 'Belum ada anggota'}</small></span><span className="toolbar-row"><button type="button" className="icon-btn" aria-label={`Ubah ${row.name}`} onClick={() => setGroup(row)}><Edit3 size={15}/></button>{user && <Confirm title={`Hapus grup ${row.name}?`} description="Orang di dalamnya tetap tersimpan." confirmLabel="Hapus" onConfirm={() => track(deleteSplitGroup(user.uid, row.id), { pending: 'Menghapus…', success: 'Grup dihapus.', failure: 'Belum terhapus' })}><button type="button" className="icon-btn" aria-label={`Hapus ${row.name}`}><Trash2 size={15}/></button></Confirm>}</span></div>)}</div> : !group && <Empty message="Belum ada grup."/>}
    </>}
  </div></DialogContent></Dialog>;
}
