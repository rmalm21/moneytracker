'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, Pencil, RotateCcw, CirclePlus, ConciergeBell, HeartHandshake, Percent, Receipt, Scale, Tag, Truck, Users, Minus, Plus, ScanText, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money, Select } from './fields';
import { CategoryPicker } from './category-picker';
import { Emoji } from './emoji';
import { AppIcon } from './visual-identity';
import { PeopleManager } from './split-people';
import { PersonAvatar, personName, shrinkPhoto } from './split-bill-shared';
import { ReceiptScan } from './receipt-scan';
import { billProgress, computeSplit, defaultDistribution, differenceText, EXTRA_LABELS, isDeduction, METHOD_LABELS, splitFromReceipt } from '@/lib/split-bill';
import { saveSplitBill, saveSplitPerson, type SplitBillInput } from '@/lib/split-bill-store';
import { suggestCategory } from '@/lib/categorize';
import { rupiah } from '@/lib/accounting';
import { walletAllows } from '@/lib/wallet-capabilities';
import { formatDate, todayInTimeZone } from '@/lib/period';
import type { LedgerTx, ReceiptSnapshot, SplitBill, SplitExtra, SplitExtraKind, SplitGroup, SplitItem, SplitMethod, SplitParticipant, SplitPerson } from '@/lib/types';

/**
 * Making or changing a Split Bill on one page: who, the items and who had them, extra costs and discounts, each
 * person's total, and whether it all adds up to the receipt. A receipt is read and checked in the same Scan struk
 * review as transactions ("Gunakan di Split Bill"); its corrected items, item discounts and charges come in as
 * structure. Nothing touches money until "Selesai membagi"; "Simpan draft" keeps the work without any money records.
 */
