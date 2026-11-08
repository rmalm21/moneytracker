/**
 * 8.10 "Bisa dicoba di sini": a small card at the top of a menu with up to three features of that menu the person has not
 * used yet, each one tappable to try it. A feature leaves the card only once it is really used (✕ hides the card for
 * seven days, nothing more). Once a feature is known, it may come back as a one-line suggestion when it fits the moment
 * (at most one suggestion per menu per day, each one can be closed). What was used, hidden and suggested is kept with the
 * account (the profile document), so it is the same on every device.
 *
 * Nothing here reads or writes anything: the card and the bridge in components/feature-tips.tsx do.
 */
import type { Budget, Category, Draft, Fund, LedgerTx, Profile, Recurring, SplitBill, Wallet } from './types';

export type TipMenu = 'home' | 'add' | 'transactions' | 'wallets' | 'inbox' | 'budgets' | 'splitbill' | 'chat' | 'settings' | 'advisor';
/** How a tip is tried: open a page, ask the page it lives on to start it, or point at the button. */
export type TipTry = { go: [view: string, focus?: string] } | { event: true } | { pulse: string };
export type Tip = { id: string; menu: TipMenu; emoji: string; title: string; text: string; try: TipTry };

export const CARD_SIZE = 3, HIDE_DAYS = 7, CLOSE_SUGGESTION_DAYS = 30;
/** Cards on Beranda the person may not know about (Perkiraan sampai gajian is on Beranda from the start). */
export const LESSER_CARDS = ['safeDaily', 'daysUntilSalary', 'topMerchants'];

