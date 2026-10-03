/**
 * Dompet Ajaib 5.0 — Discovery Engine and the "Perlu perhatian" cluster.
 *
 * Discovery decides which EXISTING capability may help right now, never anything about money. It is deterministic,
 * local and cheap: signals are read once from the data already loaded (no extra queries), candidates come from fixed
 * rules, and the lifecycle (UNSEEN → ELIGIBLE → SHOWN → TRIED → LEARNED, or DISMISSED) keeps it quiet:
 *   - a feature the user already uses is never promoted ("learned");
 *   - a dismissed prompt stays away for 60 days; one shown on 3 different days without a tap stops;
 *   - at most one prompt per screen, and nothing when nothing is useful.
 */
import type { Data, LedgerTx, Profile } from './types.ts';
import { featureById, type FeatureAction, type Signal } from './features.ts';

export type Signals = Record<Signal, number>;
export type DiscoveryStatus = 'shown' | 'tried' | 'dismissed';
export type DiscoveryRecord = { status: DiscoveryStatus; shownDays: string[]; at: number };
export type DiscoveryState = Record<string, DiscoveryRecord>;
export type DiscoveryCandidate = {
  /** Candidate key: one per feature (or feature + subject, e.g. "recurring:spotify"). */
  key: string;
  featureId: string;
  title: string;
  body: string;
  cta: string;
  action: FeatureAction | { kind: 'widget'; widget: string };
  relevance: number;
  /** Why it is shown (for tests and the developer trace). */
  reason: string;
};
export type Lifecycle = 'UNSEEN' | 'ELIGIBLE' | 'SHOWN' | 'TRIED' | 'LEARNED' | 'DISMISSED';

const DAY = 86_400_000;
export const DISMISS_DAYS = 60;
export const MAX_SHOWN_DAYS = 3;

const lower = (s: string) => s.toLocaleLowerCase('id-ID').trim();
const isSavings = (w: Data['wallets'][number]) => !w.isArchived && (w.type === 'savings' || w.group === 'savings' || w.isReserved);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** Payments that look regular: the same name in 3+ different months at a similar amount, not already a Rutin. */
export function repeatPayments(tx: LedgerTx[], recurringNames: string[]) {
  const known = recurringNames.map(lower);
  const groups = new Map<string, LedgerTx[]>();
  for (const t of tx) {
    if (t.type !== 'expense' || t.recurringTransactionId || t.splitBillId) continue;
    const name = lower(t.merchant || t.description || '');
    if (name.length < 3) continue;
    (groups.get(name) || groups.set(name, []).get(name)!).push(t);
  }
  const out: { name: string; label: string; amount: number; months: number }[] = [];
  for (const [name, rows] of groups) {
    const months = new Set(rows.map(r => r.date.slice(0, 7)));
    if (months.size < 3) continue;
    const amounts = rows.map(r => r.amount).sort((a, b) => a - b), mid = amounts[Math.floor(amounts.length / 2)];
    const steady = rows.filter(r => Math.abs(r.amount - mid) <= mid * 0.1).length;
    // Once a month, not every day (lunch at the same warteg is a habit, not a bill).
    if (steady < 3 || rows.length > months.size * 2) continue;
    if (known.some(k => k.includes(name) || name.includes(k))) continue;
    out.push({ name, label: rows[0].merchant || rows[0].description, amount: mid, months: months.size });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount);
}

