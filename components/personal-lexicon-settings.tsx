'use client';
import { useEffect, useMemo, useState } from 'react';
import { BookOpenText, Plus, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { Input, Select } from './fields';
import { Button } from './ui/button';
import { saveLexicon } from '@/lib/firestore';
import { aliasProblem, decay, labelOf, STATUS_LABEL, teach, TYPE_LABEL, withStatus, type AliasType, type Contact, type PersonalAlias } from '@/lib/catat/personal';
import type { QuickContext } from '@/lib/quick-entry';

/**
 * Pengaturan › Bahasa Saya: the words Catat otomatis learned from this person (places, people, short forms).
 * View, add, change, turn off, delete, or reset — the dictionary only, never a transaction, wallet, debt or contact.
 */
type Perform = (fn: () => Promise<unknown>, message: string) => Promise<void>;
const FILTERS: [string, string, AliasType[]][] = [['all', 'Semua', []], ['merchant', 'Tempat belanja', ['merchant']], ['person', 'Orang', ['person']], ['place', 'Tempat', ['place']], ['other', 'Lainnya', ['wallet', 'category', 'purpose', 'abbr']]];
const ORDER: AliasType[] = ['merchant', 'person', 'place', 'wallet', 'category', 'purpose', 'abbr'];

export function PersonalLexiconSettings({ perform }: { perform: Perform }) {
  const { user, profile, data } = useApp();
  const lex = useMemo(() => profile?.personalLexicon || {}, [profile?.personalLexicon]);
  // The switch moves at once; the saved value takes over when it comes back.
  const [onLocal, setOnLocal] = useState<boolean | null>(null);
  useEffect(() => { setOnLocal(null); }, [lex.on]);
  const on = onLocal ?? lex.on !== false;
  const [contacts, setContacts] = useState<Contact[]>([]);
  useEffect(() => { if (!user) return; let off: (() => void) | undefined, live = true; void import('@/lib/split-bill-store').then(m => { if (live) off = m.subscribeSplitContacts(user.uid, v => setContacts(v.people.map(p => ({ id: p.id, name: p.name }))), () => {}); }); return () => { live = false; off?.(); }; }, [user]);
  const ctx = useMemo(() => ({ wallets: data.wallets, categories: data.categories, history: [], today: '', receivables: data.receivables, debts: data.debts }) as QuickContext, [data.wallets, data.categories, data.receivables, data.debts]);
  // Old weak memories fade once, when this page is opened (never an explicit one).
  useEffect(() => { if (!user || !profile?.personalLexicon) return; const changes = decay(profile.personalLexicon, Date.now()); if (Object.keys(changes).length) void saveLexicon(user.uid, changes).catch(() => {}); }, [user, profile?.personalLexicon]);
  const list = useMemo(() => Object.values(lex.aliases || {}).map(withStatus).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.alias.localeCompare(b.alias)), [lex.aliases]);
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [editing, setEditing] = useState(''), [draft, setDraft] = useState(''), [sure, setSure] = useState(false);
  const [adding, setAdding] = useState(false), [form, setForm] = useState<{ raw: string; label: string; type: AliasType; targetId: string }>({ raw: '', label: '', type: 'merchant', targetId: '' }), [formError, setFormError] = useState('');
  const shown = list.filter(a => (filter === 'all' || FILTERS.find(f => f[0] === filter)![2].includes(a.type)) && (!query || `${a.alias} ${a.label}`.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID'))));
  const uid = user?.uid || '';
  const save = (changes: Record<string, PersonalAlias | null>, message: string, options: { on?: boolean; reset?: boolean } = {}) => perform(() => saveLexicon(uid, changes, options), message);
  const target = (type: AliasType) => type === 'wallet' ? data.wallets.filter(w => !w.isArchived).map(w => ({ id: w.id, name: w.name })) : type === 'category' ? data.categories.filter(c => !c.isArchived).map(c => ({ id: c.id, name: c.parentId ? `${data.categories.find(p => p.id === c.parentId)?.name || ''} › ${c.name}` : c.name })) : [];

  function add() {
    setFormError('');
    const needsTarget = form.type === 'wallet' || form.type === 'category';
    const label = needsTarget ? target(form.type).find(t => t.id === form.targetId)?.name.split(' › ').pop() || '' : form.label.trim();
    if (!form.raw.trim() || !label) { setFormError(needsTarget ? 'Isi kata dan pilih tujuannya.' : 'Isi kata dan artinya.'); return; }
    const contact = form.type === 'person' ? contacts.find(c => c.name.toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID')) : undefined;
    const r = teach(lex, form.raw, label, form.type, needsTarget ? form.targetId : contact ? `sp:${contact.id}` : undefined, ctx);
    if (r.problem) { setFormError(r.problem); return; }
    void save(r.changes, `“${form.raw.trim()}” disimpan di Kamus Pribadi.`).then(() => { setForm({ raw: '', label: '', type: form.type, targetId: '' }); setAdding(false); });
  }
  function rename(a: PersonalAlias) {
    const label = draft.trim();
    if (!label || label === a.label) { setEditing(''); return; }
    const r = teach({ ...lex, aliases: Object.fromEntries(Object.entries(lex.aliases || {}).filter(([id]) => id !== a.id)) }, a.alias, label, a.type, a.type === 'wallet' || a.type === 'category' ? a.targetId : undefined, ctx);
    if (r.problem) { setFormError(r.problem); return; }
    void save({ [a.id]: null, ...r.changes }, 'Arti kata diubah.').then(() => setEditing(''));
  }

  return <div className="pl-settings">
    <section className="fc-card">
      <header><span className="fc-card-icon"><BookOpenText size={17}/></span><div><h3>Cara kerjanya</h3><p>Kata, nama, dan singkatan yang biasa kamu pakai, supaya Catat otomatis langsung paham. Contoh: “besto” untuk D'Besto, “kak tio” untuk Muhammad Tio.</p></div></header>
      <label className="switch-row"><input type="checkbox" checked={on} onChange={e => { const v = e.target.checked; setOnLocal(v); void save({}, v ? 'Personalisasi bahasa aktif.' : 'Personalisasi bahasa dimatikan. Kata yang tersimpan tetap ada.', { on: v }); }}/><span><strong>Personalisasi bahasa</strong><small>{on ? 'Aktif: kata di bawah dipakai saat membaca kalimatmu.' : 'Mati: Catat otomatis hanya memakai bahasa umum. Kata yang tersimpan tidak dihapus.'}</small></span></label>
      <p className="pl-safety"><ShieldCheck size={15} aria-hidden="true"/><span>Yang dipelajari hanya kata dan nama. Nominal, dompet yang dipakai, tanggal, jam, dan arah utang selalu dibaca dari kalimatmu saat itu. Kamus ini tersimpan di akunmu sendiri dan tidak dikirim ke layanan lain.</span></p>
    </section>

    <section className="fc-card">
      <header><div><h3>Kamus Pribadi <small className="pl-count">{list.length} kata</small></h3><p>Kata baru dipelajari diam-diam dari koreksimu. Kata yang baru sekali dikoreksi belum dipakai; setelah beberapa kali baru dikenali.</p></div></header>
      {list.length > 6 && <div className="pl-tools">
        <label className="pl-search"><Search size={15} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari kata" aria-label="Cari kata"/></label>
        <div className="pl-filters" role="radiogroup" aria-label="Jenis">{FILTERS.map(([key, label]) => <button type="button" key={key} role="radio" aria-checked={filter === key} className={`sb-chip ${filter === key ? 'is-on' : ''}`} onClick={() => setFilter(key)}>{label}</button>)}</div>
      </div>}
      {!list.length && <p className="pl-empty">Belum ada kata. Ketik di Catat otomatis, misalnya “ingat besto itu D'Besto”, atau tambahkan di bawah.</p>}
      {shown.length > 0 && <ul className="pl-list">{shown.map(a => {
        const label = labelOf(a, ctx, contacts), orphan = !label;
        return <li key={a.id} className={`pl-row is-${a.status} ${orphan ? 'is-orphan' : ''}`}>
          <div className="pl-main">
            <strong>{a.alias}</strong><span aria-hidden="true">→</span>
            {editing === a.id ? <span className="pl-edit"><Input value={draft} onChange={e => setDraft(e.target.value)} aria-label={`Arti baru untuk ${a.alias}`} autoFocus onKeyDown={e => { if (e.key === 'Enter') rename(a); if (e.key === 'Escape') setEditing(''); }}/><Button type="button" className="small" onClick={() => rename(a)}>Simpan</Button></span>
              : <button type="button" className="pl-label" onClick={() => { if (a.type === 'wallet' || a.type === 'category') return; setEditing(a.id); setDraft(a.label); }} title={a.type === 'wallet' || a.type === 'category' ? undefined : 'Ubah arti'}>{label || a.label}</button>}
          </div>
          <small className="pl-meta">{TYPE_LABEL[a.type]} · {orphan ? 'Tujuannya sudah dihapus' : STATUS_LABEL[a.status]}{a.source === 'explicit' ? ' · kamu yang menyimpan' : ''}</small>
          <span className="pl-actions">
            <button type="button" className="link-button" onClick={() => void save({ [a.id]: withStatus({ ...a, off: !a.off, ...(a.off ? { reject: 0 } : {}), updated: Date.now() }) }, a.off ? `“${a.alias}” dipakai lagi.` : `“${a.alias}” tidak dipakai lagi.`)}>{a.status === 'disabled' ? 'Aktifkan' : 'Nonaktifkan'}</button>
            <button type="button" className="icon-btn" aria-label={`Hapus ${a.alias}`} onClick={() => void save({ [a.id]: null }, `“${a.alias}” dihapus dari Kamus Pribadi.`)}><Trash2 size={15}/></button>
          </span>
        </li>;
      })}</ul>}
      {list.length > 0 && !shown.length && <p className="pl-empty">Tidak ada kata yang cocok.</p>}

      {adding ? <div className="pl-add">
        <div className="pl-add-grid">
          <label><span>Kata yang kamu ketik</span><Input value={form.raw} onChange={e => setForm(f => ({ ...f, raw: e.target.value }))} placeholder="mis. besto"/></label>
          <label><span>Jenis</span><Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AliasType, targetId: '' }))}>{ORDER.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></label>
          {form.type === 'wallet' || form.type === 'category'
            ? <label><span>Artinya</span><Select value={form.targetId} onChange={e => setForm(f => ({ ...f, targetId: e.target.value }))}><option value="">Pilih {TYPE_LABEL[form.type].toLowerCase()}</option>{target(form.type).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
            : <label><span>Artinya</span><Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={form.type === 'person' ? 'mis. Muhammad Tio' : form.type === 'abbr' ? 'mis. parkir' : 'mis. D\'Besto'}/></label>}
        </div>
        {form.raw && !formError && aliasProblem(form.raw, form.type, ctx) && <small className="qp-warn">{aliasProblem(form.raw, form.type, ctx)}</small>}
        {formError && <small className="qp-warn" role="alert">{formError}</small>}
        <div className="pl-add-actions"><Button type="button" onClick={add}>Simpan kata</Button><Button type="button" variant="secondary" onClick={() => { setAdding(false); setFormError(''); }}>Batal</Button></div>
      </div> : <Button type="button" variant="secondary" className="pl-add-btn" onClick={() => setAdding(true)}><Plus size={15}/> Tambah kata</Button>}
    </section>

    {list.length > 0 && <section className="fc-card">
      <header><div><h3>Reset Kamus Pribadi</h3><p>Menghapus semua kata di atas. Transaksi, dompet, utang, piutang, klaim, kontak, dan riwayatmu tidak berubah.</p></div></header>
      {sure ? <div className="pl-add-actions"><Button type="button" variant="danger" onClick={() => void save({}, 'Kamus Pribadi dikosongkan.', { reset: true, on }).then(() => setSure(false))}><RotateCcw size={15}/> Ya, kosongkan</Button><Button type="button" variant="secondary" onClick={() => setSure(false)}>Batal</Button></div>
        : <Button type="button" variant="secondary" onClick={() => setSure(true)}><RotateCcw size={15}/> Reset Kamus Pribadi</Button>}
    </section>}
  </div>;
}