const T = (menu: TipMenu, id: string, emoji: string, title: string, text: string, how: TipTry): Tip => ({ id, menu, emoji, title, text, try: how });
// Ids use "_" (never "."): they are field names inside the profile document.
export const TIPS: Tip[] = [
  T('home', 'home_layout', '🧩', 'Atur Beranda', 'Pilih dari 42 kartu, sembunyikan, dan geser urutannya.', { event: true }),
  T('home', 'home_cards', '🗓️', 'Kartu yang jarang diketahui', 'Jatah harian aman, Hitung mundur gajian, dan Tempat belanja paling sering.', { event: true }),
  T('home', 'home_chartcfg', '📊', 'Atur kartu grafik', 'Kartu donat, kategori terbesar, dan tren bisa punya periode dan kategori sendiri.', { event: true }),
  T('home', 'home_period', '📅', 'Ganti periode Beranda', 'Siklus gaji, bulan ini, 7 hari, 30 hari, 3 bulan, atau tanggal sendiri.', { pulse: '.dashboard-period' }),
  T('home', 'home_tapcard', '👆', 'Ketuk kartu angka', 'Misalnya Pemasukan langsung membuka daftar transaksinya.', { event: true }),
  T('home', 'home_quick', '⚡', 'Ubah tombol Catat cepat', 'Bikin pintasan sendiri, misalnya Kopi 25rb dari GoPay sekali ketuk.', { event: true }),
  T('home', 'home_rekap', '🎉', 'Rekap bulanan & tahunan', 'Ke mana uangmu pergi, dalam beberapa geser. Bisa dibagikan.', { event: true }),
  T('home', 'home_eye', '👀', 'Ikon mata di atas', 'Sembunyikan semua nominal sekali ketuk, misalnya di tempat ramai.', { pulse: '.eye-button' }),
  T('home', 'home_bell', '🔔', 'Lonceng', 'Riwayat aktivitas, pengingat, dan hal yang perlu perhatian.', { pulse: '.bell-button' }),
  T('home', 'home_chat', '💬', 'Asisten chat', 'Tanya atau catat seperti chat biasa, misalnya “makan siang 35rb pakai gopay”.', { event: true }),
  T('add', 'add_sentence', '✍️', 'Catat dengan satu kalimat', 'Ketik “kopi 25rb pakai gopay”, isinya terisi sendiri.', { event: true }),
  T('add', 'add_scan', '🧾', 'Scan struk', 'Foto struk atau nota, isinya dibaca otomatis.', { event: true }),
  T('add', 'add_multi', '📝', 'Beberapa transaksi sekaligus', 'Pisahkan dengan koma: “makan 25rb, parkir goceng, bensin 30rb”.', { event: true }),
  T('add', 'add_split', '🧮', 'Satu transaksi, beberapa kategori', 'Di formulir pengeluaran, buka Bagi ke beberapa kategori.', { pulse: '.split-editor' }),
  T('transactions', 'trans_transfer', '🔁', 'Transfer antardompet', 'Pindah uang antar dompetmu tanpa tercatat sebagai pengeluaran.', { event: true }),
  T('transactions', 'trans_recurring', '🗓️', 'Tagihan rutin', 'Tagihan bulanan dicatat atau diingatkan otomatis.', { go: ['recurring'] }),
  T('wallets', 'wallet_kantong', '🎯', 'Kantong', 'Kelompokkan beberapa dompet untuk satu tujuan, misalnya Dana darurat = Mandiri + BRI.', { event: true }),
  T('wallets', 'wallet_adjust', '⚖️', 'Cocokkan saldo', 'Isi saldo asli dompetmu, selisihnya dicatat otomatis. Ada di menu ⋯ tiap dompet.', { pulse: '.wallet-row .more-actions, .wallet-card .more-actions' }),
  T('wallets', 'wallet_order', '↕️', 'Geser urutan dompet', 'Tahan pegangan titik-titik sebentar, lalu geser.', { pulse: '.wallet-row .sort-handle, .wallet-card .sort-handle' }),
  T('wallets', 'wallet_emergency', '🛟', 'Dana darurat', 'Pisahkan dana darurat dari uang harian supaya tidak terpakai.', { event: true }),
  T('inbox', 'inbox_import', '📥', 'Impor mutasi', 'Masukkan PDF, CSV, atau Excel dari bank dan e-wallet. File dibaca di HP, tidak diunggah.', { event: true }),
  T('inbox', 'inbox_bulk', '✅', 'Catat banyak sekaligus', 'Centang beberapa baris, atau pakai Catat semua yang siap.', { pulse: '.ix-bar' }),
  T('inbox', 'inbox_hold', '👆', 'Tekan lama', 'Tekan lama sebuah baris untuk pilihan: periksa, catat, pilih, atau hapus.', { pulse: '.ix-row' }),
  T('budgets', 'budget_sub', '🎯', 'Anggaran untuk beberapa subkategori', 'Misalnya Makan & Minum tanpa Delivery.', { event: true }),
  T('budgets', 'budget_sentence', '✍️', 'Bikin anggaran lewat kalimat', 'Ketik “anggaran makan 2jt” di Catat otomatis atau di chat.', { event: true }),
  T('splitbill', 'split_share', '📤', 'Bagikan rincian ke teman', 'Buka sebuah Split Bill, lalu Bagikan: rincian siapa bayar berapa terkirim lewat chat, atau simpan gambarnya.', { pulse: '.sb-row-main' }),
  T('splitbill', 'split_friendpaid', '🤝', 'Teman yang bayar dulu', 'Catat patungan saat teman yang bayar, lalu bayar balik dari dompetmu.', { event: true }),
  T('chat', 'chat_ask', '❓', 'Tanya keuangan', 'Misalnya “uang bebas berapa?” atau “pengeluaran minggu ini”.', { event: true }),
  T('chat', 'chat_record', '💬', 'Catat lewat chat', 'Tulis “makan siang 35rb pakai gopay”, lalu simpan kartunya.', { event: true }),
  T('settings', 'settings_hide', '🙈', 'Nominal selalu tersembunyi', 'Saat app dibuka, semua nominal langsung tersembunyi.', { go: ['settings', 'appearance'] }),
  T('settings', 'settings_pin', '🔒', 'Kunci PIN atau sidik jari', 'Orang lain tidak bisa membuka catatanmu walau memegang HP-mu.', { go: ['settings', 'security'] }),
  T('settings', 'settings_reminder', '⏰', 'Pengingat harian', 'Diingatkan mencatat dan mencocokkan saldo, di jam yang kamu pilih.', { go: ['settings', 'reminders'] }),
  T('advisor', 'insight_profile', '🧭', 'Personalisasi Insight', 'Isi profil risiko dan targetmu supaya sarannya lebih pas.', { event: true }),
  T('advisor', 'insight_layout', '🗂️', 'Atur bagian Insight', 'Urutkan, sembunyikan, atau sematkan bagian yang paling kamu perlukan.', { event: true }),
];
export const tipById = new Map(TIPS.map(t => [t.id, t]));

/** Kept in the profile document. */
export type TipState = {
  used?: string[];
  /** Menu → the day (YYYY-MM-DD) the card shows again after ✕. */
  hiddenUntil?: Partial<Record<TipMenu, string>>;
  /** Menu → the suggestion shown there today (one a day). */
  suggested?: Partial<Record<TipMenu, { day: string; id: string }>>;
  /** Suggestion → the day it may show again after it was closed. */
  closed?: Record<string, string>;
};

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