/** Everything the rules look at, read once from the loaded data. Counts, not money. */
export function readSignals(data: Data, profile: Partial<Profile> | null | undefined, today: string, extra: { healthIssues?: number; visited?: Record<string, number> } = {}): Signals {
  const tx = data.transactions;
  const oldest = tx.reduce((m, t) => (t.date < m ? t.date : m), today);
  const receipts = tx.filter(t => t.receipt || t.origin === 'scan');
  const activeClaims = data.claims.filter(c => c.status !== 'paid' && c.status !== 'rejected' && c.remainingAmount > 0);
  const wallets = data.wallets.filter(w => !w.isArchived);
  return {
    wallets: wallets.length,
    manyWallets: wallets.length >= 4 ? 1 : 0,
    savingsWallet: wallets.filter(w => isSavings(w) && w.cachedBalance > 0).length,
    interestWallet: wallets.filter(w => w.interest && (w.interest as { enabled?: boolean }).enabled !== false).length,
    kantong: data.funds.filter(f => !f.isArchived && (f as { walletIds?: string[] }).walletIds?.length).length,
    tx: tx.length,
    manyTx: tx.length >= 20 ? 1 : 0,
    receiptTx: receipts.length,
    manyReceipts: receipts.filter(t => (t.receipt?.items?.length || 0) > 0).length >= 8 ? 1 : 0,
    repeatPayment: repeatPayments(tx, data.recurring.map(r => r.name)).length,
    splitBill: tx.filter(t => t.splitBillId).length,
    budgets: data.budgets.filter(b => b.active).length,
    budgetPressure: 0,
    claims: activeClaims.length,
    oldClaim: activeClaims.filter(c => c.submissionDate && daysBetween(c.submissionDate, today) > 14).length,
    receivables: data.receivables.filter(r => r.remainingAmount > 0).length,
    debts: data.debts.filter(d => d.status !== 'paid' && d.outstandingAmount > 0).length,
    funds: data.funds.filter(f => !f.isArchived).length,
    wishlist: data.wishlist.length,
    recurring: data.recurring.filter(r => r.active).length,
    plans: data.plannedTransactions.filter(p => p.status === 'planned').length,
    inbox: data.drafts.filter(d => d.status === 'pending').length,
    notes: data.financialNotes.length,
    cycles: data.cycleSnapshots.length,
    // A full salary cycle of history: enough to compare patterns.
    fullCycle: tx.length >= 30 && daysBetween(oldest, today) >= 35 ? 1 : 0,
    healthIssues: extra.healthIssues || 0,
    lexicon: Object.keys(profile?.personalLexicon?.aliases || {}).length,
    pin: profile?.pinHash ? 1 : 0,
    reminders: (profile as { reminders?: { balanceEnabled?: boolean; billsEnabled?: boolean } } | null | undefined)?.reminders?.balanceEnabled || (profile as { reminders?: { billsEnabled?: boolean } } | null | undefined)?.reminders?.billsEnabled ? 1 : 0,
  };
}

/** Where one feature is in its discovery lifecycle. */
export function lifecycle(featureId: string, signals: Signals, state: DiscoveryState, now: number, key = featureId): Lifecycle {
  const f = featureById(featureId);
  if (f?.learned?.some(s => signals[s] > 0)) return 'LEARNED';
  const r = state[key];
  if (r?.status === 'dismissed' && now - r.at < DISMISS_DAYS * DAY) return 'DISMISSED';
  if (r?.status === 'tried') return 'TRIED';
  if (r?.status === 'shown') return 'SHOWN';
  return f?.relevant?.some(s => signals[s] > 0) ? 'ELIGIBLE' : 'UNSEEN';
}

