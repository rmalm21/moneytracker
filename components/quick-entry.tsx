'use client';
import { Fragment, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle, ArrowLeftRight, ArrowRight, Check, ListChecks, RotateCcw, X, ArrowUpLeft, CalendarClock, ChartPie, Compass, CreditCard, FolderPlus, Gift, HandCoins, Repeat, Scale, ShieldCheck, Sparkles, StickyNote, Target, TrendingDown, TrendingUp, WalletCards, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Input, Select } from './fields';
import { Emoji } from './emoji';
import { AppIcon, brandForName, emojiLibrary, emojiOrFallback } from './visual-identity';
import { groupOf, QUICK_GROUPS, QUICK_LABELS, type QuickGroup, type QuickKind } from '@/lib/quick-entry';
import { FIELD_LABELS, FIELD_STATUS, parseQuickPlan, type ActionCandidate, type FieldKey, type FieldState, type FieldStatus, type QuickParseResult } from '@/lib/quick-plan';
import { createClaim, createDebt, createReceivable, newTx, saveRecord, saveWallet, saveWish, upsertTransaction, validateTx } from '@/lib/firestore';
import { budgetWindow, rupiah } from '@/lib/accounting';
import { dateInTimeZone, formatDate, timeInTimeZone, todayInTimeZone } from '@/lib/period';
import { presetHex } from '@/lib/category-templates';
import { groupDefaults, type WalletGroup } from '@/lib/wallet-groups';
import { priorityLabels, wishColors } from '@/lib/wishlist';
import { walletActions, walletAllows } from '@/lib/wallet-capabilities';
import type { Budget, Category, Fund, LedgerTx, Recurring, Wallet } from '@/lib/types';

/**
 * "Catat otomatis": type a sentence and see at once what will happen. Transactions ("beli pocari 8rb di alfa",
 * "pinjam 500rb dari budi", "nabung 1jt ke dana darurat"), and entries in every other menu: a budget, a tujuan dana,
 * a wish, a wallet or its balance, a category, a schedule, a plan, a calendar note, or opening a menu ("buka laporan").
 * "Sesuai, simpan" saves it the same way the menu's own form does; "Ubah detail" opens the full transaction form.
 * The chips choose the kind when the sentence alone doesn't say it.
 */
const icons: Record<QuickKind, LucideIcon> = { expense: TrendingDown, income: TrendingUp, transfer: ArrowLeftRight, debt_new: CreditCard, debt_payment: CreditCard, receivable_new: HandCoins, receivable_payment: HandCoins, claim_new: ShieldCheck, claim_payment: ShieldCheck, target: Target, wish: Gift, fund_new: Target, wish_new: Gift, budget: ChartPie, wallet_new: WalletCards, balance: Scale, category_new: FolderPlus, recurring_new: Repeat, plan_new: CalendarClock, note_new: StickyNote, open: Compass };
/** The other reading of each kind ("new" ↔ "paid", "new wallet" ↔ "its balance"), offered as a one-tap correction. */
const sibling: Partial<Record<QuickKind, QuickKind>> = { debt_new: 'debt_payment', debt_payment: 'debt_new', receivable_new: 'receivable_payment', receivable_payment: 'receivable_new', claim_new: 'claim_payment', claim_payment: 'claim_new', target: 'wish', wish: 'target', fund_new: 'target', wish_new: 'wish', wallet_new: 'balance', balance: 'wallet_new', note_new: 'plan_new' };
/** Tap-to-try examples: the sentence and what it becomes. A `section` starts a new block. */
/** The chips always shown; the other kinds are one tap away behind "Lainnya". */
const FIRST_GROUPS: QuickGroup[] = ['auto', 'expense', 'income', 'transfer'];
type Example = { text: string; kind: QuickKind; result: string; section?: string };
const examples: Record<QuickGroup, Example[]> = {
  auto: [
    { text: 'beli kopi 25rb di kenangan', kind: 'expense', result: 'tempat dan kategorinya terisi sendiri', section: 'Transaksi' },
    { text: 'gaji 7,5jt masuk bca', kind: 'income', result: 'Rp7.500.000 masuk ke BCA' },
    { text: 'pinjam 500rb dari budi', kind: 'debt_new', result: 'kamu berutang ke Budi' },
    { text: 'kemarin makan 25rb, parkir goceng, bensin 30rb pakai gopay', kind: 'expense', result: '3 pengeluaran sekaligus, kemarin, dari GoPay' },
    { text: 'besok bayar kos 1,5jt, ingetin perpanjang stnk tgl 20', kind: 'plan_new', result: 'rencana dan pengingat sekaligus' },
    { text: 'anggaran makan 2jt kecuali delivery', kind: 'budget', result: 'Makan & Minum tanpa Delivery', section: 'Menu lain' },
    { text: 'saldo bca sekarang 12jt', kind: 'balance', result: 'saldo BCA disamakan dengan aslinya' },
    { text: 'langganan netflix 54rb tiap tanggal 5', kind: 'recurring_new', result: 'jadwal bulanan, tinggal konfirmasi' },
    { text: 'buka laporan', kind: 'open', result: 'langsung pindah ke menunya' },
  ],
  expense: [
    { text: 'makan siang 30rb', kind: 'expense', result: 'kategori makan terisi sendiri' },
    { text: 'bensin 50rb pake gopay', kind: 'expense', result: 'dibayar dari GoPay' },
    { text: 'pulsa 100rb kemarin', kind: 'expense', result: 'dicatat di tanggal kemarin' },
  ],
  income: [
    { text: 'gaji 7,5jt masuk bca', kind: 'income', result: 'langsung masuk ke BCA' },
    { text: 'bonus 500rb', kind: 'income', result: 'ke dompet utama, hari ini' },
    { text: 'jual sepatu 300rb', kind: 'income', result: 'hasil jual barang' },
  ],
  transfer: [
    { text: 'tf 200rb dari bca ke gopay', kind: 'transfer', result: 'pindah dari BCA ke GoPay' },
    { text: 'tarik tunai 500rb dari bca', kind: 'transfer', result: 'dari BCA ke dompet Tunai' },
    { text: 'topup gopay 100rb dari bca', kind: 'transfer', result: 'isi saldo GoPay dari BCA' },
  ],
  debt: [
    { text: 'pinjam 500rb dari budi', kind: 'debt_new', result: 'kamu berutang ke Budi' },
    { text: 'bayar cicilan laptop 750rb', kind: 'debt_payment', result: 'mencicil utang “Cicilan laptop”' },
    { text: 'lunasin utang budi', kind: 'debt_payment', result: 'seluruh sisanya dibayar' },
  ],
  receivable: [
    { text: 'pinjemin andi 100rb', kind: 'receivable_new', result: 'Andi berutang ke kamu' },
    { text: 'bayarin sinta makan 50rb', kind: 'receivable_new', result: 'kamu menalangi Sinta' },
    { text: 'andi bayar 50rb', kind: 'receivable_payment', result: 'Andi mencicil ke kamu' },
  ],
  claim: [
    { text: 'klaim taksi 80rb', kind: 'claim_new', result: 'kamu menalangi kantor' },
    { text: 'klaim cair 900rb', kind: 'claim_payment', result: 'kantor sudah mengganti' },
  ],
  target: [
    { text: 'nabung 500rb ke dana darurat', kind: 'target', result: 'uangnya masuk ke Dana Darurat' },
    { text: 'target liburan bali 10jt desember 2027', kind: 'fund_new', result: 'tujuan dana baru dengan tenggat' },
  ],
  wish: [
    { text: 'pengen headphone 1,5jt', kind: 'wish_new', result: 'masuk wish list, lengkap dengan ikonnya' },
    { text: 'sisihkan 100rb buat headphone', kind: 'wish', result: 'menabung untuk impian di wish list' },
  ],
  budget: [
    { text: 'anggaran makan 2jt', kind: 'budget', result: 'anggaran baru, atau ubah yang sudah ada' },
    { text: 'budget makan 2jt untuk sarapan, makan siang dan kopi', kind: 'budget', result: 'hanya tiga subkategori itu' },
    { text: 'budget hiburan 500rb selain bioskop', kind: 'budget', result: 'semua subkategori kecuali Bioskop' },
    { text: 'budget makan 2jt, transport 800rb, hiburan 500rb', kind: 'budget', result: 'tiga anggaran sekaligus' },
    { text: 'jatah jajan 300rb per minggu', kind: 'budget', result: 'anggaran mingguan' },
    { text: 'naikin anggaran transport 200rb', kind: 'budget', result: 'ditambah dari nominal sekarang' },
  ],
  wallet: [
    { text: 'rekening baru jago saldo 1jt', kind: 'wallet_new', result: 'dompet baru lengkap dengan logonya' },
    { text: 'saldo bca sekarang 12jt', kind: 'balance', result: 'selisihnya dicatat sebagai penyesuaian' },
    { text: 'gopay tinggal 150rb', kind: 'balance', result: 'perbarui saldo GoPay' },
  ],
  category: [
    { text: 'kategori baru jajan', kind: 'category_new', result: 'kategori pengeluaran baru' },
    { text: 'subkategori tol di transportasi', kind: 'category_new', result: 'masuk ke dalam Transportasi' },
    { text: 'kategori pemasukan freelance', kind: 'category_new', result: 'kategori pemasukan baru' },
  ],
  recurring: [
    { text: 'langganan netflix 54rb tiap tanggal 5', kind: 'recurring_new', result: 'muncul tiap bulan untuk dikonfirmasi' },
    { text: 'gaji 7,5jt tiap tanggal 25 masuk bca', kind: 'recurring_new', result: 'pemasukan rutin bulanan' },
    { text: 'arisan 200rb tiap minggu', kind: 'recurring_new', result: 'jadwal mingguan' },
  ],
  plan: [
    { text: 'besok bayar arisan 200rb', kind: 'plan_new', result: 'rencana, saldo belum berubah' },
    { text: 'rencana servis motor 500rb tgl 10', kind: 'plan_new', result: 'masuk ke arus kas mendatang' },
    { text: 'ingetin perpanjang stnk 20 oktober', kind: 'note_new', result: 'pengingat di kalender' },
  ],
  open: [
    { text: 'buka laporan', kind: 'open', result: 'pindah ke Laporan' },
    { text: 'lihat utang', kind: 'open', result: 'pindah ke Utang' },
    { text: 'pengingat', kind: 'open', result: 'buka pengaturan Pengingat' },
  ],
};
type Tone = 'in' | 'out' | 'move' | 'menu';
const toneOf = (kind: QuickKind, flow?: 'expense' | 'income'): Tone => ['income', 'receivable_payment', 'claim_payment'].includes(kind) || (kind === 'recurring_new' || kind === 'plan_new') && flow === 'income' ? 'in'
  : ['transfer', 'target', 'wish', 'fund_new', 'wish_new'].includes(kind) ? 'move' : ['budget', 'wallet_new', 'balance', 'category_new', 'note_new', 'open'].includes(kind) ? 'menu' : 'out';