type Usage = {
  profile: Pick<Profile, 'dashboardWidgets' | 'dashboardWidgetConfig' | 'dashboardPeriod' | 'quickActions' | 'pinHash' | 'reminders' | 'insightProfile' | 'insightLayout'> | null;
  data: { transactions: Pick<LedgerTx, 'type' | 'origin' | 'receipt' | 'splits'>[]; recurring: unknown[]; funds: Pick<Fund, 'walletIds' | 'kind' | 'name'>[]; wallets: Pick<Wallet, 'displayOrder'>[]; drafts: Pick<Draft, 'source'>[]; budgets: Pick<Budget, 'subcategoryId' | 'subcategoryIds'>[]; splitBills?: Pick<SplitBill, 'payer'>[] };
  /** Layout shown on Beranda now (saved, or the default one). */
  layout: string[];
  local: { chatUsed?: boolean; alwaysHide?: boolean };
};
const isEmergency = (f: Pick<Fund, 'kind' | 'name'>) => f.kind ? f.kind === 'emergency' : /darurat|emergency/i.test(f.name || '');
/** Features already in use before 8.10, read from the person's own records, so nobody is offered what they already do. */
export function derivedUsed({ profile, data, layout, local }: Usage): Set<string> {
  const used = new Set<string>(), mark = (id: string, yes: unknown) => { if (yes) used.add(id); };
  const tx = data.transactions;
  mark('home_layout', profile?.dashboardWidgets?.length);
  mark('home_cards', layout.some(id => LESSER_CARDS.includes(id)));
  mark('home_chartcfg', Object.keys(profile?.dashboardWidgetConfig || {}).length);
  mark('home_period', profile?.dashboardPeriod);
  mark('home_quick', Array.isArray(profile?.quickActions));
  mark('home_chat', local.chatUsed); mark('chat_ask', local.chatUsed);
  mark('add_sentence', tx.some(t => t.origin === 'quick'));
  mark('add_scan', tx.some(t => t.origin === 'scan' || t.receipt));
  mark('add_split', tx.some(t => (t.splits?.length || 0) > 1));
  mark('trans_transfer', tx.some(t => t.type === 'transfer'));
  mark('trans_recurring', data.recurring.length);
  mark('wallet_kantong', data.funds.some(f => (f.walletIds?.length || 0) > 0));
  mark('wallet_adjust', tx.some(t => t.type === 'adjustment'));
  mark('wallet_order', data.wallets.some(w => (w.displayOrder || 0) > 0));
  mark('wallet_emergency', data.funds.some(isEmergency));
  mark('inbox_import', data.drafts.some(d => d.source === 'import'));
  mark('budget_sub', data.budgets.some(b => (b.subcategoryIds?.length || 0) > 0 || b.subcategoryId));
  mark('split_friendpaid', data.splitBills?.some(b => b.payer === 'other'));
  mark('settings_hide', local.alwaysHide);
  mark('settings_pin', profile?.pinHash);
  mark('settings_reminder', profile?.reminders?.balanceEnabled || profile?.reminders?.billsEnabled);
  mark('insight_profile', Object.keys(profile?.insightProfile || {}).length);
  mark('insight_layout', profile?.insightLayout && ((profile.insightLayout.order?.length || 0) + (profile.insightLayout.hidden?.length || 0) + (profile.insightLayout.pinned?.length || 0)));
  return used;
}

export const usedSet = (state: TipState | undefined, derived: Set<string>) => new Set([...(state?.used || []), ...derived]);

/** The card of a menu: the first features not used yet, unless ✕ hid it (until that day). */
export function cardTips(menu: TipMenu, used: Set<string>, state: TipState | undefined, today: string, size = CARD_SIZE): Tip[] {
  const until = state?.hiddenUntil?.[menu];
  if (until && until > today) return [];
  return TIPS.filter(t => t.menu === menu && !used.has(t.id)).slice(0, size);
}