const fmt = (n: number) => n >= 1e6 ? `Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `Rp${Math.round(n / 1e3)} rb` : `Rp${n}`;

/**
 * Candidate prompts for one screen, best first. `screen` limits where a prompt makes sense ("home" sees all).
 * `visited` counts how often each page was opened (local usage metadata).
 */
export function discoveryCandidates(data: Data, signals: Signals, opts: { screen: string; visited?: Record<string, number>; homeWidgets?: string[]; customizedHome?: boolean }): DiscoveryCandidate[] {
  const visited = opts.visited || {};
  const out: DiscoveryCandidate[] = [];
  const at = (screens: string[]) => opts.screen === 'home' || screens.includes(opts.screen);
  // Recurring: a payment that clearly repeats.
  if (at(['transactions', 'recurring']) && !signals.recurring) {
    const r = repeatPayments(data.transactions, data.recurring.map(x => x.name))[0];
    if (r) out.push({ key: `recurring:${r.name}`, featureId: 'recurring', title: `“${r.label}” terlihat rutin`, body: `Dibayar sekitar ${fmt(r.amount)} di ${r.months} bulan berbeda. Jadikan Rutin supaya diingatkan dan masuk hitungan uang tersedia.`, cta: 'Atur sebagai Rutin', action: { kind: 'view', view: 'recurring' }, relevance: 0.9, reason: `repeatPayment ${r.name} ×${r.months}` });
  }
  // Wallet interest: a savings wallet with money and no interest set up anywhere.
  if (at(['wallets']) && signals.savingsWallet && !signals.interestWallet) {
    const w = data.wallets.filter(x => isSavings(x) && x.cachedBalance > 0).sort((a, b) => b.cachedBalance - a.cachedBalance)[0];
    if (w) out.push({ key: 'interest', featureId: 'interest', title: `${w.name} bisa menghitung bunga sendiri`, body: 'Isi suku bunganya sekali, lalu bunga dicatat otomatis setiap hari atau bulan.', cta: 'Atur bunga', action: { kind: 'view', view: 'wallets', focus: `interest:${w.id}` }, relevance: 0.55, reason: `savings wallet ${w.id} without interest` });
  }
  // Insight: enough history, never opened.
  if (at([]) && signals.fullCycle && !visited.advisor) out.push({ key: 'insight', featureId: 'insight', title: 'Riwayatmu sudah cukup untuk dibandingkan', body: 'Insight bisa melihat apa yang berubah dibanding siklus lalu, dan apa yang perlu diperhatikan.', cta: 'Lihat Insight', action: { kind: 'view', view: 'advisor' }, relevance: 0.7, reason: 'fullCycle && advisor never visited' });
  // Personal price index: enough receipts with items.
  if (at(['advisor']) && signals.manyReceipts && !visited['advisor:prices']) out.push({ key: 'prices', featureId: 'prices', title: 'Riwayat harga barangmu sudah tersedia', body: 'Dari struk yang kamu scan, kelihatan barang mana yang harganya naik atau turun.', cta: 'Lihat harga', action: { kind: 'view', view: 'advisor', focus: 'prices' }, relevance: 0.5, reason: 'manyReceipts' });
  // Budgets: steady spending, no budget yet.
  if (at(['transactions', 'analytics']) && !signals.budgets && data.transactions.filter(t => t.type === 'expense').length >= 20) out.push({ key: 'budgets', featureId: 'budgets', title: 'Mau batas belanja per kategori?', body: 'Anggaran memberi tahu pos mana yang masih aman dan mana yang perlu perhatian.', cta: 'Buat anggaran', action: { kind: 'view', view: 'budgets' }, relevance: 0.6, reason: '20+ expenses, no budget' });
  // Split Bill: a recent receipt with several items, never split anything.
  if (at(['transactions']) && !signals.splitBill) {
    const recent = data.transactions.find(t => (t.receipt?.items?.length || 0) >= 3 && t.type === 'expense');
    if (recent) out.push({ key: 'splitbill', featureId: 'splitbill', title: 'Struk ini dibayar bareng teman?', body: 'Split Bill membagi per item atau rata, lalu mencatat bagian teman sebagai piutang.', cta: 'Bagi struk ini', action: { kind: 'view', view: 'splitbill', focus: `tx:${recent.id}` }, relevance: 0.45, reason: `receipt ${recent.id} with items` });
  }
  // Catat otomatis vocabulary: frequent quick entry, empty Bahasa Saya.
  if (at([]) && !signals.lexicon && data.transactions.filter(t => t.origin === 'quick').length >= 15) out.push({ key: 'lexicon', featureId: 'lexicon', title: 'Ajari Catat otomatis kata-katamu', body: 'Nama tempat langganan atau panggilan teman bisa dikenali langsung, misalnya “besto” = D\'Besto.', cta: 'Buka Bahasa Saya', action: { kind: 'view', view: 'settings', focus: 'language' }, relevance: 0.35, reason: '15+ quick entries, empty lexicon' });
  // Reminders: active user, reminders off.
  if (at([]) && !signals.reminders && signals.tx >= 30) out.push({ key: 'reminders', featureId: 'reminders', title: 'Mau diingatkan perbarui saldo?', body: 'Satu pengingat di jam pilihanmu membantu catatan tetap cocok dengan saldo asli.', cta: 'Atur pengingat', action: { kind: 'view', view: 'settings', focus: 'reminders' }, relevance: 0.3, reason: '30+ tx, reminders off' });
  // Periksa data: a long history that was never checked.
  if (at([]) && signals.tx >= 80 && !visited.health) out.push({ key: 'health', featureId: 'health', title: 'Sudah lama mencatat? Periksa datanya sekali', body: 'Periksa data mencari saldo atau tautan yang tidak cocok, tanpa mengubah apa pun sebelum kamu setuju.', cta: 'Periksa data', action: { kind: 'view', view: 'health' }, relevance: 0.25, reason: '80+ tx, Periksa data never opened' });
  // Dashboard widget: active claims but a customized Home without the card.
  if (opts.screen === 'home' && opts.customizedHome && signals.claims && !(opts.homeWidgets || []).includes('claims')) out.push({ key: 'widget:claims', featureId: 'claims', title: 'Tampilkan klaim kantor di Beranda?', body: 'Ada klaim yang belum cair. Kartu Klaim Kantor menunjukkan sisanya tanpa membuka menu.', cta: 'Tambah kartu', action: { kind: 'widget', widget: 'claims' }, relevance: 0.4, reason: 'active claims, customized home without claims card' });
  return out.sort((a, b) => b.relevance - a.relevance);
}

/** The one prompt to show (or none), after the lifecycle and fatigue rules. */
export function pickDiscovery(candidates: DiscoveryCandidate[], signals: Signals, state: DiscoveryState, now: number): DiscoveryCandidate | null {
  for (const c of candidates) {
    const life = lifecycle(c.featureId, signals, state, now, c.key);
    if (life === 'LEARNED' || life === 'DISMISSED' || life === 'TRIED') continue;
    const r = state[c.key];
    if (r?.status === 'shown' && r.shownDays.length >= MAX_SHOWN_DAYS) continue;
    return c;
  }
  return null;
}

/** Records that a prompt was seen today (once per day counts toward fatigue). */
export function markShown(state: DiscoveryState, key: string, now: number, day: string): DiscoveryState {
  const r = state[key];
  if (r && r.status !== 'shown') return state;
  const days = r?.shownDays || [];
  if (days.includes(day)) return state;
  return { ...state, [key]: { status: 'shown', shownDays: [...days, day].slice(-5), at: now } };
}
export const markTried = (state: DiscoveryState, key: string, now: number): DiscoveryState => ({ ...state, [key]: { status: 'tried', shownDays: state[key]?.shownDays || [], at: now } });
export const markDismissed = (state: DiscoveryState, key: string, now: number): DiscoveryState => ({ ...state, [key]: { status: 'dismissed', shownDays: state[key]?.shownDays || [], at: now } });

// ——— Perlu perhatian (Home): one warning cluster from canonical data ———

export type AttentionItem = { key: string; tone: 'critical' | 'important' | 'watch'; text: string; detail?: string; action: FeatureAction; weight: number };

/**
 * What needs the user's attention now, most important first. Reads stored records only (drafts, claims, receivables,
 * debts, plans) plus counts the caller already computed (budgets over the warning line, Periksa data issues).
 */
export function attentionItems(data: Data, today: string, extra: { budgetsOver?: number; budgetsWarn?: number; healthIssues?: number } = {}): AttentionItem[] {
  const out: AttentionItem[] = [];
  const inbox = data.drafts.filter(d => d.status === 'pending');
  if (inbox.length) out.push({ key: 'inbox', tone: 'important', text: `${inbox.length} tagihan menunggu konfirmasi`, detail: fmt(inbox.reduce((n, d) => n + d.amount, 0)), action: { kind: 'view', view: 'inbox' }, weight: 80 });
  if (extra.budgetsOver) out.push({ key: 'budgets-over', tone: 'critical', text: `${extra.budgetsOver} anggaran terlampaui`, action: { kind: 'view', view: 'budgets' }, weight: 90 });
  else if (extra.budgetsWarn) out.push({ key: 'budgets-warn', tone: 'watch', text: `${extra.budgetsWarn} anggaran hampir habis`, action: { kind: 'view', view: 'budgets' }, weight: 60 });
  const soon = (d: string) => d && d >= today && daysBetween(today, d) <= 7;
  const debtsDue = data.debts.filter(d => d.status !== 'paid' && d.outstandingAmount > 0 && soon(d.dueDate));
  if (debtsDue.length) out.push({ key: 'debts-due', tone: 'important', text: debtsDue.length === 1 ? `Cicilan ${debtsDue[0].name} jatuh tempo ${daysBetween(today, debtsDue[0].dueDate) === 0 ? 'hari ini' : `${daysBetween(today, debtsDue[0].dueDate)} hari lagi`}` : `${debtsDue.length} cicilan jatuh tempo minggu ini`, detail: fmt(debtsDue.reduce((n, d) => n + (d.installmentAmount || d.outstandingAmount), 0)), action: { kind: 'view', view: 'debts' }, weight: 85 });
  const claims = data.claims.filter(c => c.status !== 'paid' && c.status !== 'rejected' && c.remainingAmount > 0);
  const oldClaims = claims.filter(c => c.submissionDate && daysBetween(c.submissionDate, today) > 14);
  if (oldClaims.length) out.push({ key: 'claims-old', tone: 'watch', text: `${fmt(claims.reduce((n, c) => n + c.remainingAmount, 0))} masih di klaim kantor`, detail: `${oldClaims.length} sudah lebih dari 14 hari`, action: { kind: 'view', view: 'claims' }, weight: 55 });
  const lateRec = data.receivables.filter(r => r.remainingAmount > 0 && r.dueDate && r.dueDate < today);
  if (lateRec.length) out.push({ key: 'receivables-late', tone: 'watch', text: lateRec.length === 1 ? `Piutang ${lateRec[0].person} lewat jatuh tempo` : `${lateRec.length} piutang lewat jatuh tempo`, detail: fmt(lateRec.reduce((n, r) => n + r.remainingAmount, 0)), action: { kind: 'view', view: 'receivables' }, weight: 50 });
  const plans = data.plannedTransactions.filter(p => p.status === 'planned' && p.type === 'expense' && p.date >= today && daysBetween(today, p.date) <= 3);
  if (plans.length) out.push({ key: 'plans-soon', tone: 'watch', text: plans.length === 1 ? `${plans[0].title} dalam ${daysBetween(today, plans[0].date) || 0} hari` : `${plans.length} rencana pengeluaran dalam 3 hari`, detail: fmt(plans.reduce((n, p) => n + p.amount, 0)), action: { kind: 'view', view: 'upcoming' }, weight: 45 });
  if (extra.healthIssues) out.push({ key: 'health', tone: 'watch', text: `${extra.healthIssues} data perlu dicek`, detail: 'Periksa data', action: { kind: 'view', view: 'health' }, weight: 40 });
  return out.sort((a, b) => b.weight - a.weight);
}
