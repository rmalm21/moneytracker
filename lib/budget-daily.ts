/**
 * 10.1 "Hari ini sisa segini": once a spending is saved (chat, Catat otomatis, form Tambah), the budget it counts toward
 * says what today's share of it was and what is left of that share today ("jatah hari ini ±Rp50.000, udah kepake
 * Rp25.000, jadi hari ini sisa Rp25.000"). Today's share is worked out as the Anggaran menu does its "±Rp…/hari", from
 * where the budget stood when the day began: left after what is already planned, over the days remaining (today
 * included). A spending no budget covers gets nothing.
 *
 * Where a per-day figure would not mean anything, nothing is forced:
 *   - today already went past its share → how much past, and the share from tomorrow on that keeps the budget whole;
 *   - the share is too small for this budget's usual spending (Rp7.300 a day when one isi bensin is Rp50.000) → what is
 *     left and roughly how many more times it covers, to keep for what is needed;
 *   - the budget is used up or over → slow down, or raise the limit if this is a real need.
 */
import { budgetCurrent, budgetMatcher, budgetSpent, expenseAllocations, rupiah } from './accounting.ts';
import { budgetCommitted } from './finance-control.ts';
import type { Data } from './types';

export type SpentEntry = { categoryId?: string | null; subcategoryId?: string | null; amount: number; /** Outside the budget's current period it does not count toward it (a record backdated to last month). */ date?: string };
export type DailyState = 'today' | 'overToday' | 'tight' | 'over';
export type BudgetDaily = {
  budgetId: string; name: string; state: DailyState;
  /** Days left in the period, today included. */ days: number;
  /** Today's share (rounded down to Rp100), what today's spending in this budget came to, and what is left of the share today. */ perDay: number; spentToday: number; todayLeft: number;
  /** Left of the whole budget after everything (planned spending kept aside), and past the limit when it is negative. */ left: number; over: number;
  /** The share from tomorrow on, when today went past its own. */ tomorrow: number;
  /** One usual spending in this budget (median of the last 60 days, at least 3), and about how many more times what is left covers it. */ typical: number; times: number;
  /** What is left now shared evenly over the days remaining (today included), for "dibagi rata cuma ±Rp…/hari". */ even: number;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Rounded down to Rp100, so a share never says more than is there. */
export const perDayAmount = (n: number) => Math.max(0, Math.floor(n / 100) * 100);

/** One usual spending in a budget: the median of what was spent under it in the last 60 days (at least 3 times), else 0. */
function typicalSpend(data: Data, matches: ReturnType<typeof budgetMatcher>, todayYmd: string) {
  const from = new Date(`${todayYmd}T12:00:00`); from.setDate(from.getDate() - 60);
  const start = ymd(from), list: number[] = [];
  for (const tx of data.transactions) if (tx.date >= start && tx.date <= todayYmd) for (const l of expenseAllocations(tx)) if (l.amount > 0 && matches(l.categoryId, l.subcategoryId)) list.push(l.amount);
  if (list.length < 3) return 0;
  list.sort((a, b) => a - b);
  return list[Math.floor(list.length / 2)];
}

/**
 * The budgets these spendings count toward, each once, the narrowest first (a subcategory's budget before its whole
 * category's). `pending`: the spendings are not in `data` yet (the note is written before the ledger catches up), so
 * they are counted in here.
 */
export function dailyForSpending(data: Data, entries: SpentEntry[], today: Date, salaryDay: number, pending = true): BudgetDaily[] {
  const out: BudgetDaily[] = [], todayYmd = ymd(today);
  for (const b of data.budgets) {
    if (!b.active || b.classification === 'savings' || b.classification === 'sinking') continue;
    const matches = budgetMatcher(b, data.categories);
    const status = budgetCurrent(b, data.transactions, data.categories, today, salaryDay);
    const mine = entries.filter(e => e.amount > 0 && matches(e.categoryId, e.subcategoryId) && (!e.date || e.date >= status.start && e.date < status.end) && (!e.date || e.date <= todayYmd));
    if (!mine.length) continue;
    // Where the budget stood when today began, and what today has taken (the new spending included).
    const spentTodayData = budgetSpent(b, data.transactions.filter(t => t.date === todayYmd), data.categories);
    const newToday = pending ? mine.filter(e => !e.date || e.date === todayYmd).reduce((n, e) => n + e.amount, 0) : 0;
    const newBefore = pending ? mine.filter(e => e.date && e.date < todayYmd).reduce((n, e) => n + e.amount, 0) : 0;
    const committed = budgetCommitted(b, data, today, salaryDay), days = Math.max(1, status.daysRemaining);
    const leftAtDawn = status.available - (status.spent - spentTodayData) - newBefore - committed;
    const spentToday = spentTodayData + newToday, left = leftAtDawn - spentToday;
    const perDay = perDayAmount(leftAtDawn / days), typical = typicalSpend(data, matches, todayYmd);
    const tomorrow = days > 1 && left > 0 ? perDayAmount(left / (days - 1)) : 0;
    // Too small to mean anything for this budget: under half of one usual spending in it (or under Rp5.000 when nothing is usual yet).
    const tight = typical > 0 ? perDay < typical * 0.5 : perDay < 5000;
    // Past today's share and what is left a day from tomorrow on would be too small too: no share to promise either.
    const tomorrowTight = typical > 0 ? tomorrow < typical * 0.5 : tomorrow < 5000;
    const state: DailyState = left <= 0 ? 'over' : tight ? 'tight' : spentToday > perDay ? (days > 1 && tomorrowTight ? 'tight' : 'overToday') : 'today';
    // A few hundred rupiah left of today's share is "pas", not "sisa Rp100".
    const rest = Math.floor((perDay - spentToday) / 100) * 100;
    out.push({ budgetId: b.id, name: b.name, state, days, perDay, spentToday, todayLeft: rest < 1000 ? 0 : rest, left, over: left < 0 ? -left : 0, tomorrow, typical, times: typical > 0 ? Math.floor(Math.max(0, left) / typical) : 0, even: perDayAmount(Math.max(0, left) / days) });
  }
  const narrow = (id: string) => { const b = data.budgets.find(x => x.id === id); return (b?.subcategoryIds?.length || b?.subcategoryId) ? 0 : 1; };
  return out.sort((a, b) => narrow(a.budgetId) - narrow(b.budgetId)).slice(0, 2);
}

/** One plain line for a notification after saving. */
export function dailyLine(d: BudgetDaily): string {
  const n = d.name;
  switch (d.state) {
    case 'today': return d.todayLeft > 0
      ? `Jatah ${n} hari ini ±${rupiah(d.perDay)}, terpakai ${rupiah(d.spentToday)} → sisa hari ini ${rupiah(d.todayLeft)}.`
      : `Jatah ${n} hari ini ±${rupiah(d.perDay)} sudah pas terpakai. Sisanya buat besok.`;
    case 'overToday': return d.days > 1
      ? `${n}: hari ini terpakai ${rupiah(d.spentToday)}, lewat ${rupiah(d.spentToday - d.perDay)} dari jatah ±${rupiah(d.perDay)}. Mulai besok jatahnya ±${rupiah(d.tomorrow)}/hari.`
      : `${n}: hari ini hari terakhir periodenya, sisa anggaran ${rupiah(d.left)}.`;
    case 'tight': return d.times >= 1
      ? `Anggaran ${n} tinggal ${rupiah(d.left)} untuk ${d.days} hari, kira-kira cukup ${d.times}× lagi (sekali biasanya ±${rupiah(d.typical)}). Pakai untuk yang perlu saja.`
      : d.typical > 0
        ? `Anggaran ${n} tinggal ${rupiah(d.left)} untuk ${d.days} hari, sudah tidak cukup untuk sekali lagi (biasanya ±${rupiah(d.typical)}). Rem dulu, atau naikkan batasnya kalau memang perlu.`
        : `Anggaran ${n} tinggal ${rupiah(d.left)} untuk ${d.days} hari. Simpan untuk yang perlu saja.`;
    case 'over': return d.over > 0
      ? `Anggaran ${n} sudah lewat ${rupiah(d.over)}. Rem dulu ${d.days} hari ke depan, atau naikkan batasnya kalau ini memang kebutuhan.`
      : `Anggaran ${n} sudah habis. Rem dulu ${d.days} hari ke depan, atau naikkan batasnya kalau ini memang kebutuhan.`;
  }
}

/** 10.1 Whether the line is shown (Pengaturan chat → "Tampilkan jatah per hari", on unless switched off). */
export function dailyLineOn(uid: string | undefined): boolean {
  if (!uid) return true;
  try { const s = JSON.parse(localStorage.getItem(`dompet-ajaib:chat:settings:${uid}`) || 'null'); return !(s && s.daily === false); } catch { return true; }
}
