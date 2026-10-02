/**
 * Bunga saldo otomatis (per dompet, opt-in).
 *
 * Model: every completed day D from the start date gets interest on the wallet's closing balance of D (all its
 * transactions dated D or earlier, plus the interest already credited for earlier days). The net interest (after the
 * optional tax) is credited as one ordinary income transaction dated D at 23:59, with the calculation kept on it
 * (`LedgerTx.interest`). Nothing else touches the balance.
 *
 * The engine is a pure function of (settings, transaction history, today): `planInterest` returns what the interest
 * records should be, `reconcileInterest` compares that with what exists. Catch-up after days away, a backdated edit,
 * a refresh, a second tab or a second phone all lead to the same records; every record has a fixed id
 * (`wint_{walletId}_{YYYY-MM-DD}`), so a day can never be credited twice.
 *
 * Precision: amounts are worked out in micro-rupiah with integers (BigInt). Only whole rupiah are credited; the
 * fraction below Rp1 is carried to the next day, so nothing is lost over time and no floating point drift builds up.
 */
import { effects } from './accounting.ts';
import type { LedgerTx, Wallet } from './types.ts';

export type InterestBasis = 'year' | 'month';
/** One stretch of settings: from `from` (inclusive) until the next period starts. Old days keep the rate they had. */
/** When accrued interest is paid into the wallet: every day, every week on a weekday (1 = Senin … 7 = Minggu), or
 * every month on a day (1–31; a shorter month pays on its last day). Interest still accrues daily either way. */
export type InterestPayout = 'day' | 'week' | 'month';
export type InterestPeriod = { from: string; rate: number; basis: InterestBasis; tax: boolean; taxRate: number; payout?: InterestPayout; payoutDay?: number };
/** `endDate` (exclusive) is set when the feature is turned off: no interest from that day on. */
export type WalletInterest = { enabled: boolean; startDate: string; endDate?: string; periods: InterestPeriod[] };
/** The calculation behind one credited day, kept on its transaction. Micro-rupiah = rupiah × 1 000 000. */
export type InterestRecord = {
  source: 'wallet_interest'; walletId: string; date: string; closing: number; rate: number; basis: InterestBasis;
  taxEnabled: boolean; taxRate: number; grossMicro: number; taxMicro: number; netMicro: number; carryInMicro: number; carryOutMicro: number;
  /** Paid weekly or monthly: the accrual days this payment covers (from `accrualFrom` to `date`) and how it is paid. */
  accrualFrom?: string; days?: number; payout?: InterestPayout;
  /** Checked against the bank by the user: the transaction's amount is then the bank's, `calculated` the app's own.
   * A confirmed record is real money that the engine never rewrites or removes. */
  confirmed?: { at: string; calculated: number };
};

export const DAY_COUNT_BASIS = 365;
export const DEFAULT_TAX_RATE = 20;
const MICRO = BigInt(1000000);
/** Rates and tax are kept to 4 decimals (4.25 % → 42 500 per 10 000 %). */
const scaled = (percent: number) => BigInt(Math.round(Math.max(0, percent) * 10_000));

export const interestId = (walletId: string, date: string) => `wint_${walletId}_${date}`;
export const isInterestTx = (tx: Pick<LedgerTx, 'interest'>, walletId?: string) => Boolean(tx.interest && tx.interest.source === 'wallet_interest' && (!walletId || tx.interest.walletId === walletId));

/** The yearly rate a period stands for (a monthly rate × 12), the one shown as "p.a.". */
export const annualRate = (period: Pick<InterestPeriod, 'rate' | 'basis'>) => period.basis === 'month' ? period.rate * 12 : period.rate;

/**
 * One day's interest on a closing balance — THE formula, used by the engine and by the simulation alike:
 *   gross = closing × annual rate ÷ 100 ÷ 365
 *   tax   = gross × tax rate ÷ 100   (0 when tax is off)
 *   net   = gross − tax
 * Zero or negative balances earn nothing.
 */