export type Suggestion = { id: string; menu: TipMenu; text: string; label: string; try: TipTry; tip: string };
export type SuggestCtx = {
  used: Set<string>; today: string; layout: string[]; daysUntilSalary: number;
  transactions: Pick<LedgerTx, 'id' | 'type' | 'amount' | 'date' | 'description' | 'merchant' | 'origin' | 'categoryId' | 'recurringTransactionId'>[];
  recurring: Pick<Recurring, 'name'>[]; budgets: Pick<Budget, 'categoryId' | 'active'>[]; categories: Pick<Category, 'id' | 'name' | 'type' | 'parentId'>[];
  quickActions: { description?: string; label: string }[]; pendingDrafts: number;
};
const said = (t: { description?: string; merchant?: string }) => (t.description || t.merchant || '').trim();
const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** One-line suggestions that fit the moment, for features the person already knows (never one still on the card). */
export function suggestionsFor(menu: TipMenu, c: SuggestCtx): Suggestion[] {
  const out: Suggestion[] = [], known = (id: string) => c.used.has(id);
  const S = (id: string, tip: string, text: string, label: string, how: TipTry) => { if (known(tip)) out.push({ id, menu, tip, text, label, try: how }); };
  const recent = (days: number) => c.transactions.filter(t => t.date >= addDays(c.today, -days) && t.date <= c.today);
  if (menu === 'home') {
    if (c.daysUntilSalary >= 0 && c.daysUntilSalary <= 3 && !c.layout.includes('daysUntilSalary')) S('home_payday', 'home_cards', `Gajian tinggal ${c.daysUntilSalary === 0 ? 'hari ini' : `${c.daysUntilSalary} hari lagi`}. Pasang kartu Hitung mundur gajian di Beranda?`, 'Pasang kartu', { event: true });
    // The same spending three times in two weeks, with no Catat cepat button for it yet.
    const counts = new Map<string, { n: number; name: string }>();
    for (const t of recent(14)) if (t.type === 'expense' && said(t)) { const k = `${key(said(t))}|${t.amount}`, v = counts.get(k) || { n: 0, name: said(t) }; v.n++; counts.set(k, v); }
    const buttons = new Set(c.quickActions.map(q => key(q.description || q.label)));
    const often = [...counts.values()].filter(v => v.n >= 3 && !buttons.has(key(v.name))).sort((a, b) => b.n - a.n)[0];
    if (often) S('home_quickrepeat', 'home_quick', `Kamu sering mencatat “${often.name}”. Jadikan tombol Catat cepat?`, 'Atur Catat cepat', { event: true });
  }
  if (menu === 'add') {
    const last = [...c.transactions].filter(t => t.type === 'expense' || t.type === 'income').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    if (last.length === 3 && last.every(t => !t.origin)) S('add_sentence_again', 'add_sentence', 'Lebih cepat: ketik satu kalimat, misalnya “kopi 25rb pakai gopay”.', 'Coba ketik', { event: true });
  }
  if (menu === 'transactions') {
    // The same name in at least two of the last three months, not made by a schedule and with no schedule of that name.
    const months = new Map<string, Set<string>>();
    for (const t of recent(92)) if ((t.type === 'expense' || t.type === 'income') && !t.recurringTransactionId && said(t)) { const k = key(said(t)); months.set(k, (months.get(k) || new Set()).add(t.date.slice(0, 7))); }
    const scheduled = new Set(c.recurring.map(r => key(r.name)));
    const monthly = [...months.entries()].find(([k, m]) => m.size >= 2 && !scheduled.has(k) && k.length >= 3);
    if (monthly) { const name = said(c.transactions.find(t => key(said(t)) === monthly[0])!); S('trans_make_recurring', 'trans_recurring', `“${name}” muncul tiap bulan. Jadikan tagihan rutin?`, 'Buka Rutin', { go: ['recurring'] }); }
  }
  if (menu === 'wallets') {
    if (!c.transactions.some(t => t.type === 'adjustment' && t.date >= addDays(c.today, -30))) S('wallet_check', 'wallet_adjust', 'Sudah sebulan lebih tidak mencocokkan saldo. Samakan dengan saldo asli di bank dan e-wallet?', 'Tunjukkan', { pulse: '.wallet-row .more-actions, .wallet-card .more-actions' });
  }
  if (menu === 'inbox') {
    if (c.pendingDrafts === 0) S('inbox_empty_import', 'inbox_import', 'Belum ada yang menunggu. Impor mutasi terbaru dari bank atau e-wallet?', 'Impor mutasi', { event: true });
  }
  if (menu === 'budgets') {
    const spend = new Map<string, number>();
    for (const t of recent(30)) if (t.type === 'expense' && t.categoryId) spend.set(t.categoryId, (spend.get(t.categoryId) || 0) + 1);
    const covered = new Set(c.budgets.filter(b => b.active !== false).map(b => b.categoryId));
    const top = [...spend.entries()].filter(([id, n]) => n >= 3 && !covered.has(id)).sort((a, b) => b[1] - a[1])[0];
    const cat = top && c.categories.find(x => x.id === top[0]);
    if (cat) S('budget_missing', 'budget_sub', `Pengeluaran ${cat.name} cukup sering bulan ini. Bikin anggarannya?`, 'Buat anggaran', { event: true });
  }
  return out;
}

/** At most one suggestion per menu per day: the one already shown today, or else the first that was not closed. */
export function pickSuggestion(menu: TipMenu, list: Suggestion[], state: TipState | undefined, today: string): Suggestion | null {
  const open = list.filter(s => !(state?.closed?.[s.id] && state.closed[s.id] > today));
  const shown = state?.suggested?.[menu];
  if (shown?.day === today) return open.find(s => s.id === shown.id) || null;
  return open[0] || null;
}
