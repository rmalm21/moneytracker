'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, CirclePlus, ConciergeBell, HeartHandshake, Percent, Receipt, Scale, Tag, Truck, Users, ClipboardPaste, ImagePlus, Minus, Plus, ScanText, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money, Select } from './fields';
import { CategoryPicker } from './category-picker';
import { Emoji } from './emoji';
import { AppIcon } from './visual-identity';
import { PersonAvatar, personName, shrinkPhoto } from './split-bill-shared';
import { ocrAvailable, readReceiptPhoto, type OcrProgress } from '@/lib/receipt-ocr';
import { checkReceipt } from '@/lib/receipt';
import { billProgress, computeSplit, defaultDistribution, differenceText, EXTRA_LABELS, isDeduction, METHOD_LABELS, readReceiptText, type ReceiptRead } from '@/lib/split-bill';
import { attachSplitReceipt, saveSplitBill, saveSplitPerson, type SplitBillInput } from '@/lib/split-bill-store';
import { suggestCategory } from '@/lib/categorize';
import { rupiah } from '@/lib/accounting';
import { walletAllows } from '@/lib/wallet-capabilities';
import { formatDate, todayInTimeZone } from '@/lib/period';
import type { LedgerTx, SplitBill, SplitExtra, SplitExtraKind, SplitGroup, SplitItem, SplitMethod, SplitParticipant, SplitPerson } from '@/lib/types';

/**
 * Making or changing a Split Bill in six short steps: Tagihan → Orang → Item → Biaya tambahan → Pembagian → Review.
 * Nothing touches money until "Simpan Split Bill"; "Simpan draft" keeps the work without any money records.
 */
