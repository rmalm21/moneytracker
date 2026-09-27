'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bug, Camera, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardPaste, Copy, CreditCard, Crop, Eye, FileText, ImagePlus, Info, Percent, Plus, ReceiptText, RotateCw, ScanText, ShieldCheck, Trash2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { CategoryAccordion } from './category-accordion';
import { Field, Input, Money, Select } from './fields';
import { ReceiptCorners, ReceiptSource, type Upright } from './receipt-source';
import { ReceiptCamera, liveCameraAvailable } from './receipt-camera';
import { rupiah } from '@/lib/accounting';
import { newTx, transactionsAround, upsertTransaction, validateTx } from '@/lib/firestore';
import { todayInTimeZone } from '@/lib/period';
import { CHARGE_ORDER, PAYMENT_LABELS, SEPARABLE, chargeCategory, chargeSummary, checkReceipt, netItems, readReceiptText, receiptSplits, receiptToTransaction, type ChargeKey, type PaymentMethod, type ReceiptRead } from '@/lib/receipt';
import { buildIntelligence, findDuplicate, mergeReceiptReads, reconcileAmounts, regionFor, STATUS_LABELS, type Duplicate, type FieldStatus } from '@/lib/receipt-intel';
import { analyzeReceiptPhoto, cancelReceiptRead, ocrAvailable, readReceiptPhoto, rereadField, type OcrProgress, type OcrResult } from '@/lib/receipt-ocr';
import { uprightPreview, type Prepared } from '@/lib/receipt-prep';
import type { Quad } from '@/lib/receipt-image';
import type { Box } from '@/lib/receipt-rows';
import { walletAllows } from '@/lib/wallet-capabilities';
import type { LedgerTx, SplitLine } from '@/lib/types';

/**
 * Scan struk: a receipt photo (or its text) becomes a transaction, but only after the user has checked it.
 * The photo is read on this device; nothing is saved until "Simpan transaksi". The review shows only what needs
 * checking (Receipt Intelligence 2.0, lib/receipt-intel.ts): a value the reader is unsure of is marked "Perlu dicek",
 * with the other readings to choose from, where it was read on the photo, and "Baca ulang" for that part only.
 */

type Background = (run: () => Promise<unknown>, info: { message: string; detail?: string; retry: { preset?: Partial<LedgerTx> } }) => void;
type Item = { key: string; name: string; qty: number; price: number; discount: number; modifiers: string[]; addOnOf?: string; categoryId: string; subcategoryId: string; /** Its index in the reading (for its evidence). */ source?: number };
type CatRef = { categoryId: string; subcategoryId: string | null };
type Draft = {
  type: 'expense' | 'income'; amount: number; date: string; time: string; merchant: string; description: string; walletId: string; categoryId: string; subcategoryId: string; notes: string; items: Item[]; bySplit: boolean; payment: PaymentMethod;
  /** Printed subtotal (when there are no items), charges as read (discount positive), which are counted, and how they are recorded. */
  subtotal: number; ch: Record<ChargeKey, number>; inc: Record<ChargeKey, boolean>; chargeMode: 'spread' | 'separate'; chargeCats: Partial<Record<ChargeKey, CatRef>>;
};
type Reread = { field: string; label: string; busy: boolean; values: (number | string)[] | null; note?: string };

/** A receipt handed to Split Bill (same page, so the photo can go along without being stored anywhere). */
let handoff: { read: ReceiptRead; photo: Blob | null } | null = null;
export function takeReceiptHandoff() { const value = handoff; if (value) setTimeout(() => { if (handoff === value) handoff = null; }, 2000); return value; }

const key = () => Math.random().toString(36).slice(2, 9);
const CHARGE_SHORT: Record<ChargeKey, string> = { discount: 'Diskon', tax: 'Pajak / PB1', service: 'Service', delivery: 'Ongkir', fee: 'Biaya lain', rounding: 'Pembulatan' };
const CHARGE_HINT: Partial<Record<ChargeKey, string>> = { discount: 'potongan, promo, voucher', tax: 'PPN, PBJT', fee: 'admin, kemasan, tip' };
const STAGES: [OcrProgress['stage'][], string][] = [[['prepare'], 'Menyiapkan foto'], [['straighten'], 'Meluruskan struk'], [['load', 'read', 'second'], 'Membaca tulisan'], [['parse'], 'Mengenali rincian'], [['check', 'done'], 'Memeriksa total']];
const TYPE_LABELS: Record<string, string> = { restaurant: 'Restoran', cafe: 'Kafe', minimarket: 'Minimarket', supermarket: 'Supermarket', retail: 'Toko', pharmacy: 'Apotek', fuel: 'SPBU / BBM', parking: 'Parkir', food_delivery: 'Pesan antar makanan', marketplace: 'Belanja online', travel: 'Perjalanan', generic: 'Umum', unknown: 'Belum dikenali' };
const DEBUG_KEY = 'dompet-ajaib:ocr-debug';

/** A small mark next to a value the user should look at; nothing for values that are fine. */
function Status({ status, compact = false }: { status: FieldStatus; compact?: boolean }) {
  if (status !== 'check' && status !== 'missing') return null;
  if (compact) return <span className={`rs-status-dot is-${status}`} title={STATUS_LABELS[status]} aria-label={STATUS_LABELS[status]}>{status === 'check' ? <AlertTriangle size={12}/> : <Info size={12}/>}</span>;
  return <span className={`rs-status is-${status}`}>{status === 'check' ? <AlertTriangle size={12}/> : <Info size={12}/>}{STATUS_LABELS[status]}</span>;
}