const txKinds = new Set<QuickKind>(['expense', 'income', 'transfer', 'debt_payment', 'receivable_payment', 'claim_payment', 'target']);
/** Entries of the other menus: a short summary first; their fields open with "Ubah detail" (or by themselves when something is missing). */
const menuKinds = new Set<QuickKind>(['budget', 'fund_new', 'wish_new', 'wallet_new', 'balance', 'category_new', 'recurring_new', 'plan_new', 'note_new', 'open']);
/** Kinds where money comes into the wallet (the default wallet is the income one). */
const incoming = new Set<QuickKind>(['income', 'receivable_payment', 'claim_payment', 'debt_new']);

const walletTypes: [Wallet['type'], string][] = [['bank', 'Bank'], ['ewallet', 'E-wallet'], ['cash', 'Tunai'], ['savings', 'Tabungan'], ['credit', 'Kartu kredit'], ['investment', 'Investasi'], ['other', 'Lainnya']];
const walletIcons: Record<Wallet['type'], string> = { bank: '🏦', cash: '💵', ewallet: '📱', savings: '💰', credit: '💳', investment: '📈', other: '👛' };
const groupLabels: Record<WalletGroup, string> = { operational: 'Operasional', savings: 'Tabungan', investment: 'Investasi' };
const weekdays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const frequencies: [Recurring['frequency'], string][] = [['monthly', 'Tiap bulan'], ['weekly', 'Tiap minggu'], ['yearly', 'Tiap tahun']];
const modes: [Recurring['mode'], string][] = [['inbox', 'Tunggu konfirmasi (disarankan)'], ['reminder', 'Pengingat saja'], ['draft', 'Simpan sebagai draf'], ['auto', 'Catat otomatis · saldo langsung berubah']];
const categoryTypes: [Category['type'], string][] = [['expense', 'Pengeluaran'], ['income', 'Pemasukan'], ['savings', 'Tabungan']];
const same = (a: string, b: string) => a.trim().toLocaleLowerCase('id-ID') === b.trim().toLocaleLowerCase('id-ID');
/** An icon from the built-in library whose keywords start like a word of the name ("jajan" → 🍿, "tol" → 🛣️). */
function iconFor(name: string) {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(word => word.length > 2);
  return words.length ? emojiLibrary.flatMap(group => group.items).find(([, keys]) => words.some(word => keys.split(' ').some(key => key.startsWith(word))))?.[0] : undefined;
}
/** Only the fields the text or the person changed; everything else comes from the sentence. */
type Edit = { amount?: number; destinationId?: string; person?: string; name?: string; description?: string; walletId?: string; linkId?: string; categoryId?: string; cycleType?: Budget['cycleType']; date?: string; walletType?: Wallet['type']; categoryType?: Category['type']; parentId?: string; scheduleMode?: Recurring['mode']; frequency?: Recurring['frequency']; flow?: 'expense' | 'income'; committed?: boolean; /** Budget: the subcategories it covers (none = all of the main category). */ subIds?: string[] };

/** What one card saves when it is confirmed, built only when the person presses save. */
type SaveJob = { run: () => Promise<unknown>; pending: string; success: string; detail?: string; failure: string; retry?: { label: string; run: () => void }; navigate?: { key: string; target?: string } };
type CardEntry = { missing: string; build: () => SaveJob; openForm?: () => void; kind: QuickKind; amount: number };
type Register = (id: string, entry: CardEntry | null) => void;
const statusIcon: Record<FieldStatus, string> = { verified: '✓', likely: '≈', check: '!', missing: '?' };