export type FlowStart = { mode: 'manual' | 'receipt' | 'transaction' | 'edit' | 'copy'; bill?: SplitBill; tx?: LedgerTx; /** From Scan struk: the checked receipt and the photo. */ receipt?: ReceiptSnapshot; photo?: Blob | null };
/** Extra kinds a receipt fills in; a new receipt replaces them. */
const RECEIPT_KINDS: SplitExtraKind[] = ['service', 'tax', 'discount', 'delivery', 'admin', 'tip', 'rounding'];
/** A checked receipt laid over a bill: its items and charges replace the old ones; a bill from a transaction keeps its total and date. */
function withReceipt(current: SplitBillInput, receipt: ReceiptSnapshot): SplitBillInput {
  const r = splitFromReceipt(receipt, newId);
  return {
    ...current,
    merchant: current.merchant || r.merchant, title: current.title || r.merchant,
    date: !current.fromTransaction && r.date ? r.date : current.date, time: !current.fromTransaction && r.time ? r.time : current.time,
    total: current.fromTransaction ? current.total : r.total || current.total,
    items: r.items.length ? r.items : current.items,
    extras: [...current.extras.filter(extra => !RECEIPT_KINDS.includes(extra.kind)), ...r.extras],
    method: r.items.length ? 'items' : current.method,
  };
}
const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 9)}`;
const EXTRA_KINDS: SplitExtraKind[] = ['tax', 'service', 'discount', 'delivery', 'admin', 'tip', 'rounding', 'shared', 'other'];
/** Icon and a short example for each kind of extra cost, in the "Tambah biaya tambahan" menu. */
const EXTRA_LOOKS: Record<SplitExtraKind, [typeof Percent, string]> = { tax: [Percent, 'PB1 atau PPN, biasanya 10–11%'], service: [ConciergeBell, 'Biaya layanan restoran'], discount: [Tag, 'Promo, voucher, potongan'], delivery: [Truck, 'Ongkir pesan antar'], admin: [Receipt, 'Biaya aplikasi atau transaksi'], tip: [HeartHandshake, 'Tambahan untuk pelayan'], rounding: [Scale, 'Selisih pembulatan kasir'], shared: [Users, 'Sewa lapangan, parkir, bensin'], other: [CirclePlus, 'Biaya lain apa pun'] };
const readPercent = (text: string) => { const value = Number(text.replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 100) : 0; };
const showPercent = (points?: number) => points ? String(points / 100).replace('.', ',') : '';

function startBill(start: FlowStart, context: { myName: string; today: string; walletId: string }): SplitBillInput {
  if (start.bill) {
    const { id, createdAt: _c, updatedAt: _u, shares: _s, myShare: _m, cancelledAt: _x, status: _t, ...rest } = start.bill;
    if (start.mode !== 'copy') return { ...rest, id };
    return { ...rest, participants: rest.participants.map(person => ({ ...person, receivableId: null, debtId: null })), payments: [], transactionId: '', fromTransaction: false, receiptPath: '', walletId: rest.walletId || context.walletId, date: context.today };
  }
  const base: SplitBillInput = { title: '', merchant: '', date: context.today, time: '', dueDate: '', payer: 'me', payerId: 'me', walletId: context.walletId, transactionId: '', fromTransaction: false, categoryId: null, subcategoryId: null, total: 0, method: 'equal', participants: [{ id: 'me', name: context.myName, isMe: true }], items: [], extras: [], payments: [], notes: '', groupId: null, receiptPath: '' };
  const tx = start.tx;
  if (!tx) return base;
  return { ...base, title: tx.description || tx.merchant || 'Split Bill', merchant: tx.merchant || '', date: tx.date, time: tx.time || '', total: tx.amount, walletId: tx.walletId, transactionId: tx.id, fromTransaction: true, categoryId: tx.categoryId, subcategoryId: tx.subcategoryId, notes: tx.notes || '' };
}

export function SplitFlow({ start, people, groups, onClose, onSaved }: { start: FlowStart; people: SplitPerson[]; groups: SplitGroup[]; onClose: () => void; onSaved: (id: string, message: string) => void }) {
  const { user, data, profile } = useApp();
  const { track } = useNotify();
  const today = todayInTimeZone(profile?.timeZone);
  const payWallets = data.wallets.filter(w => walletAllows(w, 'pay'));
  const defaultWallet = payWallets.find(w => w.id === profile?.defaultExpenseWalletId)?.id || payWallets[0]?.id || '';
  const myName = profile?.displayName?.trim() || 'Saya';
  const [bill, setBill] = useState<SplitBillInput>(() => { const base = startBill(start, { myName, today, walletId: defaultWallet }); return start.receipt ? withReceipt(base, start.receipt) : base; });
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [understood, setUnderstood] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  // Opening from "Scan struk" goes straight to the camera and the shared receipt review.
  const [scanOpen, setScanOpen] = useState(start.mode === 'receipt' && !start.receipt);
  const [openItem, setOpenItem] = useState(''), [addingItem, setAddingItem] = useState(false), [addingPerson, setAddingPerson] = useState(false), [openPerson, setOpenPerson] = useState(''), [billOpen, setBillOpen] = useState(false), [otherMethods, setOtherMethods] = useState(false);
  const [newName, setNewName] = useState(''), [remember, setRemember] = useState(true), [lastPicked, setLastPicked] = useState('');
  const [itemName, setItemName] = useState(''), [itemQty, setItemQty] = useState(1), [itemPrice, setItemPrice] = useState(0);
  const [openExtra, setOpenExtra] = useState(''), [addingExtra, setAddingExtra] = useState(false), [peopleOpen, setPeopleOpen] = useState(false), [exactFor, setExactFor] = useState('');
  const editing = start.mode === 'edit' && start.bill?.status === 'active';
  const original = start.bill;
  const progress = useMemo(() => editing && original ? billProgress(original, data.receivables, data.debts) : null, [editing, original, data.receivables, data.debts]);
  const paidPeople = new Set((progress?.people || []).filter(person => person.role !== 'payer' && person.paid > 0).map(person => person.id));
  const hasPayments = paidPeople.size > 0;
  const result = useMemo(() => computeSplit(bill), [bill]);
  // "Nominal manual" and "Persentase": what is typed against what has to be shared (before charges, as the amounts are).
  const typed = bill.method === 'amount' || bill.method === 'percent';
  const typedNeed = useMemo(() => bill.method === 'amount' ? computeSplit({ ...bill, method: 'equal' }).people.reduce((n, p) => n + p.base, 0) : 10000, [bill]);
  const typedSum = bill.participants.reduce((n, p) => n + (bill.method === 'amount' ? p.amount || 0 : p.percent || 0), 0);
  const typedLeft = typedNeed - typedSum;
  const patch = (changes: Partial<SplitBillInput>) => { setBill(current => ({ ...current, ...changes })); setError(''); };
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const me = bill.participants.find(person => person.isMe);
  const others = bill.participants.filter(person => !person.isMe);
  const payer = bill.payer === 'me' ? me : bill.participants.find(person => person.id === bill.payerId);
  const categoryGuess = useMemo(() => {
    if (bill.categoryId || !(bill.title.trim() || bill.merchant.trim())) return null;
    const text = `${bill.title} ${bill.merchant}`.toLocaleLowerCase('id-ID').trim();
    const guess = suggestCategory({ text, item: bill.title.toLocaleLowerCase('id-ID').trim(), merchant: bill.merchant, amount: bill.total, type: 'expense' }, { categories: data.categories, history: data.transactions });
    const category = guess && data.categories.find(c => c.id === (guess.subcategoryId || guess.categoryId));
    return guess && category ? { ...guess, name: category.name, icon: category.icon } : null;
  }, [bill.categoryId, bill.title, bill.merchant, bill.total, data.categories, data.transactions]);

  /* ---------------- people */
  function addPerson(name: string, fields: Partial<SplitParticipant> = {}) {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    if (bill.participants.some(person => !person.isMe && person.name.trim().toLocaleLowerCase('id-ID') === clean.toLocaleLowerCase('id-ID'))) { setError(`${clean} sudah ada di daftar.`); return; }
    const person: SplitParticipant = { id: newId('p'), name: clean, ...fields };
    setBill(current => ({ ...current, participants: [...current.participants, person], payerId: current.payer === 'other' && !current.payerId ? person.id : current.payerId }));
    setError('');
    return person;
  }
  async function addTyped() {
    const clean = newName.trim();
    if (!clean) return;
    const saved = people.find(person => person.name.trim().toLocaleLowerCase('id-ID') === clean.toLocaleLowerCase('id-ID'));
    if (saved) { addPerson(saved.name, { personId: saved.id, emoji: saved.emoji || undefined }); setNewName(''); return; }
    const person = addPerson(clean);
    setNewName('');
    if (person && remember && user) {
      try { const id = await saveSplitPerson(user.uid, { name: clean }); setBill(current => ({ ...current, participants: current.participants.map(row => row.id === person.id ? { ...row, personId: id } : row) })); }
      catch { /* the bill still works without the saved contact */ }
    }
  }
  function removePerson(id: string) {
    setBill(current => ({
      ...current,
      participants: current.participants.filter(person => person.id !== id),
      payerId: current.payerId === id ? '' : current.payerId,
      items: current.items.map(item => ({ ...item, people: item.people.filter(pid => pid !== id), units: item.units && Object.fromEntries(Object.entries(item.units).filter(([pid]) => pid !== id)), custom: item.custom && Object.fromEntries(Object.entries(item.custom).filter(([pid]) => pid !== id)) })),
      extras: current.extras.map(extra => ({ ...extra, people: extra.people?.filter(pid => pid !== id), custom: extra.custom && Object.fromEntries(Object.entries(extra.custom).filter(([pid]) => pid !== id)) })),
    }));
  }
  function toggleMe(on: boolean) {
    if (on && !me) setBill(current => ({ ...current, participants: [{ id: 'me', name: myName, isMe: true }, ...current.participants] }));
    if (!on && me) removePerson(me.id);
  }
  function addGroup(group: SplitGroup) {
    const members = group.memberIds.map(id => people.find(person => person.id === id)).filter((person): person is SplitPerson => Boolean(person));
    const known = new Set(bill.participants.map(person => person.personId || person.name.trim().toLocaleLowerCase('id-ID')));
    const fresh = members.filter(person => !known.has(person.id) && !known.has(person.name.trim().toLocaleLowerCase('id-ID'))).map(person => ({ id: newId('p'), name: person.name, personId: person.id, emoji: person.emoji || undefined }));
    setBill(current => ({ ...current, groupId: group.id, participants: [...current.participants, ...fresh], payerId: current.payer === 'other' && !current.payerId && fresh[0] ? fresh[0].id : current.payerId }));
  }
  const suggestions = useMemo(() => {
    const query = newName.trim().toLocaleLowerCase('id-ID'), taken = new Set(bill.participants.map(person => person.personId).filter(Boolean));
    return people.filter(person => !taken.has(person.id) && (!query || person.name.toLocaleLowerCase('id-ID').includes(query) || (person.nickname || '').toLocaleLowerCase('id-ID').includes(query))).slice(0, query ? 6 : 10);
  }, [people, newName, bill.participants]);

  /* ---------------- items and extras */
  const setItems = (items: SplitItem[]) => setBill(current => ({ ...current, items, method: items.length && !current.items.length && current.method === 'equal' ? 'items' : !items.length && current.method === 'items' ? 'equal' : current.method }));
  const changeItem = (id: string, changes: Partial<SplitItem>) => setItems(bill.items.map(item => item.id === id ? { ...item, ...changes } : item));
  function addItem() {
    if (!itemName.trim() || itemPrice <= 0) { setError('Isi nama dan harga item.'); return; }
    setItems([...bill.items, { id: newId('i'), name: itemName.trim().slice(0, 60), qty: Math.max(1, itemQty), price: itemPrice, assign: 'shared', people: [] }]);
    setItemName(''); setItemQty(1); setItemPrice(0); setError('');
  }
  function toggleTaker(item: SplitItem, id: string) {
    const has = item.people.includes(id);
    changeItem(item.id, { people: has ? item.people.filter(pid => pid !== id) : [...item.people, id] });
    if (!has) setLastPicked(id);
  }
  const assignedIds = new Set(bill.items.flatMap(item => [...item.people, ...Object.keys(item.units || {}).filter(id => (item.units?.[id] || 0) > 0), ...Object.keys(item.custom || {}).filter(id => (item.custom?.[id] || 0) > 0)]));
  const addExtra = (kind: SplitExtraKind) => { const id = newId('x'); setOpenExtra(id); patch({ extras: [...bill.extras, { id, kind, label: kind === 'tax' ? 'PB1' : kind === 'service' ? 'Service' : kind === 'shared' ? '' : EXTRA_LABELS[kind], amount: 0, distribution: defaultDistribution(kind) }] }); };
  const changeExtra = (id: string, changes: Partial<SplitExtra>) => patch({ extras: bill.extras.map(extra => extra.id === id ? { ...extra, ...changes } : extra) });

  /* ---------------- receipt: read and checked in the shared Scan struk review */
  async function keepPhoto(file: Blob | null | undefined) {
    if (!file) return;
    try { const small = await shrinkPhoto(file); if (photoUrl) URL.revokeObjectURL(photoUrl); setPhotoUrl(URL.createObjectURL(small)); } catch { /* the receipt data is enough */ }
  }
  useEffect(() => { if (start.photo) void keepPhoto(start.photo); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function useReceipt(receipt: ReceiptSnapshot, file: Blob | null) {
    setBill(current => withReceipt(current, receipt)); void keepPhoto(file); setError('');
  }

  /* ---------------- checks and saving */
  function blocker() {
    if (bill.participants.length < 2) return 'Tambahkan minimal 2 orang.';
    if (bill.payer === 'other' && !bill.participants.some(person => person.id === bill.payerId && !person.isMe)) return 'Pilih siapa yang membayar.';
    if (bill.payer === 'me' && !bill.fromTransaction && !bill.walletId) return 'Pilih dompet yang dipakai membayar.';
    return '';
  }
  async function save(draft: boolean) {
    if (!user) return;
    const input = { ...bill, title: bill.title.trim() || bill.merchant.trim() || `Split Bill ${formatDate(bill.date, false)}` };
    if (!draft) {
      const problem = blocker() || (result.ok ? '' : result.issues[0].message) || (!bill.categoryId && !bill.fromTransaction ? 'Pilih kategori tagihan.' : '');
      if (problem) { setError(problem); if (/dompet|kategori|bayar/i.test(problem)) setBillOpen(true); if (/orang/i.test(problem)) setAddingPerson(true); return; }
      if (hasPayments && !understood) { setError('Centang dulu bahwa kamu mengerti perubahannya.'); return; }
    }
    setSaving(true); setError('');
    try {
      const id = await saveSplitBill(user.uid, { ...input, total: bill.items.length && !bill.fromTransaction ? result.total : bill.total }, { draft });
      onSaved(id, draft ? 'Draft Split Bill disimpan.' : editing ? 'Split Bill diperbarui.' : 'Split Bill disimpan.');
    } catch (e) { setError((e as Error).message || 'Split Bill belum tersimpan.'); }
    finally { setSaving(false); }
  }

  /* ---------------- the page */
  const moneyOf = (id: string) => result.people.find(person => person.id === id)?.total || 0;
  const personChip = (person: SplitParticipant, selected: boolean, onClick: () => void, extra?: ReactNode) => <button type="button" key={person.id} className={`sb-chip ${selected ? 'is-on' : ''}`} aria-pressed={selected} onClick={onClick}>{selected ? <Check size={13}/> : <PersonAvatar person={person} size="sm"/>}<span>{personName(person)}</span>{extra}</button>;
  const walletName = data.wallets.find(w => w.id === bill.walletId)?.name || 'dompet';
  const categoryName = (() => { const c = data.categories.find(x => x.id === (bill.subcategoryId || bill.categoryId)); return c?.name || ''; })();
  const itemsOf = (id: string) => bill.items.filter(item => item.people.includes(id) || (item.units?.[id] || 0) > 0 || (item.custom?.[id] || 0) > 0).length;
  const whoText = (item: SplitItem) => {
    const name = (id: string) => personName(bill.participants.find(person => person.id === id));
    if (item.assign === 'units') return Object.entries(item.units || {}).filter(([, n]) => n > 0).map(([id, n]) => `${name(id)} ${n}`).join(' · ');
    if (item.assign === 'custom') return Object.entries(item.custom || {}).filter(([, n]) => n > 0).map(([id, n]) => `${name(id)} ${rupiah(n)}`).join(' · ');
    return item.people.length === bill.participants.length && bill.participants.length > 2 ? 'Semua' : item.people.map(name).join(' · ');
  };
  const receiptTotal = bill.total || result.total;
  const matches = !result.mismatch && !result.unassigned;
  const unassignedTotal = result.unassignedItems.reduce((sum, row) => sum + row.amount, 0);
  const itemMode = bill.items.length > 0;

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent title={editing ? 'Ubah Split Bill' : start.mode === 'transaction' ? 'Split Bill dari transaksi' : 'Split Bill'} className="sb-flow-dialog">
      <div className="sb-flow sb-one">
        {/* 1. The bill at a glance. */}
        <header className="sb-top">
          <input className="sb-title" value={bill.title} maxLength={120} onChange={e => patch({ title: e.target.value })} placeholder="Nama tagihan, mis. Makan malam tim" aria-label="Nama tagihan"/>
          <small className="sb-top-meta">{[`${bill.participants.length} orang`, `${bill.items.length} item`, bill.merchant && bill.merchant !== bill.title ? bill.merchant : ''].filter(Boolean).join(' · ')}</small>
          <div className="sb-top-total"><b>{rupiah(result.total || bill.total)}</b>{(result.total || bill.total) > 0 && <span className={`sb-match ${matches ? 'is-ok' : 'is-warn'}`}>{matches ? <><Check size={13}/> Cocok</> : <><AlertTriangle size={13}/> {result.unassigned ? `${rupiah(Math.abs(result.unassigned))} belum dibagi` : `Selisih ${rupiah(Math.abs(result.mismatch))}`}</>}</span>}</div>
          <div className="sb-top-actions">
            <button type="button" className="rs-pill" onClick={() => setScanOpen(true)}><ScanText size={14}/> {photoUrl || bill.items.length ? 'Scan ulang' : 'Scan struk'}</button>
            <button type="button" className="rs-pill" onClick={() => { setAddingItem(true); setOpenItem(''); }}><Plus size={14}/> Tambah item</button>
            {photoUrl && <img className="sb-top-thumb" src={photoUrl} alt="Foto struk"/>}
          </div>
        </header>

        {/* 2. Who is splitting. */}
        <section className="sb-sec">
          <div className="sb-sec-head"><h4>Orang</h4><small>{bill.participants.length}</small></div>
          <div className="sb-people-row">
            {bill.participants.map(person => <span className={`sb-person-chip ${bill.payer === 'other' && person.id === bill.payerId || bill.payer === 'me' && person.isMe ? 'is-payer' : ''}`} key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span>{!person.isMe && !paidPeople.has(person.id) && <button type="button" aria-label={`Hapus ${person.name}`} onClick={() => removePerson(person.id)}><X size={13}/></button>}</span>)}
            <button type="button" className="sb-person-add" aria-expanded={addingPerson} onClick={() => setAddingPerson(v => !v)}><UserPlus size={14}/> Tambah</button>
          </div>
          {/* Who paid, in reach instead of folded under Pembayaran. */}
          <div className="sb-payer-row" role="radiogroup" aria-label="Yang bayar">
            <small>Yang bayar</small>
            <div className="sb-chips">{!me && <button type="button" role="radio" aria-checked={bill.payer === 'me'} className={`sb-chip ${bill.payer === 'me' ? 'is-on' : ''}`} disabled={bill.payer !== 'me' && hasPayments} onClick={() => patch({ payer: 'me', payerId: '' })}>{bill.payer === 'me' ? <Check size={13}/> : null}<span>Saya (tidak ikut patungan)</span></button>}{bill.participants.map(person => { const on = bill.payer === 'me' ? Boolean(person.isMe) : person.id === bill.payerId; const locked = !on && (hasPayments || (bill.fromTransaction && !person.isMe)); return <button type="button" role="radio" aria-checked={on} key={person.id} className={`sb-chip ${on ? 'is-on' : ''}`} disabled={locked} title={locked ? (hasPayments ? 'Sudah ada pembayaran, pembayar tidak bisa diganti.' : 'Split Bill dari transaksi selalu dibayar olehmu.') : undefined} onClick={() => patch(person.isMe ? { payer: 'me', payerId: person.id } : { payer: 'other', payerId: person.id })}>{on ? <Check size={13}/> : <PersonAvatar person={person} size="sm"/>}<span>{personName(person)}</span></button>; })}</div>
            <small className="muted">{bill.payer === 'me' ? `Kamu yang bayar${bill.fromTransaction ? '' : ` dari ${walletName}`}; teman membayar balik ke kamu.` : `${payer ? personName(payer) : 'Orang lain'} yang bayar; bagianmu jadi utang ke dia.`}</small>
          </div>
          {addingPerson && <div className="sb-add-panel">
            <form className="sb-add" onSubmit={e => { e.preventDefault(); void addTyped(); }}>
              <Input value={newName} maxLength={60} onChange={e => setNewName(e.target.value)} placeholder="Nama orang" aria-label="Nama orang" autoComplete="off" autoFocus/>
              <Button type="submit" className="small" disabled={!newName.trim()}>Tambah</Button>
            </form>
            {newName.trim() && !people.some(person => person.name.trim().toLocaleLowerCase('id-ID') === newName.trim().toLocaleLowerCase('id-ID')) && <label className="check-row sb-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Simpan ke Orang tersimpan</label>}
            {suggestions.length > 0 && <div className="sb-chips">{suggestions.map(person => <button type="button" key={person.id} className="sb-chip" onClick={() => { addPerson(person.name, { personId: person.id, emoji: person.emoji || undefined }); setNewName(''); }}>{person.emoji ? <Emoji e={person.emoji}/> : <Plus size={14}/>}<span>{person.name}</span></button>)}</div>}
            {groups.length > 0 && <div className="sb-chips">{groups.map(group => <button type="button" key={group.id} className={`sb-chip ${bill.groupId === group.id ? 'is-on' : ''}`} onClick={() => addGroup(group)}><Emoji e={group.emoji || '👥'}/><span>{group.name}</span><small>{group.memberIds.length}</small></button>)}</div>}
            <label className="check-row"><input type="checkbox" checked={Boolean(me)} onChange={e => toggleMe(e.target.checked)}/> Saya ikut patungan</label>
            <button type="button" className="sb-link" onClick={() => setPeopleOpen(true)}><Users size={14}/> Kelola orang tersimpan{people.length ? ` (${people.length})` : ''}</button>
          </div>}
        </section>

        {/* 3. Items and who had them. */}
        <section className="sb-sec">
          <div className="sb-sec-head"><h4>Item</h4><small>{itemMode ? `${bill.items.length} · ${rupiah(result.subtotal)}` : 'tanpa item: dibagi rata'}</small></div>
          {itemMode && <ul className="sbx-rows">{bill.items.map(item => {
            const gross = item.qty * item.price, net = Math.max(0, gross - (item.discount || 0)), open = openItem === item.id, left = result.unassignedItems.find(row => row.id === item.id);
            const unitsUsed = Object.values(item.units || {}).reduce((a, b) => a + b, 0), who = whoText(item);
            return <li key={item.id} className={`sbx-row ${open ? 'is-open' : ''} ${left ? 'is-left' : ''}`}>
              <button type="button" className="sbx-row-main" aria-expanded={open} onClick={() => setOpenItem(open ? '' : item.id)}>
                <span className="sbx-row-name">{item.name}{item.qty > 1 && <small>{item.qty} × {rupiah(item.price)}</small>}</span>
                <b>{rupiah(gross)}</b>
              </button>
              {item.discount ? <div className="sbx-row-sub"><span>Diskon item</span><span>−{rupiah(item.discount)}</span></div> : null}
              {item.discount ? <div className="sbx-row-sub is-net"><span>Dibagi</span><span>{rupiah(net)}</span></div> : null}
              <div className={`sbx-row-who ${left ? 'is-left' : ''}`}>{left ? <><AlertTriangle size={12}/> {who ? `${who} · ` : ''}belum dibagi {rupiah(left.amount)}</> : who}</div>
              {open && <div className="sbx-row-edit sbi">
                {/* The item itself stays editable while it is being split: name, amount and price right here. */}
                <div className="sbi-fields">
                  <input className="input sbi-name" value={item.name} maxLength={60} onChange={e => changeItem(item.id, { name: e.target.value })} aria-label="Nama item" placeholder="Nama item"/>
                  <div className="sbi-nums"><span className="sb-stepper" aria-label="Jumlah"><button type="button" aria-label="Kurangi" onClick={() => changeItem(item.id, { qty: Math.max(1, item.qty - 1) })}><Minus size={14}/></button><b>{item.qty}</b><button type="button" aria-label="Tambah" onClick={() => changeItem(item.id, { qty: Math.min(999, item.qty + 1) })}><Plus size={14}/></button></span><span className="sbi-x" aria-hidden="true">×</span><Money value={item.price} onChange={price => changeItem(item.id, { price })} placeholder="Harga satuan"/></div>
                </div>
                <div className="sbi-split">
                  <div className="sbi-split-head"><small className="sb-ask">Dibagi</small><div className="ip-seg sbi-seg" role="radiogroup" aria-label="Cara bagi item">{([['shared', 'Rata'], ['units', 'Per porsi'], ['custom', 'Nominal']] as [SplitItem['assign'], string][]).filter(([key]) => key !== 'units' || item.qty > 1 || item.assign === 'units').map(([key, label]) => <button type="button" role="radio" aria-checked={item.assign === key} key={key} className={item.assign === key ? 'active' : ''} onClick={() => changeItem(item.id, { assign: key })}>{label}</button>)}</div></div>
                {item.assign === 'units' && item.qty > 1 ? <div className="sb-units">{bill.participants.map(person => { const count = item.units?.[person.id] || 0; return <span className="sb-unit" key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span><span className="sb-stepper"><button type="button" aria-label="Kurangi" onClick={() => changeItem(item.id, { units: { ...item.units, [person.id]: Math.max(0, count - 1) } })}><Minus size={14}/></button><b>{count}</b><button type="button" aria-label="Tambah" disabled={unitsUsed >= item.qty} onClick={() => { changeItem(item.id, { units: { ...item.units, [person.id]: count + 1 } }); setLastPicked(person.id); }}><Plus size={14}/></button></span></span>; })}<small className={unitsUsed === item.qty ? 'muted' : 'sb-warn'}>{unitsUsed} dari {item.qty} porsi</small></div>
                  : item.assign === 'custom' ? <div className="sb-units">{bill.participants.map(person => <span className="sb-unit" key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span><Money value={item.custom?.[person.id] || 0} onChange={value => changeItem(item.id, { custom: { ...item.custom, [person.id]: value } })}/></span>)}</div>
                  : <><div className="sb-chips">{bill.participants.map(person => personChip(person, item.people.includes(person.id), () => toggleTaker(item, person.id)))}<button type="button" className="sb-chip is-all" onClick={() => changeItem(item.id, { people: item.people.length === bill.participants.length ? [] : bill.participants.map(person => person.id) })}>{item.people.length === bill.participants.length ? 'Kosongkan' : 'Semua'}</button></div>
                    {item.people.length > 1 && <small className="muted">{rupiah(net)} ÷ {item.people.length} = ±{rupiah(Math.round(net / item.people.length))} per orang</small>}
                    {lastPicked && !item.people.includes(lastPicked) && bill.participants.some(person => person.id === lastPicked) && <button type="button" className="sb-link" onClick={() => changeItem(item.id, { people: [...item.people, lastPicked] })}>+ {personName(bill.participants.find(person => person.id === lastPicked))} lagi</button>}</>}
                </div>
                <details className="sbi-more" open={Boolean(item.discount || item.categoryId) || undefined}><summary><span>Diskon & kategori</span><small>{[item.discount ? `diskon ${rupiah(item.discount)}` : '', item.categoryId ? 'kategori dipilih' : ''].filter(Boolean).join(' · ') || 'opsional'}</small><ChevronDown size={15} aria-hidden="true"/></summary>
                  <label className="sbi-line"><span>Diskon item</span><Money value={item.discount || 0} onChange={discount => changeItem(item.id, { discount })}/></label>
                  <div className="sb-cat"><small className="muted">Kategori untuk bagianmu</small><CategoryPicker type="expense" categoryId={item.categoryId || ''} subcategoryId={item.subcategoryId || ''} onChange={value => changeItem(item.id, { categoryId: value.categoryId || null, subcategoryId: value.subcategoryId || null })}/></div>
                </details>
                <div className="sbi-foot"><button type="button" className="sb-link is-danger" onClick={() => { setItems(bill.items.filter(row => row.id !== item.id)); setOpenItem(''); }}><Trash2 size={14}/> Hapus</button><button type="button" className="sbi-done" onClick={() => setOpenItem('')}><Check size={14}/> Selesai</button></div>
              </div>}
            </li>; })}</ul>}
          {(addingItem || !itemMode) && <form className="sb-item-add" onSubmit={e => { e.preventDefault(); addItem(); }}>
            <Input value={itemName} maxLength={60} onChange={e => setItemName(e.target.value)} placeholder="Nama item, mis. Mie Goreng" aria-label="Nama item"/>
            <div className="sb-item-nums"><span className="sb-stepper" aria-label="Jumlah"><button type="button" aria-label="Kurangi" onClick={() => setItemQty(q => Math.max(1, q - 1))}><Minus size={14}/></button><b>{itemQty}</b><button type="button" aria-label="Tambah" onClick={() => setItemQty(q => Math.min(999, q + 1))}><Plus size={14}/></button></span><span>×</span><Money value={itemPrice} onChange={setItemPrice} placeholder="Harga satuan"/><Button type="submit" variant="secondary" className="small"><Plus size={15}/></Button></div>
          </form>}
          {!itemMode && !bill.fromTransaction && <label className="sb-line"><span>Total tagihan</span><Money value={bill.total} onChange={total => patch({ total })}/></label>}
        </section>

        {/* 4. Shared charges and discounts. */}
        <section className="sb-sec">
          <div className="sb-sec-head"><h4>Tambahan &amp; diskon</h4>
            <button type="button" className="sb-link" aria-expanded={addingExtra} onClick={() => setAddingExtra(v => !v)}>{addingExtra ? 'Tutup' : <><Plus size={14}/> Tambah</>}</button>
          </div>
          {addingExtra && <div className="xe-kinds" role="group" aria-label="Jenis biaya">{EXTRA_KINDS.map(kind => { const [Icon] = EXTRA_LOOKS[kind]; return <button type="button" key={kind} className={`xe-kind is-${kind}`} onClick={() => { addExtra(kind); setAddingExtra(false); }}><span className="sb-extra-menu-icon"><Icon size={15}/></span>{EXTRA_LABELS[kind]}</button>; })}</div>}
          {!bill.extras.length && <small className="muted">Tidak ada pajak, service, atau diskon.</small>}
          {bill.extras.map(extra => {
            const resolved = result.extras.find(row => row.id === extra.id), chosen = extra.people || [], [Icon] = EXTRA_LOOKS[extra.kind];
            const how = extra.distribution === 'custom' ? 'custom' : extra.distribution === 'equal' ? 'rata' : 'proporsional';
            const opened = openExtra === extra.id;
            return <div className={`xe-row is-${extra.kind} ${opened ? 'is-open' : ''}`} key={extra.id}>
              <button type="button" className="xe-head" aria-expanded={opened} onClick={() => setOpenExtra(opened ? '' : extra.id)}><span className="sb-extra-menu-icon"><Icon size={15}/></span><span className="sb-extra-title"><strong>{extra.label.trim() || EXTRA_LABELS[extra.kind]}</strong><small>{how}{chosen.length ? ` · ${chosen.length} orang` : ''}</small></span><strong className={isDeduction(extra.kind) || (resolved?.amount || 0) < 0 ? 'amount-positive' : ''}>{resolved ? `${resolved.amount < 0 ? '−' : ''}${rupiah(Math.abs(resolved.amount))}` : rupiah(0)}</strong><ChevronDown size={15} className="xe-chev"/></button>
              {opened && <div className="sb-extra-body">
                <div className="sb-item-head"><Input className="sb-item-name" value={extra.label} maxLength={40} placeholder={extra.kind === 'shared' ? 'Misalnya Sewa lapangan' : EXTRA_LABELS[extra.kind]} onChange={e => changeExtra(extra.id, { label: e.target.value })} aria-label="Nama biaya"/><button type="button" className="icon-btn" aria-label="Hapus biaya" onClick={() => patch({ extras: bill.extras.filter(row => row.id !== extra.id) })}><Trash2 size={16}/></button></div>
                <div className="sb-extra-amount">
                  {extra.percent && bill.items.length ? <span className="sb-static input">{showPercent(extra.percent * 100)}% dari {extra.kind === 'tax' ? 'item + service' : 'item'}</span> : <Money value={Math.abs(extra.amount)} onChange={value => changeExtra(extra.id, { amount: extra.kind === 'rounding' && extra.amount < 0 ? -value : value, percent: undefined })}/>}
                  {extra.kind === 'rounding' && <div className="ip-seg sb-seg"><button type="button" className={extra.amount >= 0 ? 'active' : ''} onClick={() => changeExtra(extra.id, { amount: Math.abs(extra.amount) })}>Tambah</button><button type="button" className={extra.amount < 0 ? 'active' : ''} onClick={() => changeExtra(extra.id, { amount: -Math.abs(extra.amount) })}>Kurang</button></div>}
                  {bill.items.length > 0 && ['tax', 'service', 'tip', 'discount'].includes(extra.kind) && <div className="toolbar-row">{(extra.kind === 'tax' ? [10, 11] : extra.kind === 'service' ? [5, 10] : [5, 10, 15]).map(pct => <button type="button" key={pct} className={`link-button ${extra.percent === pct ? 'is-active' : ''}`} onClick={() => changeExtra(extra.id, { percent: extra.percent === pct ? undefined : pct })}>{pct}%</button>)}</div>}
                </div>
                <div className="sb-extra-how"><small>Dibagi</small><div className="ip-seg sb-seg">{([['proportional', 'Proporsional'], ['equal', 'Rata'], ['custom', 'Custom']] as [SplitExtra['distribution'], string][]).map(([key, label]) => <button type="button" key={key} className={extra.distribution === key ? 'active' : ''} onClick={() => changeExtra(extra.id, { distribution: key })}>{label}</button>)}</div></div>
                {extra.distribution === 'custom' ? <div className="sb-units">{(chosen.length ? bill.participants.filter(person => chosen.includes(person.id)) : bill.participants).map(person => <span className="sb-unit" key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span><Money value={extra.custom?.[person.id] || 0} onChange={value => changeExtra(extra.id, { custom: { ...extra.custom, [person.id]: value } })}/></span>)}</div>
                  : <div className="sb-extra-who"><small>Untuk</small><div className="sb-chips"><button type="button" className={`sb-chip ${!chosen.length ? 'is-on' : ''}`} onClick={() => changeExtra(extra.id, { people: [] })}><span>Semua orang</span></button>{bill.participants.map(person => personChip(person, chosen.includes(person.id), () => changeExtra(extra.id, { people: chosen.includes(person.id) ? chosen.filter(id => id !== person.id) : [...chosen, person.id] })))}</div></div>}
                {(extra.kind === 'shared' || extra.kind === 'other') && <div className="sb-cat"><small className="muted">Kategori biaya ini (opsional, untuk bagianmu)</small><CategoryPicker type="expense" categoryId={extra.categoryId || ''} subcategoryId={extra.subcategoryId || ''} onChange={value => changeExtra(extra.id, { categoryId: value.categoryId || null, subcategoryId: value.subcategoryId || null })}/></div>}
              </div>}
            </div>;
          })}
        </section>

        {/* 5. Each person's total, to check at a glance. */}
        <section className="sb-sec">
          <div className="sb-sec-head"><h4>Per orang</h4><small>{METHOD_LABELS[bill.method]}</small><button type="button" className="sb-link" aria-expanded={otherMethods} onClick={() => setOtherMethods(v => !v)}>{otherMethods ? 'Tutup' : 'Cara bagi'}</button></div>
          {otherMethods && <div className="sb-methods" role="radiogroup" aria-label="Cara bagi">{(['items', 'equal', 'amount', 'percent'] as SplitMethod[]).map(method => <button type="button" key={method} role="radio" aria-checked={bill.method === method} disabled={method === 'items' && !itemMode} className={bill.method === method ? 'active' : ''} onClick={() => patch({ method })}>{METHOD_LABELS[method]}</button>)}</div>}
          <ul className={`sbx-rows sb-people-totals ${typed ? 'is-typed' : ''}`}>{bill.participants.map(person => {
            const share = result.people.find(row => row.id === person.id), open = openPerson === person.id, count = itemsOf(person.id);
            return <li key={person.id} className={`sbx-row ${open ? 'is-open' : ''}`}>
              {typed ? <div className="sb-person-line is-typed">
                <button type="button" className="sbx-row-main" aria-expanded={open} onClick={() => setOpenPerson(open ? '' : person.id)}>
                  <PersonAvatar person={person} size="sm"/>
                  <span className="sbx-row-name">{personName(person)}<small>{[payer?.id === person.id ? 'yang bayar' : '', `total ${rupiah(moneyOf(person.id))}`].filter(Boolean).join(' · ')}</small></span>
                </button>
                {bill.method === 'amount' ? <Money value={person.amount || 0} onChange={amount => patch({ participants: bill.participants.map(row => row.id === person.id ? { ...row, amount } : row) })}/>
                  : <span className="sb-percent"><Input inputMode="decimal" value={showPercent(person.percent)} onChange={e => patch({ participants: bill.participants.map(row => row.id === person.id ? { ...row, percent: readPercent(e.target.value) } : row) })} aria-label={`Persentase ${person.name}`} placeholder="0"/><span>%</span></span>}
              </div> : <div className="sb-person-line">
                <button type="button" className="sbx-row-main" aria-expanded={open} onClick={() => setOpenPerson(open ? '' : person.id)}>
                  <PersonAvatar person={person} size="sm"/>
                  <span className="sbx-row-name">{personName(person)}<small>{[bill.method === 'items' ? `${count} item` : '', payer?.id === person.id ? 'yang bayar' : ''].filter(Boolean).join(' · ')}</small></span>
                  <b>{rupiah(moneyOf(person.id))}</b>
                </button>
              </div>}
              {open && share && <div className="sb-person-lines">{share.lines.filter(line => line.amount).map(line => <div key={line.key}><span>{line.label}</span><span>{line.amount < 0 ? '−' : ''}{rupiah(Math.abs(line.amount))}</span></div>)}{!share.lines.length && <small className="muted">Belum ada bagian.</small>}
                {payer?.id === person.id ? <small className="muted sb-adjust-note">Selisih pembulatan teman ditanggung di sini.</small> : share.total > 0 && (() => {
                  const raw = share.total - Math.round(person.adjust || 0), up = (step: number) => Math.ceil(raw / step) * step, down = Math.floor(raw / 1000) * 1000;
                  const options = [...new Set([up(1000), up(5000), up(10000), down].filter(v => v > 0 && v !== raw))].sort((a, b) => a - b);
                  const setAdjust = (target: number) => patch({ participants: bill.participants.map(row => row.id === person.id ? { ...row, adjust: target && target !== raw ? target - raw : undefined } : row) });
                  const k = (v: number) => v % 1000 === 0 ? `${(v / 1000).toLocaleString('id-ID')}rb` : rupiah(v);
                  return <div className="sb-adjust">
                    <span className="sb-adjust-label">Bulatkan</span>
                    {options.map(v => <button type="button" key={v} className={`sb-adjust-chip ${share.total === v ? 'is-on' : ''}`} aria-label={`Bulatkan jadi ${rupiah(v)}`} onClick={() => setAdjust(v)}>{k(v)}</button>)}
                    <button type="button" className={`sb-adjust-chip is-icon ${exactFor === person.id ? 'is-on' : ''}`} aria-label="Isi angka sendiri" aria-expanded={exactFor === person.id} onClick={() => setExactFor(exactFor === person.id ? '' : person.id)}><Pencil size={13}/></button>
                    {person.adjust ? <button type="button" className="sb-adjust-chip is-icon is-reset" title="Kembalikan ke angka asli" aria-label={`Kembalikan ke ${rupiah(raw)}`} onClick={() => { setAdjust(raw); setExactFor(''); }}><RotateCcw size={13}/></button> : null}
                    {exactFor === person.id && <label className="sb-adjust-exact"><Money value={share.total} onChange={value => setAdjust(value)}/></label>}
                  </div>;
                })()}
              </div>}
            </li>; })}</ul>
          {typed && <div className={`sb-typed-sum ${typedLeft === 0 ? 'is-ok' : 'is-warn'}`}><span>{bill.method === 'amount' ? `Terisi ${rupiah(typedSum)} dari ${rupiah(typedNeed)}` : `Terisi ${showPercent(typedSum) || 0}% dari 100%`}</span><small>{typedLeft === 0 ? 'Pas' : typedLeft > 0 ? `Kurang ${bill.method === 'amount' ? rupiah(typedLeft) : `${showPercent(typedLeft)}%`}` : `Lebih ${bill.method === 'amount' ? rupiah(-typedLeft) : `${showPercent(-typedLeft)}%`}`}</small></div>}
          {bill.method === 'amount' && <button type="button" className="sb-link" onClick={() => { const parts = computeSplit({ ...bill, method: 'equal' }).people; patch({ participants: bill.participants.map(row => ({ ...row, amount: parts.find(p => p.id === row.id)?.base || 0 })) }); }}>Isi rata dulu</button>}
          {bill.method === 'percent' && <button type="button" className="sb-link" onClick={() => { const n = bill.participants.length, each = Math.floor(10000 / n); patch({ participants: bill.participants.map((row, i) => ({ ...row, percent: i === 0 ? 10000 - each * (n - 1) : each })) }); }}>Bagi rata persentasenya</button>}
        </section>

        {/* 6. Does it add up? */}
        <section className={`sb-recon ${matches ? 'is-ok' : 'is-warn'}`}>
          <div><span>{photoUrl || bill.items.length ? 'Total struk' : 'Total tagihan'}</span><span>{rupiah(receiptTotal)}</span></div>
          <div><span>Total pembagian</span><span>{rupiah(result.allocated)}</span></div>
          <p>{matches ? <><Check size={14}/> Cocok</> : <><AlertTriangle size={14}/> Selisih {rupiah(Math.abs(result.unassigned || result.mismatch))}</>}</p>
          {unassignedTotal > 0 && <small>Belum dibagi: {result.unassignedItems.slice(0, 3).map(row => row.name).join(', ')}{result.unassignedItems.length > 3 ? ` dan ${result.unassignedItems.length - 3} lagi` : ''}. Ketuk itemnya untuk memilih orangnya.</small>}
          {result.mismatch !== 0 && <><small>Item dan biaya berjumlah {rupiah(result.total)}, total tagihan {rupiah(bill.total)}. Mungkin ada item atau biaya yang belum masuk.</small>
            <div className="sb-recon-actions"><button type="button" className="sb-link" onClick={() => patch({ extras: [...bill.extras, { id: newId('x'), kind: 'rounding', label: 'Pembulatan', amount: result.mismatch, distribution: 'proportional' }] })}>Jadikan pembulatan</button>{!bill.fromTransaction && <button type="button" className="sb-link" onClick={() => patch({ total: result.total })}>Pakai total rincian</button>}</div></>}
          {!unassignedTotal && !result.mismatch && result.issues.filter(issue => issue.step !== 'bill').slice(0, 2).map(issue => <small key={issue.message}>{issue.message}</small>)}
        </section>

        {/* 7. Who paid, from where, and the category; folded once set. */}
        <section className="sb-sec">
          <button type="button" className="sb-bill-line" aria-expanded={billOpen} onClick={() => setBillOpen(v => !v)}>
            <span><strong>Pembayaran</strong><small>{[bill.payer === 'me' ? `Saya bayar dari ${walletName}` : `Dibayar ${payer ? personName(payer) : 'orang lain'}`, categoryName || 'Kategori belum dipilih', formatDate(bill.date, false)].join(' · ')}</small></span>
            <ChevronDown size={16}/>
          </button>
          {billOpen && <div className="sb-bill-fields">
            <div className="ip-seg" role="radiogroup" aria-label="Siapa yang bayar"><button type="button" role="radio" aria-checked={bill.payer === 'me'} disabled={hasPayments} className={bill.payer === 'me' ? 'active' : ''} onClick={() => patch({ payer: 'me', payerId: me?.id || '' })}>Saya yang bayar</button><button type="button" role="radio" aria-checked={bill.payer === 'other'} disabled={hasPayments || bill.fromTransaction} className={bill.payer === 'other' ? 'active' : ''} onClick={() => patch({ payer: 'other', payerId: others[0]?.id || '' })}>Orang lain</button></div>
            <small className="muted">{bill.payer === 'me' ? 'Teman membayar balik ke kamu (jadi piutang).' : 'Bagianmu jadi utang ke orang itu.'}</small>
            {bill.payer === 'me' && (bill.fromTransaction ? <p className="muted sb-note">Dibayar dari {walletName}. Transaksinya tetap satu, tidak dicatat dua kali.</p> : <Field label="Dibayar dari dompet"><Select value={bill.walletId} onChange={e => patch({ walletId: e.target.value })}><option value="">Pilih dompet</option>{payWallets.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select></Field>)}
            {bill.payer === 'other' && (others.length ? <div className="sb-chips">{others.map(person => personChip(person, bill.payerId === person.id, () => patch({ payerId: person.id })))}</div> : <p className="muted">Tambahkan dulu orang yang membayar.</p>)}
            <div className="sb-block"><small className="muted">Kategori (untuk bagianmu saja)</small>
              {categoryGuess && <button type="button" className="tx-suggest" onClick={() => patch({ categoryId: categoryGuess.categoryId, subcategoryId: categoryGuess.subcategoryId })}><Sparkles size={15} aria-hidden="true"/><span className="tx-suggest-text"><small>Kategori yang cocok</small><strong><AppIcon icon={categoryGuess.icon} fallback="🗂️"/> {categoryGuess.name}</strong></span><span className="tx-suggest-go">Pakai</span></button>}
              <CategoryPicker type="expense" categoryId={bill.categoryId || ''} subcategoryId={bill.subcategoryId || ''} onChange={value => patch({ categoryId: value.categoryId || null, subcategoryId: value.subcategoryId || null })}/>
            </div>
            <div className="form-grid"><Field label="Tanggal"><Input type="date" value={bill.date} disabled={bill.fromTransaction} onChange={e => patch({ date: e.target.value })}/></Field><Field label="Tempat"><Input value={bill.merchant} maxLength={80} onChange={e => patch({ merchant: e.target.value })} placeholder="Opsional"/></Field></div>
            {itemMode && !bill.fromTransaction && <Field label="Total di struk" hint="Untuk dicocokkan dengan pembagian."><Money value={bill.total} onChange={total => patch({ total })}/></Field>}
            <details className="sb-more"><summary>Jatuh tempo &amp; catatan</summary>
              <div className="form-grid"><Field label="Jatuh tempo"><Input type="date" value={bill.dueDate || ''} onChange={e => patch({ dueDate: e.target.value })}/></Field><Field label="Waktu"><Input type="time" value={bill.time || ''} disabled={bill.fromTransaction} onChange={e => patch({ time: e.target.value })}/></Field></div>
              <Field label="Catatan"><Input value={bill.notes} maxLength={300} onChange={e => patch({ notes: e.target.value })} placeholder="Opsional"/></Field>
            </details>
            <details className="sb-more"><summary>Apa yang dicatat?</summary><div className="sb-explain">
              {bill.payer === 'me' ? <>
                <p><b>{bill.fromTransaction ? `Transaksi ${rupiah(result.total)} dari ${walletName} tetap satu` : `Saldo ${walletName} berkurang ${rupiah(result.total)}`}</b>, sesuai uang yang benar-benar keluar.</p>
                <p>Pengeluaranmu hanya <b>{rupiah(me ? moneyOf(me.id) : 0)}</b> (bagianmu). <b>{rupiah(result.total - (me ? moneyOf(me.id) : 0))}</b> jadi piutang dari {others.filter(person => moneyOf(person.id) > 0).length} orang.</p>
              </> : <>
                <p><b>Saldo dompet belum berubah</b>, karena {payer ? personName(payer) : 'orang lain'} yang membayar.</p>
                {me && moneyOf(me.id) > 0 ? <p>Bagianmu <b>{rupiah(moneyOf(me.id))}</b> dicatat sebagai pengeluaran dan jadi utang ke {payer ? personName(payer) : 'yang membayar'}.</p> : <p>Kamu tidak punya bagian di tagihan ini.</p>}
              </>}
            </div></details>
          </div>}
        </section>

        {hasPayments && <div className="notice"><strong>Split Bill ini sudah memiliki pembayaran.</strong><p>Perubahan dapat mengubah sisa tagihan. Riwayat pembayaran tetap tersimpan.</p><label className="check-row"><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)}/> Saya mengerti</label></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sb-actions sb-one-actions">
          {!editing && <button type="button" className="sb-link" disabled={saving} onClick={() => void save(true)}>Simpan draft</button>}
          <Button type="button" disabled={saving} onClick={() => void save(false)}>{saving ? 'Menyimpan…' : <><Check size={16}/> Selesai membagi</>}</Button>
        </div>
      </div>
      <ReceiptScan open={scanOpen} onOpenChange={setScanOpen} context="split_bill" onUse={useReceipt}/>
      {peopleOpen && <PeopleManager people={people} groups={groups} onClose={() => setPeopleOpen(false)}/>}
    </DialogContent>
  </Dialog>;
}