export function dailyInterest(closing: number, period: Pick<InterestPeriod, 'rate' | 'basis' | 'tax' | 'taxRate'>) {
  if (!(closing > 0) || !(period.rate > 0)) return { grossMicro: BigInt(0), taxMicro: BigInt(0), netMicro: BigInt(0) };
  // closing (Rp) × rate% ÷ 100 ÷ 365 → micro: closing × rate×10⁴ × 10⁶ ÷ (10⁴ × 100 × 365 × [12 for monthly → ×12])
  const months = period.basis === 'month' ? BigInt(12) : BigInt(1);
  const grossMicro = BigInt(Math.round(closing)) * scaled(period.rate) * months * MICRO / (BigInt(10000) * BigInt(100) * BigInt(DAY_COUNT_BASIS));
  const taxMicro = period.tax ? grossMicro * scaled(period.taxRate) / (BigInt(10000) * BigInt(100)) : BigInt(0);
  return { grossMicro, taxMicro, netMicro: grossMicro - taxMicro };
}
/** Micro-rupiah → rupiah with decimals, for showing the calculation (Rp1.232,88). */
export const microToRupiah = (micro: bigint | number) => Number(BigInt(micro)) / 1e6;

export function periodOn(settings: WalletInterest, date: string): InterestPeriod | null {
  let found: InterestPeriod | null = null;
  for (const period of [...settings.periods].sort((a, b) => a.from.localeCompare(b.from))) if (period.from <= date) found = period;
  return found;
}

/** Days as YYYY-MM-DD strings, without time zones getting in the way. */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
const MAX_DAYS = 3660;