export function QuickEntryBox({ onOpenForm, onDone, onNavigate, autoFocus = false }: { onOpenForm: (preset: Partial<LedgerTx>) => void; onDone?: () => void; onNavigate?: (key: string, target?: string) => void; autoFocus?: boolean }) {
  const { data, profile, user } = useApp();
  const { track } = useNotify();
  const [text, setText] = useState(''), [mode, setMode] = useState<QuickGroup | QuickKind>('auto'), [error, setError] = useState('');
  const today = todayInTimeZone(profile?.timeZone);
  const ctx = useMemo(() => ({ wallets: data.wallets, categories: data.categories, history: data.transactions, today, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist, budgets: data.budgets, salaryDay: profile?.salaryCycleStartDay }), [data, today, profile?.salaryCycleStartDay]);
  /**
   * The whole message read as a plan: one card per action. Read from a deferred copy of the text, so typing stays
   * instant: the letters appear first, and the reading and the cards follow when the phone has a moment (a reading
   * still running when the next letter comes is dropped).
   */
  const typed = useDeferredValue(text);
  const grammarPlan = useMemo(() => typed.trim() ? parseQuickPlan(typed, ctx, mode) : null, [typed, mode, ctx]);
  // Catat otomatis V3: the grammar reading shows at once; NLP.js (loaded only when this box is used, all on the device)
  // then gives its second opinion and the consensus replaces the plan a moment later, for the same text only.
  const [refined, setRefined] = useState<{ key: string; plan: QuickParseResult } | null>(null);
  const planKey = `${mode}\u0000${typed}`;
  useEffect(() => {
    if (!typed.trim()) return;
    let live = true;
    const timer = setTimeout(() => { void import('@/lib/catat/v3').then(m => m.parseQuickPlanV3(typed, ctx, mode)).then(p => { if (live) setRefined({ key: planKey, plan: p }); }).catch(error => console.warn('Catat otomatis: pendapat kedua (NLP.js) tidak tersedia, hasil tata bahasa dipakai.', error)); }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [typed, mode, ctx, planKey]);
  const plan = refined?.key === planKey ? refined.plan : grammarPlan;
  const actions = plan?.actions || [];
  const [skipped, setSkipped] = useState<string[]>([]), [open, setOpen] = useState<string[]>([]);
  const [moreGroups, setMoreGroups] = useState(false), [allExamples, setAllExamples] = useState(false);
  useEffect(() => { setSkipped(list => list.length ? [] : list); setOpen(list => list.length ? [] : list); setError(''); }, [typed, mode]);
  const registry = useRef(new Map<string, CardEntry>());
  const [, redraw] = useState(0);
  // Cards register their save after every render; the totals are drawn again when an amount or a missing field changes.
  const register = useCallback<Register>((id, entry) => {
    const before = registry.current.get(id);
    if (entry) registry.current.set(id, entry); else registry.current.delete(id);
    if (!entry || !before || before.missing !== entry.missing || before.amount !== entry.amount || before.kind !== entry.kind) redraw(n => n + 1);
  }, []);
  const kept = actions.filter(a => !skipped.includes(a.id));

  function reset() { setText(''); setMode('auto'); }
  /** Saves the chosen cards the way their own menus do, with one progress message. */
  function commit(ids: string[]) {
    if (!user || !ids.length) return;
    const entries = ids.map(id => [id, registry.current.get(id)] as const);
    const blocked = entries.filter(([, e]) => !e || e.missing);
    if (blocked.length) {
      setOpen(list => [...new Set([...list, ...blocked.map(([id]) => id)])]);
      setError(ids.length === 1 ? blocked[0][1]?.missing || '' : `${blocked.length} catatan masih perlu dilengkapi (ditandai di bawah).`);
      return;
    }
    let jobs: SaveJob[];
    try { jobs = entries.map(([, e]) => e!.build()); } catch (e) { setError((e as Error).message); return; }
    const nav = jobs.find(j => j.navigate)?.navigate, work = jobs.filter(j => !j.navigate);
    if (work.length === 1) { const j = work[0]; track(j.run(), { pending: j.pending, success: j.success, detail: j.detail, failure: j.failure, retry: j.retry }); }
    else if (work.length) {
      // Started in order in one go, like the forms: queued writes keep their order offline too.
      const spent = entries.filter(([, e]) => e!.kind === 'expense').reduce((n, [, e]) => n + e!.amount, 0);
      track(Promise.all(work.map(j => j.run())), { pending: `Menyimpan ${work.length} catatan…`, success: `${work.length} catatan tersimpan.`, detail: [spent ? `Pengeluaran ${rupiah(spent)}` : '', ...[...new Set(entries.filter(([, e]) => e!.kind !== 'expense' && e!.kind !== 'open').map(([, e]) => QUICK_LABELS[e!.kind]))]].filter(Boolean).join(' · ') || undefined, failure: 'Sebagian catatan belum tersimpan' });
    }
    reset(); onDone?.();
    if (nav) onNavigate?.(nav.key, nav.target);
  }
  // Enter pressed before the reading caught up with the last letters: saved once the cards show the full text.
  const pendingSubmit = useRef(false), formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (pendingSubmit.current && typed === text) { pendingSubmit.current = false; formRef.current?.requestSubmit(); } });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (typed !== text) { pendingSubmit.current = true; return; }
    if (!actions.length && plan?.cancelled.length) { reset(); return; }
    if (!actions.length) { if (text.trim()) setError(plan?.references[0] || 'Sebutkan nominalnya, misalnya "beli pocari 8rb di alfa".'); return; }
    if (actions.length === 1) {
      const entry = registry.current.get(actions[0].id);
      if (entry?.missing && entry.openForm) { entry.openForm(); return; }
      commit([actions[0].id]); return;
    }
    commit(kept.map(a => a.id));
  }

  const activeGroup = mode === 'auto' ? 'auto' : mode in QUICK_LABELS ? groupOf(mode as QuickKind) : mode as QuickGroup;
  const detected = actions.length === 1 ? groupOf(actions[0].result.kind) : null;
  const entries = kept.map(a => registry.current.get(a.id)).filter(Boolean) as CardEntry[];
  const sum = (kind: QuickKind) => entries.filter(e => e.kind === kind).reduce((n, e) => n + e.amount, 0);
  const out = sum('expense'), income = sum('income'), budgets = sum('budget');
  const needs = kept.filter(a => registry.current.get(a.id)?.missing).length;
  const openForm = (preset: Partial<LedgerTx>) => { setText(''); onOpenForm(preset); };
  // Developer view (localStorage "dompet-ajaib:quick-debug" = "1"): the reading step by step and the action graph.
  const [debug] = useState(() => { try { return localStorage.getItem('dompet-ajaib:quick-debug') === '1'; } catch { return false; } });

  return <div className="quick-entry-wrap">
    <form className="quick-entry" ref={formRef} onSubmit={submit}>
      <span className="quick-entry-icon" aria-hidden="true"><Sparkles size={16}/></span>
      <textarea rows={1} value={text} onChange={e => { setText(e.target.value); setError(''); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(160, e.currentTarget.scrollHeight)}px`; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Contoh: makan 25rb pakai GoPay" aria-label="Tulis transaksi atau perintah; beberapa sekaligus dipisah koma, “terus”, atau baris baru" autoFocus={autoFocus} enterKeyHint="go" autoComplete="off"/>
      <button type="submit" aria-label={actions.length > 1 ? 'Simpan semua' : 'Simpan'} disabled={!text.trim()}><ArrowRight size={17}/></button>
    </form>
    <div className={`quick-groups ${moreGroups ? 'is-all' : ''}`} role="radiogroup" aria-label="Jenis catatan">{QUICK_GROUPS.filter(([key]) => moreGroups || FIRST_GROUPS.includes(key) || key === activeGroup || mode === 'auto' && key === detected).map(([key, label]) => <Fragment key={key}><button type="button" role="radio" aria-checked={activeGroup === key} className={`${activeGroup === key ? 'active' : ''} ${mode === 'auto' && detected === key ? 'is-detected' : ''}`} onClick={event => { setMode(key); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }}>{label}</button></Fragment>)}<button type="button" className="qg-more" aria-expanded={moreGroups} onClick={() => setMoreGroups(v => !v)}>{moreGroups ? 'Ringkas' : 'Lainnya'}</button></div>
    {!text.trim() && <div className="quick-examples"><span className="qe-title">Contoh</span>{(examples[activeGroup] || examples.auto).filter((_, i) => allExamples || i < 3).map(example => { const ExampleIcon = icons[example.kind]; return <Fragment key={example.text}>{example.section && allExamples && <span className="qe-section">{example.section}</span>}<button type="button" className={`qe-item tone-${toneOf(example.kind, /gaji|bonus|terima/.test(example.text) ? 'income' : 'expense')}`} onClick={() => setText(example.text)}><span className="qe-icon" aria-hidden="true"><ExampleIcon size={16}/></span><span className="qe-text"><strong>“{example.text}”</strong><small><b>{example.kind === 'budget' ? 'Anggaran' : example.kind === 'recurring_new' ? QUICK_LABELS.recurring_new : example.kind === 'plan_new' ? 'Rencana' : example.kind === 'note_new' ? 'Pengingat' : QUICK_LABELS[example.kind]}</b> · {example.result}</small></span><ArrowUpLeft size={15} className="qe-go" aria-hidden="true"/></button></Fragment>; })}{(examples[activeGroup] || examples.auto).length > 3 && <button type="button" className="link-button qe-more" onClick={() => setAllExamples(v => !v)}>{allExamples ? 'Lebih sedikit' : 'Contoh lain'}</button>}</div>}
    {text.trim() && typed.trim() && !actions.length && !plan?.cancelled.length && <small className="quick-entry-hint" role="alert">{error || plan?.references[0] || 'Tambahkan nominalnya, misalnya 8rb, 25k, atau 1,5jt.'}</small>}
    {text.trim() && typed.trim() && !actions.length && (plan?.cancelled.length || 0) > 0 && <small className="qp-cancelled">Dibatalkan: {plan!.cancelled.map(c => `“${c}”`).join(', ')}. Tidak ada yang disimpan.</small>}
    {actions.length === 1 && <QuickCard key={`${actions[0].id}:${actions[0].result.kind}`} action={actions[0]} layout="single" register={register} onSave={() => commit([actions[0].id])} onOpenForm={openForm} onSwitchMode={setMode} error={error}/>}
    {actions.length > 1 && <div className="quick-preview quick-batch">
      <div className="qp-head"><span className="qp-icon" aria-hidden="true"><ListChecks size={18}/></span><span className="qp-title"><small>{kept.length} aksi{needs ? ` · ${kept.length - needs} siap · ${needs} perlu dicek` : ' · semua siap'}</small><strong>{entries.length && entries.every(e => e.kind === 'expense') ? <>{rupiah(out)}<em> keluar</em></> : entries.length && entries.every(e => e.kind === 'income') ? <>{rupiah(income)}<em> masuk</em></> : entries.length && entries.every(e => e.kind === 'budget') ? <>{rupiah(budgets)}<em> anggaran</em></> : <>{kept.length}<em> catatan</em></>}</strong></span></div>
      {plan?.references.map(u => <small key={u} className="qp-flag is-check"><b>! Perlu dicek</b> · {u}</small>)}
      {plan?.cancelled.map(c => <small key={c} className="qp-cancelled">Dibatalkan: “{c}”</small>)}
      <ul className="qb-list">{actions.map(a => <QuickCard key={`${a.id}:${a.result.kind}`} action={a} layout="row" register={register} skipped={skipped.includes(a.id)} onSkip={() => setSkipped(list => list.includes(a.id) ? list.filter(x => x !== a.id) : [...list, a.id])} expanded={open.includes(a.id)} onToggle={() => setOpen(list => list.includes(a.id) ? list.filter(x => x !== a.id) : [...list, a.id])} onOpenForm={openForm}/>)}</ul>
      {error && <small className="qp-warn" role="status">{error}</small>}
      <small className="qp-note">{kept.length < actions.length ? `${actions.length - kept.length} dilewati. ` : ''}Tanggal atau dompet yang disebut sekali berlaku untuk yang lain. Ketuk baris untuk mengubah, ✕ untuk melewati.</small>
      <div className="qp-actions"><Button type="button" onClick={() => commit(kept.map(a => a.id))} disabled={!kept.length}>Simpan semua ({kept.length})</Button></div>
    </div>}
    {debug && plan && <details className="rs-raw qp-debug"><summary>Debug Catat otomatis</summary>
      <ol className="rs-trace">{plan.trace.map((line, i) => <li key={i}>{line}</li>)}</ol>
      <ol className="rs-trace">{plan.relations.map((r, i) => <li key={i}><b>{r.type}</b> {r.from}{r.to ? ` → ${r.to}` : ''} · {FIELD_STATUS[r.confidence]}<small>{r.note}</small></li>)}</ol>
    </details>}
  </div>;
}

/**
 * One action of the plan: the compact preview ("single") or a row that opens to the same preview ("row").
 * Only what needs attention is highlighted; the reasons stay behind "Kenapa?".
 */
const QuickCard = memo(QuickCardView, (a, b) => a.action === b.action && a.layout === b.layout && a.error === b.error && a.skipped === b.skipped && a.expanded === b.expanded && a.register === b.register);
function QuickCardView({ action, layout, register, onSave, onOpenForm, onSwitchMode, error: outerError = '', skipped = false, onSkip, expanded = false, onToggle }: { action: ActionCandidate; layout: 'single' | 'row'; register: Register; onSave?: () => void; onOpenForm: (preset: Partial<LedgerTx>) => void; onSwitchMode?: (mode: QuickKind) => void; error?: string; skipped?: boolean; onSkip?: () => void; expanded?: boolean; onToggle?: () => void }) {
  const { data, profile, user } = useApp();
  const [choice, setChoice] = useState(0), [why, setWhy] = useState(false), [kindOk, setKindOk] = useState(false);
  const result = choice ? action.alternatives[choice - 1].result : action.result;
  const [edit, setEdit] = useState<Edit>({}), [details, setDetails] = useState(false), [error, setError] = useState('');
  const today = todayInTimeZone(profile?.timeZone), salaryDay = profile?.salaryCycleStartDay || 24;
  const kind = result.kind;
  // A different reading means different fields: start them fresh.
  useEffect(() => { setEdit({}); setError(''); setDetails(false); }, [choice]);
  const change = (patch: Edit) => setEdit(v => ({ ...v, ...patch }));

  const amount = edit.amount ?? result.amount ?? 0;
  const isFlow = kind === 'recurring_new' || kind === 'plan_new';
  const flow: 'expense' | 'income' = edit.flow ?? (result.preset.type === 'income' ? 'income' : 'expense');
  const txType = isFlow ? flow : result.preset.type;
  const walletsFor = (act: 'pay' | 'receive' | 'transferOut' | 'transferIn') => data.wallets.filter(w => walletAllows(w as Wallet, act));
  const sourceAction = txType ? walletActions({ type: txType, adjustmentDirection: 'in' }).source as 'pay' | 'receive' | 'transferOut' : kind === 'debt_new' ? 'receive' : 'pay';
  const choices = kind === 'balance' || kind === 'fund_new' ? data.wallets.filter(w => !w.isArchived) : walletsFor(sourceAction);
  const preferred = incoming.has(kind) || isFlow && flow === 'income' ? profile?.defaultIncomeWalletId : profile?.defaultExpenseWalletId;
  // These only use a wallet that is named or picked: new debts and receivables (like their own forms), plans, tujuan dana,
  // a balance, and the source of a transfer (never guessed).
  const optionalWallet = kind === 'debt_new' || kind === 'receivable_new' || kind === 'plan_new' || kind === 'fund_new' || kind === 'balance' || kind === 'transfer';
  const presetDestination = edit.destinationId ?? result.preset.destinationWalletId ?? '';
  const fallbackWallet = optionalWallet ? '' : (choices.find(w => w.id === preferred && w.id !== presetDestination) || choices.find(w => w.id !== presetDestination))?.id || '';
  const walletId = edit.walletId ?? result.preset.walletId ?? fallbackWallet;
  /** The wallet came from the default setting, not from the text: said so next to it. */
  const walletIsDefault = edit.walletId === undefined && !result.preset.walletId && Boolean(fallbackWallet);
  const linkOptions = kind === 'debt_payment' ? data.debts.filter(d => d.outstandingAmount > 0).map(d => ({ id: d.id, label: `${d.name} · sisa ${rupiah(d.outstandingAmount)}` }))
    : kind === 'receivable_payment' ? data.receivables.filter(r => r.remainingAmount > 0).map(r => ({ id: r.id, label: `${r.person} · sisa ${rupiah(r.remainingAmount)}` }))
    : kind === 'claim_payment' ? data.claims.filter(c => c.remainingAmount > 0).map(c => ({ id: c.id, label: `${c.name} · sisa ${rupiah(c.remainingAmount)}` }))
    : kind === 'target' ? data.funds.filter(f => !f.isArchived).map(f => ({ id: f.id, label: f.name }))
    : kind === 'wish' ? data.wishlist.filter(w => w.status === 'active').map(w => ({ id: w.id, label: `${w.name} · ${rupiah(w.saved || 0)} / ${rupiah(w.price)}` })) : [];
  const presetLink = kind === 'debt_payment' ? result.preset.debtId : kind === 'receivable_payment' ? result.preset.receivableId : kind === 'claim_payment' ? result.preset.claimId : kind === 'target' ? result.preset.fundId : kind === 'wish' ? result.wishId : '';
  const linkId = edit.linkId ?? presetLink ?? '';
  const fund = kind === 'target' ? data.funds.find(f => f.id === linkId) : undefined;
  const destination = kind === 'target' ? fund?.linkedWalletId || (fund?.walletIds?.length === 1 ? fund.walletIds[0] : '') : presetDestination;
  const person = edit.person ?? result.person ?? '', name = edit.name ?? result.name ?? '', description = edit.description ?? result.preset.description ?? '';
  const date = edit.date ?? result.date ?? today;
  const walletName = (id?: string | null) => data.wallets.find(w => w.id === id)?.name || '';
  const category = data.categories.find(c => c.id === (result.preset.subcategoryId || result.preset.categoryId));
  const categoryName = (c?: Pick<Category, 'name' | 'parentId'>) => c ? c.parentId ? `${data.categories.find(p => p.id === c.parentId)?.name || ''} › ${c.name}` : c.name : '';
  const bySort = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  const topLevel = (types: Category['type'][]) => data.categories.filter(c => !c.isArchived && !c.parentId && types.includes(c.type)).sort(bySort);
  const withChildren = (types: Category['type'][]) => topLevel(types).flatMap(p => [p, ...data.categories.filter(c => !c.isArchived && c.parentId === p.id).sort(bySort)]);
  const dayText = (value: string) => { const d = new Date(`${today}T12:00:00`), plus = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); }; return value === today ? 'Hari ini' : value === plus(1) ? 'Besok' : value === plus(-1) ? 'Kemarin' : formatDate(value, value.slice(0, 4) !== today.slice(0, 4)); };

  // Anggaran
  const budget = result.budget, oldBudget = budget?.id ? data.budgets.find(b => b.id === budget.id) : undefined;
  const budgetScope = edit.categoryId ?? (budget ? budget.subcategoryIds[0] || budget.categoryId || '' : '');
  const scopeCategory = data.categories.find(c => c.id === budgetScope);
  const scopeParent = scopeCategory ? (scopeCategory.parentId ? data.categories.find(c => c.id === scopeCategory.parentId) : scopeCategory) : undefined;
  const scopeChildren = scopeParent ? data.categories.filter(c => !c.isArchived && c.parentId === scopeParent.id).sort(bySort) : [];
  const budgetSubs = edit.subIds ?? (edit.categoryId ? (scopeCategory?.parentId ? [scopeCategory.id] : []) : budget?.subcategoryIds || []);
  const budgetName = !scopeParent ? '' : !budgetSubs.length || budgetSubs.length === scopeChildren.length ? scopeParent.name : edit.subIds || edit.categoryId ? (budgetSubs.length > 3 ? `${scopeParent.name} (${budgetSubs.length} subkategori)` : budgetSubs.map(id => data.categories.find(c => c.id === id)?.name || '').join(' & ')) : result.name || scopeParent.name;
  const toggleSub = (id: string) => change({ subIds: budgetSubs.includes(id) ? budgetSubs.filter(x => x !== id) : [...budgetSubs, id] });
  const cycleType = edit.cycleType ?? budget?.cycleType ?? 'salary';
  const cycleDay = cycleType === 'weekly' ? (edit.cycleType ? 1 : budget?.cycleStartDay || 1) : cycleType === 'custom' ? budget?.cycleStartDay || salaryDay : salaryDay;
  const periodText = (type: Budget['cycleType'], day: number) => type === 'weekly' ? `Mingguan · mulai ${weekdays[(day - 1) % 7]}` : type === 'calendar' ? 'Bulan kalender' : type === 'custom' ? `Mulai tanggal ${day}` : 'Siklus gaji';
  // Tujuan dana and wish list
  const goal = result.goal;
  const oldFund = kind === 'fund_new' && goal?.existingId ? data.funds.find(f => f.id === goal.existingId) : undefined;
  const targetDate = edit.date ?? goal?.targetDate ?? '';
  const wishTwin = kind === 'wish_new' ? data.wishlist.find(w => w.status === 'active' && same(w.name, name)) : undefined;
  // Dompet
  const walletType = edit.walletType ?? result.wallet?.type ?? 'bank';
  const walletTwin = kind === 'wallet_new' ? data.wallets.find(w => !w.isArchived && same(w.name, name)) : undefined;
  const brand = kind === 'wallet_new' ? brandForName(name) : undefined;
  const walletGroup: WalletGroup = walletType === 'investment' ? 'investment' : walletType === 'savings' ? 'savings' : 'operational';
  const balanceOf = kind === 'balance' ? data.wallets.find(w => w.id === walletId) : undefined;
  const delta = balanceOf ? amount - balanceOf.cachedBalance : 0;
  // Kategori
  const parentId = edit.parentId ?? result.category?.parentId ?? '';
  const parent = data.categories.find(c => c.id === parentId);
  const categoryType = parent?.type ?? edit.categoryType ?? result.category?.type ?? 'expense';
  const categoryTwin = kind === 'category_new' ? data.categories.find(c => !c.isArchived && same(c.name, name) && (c.parentId || '') === parentId && (parentId || c.type === categoryType)) : undefined;
  const categoryIcon = iconFor(name) || (parent ? emojiOrFallback(parent.icon) : '🗂️');
  // Jadwal rutin and rencana
  const flowCategory = edit.categoryId ?? (kind === 'plan_new' ? result.preset.subcategoryId || result.preset.categoryId : result.preset.categoryId) ?? '';
  const flowCategoryRecord = data.categories.find(c => c.id === flowCategory);
  const scheduleMode = edit.scheduleMode ?? result.schedule?.mode ?? 'inbox';
  const frequency = edit.frequency ?? result.schedule?.frequency ?? 'monthly';
  const anchorDay = edit.date || !result.schedule ? Number(date.slice(8, 10)) || 1 : result.schedule.anchorDay;
  const frequencyText = frequency === 'weekly' ? `Tiap ${weekdays[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]}` : frequency === 'yearly' ? `Tiap tahun, ${formatDate(date, false)}` : `Tiap bulan, tgl ${anchorDay}`;
  const committed = edit.committed ?? false;

  // What the text left open or contradicted, unless the person already chose it here.
  const touched: Partial<Record<FieldKey, boolean>> = { amount: edit.amount !== undefined, date: edit.date !== undefined, wallet: edit.walletId !== undefined, to: edit.destinationId !== undefined, link: edit.linkId !== undefined, person: edit.person !== undefined, name: edit.name !== undefined, category: edit.categoryId !== undefined };
  // The one question the plan asks for this action ("Rp100.000 ke Jago dari dompet mana?"), until it is answered here.
  const ask = !choice && action.ask && !touched[action.ask.field] && !(action.ask.field === 'kind' && kindOk) ? action.ask : undefined;
  const flags = choice ? [] : (Object.entries(action.fields) as [FieldKey, FieldState][]).filter(([key, f]) => (f.status === 'check' || f.status === 'missing') && !touched[key] && key !== ask?.field && !(key === 'kind' && kindOk));
  // A choice the text left between two values must be made here: two amounts, two dates, two wallets.
  const unchosen = choice ? '' : action.options.amount && !touched.amount ? 'Pilih nominal yang benar.' : action.options.date && !touched.date ? 'Pilih tanggal yang benar.' : action.options.wallet && !touched.wallet ? 'Pilih dompet yang benar.' : '';

  // What still stops a direct save (for transactions the form can always be opened instead).
  const missing = unchosen || (() => {
    switch (kind) {
      case 'open': return result.menu ? '' : 'Menu apa yang mau dibuka? Contoh: “buka laporan”.';
      case 'budget': return !amount ? 'Tulis nominal anggarannya, misalnya “anggaran makan 2jt”.' : !budgetScope ? 'Pilih kategori anggarannya.' : oldBudget && amount === oldBudget.amount ? `Anggaran ${oldBudget.name} sudah ${rupiah(amount)}.` : '';
      case 'fund_new': return !amount ? 'Tulis target nominalnya, misalnya “target liburan 10jt”.' : !oldFund && !name.trim() ? 'Beri nama tujuan dananya.' : oldFund && amount === oldFund.targetAmount ? `Target ${oldFund.name} sudah ${rupiah(amount)}.` : '';
      case 'wish_new': return !amount ? 'Tulis harganya, misalnya “pengen headphone 1,5jt”.' : !name.trim() ? 'Tulis nama barangnya.' : wishTwin ? `“${wishTwin.name}” sudah ada di wish list. Pilih “${QUICK_LABELS.wish}” untuk menyisihkan uang ke sana.` : '';
      case 'wallet_new': return !name.trim() ? 'Tulis nama dompetnya, misalnya “rekening baru jago”.' : walletTwin ? `Dompet ${walletTwin.name} sudah ada. Untuk mengubah saldonya, pilih “${QUICK_LABELS.balance}”.` : '';
      case 'balance': return !balanceOf ? 'Pilih dompet yang saldonya diperbarui.' : !amount ? 'Tulis saldo sekarang, misalnya 12jt.' : !delta ? `Saldo ${balanceOf.name} sudah ${rupiah(amount)}, tidak ada yang berubah.` : '';
      case 'category_new': return !name.trim() ? 'Tulis nama kategorinya, misalnya “kategori baru jajan”.' : result.category?.parentAsked && !parentId ? 'Pilih kategori induknya.' : categoryTwin ? parent ? `${categoryTwin.name} sudah ada di ${parent.name}.` : `Kategori ${categoryTwin.name} sudah ada.` : '';
      case 'recurring_new': return !amount ? 'Tulis nominalnya, misalnya 54rb.' : !name.trim() ? 'Beri nama jadwalnya.' : !walletId ? 'Pilih dompetnya.' : scheduleMode === 'auto' && flow === 'expense' && !flowCategory ? 'Pilih kategori agar bisa dicatat otomatis.' : '';
      case 'plan_new': return !amount ? 'Tulis nominalnya, misalnya 200rb.' : !name.trim() ? 'Beri judul rencananya.' : !date ? 'Pilih tanggalnya.' : '';
      case 'note_new': return !name.trim() ? 'Tulis isi catatannya.' : !date ? 'Pilih tanggalnya.' : '';
      default: return !amount ? 'Tulis nominalnya.' : kind === 'expense' && !result.preset.categoryId ? 'Kategorinya belum ketemu. Sebut kategorinya (mis. “makan”), atau tekan Ubah detail.'
        : kind === 'transfer' && !walletId ? 'Pilih dompet asalnya.'
        : txKinds.has(kind) && !walletId ? 'Pilih dompetnya dulu.'
        : kind === 'transfer' && (!destination || destination === walletId) ? 'Pilih dompet tujuan yang berbeda dari dompet asal.'
        : (kind === 'debt_payment' || kind === 'receivable_payment' || kind === 'claim_payment' || kind === 'wish') && !linkId ? 'Pilih catatan yang dimaksud.'
        : kind === 'target' && !linkId ? 'Pilih tujuan dananya.'
        : kind === 'target' && (!destination || destination === walletId) ? 'Tujuan dana ini belum punya dompet sendiri. Tekan Ubah detail untuk memilih dompet tujuan.'
        : kind === 'receivable_new' && !person.trim() ? 'Tulis nama orangnya.'
        : kind === 'claim_new' && (!name.trim() || !walletId) ? 'Lengkapi nama klaim dan dompet asalnya.'
        : kind === 'debt_new' && !name.trim() ? 'Beri nama utangnya.' : '';
    }
  })();

  function preset(): Partial<LedgerTx> {
    const base: Partial<LedgerTx> = { ...result.preset, amount, walletId: walletId || undefined, origin: 'quick', ...(edit.date ? { date: edit.date } : {}) };
    if (kind === 'transfer' && destination) base.destinationWalletId = destination;
    if (kind === 'debt_payment') base.debtId = linkId; if (kind === 'receivable_payment') base.receivableId = linkId; if (kind === 'claim_payment') base.claimId = linkId;
    if (kind === 'target') { base.fundId = linkId; if (destination) base.destinationWalletId = destination; }
    return base;
  }
  const heading = kind === 'budget' ? (oldBudget ? 'Ubah anggaran' : 'Anggaran baru') : kind === 'fund_new' ? (oldFund ? 'Ubah target dana' : QUICK_LABELS.fund_new)
    : kind === 'category_new' ? (parentId ? 'Subkategori baru' : 'Kategori baru') : kind === 'plan_new' ? (flow === 'income' ? 'Rencana pemasukan' : 'Rencana pengeluaran')
    : kind === 'recurring_new' ? (flow === 'income' ? 'Pemasukan rutin' : 'Pengeluaran rutin') : kind === 'note_new' ? (result.reminder ? 'Pengingat' : 'Catatan kalender') : QUICK_LABELS[kind];

  /** The save of this card, the same way the menu's own form saves it. */
  function build(): SaveJob {
    const uid = user!.uid, money = rupiah(amount), label = heading;
    let run: () => Promise<unknown>, detail = '', success = `${label} ${money} tersimpan.`;
    switch (kind) {
      case 'open': return { run: async () => undefined, pending: '', success: '', failure: '', navigate: { key: result.menu!.key, target: result.menu!.target } };
      case 'budget': {
        if (oldBudget) { run = () => saveRecord<Budget>(uid, 'budgets', { amount }, oldBudget.id); success = `Anggaran ${oldBudget.name} jadi ${money}.`; detail = `sebelumnya ${rupiah(oldBudget.amount)}`; break; }
        // Every subcategory ticked is the same as the whole category.
        const scope = scopeParent!, categoryId = scope.id, subs = budgetSubs.length === scopeChildren.length ? [] : budgetSubs;
        const base: Partial<Budget> = { name: budgetName, categoryId, subcategoryId: subs[0] || null, subcategoryIds: subs, amount, classification: data.categories.find(c => c.id === categoryId)?.type === 'savings' ? 'savings' : 'living', cycleType, cycleStartDay: cycleDay, warningPercent: profile?.budgetWarningPercent || 80, notes: '', rolloverEnabled: false, active: true, sortOrder: data.budgets.reduce((n, x) => Math.max(n, (x.sortOrder ?? -1) + 1), data.budgets.length) + action.clause, createdDate: today, lastSettledStart: budgetWindow({ cycleType, cycleStartDay: cycleDay } as Budget, dateInTimeZone(new Date(), profile?.timeZone), salaryDay).start, rolloverCarry: 0 };
        run = () => saveRecord<Budget>(uid, 'budgets', base); success = `Anggaran ${budgetName} ${money} dibuat.`; detail = periodText(cycleType, cycleDay);
        break;
      }
      case 'fund_new':
        if (oldFund) { run = () => saveRecord<Fund>(uid, 'funds', { targetAmount: amount }, oldFund.id); success = `Target ${oldFund.name} jadi ${money}.`; detail = `sebelumnya ${rupiah(oldFund.targetAmount)}`; break; }
        run = () => saveRecord<Fund>(uid, 'funds', { name: name.trim(), kind: goal?.emergency ? 'emergency' : 'goal', targetAmount: amount, currentAmount: 0, monthlyContribution: goal?.monthly || 0, targetDate, linkedWalletId: walletId || '', notes: '' });
        success = `Tujuan dana ${name.trim()} dibuat.`; detail = [`target ${money}`, targetDate && `tenggat ${formatDate(targetDate)}`, walletId && `di ${walletName(walletId)}`].filter(Boolean).join(' · ');
        break;
      case 'wish_new': {
        const active = data.wishlist.filter(w => w.status === 'active');
        run = () => saveWish(uid, { name: name.trim(), emoji: goal?.emoji || '🎁', color: wishColors[active.length % wishColors.length], price: amount, monthly: goal?.monthly || 0, priority: goal?.priority || 2, link: '', notes: '', targetDate, saved: 0, status: 'active', addedDate: today, sortOrder: data.wishlist.reduce((n, w) => Math.max(n, (w.sortOrder ?? -1) + 1), 0), history: [] });
        success = `${name.trim()} masuk wish list ✨`; detail = money;
        break;
      }
      case 'wallet_new':
        run = () => saveWallet(uid, { name: name.trim(), type: walletType, group: walletGroup, openingBalance: amount, purpose: '', icon: brand ? `brand:${brand.key}` : walletIcons[walletType], color: brand ? brand.bg.toLowerCase() : presetHex('teal'), cardStyle: 'soft', isReserved: groupDefaults[walletGroup].isReserved, isSpendable: groupDefaults[walletGroup].isSpendable, includeInNetWorth: true, canPay: true, canReceive: true, canTransferOut: true, canTransferIn: true, displayOrder: data.wallets.length });
        success = `Dompet ${name.trim()} ditambahkan.`; detail = `${walletTypes.find(([key]) => key === walletType)?.[1]} · saldo awal ${money}`;
        break;
      case 'balance': {
        const wallet = balanceOf!;
        run = () => import('@/lib/finance-store').then(async store => {
          // A stored balance that drifted from the transactions is lined up with them first (like "Hitung ulang saldo"),
          // then the difference to the real balance is recorded as an adjustment.
          const check = await store.walletBalancePreview(uid, wallet.id);
          if (check.cached !== check.calculated) await store.repairWalletCache(uid, wallet.id, check.cached);
          if (amount !== check.calculated) await store.reconcileWallet(uid, wallet.id, check.calculated, amount, '', today);
        });
        success = `Saldo ${wallet.name} diperbarui jadi ${money}.`; detail = 'Selisihnya tercatat sebagai penyesuaian di riwayat transaksi';
        break;
      }
      case 'category_new': {
        const siblings = data.categories.filter(c => !c.isArchived && c.type === categoryType && (c.parentId || '') === parentId);
        run = () => saveRecord<Category>(uid, 'categories', { name: name.trim(), type: categoryType, parentId: parentId || null, icon: categoryIcon, color: parentId ? '' : presetHex('teal'), isArchived: false, sortOrder: siblings.length });
        success = parent ? `Subkategori ${name.trim()} ditambahkan di ${parent.name}.` : `Kategori ${name.trim()} ditambahkan.`; detail = categoryTypes.find(([key]) => key === categoryType)?.[1] || '';
        break;
      }
      case 'recurring_new':
        run = () => saveRecord<Recurring>(uid, 'recurring', { name: name.trim(), type: flow, amount, walletId, destinationWalletId: null, categoryId: flowCategory || null, frequency, mode: scheduleMode, nextDate: date, anchorDay, active: true });
        success = `Jadwal rutin ${name.trim()} tersimpan.`; detail = [money, frequencyText, walletName(walletId)].join(' · ');
        break;
      case 'plan_new': {
        const chosen = data.categories.find(c => c.id === flowCategory);
        run = () => import('@/lib/finance-store').then(store => store.savePlan(uid, { title: name.trim(), type: flow, amount, date, walletId: walletId || null, categoryId: chosen ? chosen.parentId || chosen.id : null, subcategoryId: chosen?.parentId ? chosen.id : null, notes: '', committed: flow === 'expense' && committed, status: 'planned' }));
        success = 'Rencana tersimpan. Saldo dompet belum berubah.'; detail = [name.trim(), money, formatDate(date)].join(' · ');
        break;
      }
      case 'note_new':
        run = () => import('@/lib/finance-store').then(store => store.saveFinancialNote(uid, { title: name.trim(), description: '', date, ...(amount ? { amount } : {}) }));
        success = result.reminder ? 'Pengingat tersimpan di kalender.' : 'Catatan tersimpan di kalender.'; detail = [name.trim(), formatDate(date)].join(' · ');
        break;
      case 'debt_new': run = () => createDebt(uid, { name: name.trim(), provider: person.trim(), originalAmount: amount, dueDate: '', interestRate: 0, installmentAmount: 0, notes: '' }, walletId || undefined, date); detail = [person && `dari ${person}`, walletId && `masuk ke ${walletName(walletId)}`].filter(Boolean).join(' · '); break;
      case 'receivable_new': run = () => createReceivable(uid, { person: person.trim(), description: description.trim(), originalAmount: amount, sourceWalletId: walletId || '', date, dueDate: '', status: 'open' }); detail = [person, description, walletId && `dari ${walletName(walletId)}`].filter(Boolean).join(' · '); break;
      case 'claim_new': run = () => createClaim(uid, { name: name.trim(), amount, sourceWalletId: walletId, submissionDate: date, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '' }); detail = `${name} · dari ${walletName(walletId)}`; break;
      case 'wish': { const item = data.wishlist.find(w => w.id === linkId)!; run = () => saveWish(uid, { saved: (item.saved || 0) + amount, history: [...(item.history || []), { date, amount }].slice(-60) }, item.id); detail = item.name; break; }
      default: {
        const tx = newTx({ ...preset(), type: result.preset.type!, amount, walletId, date, time: result.preset.time || (date === today ? timeInTimeZone(profile?.timeZone) : ''), ...((kind === 'expense' || kind === 'income') && person.trim() ? { counterparty: person.trim() } : {}) } as Partial<LedgerTx> & Pick<LedgerTx, 'type' | 'amount' | 'walletId'>);
        validateTx(tx);
        run = () => upsertTransaction(uid, tx);
        detail = [tx.description || tx.merchant, category?.name, kind === 'transfer' || kind === 'target' ? `${walletName(walletId)} → ${walletName(destination)}` : walletName(walletId), date !== today ? dayText(date) : ''].filter(Boolean).join(' · ');
      }
    }
    const retryPreset = preset();
    return { run, pending: `Menyimpan ${label.toLowerCase()}…`, success, detail, failure: `${label} belum tersimpan`, retry: txKinds.has(kind) ? { label: 'Buka formulir', run: () => onOpenForm(retryPreset) } : undefined };
  }
  const openForm = txKinds.has(kind) ? () => onOpenForm(preset()) : undefined;
  useEffect(() => { register(action.id, { missing, build, openForm, kind, amount }); });
  useEffect(() => () => register(action.id, null), [action.id, register]);

  const tone = toneOf(kind, flow);
  const textual = kind === 'open' || kind === 'category_new' || kind === 'note_new' || kind === 'wallet_new';
  const headline = kind === 'open' ? result.menu?.label || 'Menu belum dikenali' : textual ? name.trim() || (kind === 'wallet_new' ? 'Nama dompetnya?' : kind === 'category_new' ? 'Nama kategorinya?' : 'Isi catatannya?') : amount ? rupiah(amount) : 'Nominalnya berapa?';
  const Icon = icons[kind];
  const picture = kind === 'category_new' ? <Emoji e={categoryIcon}/> : kind === 'wish_new' ? <Emoji e={goal?.emoji || '🎁'}/> : kind === 'wallet_new' ? <AppIcon icon={brand ? `brand:${brand.key}` : walletIcons[walletType]}/> : <Icon size={18}/>;

  // Short facts under the headline.
  const facts: ReactNode[] = [];
  const fact = (key: string, content: ReactNode, className = '') => facts.push(<span key={key} className={className}>{content}</span>);
  switch (kind) {
    case 'expense': case 'income':
      if (result.preset.description) fact('d', result.preset.description); if (result.preset.merchant) fact('m', result.preset.merchant);
      if (person.trim()) fact('p', `${result.personCue === 'from' ? 'dari' : 'ke'} ${person.trim()}`);
      if (category) fact('c', category.name, 'qp-cat'); else if (kind === 'expense') fact('c', 'Tanpa kategori', 'qp-missing');
      fact('t', `${dayText(date)}${result.preset.time && !edit.date ? ` · ${result.preset.time}` : action.daypart && !edit.date ? ` ${action.daypart}` : ''}`);
      if (walletId) fact('w', walletName(walletId));
      break;
    case 'transfer': fact('w', `${walletName(walletId) || 'Dari?'} → ${walletName(destination) || 'Ke?'}`, walletId && destination && walletId !== destination ? '' : 'qp-missing'); fact('t', dayText(date)); break;
    case 'open': fact('o', result.menu?.target && result.menu.key === 'wallets' ? 'Buka detail dompet ini' : 'Pindah ke menu ini'); break;
    case 'budget':
      fact('c', scopeParent ? `${scopeParent.name}${oldBudget ? '' : budgetSubs.length ? ` › ${budgetSubs.length > 3 ? `${budgetSubs.length} subkategori` : budgetSubs.map(id => data.categories.find(c => c.id === id)?.name).join(', ')}` : ' · semua subkategori'}` : 'Kategori belum dipilih', scopeParent ? 'qp-cat' : 'qp-missing');
      fact('p', oldBudget ? periodText(oldBudget.cycleType, oldBudget.cycleStartDay || salaryDay) : periodText(cycleType, cycleDay));
      if (oldBudget) fact('b', `Sebelumnya ${rupiah(oldBudget.amount)}`); break;
    case 'fund_new':
      if (oldFund) { fact('b', oldFund.name, 'qp-cat'); fact('n', `Target sekarang ${rupiah(oldFund.targetAmount)}`); break; }
      fact('n', name.trim() || 'Nama belum ada', name.trim() ? 'qp-cat' : 'qp-missing'); if (goal?.emergency) fact('e', 'Dana darurat');
      if (targetDate) fact('d', `Tenggat ${formatDate(targetDate)}`); if (goal?.monthly) fact('m', `Nabung ${rupiah(goal.monthly)}/bulan`); if (walletId) fact('w', `Disimpan di ${walletName(walletId)}`); break;
    case 'wish_new':
      fact('n', name.trim() || 'Nama barang belum ada', name.trim() ? 'qp-cat' : 'qp-missing'); fact('p', priorityLabels[goal?.priority || 2]);
      if (goal?.monthly) fact('m', `Nabung ${rupiah(goal.monthly)}/bulan`); if (targetDate) fact('d', `Target ${formatDate(targetDate)}`); break;
    case 'wallet_new': fact('t', walletTypes.find(([key]) => key === walletType)?.[1] || ''); fact('g', `Kelompok ${groupLabels[walletGroup]}`); fact('o', `Saldo awal ${rupiah(amount)}`, amount ? '' : 'qp-soft'); break;
    case 'balance':
      if (balanceOf) { fact('w', balanceOf.name, 'qp-cat'); fact('n', `Tercatat ${rupiah(balanceOf.cachedBalance)}`); if (delta) fact('x', `${delta > 0 ? '+' : '−'}${rupiah(Math.abs(delta))}`, delta > 0 ? 'qp-up' : 'qp-down'); }
      fact('h', 'Selisihnya dicatat sebagai penyesuaian', 'qp-soft'); break;
    case 'category_new': fact('t', categoryTypes.find(([key]) => key === categoryType)?.[1] || ''); if (parent) fact('p', `di dalam ${parent.name}`, 'qp-cat'); break;
    case 'recurring_new':
      fact('n', name.trim() || 'Nama belum ada', name.trim() ? 'qp-cat' : 'qp-missing'); fact('f', frequencyText); fact('d', `Mulai ${dayText(date)}`);
      if (flowCategoryRecord) fact('c', flowCategoryRecord.name); if (walletId) fact('w', walletName(walletId)); if (scheduleMode !== 'inbox') fact('m', modes.find(([key]) => key === scheduleMode)?.[1].split(' · ')[0] || ''); break;
    case 'plan_new':
      fact('n', name.trim() || 'Judul belum ada', name.trim() ? 'qp-cat' : 'qp-missing'); fact('t', date ? dayText(date) : 'Tanggal?', date ? '' : 'qp-missing'); if (flowCategoryRecord) fact('c', flowCategoryRecord.name); if (walletId) fact('w', walletName(walletId));
      fact('s', 'Saldo belum berubah', 'qp-soft'); break;
    case 'note_new': fact('t', dayText(date)); if (amount) fact('a', rupiah(amount)); break;
    default: fact('t', dayText(date));
  }

  const field = (label: string, control: ReactNode, key = label) => <label className="qp-field" key={key}><span>{label}</span>{control}</label>;
  const nameField = (label: string, placeholder = '') => field(label, <Input value={name} onChange={e => change({ name: e.target.value })} placeholder={placeholder}/>);
  const walletSelect = (label: string, empty: string) => field(label, <Select value={walletId} onChange={e => change({ walletId: e.target.value })}><option value="">{empty}</option>{choices.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select>);
  const flowSelect = field('Jenis', <Select value={flow} onChange={e => change({ flow: e.target.value as 'expense' | 'income', categoryId: '' })}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></Select>);
  const fields: ReactNode[] = [];
  // The amount can be typed here when the text had none, or had two.
  const amountOpen = !textual && (!result.amount || action.fields.amount?.status === 'check' || edit.amount !== undefined);
  if (amountOpen) fields.push(field('Nominal', <Input inputMode="numeric" value={amount ? amount.toLocaleString('id-ID') : ''} onChange={e => change({ amount: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="Mis. 25.000"/>, 'amount'));
  switch (kind) {
    case 'budget':
      if (!oldBudget) fields.push(field('Kategori', <Select value={scopeParent?.id || ''} onChange={e => change({ categoryId: e.target.value, subIds: [] })}><option value="">Pilih kategori</option>{topLevel(['expense', 'savings']).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>),
        ...(scopeChildren.length ? [<div className="qp-subs" key="subs"><span>Subkategori</span><div className="qp-sub-chips"><button type="button" className={`sb-chip ${!budgetSubs.length ? 'is-on' : ''}`} aria-pressed={!budgetSubs.length} onClick={() => change({ subIds: [] })}>Semua</button>{scopeChildren.map(c => <button type="button" key={c.id} className={`sb-chip ${budgetSubs.includes(c.id) ? 'is-on' : ''}`} aria-pressed={budgetSubs.includes(c.id)} onClick={() => toggleSub(c.id)}>{budgetSubs.includes(c.id) && <Check size={13}/>}<Emoji e={emojiOrFallback(c.icon)}/> {c.name}</button>)}</div><small>{budgetSubs.length ? `Hanya ${budgetSubs.length} subkategori yang dihitung.` : `Semua pengeluaran ${scopeParent?.name} dihitung.`}</small></div>] : []),
        field('Periode', <Select value={cycleType} onChange={e => change({ cycleType: e.target.value as Budget['cycleType'] })}>{(['salary', 'calendar', 'weekly', ...(budget?.cycleType === 'custom' ? ['custom'] : [])] as Budget['cycleType'][]).map(type => <option key={type} value={type}>{periodText(type, type === 'weekly' ? 1 : type === 'custom' ? cycleDay : salaryDay)}</option>)}</Select>));
      break;
    case 'fund_new':
      if (!oldFund) fields.push(nameField('Nama', 'Mis. Liburan Bali'), field('Tenggat', <Input type="date" value={targetDate} onChange={e => change({ date: e.target.value })}/>), walletSelect('Disimpan di', 'Pilih nanti'));
      break;
    case 'wish_new': fields.push(nameField('Barang', 'Mis. Headphone')); break;
    case 'wallet_new':
      fields.push(nameField('Nama', 'Mis. Jago'), field('Jenis', <Select value={walletType} onChange={e => change({ walletType: e.target.value as Wallet['type'] })}>{walletTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>));
      break;
    case 'balance': fields.push(walletSelect('Dompet', 'Pilih dompet')); break;
    case 'category_new':
      fields.push(nameField('Nama', 'Mis. Jajan'), field('Induk', <Select value={parentId} onChange={e => change({ parentId: e.target.value })}><option value="">Tidak ada (kategori utama)</option>{topLevel(['expense', 'income', 'savings']).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>));
      if (!parentId) fields.push(field('Jenis', <Select value={categoryType} onChange={e => change({ categoryType: e.target.value as Category['type'] })}>{categoryTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>));
      break;
    case 'recurring_new':
      fields.push(nameField('Nama', 'Mis. Netflix'), flowSelect,
        field('Ulangi', <Select value={frequency} onChange={e => change({ frequency: e.target.value as Recurring['frequency'] })}>{frequencies.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>),
        field('Mulai', <Input type="date" value={date} onChange={e => change({ date: e.target.value })}/>),
        field('Kategori', <Select value={flowCategory} onChange={e => change({ categoryId: e.target.value })}><option value="">Pilih kategori</option>{topLevel([flow]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>),
        walletSelect(flow === 'income' ? 'Masuk ke' : 'Dari dompet', 'Pilih dompet'),
        field('Perilaku', <Select value={scheduleMode} onChange={e => change({ scheduleMode: e.target.value as Recurring['mode'] })}>{modes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>));
      break;
    case 'plan_new':
      fields.push(nameField('Judul', 'Mis. Bayar arisan'), flowSelect, field('Tanggal', <Input type="date" value={date} onChange={e => change({ date: e.target.value })}/>),
        field('Kategori', <Select value={flowCategory} onChange={e => change({ categoryId: e.target.value })}><option value="">Pilih nanti</option>{withChildren([flow]).map(c => <option key={c.id} value={c.id}>{categoryName(c)}</option>)}</Select>),
        walletSelect('Dompet', 'Pilih saat mencatat'));
      if (flow === 'expense') fields.push(<label className="qp-check" key="committed"><input type="checkbox" checked={committed} onChange={e => change({ committed: e.target.checked })}/> Sudah pasti · hitung sebagai komitmen anggaran</label>);
      break;
    case 'note_new': fields.push(nameField('Isi', 'Mis. Perpanjang STNK'), field('Tanggal', <Input type="date" value={date} onChange={e => change({ date: e.target.value })}/>)); break;
    case 'open': break;
    default:
      if (kind === 'debt_new' || kind === 'receivable_new') fields.push(field(kind === 'debt_new' ? 'Dipinjam dari' : 'Dipinjam oleh', <Input value={person} onChange={e => change({ person: e.target.value })} placeholder="Nama orang"/>));
      if (kind === 'debt_new' || kind === 'claim_new') fields.push(nameField(kind === 'debt_new' ? 'Nama utang' : 'Nama klaim'));
      if (kind === 'receivable_new') fields.push(field('Keperluan', <Input value={description} onChange={e => change({ description: e.target.value })} placeholder="Opsional, mis. makan siang"/>));
      if (linkOptions.length > 0) fields.push(field(kind === 'debt_payment' ? 'Utang' : kind === 'receivable_payment' ? 'Piutang' : kind === 'claim_payment' ? 'Klaim' : kind === 'wish' ? 'Wish list' : 'Target', <Select value={linkId} onChange={e => change({ linkId: e.target.value })}><option value="">Pilih…</option>{linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>));
      if (kind !== 'wish') fields.push(field(kind === 'debt_new' ? 'Uangnya masuk ke' : kind === 'receivable_new' ? 'Uangnya keluar dari' : kind === 'transfer' ? 'Dari dompet' : incoming.has(kind) ? 'Masuk ke dompet' : 'Dari dompet', <Select value={walletId} onChange={e => change({ walletId: e.target.value })}>{(kind === 'debt_new' || kind === 'receivable_new') ? <option value="">Tanpa dompet (saldo tidak berubah)</option> : <option value="">{kind === 'transfer' ? 'Pilih dompet asal' : 'Pilih dompet'}</option>}{choices.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select>, 'wallet'));
      if (kind === 'transfer') fields.push(field('Ke dompet', <Select value={destination} onChange={e => change({ destinationId: e.target.value })}><option value="">Pilih dompet tujuan</option>{walletsFor('transferIn').filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select>, 'to'));
      if (kind === 'target' && fund) fields.push(<small className="qp-note" key="note">Masuk ke {walletName(destination) || 'dompet target'}</small>);
  }

  // One-tap choices the text left open.
  const picks: ReactNode[] = [];
  if (!choice && action.options.amount && !touched.amount) picks.push(<span key="a" className="qp-picks" role="group" aria-label="Pilih nominal">{action.options.amount.map(v => <button type="button" key={v} className="sb-chip" onClick={() => change({ amount: v })}>{rupiah(v)}</button>)}</span>);
  if (!choice && action.options.date && !touched.date) picks.push(<span key="d" className="qp-picks" role="group" aria-label="Pilih tanggal">{action.options.date.map(d => <button type="button" key={d.date} className="sb-chip" onClick={() => change({ date: d.date })}>{dayText(d.date)} <small>“{d.label}”</small></button>)}</span>);
  if (!choice && action.options.wallet && !touched.wallet) picks.push(<span key="w" className="qp-picks" role="group" aria-label="Pilih dompet">{action.options.wallet.map(id => <button type="button" key={id} className="sb-chip" onClick={() => change({ walletId: id })}>{walletName(id)}</button>)}</span>);
  const shortLink = (id: string) => (linkOptions.find(o => o.id === id)?.label || '').split(' · ')[0];
  const answers: [string, string, () => void][] = !ask ? [] : ask.field === 'wallet' ? (ask.choices || []).filter(id => choices.some(w => w.id === id)).slice(0, 6).map(id => [id, walletName(id), () => change({ walletId: id })])
    : ask.field === 'to' ? (ask.choices || []).filter(id => walletsFor('transferIn').some(w => w.id === id)).slice(0, 6).map(id => [id, walletName(id), () => change({ destinationId: id })])
    : ask.field === 'link' ? (ask.choices || []).filter(id => linkOptions.some(o => o.id === id)).slice(0, 4).map(id => [id, shortLink(id), () => change({ linkId: id })])
    : ask.field === 'amount' ? (action.options.amount || []).map(v => [String(v), rupiah(v), () => change({ amount: v })])
    : ask.field === 'date' ? (action.options.date || []).map(d => [d.date, dayText(d.date), () => change({ date: d.date })])
    : ask.field === 'kind' ? [[kind, QUICK_LABELS[kind], () => setKindOk(true)] as [string, string, () => void], ...action.alternatives.map((alt, i) => [alt.kind, alt.label, () => setChoice(i + 1)] as [string, string, () => void])] : [];
  const askBlock = ask && <div className="qp-ask" role="group" aria-label={ask.question}><span className="qp-ask-q"><HelpCircle size={14} aria-hidden="true"/>{ask.question}</span>{answers.length > 0 && <span className="qp-picks">{answers.map(([key, label, pick]) => <button type="button" key={key} className="sb-chip" onClick={pick}>{label}</button>)}</span>}</div>;
  if (ask) for (let i = picks.length - 1; i >= 0; i--) if ((picks[i] as { key?: string }).key === { amount: 'a', date: 'd', wallet: 'w' }[ask.field as 'amount']) picks.splice(i, 1);
  const flagList = flags.length > 0 && <div className="qp-flags">{flags.map(([key, f]) => <small key={key} className={`qp-flag is-${f.status}`}><b>{statusIcon[f.status]} {FIELD_STATUS[f.status]}</b> · {FIELD_LABELS[key]}{f.note ? `: ${f.note}` : ''}</small>)}{!choice && action.warnings.filter(w => !flags.some(([, f]) => f.note && w.includes(f.note))).map(w => <small key={w} className="qp-flag is-check"><b>! Perlu dicek</b> · {w}</small>)}</div>;
  const switcher = action.alternatives.length > 0 && ask?.field !== 'kind' && <div className="qp-alts" role="group" aria-label="Bukan ini?"><small>Bukan ini?</small>{choice > 0 && <button type="button" className="sb-chip" onClick={() => setChoice(0)}>{QUICK_LABELS[action.result.kind]}</button>}{action.alternatives.map((alt, i) => i + 1 === choice ? null : <button type="button" key={alt.kind} className="sb-chip" onClick={() => setChoice(i + 1)}>{alt.label}</button>)}</div>;
  const reasons = !choice && action.evidence.length > 0 && <>{why && <ul className="qp-why-list">{action.evidence.map(e => <li key={e}>{e}</li>)}</ul>}</>;
  const whyButton = !choice && action.evidence.length > 0 && <button type="button" className="qp-why-toggle" aria-expanded={why} onClick={() => setWhy(v => !v)}>{why ? 'Tutup alasan' : 'Kenapa?'}</button>;
  // Clean text by default; the editors open with "Ubah", or by themselves where something must be chosen.
  const showFields = fields.length > 0 && (details || Boolean(missing) || amountOpen || kind === 'budget' && !oldBudget && !budgetScope);
  const body = <>
    {(facts.length > 0 || whyButton) && <div className="qp-facts">{facts}{whyButton}</div>}
    {askBlock}
    {flagList}
    {picks.length > 0 && <div className="qp-pick-row">{picks}</div>}
    {showFields && <div className="qp-fields">{fields}</div>}
    {reasons}
    {switcher}
  </>;

  if (layout === 'row') {
    const cat = data.categories.find(c => c.id === (result.budget ? result.budget.subcategoryIds[0] || result.budget.categoryId : result.preset.subcategoryId || result.preset.categoryId));
    const detail = kind === 'budget' ? (result.budget?.id ? 'ubah nominal' : 'anggaran baru') : kind === 'transfer' ? `${walletName(walletId) || 'Dari?'} → ${walletName(destination) || 'Ke?'}` : kind === 'note_new' ? `${heading} · ${dayText(date)}` : textual ? heading : [kind === 'expense' || kind === 'income' ? description !== cat?.name ? description || result.preset.merchant : '' : description || result.preset.merchant || name, walletName(walletId) && `${walletName(walletId)}${walletIsDefault ? ' (bawaan)' : ''}`, date && date !== today ? dayText(date) : ''].filter(Boolean).join(' · ');
    const attention = !skipped && Boolean(missing || flags.length || ask);
    // The row already shows the amount and the wallets: the question without them ("Dari dompet mana?").
    const shortAsk = ask?.question.replace(/^Rp[\d.]+(?:\s+(?:ke|dari)\s+\S+|\s+ini)?\s+/, '');
    const rowAsk = shortAsk ? shortAsk[0].toUpperCase() + shortAsk.slice(1) : '';
    const rowTitle = textual ? headline : kind === 'expense' || kind === 'income' ? cat?.name || description || heading : kind === 'budget' ? `Anggaran ${result.name || cat?.name || ''}`.trim() : heading;
    return <li className={`qb-card tone-${tone} ${skipped ? 'is-off' : ''} ${expanded ? 'is-open' : ''}`}>
      <div className="qb-row">
        <span className="qb-icon" aria-hidden="true"><Icon size={15}/></span>
        <button type="button" className="qb-main" aria-expanded={expanded} onClick={onToggle}><strong>{rowTitle}</strong><small>{detail || action.text}</small>{attention && <em className="qb-attention"><AlertTriangle size={12}/> {rowAsk || flags[0]?.[1].note || missing}</em>}</button>
        {!textual && <b className="qb-amount">{amount ? rupiah(amount) : 'Nominal?'}</b>}
        <button type="button" className="qb-drop" aria-label={skipped ? `Pakai lagi ${action.text}` : `Lewati ${action.text}`} onClick={onSkip}>{skipped ? <RotateCcw size={15}/> : <X size={15}/>}</button>
      </div>
      {(expanded || attention) && !skipped && <div className="qb-body">
        <small className="qb-source">“{action.text}”</small>
        {/* The row already says what it is and the first thing to fix; the body only adds what to do about it. */}
        {ask && answers.length > 0 && <div className="qp-ask"><span className="qp-picks">{answers.map(([key, label, pick]) => <button type="button" key={key} className="sb-chip" onClick={pick}>{label}</button>)}</span></div>}
        {flags.length > (ask ? 0 : 1) && <div className="qp-flags">{flags.slice(ask ? 0 : 1).map(([key, f]) => <small key={key} className={`qp-flag is-${f.status}`}><b>{statusIcon[f.status]} {FIELD_STATUS[f.status]}</b> · {FIELD_LABELS[key]}{f.note ? `: ${f.note}` : ''}</small>)}</div>}
        {picks.length > 0 && <div className="qp-pick-row">{picks}</div>}
        {showFields && <div className="qp-fields">{fields}</div>}
        {reasons}
        {switcher}
        {(error || missing && !flags.length && !ask) && <small className="qp-warn" role="status">{error || missing}</small>}
        <div className="qb-foot">{whyButton}{fields.length > 0 && !showFields && <button type="button" className="qp-form-link" onClick={() => setDetails(true)}>Ubah</button>}</div>
      </div>}
    </li>;
  }

  return <div className={`quick-preview tone-${tone}`}>
    <div className="qp-head"><span className="qp-icon" aria-hidden="true">{picture}</span><span className="qp-title"><small>{heading}</small><strong className={textual || !amount ? 'is-text' : ''}>{headline}</strong></span>{!action.alternatives.length && kind !== 'open' && onSwitchMode && sibling[kind] && <button type="button" className="qp-switch" onClick={() => onSwitchMode(sibling[kind]!)}><small>Bukan ini?</small>{QUICK_LABELS[sibling[kind]!]}</button>}</div>
    {body}
    {(error || outerError || missing && !flags.length && !ask) && <small className="qp-warn" role="status">{error || outerError || missing}</small>}
    <div className="qp-actions">{openForm && details && <button type="button" className="qp-form-link" onClick={openForm}>Buka formulir lengkap</button>}{fields.length > 0 && !missing && !amountOpen && <Button type="button" variant="secondary" aria-expanded={details} onClick={() => setDetails(open => !open)}>{details ? 'Selesai' : 'Ubah'}</Button>}<Button type="button" onClick={() => { setError(''); onSave?.(); }} disabled={Boolean(missing)}>{kind === 'open' ? `Buka ${result.menu?.label || ''}`.trim() : 'Simpan'}</Button></div>
  </div>;
}
