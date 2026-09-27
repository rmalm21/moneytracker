'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ClipboardPaste, FileText, ImagePlus, Plus, ReceiptText, RotateCw, ScanText, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { CategoryPicker } from './category-picker';
import { Field, Input, Money, Select, categoryOptions } from './fields';
import { allocate, rupiah } from '@/lib/accounting';
import { newTx, upsertTransaction, validateTx } from '@/lib/firestore';
import { todayInTimeZone } from '@/lib/period';
import { PAYMENT_LABELS, checkReceipt, readReceiptText, receiptToTransaction, type ReceiptCheck, type ReceiptRead } from '@/lib/receipt';
import { ocrAvailable, readReceiptPhoto, type OcrProgress } from '@/lib/receipt-ocr';
import { walletAllows } from '@/lib/wallet-capabilities';
import type { LedgerTx, SplitLine } from '@/lib/types';

/**
 * Scan struk: a receipt photo (or its text) becomes a transaction, but only after the user has checked it.
 * The photo is read on this device; nothing is saved until "Simpan transaksi".
 */

type Background = (run: () => Promise<unknown>, info: { message: string; detail?: string; retry: { preset?: Partial<LedgerTx> } }) => void;
type Item = { key: string; name: string; qty: number; price: number; categoryId: string; subcategoryId: string };
type Draft = { type: 'expense' | 'income'; amount: number; date: string; time: string; merchant: string; description: string; walletId: string; categoryId: string; subcategoryId: string; notes: string; items: Item[]; bySplit: boolean };

/** A receipt handed to Split Bill (same page, so the photo can go along without being stored anywhere). */
let handoff: { read: ReceiptRead; photo: Blob | null } | null = null;
export function takeReceiptHandoff() { const value = handoff; if (value) setTimeout(() => { if (handoff === value) handoff = null; }, 2000); return value; }

const key = () => Math.random().toString(36).slice(2, 9);
const CONFIDENCE: Record<ReceiptCheck['confidence'], string> = { tinggi: 'Hasil baca meyakinkan', sedang: 'Periksa lagi sebelum menyimpan', rendah: 'Hasil baca belum pasti' };

