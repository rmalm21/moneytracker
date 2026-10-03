'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ConciergeBell, Receipt, Scale, Tag, Truck, MoreHorizontal, Bug, Camera, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardPaste, Copy, CreditCard, Crop, Eye, FileText, ImagePlus, Info, Percent, Plus, ReceiptText, RotateCw, ScanText, ShieldCheck, Trash2, X } from 'lucide-react';
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
import { buildReceiptSnapshot, receiptMoneyRows } from '@/lib/receipt-snapshot';
import type { ReceiptSnapshot } from '@/lib/types';
import { buildIntelligence, findDuplicate, mergeReceiptReads, reconcileAmounts, regionFor, STATUS_LABELS, type Duplicate, type FieldStatus } from '@/lib/receipt-intel';
import { analyzeReceiptPhoto, cancelReceiptRead, ocrAvailable, readReceiptPhoto, rereadField, type OcrProgress, type OcrResult } from '@/lib/receipt-ocr';
import { quadTarget, straightenedPreview, uprightPreview, type Prepared, type Straightened } from '@/lib/receipt-prep';
import { geminiConfigured, geminiReady, geminiWanted, mergeGemini, readWithGemini, setGeminiWanted, type GeminiReceipt } from '@/lib/gemini-receipt';
import type { Matrix, Quad } from '@/lib/receipt-image';
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
type Item = { key: string; name: string; qty: number; price: number; discount: number; modifiers: string[]; /** Notes whose owner is not certain: asked once, "Catatan untuk item ini?". */ unsure?: string[]; variant?: string; variantUnsure?: boolean; sku?: string; /** The crossed-out price on an order screen (information only). */ originalPrice?: number; addOnOf?: string; categoryId: string; subcategoryId: string; /** Its index in the reading (for its evidence). */ source?: number };
type CatRef = { categoryId: string; subcategoryId: string | null };
type Draft = {
  type: 'expense' | 'income'; amount: number; date: string; time: string; merchant: string; description: string; walletId: string; categoryId: string; subcategoryId: string; notes: string; items: Item[]; bySplit: boolean; payment: PaymentMethod;
  /** Printed subtotal (when there are no items), charges as read (discount positive), which are counted, and how they are recorded. */
  subtotal: number; ch: Record<ChargeKey, number>; inc: Record<ChargeKey, boolean>; chargeMode: 'spread' | 'separate'; chargeCats: Partial<Record<ChargeKey, CatRef>>;
};
type Reread = { field: string; label: string; busy: boolean; values: (number | string)[] | null; note?: string };

/** A receipt handed to Split Bill (same page, so the photo can go along without being stored anywhere). */
let handoff: { receipt: ReceiptSnapshot; photo: Blob | null } | null = null;
export function takeReceiptHandoff() { const value = handoff; if (value) setTimeout(() => { if (handoff === value) handoff = null; }, 2000); return value; }

const key = () => Math.random().toString(36).slice(2, 9);
const CHARGE_SHORT: Record<ChargeKey, string> = { discount: 'Diskon', tax: 'Pajak / PB1', service: 'Service', delivery: 'Ongkir', fee: 'Biaya lain', rounding: 'Pembulatan' };
const CHARGE_HINT: Partial<Record<ChargeKey, string>> = { discount: 'potongan, promo, voucher', tax: 'PPN, PBJT', fee: 'admin, kemasan, tip' };
/** The same icons and colours as Split Bill's "Tambahan & diskon". */
const CHARGE_LOOKS: Record<ChargeKey, [typeof Percent, string]> = { discount: [Tag, 'discount'], tax: [Percent, 'tax'], service: [ConciergeBell, 'service'], delivery: [Truck, 'delivery'], fee: [Receipt, 'admin'], rounding: [Scale, 'rounding'] };
const PERCENTS: Partial<Record<ChargeKey, number[]>> = { tax: [10, 11], service: [5, 10], discount: [5, 10, 15] };
const STAGES: [OcrProgress['stage'][], string][] = [[['prepare'], 'Menyiapkan foto'], [['straighten'], 'Meluruskan struk'], [['load', 'read', 'second'], 'Membaca tulisan'], [['parse'], 'Mengenali rincian'], [['check', 'done'], 'Memeriksa total']];
const TYPE_LABELS: Record<string, string> = { restaurant: 'Restoran', cafe: 'Kafe', minimarket: 'Minimarket', supermarket: 'Supermarket', retail: 'Toko', pharmacy: 'Apotek', fuel: 'SPBU / BBM', parking: 'Parkir', food_delivery: 'Pesan antar makanan', marketplace: 'Belanja online', travel: 'Perjalanan', generic: 'Umum', unknown: 'Belum dikenali' };
const DEBUG_KEY = 'dompet-ajaib:ocr-debug';

/** A small mark next to a value the user should look at; nothing for values that are fine. */
function Status({ status, compact = false }: { status: FieldStatus; compact?: boolean }) {
  if (status !== 'check' && status !== 'missing') return null;
  if (compact) return <span className={`rs-status-dot is-${status}`} title={STATUS_LABELS[status]} aria-label={STATUS_LABELS[status]}>{status === 'check' ? <AlertTriangle size={12}/> : <Info size={12}/>}</span>;
  return <span className={`rs-status is-${status}`}>{status === 'check' ? <AlertTriangle size={12}/> : <Info size={12}/>}{STATUS_LABELS[status]}</span>;
}

/**
 * `context`: where the checked receipt goes. "transaction" (Scan struk) ends in "Simpan transaksi"; "split_bill" ends in
 * "Gunakan di Split Bill" and only hands the corrected, structured receipt to `onUse` — it never saves a transaction.
 * The reading, the review and every correction tool are the same in both.
 */
