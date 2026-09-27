'use client';
import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeftRight, ArrowRight, Check, ListChecks, X, ArrowUpLeft, CalendarClock, ChartPie, Compass, CreditCard, FolderPlus, Gift, HandCoins, Repeat, Scale, ShieldCheck, Sparkles, StickyNote, Target, TrendingDown, TrendingUp, WalletCards, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Input, Select } from './fields';
import { Emoji } from './emoji';
import { AppIcon, brandForName, emojiLibrary, emojiOrFallback } from './visual-identity';
import { groupOf, parseQuickBatch, parseQuickText, QUICK_GROUPS, QUICK_LABELS, type QuickBatchItem, type QuickGroup, type QuickKind } from '@/lib/quick-entry';
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
type Example = { text: string; kind: QuickKind; result: string; section?: string };
const examples: Record<QuickGroup, Example[]> = {
  auto: [
    { text: 'beli kopi 25rb di kenangan', kind: 'expense', result: 'tempat dan kategorinya terisi sendiri', section: 'Transaksi' },
    { text: 'gaji 7,5jt masuk bca', kind: 'income', result: 'Rp7.500.000 masuk ke BCA' },
    { text: 'pinjam 500rb dari budi', kind: 'debt_new', result: 'kamu berutang ke Budi' },
    { text: 'kemarin makan 25rb, parkir goceng, bensin 30rb pakai gopay', kind: 'expense', result: '3 pengeluaran sekaligus, kemarin, dari GoPay' },
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
    { text: 'topup gopay 100rb', kind: 'transfer', result: 'isi saldo dari dompet utama' },
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
type Edit = { person?: string; name?: string; description?: string; walletId?: string; linkId?: string; categoryId?: string; cycleType?: Budget['cycleType']; date?: string; walletType?: Wallet['type']; categoryType?: Category['type']; parentId?: string; scheduleMode?: Recurring['mode']; frequency?: Recurring['frequency']; flow?: 'expense' | 'income'; committed?: boolean; /** Budget: the subcategories it covers (none = all of the main category). */ subIds?: string[] };

export function QuickEntryBox({ onOpenForm, onDone, onNavigate, autoFocus = false }: { onOpenForm: (preset: Partial<LedgerTx>) => void; onDone?: () => void; onNavigate?: (key: string, target?: string) => void; autoFocus?: boolean }) {
  const { data, profile, user } = useApp();
  const { track } = useNotify();
  const [text, setText] = useState(''), [mode, setMode] = useState<QuickGroup | QuickKind>('auto'), [error, setError] = useState('');
  const [edit, setEdit] = useState<Edit>({}), [details, setDetails] = useState(false);
  const today = todayInTimeZone(profile?.timeZone), salaryDay = profile?.salaryCycleStartDay || 24;
  const result = useMemo(() => text.trim() ? parseQuickText(text, { wallets: data.wallets, categories: data.categories, history: data.transactions, today, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist, budgets: data.budgets }, mode) : null, [text, mode, data, today]);
  const ctxFor = useMemo(() => ({ wallets: data.wallets, categories: data.categories, history: data.transactions, today, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist, budgets: data.budgets }), [data, today]);
  /** Several entries at once ("makan 25rb, parkir 5rb", or one per line). */
  const batch = useMemo(() => text.trim() ? parseQuickBatch(text, ctxFor, mode) : null, [text, mode, ctxFor]);
  const [dropped, setDropped] = useState<number[]>([]);
  useEffect(() => { setDropped([]); }, [text]);
  const kind = result?.kind;
  // A different kind means different fields: start them fresh.
  useEffect(() => { setEdit({}); setError(''); setDetails(false); }, [kind]);
  const change = (patch: Edit) => setEdit(v => ({ ...v, ...patch }));

  const amount = result?.amount || 0;
  const isFlow = kind === 'recurring_new' || kind === 'plan_new';
  const flow: 'expense' | 'income' = edit.flow ?? (result?.preset.type === 'income' ? 'income' : 'expense');
  const txType = isFlow ? flow : result?.preset.type;
  const walletsFor = (action: 'pay' | 'receive' | 'transferOut' | 'transferIn') => data.wallets.filter(w => walletAllows(w as Wallet, action));
  const sourceAction = txType ? walletActions({ type: txType, adjustmentDirection: 'in' }).source as 'pay' | 'receive' | 'transferOut' : kind === 'debt_new' ? 'receive' : 'pay';
  const choices = kind === 'balance' || kind === 'fund_new' ? data.wallets.filter(w => !w.isArchived) : walletsFor(sourceAction);
  const preferred = kind && (incoming.has(kind) || isFlow && flow === 'income') ? profile?.defaultIncomeWalletId : profile?.defaultExpenseWalletId;
  // These only use a wallet that is named or picked: new debts and receivables (like their own forms), plans, tujuan dana, a balance.
  const optionalWallet = kind === 'debt_new' || kind === 'receivable_new' || kind === 'plan_new' || kind === 'fund_new' || kind === 'balance';
  const presetDestination = result?.preset.destinationWalletId || '';
  const fallbackWallet = optionalWallet ? '' : (choices.find(w => w.id === preferred && w.id !== presetDestination) || choices.find(w => w.id !== presetDestination))?.id || '';
  const walletId = edit.walletId ?? result?.preset.walletId ?? fallbackWallet;
  const linkOptions = kind === 'debt_payment' ? data.debts.filter(d => d.outstandingAmount > 0).map(d => ({ id: d.id, label: `${d.name} · sisa ${rupiah(d.outstandingAmount)}` }))
    : kind === 'receivable_payment' ? data.receivables.filter(r => r.remainingAmount > 0).map(r => ({ id: r.id, label: `${r.person} · sisa ${rupiah(r.remainingAmount)}` }))
    : kind === 'claim_payment' ? data.claims.filter(c => c.remainingAmount > 0).map(c => ({ id: c.id, label: `${c.name} · sisa ${rupiah(c.remainingAmount)}` }))
    : kind === 'target' ? data.funds.filter(f => !f.isArchived).map(f => ({ id: f.id, label: f.name }))
    : kind === 'wish' ? data.wishlist.filter(w => w.status === 'active').map(w => ({ id: w.id, label: `${w.name} · ${rupiah(w.saved || 0)} / ${rupiah(w.price)}` })) : [];
  const presetLink = kind === 'debt_payment' ? result?.preset.debtId : kind === 'receivable_payment' ? result?.preset.receivableId : kind === 'claim_payment' ? result?.preset.claimId : kind === 'target' ? result?.preset.fundId : kind === 'wish' ? result?.wishId : '';
  const linkId = edit.linkId ?? presetLink ?? '';
  const fund = kind === 'target' ? data.funds.find(f => f.id === linkId) : undefined;
  const destination = kind === 'target' ? fund?.linkedWalletId || (fund?.walletIds?.length === 1 ? fund.walletIds[0] : '') : presetDestination;
  const person = edit.person ?? result?.person ?? '', name = edit.name ?? result?.name ?? '', description = edit.description ?? result?.preset.description ?? '';
  const date = edit.date ?? result?.date ?? today;
  const walletName = (id?: string | null) => data.wallets.find(w => w.id === id)?.name || '';
  const category = data.categories.find(c => c.id === (result?.preset.subcategoryId || result?.preset.categoryId));
  const categoryName = (c?: Pick<Category, 'name' | 'parentId'>) => c ? c.parentId ? `${data.categories.find(p => p.id === c.parentId)?.name || ''} › ${c.name}` : c.name : '';
  const bySort = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
  const topLevel = (types: Category['type'][]) => data.categories.filter(c => !c.isArchived && !c.parentId && types.includes(c.type)).sort(bySort);
  const withChildren = (types: Category['type'][]) => topLevel(types).flatMap(p => [p, ...data.categories.filter(c => !c.isArchived && c.parentId === p.id).sort(bySort)]);
  const dayText = (value: string) => { const d = new Date(`${today}T12:00:00`), plus = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); }; return value === today ? 'Hari ini' : value === plus(1) ? 'Besok' : value === plus(-1) ? 'Kemarin' : formatDate(value, value.slice(0, 4) !== today.slice(0, 4)); };

  // Anggaran
  const budget = result?.budget, oldBudget = budget?.id ? data.budgets.find(b => b.id === budget.id) : undefined;
  const budgetScope = edit.categoryId ?? (budget ? budget.subcategoryIds[0] || budget.categoryId || '' : '');
  const scopeCategory = data.categories.find(c => c.id === budgetScope);
  const scopeParent = scopeCategory ? (scopeCategory.parentId ? data.categories.find(c => c.id === scopeCategory.parentId) : scopeCategory) : undefined;
  const scopeChildren = scopeParent ? data.categories.filter(c => !c.isArchived && c.parentId === scopeParent.id).sort(bySort) : [];
  const budgetSubs = edit.subIds ?? (edit.categoryId ? (scopeCategory?.parentId ? [scopeCategory.id] : []) : budget?.subcategoryIds || []);
  const budgetName = !scopeParent ? '' : !budgetSubs.length || budgetSubs.length === scopeChildren.length ? scopeParent.name : edit.subIds || edit.categoryId ? (budgetSubs.length > 3 ? `${scopeParent.name} (${budgetSubs.length} subkategori)` : budgetSubs.map(id => data.categories.find(c => c.id === id)?.name || '').join(' & ')) : result?.name || scopeParent.name;
  const toggleSub = (id: string) => change({ subIds: budgetSubs.includes(id) ? budgetSubs.filter(x => x !== id) : [...budgetSubs, id] });
  const cycleType = edit.cycleType ?? budget?.cycleType ?? 'salary';
  const cycleDay = cycleType === 'weekly' ? (edit.cycleType ? 1 : budget?.cycleStartDay || 1) : cycleType === 'custom' ? budget?.cycleStartDay || salaryDay : salaryDay;
  const periodText = (type: Budget['cycleType'], day: number) => type === 'weekly' ? `Mingguan · mulai ${weekdays[(day - 1) % 7]}` : type === 'calendar' ? 'Bulan kalender' : type === 'custom' ? `Mulai tanggal ${day}` : 'Siklus gaji';
  // Tujuan dana and wish list
  const goal = result?.goal;
  const oldFund = kind === 'fund_new' && goal?.existingId ? data.funds.find(f => f.id === goal.existingId) : undefined;
  const targetDate = edit.date ?? goal?.targetDate ?? '';
  const wishTwin = kind === 'wish_new' ? data.wishlist.find(w => w.status === 'active' && same(w.name, name)) : undefined;
  // Dompet
  const walletType = edit.walletType ?? result?.wallet?.type ?? 'bank';
  const walletTwin = kind === 'wallet_new' ? data.wallets.find(w => !w.isArchived && same(w.name, name)) : undefined;
  const brand = kind === 'wallet_new' ? brandForName(name) : undefined;
  const walletGroup: WalletGroup = walletType === 'investment' ? 'investment' : walletType === 'savings' ? 'savings' : 'operational';
  const balanceOf = kind === 'balance' ? data.wallets.find(w => w.id === walletId) : undefined;
  const delta = balanceOf ? amount - balanceOf.cachedBalance : 0;
  // Kategori
  const parentId = edit.parentId ?? result?.category?.parentId ?? '';
  const parent = data.categories.find(c => c.id === parentId);
  const categoryType = parent?.type ?? edit.categoryType ?? result?.category?.type ?? 'expense';
  const categoryTwin = kind === 'category_new' ? data.categories.find(c => !c.isArchived && same(c.name, name) && (c.parentId || '') === parentId && (parentId || c.type === categoryType)) : undefined;
  const categoryIcon = iconFor(name) || (parent ? emojiOrFallback(parent.icon) : '🗂️');
  // Jadwal rutin and rencana
  const flowCategory = edit.categoryId ?? (kind === 'plan_new' ? result?.preset.subcategoryId || result?.preset.categoryId : result?.preset.categoryId) ?? '';
  const flowCategoryRecord = data.categories.find(c => c.id === flowCategory);
  const scheduleMode = edit.scheduleMode ?? result?.schedule?.mode ?? 'inbox';
  const frequency = edit.frequency ?? result?.schedule?.frequency ?? 'monthly';
  const anchorDay = edit.date || !result?.schedule ? Number(date.slice(8, 10)) || 1 : result.schedule.anchorDay;
  const frequencyText = frequency === 'weekly' ? `Tiap ${weekdays[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]}` : frequency === 'yearly' ? `Tiap tahun, ${formatDate(date, false)}` : `Tiap bulan, tgl ${anchorDay}`;
  const committed = edit.committed ?? false;

  // What still stops a direct save (for transactions the form can always be opened instead).
  const missing = !result || !kind ? '' : (() => {
    switch (kind) {
      case 'open': return result.menu ? onNavigate ? '' : 'Menu ini belum bisa dibuka dari sini.' : 'Menu apa yang mau dibuka? Contoh: “buka laporan”.';
      case 'budget': return !amount ? 'Tulis nominal anggarannya, misalnya “anggaran makan 2jt”.' : !budgetScope ? 'Pilih kategori anggarannya.' : oldBudget && amount === oldBudget.amount ? `Anggaran ${oldBudget.name} sudah ${rupiah(amount)}.` : '';
      case 'fund_new': return !amount ? 'Tulis target nominalnya, misalnya “target liburan 10jt”.' : !oldFund && !name.trim() ? 'Beri nama tujuan dananya.' : oldFund && amount === oldFund.targetAmount ? `Target ${oldFund.name} sudah ${rupiah(amount)}.` : '';
      case 'wish_new': return !amount ? 'Tulis harganya, misalnya “pengen headphone 1,5jt”.' : !name.trim() ? 'Tulis nama barangnya.' : wishTwin ? `“${wishTwin.name}” sudah ada di wish list. Pilih “${QUICK_LABELS.wish}” untuk menyisihkan uang ke sana.` : '';
      case 'wallet_new': return !name.trim() ? 'Tulis nama dompetnya, misalnya “rekening baru jago”.' : walletTwin ? `Dompet ${walletTwin.name} sudah ada. Untuk mengubah saldonya, pilih “${QUICK_LABELS.balance}”.` : '';
      case 'balance': return !balanceOf ? 'Sebut dompetnya, misalnya “saldo bca sekarang 12jt”.' : !amount ? 'Tulis saldo sekarang, misalnya 12jt.' : !delta ? `Saldo ${balanceOf.name} sudah ${rupiah(amount)}, tidak ada yang berubah.` : '';
      case 'category_new': return !name.trim() ? 'Tulis nama kategorinya, misalnya “kategori baru jajan”.' : result.category?.parentAsked && !parentId ? 'Pilih kategori induknya.' : categoryTwin ? parent ? `${categoryTwin.name} sudah ada di ${parent.name}.` : `Kategori ${categoryTwin.name} sudah ada.` : '';
      case 'recurring_new': return !amount ? 'Tulis nominalnya, misalnya 54rb.' : !name.trim() ? 'Beri nama jadwalnya.' : !walletId ? 'Pilih dompetnya.' : scheduleMode === 'auto' && flow === 'expense' && !flowCategory ? 'Pilih kategori agar bisa dicatat otomatis.' : '';
      case 'plan_new': return !amount ? 'Tulis nominalnya, misalnya 200rb.' : !name.trim() ? 'Beri judul rencananya.' : !date ? 'Pilih tanggalnya.' : '';
      case 'note_new': return !name.trim() ? 'Tulis isi catatannya.' : !date ? 'Pilih tanggalnya.' : '';
      default: return kind === 'expense' && !result.preset.categoryId ? 'Kategorinya belum ketemu. Sebut kategorinya (mis. “makan”), atau tekan Ubah detail.'
        : txKinds.has(kind) && !walletId ? 'Pilih dompetnya dulu.'
        : kind === 'transfer' && (!destination || destination === walletId) ? 'Sebut dompet asal dan tujuan, mis. “dari bca ke gopay”.'
        : (kind === 'debt_payment' || kind === 'receivable_payment' || kind === 'claim_payment' || kind === 'wish') && !linkId ? 'Pilih catatan yang dimaksud di atas.'
        : kind === 'target' && !linkId ? 'Pilih tujuan dananya di atas.'
        : kind === 'target' && (!destination || destination === walletId) ? 'Tujuan dana ini belum punya dompet sendiri. Tekan Ubah detail untuk memilih dompet tujuan.'
        : kind === 'receivable_new' && !person.trim() ? 'Tulis nama orangnya.'
        : kind === 'claim_new' && (!name.trim() || !walletId) ? 'Lengkapi nama klaim dan dompet asalnya.'
        : kind === 'debt_new' && !name.trim() ? 'Beri nama utangnya.' : '';
    }
  })();

  function preset(): Partial<LedgerTx> {
    if (!result) return {};
    const base: Partial<LedgerTx> = { ...result.preset, walletId: walletId || undefined };
    if (kind === 'debt_payment') base.debtId = linkId; if (kind === 'receivable_payment') base.receivableId = linkId; if (kind === 'claim_payment') base.claimId = linkId;
    if (kind === 'target') { base.fundId = linkId; if (destination) base.destinationWalletId = destination; }
    return base;
  }
  function reset() { setText(''); setMode('auto'); }
  function openForm() { if (!result || !txKinds.has(result.kind)) return; const next = preset(); setText(''); onOpenForm(next); }
  function save() {
    if (!user || !result || !kind || missing) return;
    if (kind === 'open' && result.menu) { const menu = result.menu; reset(); onDone?.(); onNavigate?.(menu.key, menu.target); return; }
    const uid = user.uid, label = heading, money = rupiah(amount);
    let task: Promise<unknown>, detail = '', success = `${label} ${money} tersimpan.`;
    try {
      switch (kind) {
        case 'budget': {
          if (oldBudget) { task = saveRecord<Budget>(uid, 'budgets', { amount }, oldBudget.id); success = `Anggaran ${oldBudget.name} jadi ${money}.`; detail = `sebelumnya ${rupiah(oldBudget.amount)}`; break; }
          // Every subcategory ticked is the same as the whole category.
          const scope = scopeParent!, categoryId = scope.id, subs = budgetSubs.length === scopeChildren.length ? [] : budgetSubs;
          const base: Partial<Budget> = { name: budgetName, categoryId, subcategoryId: subs[0] || null, subcategoryIds: subs, amount, classification: data.categories.find(c => c.id === categoryId)?.type === 'savings' ? 'savings' : 'living', cycleType, cycleStartDay: cycleDay, warningPercent: profile?.budgetWarningPercent || 80, notes: '', rolloverEnabled: false, active: true, sortOrder: data.budgets.reduce((n, x) => Math.max(n, (x.sortOrder ?? -1) + 1), data.budgets.length), createdDate: today, lastSettledStart: budgetWindow({ cycleType, cycleStartDay: cycleDay } as Budget, dateInTimeZone(new Date(), profile?.timeZone), salaryDay).start, rolloverCarry: 0 };
          task = saveRecord<Budget>(uid, 'budgets', base); success = `Anggaran ${budgetName} ${money} dibuat.`; detail = periodText(cycleType, cycleDay);
          break;
        }
        case 'fund_new':
          if (oldFund) { task = saveRecord<Fund>(uid, 'funds', { targetAmount: amount }, oldFund.id); success = `Target ${oldFund.name} jadi ${money}.`; detail = `sebelumnya ${rupiah(oldFund.targetAmount)}`; break; }
          task = saveRecord<Fund>(uid, 'funds', { name: name.trim(), kind: goal?.emergency ? 'emergency' : 'goal', targetAmount: amount, currentAmount: 0, monthlyContribution: goal?.monthly || 0, targetDate, linkedWalletId: walletId || '', notes: '' });
          success = `Tujuan dana ${name.trim()} dibuat.`; detail = [`target ${money}`, targetDate && `tenggat ${formatDate(targetDate)}`, walletId && `di ${walletName(walletId)}`].filter(Boolean).join(' · ');
          break;
        case 'wish_new': {
          const active = data.wishlist.filter(w => w.status === 'active');
          task = saveWish(uid, { name: name.trim(), emoji: goal?.emoji || '🎁', color: wishColors[active.length % wishColors.length], price: amount, monthly: goal?.monthly || 0, priority: goal?.priority || 2, link: '', notes: '', targetDate, saved: 0, status: 'active', addedDate: today, sortOrder: data.wishlist.reduce((n, w) => Math.max(n, (w.sortOrder ?? -1) + 1), 0), history: [] });
          success = `${name.trim()} masuk wish list ✨`; detail = money;
          break;
        }
        case 'wallet_new':
          task = saveWallet(uid, { name: name.trim(), type: walletType, group: walletGroup, openingBalance: amount, purpose: '', icon: brand ? `brand:${brand.key}` : walletIcons[walletType], color: brand ? brand.bg.toLowerCase() : presetHex('teal'), cardStyle: 'soft', isReserved: groupDefaults[walletGroup].isReserved, isSpendable: groupDefaults[walletGroup].isSpendable, includeInNetWorth: true, canPay: true, canReceive: true, canTransferOut: true, canTransferIn: true, displayOrder: data.wallets.length });
          success = `Dompet ${name.trim()} ditambahkan.`; detail = `${walletTypes.find(([key]) => key === walletType)?.[1]} · saldo awal ${money}`;
          break;
        case 'balance': {
          const wallet = balanceOf!;
          task = import('@/lib/finance-store').then(async store => {
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
          task = saveRecord<Category>(uid, 'categories', { name: name.trim(), type: categoryType, parentId: parentId || null, icon: categoryIcon, color: parentId ? '' : presetHex('teal'), isArchived: false, sortOrder: siblings.length });
          success = parent ? `Subkategori ${name.trim()} ditambahkan di ${parent.name}.` : `Kategori ${name.trim()} ditambahkan.`; detail = categoryTypes.find(([key]) => key === categoryType)?.[1] || '';
          break;
        }
        case 'recurring_new':
          task = saveRecord<Recurring>(uid, 'recurring', { name: name.trim(), type: flow, amount, walletId, destinationWalletId: null, categoryId: flowCategory || null, frequency, mode: scheduleMode, nextDate: date, anchorDay, active: true });
          success = `Jadwal rutin ${name.trim()} tersimpan.`; detail = [money, frequencyText, walletName(walletId)].join(' · ');
          break;
        case 'plan_new': {
          const chosen = data.categories.find(c => c.id === flowCategory);
          task = import('@/lib/finance-store').then(store => store.savePlan(uid, { title: name.trim(), type: flow, amount, date, walletId: walletId || null, categoryId: chosen ? chosen.parentId || chosen.id : null, subcategoryId: chosen?.parentId ? chosen.id : null, notes: '', committed: flow === 'expense' && committed, status: 'planned' }));
          success = 'Rencana tersimpan. Saldo dompet belum berubah.'; detail = [name.trim(), money, formatDate(date)].join(' · ');
          break;
        }
        case 'note_new':
          task = import('@/lib/finance-store').then(store => store.saveFinancialNote(uid, { title: name.trim(), description: '', date, ...(amount ? { amount } : {}) }));
          success = result.reminder ? 'Pengingat tersimpan di kalender.' : 'Catatan tersimpan di kalender.'; detail = [name.trim(), formatDate(date)].join(' · ');
          break;
        case 'debt_new': task = createDebt(uid, { name: name.trim(), provider: person.trim(), originalAmount: amount, dueDate: '', interestRate: 0, installmentAmount: 0, notes: '' }, walletId || undefined, date); detail = [person && `dari ${person}`, walletId && `masuk ke ${walletName(walletId)}`].filter(Boolean).join(' · '); break;
        case 'receivable_new': task = createReceivable(uid, { person: person.trim(), description: description.trim(), originalAmount: amount, sourceWalletId: walletId || '', date, dueDate: '', status: 'open' }); detail = [person, description, walletId && `dari ${walletName(walletId)}`].filter(Boolean).join(' · '); break;
        case 'claim_new': task = createClaim(uid, { name: name.trim(), amount, sourceWalletId: walletId, submissionDate: date, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '' }); detail = `${name} · dari ${walletName(walletId)}`; break;
        case 'wish': { const item = data.wishlist.find(w => w.id === linkId)!; task = saveWish(uid, { saved: (item.saved || 0) + amount, history: [...(item.history || []), { date, amount }].slice(-60) }, item.id); detail = item.name; break; }
        default: {
          const tx = newTx({ ...preset(), type: result.preset.type!, amount, walletId, date, time: date === today ? timeInTimeZone(profile?.timeZone) : '' } as Partial<LedgerTx> & Pick<LedgerTx, 'type' | 'amount' | 'walletId'>);
          validateTx(tx);
          task = upsertTransaction(uid, tx);
          detail = [tx.description || tx.merchant, category?.name, kind === 'transfer' || kind === 'target' ? `${walletName(walletId)} → ${walletName(destination)}` : walletName(walletId)].filter(Boolean).join(' · ');
        }
      }
    } catch (e) { setError((e as Error).message); return; }
    const retryPreset = preset();
    track(task, { pending: `Menyimpan ${label.toLowerCase()}…`, success, detail, failure: `${label} belum tersimpan`, retry: txKinds.has(kind) ? { label: 'Buka formulir', run: () => onOpenForm(retryPreset) } : undefined });
    reset(); onDone?.();
  }
  /** Saves every entry of a batch the way their own forms do; one progress message for all of them. */
  const kept = batch ? batch.filter((_, i) => !dropped.includes(i)) : [];
  const defaultWallet = (type: 'expense' | 'income') => { const list = walletsFor(type === 'income' ? 'receive' : 'pay'); const want = type === 'income' ? profile?.defaultIncomeWalletId : profile?.defaultExpenseWalletId; return (list.find(w => w.id === want) || list[0])?.id || ''; };
  function batchTask(uid: string, item: QuickBatchItem, index: number): Promise<unknown> {
    const r = item.result, time = (r.preset.date || today) === today ? timeInTimeZone(profile?.timeZone) : '';
    if (r.kind === 'budget' && r.budget) {
      const b = r.budget;
      if (b.id) return saveRecord<Budget>(uid, 'budgets', { amount: r.amount }, b.id);
      const categoryId = b.categoryId; if (!categoryId) throw Error(`Pilih kategori untuk “${item.text}”.`);
      const day = b.cycleType === 'weekly' || b.cycleType === 'custom' ? b.cycleStartDay || 1 : salaryDay;
      return saveRecord<Budget>(uid, 'budgets', { name: r.name || data.categories.find(c => c.id === categoryId)?.name || 'Anggaran', categoryId, subcategoryId: b.subcategoryIds[0] || null, subcategoryIds: b.subcategoryIds, amount: r.amount, classification: data.categories.find(c => c.id === categoryId)?.type === 'savings' ? 'savings' : 'living', cycleType: b.cycleType, cycleStartDay: day, warningPercent: profile?.budgetWarningPercent || 80, notes: '', rolloverEnabled: false, active: true, sortOrder: data.budgets.reduce((n, x) => Math.max(n, (x.sortOrder ?? -1) + 1), data.budgets.length) + index, createdDate: today, lastSettledStart: budgetWindow({ cycleType: b.cycleType, cycleStartDay: day } as Budget, dateInTimeZone(new Date(), profile?.timeZone), salaryDay).start, rolloverCarry: 0 });
    }
    const type = r.preset.type!, walletId = r.preset.walletId || defaultWallet(type === 'income' ? 'income' : 'expense');
    const tx = newTx({ ...r.preset, type, amount: r.amount, walletId, date: r.preset.date || today, time } as Partial<LedgerTx> & Pick<LedgerTx, 'type' | 'amount' | 'walletId'>);
    validateTx(tx);
    return upsertTransaction(uid, tx);
  }
  function saveBatch() {
    if (!user || !kept.length) return;
    const uid = user.uid, list = kept;
    let tasks: Promise<unknown>[];
    try { tasks = list.map((item, i) => batchTask(uid, item, i)); } catch (e) { setError((e as Error).message); return; }
    const spent = list.filter(i => i.result.kind === 'expense').reduce((n, i) => n + i.result.amount, 0), budgets = list.filter(i => i.result.kind === 'budget').length;
    track(Promise.all(tasks), { pending: `Menyimpan ${list.length} catatan…`, success: `${list.length} catatan tersimpan.`, detail: [spent ? `Pengeluaran ${rupiah(spent)}` : '', budgets ? `${budgets} anggaran` : ''].filter(Boolean).join(' · ') || undefined, failure: 'Sebagian catatan belum tersimpan' });
    reset(); onDone?.();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (batch) { saveBatch(); return; }
    if (!result) { if (text.trim()) setError('Sebutkan nominalnya, misalnya "beli pocari 8rb di alfa".'); return; }
    if (!missing) save(); else if (txKinds.has(result.kind)) openForm();
  }

  const activeGroup = mode === 'auto' ? 'auto' : mode in QUICK_LABELS ? groupOf(mode as QuickKind) : mode as QuickGroup;
  const detected = kind ? groupOf(kind) : null;
  // "Bukan ini?": a schedule or a plan can be recorded right away instead.
  const other = kind === 'recurring_new' || kind === 'plan_new' ? flow : kind === 'target' && !data.wishlist.some(w => w.status === 'active') ? 'fund_new' : kind ? sibling[kind] : undefined;
  const hasOther = other && (other !== 'wish' || data.wishlist.some(w => w.status === 'active')) && (other !== 'target' || data.funds.some(f => !f.isArchived)) && (other !== 'balance' || data.wallets.some(w => !w.isArchived)) && (other !== 'plan_new' || amount > 0);
  const tone = kind && toneOf(kind, flow);
  const heading = !kind ? '' : kind === 'budget' ? (oldBudget ? 'Ubah anggaran' : 'Anggaran baru') : kind === 'fund_new' ? (oldFund ? 'Ubah target dana' : QUICK_LABELS.fund_new)
    : kind === 'category_new' ? (parentId ? 'Subkategori baru' : 'Kategori baru') : kind === 'plan_new' ? (flow === 'income' ? 'Rencana pemasukan' : 'Rencana pengeluaran')
    : kind === 'recurring_new' ? (flow === 'income' ? 'Pemasukan rutin' : 'Pengeluaran rutin') : kind === 'note_new' ? (result?.reminder ? 'Pengingat' : 'Catatan kalender') : QUICK_LABELS[kind];
  const textual = kind === 'open' || kind === 'category_new' || kind === 'note_new' || kind === 'wallet_new';
  const headline = kind === 'open' ? result?.menu?.label || 'Menu belum dikenali' : textual ? name.trim() || (kind === 'wallet_new' ? 'Nama dompetnya?' : kind === 'category_new' ? 'Nama kategorinya?' : 'Isi catatannya?') : amount ? rupiah(amount) : 'Nominalnya berapa?';
  const Icon = kind ? icons[kind] : Sparkles;
  const picture = kind === 'category_new' ? <Emoji e={categoryIcon}/> : kind === 'wish_new' ? <Emoji e={goal?.emoji || '🎁'}/> : kind === 'wallet_new' ? <AppIcon icon={brand ? `brand:${brand.key}` : walletIcons[walletType]}/> : <Icon size={18}/>;

  // Short facts under the headline.
  const facts: ReactNode[] = [];
  const fact = (key: string, content: ReactNode, className = '') => facts.push(<span key={key} className={className}>{content}</span>);
  if (result && kind) switch (kind) {
    case 'expense': case 'income':
      if (result.preset.description) fact('d', result.preset.description); if (result.preset.merchant) fact('m', result.preset.merchant);
      if (category) fact('c', category.name, 'qp-cat'); else if (kind === 'expense') fact('c', 'Tanpa kategori', 'qp-missing');
      fact('t', dayText(date));
      // Why that category, when it took reading the context or the person's habits ("“air” dibaca sebagai minuman").
      if (category && result.why) fact('w', result.why, 'qp-why'); break;
    case 'transfer': fact('w', `${walletName(walletId) || '?'} → ${walletName(destination) || '?'}`); fact('t', dayText(date)); break;
    case 'open': fact('o', result.menu?.target && result.menu.key === 'wallets' ? 'Buka detail dompet ini' : 'Pindah ke menu ini'); break;
    case 'budget':
      fact('c', scopeParent ? `${scopeParent.name}${oldBudget ? '' : budgetSubs.length ? ` › ${budgetSubs.length > 3 ? `${budgetSubs.length} subkategori` : budgetSubs.map(id => data.categories.find(c => c.id === id)?.name).join(', ')}` : ' · semua subkategori'}` : 'Kategori belum dipilih', scopeParent ? 'qp-cat' : 'qp-missing');
      if (result.why && !oldBudget) fact('w', result.why, 'qp-why');
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
      fact('n', name.trim() || 'Judul belum ada', name.trim() ? 'qp-cat' : 'qp-missing'); fact('t', dayText(date)); if (flowCategoryRecord) fact('c', flowCategoryRecord.name); if (walletId) fact('w', walletName(walletId));
      fact('s', 'Saldo belum berubah', 'qp-soft'); break;
    case 'note_new': fact('t', dayText(date)); if (amount) fact('a', rupiah(amount)); break;
    default: fact('t', dayText(date));
  }

  const field = (label: string, control: ReactNode, key = label) => <label className="qp-field" key={key}><span>{label}</span>{control}</label>;
  const nameField = (label: string, placeholder = '') => field(label, <Input value={name} onChange={e => change({ name: e.target.value })} placeholder={placeholder}/>);
  const walletSelect = (label: string, empty: string) => field(label, <Select value={walletId} onChange={e => change({ walletId: e.target.value })}><option value="">{empty}</option>{choices.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select>);
  const flowSelect = field('Jenis', <Select value={flow} onChange={e => change({ flow: e.target.value as 'expense' | 'income', categoryId: '' })}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></Select>);
  const fields: ReactNode[] = [];
  if (result && kind) switch (kind) {
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
      if (kind !== 'wish') fields.push(field(kind === 'debt_new' ? 'Uangnya masuk ke' : kind === 'receivable_new' ? 'Uangnya keluar dari' : incoming.has(kind) ? 'Masuk ke dompet' : 'Dari dompet', <Select value={walletId} onChange={e => change({ walletId: e.target.value })}>{(kind === 'debt_new' || kind === 'receivable_new') ? <option value="">Tanpa dompet (saldo tidak berubah)</option> : <option value="">Pilih dompet</option>}{choices.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select>, 'wallet'));
      if (kind === 'target' && fund) fields.push(<small className="qp-note" key="note">Masuk ke {walletName(destination) || 'dompet target'}</small>);
  }

  return <div className="quick-entry-wrap">
    <form className="quick-entry" onSubmit={submit}>
      <span className="quick-entry-icon" aria-hidden="true"><Sparkles size={16}/></span>
      <textarea rows={1} value={text} onChange={e => { setText(e.target.value); setError(''); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(160, e.currentTarget.scrollHeight)}px`; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Tulis apa saja di sini…" aria-label="Tulis transaksi atau perintah; beberapa sekaligus dipisah koma atau baris baru" autoFocus={autoFocus} enterKeyHint="go" autoComplete="off"/>
      <button type="submit" aria-label={result && !missing ? kind === 'open' ? 'Buka' : 'Simpan' : 'Lanjut'} disabled={!text.trim()}><ArrowRight size={17}/></button>
    </form>
    <div className="quick-groups" role="radiogroup" aria-label="Jenis catatan">{QUICK_GROUPS.map(([key, label]) => <Fragment key={key}>{(key === 'expense' || key === 'target' || key === 'open') && <span className="qg-sep" aria-hidden="true"/>}<button type="button" role="radio" aria-checked={activeGroup === key} className={`${activeGroup === key ? 'active' : ''} ${mode === 'auto' && detected === key ? 'is-detected' : ''}`} onClick={event => { setMode(key); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }}>{label}</button></Fragment>)}</div>
    {!text.trim() && <div className="quick-examples"><span className="qe-title">Ketuk contoh untuk mencoba</span>{(examples[activeGroup] || examples.auto).map(example => { const ExampleIcon = icons[example.kind]; return <Fragment key={example.text}>{example.section && <span className="qe-section">{example.section}</span>}<button type="button" className={`qe-item tone-${toneOf(example.kind, /gaji|bonus|terima/.test(example.text) ? 'income' : 'expense')}`} onClick={() => setText(example.text)}><span className="qe-icon" aria-hidden="true"><ExampleIcon size={16}/></span><span className="qe-text"><strong>“{example.text}”</strong><small><b>{example.kind === 'budget' ? 'Anggaran' : example.kind === 'recurring_new' ? QUICK_LABELS.recurring_new : example.kind === 'plan_new' ? 'Rencana' : example.kind === 'note_new' ? 'Pengingat' : QUICK_LABELS[example.kind]}</b> · {example.result}</small></span><ArrowUpLeft size={15} className="qe-go" aria-hidden="true"/></button></Fragment>; })}</div>}
    {text.trim() && !result && !batch && <small className="quick-entry-hint" role="alert">{error || 'Tambahkan nominalnya, misalnya 8rb, 25k, atau 1,5jt.'}</small>}
    {batch && <div className="quick-preview quick-batch">
      <div className="qp-head"><span className="qp-icon" aria-hidden="true"><ListChecks size={18}/></span><span className="qp-title"><small>{kept.length} catatan sekaligus</small>{(() => { const out = kept.filter(i => i.result.kind === 'expense').reduce((n, i) => n + i.result.amount, 0), budget = kept.filter(i => i.result.kind === 'budget').reduce((n, i) => n + i.result.amount, 0), income = kept.filter(i => i.result.kind === 'income').reduce((n, i) => n + i.result.amount, 0); return <strong>{rupiah(out || budget || income)}<em> {out ? 'keluar' : budget ? 'anggaran' : income ? 'masuk' : ''}</em></strong>; })()}</span></div>
      <ul className="qb-list">{batch.map((item, i) => { const r = item.result, Row = icons[r.kind], off = dropped.includes(i); const cat = data.categories.find(c => c.id === (r.budget ? r.budget.subcategoryIds[0] || r.budget.categoryId : r.preset.subcategoryId || r.preset.categoryId));
        const detail = r.kind === 'budget' ? `Anggaran · ${r.name || cat?.name || 'kategori?'} · ${r.budget?.id ? 'ubah' : 'baru'}` : r.kind === 'transfer' ? `${walletName(r.preset.walletId || defaultWallet('expense')) || '?'} → ${walletName(r.preset.destinationWalletId || '') || '?'}` : [r.preset.description || r.preset.merchant, categoryName(cat) || (r.kind === 'expense' ? 'Tanpa kategori' : ''), walletName(r.preset.walletId || defaultWallet(r.kind === 'income' ? 'income' : 'expense')), r.preset.date && r.preset.date !== today ? dayText(r.preset.date) : ''].filter(Boolean).join(' · ');
        return <li key={i} className={`tone-${toneOf(r.kind)} ${off ? 'is-off' : ''}`}><span className="qb-icon" aria-hidden="true"><Row size={15}/></span><span className="qb-main"><strong>{rupiah(r.amount)} <small>{QUICK_LABELS[r.kind]}</small></strong><small>{detail}</small></span><button type="button" className="qb-drop" aria-label={off ? `Pakai lagi ${item.text}` : `Lewati ${item.text}`} onClick={() => setDropped(list => off ? list.filter(x => x !== i) : [...list, i])}>{off ? <Check size={15}/> : <X size={15}/>}</button></li>; })}</ul>
      {error && <small className="qp-warn" role="status">{error}</small>}
      <small className="qp-note">Tiap baris dibaca terpisah; tanggal atau dompet yang disebut sekali berlaku untuk semuanya. Ketuk ✕ untuk melewati.</small>
      <div className="qp-actions"><Button type="button" onClick={saveBatch} disabled={!kept.length}>Simpan semua ({kept.length})</Button></div>
    </div>}
    {!batch && result && kind && <div className={`quick-preview tone-${tone}`}>
      <div className="qp-head"><span className="qp-icon" aria-hidden="true">{picture}</span><span className="qp-title"><small>{heading}</small><strong className={textual || !amount ? 'is-text' : ''}>{headline}</strong></span>{hasOther && other && <button type="button" className="qp-switch" onClick={() => setMode(other)}><small>Bukan ini?</small>{QUICK_LABELS[other]}</button>}</div>
      {facts.length > 0 && <div className="qp-facts">{facts}</div>}
      {fields.length > 0 && (!menuKinds.has(kind) || kind === 'budget' && !oldBudget || details || Boolean(missing)) && <div className="qp-fields">{fields}</div>}
      {(missing || error) && <small className="qp-warn" role="status">{error || missing}</small>}
      <div className="qp-actions">{txKinds.has(kind) && <Button type="button" variant="secondary" onClick={openForm}>Ubah detail</Button>}{menuKinds.has(kind) && fields.length > 0 && !missing && <Button type="button" variant="secondary" aria-expanded={details} onClick={() => setDetails(open => !open)}>{details ? 'Tutup detail' : 'Ubah detail'}</Button>}<Button type="button" onClick={save} disabled={Boolean(missing)}>{kind === 'open' ? `Buka ${result.menu?.label || ''}`.trim() : 'Sesuai, simpan'}</Button></div>
    </div>}
  </div>;
}