const weekday = (date: string) => { const d = new Date(`${date}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const daysInMonth = (date: string) => { const [y, m] = date.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** Whether `date` is a payout day under a period's schedule. */
export function isPayoutDay(date: string, period: Pick<InterestPeriod, 'payout' | 'payoutDay'>) {
  if (!period.payout || period.payout === 'day') return true;
  if (period.payout === 'week') return weekday(date) === Math.min(7, Math.max(1, period.payoutDay || 1));
  const day = Math.min(31, Math.max(1, period.payoutDay || 31));
  return Number(date.slice(8, 10)) === Math.min(day, daysInMonth(date));
}
/** The first payout day on or after `date`. */
export function nextPayout(date: string, period: Pick<InterestPeriod, 'payout' | 'payoutDay'>) {
  let day = date; for (let n = 0; n < 62 && !isPayoutDay(day, period); n++) day = addDays(day, 1); return day;
}

export type PlannedInterest = { id: string; date: string; amount: number; record: InterestRecord };
/** What has accrued since the last payout and is not in the wallet yet (paid on `nextPayout`). */
export type InterestPending = { micro: number; from: string; days: number; nextPayout: string | null };
/**
 * The interest records a wallet should have, for every completed day in its window: from the start date until the
 * end date (if turned off) or yesterday. `today` is the user's local date (Asia/Jakarta by default); today itself is
 * not complete, so it is never credited early.
 *
 * Each day accrues gross − tax on its closing balance. On a payout day (every day by default; or weekly / monthly)
 * what has accrued is paid as one record; until then it is pending and not part of the balance, so interest
 * compounds from each payout. Turning the feature off pays what has accrued on the last day.
 */
export function planInterest(wallet: Pick<Wallet, 'id' | 'openingBalance'> & { interest?: WalletInterest }, transactions: LedgerTx[], today: string): PlannedInterest[] {
  return runInterest(wallet, transactions, today).planned;
}
export function runInterest(wallet: Pick<Wallet, 'id' | 'openingBalance'> & { interest?: WalletInterest }, transactions: LedgerTx[], today: string): { planned: PlannedInterest[]; pending: InterestPending | null } {
  const settings = wallet.interest;
  // Turned off: the closed window [start, end) still pays what had accrued (once, see reconcileInterest).
  if (!settings || !(settings.enabled || settings.endDate) || !settings.startDate || !settings.periods?.length) return { planned: [], pending: null };
  const last = [addDays(today, -1), settings.endDate ? addDays(settings.endDate, -1) : '9999-12-31'].sort()[0];
  const closesWindow = Boolean(settings.endDate && last === addDays(settings.endDate, -1));
  if (last < settings.startDate) return { planned: [], pending: null };
  const managed = (tx: LedgerTx) => isInterestTx(tx, wallet.id) && !tx.interest?.confirmed && tx.date >= settings.startDate && tx.date <= last;
  // A payout the user confirmed (or corrected to the bank's figure) stays as it is: it counts as money in the wallet,
  // and that day's accrual is settled by it.
  const confirmedDays = new Set(transactions.filter(tx => isInterestTx(tx, wallet.id) && tx.interest?.confirmed && tx.date >= settings.startDate && tx.date <= last).map(tx => tx.date));
  // Everything else moves the base balance: opening balance, all other transactions, confirmed payouts, and interest
  // from outside the window (an earlier time the feature was on), which is real money in the wallet.
  let running = wallet.openingBalance;
  const byDay = new Map<string, number>();
  for (const tx of transactions) {
    if (managed(tx)) continue;
    const delta = effects(tx)[wallet.id] || 0;
    if (!delta) continue;
    if (tx.date < settings.startDate) running += delta;
    else if (tx.date <= last) byDay.set(tx.date, (byDay.get(tx.date) || 0) + delta);
  }
  const zero = BigInt(0);
  const planned: PlannedInterest[] = [];
  let credited = 0, carry = zero, day = settings.startDate;
  let acc = { gross: zero, tax: zero, net: zero, from: '', days: 0 };
  for (let n = 0; n < MAX_DAYS && day <= last; n++, day = addDays(day, 1)) {
    running += byDay.get(day) || 0;
    const closing = running + credited, period = periodOn(settings, day);
    if (period && closing > 0) {
      const d = dailyInterest(closing, period);
      if (d.grossMicro > zero) { acc = { gross: acc.gross + d.grossMicro, tax: acc.tax + d.taxMicro, net: acc.net + d.netMicro, from: acc.from || day, days: acc.days + 1 }; }
    }
    if (confirmedDays.has(day)) { carry = zero; acc = { gross: zero, tax: zero, net: zero, from: '', days: 0 }; continue; }
    if (!period || !acc.days || !(isPayoutDay(day, period) || (closesWindow && day === last))) continue;
    const pot = acc.net + carry, amount = Number(pot / MICRO), carryIn = carry;
    carry = pot % MICRO;
    if (amount > 0) {
      credited += amount;
      const several = acc.days > 1 || acc.from !== day;
      planned.push({ id: interestId(wallet.id, day), date: day, amount, record: {
        source: 'wallet_interest', walletId: wallet.id, date: day, closing, rate: period.rate, basis: period.basis,
        taxEnabled: period.tax, taxRate: period.tax ? period.taxRate : 0,
        grossMicro: Number(acc.gross), taxMicro: Number(acc.tax), netMicro: Number(acc.net), carryInMicro: Number(carryIn), carryOutMicro: Number(carry),
        ...(several ? { accrualFrom: acc.from, days: acc.days } : {}), ...(period.payout && period.payout !== 'day' ? { payout: period.payout } : {}),
      } });
    }
    acc = { gross: zero, tax: zero, net: zero, from: '', days: 0 };
  }
  const period = periodOn(settings, today) || periodOn(settings, last);
  const pending = acc.days ? { micro: Number(acc.net + carry), from: acc.from, days: acc.days, nextPayout: period && !closesWindow ? nextPayout(today, period) : null } : null;
  return { planned, pending };
}

export type InterestChanges = { create: PlannedInterest[]; update: PlannedInterest[]; remove: LedgerTx[] };
/**
 * What to write so the stored records match the plan. Only records inside the managed window are touched: interest
 * from before the start date or after the feature was turned off stays as it is (nothing is deleted on disable).
 */
export function reconcileInterest(wallet: Pick<Wallet, 'id'> & { interest?: WalletInterest }, planned: PlannedInterest[], transactions: LedgerTx[], today: string): InterestChanges {
  const settings = wallet.interest;
  const changes: InterestChanges = { create: [], update: [], remove: [] };
  if (!settings || !(settings.enabled || settings.endDate) || !settings.startDate) return changes;
  // Turned off: only what is still owed is added; nothing already credited is changed or removed.
  const closed = !settings.enabled;
  const last = [addDays(today, -1), settings.endDate ? addDays(settings.endDate, -1) : '9999-12-31'].sort()[0];
  const existing = new Map(transactions.filter(tx => isInterestTx(tx, wallet.id) && !tx.interest?.confirmed && tx.date >= settings.startDate && tx.date <= last).map(tx => [tx.id, tx]));
  for (const item of planned) {
    const old = existing.get(item.id);
    existing.delete(item.id);
    if (!old) changes.create.push(item);
    else if (closed) continue;
    else if (old.amount !== item.amount || old.date !== item.date || old.interest?.closing !== item.record.closing || old.interest?.rate !== item.record.rate || old.interest?.taxRate !== item.record.taxRate || old.interest?.netMicro !== item.record.netMicro) changes.update.push(item);
  }
  if (!closed) changes.remove.push(...existing.values());
  return changes;
}

/** Interest that would be credited for today if the day ended now (informational; never part of the balance). */
export function estimateToday(wallet: Pick<Wallet, 'id' | 'openingBalance'> & { interest?: WalletInterest }, transactions: LedgerTx[], today: string) {
  const settings = wallet.interest;
  if (!settings?.enabled || settings.startDate > today || (settings.endDate && settings.endDate <= today)) return null;
  const period = periodOn(settings, today);
  if (!period) return null;
  const closing = wallet.openingBalance + transactions.filter(tx => tx.date <= today).reduce((sum, tx) => sum + (effects(tx)[wallet.id] || 0), 0);
  const day = dailyInterest(closing, period);
  return { closing, ...day, net: Math.round(microToRupiah(day.netMicro)) };
}

/**
 * The simulation on the settings screen: the same daily formula and the same whole-rupiah crediting with carry,
 * compounding for `days` days with no other transactions. Informational only; it writes nothing.
 */
export function simulateInterest(balance: number, period: Pick<InterestPeriod, 'rate' | 'basis' | 'tax' | 'taxRate' | 'payout'>, days = 30) {
  const first = dailyInterest(balance, period);
  // Paid every day, every 7 days or every 30 days (a simple stand-in for the real calendar; informational only).
  const every = period.payout === 'week' ? 7 : period.payout === 'month' ? 30 : 1;
  let current = Math.max(0, Math.round(balance)), carry = BigInt(0), accrued = BigInt(0), total = 0;
  for (let n = 1; n <= days; n++) {
    accrued += dailyInterest(current, period).netMicro;
    if (n % every && n !== days) continue;
    const pot = accrued + carry, amount = Number(pot / MICRO);
    carry = pot % MICRO; accrued = BigInt(0); current += amount; total += amount;
  }
  return { gross: microToRupiah(first.grossMicro), tax: microToRupiah(first.taxMicro), net: microToRupiah(first.netMicro), days, total, ending: current };
}

/**
 * New settings after the user saves the form. A changed rate or tax starts a new period from `effective` (default
 * today), so earlier days keep the rate they were calculated with. Turning off sets the end date (today: the last
 * credited day is yesterday); turning back on starts a new window.
 */
export function updateInterestSettings(current: WalletInterest | undefined, input: { enabled: boolean; rate: number; basis: InterestBasis; tax: boolean; taxRate: number; startDate: string; payout?: InterestPayout; payoutDay?: number }, today: string): WalletInterest | undefined {
  const payout = input.payout || 'day';
  const next = { rate: Math.max(0, input.rate), basis: input.basis, tax: input.tax, taxRate: Math.min(100, Math.max(0, input.taxRate)), payout, ...(payout === 'day' ? {} : { payoutDay: Math.round(input.payoutDay || (payout === 'week' ? 1 : 31)) }) };
  if (!input.enabled) return current ? { ...current, enabled: false, endDate: current.endDate && current.endDate < today ? current.endDate : today } : undefined;
  const reopening = !current || !current.enabled;
  if (reopening) {
    const start = input.startDate || today;
    return { enabled: true, startDate: start, periods: [...(current?.periods || []).filter(p => p.from < start), { from: start, ...next }] };
  }
  const active = periodOn(current, today) || current.periods[current.periods.length - 1];
  const same = active && active.rate === next.rate && active.basis === next.basis && active.tax === next.tax && (!next.tax || active.taxRate === next.taxRate) && (active.payout || 'day') === next.payout && (next.payout === 'day' || active.payoutDay === next.payoutDay);
  // The start date can still move while nothing has been credited under it (it is in the future).
  const startDate = current.startDate > today && input.startDate ? input.startDate : current.startDate;
  if (same && startDate === current.startDate) return current;
  const from = startDate > today ? startDate : today;
  const periods = same ? current.periods.map(p => p.from === current.startDate ? { ...p, from: startDate } : p) : [...current.periods.filter(p => p.from < from), { from, ...next }];
  return { enabled: true, startDate, periods };
}

/** Credited interest the user has not checked against the bank yet, newest first. */
export const unconfirmedInterest = (transactions: LedgerTx[], walletId: string) => transactions.filter(tx => isInterestTx(tx, walletId) && !tx.interest?.confirmed).sort((a, b) => b.date.localeCompare(a.date));