export function ReceiptScan({ open, onOpenChange, startType = 'expense', background, openTx, navigate }: { open: boolean; onOpenChange: (open: boolean) => void; startType?: 'expense' | 'income'; background: Background; openTx: (preset?: Partial<LedgerTx>) => void; navigate: (key: string, target?: string) => void }) {
  const { data, user, profile } = useApp();
  const today = todayInTimeZone(profile?.timeZone);
  const [photo, setPhoto] = useState<Blob | null>(null), [photoUrl, setPhotoUrl] = useState(''), [turn, setTurn] = useState(0);
  const [progress, setProgress] = useState<OcrProgress | null>(null), [problem, setProblem] = useState(''), [pasteOpen, setPasteOpen] = useState(false), [pasted, setPasted] = useState('');
  const [read, setRead] = useState<ReceiptRead | null>(null), [rawText, setRawText] = useState(''), [ocrMeta, setOcrMeta] = useState(''), [draft, setDraft] = useState<Draft | null>(null), [why, setWhy] = useState<{ category?: string; wallet?: string }>({}), [error, setError] = useState(''), [lowOk, setLowOk] = useState(false);
  const job = useRef(0);
  const payWallets = data.wallets.filter(w => walletAllows(w, 'pay'));
  const inWallets = data.wallets.filter(w => !w.isArchived);

  function reset() { job.current++; if (photoUrl) URL.revokeObjectURL(photoUrl); setPhoto(null); setPhotoUrl(''); setTurn(0); setProgress(null); setProblem(''); setPasteOpen(false); setPasted(''); setRead(null); setRawText(''); setOcrMeta(''); setDraft(null); setWhy({}); setError(''); }
  useEffect(() => { if (!open) reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  function build(next: ReceiptRead, type: 'expense' | 'income' = draft?.type || startType) {
    const guess = receiptToTransaction(next, { categories: data.categories, history: data.transactions, wallets: type === 'expense' ? payWallets : inWallets, today, defaultWalletId: type === 'expense' ? profile?.defaultExpenseWalletId : profile?.defaultIncomeWalletId }, type);
    setRead(next);
    setWhy({ category: guess.why, wallet: guess.walletWhy });
    setDraft({ type, amount: guess.amount, date: guess.date, time: guess.time, merchant: guess.merchant, description: guess.description, walletId: guess.walletId, categoryId: guess.categoryId || (type === 'income' ? profile?.salaryIncomeCategoryId || '' : ''), subcategoryId: guess.subcategoryId || '', notes: '', items: guess.items.map(item => ({ key: key(), name: item.name, qty: item.qty, price: item.price, categoryId: item.categoryId || '', subcategoryId: item.subcategoryId || '' })), bySplit: guess.splits.length > 1 });
    setError(''); setLowOk(false);
  }
  async function scan(source: Blob, quarter = 0) {
    const id = ++job.current;
    setProblem(''); setDraft(null); setRead(null); setProgress({ stage: 'prepare', progress: 0, label: 'Merapikan foto…' });
    try {
      const result = await readReceiptPhoto(source, value => { if (job.current === id) setProgress(value); }, quarter);
      if (job.current !== id) return;
      setRawText(result.text.trim());
      setOcrMeta(`Dibaca ${result.passes}× dalam ${(result.ms / 1000).toFixed(1)} detik · ketajaman ${Math.round(result.confidence)}%`);
      if (!result.read.items.length && !result.check.total) setProblem('Tulisan di foto belum terbaca jelas. Coba foto lebih dekat dan terang, putar fotonya, atau isi sendiri di bawah.');
      build(result.read);
    } catch (e) { if (job.current === id) setProblem((e as Error).message || 'Foto belum bisa dibaca.'); }
    finally { if (job.current === id) setProgress(null); }
  }
  function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProblem('Pilih file gambar (JPG, PNG, atau WebP).'); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(file); setPhotoUrl(URL.createObjectURL(file)); setTurn(0);
    void scan(file);
  }
  function rotate() { if (!photo) return; const next = (turn + 1) % 4; setTurn(next); void scan(photo, next); }
  function readText(text: string) { const next = readReceiptText(text); setRawText(text.trim()); if (!next.items.length && !next.total) { setProblem('Belum ada item atau total yang terbaca dari teks itu.'); } else setProblem(''); build(next); setPasteOpen(false); }
  function manual() { build(readReceiptText('')); setProblem(''); }

  const patch = (changes: Partial<Draft>) => { setDraft(current => current && { ...current, ...changes }); setError(''); };
  const patchItem = (id: string, changes: Partial<Item>) => setDraft(current => current && { ...current, items: current.items.map(item => item.key === id ? { ...item, ...changes } : item) });
  const itemsTotal = draft?.items.reduce((sum, item) => sum + item.qty * item.price, 0) || 0;
  const check = useMemo(() => read ? checkReceipt(read) : null, [read]);
  /** Split by category: item groups scaled to the amount (tax, service and discounts spread by size). */
  const splits = useMemo<SplitLine[]>(() => {
    if (!draft || draft.type !== 'expense' || !draft.bySplit || !draft.amount || !itemsTotal) return [];
    const groups = new Map<string, SplitLine>();
    for (const item of draft.items) { if (!item.categoryId || !(item.qty * item.price)) continue; const id = `${item.categoryId}:${item.subcategoryId}`; const line = groups.get(id) || { categoryId: item.categoryId, subcategoryId: item.subcategoryId || null, amount: 0 }; line.amount += item.qty * item.price; groups.set(id, line); }
    const lines = [...groups.values()];
    if (lines.length < 2) return [];
    const parts = allocate(draft.amount, lines.map(line => line.amount));
    return lines.map((line, i) => ({ ...line, amount: parts[i] })).filter(line => line.amount > 0);
  }, [draft, itemsTotal]);
  const categoriesUsed = new Set(draft?.items.filter(item => item.categoryId).map(item => `${item.categoryId}:${item.subcategoryId}`)).size;
  const catName = (id: string | null | undefined) => data.categories.find(c => c.id === id)?.name || '';
  const alternatives = useMemo(() => {
    if (!read || !check || !draft) return [] as [string, number][];
    const byPaid = read.paid && read.change && read.paid > read.change ? read.paid - read.change : 0;
    const list: [string, number][] = [['tertulis', read.total], ['bayar − kembalian', byPaid], ['item + biaya', check.computed], ['jumlah item', itemsTotal]];
    const seen = new Set<number>([draft.amount]);
    return list.filter(([, value]) => { if (!value || seen.has(value)) return false; seen.add(value); return true; });
  }, [read, check, draft, itemsTotal]);

  function toTx() {
    if (!draft) return null;
    const useSplit = draft.type === 'expense' && splits.length > 1;
    const itemNote = draft.items.length > 2 ? draft.items.map(item => `${item.name}${item.qty > 1 ? ` ${item.qty}×` : ''} ${rupiah(item.qty * item.price)}`).join(', ') : '';
    const notes = [draft.notes.trim(), itemNote && `Isi struk: ${itemNote}`].filter(Boolean).join('\n').slice(0, 1000);
    return newTx({ type: draft.type, amount: draft.amount, date: draft.date, time: draft.time, walletId: draft.walletId, categoryId: useSplit ? null : draft.categoryId || null, subcategoryId: useSplit ? null : draft.subcategoryId || null, merchant: draft.merchant.trim(), description: draft.description.trim(), notes, tags: ['struk'], splits: useSplit ? splits : [] });
  }
  function save() {
    if (!user || !draft) return;
    const tx = toTx(); if (!tx) return;
    if (tx.date > today) { setError('Tanggal struk ada di masa depan. Periksa tanggalnya.'); return; }
    try { validateTx(tx); } catch (e) { setError((e as Error).message); return; }
    if (check?.confidence === 'rendah' && (read?.items.length || read?.total) && !lowOk) { setLowOk(true); setError(`Nominal ${rupiah(tx.amount)} belum pasti terbaca. Cocokkan dengan struk, lalu tekan Simpan sekali lagi.`); return; }
    const uid = user.uid, label = draft.type === 'expense' ? 'Pengeluaran' : 'Pemasukan';
    onOpenChange(false);
    background(() => upsertTransaction(uid, tx), { message: `${label} ${rupiah(tx.amount)} dari struk tersimpan.`, detail: tx.splits?.length ? `Dipisah ke ${tx.splits.length} kategori` : [tx.merchant, catName(tx.subcategoryId || tx.categoryId)].filter(Boolean).join(' · '), retry: { preset: tx } });
  }
  function toForm() { const tx = toTx(); if (!tx) return; const { id: _id, ...preset } = tx; onOpenChange(false); openTx(preset); }
  function toSplitBill() {
    if (!read || !draft) return;
    handoff = { read: { ...read, merchant: draft.merchant || read.merchant, date: draft.date, total: draft.amount, items: draft.items.filter(item => item.name.trim() && item.price > 0).map(item => ({ name: item.name.trim(), qty: item.qty, price: item.price, total: item.qty * item.price })) }, photo };
    onOpenChange(false); navigate('splitbill', 'receipt-draft');
  }

  const busy = Boolean(progress);
  const wallets = draft?.type === 'income' ? inWallets : payWallets;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Scan struk" className="receipt-scan-dialog">
    {!draft && !busy && <div className="rs-start">
      <div className="rs-hero"><span className="rs-hero-icon" aria-hidden="true"><ScanText size={26}/></span><div><strong>Foto struk atau nota</strong><small>Nominal, tanggal, tempat, item, pajak, dan cara bayar dibaca otomatis. Kamu periksa dulu sebelum disimpan.</small></div></div>
      <div className="rs-pick">
        <label className="rs-pick-button is-main"><Camera size={22}/><span>Ambil foto</span><input type="file" accept="image/*" capture="environment" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <label className="rs-pick-button"><ImagePlus size={22}/><span>Pilih dari galeri</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <button type="button" className="rs-pick-button" onClick={() => setPasteOpen(value => !value)}><ClipboardPaste size={22}/><span>Tempel teks struk</span></button>
      </div>
      {pasteOpen && <div className="sb-paste"><textarea className="input" rows={6} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'Nasi Goreng 35.000\nEs Teh 2 x 6.000 12.000\nPB1 4.700\nTotal 51.700'}/><Button type="button" className="small" disabled={!pasted.trim()} onClick={() => readText(pasted)}>Baca teks</Button></div>}
      {!ocrAvailable() && <p className="sb-note is-warn">Perangkat ini belum bisa membaca foto. Tempel teks struknya, atau isi sendiri.</p>}
      {problem && <p className="sb-note is-warn" role="status">{problem}</p>}
      <p className="rs-privacy"><ShieldCheck size={15}/> Foto dibaca di perangkat ini dan tidak diunggah ke mana pun. Pemakaian pertama mengunduh pembaca struk (±5 MB) sekali saja.</p>
      <button type="button" className="link-button" onClick={manual}>Isi sendiri tanpa foto →</button>
    </div>}

    {busy && progress && <div className="rs-reading" role="status" aria-live="polite">
      {photoUrl && <img src={photoUrl} alt="Foto struk" style={{ transform: `rotate(${turn * 90}deg)` }}/>}
      <div className="rs-scanline" aria-hidden="true"/>
      <strong>{progress.label}</strong>
      <div className="rs-bar"><i style={{ width: `${Math.round(progress.progress * 100)}%` }}/></div>
      <small className="muted">{Math.round(progress.progress * 100)}% · tetap buka layar ini</small>
      <button type="button" className="link-button" onClick={() => { job.current++; setProgress(null); setProblem('Pembacaan dibatalkan.'); }}>Batal</button>
    </div>}

    {draft && !busy && <form className="form-stack rs-review" onSubmit={event => { event.preventDefault(); save(); }}>
      {check && (read?.items.length || read?.total) ? <div className={`rs-check is-${check.confidence}`}>
        {check.confidence === 'tinggi' ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}
        <div><strong>{CONFIDENCE[check.confidence]}</strong>{check.notes.map(note => <small key={note}>{note}</small>)}{read?.payment && <small>Cara bayar: {PAYMENT_LABELS[read.payment]}{read.paid ? ` · dibayar ${rupiah(read.paid)}` : ''}{read.change ? ` · kembali ${rupiah(read.change)}` : ''}</small>}</div>
      </div> : null}
      {problem && <p className="sb-note is-warn" role="status">{problem}</p>}
      {photoUrl && <div className="rs-photo"><img src={photoUrl} alt="Foto struk" style={{ transform: `rotate(${turn * 90}deg)` }}/><div className="rs-photo-actions"><button type="button" className="link-button" onClick={rotate}><RotateCw size={15}/> Putar & baca ulang</button><button type="button" className="link-button" onClick={() => void (photo && scan(photo, turn))}><ScanText size={15}/> Baca ulang</button><button type="button" className="link-button" onClick={reset}><Trash2 size={15}/> Ganti foto</button></div>{ocrMeta && <small className="muted">{ocrMeta}</small>}</div>}

      <div className="ip-seg rs-type" role="group" aria-label="Jenis transaksi"><button type="button" className={draft.type === 'expense' ? 'active' : ''} onClick={() => read && build(read, 'expense')}>Pengeluaran</button><button type="button" className={draft.type === 'income' ? 'active' : ''} onClick={() => read && build(read, 'income')}>Pemasukan</button></div>

      <Field label="Nominal" hint={check?.source === 'printed' ? 'Dari total yang tertulis di struk' : check?.source === 'paid' ? 'Dari uang bayar dikurangi kembalian' : check?.source === 'items' || check?.source === 'computed' ? 'Dihitung dari item; periksa lagi' : undefined}><Money value={draft.amount} onChange={amount => patch({ amount })} required/></Field>
      {alternatives.length > 0 && <div className="rs-alts"><small className="muted">Nominal lain dari struk:</small>{alternatives.map(([label, value]) => <button type="button" key={label} className="sb-chip" onClick={() => patch({ amount: value })}>{rupiah(value)} <small>{label}</small></button>)}</div>}
      <div className="form-grid"><Field label="Tanggal"><Input type="date" required value={draft.date} max={today} onChange={e => patch({ date: e.target.value })}/></Field><Field label="Jam"><Input type="time" value={draft.time} onChange={e => patch({ time: e.target.value })}/></Field></div>
      <div className="form-grid"><Field label={draft.type === 'income' ? 'Dari' : 'Tempat'}><Input value={draft.merchant} maxLength={80} onChange={e => patch({ merchant: e.target.value })} placeholder="Nama toko atau tempat"/></Field><Field label="Keterangan"><Input value={draft.description} maxLength={120} onChange={e => patch({ description: e.target.value })}/></Field></div>
      <Field label={draft.type === 'income' ? 'Masuk ke dompet' : 'Dibayar dari'} hint={why.wallet || undefined}><Select required value={draft.walletId} onChange={e => patch({ walletId: e.target.value })}><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
      {!(draft.type === 'expense' && draft.bySplit && splits.length > 1) && <Field label="Kategori" hint={why.category ? `Tebakan: ${why.category}` : undefined}><CategoryPicker type={draft.type} categoryId={draft.categoryId} subcategoryId={draft.subcategoryId} required={draft.type === 'expense'} onChange={value => patch(value)}/></Field>}

      <details className="rs-items" open={draft.items.length > 0 && draft.items.length <= 8}>
        <summary><ReceiptText size={16}/> Item di struk <span className="muted">{draft.items.length} item · {rupiah(itemsTotal)}</span></summary>
        {draft.items.map(item => <div className="rs-item" key={item.key}>
          <div className="rs-item-top"><input className="input rs-item-name" value={item.name} placeholder="Nama item" aria-label="Nama item" onChange={e => patchItem(item.key, { name: e.target.value })}/><button type="button" className="rs-icon" aria-label={`Hapus ${item.name || 'item'}`} onClick={() => setDraft(current => current && { ...current, items: current.items.filter(entry => entry.key !== item.key) })}><Trash2 size={15}/></button></div>
          <div className={`rs-item-bottom ${draft.type === 'expense' ? '' : 'no-cat'}`}>
            <input className="input rs-item-qty" inputMode="numeric" value={item.qty} aria-label="Jumlah" onChange={e => patchItem(item.key, { qty: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })}/>
            <span className="rs-item-x">×</span>
            <span className="rs-item-price"><Money value={item.price} onChange={price => patchItem(item.key, { price })}/></span>
            {draft.type === 'expense' && <Select className="rs-item-cat" aria-label="Kategori item" value={item.subcategoryId || item.categoryId} onChange={e => { const cat = data.categories.find(c => c.id === e.target.value); patchItem(item.key, cat?.parentId ? { categoryId: cat.parentId, subcategoryId: cat.id } : { categoryId: e.target.value, subcategoryId: '' }); }}><option value="">Kategori</option>{categoryOptions(data.categories, ['expense'])}</Select>}
          </div>
        </div>)}
        <button type="button" className="link-button" onClick={() => setDraft(current => current && { ...current, items: [...current.items, { key: key(), name: '', qty: 1, price: 0, categoryId: current.categoryId, subcategoryId: current.subcategoryId }] })}><Plus size={15}/> Tambah item</button>
        {itemsTotal > 0 && draft.amount > 0 && itemsTotal !== draft.amount && <p className="muted rs-diff">Jumlah item {rupiah(itemsTotal)}, nominal {rupiah(draft.amount)}. Selisih {rupiah(Math.abs(draft.amount - itemsTotal))} {draft.amount > itemsTotal ? 'biasanya pajak, service, atau ongkir' : 'biasanya diskon'}.</p>}
      </details>

      {draft.type === 'expense' && categoriesUsed > 1 && <div className="rs-split">
        <label className="rs-toggle"><input type="checkbox" checked={draft.bySplit} onChange={e => patch({ bySplit: e.target.checked })}/> <span><strong>Pisah per kategori</strong><small>Item di struk ini masuk ke {categoriesUsed} kategori. Pajak, service, dan diskon dibagi sesuai besar belanjanya.</small></span></label>
        {draft.bySplit && splits.map(line => <div className="budget-line" key={`${line.categoryId}:${line.subcategoryId}`}><span>{catName(line.categoryId)}{line.subcategoryId ? ` › ${catName(line.subcategoryId)}` : ''}</span><strong>{rupiah(line.amount)}</strong></div>)}
      </div>}

      <details className="disclosure" open={Boolean(draft.notes) || undefined}><summary>Catatan</summary><Field label="Catatan"><Input value={draft.notes} maxLength={300} onChange={e => patch({ notes: e.target.value })}/></Field></details>
      {rawText && <details className="rs-raw"><summary><FileText size={15}/> Teks yang terbaca</summary><textarea className="input" rows={8} value={rawText} onChange={e => setRawText(e.target.value)}/><Button type="button" variant="secondary" className="small" onClick={() => readText(rawText)}>Baca ulang dari teks ini</Button><small className="muted">Perbaiki angka yang salah baca di sini, lalu baca ulang.</small></details>}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="rs-actions">
        <Button type="submit" className="full">{lowOk ? 'Ya, nominal sudah benar. Simpan' : 'Simpan transaksi'}</Button>
        <div className="rs-actions-row"><Button type="button" variant="secondary" onClick={toForm}>Buka di formulir</Button>{draft.type === 'expense' && <Button type="button" variant="secondary" onClick={toSplitBill}><ReceiptText size={15}/> Jadikan Split Bill</Button>}</div>
      </div>
    </form>}
  </DialogContent></Dialog>;
}