export function ReceiptScan({ open, onOpenChange, startType = 'expense', background, openTx, navigate, context = 'transaction', onUse }: { open: boolean; onOpenChange: (open: boolean) => void; startType?: 'expense' | 'income'; background?: Background; openTx?: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void; navigate?: (key: string, target?: string) => void; context?: 'transaction' | 'split_bill'; onUse?: (receipt: ReceiptSnapshot, photo: Blob | null) => void }) {
  const split = context === 'split_bill';
  const { data, user, profile } = useApp();
  const today = todayInTimeZone(profile?.timeZone);
  const [photo, setPhoto] = useState<Blob | null>(null), [photoUrl, setPhotoUrl] = useState(''), [turn, setTurn] = useState(0), [upright, setUpright] = useState<Upright | null>(null);
  // The receipt as read: cut to the chosen area and straightened. Shown everywhere after the area is set; the whole
  // photo only comes back when the area is changed (Atur sudut).
  const [cropped, setCropped] = useState<Straightened | null>(null), cropJob = useRef(0);
  const showCrop = (make: Promise<Straightened> | null) => { const id = ++cropJob.current; if (!make) { setCropped(current => { if (current) URL.revokeObjectURL(current.url); return null; }); return; } void make.then(next => { if (cropJob.current !== id) { URL.revokeObjectURL(next.url); return; } setCropped(current => { if (current) URL.revokeObjectURL(current.url); return next; }); }).catch(() => undefined); };
  const [progress, setProgress] = useState<OcrProgress | null>(null), [problem, setProblem] = useState(''), [pasteOpen, setPasteOpen] = useState(false), [pasted, setPasted] = useState('');
  const [useGemini, setUseGemini] = useState(() => geminiWanted()), [read, setRead] = useState<ReceiptRead | null>(null), [rawText, setRawText] = useState(''), [ocrMeta, setOcrMeta] = useState(''), [draft, setDraft] = useState<Draft | null>(null), [why, setWhy] = useState<{ category?: string; wallet?: string }>({}), [error, setError] = useState(''), [lowOk, setLowOk] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null), [area, setArea] = useState<{ prepared: Prepared; quarter: number } | null>(null), [cameraOpen, setCameraOpen] = useState(false);
  const [source, setSource] = useState<{ label: string; box: Box | null; origin: string } | null>(null), [cornersOpen, setCornersOpen] = useState(false), [reread, setReread] = useState<Reread | null>(null);
  const [settledFields, setSettledFields] = useState<string[]>([]), [duplicate, setDuplicate] = useState<Duplicate | null>(null), [dupOk, setDupOk] = useState(false), [parts, setParts] = useState(1), [debug, setDebug] = useState(false);
  const job = useRef(0), captureInput = useRef<HTMLInputElement>(null), moreInput = useRef<HTMLInputElement>(null);
  const [shownKeys, setShownKeys] = useState<ChargeKey[]>([]), [bigPhoto, setBigPhoto] = useState(false), [openItem, setOpenItem] = useState<string | null>(null);
  const [openCharge, setOpenCharge] = useState<ChargeKey | ''>(''), [addingCharge, setAddingCharge] = useState(false);
  const [editMoney, setEditMoney] = useState(false), [allItems, setAllItems] = useState(false), [rawOpen, setRawOpen] = useState(false), moreMenu = useRef<HTMLDetailsElement>(null);
  const payWallets = data.wallets.filter(w => walletAllows(w, 'pay'));
  const inWallets = data.wallets.filter(w => !w.isArchived);
  const knownMerchants = useMemo(() => [...new Set(data.transactions.slice(-500).map(t => t.merchant?.trim()).filter(Boolean))], [data.transactions]);

  function reset() {
    job.current++; if (photoUrl) URL.revokeObjectURL(photoUrl); if (upright) URL.revokeObjectURL(upright.url);
    showCrop(null); setPhoto(null); setPhotoUrl(''); setUpright(null); setTurn(0); setProgress(null); setProblem(''); setPasteOpen(false); setPasted(''); setRead(null); setRawText(''); setOcrMeta(''); setDraft(null); setWhy({}); setError(''); setShownKeys([]);
    // The working images are released with the result (memory on phones).
    setResult(null); setArea(null); setCameraOpen(false); setSource(null); setCornersOpen(false); setReread(null); setSettledFields([]); setDuplicate(null); setDupOk(false); setParts(1);
    setEditMoney(false); setAllItems(false); setRawOpen(false); setOpenCharge(''); setAddingCharge(false);
  }
  useEffect(() => { if (!open) { cancelIfBusy(); reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // The receipt reader's models start loading while the photo is being taken or the area set.
  useEffect(() => { if (open && ocrAvailable()) void import('@/lib/ocr-paddle').then(m => m.warmPaddle()).catch(() => undefined); }, [open]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => { try { setDebug(localStorage.getItem(DEBUG_KEY) === '1'); } catch { /* optional */ } }, []);

  const intel = useMemo(() => read ? buildIntelligence(read, { votes: parts > 1 ? undefined : result?.votes, boxes: field => parts > 1 && !['merchant', 'date', 'time'].includes(field) ? null : result?.fieldBoxes[field] || null, itemBox: index => result?.itemBoxes[index] || null, knownMerchants, passIds: result?.passList.map(p => p.id) }) : null, [read, result, knownMerchants, parts]);

  function build(next: ReceiptRead, type: 'expense' | 'income' = draft?.type || startType) {
    const guess = receiptToTransaction(next, { categories: data.categories, history: data.transactions, wallets: type === 'expense' ? payWallets : inWallets, today, defaultWalletId: type === 'expense' ? profile?.defaultExpenseWalletId : profile?.defaultIncomeWalletId }, type);
    const merchant = buildIntelligence(next, { knownMerchants }).merchant.value || guess.merchant;
    setRead(next);
    setWhy({ category: guess.why, wallet: guess.walletWhy });
    const counted = checkReceipt(next).included;
    setDraft({ subtotal: next.subtotal, ch: { discount: next.discount, tax: next.tax, service: next.service, delivery: next.delivery, fee: next.fee || 0, rounding: next.rounding }, inc: Object.fromEntries(CHARGE_ORDER.map(k => [k, !counted.includes(k)])) as Record<ChargeKey, boolean>, chargeMode: 'spread', chargeCats: {}, type, amount: guess.amount, date: guess.date, time: guess.time, merchant, description: guess.description, walletId: guess.walletId, categoryId: guess.categoryId || (type === 'income' ? profile?.salaryIncomeCategoryId || '' : ''), subcategoryId: guess.subcategoryId || '', notes: '', payment: next.payment, items: guess.items.map((item, i) => ({ key: key(), name: item.name, qty: item.qty, price: item.price, discount: item.discount || 0, modifiers: item.modifiers || [], ...(item.modifiersUnsure?.length ? { unsure: item.modifiersUnsure } : {}), ...(item.variant ? { variant: item.variant, ...(item.variantUnsure ? { variantUnsure: true } : {}) } : {}), ...(item.sku ? { sku: item.sku } : {}), ...(item.originalPrice ? { originalPrice: item.originalPrice } : {}), ...(item.addOnOf ? { addOnOf: item.addOnOf } : {}), categoryId: item.categoryId || '', subcategoryId: item.subcategoryId || '', source: i })), bySplit: guess.splits.length > 1 });
    setError(''); setLowOk(false); setSettledFields([]); setDupOk(false);
  }
  function cancelIfBusy() { if (progress) cancelReceiptRead(); }
  async function showUpright(source: Blob, quarter: number) {
    try { const next = await uprightPreview(source, quarter); setUpright(current => { if (current) URL.revokeObjectURL(current.url); return next; }); return true; } catch { /* the plain photo is still shown */ return false; }
  }
  async function scan(source: Blob, quarter = 0, corners?: Quad, prepared?: Prepared) {
    const id = ++job.current;
    setProblem(''); setDraft(null); setRead(null); setResult(null); setArea(null); setSource(null); setReread(null); setParts(1);
    setProgress({ stage: 'prepare', progress: 0, label: 'Menyiapkan foto…' });
    // While reading, the chosen area already shows cut and straightened.
    const target = upright && quarter === turn ? prepared || (corners ? quadTarget(corners, upright.width, upright.height) : null) : null;
    const cut = target && upright ? straightenedPreview(upright.url, target) : null;
    showCrop(cut);
    // Gemini (when on) reads the same cut at the same time as the on-device reader; only the cut is sent.
    let gemini: Promise<GeminiReceipt | null> | null = geminiReady() && cut ? cut.then(image => readWithGemini(image.blob)).catch(() => null) : null;
    try {
      let next;
      try { next = await readReceiptPhoto(source, value => { if (job.current === id) setProgress(value); }, { turn: quarter, corners, prepared }); }
      catch (error) {
        // The on-device reader failed: Gemini's reading alone is still used when it has something.
        const alone = gemini ? await gemini : null;
        if (job.current !== id) return;
        if (alone && (alone.items?.length || alone.total)) { setResult(null); setRawText(''); setOcrMeta('Dibaca oleh Gemini'); build(mergeGemini(readReceiptText(''), alone)); return; }
        throw error;
      }
      // A newer scan started (or this one was cancelled): this result is thrown away.
      if (job.current !== id) return;
      if (!gemini && geminiReady() && upright && quarter === turn) gemini = straightenedPreview(upright.url, next.prepared).then(image => readWithGemini(image.blob)).catch(() => null);
      if (gemini) setProgress({ stage: 'check', progress: .9, label: 'Dibantu Gemini…' });
      const helped = gemini ? await gemini : null;
      if (job.current !== id) return;
      setResult(next);
      setRawText(next.text.trim());
      setOcrMeta(`Dibaca ${next.passes}× dalam ${(next.ms / 1000).toFixed(1)} detik${next.method === 'perspective' ? ' · diluruskan' : ''}${helped ? ' · dibantu Gemini' : gemini ? ' · Gemini tidak tersedia, dibaca di perangkat' : ''}`);
      if (helped) next = { ...next, read: mergeGemini(next.read, helped) };
      if (!next.read.items.length && !next.check.total) setProblem(next.quality.blur === 'poor' ? 'Foto terlalu buram untuk dibaca. Ambil ulang dengan kamera diam, atau isi sendiri di bawah.' : next.method === 'none' ? 'Struk tidak ditemukan di foto. Coba foto lebih dekat, atau isi sendiri di bawah.' : 'Tulisan di foto belum terbaca jelas. Coba foto lebih dekat dan terang, atau isi sendiri di bawah.');
      build(next.read);
    } catch (e) { if (job.current === id) setProblem((e as Error).message || 'Foto belum bisa dibaca.'); }
    finally { if (job.current === id) setProgress(null); }
  }
  /**
   * A new photo: its quality is checked and the receipt's edges are found (quick), then the person sets the area to
   * read before anything is read. Without a preview (rare) the photo is read straight away.
   */
  async function pick(file: Blob | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setProblem('Pilih file gambar (JPG, PNG, atau WebP).'); return; }
    if (file.size > 25 * 1024 * 1024) { setProblem('Foto terlalu besar (lebih dari 25 MB).'); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(file); setPhotoUrl(URL.createObjectURL(file)); setTurn(0); setArea(null);
    if (!ocrAvailable()) { void showUpright(file, 0); setProblem('Perangkat ini belum bisa membaca foto. Tempel teks struknya, atau isi sendiri.'); return; }
    await prepareArea(file, 0);
  }
  async function prepareArea(file: Blob, quarter: number) {
    const id = ++job.current;
    setProblem(''); setProgress({ stage: 'prepare', progress: .02, label: 'Mencari tepi struk…' });
    try {
      const [prepared, shown] = await Promise.all([analyzeReceiptPhoto(file, quarter), showUpright(file, quarter)]);
      if (job.current !== id) return;
      setProgress(null);
      // A screenshot has no paper edges to set: it is read straight away.
      if (shown && !prepared.digital) setArea({ prepared, quarter }); else void scan(file, quarter, undefined, prepared);
    } catch (e) { if (job.current === id) { setProgress(null); setProblem((e as Error).message || 'Foto belum bisa dibaca.'); } }
  }
  function rotateArea() { if (!photo || !area) return; const next = (area.quarter + 1) % 4; setTurn(next); setArea(null); void prepareArea(photo, next); }
  function retake() { reset(); if (liveCameraAvailable()) setCameraOpen(true); else captureInput.current?.click(); }
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
  const chargeKeys = draft ? CHARGE_ORDER.filter(key => draft.ch[key] || shownKeys.includes(key)) : [];
  const addableCharges = CHARGE_ORDER.filter(key => !chargeKeys.includes(key));
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
  // Once read (and again when the photo is turned): the cut exactly as it was read.
  useEffect(() => { if (result && upright) showCrop(straightenedPreview(upright.url, result.prepared)); }, [result, upright?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  // The cut image is the read image itself, only smaller: a plain scale maps what was read onto it.
  const flatMapping = result && cropped ? { toPhoto: [cropped.width / result.prepared.width, 0, 0, 0, cropped.height / result.prepared.height, 0, 0, 0, 1] as Matrix, photoWidth: cropped.width, photoHeight: cropped.height } : null;
  const boxFor = (field: string): Box | null => {
    if (!intel) return null;
    if (field.startsWith('item:')) { const item = draft?.items.find(i => i.key === field.slice(5)); return item?.source !== undefined ? intel.items[item.source]?.amount.evidence.box || null : null; }
    const f = field === 'total' ? intel.grandTotal : field === 'date' ? intel.date : field === 'time' ? intel.time : field === 'merchant' ? intel.merchant : field === 'payment' ? intel.payment : field === 'subtotal' ? intel.subtotal : intel.charges[field as keyof typeof intel.charges];
    return f?.evidence.box || null;
  };
  const canShow = (field: string) => Boolean(mapping && boxFor(field));
  /** Where a value came from: read as printed, worked out from other values, or changed by the person. */
  function originOf(field: string): string {
    if (!draft || !read) return '';
    if (field.startsWith('item:')) {
      const item = draft.items.find(i => i.key === field.slice(5)), printed = item?.source !== undefined ? read.items[item.source] : undefined;
      if (!item || !printed) return 'Ditambah manual';
      if (printed.name !== item.name || printed.price !== item.price || printed.qty !== item.qty) return `Diedit manual · di struk: ${printed.name} ${printed.qty > 1 ? `${printed.qty} × ` : ''}${rupiah(printed.price)}`;
      return printed.qty > 1 && printed.unitPrinted === false ? 'Terbaca dari struk · harga satuan dihitung dari total baris ÷ jumlah' : 'Terbaca langsung dari struk';
    }
    if (field === 'total') {
      const check = result?.check;
      if (check && draft.amount !== check.total) return `Diedit manual · di struk: ${rupiah(check.total)}`;
      if (check && (check.source === 'computed' || check.source === 'items')) return 'Dihitung dari item dan biaya (total tidak terbaca jelas)';
      if (result?.votes.resolved.includes('total')) return 'Dipilih dari beberapa bacaan karena membuat struk cocok';
      return 'Terbaca langsung dari struk';
    }
    const was = field === 'merchant' ? read.merchant : field === 'date' ? read.date : field === 'time' ? read.time : field === 'payment' ? read.payment : undefined;
    const now = field === 'merchant' ? draft.merchant : field === 'date' ? draft.date : field === 'time' ? draft.time : field === 'payment' ? draft.payment : undefined;
    if (was !== undefined && was !== now) return 'Diedit manual';
    return 'Terbaca langsung dari struk';
  }
  function show(field: string, label: string) { setSource({ label, box: boxFor(field), origin: originOf(field) }); }
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

  /** What the receipt said, kept with the transaction (not written into its notes). */
  function snapshot(always = false) {
    if (!draft || !always && !(draft.items.length || read?.total || read?.items.length)) return undefined;
    return buildReceiptSnapshot({ read, merchant: draft.merchant, date: draft.date, time: draft.time, payment: draft.payment, total: draft.amount, items: draft.items, subtotal: draft.subtotal, charges: draft.ch, counted: draft.inc, reconciled: live ? live.state === 'RECONCILED' : undefined });
  }
  function toTx() {
    if (!draft) return null;
    const useSplit = draft.type === 'expense' && splits.length > 1;
    const receipt = snapshot();
    // Notes stay the person's own words; items, charges, payment and the receipt number live in `receipt`.
    return newTx({ type: draft.type, amount: draft.amount, date: draft.date, time: draft.time, walletId: draft.walletId, categoryId: useSplit ? null : draft.categoryId || null, subcategoryId: useSplit ? null : draft.subcategoryId || null, merchant: draft.merchant.trim(), description: draft.description.trim(), notes: draft.notes.trim(), tags: ['struk'], splits: useSplit ? splits : [], origin: 'scan', ...(receipt ? { receipt } : {}) });
  }
  async function save(force = false) {
    if (split) { useForSplit(); return; }
    if (!user || !draft || !background) return;
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
  function toForm() { const tx = toTx(); if (!tx) return; const { id: _id, ...preset } = tx; onOpenChange(false); openTx?.(preset); }
  /** The corrected receipt, as structure, to Split Bill (from Scan struk's ⋯ menu). */
  function toSplitBill() {
    const receipt = snapshot(true); if (!receipt) return;
    handoff = { receipt, photo: cropped?.blob || photo };
    onOpenChange(false); navigate?.('splitbill', 'receipt-draft');
  }
  /** Split Bill: hand the checked receipt over; doubts still open are shown once more before it is used. */
  const [useAnyway, setUseAnyway] = useState(false);
  function useForSplit() {
    const receipt = snapshot(true); if (!receipt || !onUse) return;
    if (!receipt.items.length && !receipt.total) { setError('Belum ada item atau total. Tambahkan item atau isi nominalnya.'); return; }
    if (issues.length && !useAnyway) { setUseAnyway(true); setError(`${issues.length} bagian masih perlu dicek. Periksa dulu, atau tekan sekali lagi untuk tetap memakai.`); return; }
    onUse(receipt, cropped?.blob || photo); onOpenChange(false);
  }

  const busy = Boolean(progress);
  const wallets = draft?.type === 'income' ? inWallets : payWallets;
  const stageIndex = progress ? STAGES.findIndex(([stages]) => stages.includes(progress.stage)) : -1;
  const quality = result?.quality || area?.prepared.quality;
  const itemStatus = (item: Item) => item.unsure?.length || item.variantUnsure ? 'check' : item.source !== undefined && !settledFields.includes(`item:${item.source}`) ? intel?.items[item.source]?.amount.status || 'likely' : 'likely';
  const totalStatus = statusOf('total', intel?.grandTotal.status);
  const dateStatus = read?.items.length || read?.total ? statusOf('date', intel?.date.status) : 'likely';
  // The same rows the saved "Rincian struk" will show.
  const moneyRows = draft ? receiptMoneyRows(buildReceiptSnapshot({ read, merchant: draft.merchant, date: draft.date, time: draft.time, payment: draft.payment, total: draft.amount, items: draft.items, subtotal: draft.subtotal, charges: draft.ch, counted: draft.inc })) : [];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Scan struk" className="receipt-scan-dialog">
    {cameraOpen && <ReceiptCamera onCapture={blob => { setCameraOpen(false); void pick(blob); }} onFallback={() => { setCameraOpen(false); captureInput.current?.click(); }} onClose={() => setCameraOpen(false)}/>}
    <input ref={captureInput} type="file" accept="image/*" capture="environment" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    <input ref={moreInput} type="file" accept="image/*" hidden onChange={e => { void addMore(e.target.files?.[0]); e.target.value = ''; }}/>

    {!draft && !busy && !area && <div className="rs-start">
      <div className="rs-hero"><span className="rs-hero-icon" aria-hidden="true"><ScanText size={26}/></span><div><strong>Foto struk atau nota</strong><small>Nominal, tanggal, tempat, item, pajak, dan cara bayar dibaca otomatis. Kamu cukup memeriksa bagian yang ditandai.</small></div></div>
      <div className="rs-pick">
        <button type="button" className="rs-pick-button is-main" onClick={() => liveCameraAvailable() ? setCameraOpen(true) : captureInput.current?.click()}><Camera size={22}/><span>Ambil foto</span></button>
        <label className="rs-pick-button"><ImagePlus size={22}/><span>Pilih dari galeri</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <button type="button" className="rs-pick-button" onClick={() => setPasteOpen(value => !value)}><ClipboardPaste size={22}/><span>Tempel teks struk</span></button>
      </div>
      {pasteOpen && <div className="sb-paste"><textarea className="input" rows={6} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'Nasi Goreng 35.000\nEs Teh 2 x 6.000 12.000\nPB1 4.700\nTotal 51.700'}/><Button type="button" className="small" disabled={!pasted.trim()} onClick={() => readText(pasted)}>Baca teks</Button></div>}
      {!ocrAvailable() && <p className="sb-note is-warn">Perangkat ini belum bisa membaca foto. Tempel teks struknya, atau isi sendiri.</p>}
      {problem && <p className="sb-note is-warn" role="status">{problem}</p>}
      {geminiConfigured() && <label className="rs-gemini"><input type="checkbox" checked={useGemini} onChange={e => { setUseGemini(e.target.checked); setGeminiWanted(e.target.checked); }}/><span><b>Bantu baca dengan Gemini</b><small>{useGemini ? 'Potongan struk dikirim ke Google Gemini hanya untuk dibaca, tidak disimpan di akunmu. Tanpa internet, dibaca di perangkat.' : 'Mati: struk hanya dibaca di perangkat ini.'}</small></span></label>}
      <p className="rs-privacy"><ShieldCheck size={15}/> {geminiConfigured() && useGemini ? 'Foto utuh tetap di perangkat; hanya potongan struk yang dikirim ke Gemini. Pemakaian pertama mengunduh pembaca struk (±5 MB) sekali saja.' : 'Foto dibaca di perangkat ini dan tidak diunggah ke mana pun. Pemakaian pertama mengunduh pembaca struk (±5 MB) sekali saja.'}</p>
      <button type="button" className="link-button" onClick={manual}>Isi sendiri tanpa foto →</button>
    </div>}

    {area && !busy && upright && <section className="rs-area" aria-label="Area struk">
      <div className="rs-area-head"><strong>Tentukan area struk</strong><small>Hanya bagian di dalam garis yang dibaca.</small></div>
      {area.prepared.quality.warnings[0] && <p className="sb-note is-warn" role="status"><AlertTriangle size={15}/> {area.prepared.quality.warnings[0]}</p>}
      <ReceiptCorners key={upright.url} upright={upright} corners={area.prepared.corners} applyLabel="Baca struk" fitVh={40} onRetake={retake} onRotate={rotateArea} onCancel={retake}
        onApply={(corners, changed) => { const { prepared, quarter } = area; setArea(null); if (photo) void scan(photo, quarter, changed ? corners : undefined, changed ? undefined : prepared); }}/>
    </section>}

    {busy && progress && <div className="rs-reading" role="status" aria-live="polite">
      {photoUrl && <img src={cropped?.url || upright?.url || photoUrl} alt="Foto struk" style={upright || cropped ? undefined : { transform: `rotate(${turn * 90}deg)` }}/>}
      <div className="rs-scanline" aria-hidden="true"/>
      <strong>{progress.label}</strong>
      <ol className="rs-steps">{STAGES.map(([, label], i) => <li key={label} className={i < stageIndex ? 'is-done' : i === stageIndex ? 'is-now' : ''}>{i < stageIndex ? <Check size={13}/> : <span/>}{label}</li>)}</ol>
      {(progress.stage === 'read' || progress.stage === 'second') && <div className="rs-bar"><i style={{ width: `${Math.round(progress.progress * 100)}%` }}/></div>}
      <small className="muted">Tetap buka layar ini</small>
      <button type="button" className="link-button" onClick={() => { cancelReceiptRead(); job.current++; setProgress(null); setProblem('Pembacaan dibatalkan.'); }}>Batal</button>
    </div>}

    {draft && !busy && <form className="form-stack rs-review" onSubmit={event => { event.preventDefault(); void save(); }}>
      {/* 1. What the receipt is, at a glance: place, date and payment, the total, the items, and whether it adds up. */}
      <section className="rs-top">
        <div className="rs-top-row">
          <div className="rs-top-text">
            <strong className="rs-merchant">{draft.merchant || (draft.type === 'income' ? 'Pemasukan dari struk' : 'Tempat belum terbaca')}</strong>
            <small>{[draft.date && new Date(`${draft.date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }), draft.time, draft.payment ? PAYMENT_LABELS[draft.payment] : ''].filter(Boolean).join(' · ')}</small>
          </div>
          {photoUrl && <button type="button" className="rs-top-thumb" onClick={() => mapping ? setSource({ label: 'Seluruh struk', box: null, origin: '' }) : setBigPhoto(v => !v)} aria-label="Lihat foto struk"><img src={cropped?.url || upright?.url || photoUrl} alt=""/></button>}
          <details className="rs-kebab" ref={moreMenu}>
            <summary aria-label="Lainnya"><MoreHorizontal size={18}/></summary>
            <div className="rs-kebab-menu" role="menu" onClick={() => moreMenu.current?.removeAttribute('open')}>
              {photoUrl && upright && result && <button type="button" role="menuitem" onClick={() => setCornersOpen(true)}><Crop size={15}/> Atur sudut</button>}
              {photoUrl && <button type="button" role="menuitem" onClick={rotate}><RotateCw size={15}/> Putar foto</button>}
              {photo && <button type="button" role="menuitem" onClick={() => void scan(photo, turn)}><ScanText size={15}/> Baca ulang struk</button>}
              {photoUrl && <button type="button" role="menuitem" onClick={() => moreInput.current?.click()}><Plus size={15}/> Foto lanjutan</button>}
              {photoUrl && <button type="button" role="menuitem" onClick={reset}><Camera size={15}/> Ganti foto</button>}
              {!split && <button type="button" role="menuitem" onClick={toForm}><FileText size={15}/> Buka di formulir</button>}
              {!split && draft.type === 'expense' && navigate && <button type="button" role="menuitem" onClick={toSplitBill}><ReceiptText size={15}/> Split Bill</button>}
              {!split && <button type="button" role="menuitem" onClick={() => read && build(read, draft.type === 'expense' ? 'income' : 'expense')}><ArrowLeftRight size={15}/> Jadikan {draft.type === 'expense' ? 'pemasukan' : 'pengeluaran'}</button>}
              {(rawText || read?.identifiers) && <button type="button" role="menuitem" onClick={() => setRawOpen(v => !v)}><Info size={15}/> Teks hasil baca</button>}
            </div>
          </details>
        </div>
        <div className={`rs-grand ${totalStatus === 'check' ? 'is-check' : ''}`}><b>{rupiah(draft.amount)}</b>{canShow('total') && <button type="button" className="rs-tool" onClick={() => show('total', 'Total')} aria-label="Lihat total di struk" title="Lihat di struk"><Eye size={15}/></button>}</div>
        <small className="rs-count">{[draft.type === 'income' ? 'Pemasukan' : '', draft.items.length ? `${draft.items.length} item` : '', parts > 1 ? `${parts} foto` : ''].filter(Boolean).join(' · ')}</small>
        {intel && (read?.items.length || read?.total) ? (issues.length ? <p className="rs-state is-warn"><AlertTriangle size={14}/> {issues.length} bagian perlu dicek</p>
          : live && <p className={`rs-state is-${live.state === 'RECONCILED' ? 'ok' : live.state === 'INSUFFICIENT_DATA' ? 'info' : 'warn'}`}>{live.state === 'RECONCILED' ? <Check size={14}/> : live.state === 'INSUFFICIENT_DATA' ? <Info size={14}/> : <AlertTriangle size={14}/>} {live.state === 'RECONCILED' ? 'Total cocok dengan rincian' : live.message}</p>) : null}
      </section>
      {photoUrl && bigPhoto && <div className="rs-photo is-big"><button type="button" className="rs-thumb" aria-label="Perkecil foto" onClick={() => setBigPhoto(false)}><img src={cropped?.url || upright?.url || photoUrl} alt="Foto struk" style={upright || cropped ? undefined : { transform: `rotate(${turn * 90}deg)` }}/></button></div>}

      {/* 2. Only what needs a look, right after the summary. */}
      {issues.length > 0 && <section className="rs-todo" aria-label="Perlu dicek">
        <h4>Perlu dicek</h4>
        {issues.slice(0, 6).map(issue => { const item = issue.field.startsWith('item:') ? draft.items.find(i => i.source === Number(issue.field.slice(5))) : null, field = item ? `item:${item.key}` : issue.field, alts = (issue.alternatives as (number | string)[] | undefined) || []; return <div className="rs-todo-item" key={issue.field}>
          <div className="rs-todo-text"><b>{issue.label}</b><span>{issue.message}</span></div>
          <div className="rs-todo-actions">
            {alts.slice(0, 2).map(value => <button type="button" key={String(value)} className="rs-pill is-primary" onClick={() => { useValue(field, value); settle(issue.field); }}>Gunakan {typeof value === 'number' ? rupiah(value) : value}</button>)}
            {result && canShow(field) && <button type="button" className="rs-pill" onClick={() => void readAgain(field, issue.label)}><ScanText size={13}/> Baca ulang</button>}
            {canShow(field) && <button type="button" className="rs-pill is-icon" aria-label={`Lihat ${issue.label} di struk`} onClick={() => show(field, issue.label)}><Eye size={13}/></button>}
            <button type="button" className="rs-pill is-quiet" onClick={() => settle(issue.field)}><Check size={13}/> Sudah benar</button>
          </div>
          {reread?.field === field && <RereadPanel reread={reread} onUse={value => useValue(field, value)} onClose={() => setReread(null)}/>}
        </div>; })}
      </section>}
      {problem && <p className="sb-note is-warn" role="status">{problem}</p>}
      {quality && quality.warnings.length > 0 && !issues.length && <p className="rs-quality"><Info size={14}/> {quality.warnings[0]}</p>}
      {result && !result.prepared.digital && (result.cornerConfidence === 'low' || result.method === 'rotate' || result.method === 'none') && upright && <button type="button" className="rs-corner-hint" onClick={() => setCornersOpen(true)}><Crop size={15}/> Batas struk kurang jelas. Atur sudut <ChevronRight size={15}/></button>}

      {/* 3. The transaction: label beside value, edited in place. */}
      <div className="rs-sheet">
        <div className={`rs-line ${totalStatus === 'check' ? 'is-check' : ''}`}><span className="rs-line-label">Nominal <Status status={totalStatus} compact/></span><div className="rs-line-control"><Money value={draft.amount} onChange={amount => { patch({ amount }); settle('total'); }} required/></div></div>
        {reread?.field === 'total' && <RereadPanel reread={reread} onUse={value => useValue('total', value)} onClose={() => setReread(null)}/>}
        {alternatives.length > 0 && totalStatus !== 'verified' && !issues.some(i => i.field === 'total') && <div className="rs-alts"><small className="muted">Nominal lain:</small>{alternatives.slice(0, 3).map(([label, value]) => <button type="button" key={`${label}${value}`} className="sb-chip" onClick={() => { patch({ amount: value }); settle('total'); }}>{rupiah(value)} <small>{label}</small></button>)}</div>}
        <div className={`rs-line ${dateStatus === 'check' ? 'is-check' : ''}`}><span className="rs-line-label">Tanggal <Status status={dateStatus} compact/></span><div className="rs-line-control rs-when"><Input type="date" required value={draft.date} max={today} onChange={e => { patch({ date: e.target.value }); settle('date'); }}/><Input type="time" aria-label="Jam" value={draft.time} onChange={e => patch({ time: e.target.value })}/></div></div>
        {reread?.field === 'date' && <RereadPanel reread={reread} onUse={value => useValue('date', value)} onClose={() => setReread(null)}/>}
        {(intel?.date.alternatives.length || 0) > 0 && !settledFields.includes('date') && !issues.some(i => i.field === 'date') && <div className="rs-alts"><small className="muted">Tanggal lain:</small>{intel!.date.alternatives.filter(d => d <= today).map(d => <button type="button" key={d} className="sb-chip" onClick={() => { patch({ date: d }); settle('date'); }}>{d.split('-').reverse().join('/')}</button>)}</div>}
        <div className="rs-line"><span className="rs-line-label">{draft.type === 'income' ? 'Dari' : 'Tempat'}</span><div className="rs-line-control"><Input value={draft.merchant} maxLength={80} onChange={e => patch({ merchant: e.target.value })} placeholder="Nama toko atau tempat"/>{intel?.merchant.raw && intel.merchant.raw !== draft.merchant && <small>Terbaca “{intel.merchant.raw}”</small>}</div></div>
        {!split && <>
        <div className="rs-line"><span className="rs-line-label">{draft.type === 'income' ? 'Masuk ke' : 'Dompet'}</span><div className="rs-line-control"><Select required value={draft.walletId} onChange={e => patch({ walletId: e.target.value })}><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></div></div>
        {!(draft.type === 'expense' && draft.bySplit && purchase.length > 1) && <div className="rs-line"><span className="rs-line-label">Kategori</span><div className="rs-line-control"><CategoryAccordion type={draft.type} compact value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId || null }} onChange={value => patch({ categoryId: value.categoryId, subcategoryId: value.subcategoryId || '' })}/></div></div>}
        <div className="rs-line"><span className="rs-line-label">Keterangan</span><div className="rs-line-control"><Input value={draft.description} maxLength={120} onChange={e => patch({ description: e.target.value })} placeholder="Opsional"/></div></div>
        <div className="rs-line"><span className="rs-line-label">Catatan</span><div className="rs-line-control"><Input value={draft.notes} maxLength={300} onChange={e => patch({ notes: e.target.value })} placeholder="Opsional"/></div></div>
        </>}
      </div>

      {/* 4. Items: plain rows; only an uncertain one stands out. */}
      <section className="rs-items2">
        <div className="rs-sec-head"><h4>Item</h4><small>{draft.items.length ? `${draft.items.length} · ${rupiah(itemsTotal)}` : 'belum ada'}</small>{draft.items.length > 8 && <button type="button" className="link-button" onClick={() => setAllItems(v => !v)}>{allItems ? 'Ringkas' : 'Semua'}</button>}</div>
        <ul className="rs-rows">{(allItems || draft.items.length <= 8 ? draft.items : draft.items.filter((item, i) => i < 5 || itemStatus(item) === 'check')).map(item => { const status = itemStatus(item), field = `item:${item.key}`, opened = openItem === item.key, cat = catName(item.subcategoryId || item.categoryId); return <li className={`rs-row ${status === 'check' ? 'is-check' : ''} ${opened ? 'is-open' : ''}`} key={item.key}>
          <button type="button" className="rs-row-main" aria-expanded={opened} onClick={() => setOpenItem(opened ? null : item.key)}>
            <span className="rs-row-name">{item.name || 'Item tanpa nama'}{(item.qty > 1 || item.variant || (draft.bySplit && cat)) && <small>{[item.qty > 1 ? `${item.qty} × ${rupiah(item.price)}` : '', item.variant || '', draft.bySplit ? cat : ''].filter(Boolean).join(' · ')}</small>}{item.modifiers.length > 0 && <small className="rs-mods">{item.modifiers.join(' · ')}</small>}{item.originalPrice && item.originalPrice > item.price ? <small className="rs-was">Harga coret <s>{rupiah(item.originalPrice * item.qty)}</s> · tidak dihitung</small> : null}{status === 'check' && <em><AlertTriangle size={12}/> Perlu dicek</em>}</span>
            <b>{rupiah(item.qty * item.price)}</b>
          </button>
          {item.discount > 0 && <div className="rs-row-sub"><span>Diskon</span><span>−{rupiah(item.discount)}</span></div>}
          {opened && <div className="rs-item-edit">
            <div className="rs-item-top"><input className="input rs-item-name" value={item.name} placeholder="Nama item" aria-label="Nama item" onChange={e => patchItem(item.key, { name: e.target.value })}/><FieldTools field={field} label={item.name || 'Item'} status={status}/><button type="button" className="rs-icon" aria-label={`Hapus ${item.name || 'item'}`} onClick={() => setDraft(current => current && { ...current, items: current.items.filter(entry => entry.key !== item.key) })}><Trash2 size={15}/></button></div>
            <div className="rs-item-bottom">
              <input className="input rs-item-qty" inputMode="numeric" value={item.qty} aria-label="Jumlah" onChange={e => patchItem(item.key, { qty: Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)) })}/>
              <span className="rs-item-x">×</span>
              <span className="rs-item-price"><Money value={item.price} onChange={price => { patchItem(item.key, { price }); if (item.source !== undefined) settle(`item:${item.source}`); }}/></span>
            </div>
            {item.unsure?.map(note => <div className="rs-relation" key={note}><span>Catatan <b>“{note}”</b> untuk item ini?</span><button type="button" className="sb-chip" onClick={() => patchItem(item.key, { unsure: item.unsure!.filter(n => n !== note) })}><Check size={12}/> Ya</button><button type="button" className="sb-chip" onClick={() => patchItem(item.key, { unsure: item.unsure!.filter(n => n !== note), modifiers: item.modifiers.filter(n => n !== note) })}><X size={12}/> Bukan</button></div>)}
            {item.variantUnsure && <div className="rs-relation"><span>Kode <b>{item.variant}</b> terbaca kurang jelas.</span><button type="button" className="sb-chip" onClick={() => patchItem(item.key, { variantUnsure: false })}><Check size={12}/> Sudah benar</button><button type="button" className="sb-chip" onClick={() => patchItem(item.key, { variant: undefined, variantUnsure: false })}><X size={12}/> Hapus</button></div>}
            {(item.modifiers.length > 0 || item.variant || item.sku) && <div className="rs-item-notes">{item.variant && <span className="rs-note is-code">{item.variant}</span>}{item.sku && <span className="rs-note is-code">SKU {item.sku}</span>}{item.modifiers.map(note => <span className="rs-note" key={note}>{note}<button type="button" aria-label={`Hapus catatan ${note}`} onClick={() => patchItem(item.key, { modifiers: item.modifiers.filter(n => n !== note), unsure: item.unsure?.filter(n => n !== note) })}><X size={11}/></button></span>)}</div>}
            {item.discount > 0 && <div className="rs-item-disc"><span>Diskon −{rupiah(item.discount)}</span><button type="button" className="rs-text-button" onClick={() => patchItem(item.key, { discount: 0 })}><X size={12}/> Hapus diskon</button></div>}
            {status === 'check' && item.source !== undefined && (intel?.items[item.source]?.amount.alternatives.length || 0) > 0 && <div className="rs-alts"><small className="muted">Kemungkinan lain:</small>{intel!.items[item.source!].amount.alternatives.map(v => <button type="button" key={v} className="sb-chip" onClick={() => useValue(field, v)}>{rupiah(v)}</button>)}<button type="button" className="sb-chip" onClick={() => settle(`item:${item.source}`)}><Check size={12}/> Sudah benar</button></div>}
            {reread?.field === field && <RereadPanel reread={reread} onUse={value => useValue(field, value)} onClose={() => setReread(null)}/>}
            {draft.type === 'expense' && !split && <CategoryAccordion type="expense" compact label={`Kategori ${item.name || 'item'}`} placeholder="Kategori item" value={{ categoryId: item.categoryId, subcategoryId: item.subcategoryId || null }} onChange={value => patchItem(item.key, { categoryId: value.categoryId, subcategoryId: value.subcategoryId || '' })}/>}
          </div>}
        </li>; })}</ul>
        {!allItems && draft.items.length > 8 && <button type="button" className="link-button rs-more-items" onClick={() => setAllItems(true)}>Lihat {draft.items.length - draft.items.filter((item, i) => i < 5 || itemStatus(item) === 'check').length} item lainnya</button>}
        <button type="button" className="link-button rs-add-item" onClick={() => { const id = key(); setOpenItem(id); setAllItems(true); setDraft(current => current && { ...current, items: [...current.items, { key: id, name: '', qty: 1, price: 0, discount: 0, modifiers: [], categoryId: current.categoryId, subcategoryId: current.subcategoryId }] }); }}><Plus size={14}/> Tambah item</button>
      </section>

      {/* 5. Money: the shopping, each charge or discount as a row like in Split Bill (tap to change), the total, payment. */}
      <section className="rs-money">
        <div className="rs-sec-head"><h4>Rincian biaya</h4></div>
        {itemsTotal ? <div className="rs-money-row"><span>Belanja ({draft.items.length} item)</span><span>{rupiah(itemsTotal)}</span></div>
          : <label className="rs-money-row rs-money-input"><span>Subtotal</span><Money value={draft.subtotal} onChange={subtotal => patch({ subtotal })}/></label>}
        <div className="rs-extras-head"><span>Tambahan &amp; diskon</span>{addableCharges.length > 0 && <button type="button" className="sb-link" aria-expanded={addingCharge} onClick={() => setAddingCharge(v => !v)}>{addingCharge ? 'Tutup' : <><Plus size={14}/> Tambah</>}</button>}</div>
        {addingCharge && <div className="xe-kinds" role="group" aria-label="Jenis biaya">{addableCharges.map(key => { const [Icon, kind] = CHARGE_LOOKS[key]; return <button type="button" key={key} className={`xe-kind is-${kind}`} onClick={() => { setShownKeys(list => [...list, key]); setOpenCharge(key); setAddingCharge(false); patch({ inc: { ...draft.inc, [key]: true } }); }}><span className="sb-extra-menu-icon"><Icon size={15}/></span>{CHARGE_SHORT[key]}</button>; })}</div>}
        {!chargeKeys.length && !addingCharge && <small className="muted">Tidak ada pajak, service, atau diskon.</small>}
        {chargeKeys.map(key => {
          const [Icon, kind] = CHARGE_LOOKS[key], status = statusOf(key, intel?.charges[key]?.status), opened = openCharge === key, value = draft.ch[key], off = !draft.inc[key];
          const minus = key === 'discount' || (key === 'rounding' && value < 0);
          return <div className={`xe-row is-${kind} ${opened ? 'is-open' : ''} ${off ? 'is-off' : ''} ${status === 'check' ? 'is-check' : ''}`} key={key}>
            <button type="button" className="xe-head" aria-expanded={opened} onClick={() => setOpenCharge(opened ? '' : key)}><span className="sb-extra-menu-icon"><Icon size={15}/></span><span className="sb-extra-title"><strong>{CHARGE_SHORT[key]}</strong><small>{off ? 'sudah termasuk harga' : status === 'check' ? 'perlu dicek' : CHARGE_HINT[key] || 'dihitung'}</small></span><strong className={minus && !off ? 'amount-positive' : ''}>{value ? `${minus ? '−' : ''}${rupiah(Math.abs(value))}` : rupiah(0)}</strong><ChevronDown size={15} className="xe-chev"/></button>
            {opened && <div className="sb-extra-body">
              <div className="rs-xe-amount">
                {key === 'rounding' ? <button type="button" className="rs-sign" aria-label="Ganti tanda" onClick={() => patch({ ch: { ...draft.ch, rounding: -draft.ch.rounding } })}>{draft.ch.rounding < 0 ? '−' : '+'}</button> : <b className="rs-sign is-fixed" aria-hidden="true">{key === 'discount' ? '−' : '+'}</b>}
                <Money value={Math.abs(value)} onChange={next => { patch({ ch: { ...draft.ch, [key]: key === 'rounding' && draft.ch.rounding < 0 ? -next : next } }); settle(key); }}/>
                <button type="button" className="icon-btn" aria-label={`Hapus ${CHARGE_SHORT[key]}`} onClick={() => { patch({ ch: { ...draft.ch, [key]: 0 }, inc: { ...draft.inc, [key]: true } }); setShownKeys(list => list.filter(k => k !== key)); setOpenCharge(''); settle(key); }}><Trash2 size={16}/></button>
              </div>
              {base > 0 && PERCENTS[key] && <div className="toolbar-row">{PERCENTS[key]!.map(pct => { const amount = Math.round(base * pct / 100); return <button type="button" key={pct} className={`link-button ${Math.abs(value) === amount ? 'is-active' : ''}`} onClick={() => { patch({ ch: { ...draft.ch, [key]: amount } }); settle(key); }}>{pct}%</button>; })}</div>}
              {key !== 'rounding' && <div className="sb-extra-how"><small>Di struk</small><div className="ip-seg sb-seg"><button type="button" className={!off ? 'active' : ''} onClick={() => patch({ inc: { ...draft.inc, [key]: true } })}>Ditambahkan</button><button type="button" className={off ? 'active' : ''} onClick={() => patch({ inc: { ...draft.inc, [key]: false } })}>Sudah termasuk harga</button></div></div>}
            </div>}
          </div>;
        })}
        {draft.type === 'expense' && !split && SEPARABLE.some(key => counted(key) > 0) && <div className="rs-charge-mode-wrap">
          <div className="ip-seg rs-charge-mode" role="group" aria-label="Cara mencatat biaya"><button type="button" className={draft.chargeMode === 'spread' ? 'active' : ''} onClick={() => patch({ chargeMode: 'spread' })}>Gabungkan</button><button type="button" className={draft.chargeMode === 'separate' ? 'active' : ''} onClick={() => patch({ chargeMode: 'separate' })}>Pisahkan</button></div>
          <small className="muted">{draft.chargeMode === 'spread' ? 'Biaya tambahan ikut masuk ke kategori belanja; rinciannya tetap tersimpan.' : 'Setiap biaya jadi baris sendiri dengan kategorinya.'}</small>
          {draft.chargeMode === 'separate' && separated.map(key => { const ref = catFor(key); return <div className="rs-charge-cat" key={key}><span>{CHARGE_SHORT[key]} <b>{rupiah(counted(key))}</b></span><CategoryAccordion type="expense" compact label={`Kategori ${CHARGE_SHORT[key]}`} value={{ categoryId: ref.categoryId, subcategoryId: ref.subcategoryId }} onChange={value => patch({ chargeCats: { ...draft.chargeCats, [key]: value } })}/></div>; })}
          {draft.chargeMode === 'separate' && separated.some(key => !catFor(key).categoryId) && <p className="sb-note is-warn">Pilih kategori untuk setiap biaya yang dicatat terpisah.</p>}
        </div>}
        <div className="rs-money-row is-total"><span>Total</span><span>{rupiah(draft.amount)}</span></div>
        {computedTotal > 0 && computedTotal !== draft.amount && <button type="button" className="rs-text-button rs-use-total" onClick={() => { patch({ amount: computedTotal }); settle('total'); }}>Hasil hitung {rupiah(computedTotal)} · pakai sebagai nominal</button>}
        {itemsTotal > 0 && draft.amount > 0 && itemsTotal !== draft.amount && !shownCharges.length && <p className="muted rs-diff">Item {rupiah(itemsTotal)}, nominal {rupiah(draft.amount)}: selisih {rupiah(Math.abs(draft.amount - itemsTotal))}{draft.amount > itemsTotal ? ' (mungkin pajak, service, atau item yang belum terbaca)' : ' (mungkin diskon)'}. Tambahkan lewat “Tambah”.</p>}
        <div className="rs-pay">
          {editMoney ? <label className="rs-line"><span className="rs-line-label">Cara bayar</span><span className="rs-line-control"><Select value={draft.payment} onChange={e => { patch({ payment: e.target.value as PaymentMethod }); setEditMoney(false); }}><option value="">Tidak tertulis</option>{(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).filter(Boolean).map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</Select></span></label>
            : <button type="button" className="rs-money-row rs-pay-edit" onClick={() => setEditMoney(true)}><span>Pembayaran</span><span>{draft.payment ? PAYMENT_LABELS[draft.payment] : 'tidak tertulis'} <ChevronRight size={14}/></span></button>}
          {read?.paid && read.paid !== draft.amount ? <div className="rs-money-row is-soft"><span>Dibayar</span><span>{rupiah(read.paid)}</span></div> : null}
          {read?.change ? <div className="rs-money-row is-soft"><span>Kembalian</span><span>{rupiah(read.change)}</span></div> : null}
          {read?.cashback ? <div className="rs-money-row is-soft"><span>Cashback / poin <small>· info</small></span><span>{rupiah(read.cashback)}</span></div> : null}
        </div>
      </section>

      {draft.type === 'expense' && !split && categoriesUsed > 1 && <div className="rs-split">
        <label className="rs-toggle"><input type="checkbox" checked={draft.bySplit} onChange={e => patch({ bySplit: e.target.checked })}/> <span><strong>Pisah per kategori</strong><small>Item di struk ini masuk ke {categoriesUsed} kategori.</small></span></label>
        {draft.bySplit && splits.map(line => <div className="rs-money-row" key={`${line.categoryId}:${line.subcategoryId}`}><span>{catName(line.categoryId)}{line.subcategoryId ? ` › ${catName(line.subcategoryId)}` : ''}</span><span>{rupiah(line.amount)}</span></div>)}
      </div>}

      {rawOpen && (rawText || read?.identifiers) && <section className="rs-raw2"><div className="rs-sec-head"><h4>Teks hasil baca</h4><button type="button" className="link-button" onClick={() => setRawOpen(false)}>Tutup</button></div>
        {ocrMeta && <small className="muted">{ocrMeta}</small>}
        {read?.identifiers && Object.keys(read.identifiers).length > 0 && <div className="rs-ids">{Object.entries(read.identifiers).map(([k, v]) => <div className="rs-money-row" key={k}><span>{({ receiptNo: 'No. struk', orderNo: 'No. pesanan', cashier: 'Kasir', table: 'Meja', terminal: 'Terminal', branch: 'Cabang', station: 'SPBU', pump: 'Pompa', plate: 'Nomor kendaraan' } as Record<string, string>)[k] || k}</span><span>{v}</span></div>)}</div>}
        {read?.fuel && <div className="rs-money-row"><span>BBM</span><span>{[read.fuel.product, read.fuel.liters ? `${read.fuel.liters.toLocaleString('id-ID')} L` : '', read.fuel.pricePerLiter ? `× ${rupiah(read.fuel.pricePerLiter)}` : ''].filter(Boolean).join(' ')}{read.fuel.matches ? ' ✓' : ''}</span></div>}
        {read?.parking && <div className="rs-money-row"><span>Parkir</span><span>{[read.parking.entry && `masuk ${read.parking.entry}`, read.parking.exit && `keluar ${read.parking.exit}`, read.parking.duration].filter(Boolean).join(' · ')}</span></div>}
        {rawText && <><textarea className="input" rows={8} value={rawText} onChange={e => setRawText(e.target.value)} aria-label="Teks yang terbaca"/><Button type="button" variant="secondary" className="small" onClick={() => readText(rawText)}>Baca ulang dari teks ini</Button><small className="muted">Perbaiki angka yang salah baca di sini, lalu baca ulang.</small></>}
      </section>}
      {debug && result && <OcrDebug result={result}/>}

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="rs-actions">
        <Button type="submit" className="full">{split ? (useAnyway ? 'Tetap gunakan di Split Bill' : 'Gunakan di Split Bill') : lowOk ? 'Ya, nominal sudah benar. Simpan' : `Simpan transaksi${draft.amount ? ` · ${rupiah(draft.amount)}` : ''}`}</Button>
        {/* 5.0 next action: a receipt with several items may have been shared; one quiet option, not a second primary. */}
        {!split && draft.type === 'expense' && navigate && draft.items.length >= 3 && <button type="button" className="link-button rs-next" onClick={toSplitBill}><ReceiptText size={15}/> Dibayar bareng teman? Bagi lewat Split Bill</button>}
      </div>
    </form>}

    <Dialog open={Boolean(source)} onOpenChange={value => { if (!value) setSource(null); }}><DialogContent title={source ? `Di struk: ${source.label}` : 'Di struk'} className="mobile-sheet rs-source-dialog">
      {source?.origin && <p className={`rs-origin ${source.origin.startsWith('Diedit') || source.origin.startsWith('Ditambah') ? 'is-manual' : source.origin.startsWith('Terbaca langsung') ? 'is-direct' : 'is-derived'}`}>{source.origin}</p>}
      {source && cropped && flatMapping && <ReceiptSource upright={cropped} mapping={flatMapping} box={source.box} label={source.label}/>}
      {source && !(cropped && flatMapping) && upright && mapping && <ReceiptSource upright={upright} mapping={mapping} box={source.box} label={source.label}/>}
      {source && !(cropped && flatMapping) && (!upright || !mapping) && photoUrl && <img className="rs-source-plain" src={photoUrl} alt="Foto struk"/>}
    </DialogContent></Dialog>
    <Dialog open={cornersOpen} onOpenChange={setCornersOpen}><DialogContent title="Atur sudut struk" className="mobile-sheet rs-corners-dialog">
      {cornersOpen && upright && result && <ReceiptCorners upright={upright} corners={result.prepared.corners} onCancel={() => setCornersOpen(false)} onApply={corners => { setCornersOpen(false); if (photo) void scan(photo, turn, corners); }}/>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(duplicate)} onOpenChange={value => { if (!value) setDuplicate(null); }}><DialogContent title="Struk ini mirip transaksi yang sudah dicatat" className="mobile-sheet rs-dup-dialog">
      {duplicate && <div className="rs-dup">
        <p className="muted">Mirip karena {duplicate.reasons.join(', ')}.</p>
        <div className="rs-dup-card"><Copy size={18}/><div><strong>{duplicate.tx.merchant || 'Tanpa nama tempat'}</strong><small>{duplicate.tx.date.split('-').reverse().join('/')}{duplicate.tx.time ? ` · ${duplicate.tx.time}` : ''}</small></div><b>{rupiah(duplicate.tx.amount)}</b></div>
        <div className="rs-dup-actions">
          <Button type="button" variant="secondary" onClick={() => { const tx = duplicate.tx as LedgerTx; setDuplicate(null); onOpenChange(false); openTx?.(undefined, tx); }}>Lihat transaksi</Button>
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
    <small className="muted">Tinggi huruf ±{Math.round(result.textHeight || 0)} px · {result.passes} pass · {(result.ms / 1000).toFixed(1)} s</small>
    {result.trace?.length > 0 && <ol className="rs-trace">{result.trace.map((t, i) => <li key={i} className={`is-${t.outcome}`}><b>{t.step}</b> {t.outcome}{t.ms ? ` · ${(t.ms / 1000).toFixed(1)} s` : ''}<small>{t.reason}</small></li>)}</ol>}
    {result.failure?.length > 0 && <small className="rs-trace-fail">Masih gagal: {result.failure.join(' · ')}</small>}
  </details>;
}