export function ReceiptScan({ open, onOpenChange, startType = 'expense', background, openTx, navigate }: { open: boolean; onOpenChange: (open: boolean) => void; startType?: 'expense' | 'income'; background: Background; openTx: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void; navigate: (key: string, target?: string) => void }) {
  const { data, user, profile } = useApp();
  const today = todayInTimeZone(profile?.timeZone);
  const [photo, setPhoto] = useState<Blob | null>(null), [photoUrl, setPhotoUrl] = useState(''), [turn, setTurn] = useState(0), [upright, setUpright] = useState<Upright | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null), [problem, setProblem] = useState(''), [pasteOpen, setPasteOpen] = useState(false), [pasted, setPasted] = useState('');
  const [read, setRead] = useState<ReceiptRead | null>(null), [rawText, setRawText] = useState(''), [ocrMeta, setOcrMeta] = useState(''), [draft, setDraft] = useState<Draft | null>(null), [why, setWhy] = useState<{ category?: string; wallet?: string }>({}), [error, setError] = useState(''), [lowOk, setLowOk] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null), [gate, setGate] = useState<{ prepared: Prepared } | null>(null), [cameraOpen, setCameraOpen] = useState(false);
  const [source, setSource] = useState<{ label: string; box: Box | null } | null>(null), [cornersOpen, setCornersOpen] = useState(false), [reread, setReread] = useState<Reread | null>(null);
  const [settledFields, setSettledFields] = useState<string[]>([]), [duplicate, setDuplicate] = useState<Duplicate | null>(null), [dupOk, setDupOk] = useState(false), [parts, setParts] = useState(1), [debug, setDebug] = useState(false);
  const job = useRef(0), captureInput = useRef<HTMLInputElement>(null), moreInput = useRef<HTMLInputElement>(null);
  const [shownKeys, setShownKeys] = useState<ChargeKey[]>([]), [bigPhoto, setBigPhoto] = useState(false), [openItem, setOpenItem] = useState<string | null>(null);
  const payWallets = data.wallets.filter(w => walletAllows(w, 'pay'));
  const inWallets = data.wallets.filter(w => !w.isArchived);
  const knownMerchants = useMemo(() => [...new Set(data.transactions.slice(-500).map(t => t.merchant?.trim()).filter(Boolean))], [data.transactions]);

  function reset() {
    job.current++; if (photoUrl) URL.revokeObjectURL(photoUrl); if (upright) URL.revokeObjectURL(upright.url);
    setPhoto(null); setPhotoUrl(''); setUpright(null); setTurn(0); setProgress(null); setProblem(''); setPasteOpen(false); setPasted(''); setRead(null); setRawText(''); setOcrMeta(''); setDraft(null); setWhy({}); setError(''); setShownKeys([]);
    // The working images are released with the result (memory on phones).
    setResult(null); setGate(null); setCameraOpen(false); setSource(null); setCornersOpen(false); setReread(null); setSettledFields([]); setDuplicate(null); setDupOk(false); setParts(1);
  }
  useEffect(() => { if (!open) { cancelIfBusy(); reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => { try { setDebug(localStorage.getItem(DEBUG_KEY) === '1'); } catch { /* optional */ } }, []);

  const intel = useMemo(() => read ? buildIntelligence(read, { votes: parts > 1 ? undefined : result?.votes, boxes: field => parts > 1 && !['merchant', 'date', 'time'].includes(field) ? null : result?.fieldBoxes[field] || null, itemBox: index => result?.itemBoxes[index] || null, knownMerchants, passIds: result?.passList.map(p => p.id) }) : null, [read, result, knownMerchants, parts]);

  function build(next: ReceiptRead, type: 'expense' | 'income' = draft?.type || startType) {
    const guess = receiptToTransaction(next, { categories: data.categories, history: data.transactions, wallets: type === 'expense' ? payWallets : inWallets, today, defaultWalletId: type === 'expense' ? profile?.defaultExpenseWalletId : profile?.defaultIncomeWalletId }, type);
    const merchant = buildIntelligence(next, { knownMerchants }).merchant.value || guess.merchant;
    setRead(next);
    setWhy({ category: guess.why, wallet: guess.walletWhy });
    const counted = checkReceipt(next).included;
    setDraft({ subtotal: next.subtotal, ch: { discount: next.discount, tax: next.tax, service: next.service, delivery: next.delivery, fee: next.fee || 0, rounding: next.rounding }, inc: Object.fromEntries(CHARGE_ORDER.map(k => [k, !counted.includes(k)])) as Record<ChargeKey, boolean>, chargeMode: 'spread', chargeCats: {}, type, amount: guess.amount, date: guess.date, time: guess.time, merchant, description: guess.description, walletId: guess.walletId, categoryId: guess.categoryId || (type === 'income' ? profile?.salaryIncomeCategoryId || '' : ''), subcategoryId: guess.subcategoryId || '', notes: '', payment: next.payment, items: guess.items.map((item, i) => ({ key: key(), name: item.name, qty: item.qty, price: item.price, discount: item.discount || 0, modifiers: item.modifiers || [], ...(item.addOnOf ? { addOnOf: item.addOnOf } : {}), categoryId: item.categoryId || '', subcategoryId: item.subcategoryId || '', source: i })), bySplit: guess.splits.length > 1 });
    setError(''); setLowOk(false); setSettledFields([]); setDupOk(false);
  }
  function cancelIfBusy() { if (progress) cancelReceiptRead(); }
  async function showUpright(source: Blob, quarter: number) {
    try { const next = await uprightPreview(source, quarter); setUpright(current => { if (current) URL.revokeObjectURL(current.url); return next; }); } catch { /* the plain photo is still shown */ }
  }
  async function scan(source: Blob, quarter = 0, corners?: Quad, prepared?: Prepared) {
    const id = ++job.current;
    setProblem(''); setDraft(null); setRead(null); setResult(null); setGate(null); setSource(null); setReread(null); setParts(1);
    setProgress({ stage: 'prepare', progress: 0, label: 'Menyiapkan foto…' });
    try {
      const next = await readReceiptPhoto(source, value => { if (job.current === id) setProgress(value); }, { turn: quarter, corners, prepared });
      // A newer scan started (or this one was cancelled): this result is thrown away.
      if (job.current !== id) return;
      setResult(next);
      setRawText(next.text.trim());
      setOcrMeta(`Dibaca ${next.passes}× dalam ${(next.ms / 1000).toFixed(1)} detik${next.method === 'perspective' ? ' · diluruskan' : ''}`);
      if (!next.read.items.length && !next.check.total) setProblem(next.quality.blur === 'poor' ? 'Foto terlalu buram untuk dibaca. Ambil ulang dengan kamera diam, atau isi sendiri di bawah.' : next.method === 'none' ? 'Struk tidak ditemukan di foto. Coba foto lebih dekat, atau isi sendiri di bawah.' : 'Tulisan di foto belum terbaca jelas. Coba foto lebih dekat dan terang, atau isi sendiri di bawah.');
      build(next.read);
    } catch (e) { if (job.current === id) setProblem((e as Error).message || 'Foto belum bisa dibaca.'); }
    finally { if (job.current === id) setProgress(null); }
  }
  /** A new photo: its quality is checked first (quick); a photo that will not read well offers a retake. */
  async function pick(file: Blob | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProblem('Pilih file gambar (JPG, PNG, atau WebP).'); return; }
    if (file.size > 25 * 1024 * 1024) { setProblem('Foto terlalu besar (lebih dari 25 MB).'); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(file); setPhotoUrl(URL.createObjectURL(file)); setTurn(0); void showUpright(file, 0);
    if (!ocrAvailable()) { setProblem('Perangkat ini belum bisa membaca foto. Tempel teks struknya, atau isi sendiri.'); return; }
    const id = ++job.current;
    setProblem(''); setProgress({ stage: 'prepare', progress: .02, label: 'Memeriksa foto…' });
    try {
      const prepared = await analyzeReceiptPhoto(file, 0);
      if (job.current !== id) return;
      if (prepared.quality.retake) { setProgress(null); setGate({ prepared }); return; }
      void scan(file, 0, undefined, prepared);
    } catch (e) { if (job.current === id) { setProgress(null); setProblem((e as Error).message || 'Foto belum bisa dibaca.'); } }
  }
  function rotate() { if (!photo) return; const next = (turn + 1) % 4; setTurn(next); void showUpright(photo, next); void scan(photo, next); }
  function readText(text: string) { const next = readReceiptText(text); setRawText(text.trim()); setResult(null); setParts(1); if (!next.items.length && !next.total) { setProblem('Belum ada item atau total yang terbaca dari teks itu.'); } else setProblem(''); build(next); setPasteOpen(false); }
  function manual() { setResult(null); build(readReceiptText('')); setProblem(''); }
  /** Long receipt: another photo of the rest; items both photos show are counted once. */
  async function addMore(file: File | undefined) {
    if (!file || !read) return;
    const id = ++job.current, before = read;
    setProgress({ stage: 'prepare', progress: 0, label: 'Membaca foto lanjutan…' });
    try {
      const next = await readReceiptPhoto(file, value => { if (job.current === id) setProgress(value); });
      if (job.current !== id) return;
      const merged = mergeReceiptReads(before, next.read);
      setParts(n => n + 1); build(merged.read);
      setProblem(merged.overlap ? `${merged.overlap} item yang terlihat di kedua foto dihitung sekali.` : '');
    } catch (e) { if (job.current === id) setProblem((e as Error).message || 'Foto lanjutan belum bisa dibaca.'); }
    finally { if (job.current === id) setProgress(null); }
  }

  const patch = (changes: Partial<Draft>) => { setDraft(current => current && { ...current, ...changes }); setError(''); };
  const patchItem = (id: string, changes: Partial<Item>) => setDraft(current => current && { ...current, items: current.items.map(item => item.key === id ? { ...item, ...changes } : item) });
  const settle = (field: string) => setSettledFields(list => list.includes(field) ? list : [...list, field]);
  const itemNet = (item: Item) => item.qty * item.price - (item.discount || 0);
  const itemsTotal = draft?.items.reduce((sum, item) => sum + itemNet(item), 0) || 0;
  const check = useMemo(() => read ? checkReceipt(read) : null, [read]);
  /** The purchase lines: one per item category when "Pisah per kategori" is on, otherwise the chosen category. */
  const purchase = useMemo<SplitLine[]>(() => {
    if (!draft) return [];
    const groups = new Map<string, SplitLine>();
    if (draft.bySplit && itemsTotal) for (const item of draft.items) { if (!item.categoryId || !itemNet(item)) continue; const id = `${item.categoryId}:${item.subcategoryId}`; const line = groups.get(id) || { categoryId: item.categoryId, subcategoryId: item.subcategoryId || null, amount: 0 }; line.amount += itemNet(item); groups.set(id, line); }
    return groups.size > 1 ? [...groups.values()] : [{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId || null, amount: 1 }];
  }, [draft, itemsTotal]);
  const purchaseRef: CatRef = { categoryId: draft?.categoryId || purchase[0]?.categoryId || '', subcategoryId: draft?.categoryId ? draft.subcategoryId || null : purchase[0]?.subcategoryId || null };
  const catFor = (key: ChargeKey) => draft?.chargeCats[key] || chargeCategory(key, data.categories, purchaseRef);
  const counted = (key: ChargeKey) => draft && draft.inc[key] ? draft.ch[key] : 0;
  const separated = draft && draft.type === 'expense' && draft.chargeMode === 'separate' ? SEPARABLE.filter(key => counted(key) > 0) : [];
  /** The expense's lines (charges separate or inside the purchase); always adding up to the amount. */
  const splits = useMemo<SplitLine[]>(() => {
    if (!draft || draft.type !== 'expense' || !draft.amount) return [];
    const lines = receiptSplits(draft.amount, purchase, separated.map(key => ({ ...catFor(key), amount: counted(key) })));
    return lines.length > 1 ? lines : [];
  }, [draft, purchase, separated.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = itemsTotal || draft?.subtotal || 0;
  const extra = CHARGE_ORDER.reduce((n, key) => n + (key === 'discount' ? -counted(key) : counted(key)), 0);
  const computedTotal = base ? base + extra : 0;
  /** Checked again after every change (items, charges, total). */
  const live = draft ? reconcileAmounts({ total: draft.amount, computed: computedTotal, hasParts: base > 0 }) : null;
  const shownCharges = draft ? CHARGE_ORDER.filter(key => draft.ch[key]) : [];
  const categoriesUsed = new Set(draft?.items.filter(item => item.categoryId).map(item => `${item.categoryId}:${item.subcategoryId}`)).size;
  const catName = (id: string | null | undefined) => data.categories.find(c => c.id === id)?.name || '';
  const alternatives = useMemo(() => {
    if (!read || !check || !draft) return [] as [string, number][];
    const byPaid = read.paid && read.change && read.paid > read.change ? read.paid - read.change : 0;
    const list: [string, number][] = [['tertulis', read.total], ...((intel?.grandTotal.alternatives || []).map(v => ['bacaan lain', v] as [string, number])), ['bayar − kembalian', byPaid], ['item + biaya', check.computed], ['jumlah item', itemsTotal]];
    const seen = new Set<number>([draft.amount]);
    return list.filter(([, value]) => { if (!value || seen.has(value)) return false; seen.add(value); return true; });
  }, [read, check, draft, itemsTotal, intel]);
  // What still needs a look: the reader's doubts, minus what the user has settled, plus the live check.
  const issues = (intel?.issues || []).filter(issue => !settledFields.includes(issue.field) && issue.field !== 'reconcile' && !(issue.field === 'total' && live?.state === 'RECONCILED'));
  const statusOf = (field: string, status: FieldStatus | undefined) => settledFields.includes(field) ? 'likely' : status || 'likely';

  /* ---------------- where a value was read, and reading it again */
  const mapping = result && upright ? { toPhoto: result.prepared.toPhoto, photoWidth: result.prepared.photoWidth, photoHeight: result.prepared.photoHeight } : null;
  const boxFor = (field: string): Box | null => {
    if (!intel) return null;
    if (field.startsWith('item:')) { const item = draft?.items.find(i => i.key === field.slice(5)); return item?.source !== undefined ? intel.items[item.source]?.amount.evidence.box || null : null; }
    const f = field === 'total' ? intel.grandTotal : field === 'date' ? intel.date : field === 'time' ? intel.time : field === 'merchant' ? intel.merchant : field === 'payment' ? intel.payment : field === 'subtotal' ? intel.subtotal : intel.charges[field as keyof typeof intel.charges];
    return f?.evidence.box || null;
  };
  const canShow = (field: string) => Boolean(mapping && boxFor(field));
  function show(field: string, label: string) { setSource({ label, box: boxFor(field) }); }
  async function readAgain(field: string, label: string) {
    if (!result) return;
    const box = boxFor(field), line = result.passList.flatMap(p => p.lines).find(l => box && Math.abs(l.box.y - box.y) < box.height * .5 && l.box.x <= box.x + 2) || null;
    const plan = regionFor(field.startsWith('item:') ? 'item' : field, box, line, result.prepared);
    if (!plan) { setReread({ field, label, busy: false, values: [], note: 'Letak bagian ini di foto belum diketahui. Ubah angkanya langsung.' }); return; }
    const id = ++job.current;
    setReread({ field, label, busy: true, values: null });
    try {
      const found = await rereadField(result.prepared, plan);
      if (job.current !== id) return;
      setReread({ field, label, busy: false, values: found.values, note: found.values.length ? undefined : 'Bagian ini belum terbaca lebih jelas. Cocokkan dengan struk dan ubah langsung.' });
    } catch (e) { if (job.current === id) setReread({ field, label, busy: false, values: [], note: (e as Error).message || 'Belum bisa membaca ulang.' }); }
  }
  function useValue(field: string, value: number | string) {
    if (!draft) return;
    if (field === 'total' && typeof value === 'number') patch({ amount: value });
    else if (field === 'date' && typeof value === 'string') { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) patch({ date: value > today ? draft.date : value }); else if (/^\d{2}:\d{2}$/.test(value)) patch({ time: value }); }
    else if (field === 'time' && typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) patch({ time: value });
    else if (field === 'merchant' && typeof value === 'string') patch({ merchant: value });
    else if (field.startsWith('item:') && typeof value === 'number') { const item = draft.items.find(i => i.key === field.slice(5)); if (item) { const qty = value % item.qty === 0 ? item.qty : 1; patchItem(item.key, { qty, price: value / qty }); } }
    else if (typeof value === 'number' && (CHARGE_ORDER as string[]).includes(field)) patch({ ch: { ...draft.ch, [field]: value } });
    settle(field.startsWith('item:') ? `item:${draft.items.find(i => i.key === field.slice(5))?.source}` : field); setReread(null);
  }
  /** "Lihat di struk" and "Baca ulang" for one field; shown only when useful. */
  const FieldTools = ({ field, label, status }: { field: string; label: string; status: FieldStatus }) => <span className="rs-field-tools">
    {canShow(field) && <button type="button" className="rs-tool" onClick={() => show(field, label)} aria-label={`Lihat ${label} di struk`} title="Lihat di struk"><Eye size={14}/></button>}
    {(status === 'check' || status === 'missing') && result && canShow(field) && <button type="button" className="rs-tool" onClick={() => void readAgain(field, label)} aria-label={`Baca ulang ${label}`} title="Baca ulang bagian ini"><ScanText size={14}/></button>}
  </span>;

  function toTx() {
    if (!draft) return null;
    const useSplit = draft.type === 'expense' && splits.length > 1;
    const breakdown = draft.type === 'expense' ? chargeSummary(base, draft.ch, CHARGE_ORDER.filter(k => draft.ch[k] && !draft.inc[k])) : '';
    const itemNote = draft.items.length > 2 ? draft.items.map(item => `${item.name}${item.qty > 1 ? ` ${item.qty}×` : ''} ${rupiah(itemNet(item))}`).join(', ') : '';
    const receiptNo = read?.identifiers?.receiptNo;
    const details = [draft.payment && `Dibayar: ${PAYMENT_LABELS[draft.payment]}`, receiptNo && `No. struk: ${receiptNo}`].filter(Boolean).join(' · ');
    const notes = [draft.notes.trim(), itemNote && `Isi struk: ${itemNote}`, breakdown && `Rincian: ${breakdown}`, details].filter(Boolean).join('\n').slice(0, 1000);
    return newTx({ type: draft.type, amount: draft.amount, date: draft.date, time: draft.time, walletId: draft.walletId, categoryId: useSplit ? null : draft.categoryId || null, subcategoryId: useSplit ? null : draft.subcategoryId || null, merchant: draft.merchant.trim(), description: draft.description.trim(), notes, tags: ['struk'], splits: useSplit ? splits : [] });
  }
  async function save(force = false) {
    if (!user || !draft) return;
    const tx = toTx(); if (!tx) return;
    if (tx.date > today) { setError('Tanggal struk ada di masa depan. Periksa tanggalnya.'); return; }
    try { validateTx(tx); } catch (e) { setError((e as Error).message); return; }
    if (check?.confidence === 'rendah' && (read?.items.length || read?.total) && !lowOk && !settledFields.includes('total')) { setLowOk(true); setError(`Nominal ${rupiah(tx.amount)} belum pasti terbaca. Cocokkan dengan struk, lalu tekan Simpan sekali lagi.`); return; }
    // Already recorded? Only nearby days are looked at, and the amount alone is never enough.
    if (!force && !dupOk) {
      let pool = data.transactions;
      try { const around = await transactionsAround(user.uid, tx.date); pool = [...new Map([...data.transactions, ...around].map(t => [t.id, t])).values()]; } catch { /* the loaded transactions are enough */ }
      const found = findDuplicate({ amount: tx.amount, date: tx.date, time: tx.time, merchant: tx.merchant, receiptNo: read?.identifiers?.receiptNo, type: tx.type }, pool);
      if (found) { setDuplicate(found); return; }
    }
    const uid = user.uid, label = draft.type === 'expense' ? 'Pengeluaran' : 'Pemasukan';
    onOpenChange(false);
    background(() => upsertTransaction(uid, tx), { message: `${label} ${rupiah(tx.amount)} dari struk tersimpan.`, detail: tx.splits?.length ? `Dipisah ke ${tx.splits.length} kategori${separated.length ? `, termasuk ${separated.map(k => ({ tax: 'pajak', service: 'service', delivery: 'ongkir', fee: 'biaya lain' } as Record<string, string>)[k]).join(', ')}` : ''}` : [tx.merchant, catName(tx.subcategoryId || tx.categoryId)].filter(Boolean).join(' · '), retry: { preset: tx } });
  }
  function toForm() { const tx = toTx(); if (!tx) return; const { id: _id, ...preset } = tx; onOpenChange(false); openTx(preset); }
  function toSplitBill() {
    if (!read || !draft) return;
    const items = netItems(draft.items.filter(item => item.name.trim() && item.price > 0).map(item => ({ name: item.name.trim(), qty: item.qty, price: item.price, total: item.qty * item.price, discount: item.discount || 0 })));
    handoff = { read: { ...read, discount: draft.ch.discount, tax: counted('tax'), service: counted('service'), delivery: counted('delivery'), fee: counted('fee'), rounding: counted('rounding'), merchant: draft.merchant || read.merchant, date: draft.date, total: draft.amount, items }, photo };
    onOpenChange(false); navigate('splitbill', 'receipt-draft');
  }

  const busy = Boolean(progress);
  const wallets = draft?.type === 'income' ? inWallets : payWallets;
  const stageIndex = progress ? STAGES.findIndex(([stages]) => stages.includes(progress.stage)) : -1;
  const quality = result?.quality || gate?.prepared.quality;
  const itemStatus = (item: Item) => item.source !== undefined && !settledFields.includes(`item:${item.source}`) ? intel?.items[item.source]?.amount.status || 'likely' : 'likely';
  const totalStatus = statusOf('total', intel?.grandTotal.status);
  const dateStatus = read?.items.length || read?.total ? statusOf('date', intel?.date.status) : 'likely';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Scan struk" className="receipt-scan-dialog">
    {cameraOpen && <ReceiptCamera onCapture={blob => { setCameraOpen(false); void pick(blob); }} onFallback={() => { setCameraOpen(false); captureInput.current?.click(); }} onClose={() => setCameraOpen(false)}/>}
    <input ref={captureInput} type="file" accept="image/*" capture="environment" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    <input ref={moreInput} type="file" accept="image/*" hidden onChange={e => { void addMore(e.target.files?.[0]); e.target.value = ''; }}/>

    {!draft && !busy && !gate && <div className="rs-start">
      <div className="rs-hero"><span className="rs-hero-icon" aria-hidden="true"><ScanText size={26}/></span><div><strong>Foto struk atau nota</strong><small>Nominal, tanggal, tempat, item, pajak, dan cara bayar dibaca otomatis. Kamu cukup memeriksa bagian yang ditandai.</small></div></div>
      <div className="rs-pick">
        <button type="button" className="rs-pick-button is-main" onClick={() => liveCameraAvailable() ? setCameraOpen(true) : captureInput.current?.click()}><Camera size={22}/><span>Ambil foto</span></button>
        <label className="rs-pick-button"><ImagePlus size={22}/><span>Pilih dari galeri</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <button type="button" className="rs-pick-button" onClick={() => setPasteOpen(value => !value)}><ClipboardPaste size={22}/><span>Tempel teks struk</span></button>
      </div>
      {pasteOpen && <div className="sb-paste"><textarea className="input" rows={6} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'Nasi Goreng 35.000\nEs Teh 2 x 6.000 12.000\nPB1 4.700\nTotal 51.700'}/><Button type="button" className="small" disabled={!pasted.trim()} onClick={() => readText(pasted)}>Baca teks</Button></div>}
      {!ocrAvailable() && <p className="sb-note is-warn">Perangkat ini belum bisa membaca foto. Tempel teks struknya, atau isi sendiri.</p>}
      {problem && <p className="sb-note is-warn" role="status">{problem}</p>}
      <p className="rs-privacy"><ShieldCheck size={15}/> Foto dibaca di perangkat ini dan tidak diunggah ke mana pun. Pemakaian pertama mengunduh pembaca struk (±5 MB) sekali saja.</p>
      <button type="button" className="link-button" onClick={manual}>Isi sendiri tanpa foto →</button>
    </div>}

    {gate && !busy && <div className="rs-gate" role="alert">
      {photoUrl && <img src={photoUrl} alt="Foto struk"/>}
      <div><strong>Foto ini mungkin sulit dibaca</strong>{gate.prepared.quality.warnings.map(w => <small key={w}>{w}</small>)}</div>
      <div className="rs-gate-actions"><Button type="button" onClick={() => { const prepared = gate.prepared; setGate(null); if (photo) void scan(photo, turn, undefined, prepared); }}>Gunakan tetap</Button><Button type="button" variant="secondary" onClick={() => { reset(); if (liveCameraAvailable()) setCameraOpen(true); else captureInput.current?.click(); }}><Camera size={16}/> Ambil ulang</Button></div>
    </div>}

    {busy && progress && <div className="rs-reading" role="status" aria-live="polite">
      {photoUrl && <img src={upright?.url || photoUrl} alt="Foto struk" style={upright ? undefined : { transform: `rotate(${turn * 90}deg)` }}/>}
      <div className="rs-scanline" aria-hidden="true"/>
      <strong>{progress.label}</strong>
      <ol className="rs-steps">{STAGES.map(([, label], i) => <li key={label} className={i < stageIndex ? 'is-done' : i === stageIndex ? 'is-now' : ''}>{i < stageIndex ? <Check size={13}/> : <span/>}{label}</li>)}</ol>
      {(progress.stage === 'read' || progress.stage === 'second') && <div className="rs-bar"><i style={{ width: `${Math.round(progress.progress * 100)}%` }}/></div>}
      <small className="muted">Tetap buka layar ini</small>
      <button type="button" className="link-button" onClick={() => { cancelReceiptRead(); job.current++; setProgress(null); setProblem('Pembacaan dibatalkan.'); }}>Batal</button>
    </div>}

    {draft && !busy && <form className="form-stack rs-review" onSubmit={event => { event.preventDefault(); void save(); }}>
      {intel && (read?.items.length || read?.total) ? <section className={`rs-summary is-${live?.state === 'RECONCILED' ? 'ok' : issues.length || live?.state === 'UNRECONCILED' ? 'warn' : 'plain'}`}>
        <div className="rs-summary-head">
          {live?.state === 'RECONCILED' && !issues.length ? <CheckCircle2 size={20}/> : <ReceiptText size={20}/>}
          <div className="rs-summary-text"><strong>{intel.headline}</strong><small>{[draft.merchant, draft.date && new Date(`${draft.date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }), read?.receiptType && read.receiptType !== 'generic' && read.receiptType !== 'unknown' ? TYPE_LABELS[read.receiptType] : ''].filter(Boolean).join(' · ')}</small></div>
          {photoUrl && <button type="button" className="rs-summary-thumb" onClick={() => mapping ? setSource({ label: 'Seluruh struk', box: null }) : setBigPhoto(v => !v)} aria-label="Lihat foto struk"><img src={upright?.url || photoUrl} alt=""/></button>}
        </div>
        <div className="rs-summary-total"><span>Total</span><b>{rupiah(draft.amount)}</b></div>
        {ocrMeta && <small className="rs-summary-meta">{ocrMeta}{parts > 1 ? ` · ${parts} foto` : ''}</small>}
        {live && <p className={`rs-summary-line is-${live.state.toLowerCase()}`}>{live.state === 'RECONCILED' ? <Check size={14}/> : live.state === 'INSUFFICIENT_DATA' ? <Info size={14}/> : <AlertTriangle size={14}/>} {live.message}</p>}
        {issues.length > 0 && <div className="rs-issues"><small>{issues.length} bagian perlu dicek</small>
          {issues.slice(0, 5).map(issue => <div className="rs-issue" key={issue.field}>
            <span><b>{issue.label}</b> {issue.message}</span>
            {(issue.alternatives as (number | string)[] | undefined)?.length ? <span className="rs-issue-chips">{(issue.alternatives as (number | string)[]).slice(0, 3).map(value => <button type="button" key={String(value)} className="sb-chip" onClick={() => { const item = issue.field.startsWith('item:') ? draft.items.find(i => i.source === Number(issue.field.slice(5))) : null; useValue(item ? `item:${item.key}` : issue.field, value); settle(issue.field); }}>{typeof value === 'number' ? rupiah(value) : value}</button>)}<button type="button" className="sb-chip" onClick={() => settle(issue.field)}><Check size={12}/> Sudah benar</button></span> : <span className="rs-issue-chips">{canShow(issue.field.startsWith('item:') ? `item:${draft.items.find(i => i.source === Number(issue.field.slice(5)))?.key}` : issue.field) && <button type="button" className="sb-chip" onClick={() => { const item = issue.field.startsWith('item:') ? draft.items.find(i => i.source === Number(issue.field.slice(5))) : null; show(item ? `item:${item.key}` : issue.field, issue.label); }}><Eye size={12}/> Lihat di struk</button>}<button type="button" className="sb-chip" onClick={() => settle(issue.field)}><Check size={12}/> Sudah benar</button></span>}
          </div>)}
        </div>}
      </section> : null}
      {problem && <p className="sb-note is-warn" role="status">{problem}</p>}
      {quality && quality.warnings.length > 0 && <p className="rs-quality"><Info size={14}/> {quality.warnings.slice(0, 2).join(' ')}</p>}
      {result && (result.cornerConfidence === 'low' || result.method === 'rotate' || result.method === 'none') && upright && <button type="button" className="rs-corner-hint" onClick={() => setCornersOpen(true)}><Crop size={15}/> Batas struk kurang jelas. Atur sudut <ChevronRight size={15}/></button>}
      {photoUrl && bigPhoto && <div className="rs-photo is-big"><button type="button" className="rs-thumb" aria-label="Perkecil foto" onClick={() => setBigPhoto(false)}><img src={upright?.url || photoUrl} alt="Foto struk" style={upright ? undefined : { transform: `rotate(${turn * 90}deg)` }}/></button></div>}
      {photoUrl && <div className="rs-toolbar" role="toolbar" aria-label="Foto struk">
        <button type="button" onClick={rotate}><RotateCw size={14}/> Putar</button>
        {upright && result && <button type="button" onClick={() => setCornersOpen(true)}><Crop size={14}/> Sudut</button>}
        <button type="button" onClick={() => void (photo && scan(photo, turn))}><ScanText size={14}/> Baca ulang</button>
        <button type="button" onClick={() => moreInput.current?.click()}><Plus size={14}/> Foto lanjutan</button>
        <button type="button" onClick={reset}><Trash2 size={14}/> Ganti</button>
      </div>}

      <div className="ip-seg rs-type" role="group" aria-label="Jenis transaksi"><button type="button" className={draft.type === 'expense' ? 'active' : ''} onClick={() => read && build(read, 'expense')}>Pengeluaran</button><button type="button" className={draft.type === 'income' ? 'active' : ''} onClick={() => read && build(read, 'income')}>Pemasukan</button></div>

      <div className={`rs-field ${totalStatus === 'check' ? 'is-check' : ''}`}>
        <div className="rs-field-label"><span>Nominal</span><Status status={totalStatus}/><FieldTools field="total" label="Total" status={totalStatus}/></div>
        <Money value={draft.amount} onChange={amount => { patch({ amount }); settle('total'); }} required/>
        <small className="muted">{check?.source === 'printed' ? 'Dari total yang tertulis di struk' : check?.source === 'paid' ? 'Dari uang bayar dikurangi kembalian' : check?.source === 'items' || check?.source === 'computed' ? 'Dihitung dari item; periksa lagi' : ''}</small>
      </div>
      {reread?.field === 'total' && <RereadPanel reread={reread} onUse={value => useValue('total', value)} onClose={() => setReread(null)}/>}
      {alternatives.length > 0 && totalStatus !== 'verified' && <div className="rs-alts"><small className="muted">Nominal lain dari struk:</small>{alternatives.map(([label, value]) => <button type="button" key={`${label}${value}`} className="sb-chip" onClick={() => { patch({ amount: value }); settle('total'); }}>{rupiah(value)} <small>{label}</small></button>)}</div>}
      <div className="rs-sheet">
        <div className={`rs-line ${dateStatus === 'check' ? 'is-check' : ''}`}><span className="rs-line-label">Tanggal <Status status={dateStatus} compact/></span><div className="rs-line-control"><Input type="date" required value={draft.date} max={today} onChange={e => { patch({ date: e.target.value }); settle('date'); }}/></div><FieldTools field="date" label="Tanggal" status={dateStatus}/></div>
        {reread?.field === 'date' && <RereadPanel reread={reread} onUse={value => useValue('date', value)} onClose={() => setReread(null)}/>}
        {(intel?.date.alternatives.length || 0) > 0 && !settledFields.includes('date') && <div className="rs-alts"><small className="muted">Tanggal lain:</small>{intel!.date.alternatives.filter(d => d <= today).map(d => <button type="button" key={d} className="sb-chip" onClick={() => { patch({ date: d }); settle('date'); }}>{d.split('-').reverse().join('/')}</button>)}</div>}
        <div className="rs-line"><span className="rs-line-label">Jam</span><div className="rs-line-control"><Input type="time" value={draft.time} onChange={e => patch({ time: e.target.value })}/></div></div>
        <div className="rs-line"><span className="rs-line-label">{draft.type === 'income' ? 'Dari' : 'Tempat'}</span><div className="rs-line-control"><Input value={draft.merchant} maxLength={80} onChange={e => patch({ merchant: e.target.value })} placeholder="Nama toko atau tempat"/>{intel?.merchant.raw && intel.merchant.raw !== draft.merchant && <small>Terbaca “{intel.merchant.raw}”</small>}</div><FieldTools field="merchant" label="Tempat" status={statusOf('merchant', intel?.merchant.status)}/></div>
        <div className="rs-line"><span className="rs-line-label">{draft.type === 'income' ? 'Masuk ke' : 'Dompet'}</span><div className="rs-line-control"><Select required value={draft.walletId} onChange={e => patch({ walletId: e.target.value })}><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>{why.wallet && <small>{why.wallet}</small>}</div></div>
        {!(draft.type === 'expense' && draft.bySplit && purchase.length > 1) && <div className="rs-line"><span className="rs-line-label">{separated.length ? 'Kategori belanja' : 'Kategori'}</span><div className="rs-line-control"><CategoryAccordion type={draft.type} compact value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId || null }} onChange={value => patch({ categoryId: value.categoryId, subcategoryId: value.subcategoryId || '' })}/>{why.category && <small>Tebakan: {why.category}</small>}</div></div>}
        <div className="rs-line"><span className="rs-line-label">Keterangan</span><div className="rs-line-control"><Input value={draft.description} maxLength={120} onChange={e => patch({ description: e.target.value })} placeholder="Opsional"/></div></div>
        <div className="rs-line"><span className="rs-line-label">Catatan</span><div className="rs-line-control"><Input value={draft.notes} maxLength={300} onChange={e => patch({ notes: e.target.value })} placeholder="Opsional"/></div></div>
      </div>

      <details className="rs-items" open={draft.items.length > 0 && draft.items.length <= 12 || undefined}>
        <summary><ReceiptText size={16}/> Item di struk <span className="muted">{draft.items.length} item · {rupiah(itemsTotal)}</span></summary>
        {draft.items.map(item => { const status = itemStatus(item), field = `item:${item.key}`, opened = openItem === item.key, cat = catName(item.subcategoryId || item.categoryId); return <div className={`rs-item ${status === 'check' ? 'is-check' : ''} ${opened ? 'is-open' : ''}`} key={item.key}>
          <button type="button" className="rs-item-row" aria-expanded={opened} onClick={() => setOpenItem(opened ? null : item.key)}>
            <span className="rs-item-main"><strong>{item.name || 'Item tanpa nama'}</strong><small>{[item.qty > 1 ? `${item.qty} × ${rupiah(item.price)}` : '', item.discount ? `diskon ${rupiah(item.discount)}` : '', ...item.modifiers, item.addOnOf ? `tambahan ${item.addOnOf}` : '', draft.type === 'expense' ? cat : ''].filter(Boolean).join(' · ')}</small></span>
            {status === 'check' && <AlertTriangle size={14} className="rs-item-warn" aria-label="Perlu dicek"/>}
            <b>{rupiah(itemNet(item))}</b>
            <ChevronDown size={16} className="rs-item-chev" aria-hidden="true"/>
          </button>
          {opened && <div className="rs-item-edit">
            <div className="rs-item-top"><input className="input rs-item-name" value={item.name} placeholder="Nama item" aria-label="Nama item" onChange={e => patchItem(item.key, { name: e.target.value })}/><FieldTools field={field} label={item.name || 'Item'} status={status}/><button type="button" className="rs-icon" aria-label={`Hapus ${item.name || 'item'}`} onClick={() => setDraft(current => current && { ...current, items: current.items.filter(entry => entry.key !== item.key) })}><Trash2 size={15}/></button></div>
            <div className="rs-item-bottom">
              <input className="input rs-item-qty" inputMode="numeric" value={item.qty} aria-label="Jumlah" onChange={e => patchItem(item.key, { qty: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })}/>
              <span className="rs-item-x">×</span>
              <span className="rs-item-price"><Money value={item.price} onChange={price => { patchItem(item.key, { price }); if (item.source !== undefined) settle(`item:${item.source}`); }}/></span>
            </div>
            {item.discount > 0 && <div className="rs-item-disc"><span>Diskon −{rupiah(item.discount)} <small className="muted">(harga {rupiah(item.qty * item.price)})</small></span><button type="button" className="rs-text-button" onClick={() => patchItem(item.key, { discount: 0 })}><X size={12}/> Hapus</button></div>}
            {status === 'check' && item.source !== undefined && (intel?.items[item.source]?.amount.alternatives.length || 0) > 0 && <div className="rs-alts"><small className="muted">Kemungkinan lain:</small>{intel!.items[item.source!].amount.alternatives.map(v => <button type="button" key={v} className="sb-chip" onClick={() => useValue(field, v)}>{rupiah(v)}</button>)}<button type="button" className="sb-chip" onClick={() => settle(`item:${item.source}`)}><Check size={12}/> Sudah benar</button></div>}
            {reread?.field === field && <RereadPanel reread={reread} onUse={value => useValue(field, value)} onClose={() => setReread(null)}/>}
            {draft.type === 'expense' && <CategoryAccordion type="expense" compact label={`Kategori ${item.name || 'item'}`} placeholder="Kategori item" value={{ categoryId: item.categoryId, subcategoryId: item.subcategoryId || null }} onChange={value => patchItem(item.key, { categoryId: value.categoryId, subcategoryId: value.subcategoryId || '' })}/>}
          </div>}
        </div>; })}
        <button type="button" className="link-button" onClick={() => { const id = key(); setOpenItem(id); setDraft(current => current && { ...current, items: [...current.items, { key: id, name: '', qty: 1, price: 0, discount: 0, modifiers: [], categoryId: current.categoryId, subcategoryId: current.subcategoryId }] }); }}><Plus size={15}/> Tambah item</button>
        {itemsTotal > 0 && draft.amount > 0 && itemsTotal !== draft.amount && !shownCharges.length && <p className="muted rs-diff">Jumlah item {rupiah(itemsTotal)}, nominal {rupiah(draft.amount)}. Selisih {rupiah(Math.abs(draft.amount - itemsTotal))}{draft.amount > itemsTotal ? '. Mungkin ada pajak, service, ongkir, atau item yang belum terbaca.' : '. Mungkin ada diskon.'}</p>}
      </details>

      <details className="rs-charges">
        <summary><Percent size={16}/> Biaya tambahan <span className="muted">{shownCharges.length ? `${shownCharges.length} · ${rupiah(computedTotal)}` : 'tidak ada'}</span></summary>
        {base > 0 && <div className="rs-charge-row is-base"><span>Belanja{itemsTotal ? ` (${draft.items.length} item)` : ' (subtotal)'}</span>{itemsTotal ? <strong>{rupiah(base)}</strong> : <span className="rs-charge-money"><Money value={draft.subtotal} onChange={subtotal => patch({ subtotal })}/></span>}</div>}
        {!base && <div className="rs-charge-row is-base"><span>Subtotal</span><span className="rs-charge-money"><Money value={draft.subtotal} onChange={subtotal => patch({ subtotal })}/></span></div>}
        {CHARGE_ORDER.filter(key => draft.ch[key] || shownKeys.includes(key)).map(key => { const status = statusOf(key, intel?.charges[key]?.status); return <div className={`rs-charge-row ${draft.inc[key] ? '' : 'is-off'} ${status === 'check' ? 'is-check' : ''}`} key={key}>
          <span>{CHARGE_SHORT[key]}<small>{!draft.inc[key] ? 'sudah termasuk harga' : status === 'check' ? 'perlu dicek' : CHARGE_HINT[key] || ''}</small></span>
          <span className="rs-charge-money">{key === 'discount' ? <b className="rs-sign is-fixed" aria-hidden="true">−</b> : key === 'rounding' ? <button type="button" className="rs-sign" aria-label="Ganti tanda" onClick={() => patch({ ch: { ...draft.ch, rounding: -draft.ch.rounding } })}>{draft.ch.rounding < 0 ? '−' : '+'}</button> : <b className="rs-sign is-fixed" aria-hidden="true">+</b>}<Money value={Math.abs(draft.ch[key])} onChange={value => { patch({ ch: { ...draft.ch, [key]: key === 'rounding' && draft.ch.rounding < 0 ? -value : value } }); settle(key); }}/></span>
          <button type="button" className={`rs-include ${draft.inc[key] ? 'is-on' : ''}`} aria-pressed={draft.inc[key]} title={draft.inc[key] ? 'Dihitung' : 'Sudah termasuk harga'} onClick={() => patch({ inc: { ...draft.inc, [key]: !draft.inc[key] } })}>{draft.inc[key] ? <Check size={14}/> : null}<span>{draft.inc[key] ? 'Hitung' : 'Termasuk'}</span></button>
        </div>; })}
        {CHARGE_ORDER.some(key => !draft.ch[key] && !shownKeys.includes(key)) && <div className="rs-alts">{CHARGE_ORDER.filter(key => !draft.ch[key] && !shownKeys.includes(key)).map(key => <button type="button" key={key} className="sb-chip" onClick={() => setShownKeys(list => [...list, key])}><Plus size={13}/> {CHARGE_SHORT[key]}</button>)}</div>}
        {computedTotal > 0 && <div className="rs-charge-row is-total"><span>Hasil hitung</span><strong>{rupiah(computedTotal)}</strong></div>}
        {computedTotal > 0 && computedTotal !== draft.amount && <button type="button" className="rs-text-button rs-use-total" onClick={() => { patch({ amount: computedTotal }); settle('total'); }}>Pakai {rupiah(computedTotal)} sebagai nominal</button>}
        {draft.type === 'expense' && SEPARABLE.some(key => counted(key) > 0) && <>
          <div className="ip-seg rs-charge-mode" role="group" aria-label="Cara mencatat biaya"><button type="button" className={draft.chargeMode === 'spread' ? 'active' : ''} onClick={() => patch({ chargeMode: 'spread' })}>Gabungkan</button><button type="button" className={draft.chargeMode === 'separate' ? 'active' : ''} onClick={() => patch({ chargeMode: 'separate' })}>Pisahkan</button></div>
          <small className="muted">{draft.chargeMode === 'spread' ? 'Pajak, service, ongkir, dan biaya lain ikut masuk ke kategori belanja. Rinciannya tetap tersimpan di catatan transaksi.' : 'Setiap biaya jadi baris sendiri dengan kategorinya, jadi terlihat di laporan dan anggaran. Diskon dan pembulatan tetap mengurangi belanja.'}</small>
          {draft.chargeMode === 'separate' && separated.map(key => { const ref = catFor(key); return <div className="rs-charge-cat" key={key}><span>{CHARGE_SHORT[key]} <b>{rupiah(counted(key))}</b></span><CategoryAccordion type="expense" compact label={`Kategori ${CHARGE_SHORT[key]}`} value={{ categoryId: ref.categoryId, subcategoryId: ref.subcategoryId }} onChange={value => patch({ chargeCats: { ...draft.chargeCats, [key]: value } })}/></div>; })}
          {draft.chargeMode === 'separate' && separated.some(key => !catFor(key).categoryId) && <p className="sb-note is-warn">Pilih kategori untuk setiap biaya yang dicatat terpisah.</p>}
          {draft.chargeMode === 'separate' && splits.length > 1 && <div className="rs-split-preview">{splits.map(line => <div className="budget-line" key={`${line.categoryId}:${line.subcategoryId}`}><span>{catName(line.categoryId)}{line.subcategoryId ? ` › ${catName(line.subcategoryId)}` : ''}</span><strong>{rupiah(line.amount)}</strong></div>)}</div>}
        </>}
      </details>

      <details className="rs-payment">
        <summary><CreditCard size={16}/> Pembayaran <span className="muted">{draft.payment ? PAYMENT_LABELS[draft.payment] : 'tidak tertulis'}</span></summary>
        <Field label="Cara bayar" hint="Hanya untuk catatan; dompet dipilih di atas."><Select value={draft.payment} onChange={e => patch({ payment: e.target.value as PaymentMethod })}><option value="">Tidak tertulis</option>{(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).filter(Boolean).map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</Select></Field>
        {read?.paid ? <div className="budget-line"><span>Dibayar</span><strong>{rupiah(read.paid)}</strong></div> : null}
        {read?.change ? <div className="budget-line"><span>Kembalian</span><strong>{rupiah(read.change)}</strong></div> : null}
        {read?.cashback ? <div className="budget-line"><span>Cashback / poin <small className="muted">(info, tidak mengurangi yang dibayar)</small></span><strong>{rupiah(read.cashback)}</strong></div> : null}
      </details>

      {draft.type === 'expense' && categoriesUsed > 1 && <div className="rs-split">
        <label className="rs-toggle"><input type="checkbox" checked={draft.bySplit} onChange={e => patch({ bySplit: e.target.checked })}/> <span><strong>Pisah per kategori</strong><small>Item di struk ini masuk ke {categoriesUsed} kategori. {separated.length ? 'Biaya yang dicatat terpisah tetap di kategorinya sendiri.' : 'Pajak, service, dan diskon dibagi sesuai besar belanjanya.'}</small></span></label>
        {draft.bySplit && !separated.length && splits.map(line => <div className="budget-line" key={`${line.categoryId}:${line.subcategoryId}`}><span>{catName(line.categoryId)}{line.subcategoryId ? ` › ${catName(line.subcategoryId)}` : ''}</span><strong>{rupiah(line.amount)}</strong></div>)}
      </div>}

      {(rawText || read?.identifiers) && <details className="rs-raw"><summary><Info size={15}/> Detail & hasil baca</summary>
        {read?.identifiers && Object.keys(read.identifiers).length > 0 && <div className="rs-ids">{Object.entries(read.identifiers).map(([k, v]) => <div className="budget-line" key={k}><span>{({ receiptNo: 'No. struk', orderNo: 'No. pesanan', cashier: 'Kasir', table: 'Meja', terminal: 'Terminal', branch: 'Cabang', station: 'SPBU', pump: 'Pompa', plate: 'Nomor kendaraan' } as Record<string, string>)[k] || k}</span><strong>{v}</strong></div>)}</div>}
        {read?.fuel && <div className="budget-line"><span>BBM</span><strong>{[read.fuel.product, read.fuel.liters ? `${read.fuel.liters.toLocaleString('id-ID')} L` : '', read.fuel.pricePerLiter ? `× ${rupiah(read.fuel.pricePerLiter)}` : ''].filter(Boolean).join(' ')}{read.fuel.matches ? ' ✓' : ''}</strong></div>}
        {read?.parking && <div className="budget-line"><span>Parkir</span><strong>{[read.parking.entry && `masuk ${read.parking.entry}`, read.parking.exit && `keluar ${read.parking.exit}`, read.parking.duration].filter(Boolean).join(' · ')}</strong></div>}
        {rawText && <><textarea className="input" rows={8} value={rawText} onChange={e => setRawText(e.target.value)} aria-label="Teks yang terbaca"/><Button type="button" variant="secondary" className="small" onClick={() => readText(rawText)}>Baca ulang dari teks ini</Button><small className="muted">Perbaiki angka yang salah baca di sini, lalu baca ulang.</small></>}
      </details>}
      {debug && result && <OcrDebug result={result}/>}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="rs-actions-row"><Button type="button" variant="secondary" className="small" onClick={toForm}>Buka di formulir</Button>{draft.type === 'expense' && <Button type="button" variant="secondary" className="small" onClick={toSplitBill}><ReceiptText size={15}/> Split Bill</Button>}</div>
      <div className="rs-actions">
        <Button type="submit" className="full">{lowOk ? 'Ya, nominal sudah benar. Simpan' : `Simpan transaksi${draft.amount ? ` · ${rupiah(draft.amount)}` : ''}`}</Button>
      </div>
    </form>}

    <Dialog open={Boolean(source)} onOpenChange={value => { if (!value) setSource(null); }}><DialogContent title={source ? `Di struk: ${source.label}` : 'Di struk'} className="mobile-sheet rs-source-dialog">
      {source && upright && mapping && <ReceiptSource upright={upright} mapping={mapping} box={source.box} label={source.label}/>}
      {source && (!upright || !mapping) && photoUrl && <img className="rs-source-plain" src={photoUrl} alt="Foto struk"/>}
    </DialogContent></Dialog>
    <Dialog open={cornersOpen} onOpenChange={setCornersOpen}><DialogContent title="Atur sudut struk" className="mobile-sheet rs-corners-dialog">
      {cornersOpen && upright && result && <ReceiptCorners upright={upright} corners={result.prepared.corners} onCancel={() => setCornersOpen(false)} onApply={corners => { setCornersOpen(false); if (photo) void scan(photo, turn, corners); }}/>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(duplicate)} onOpenChange={value => { if (!value) setDuplicate(null); }}><DialogContent title="Struk ini mirip transaksi yang sudah dicatat" className="mobile-sheet rs-dup-dialog">
      {duplicate && <div className="rs-dup">
        <p className="muted">Mirip karena {duplicate.reasons.join(', ')}.</p>
        <div className="rs-dup-card"><Copy size={18}/><div><strong>{duplicate.tx.merchant || 'Tanpa nama tempat'}</strong><small>{duplicate.tx.date.split('-').reverse().join('/')}{duplicate.tx.time ? ` · ${duplicate.tx.time}` : ''}</small></div><b>{rupiah(duplicate.tx.amount)}</b></div>
        <div className="rs-dup-actions">
          <Button type="button" variant="secondary" onClick={() => { const tx = duplicate.tx as LedgerTx; setDuplicate(null); onOpenChange(false); openTx(undefined, tx); }}>Lihat transaksi</Button>
          <Button type="button" onClick={() => { setDuplicate(null); setDupOk(true); void save(true); }}>Tetap catat</Button>
          <button type="button" className="link-button" onClick={() => setDuplicate(null)}>Batal</button>
        </div>
      </div>}
    </DialogContent></Dialog>
  </DialogContent></Dialog>;
}

/** The result of reading one part again: the values found, to use with one tap. */
function RereadPanel({ reread, onUse, onClose }: { reread: Reread; onUse: (value: number | string) => void; onClose: () => void }) {
  return <div className="rs-reread" role="status" aria-live="polite">
    {reread.busy ? <span className="muted"><ScanText size={14}/> Membaca ulang {reread.label.toLowerCase()}…</span> : <>
      {reread.values?.length ? <span className="rs-alts"><small className="muted">Terbaca ulang:</small>{reread.values.slice(0, 3).map(value => <button type="button" key={String(value)} className="sb-chip" onClick={() => onUse(value)}>{typeof value === 'number' ? rupiah(value) : value}</button>)}</span> : null}
      {reread.note && <small className="muted">{reread.note}</small>}
      <button type="button" className="rs-tool" aria-label="Tutup" onClick={onClose}><X size={14}/></button>
    </>}
  </div>;
}

/** Development view (localStorage "dompet-ajaib:ocr-debug" = "1"): the straightened image with every read row and its zone. */
function OcrDebug({ result }: { result: OcrResult }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = result.passList[0];
  useEffect(() => {
    const el = canvas.current, page = result.prepared; if (!el) return;
    const scale = Math.min(1, 520 / page.width); el.width = Math.round(page.width * scale); el.height = Math.round(page.height * scale);
    const ctx = el.getContext('2d'); if (!ctx) return;
    const full = document.createElement('canvas'); full.width = page.width; full.height = page.height;
    const fctx = full.getContext('2d'); if (!fctx) return;
    const image = fctx.createImageData(page.width, page.height); for (let i = 0; i < page.even.length; i++) { image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = page.even[i]; image.data[i * 4 + 3] = 255; }
    fctx.putImageData(image, 0, 0); ctx.drawImage(full, 0, 0, el.width, el.height); full.width = 1;
    const colors: Record<string, string> = { header: '#3b82f6', items: '#16a34a', summary: '#f59e0b', payment: '#a855f7', footer: '#6b7280' };
    for (const entry of base.read.layout || []) { const line = base.lines[entry.line]; if (!line) continue; ctx.strokeStyle = colors[entry.zone]; ctx.lineWidth = 1.5; ctx.strokeRect(line.box.x * scale, line.box.y * scale, line.box.width * scale, line.box.height * scale); }
  }, [result, base]);
  return <details className="rs-raw"><summary><Bug size={15}/> Debug OCR</summary>
    <canvas ref={canvas} style={{ width: '100%', height: 'auto' }}/>
    <small className="muted">Cara meluruskan: {result.method} ({result.cornerConfidence}) · miring {result.skew}° · {result.passList.map(p => `${p.id} ${Math.round(p.confidence)}%`).join(', ')}</small>
    <small className="muted">{JSON.stringify(result.quality.numbers)}</small>
  </details>;
}