export type FlowStart = { mode: 'manual' | 'receipt' | 'transaction' | 'edit' | 'copy'; bill?: SplitBill; tx?: LedgerTx; /** From Scan struk: the checked reading and the photo. */ receipt?: ReceiptRead; photo?: Blob | null };
const STEPS = ['Tagihan', 'Orang', 'Item', 'Biaya tambahan', 'Pembagian', 'Review'] as const;
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
  const [bill, setBill] = useState<SplitBillInput>(() => startBill(start, { myName, today, walletId: defaultWallet }));
  const [step, setStep] = useState(0), [error, setError] = useState(''), [saving, setSaving] = useState(false), [understood, setUnderstood] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null), [photoUrl, setPhotoUrl] = useState(''), [reading, setReading] = useState<OcrProgress | null>(null), [readNote, setReadNote] = useState(''), [pasteOpen, setPasteOpen] = useState(false), [pasted, setPasted] = useState(''), [receipt, setReceipt] = useState<ReceiptRead | null>(start.receipt || null);
  const fullPhoto = useRef<Blob | null>(null);
  const [newName, setNewName] = useState(''), [remember, setRemember] = useState(true), [lastPicked, setLastPicked] = useState('');
  const [itemName, setItemName] = useState(''), [itemQty, setItemQty] = useState(1), [itemPrice, setItemPrice] = useState(0);
  const body = useRef<HTMLDivElement>(null), picker = useRef<HTMLDetailsElement>(null);
  const [openExtra, setOpenExtra] = useState('');
  const editing = start.mode === 'edit' && start.bill?.status === 'active';
  const original = start.bill;
  const progress = useMemo(() => editing && original ? billProgress(original, data.receivables, data.debts) : null, [editing, original, data.receivables, data.debts]);
  const paidPeople = new Set((progress?.people || []).filter(person => person.role !== 'payer' && person.paid > 0).map(person => person.id));
  const hasPayments = paidPeople.size > 0;
  const result = useMemo(() => computeSplit(bill), [bill]);
  const patch = (changes: Partial<SplitBillInput>) => { setBill(current => ({ ...current, ...changes })); setError(''); };
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => { body.current?.closest('.modal-body')?.scrollTo({ top: 0 }); }, [step]);

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

  /* ---------------- receipt */
  async function pickPhoto(file: Blob | undefined) {
    if (!file) return;
    setReadNote(''); setReceipt(null);
    try { const small = await shrinkPhoto(file); if (photoUrl) URL.revokeObjectURL(photoUrl); fullPhoto.current = file; setPhoto(small); setPhotoUrl(URL.createObjectURL(small)); if (ocrAvailable()) void readPhoto(file); }
    catch (e) { setReadNote((e as Error).message); }
  }
  useEffect(() => { if (start.photo) void (async () => { try { const small = await shrinkPhoto(start.photo!); fullPhoto.current = start.photo!; setPhoto(small); setPhotoUrl(URL.createObjectURL(small)); } catch { /* the reading is enough */ } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function readPhoto(source: Blob | null = fullPhoto.current || photo) {
    if (!source) return;
    setReading({ stage: 'prepare', progress: 0, label: 'Merapikan foto…' }); setReadNote('');
    try {
      const result = await readReceiptPhoto(source, setReading);
      if (result.read.items.length || result.read.total) setReceipt(result.read);
      else setReadNote('Tulisan di foto belum terbaca jelas. Coba foto lebih dekat dan terang, tempel teks struknya, atau isi item sendiri.');
    } catch (e) { setReadNote((e as Error).message || 'Foto belum bisa dibaca. Isi item sendiri, atau tempel teks struknya.'); }
    finally { setReading(null); }
  }
  function readPasted() {
    const read = readReceiptText(pasted);
    if (read.items.length || read.total) { setReceipt(read); setReadNote(''); }
    else setReadNote('Belum ada item atau total yang terbaca dari teks itu.');
  }
  function applyReceipt(read: ReceiptRead) {
    const extras: SplitExtra[] = [];
    const push = (kind: SplitExtraKind, amount: number, label: string) => { if (amount) extras.push({ id: newId('x'), kind, label, amount: kind === 'rounding' ? amount : Math.abs(amount), distribution: defaultDistribution(kind) }); };
    push('service', read.service, 'Service'); push('tax', read.tax, 'PB1'); push('discount', read.discount, 'Diskon'); push('delivery', read.delivery, 'Ongkos kirim'); push('rounding', read.rounding, 'Pembulatan');
    setBill(current => ({
      ...current,
      merchant: current.merchant || read.merchant,
      title: current.title || read.merchant,
      date: !current.fromTransaction && read.date ? read.date : current.date,
      total: current.fromTransaction ? current.total : read.total || current.total,
      items: read.items.map(line => ({ id: newId('i'), name: line.name, qty: line.qty, price: line.price, assign: 'shared' as const, people: [] })),
      extras: [...current.extras.filter(extra => !['service', 'tax', 'discount', 'delivery', 'rounding'].includes(extra.kind)), ...extras],
      method: read.items.length ? 'items' : current.method,
    }));
    setReceipt(null); setPasteOpen(false); setStep(1);
  }

  /* ---------------- moving between steps and saving */
  const stepIssues = (index: number) => result.issues.filter(issue => ({ 0: ['bill'], 1: ['people'], 2: ['items'], 3: ['extras'], 4: ['split'], 5: ['bill', 'people', 'items', 'extras', 'split'] } as Record<number, string[]>)[index].includes(issue.step));
  function blocker(index: number) {
    if (index === 0) {
      if (!bill.title.trim()) return 'Beri nama tagihan.';
      if (bill.payer === 'me' && !bill.fromTransaction && !bill.walletId) return 'Pilih dompet yang dipakai membayar.';
    }
    if (index === 1) {
      if (bill.participants.length < 2) return 'Tambahkan minimal 2 orang.';
      if (bill.payer === 'other' && !bill.participants.some(person => person.id === bill.payerId && !person.isMe)) return 'Pilih siapa yang membayar.';
    }
    return '';
  }
  function next() { const problem = blocker(step); if (problem) { setError(problem); return; } setError(''); setStep(s => Math.min(STEPS.length - 1, s + 1)); }
  async function save(draft: boolean) {
    if (!user) return;
    const input = { ...bill, title: bill.title.trim() || `Split Bill ${formatDate(bill.date, false)}` };
    if (!draft) {
      const problem = blocker(0) || blocker(1) || (result.ok ? '' : result.issues[0].message) || (!bill.categoryId && !bill.fromTransaction ? 'Pilih kategori tagihan.' : '');
      if (problem) { setError(problem); return; }
      if (hasPayments && !understood) { setError('Centang dulu bahwa kamu mengerti perubahannya.'); return; }
    }
    setSaving(true); setError('');
    try {
      const id = await saveSplitBill(user.uid, { ...input, total: bill.items.length && !bill.fromTransaction ? result.total : bill.total }, { draft });
      if (photo) { const uid = user.uid, previous = bill.receiptPath; track(attachSplitReceipt(uid, id, photo, previous), { pending: 'Mengunggah foto struk…', success: 'Foto struk tersimpan.', failure: 'Foto struk belum tersimpan. Split Bill-nya tetap aman.' }); }
      onSaved(id, draft ? 'Draft Split Bill disimpan.' : editing ? 'Split Bill diperbarui.' : 'Split Bill disimpan.');
    } catch (e) { setError((e as Error).message || 'Split Bill belum tersimpan.'); }
    finally { setSaving(false); }
  }

  /* ---------------- the steps */
  const moneyOf = (id: string) => result.people.find(person => person.id === id)?.total || 0;
  const personChip = (person: SplitParticipant, selected: boolean, onClick: () => void, extra?: ReactNode) => <button type="button" key={person.id} className={`sb-chip ${selected ? 'is-on' : ''}`} aria-pressed={selected} onClick={onClick}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span>{extra}</button>;
  const issuesBox = (index: number) => { const list = stepIssues(index); return list.length ? <div className="sb-issues" role="status">{list.map(issue => <p key={issue.message}>{issue.message}</p>)}</div> : null; };
  const walletName = data.wallets.find(w => w.id === bill.walletId)?.name || 'dompet';
  const photoBlock = <section className="sb-block"><h4>Foto struk <small className="muted">· opsional</small></h4>
        {photoUrl ? <div className="sb-photo"><img src={photoUrl} alt="Foto struk"/><div className="toolbar-row">{ocrAvailable() && <button type="button" className="link-button" disabled={Boolean(reading)} onClick={() => void readPhoto()}><ScanText size={15}/> {reading ? 'Membaca…' : 'Baca struk'}</button>}<button type="button" className="link-button" onClick={() => setPasteOpen(open => !open)}><ClipboardPaste size={15}/> Tempel teks struk</button><button type="button" className="link-button" onClick={() => { if (photoUrl) URL.revokeObjectURL(photoUrl); fullPhoto.current = null; setPhoto(null); setPhotoUrl(''); setReceipt(null); }}><Trash2 size={15}/> Hapus foto</button></div></div>
          : <div className="sb-photo-actions"><label className="link-button"><Camera size={15}/> Ambil foto<input type="file" accept="image/*" capture="environment" hidden onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }}/></label><label className="link-button"><ImagePlus size={15}/> Upload struk<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }}/></label><button type="button" className="link-button" onClick={() => setPasteOpen(open => !open)}><ClipboardPaste size={15}/> Tempel teks struk</button></div>}
        {bill.receiptPath && !photoUrl && <small className="muted">Foto struk sebelumnya tetap tersimpan. Unggah foto baru untuk menggantinya.</small>}
        {!ocrAvailable() && photoUrl && !receipt && <small className="muted">Perangkat ini belum bisa membaca foto. Pilih “Tempel teks struk”, atau isi item sendiri.</small>}
        {reading && <div className="rs-inline-progress" role="status" aria-live="polite"><strong>{reading.label}</strong><div className="rs-bar"><i style={{ width: `${Math.round(reading.progress * 100)}%` }}/></div><small className="muted">Dibaca di perangkat ini, foto tidak diunggah untuk dibaca.</small></div>}
        {pasteOpen && <div className="sb-paste"><textarea className="input" rows={6} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'Nasi Goreng 35.000\nEs Teh 2 x 6.000 12.000\nService 4.700\nPB1 5.170\nTotal 56.870'}/><Button type="button" className="small" disabled={!pasted.trim()} onClick={readPasted}>Baca teks</Button></div>}
        {readNote && <p className="sb-note is-warn" role="status">{readNote}</p>}
        {receipt && <div className="sb-receipt" role="region" aria-label="Hasil baca struk"><h5>HASIL BACA STRUK</h5><small className="muted">Periksa dulu. Semua bisa diubah di langkah Item dan Biaya tambahan.</small>
          {(() => { const check = checkReceipt(receipt); return <div className={`rs-check is-${check.confidence}`}><div><strong>{check.confidence === 'tinggi' ? 'Hasil baca meyakinkan' : check.confidence === 'sedang' ? 'Periksa lagi sebelum dipakai' : 'Hasil baca belum pasti'}</strong>{check.notes.map(note => <small key={note}>{note}</small>)}</div></div>; })()}
          {receipt.merchant && <div className="budget-line"><span>Tempat</span><strong>{receipt.merchant}</strong></div>}
          {receipt.items.map((line, i) => <div className="budget-line" key={i}><span>{line.name}{line.qty > 1 ? ` · ${line.qty} × ${rupiah(line.price)}` : ''}</span><strong>{rupiah(line.total)}</strong></div>)}
          {([['Service', receipt.service], ['Pajak / PB1', receipt.tax], ['Diskon', -receipt.discount], ['Ongkos kirim', receipt.delivery], ['Pembulatan', receipt.rounding]] as [string, number][]).filter(([, value]) => value).map(([label, value]) => <div className="budget-line" key={label}><span>{label}</span><strong>{value < 0 ? '−' : ''}{rupiah(Math.abs(value))}</strong></div>)}
          {receipt.total > 0 && <div className="budget-line sb-strong"><span>Total</span><strong>{rupiah(receipt.total)}</strong></div>}
          {receipt.skipped > 0 && <small className="muted">{receipt.skipped} baris tidak terbaca dan dilewati.</small>}
          <div className="toolbar-row"><button type="button" className="link-button" onClick={() => setReceipt(null)}>Abaikan</button><Button type="button" className="small" onClick={() => applyReceipt(receipt)}>Pakai hasil ini</Button></div>
        </div>}
      </section>;
  const views: ReactNode[] = [
    // 1. Tagihan
    <div className="sb-step" key="bill">
      {start.mode === 'receipt' && photoBlock}
      <Field label="Nama tagihan"><Input value={bill.title} maxLength={120} onChange={e => patch({ title: e.target.value })} placeholder="Misalnya Makan malam tim"/></Field>
      <div className="form-grid">
        <Field label="Total tagihan" hint={bill.fromTransaction ? 'Sesuai transaksinya.' : 'Boleh kosong bila dihitung dari item.'}>{bill.fromTransaction ? <div className="input sb-static">{rupiah(bill.total)}</div> : <Money value={bill.total} onChange={total => patch({ total })}/>}</Field>
        <Field label="Tanggal"><Input type="date" value={bill.date} disabled={bill.fromTransaction} onChange={e => patch({ date: e.target.value })}/></Field>
      </div>
      <Field label="Tempat (opsional)"><Input value={bill.merchant} maxLength={80} onChange={e => patch({ merchant: e.target.value })} placeholder="Misalnya GOR Sehat, Warung Bu Tin"/></Field>
      <section className="sb-block"><h4>Kategori</h4>
        {categoryGuess && <button type="button" className="tx-suggest" onClick={() => patch({ categoryId: categoryGuess.categoryId, subcategoryId: categoryGuess.subcategoryId })}><Sparkles size={15} aria-hidden="true"/><span className="tx-suggest-text"><small>Kategori yang cocok</small><strong><AppIcon icon={categoryGuess.icon} fallback="🗂️"/> {categoryGuess.name}</strong></span><span className="tx-suggest-go">Pakai</span></button>}
        <CategoryPicker type="expense" categoryId={bill.categoryId || ''} subcategoryId={bill.subcategoryId || ''} onChange={value => patch({ categoryId: value.categoryId || null, subcategoryId: value.subcategoryId || null })}/>
        <small className="muted">Dipakai untuk bagianmu saja. Bagian orang lain tidak dihitung ke pengeluaranmu.</small>
      </section>
      <section className="sb-block"><h4>Siapa yang bayar?</h4>
        <div className="choice-cards sb-payer" role="radiogroup" aria-label="Siapa yang bayar">
          <label className={`choice-card ${bill.payer === 'me' ? 'is-selected' : ''}`}><input type="radio" name="sb-payer" disabled={hasPayments} checked={bill.payer === 'me'} onChange={() => patch({ payer: 'me', payerId: me?.id || '' })}/><span><strong>Saya yang bayar</strong><small>Teman membayar balik ke kamu (jadi piutang).</small></span></label>
          <label className={`choice-card ${bill.payer === 'other' ? 'is-selected' : ''}`}><input type="radio" name="sb-payer" disabled={hasPayments || bill.fromTransaction} checked={bill.payer === 'other'} onChange={() => patch({ payer: 'other', payerId: others[0]?.id || '' })}/><span><strong>Orang lain yang bayar</strong><small>Bagianmu jadi utang ke orang itu.</small></span></label>
        </div>
        {bill.payer === 'me' && (bill.fromTransaction ? <p className="muted sb-note">Dibayar dari {walletName}. Transaksinya tetap satu, tidak dicatat dua kali.</p> : <Field label="Dibayar dari dompet"><Select value={bill.walletId} onChange={e => patch({ walletId: e.target.value })}><option value="">Pilih dompet</option>{payWallets.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select></Field>)}
        {bill.payer === 'other' && <p className="muted sb-note">Pilih orangnya di langkah berikutnya.</p>}
      </section>
      {start.mode !== 'receipt' && photoBlock}
      <details className="disclosure" open={Boolean(bill.dueDate || bill.notes) || undefined}><summary>Detail tambahan</summary>
        <div className="form-grid"><Field label="Jatuh tempo (opsional)"><Input type="date" value={bill.dueDate || ''} onChange={e => patch({ dueDate: e.target.value })}/></Field><Field label="Waktu (opsional)"><Input type="time" value={bill.time || ''} disabled={bill.fromTransaction} onChange={e => patch({ time: e.target.value })}/></Field></div>
        {bill.dueDate && <button type="button" className="link-button" onClick={() => patch({ dueDate: '' })}>Tanpa jatuh tempo</button>}
        <Field label="Catatan"><Input value={bill.notes} maxLength={300} onChange={e => patch({ notes: e.target.value })} placeholder="Opsional"/></Field>
      </details>
      {issuesBox(0)}
    </div>,

    // 2. Orang
    <div className="sb-step" key="people">
      <label className="check-row"><input type="checkbox" checked={Boolean(me)} onChange={e => toggleMe(e.target.checked)}/> Saya ikut patungan</label>
      <div className="sb-people">{bill.participants.map(person => <span className="sb-person" key={person.id}><PersonAvatar person={person}/><span>{personName(person)}{bill.payer === 'other' && person.id === bill.payerId ? <small>yang bayar</small> : bill.payer === 'me' && person.isMe ? <small>yang bayar</small> : null}</span>{!person.isMe && !paidPeople.has(person.id) && <button type="button" className="icon-btn" aria-label={`Hapus ${person.name}`} onClick={() => removePerson(person.id)}><X size={15}/></button>}</span>)}</div>
      <form className="sb-add" onSubmit={e => { e.preventDefault(); void addTyped(); }}>
        <Input value={newName} maxLength={60} onChange={e => setNewName(e.target.value)} placeholder="Nama orang" aria-label="Nama orang" autoComplete="off"/>
        <Button type="submit" className="small" disabled={!newName.trim()}><UserPlus size={15}/> Tambah</Button>
      </form>
      {newName.trim() && !people.some(person => person.name.trim().toLocaleLowerCase('id-ID') === newName.trim().toLocaleLowerCase('id-ID')) && <label className="check-row sb-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Simpan ke Orang tersimpan</label>}
      {suggestions.length > 0 && <section className="sb-block"><h4>Orang tersimpan</h4><div className="sb-chips">{suggestions.map(person => <button type="button" key={person.id} className="sb-chip" onClick={() => { addPerson(person.name, { personId: person.id, emoji: person.emoji || undefined }); setNewName(''); }}>{person.emoji ? <Emoji e={person.emoji}/> : <Plus size={14}/>}<span>{person.name}</span></button>)}</div></section>}
      {groups.length > 0 && <section className="sb-block"><h4>Grup</h4><div className="sb-chips">{groups.map(group => <button type="button" key={group.id} className={`sb-chip ${bill.groupId === group.id ? 'is-on' : ''}`} onClick={() => addGroup(group)}><Emoji e={group.emoji || '👥'}/><span>{group.name}</span><small>{group.memberIds.length}</small></button>)}</div></section>}
      {bill.payer === 'other' && <section className="sb-block"><h4>Siapa yang bayar?</h4>{others.length ? <div className="sb-chips">{others.map(person => personChip(person, bill.payerId === person.id, () => patch({ payerId: person.id })))}</div> : <p className="muted">Tambahkan dulu orang yang membayar.</p>}</section>}
      {issuesBox(1)}
    </div>,

    // 3. Item
    <div className="sb-step" key="items">
      <p className="muted sb-lead">Isi kalau tiap orang pesan berbeda. Lewati saja untuk bagi rata atau nominal manual.</p>
      {bill.items.map(item => {
        const line = Math.max(0, item.qty * item.price - (item.discount || 0));
        const byUnits = item.assign === 'units' && item.qty > 1;
        const unitsUsed = Object.values(item.units || {}).reduce((a, b) => a + b, 0);
        const open = result.unassignedItems.find(row => row.id === item.id);
        return <article className={`sb-item ${open ? 'is-open' : ''}`} key={item.id}>
          <div className="sb-item-head">
            <Input className="sb-item-name" value={item.name} maxLength={60} onChange={e => changeItem(item.id, { name: e.target.value })} aria-label="Nama item"/>
            <strong>{rupiah(line)}</strong>
            <button type="button" className="icon-btn" aria-label={`Hapus ${item.name}`} onClick={() => setItems(bill.items.filter(row => row.id !== item.id))}><Trash2 size={16}/></button>
          </div>
          <div className="sb-item-nums">
            <span className="sb-stepper" aria-label="Jumlah"><button type="button" aria-label="Kurangi" onClick={() => changeItem(item.id, { qty: Math.max(1, item.qty - 1) })}><Minus size={14}/></button><b>{item.qty}</b><button type="button" aria-label="Tambah" onClick={() => changeItem(item.id, { qty: Math.min(999, item.qty + 1) })}><Plus size={14}/></button></span>
            <span>×</span><Money value={item.price} onChange={price => changeItem(item.id, { price })}/>
          </div>
          <div className="sb-item-who"><small>Siapa yang pesan?</small>
            {byUnits ? <div className="sb-units">{bill.participants.map(person => { const count = item.units?.[person.id] || 0; return <span className="sb-unit" key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span><span className="sb-stepper"><button type="button" aria-label="Kurangi" onClick={() => changeItem(item.id, { units: { ...item.units, [person.id]: Math.max(0, count - 1) } })}><Minus size={14}/></button><b>{count}</b><button type="button" aria-label="Tambah" disabled={unitsUsed >= item.qty} onClick={() => { changeItem(item.id, { units: { ...item.units, [person.id]: count + 1 } }); setLastPicked(person.id); }}><Plus size={14}/></button></span></span>; })}<small className={unitsUsed === item.qty ? 'muted' : 'sb-warn'}>{unitsUsed} dari {item.qty} porsi dipilih</small></div>
              : item.assign === 'custom' ? <div className="sb-units">{bill.participants.map(person => <span className="sb-unit" key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span><Money value={item.custom?.[person.id] || 0} onChange={value => changeItem(item.id, { custom: { ...item.custom, [person.id]: value } })}/></span>)}</div>
              : <div className="sb-chips">{bill.participants.map(person => personChip(person, item.people.includes(person.id), () => toggleTaker(item, person.id)))}</div>}
            {item.assign === 'shared' && <div className="toolbar-row sb-quick"><button type="button" className="link-button" onClick={() => changeItem(item.id, { people: bill.participants.map(person => person.id) })}>Semua</button><button type="button" className="link-button" onClick={() => { const left = bill.participants.filter(person => !assignedIds.has(person.id)).map(person => person.id); if (left.length) changeItem(item.id, { people: [...new Set([...item.people, ...left])] }); }}>Belum dipilih</button>{lastPicked && bill.participants.some(person => person.id === lastPicked) && <button type="button" className="link-button" onClick={() => changeItem(item.id, { people: [...new Set([...item.people, lastPicked])] })}>Orang terakhir · {personName(bill.participants.find(person => person.id === lastPicked))}</button>}</div>}
          </div>
          <details className="sb-more"><summary>Detail tambahan</summary>
            <div className="ip-seg sb-seg" role="radiogroup" aria-label="Cara bagi item">{([['shared', 'Dibagi rata'], ['units', 'Per porsi'], ['custom', 'Nominal']] as [SplitItem['assign'], string][]).map(([key, label]) => <button type="button" key={key} disabled={key === 'units' && item.qty < 2} className={item.assign === key ? 'active' : ''} onClick={() => changeItem(item.id, { assign: key })}>{label}</button>)}</div>
            <Field label="Diskon khusus item ini"><Money value={item.discount || 0} onChange={discount => changeItem(item.id, { discount })}/></Field>
            <div className="sb-cat"><small className="muted">Kategori item (opsional, untuk bagianmu)</small><CategoryPicker type="expense" categoryId={item.categoryId || ''} subcategoryId={item.subcategoryId || ''} onChange={value => changeItem(item.id, { categoryId: value.categoryId || null, subcategoryId: value.subcategoryId || null })}/></div>
          </details>
          {open && <small className="sb-warn">Belum dibagi {rupiah(open.amount)}</small>}
        </article>;
      })}
      <form className="sb-item-add" onSubmit={e => { e.preventDefault(); addItem(); }}>
        <Field label="Nama item"><Input value={itemName} maxLength={60} onChange={e => setItemName(e.target.value)} placeholder="Misalnya Mie Goreng"/></Field>
        <div className="sb-item-nums"><span className="sb-stepper" aria-label="Jumlah"><button type="button" aria-label="Kurangi" onClick={() => setItemQty(q => Math.max(1, q - 1))}><Minus size={14}/></button><b>{itemQty}</b><button type="button" aria-label="Tambah" onClick={() => setItemQty(q => Math.min(999, q + 1))}><Plus size={14}/></button></span><span>×</span><Money value={itemPrice} onChange={setItemPrice} placeholder="Harga satuan"/></div>
        <Button type="submit" variant="secondary" className="small"><Plus size={15}/> Tambah item</Button>
      </form>
      {bill.items.length > 0 && <div className="sb-sum"><div className="budget-line"><span>Subtotal item</span><strong>{rupiah(result.subtotal)}</strong></div>{result.unassignedItems.length > 0 && <div className="budget-line sb-warn"><span>Belum dibagi</span><strong>{rupiah(result.unassignedItems.reduce((sum, row) => sum + row.amount, 0))}</strong></div>}</div>}
      {issuesBox(2)}
    </div>,

    // 4. Biaya tambahan
    <div className="sb-step" key="extras">
      <p className="muted sb-lead">Pajak, service, diskon, ongkir, atau biaya bersama seperti sewa lapangan dan parkir.</p>
      <details className="sb-extra-picker" ref={picker}>
        <summary><span className="sb-extra-picker-icon"><Plus size={17}/></span><span><strong>Tambah biaya tambahan</strong><small>Pajak, service, diskon, ongkir, biaya bersama…</small></span><ChevronDown size={18} className="sb-extra-picker-chev" aria-hidden="true"/></summary>
        <div className="sb-extra-menu" role="menu">{EXTRA_KINDS.map(kind => { const [Icon, hint] = EXTRA_LOOKS[kind]; const count = bill.extras.filter(extra => extra.kind === kind).length; return <button type="button" role="menuitem" key={kind} className={`is-${kind}`} onClick={() => { addExtra(kind); if (picker.current) picker.current.open = false; }}><span className="sb-extra-menu-icon"><Icon size={17}/></span><span><strong>{EXTRA_LABELS[kind]}</strong><small>{hint}</small></span>{count > 0 && <em>{count}</em>}</button>; })}</div>
      </details>
      {bill.extras.map(extra => {
        const resolved = result.extras.find(row => row.id === extra.id);
        const chosen = extra.people || [];
        const [Icon] = EXTRA_LOOKS[extra.kind];
        const how = extra.distribution === 'custom' ? 'custom' : extra.distribution === 'equal' ? 'rata' : 'proporsional';
        return <details className={`sb-extra is-${extra.kind}`} key={extra.id} open={openExtra === extra.id} onToggle={event => { const open = event.currentTarget.open; setOpenExtra(current => open ? extra.id : current === extra.id ? '' : current); }}>
          <summary><span className="sb-extra-menu-icon"><Icon size={16}/></span><span className="sb-extra-title"><strong>{extra.label.trim() || EXTRA_LABELS[extra.kind]}</strong><small>Dibagi {how}{chosen.length ? ` · ${chosen.length} orang` : ' · semua orang'}</small></span><strong className={isDeduction(extra.kind) || (resolved?.amount || 0) < 0 ? 'amount-positive' : ''}>{resolved ? `${resolved.amount < 0 ? '−' : ''}${rupiah(Math.abs(resolved.amount))}` : rupiah(0)}</strong><ChevronDown size={16} className="sb-extra-chev" aria-hidden="true"/></summary>
          <div className="sb-extra-body">
          <div className="sb-item-head"><Input className="sb-item-name" value={extra.label} maxLength={40} placeholder={extra.kind === 'shared' ? 'Misalnya Sewa lapangan' : EXTRA_LABELS[extra.kind]} onChange={e => changeExtra(extra.id, { label: e.target.value })} aria-label="Nama biaya"/><button type="button" className="icon-btn" aria-label="Hapus biaya" onClick={() => patch({ extras: bill.extras.filter(row => row.id !== extra.id) })}><Trash2 size={16}/></button></div>
          <div className="sb-extra-amount">
            {extra.percent && bill.items.length ? <span className="sb-static input">{showPercent(extra.percent * 100)}% dari {extra.kind === 'tax' ? 'item + service' : 'item'}</span> : <Money value={Math.abs(extra.amount)} onChange={value => changeExtra(extra.id, { amount: extra.kind === 'rounding' && extra.amount < 0 ? -value : value, percent: undefined })}/>}
            {extra.kind === 'rounding' && <div className="ip-seg sb-seg"><button type="button" className={extra.amount >= 0 ? 'active' : ''} onClick={() => changeExtra(extra.id, { amount: Math.abs(extra.amount) })}>Tambah</button><button type="button" className={extra.amount < 0 ? 'active' : ''} onClick={() => changeExtra(extra.id, { amount: -Math.abs(extra.amount) })}>Kurang</button></div>}
            {bill.items.length > 0 && ['tax', 'service', 'tip', 'discount'].includes(extra.kind) && <div className="toolbar-row">{(extra.kind === 'tax' ? [10, 11] : extra.kind === 'service' ? [5, 10] : [5, 10, 15]).map(pct => <button type="button" key={pct} className={`link-button ${extra.percent === pct ? 'is-active' : ''}`} onClick={() => changeExtra(extra.id, { percent: extra.percent === pct ? undefined : pct })}>{pct}%</button>)}</div>}
          </div>
          <div className="sb-extra-how"><small>Dibagi</small><div className="ip-seg sb-seg">{([['proportional', 'Proporsional'], ['equal', 'Rata'], ['custom', 'Custom']] as [SplitExtra['distribution'], string][]).map(([key, label]) => <button type="button" key={key} className={extra.distribution === key ? 'active' : ''} onClick={() => changeExtra(extra.id, { distribution: key })}>{label}</button>)}</div></div>
          {extra.distribution === 'custom' ? <div className="sb-units">{(chosen.length ? bill.participants.filter(person => chosen.includes(person.id)) : bill.participants).map(person => <span className="sb-unit" key={person.id}><PersonAvatar person={person} size="sm"/><span>{personName(person)}</span><Money value={extra.custom?.[person.id] || 0} onChange={value => changeExtra(extra.id, { custom: { ...extra.custom, [person.id]: value } })}/></span>)}</div>
            : <div className="sb-extra-who"><small>Untuk</small><div className="sb-chips"><button type="button" className={`sb-chip ${!chosen.length ? 'is-on' : ''}`} onClick={() => changeExtra(extra.id, { people: [] })}><span>Semua orang</span></button>{bill.participants.map(person => personChip(person, chosen.includes(person.id), () => changeExtra(extra.id, { people: chosen.includes(person.id) ? chosen.filter(id => id !== person.id) : [...chosen, person.id] })))}</div></div>}
          {(extra.kind === 'shared' || extra.kind === 'other') && <details className="sb-more"><summary>Detail tambahan</summary><div className="sb-cat"><small className="muted">Kategori biaya ini (opsional, untuk bagianmu)</small><CategoryPicker type="expense" categoryId={extra.categoryId || ''} subcategoryId={extra.subcategoryId || ''} onChange={value => changeExtra(extra.id, { categoryId: value.categoryId || null, subcategoryId: value.subcategoryId || null })}/></div></details>}
          </div>
        </details>;
      })}
      <div className="sb-sum">
        <div className="budget-line"><span>{bill.items.length ? 'Subtotal item' : 'Tagihan sebelum biaya tambahan'}</span><strong>{rupiah(result.subtotal)}</strong></div>
        {result.extras.map(extra => <div className="budget-line" key={extra.id}><span>{extra.label}</span><strong>{extra.amount < 0 ? '−' : ''}{rupiah(Math.abs(extra.amount))}</strong></div>)}
        <div className="budget-line sb-strong"><span>Total</span><strong>{rupiah(result.total)}</strong></div>
      </div>
      {result.mismatch !== 0 && <div className="sb-issues" role="status"><p>Rincian {rupiah(result.total)} belum sama dengan total tagihan {rupiah(bill.total)} (selisih {rupiah(Math.abs(result.mismatch))}).</p><div className="toolbar-row"><button type="button" className="link-button" onClick={() => patch({ extras: [...bill.extras, { id: newId('x'), kind: 'rounding', label: 'Pembulatan', amount: result.mismatch, distribution: 'proportional' }] })}>Jadikan pembulatan</button>{!bill.fromTransaction && <button type="button" className="link-button" onClick={() => patch({ total: result.total })}>Pakai total rincian</button>}</div></div>}
      {issuesBox(3)}
    </div>,

    // 5. Pembagian
    <div className="sb-step" key="split">
      <div className="sb-methods" role="radiogroup" aria-label="Cara bagi">{(['equal', 'items', 'amount', 'percent'] as SplitMethod[]).map(method => <button type="button" key={method} role="radio" aria-checked={bill.method === method} disabled={method === 'items' && !bill.items.length} className={bill.method === method ? 'active' : ''} onClick={() => patch({ method })}>{METHOD_LABELS[method]}</button>)}</div>
      {bill.method === 'items' && <p className="muted sb-lead">Tiap orang membayar item yang dipesannya{bill.extras.length ? ', ditambah biaya tambahan sesuai cara baginya' : ''}.</p>}
      {bill.method === 'equal' && <p className="muted sb-lead">{rupiah(result.subtotal)} dibagi {bill.participants.length} orang{bill.extras.length ? ', lalu biaya tambahan sesuai cara baginya' : ''}.</p>}
      {(bill.method === 'amount' || bill.method === 'percent') && <p className="muted sb-lead">{bill.method === 'amount' ? 'Isi bagian tiap orang' : 'Isi persentase tiap orang (total 100%)'}{bill.extras.length ? ' sebelum biaya tambahan' : ''}.</p>}
      <div className="sb-result">{bill.participants.map(person => <div className="sb-result-row" key={person.id}>
        <PersonAvatar person={person}/><span className="sb-result-name">{personName(person)}{payer?.id === person.id && <small>yang bayar</small>}</span>
        {bill.method === 'amount' && <Money value={person.amount || 0} onChange={amount => patch({ participants: bill.participants.map(row => row.id === person.id ? { ...row, amount } : row) })}/>}
        {bill.method === 'percent' && <span className="sb-percent"><Input inputMode="decimal" value={showPercent(person.percent)} onChange={e => patch({ participants: bill.participants.map(row => row.id === person.id ? { ...row, percent: readPercent(e.target.value) } : row) })} aria-label={`Persentase ${person.name}`} placeholder="0"/><span>%</span></span>}
        <strong>{rupiah(moneyOf(person.id))}</strong>
      </div>)}</div>
      {bill.method === 'amount' && <div className="toolbar-row"><button type="button" className="link-button" onClick={() => { const parts = computeSplit({ ...bill, method: 'equal' }).people; patch({ participants: bill.participants.map(row => ({ ...row, amount: parts.find(p => p.id === row.id)?.base || 0 })) }); }}>Isi rata dulu</button></div>}
      {bill.method === 'percent' && <div className="toolbar-row"><button type="button" className="link-button" onClick={() => { const n = bill.participants.length, each = Math.floor(10000 / n); patch({ participants: bill.participants.map((row, i) => ({ ...row, percent: i === 0 ? 10000 - each * (n - 1) : each })) }); }}>Bagi rata persentasenya</button></div>}
      <div className={`sb-balance ${result.unassigned ? 'is-off' : ''}`}><span>Terbagi {rupiah(result.allocated)} dari {rupiah(result.total)}</span><strong>{result.unassigned ? differenceText(result.unassigned) : 'Pas'}</strong></div>
      {issuesBox(4)}
    </div>,

    // 6. Review
    <div className="sb-step" key="review">
      <div className="sb-sum sb-review-top">
        <div className="budget-line"><span>Total tagihan</span><strong>{rupiah(result.total)}</strong></div>
        <div className="budget-line"><span>Terbagi</span><strong>{rupiah(result.allocated)}</strong></div>
        <div className={`budget-line ${result.unassigned ? 'sb-warn' : ''}`}><span>Selisih</span><strong>{rupiah(result.unassigned)}</strong></div>
      </div>
      <div className="sb-result">{result.people.map(person => { const participant = bill.participants.find(row => row.id === person.id)!; return <div className="sb-result-row" key={person.id}><PersonAvatar person={participant}/><span className="sb-result-name">{personName(participant)}{payer?.id === person.id && <small>yang bayar</small>}</span><strong>{rupiah(person.total)}</strong></div>; })}</div>
      <div className="sb-explain">
        {bill.payer === 'me' ? <>
          <p><b>{bill.fromTransaction ? `Transaksi ${rupiah(result.total)} dari ${walletName} tetap satu` : `Saldo ${walletName} berkurang ${rupiah(result.total)}`}</b>, sesuai uang yang benar-benar keluar.</p>
          <p>Pengeluaranmu hanya <b>{rupiah(me ? moneyOf(me.id) : 0)}</b> (bagianmu). Anggaran, analisis, dan insight memakai angka ini.</p>
          <p><b>{rupiah(result.total - (me ? moneyOf(me.id) : 0))}</b> jadi piutang dari {others.filter(person => moneyOf(person.id) > 0).length} orang. Saat mereka membayar, saldo bertambah tanpa dihitung sebagai pemasukan.</p>
        </> : <>
          <p><b>Saldo dompet belum berubah</b>, karena {payer ? personName(payer) : 'orang lain'} yang membayar.</p>
          {me && moneyOf(me.id) > 0 ? <p>Bagianmu <b>{rupiah(moneyOf(me.id))}</b> dicatat sebagai pengeluaran hari itu, dan jadi utang ke {payer ? personName(payer) : 'yang membayar'}. Saat kamu melunasinya, tidak dihitung sebagai pengeluaran lagi.</p> : <p>Kamu tidak punya bagian di tagihan ini, jadi tidak ada pengeluaran atau utang.</p>}
          <p>Pembayaran teman lain ke {payer ? personName(payer) : 'yang membayar'} cukup ditandai di Split Bill ini.</p>
        </>}
      </div>
      {!bill.categoryId && !bill.fromTransaction && <div className="sb-issues"><p>Pilih kategori tagihan di langkah Tagihan.</p></div>}
      {hasPayments && <div className="notice"><strong>Split Bill ini sudah memiliki pembayaran.</strong><p>Perubahan dapat mengubah sisa tagihan. Riwayat pembayaran tetap tersimpan dan tidak diubah.</p><label className="check-row"><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)}/> Saya mengerti</label></div>}
      {issuesBox(5)}
    </div>,
  ];

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent title={editing ? 'Ubah Split Bill' : start.mode === 'transaction' ? 'Split Bill dari transaksi' : 'Buat Split Bill'} className="sb-flow-dialog">
      <div className="sb-flow" ref={body}>
        <div className="sb-progress">
          <div className="sb-progress-top"><span>{step + 1} dari {STEPS.length} · <b>{STEPS[step]}</b></span>{!editing && <button type="button" className="link-button" disabled={saving} onClick={() => void save(true)}>Simpan draft</button>}</div>
          <div className="sb-progress-bar" aria-hidden="true">{STEPS.map((label, index) => <button type="button" key={label} tabIndex={-1} className={index < step ? 'is-done' : index === step ? 'is-now' : ''} onClick={() => { if (index < step) setStep(index); }}/>)}</div>
        </div>
        {views[step]}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sb-actions">
          <Button type="button" variant="secondary" onClick={() => step ? setStep(step - 1) : onClose()}>{step ? <><ArrowLeft size={16}/> Kembali</> : 'Batal'}</Button>
          {step < STEPS.length - 1 ? <Button type="button" onClick={next}>{step === 2 && !bill.items.length ? 'Lewati' : 'Lanjut'} <ArrowRight size={16}/></Button>
            : <Button type="button" disabled={saving || !result.ok} onClick={() => void save(false)}>{saving ? 'Menyimpan…' : <><Check size={16}/> Simpan Split Bill</>}</Button>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
