/**
 * 10.3 Grafik Kategori, diperdalam: the numbers behind one category or subcategory of the chart for a period —
 * total, how many transactions, the average, per day, a trend over the period, the names that come back most,
 * the biggest transactions, and the busiest day of the week. Pure: the chart (components/category-donut.tsx)
 * gives it the parts from lib/category-analytics.ts `categoryLines`.
 * A period is a lib/period.ts DateRange: `end` is the day after its last day.
 */
import type { CategoryLine } from './category-analytics';
import type { LedgerTx } from './types';

export type DrillTx = { tx: LedgerTx; amount: number };
export type DrillName = { name: string; amount: number; count: number };
export type DrillBucket = { key: string; label: string; start: string; end: string; amount: number };
export type DrillUnit = 'day' | 'week' | 'month';
export type DrillStats = {
  total: number; count: number; average: number; perDay: number; days: number;
  biggest: DrillTx[]; names: DrillName[]; buckets: DrillBucket[]; unit: DrillUnit;
  busiestDay: { day: string; count: number } | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_MS = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Days from `start` to `last`, both counted. */
const span = (start: string, last: string) => Math.round((at(last) - at(start)) / DAY_MS) + 1;
/** The last day of a period (its `end` is the day after). */
export const lastDay = (end: string) => iso(at(end) - DAY_MS);
/** "12 Okt". */
export const shortDate = (date: string) => { const d = new Date(at(date)); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** The parts of one transaction added together (a payment split over two subcategories of the same category is one transaction). */
export function byTransaction(lines: CategoryLine[]): DrillTx[] {
  const seen = new Map<string, DrillTx>();
  for (const line of lines) { const row = seen.get(line.tx.id); if (row) row.amount += line.amount; else seen.set(line.tx.id, { tx: line.tx, amount: line.amount }); }
  return [...seen.values()];
}

/** What a transaction is called on the chart: the place, else its name, else the person. */
export function drillName(tx: LedgerTx) { return (tx.merchant || tx.description || tx.counterparty || '').trim().replace(/\s+/g, ' '); }

/** Day bars for a month or less, week bars up to about three months, month bars beyond. */
export function drillUnit(start: string, end: string): DrillUnit { const days = span(start, lastDay(end)); return days <= 31 ? 'day' : days <= 98 ? 'week' : 'month'; }

/** Empty bars covering the whole period (days not yet come stay empty, so the shape of the period shows). */
export function drillBuckets(start: string, end: string, unit = drillUnit(start, end)): DrillBucket[] {
  const out: DrillBucket[] = [], last = at(end) - DAY_MS;
  if (unit === 'month') {
    const first = new Date(at(start));
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); Date.UTC(y, m, 1) <= last; m === 11 ? (y++, m = 0) : m++) {
      const from = Math.max(Date.UTC(y, m, 1), at(start)), to = Math.min(Date.UTC(y, m + 1, 0), last);
      out.push({ key: `${y}-${m}`, label: MONTHS[m], start: iso(from), end: iso(to), amount: 0 });
    }
    return out;
  }
  const step = unit === 'day' ? 1 : 7;
  for (let from = at(start); from <= last; from += step * DAY_MS) {
    const to = Math.min(from + (step - 1) * DAY_MS, last), d = new Date(from);
    out.push({ key: iso(from), label: unit === 'day' ? String(d.getUTCDate()) : shortDate(iso(from)), start: iso(from), end: iso(to), amount: 0 });
  }
  return out;
}

/**
 * Everything the detail of one slice shows, for the period `start`..`end`. `today` limits the per-day average to the
 * days that have passed (a salary cycle that is half over is not averaged over its empty second half).
 */
export function drillStats(lines: CategoryLine[], range: { start: string; end: string }, today: string, take = 5): DrillStats & { full: number } {
  const txs = byTransaction(lines), total = txs.reduce((sum, row) => sum + row.amount, 0), count = txs.length;
  const upTo = today >= range.start && today < range.end ? today : lastDay(range.end), days = Math.max(1, span(range.start, upTo));
  const unit = drillUnit(range.start, range.end), buckets = drillBuckets(range.start, range.end, unit);
  for (const row of txs) { const bucket = buckets.find(b => row.tx.date >= b.start && row.tx.date <= b.end); if (bucket) bucket.amount += row.amount; }
  const names = new Map<string, DrillName>();
  for (const row of txs) {
    const name = drillName(row.tx); if (!name) continue;
    const key = name.toLocaleLowerCase('id-ID'), seen = names.get(key);
    if (seen) { seen.amount += row.amount; seen.count++; } else names.set(key, { name, amount: row.amount, count: 1 });
  }
  const weekdays = new Array(7).fill(0);
  for (const row of txs) if (row.tx.date) weekdays[new Date(at(row.tx.date)).getUTCDay()]++;
  const top = Math.max(...weekdays), busiest = weekdays.indexOf(top);
  // A busiest day says something only when it stands out (at least 2, and more than any other day).
  const busiestDay = top >= 2 && weekdays.filter(n => n === top).length === 1 ? { day: DAYS[busiest], count: top } : null;
  return {
    total, count, average: count ? total / count : 0, perDay: total / days, days, full: span(range.start, lastDay(range.end)),
    biggest: [...txs].sort((a, b) => b.amount - a.amount || (b.tx.date || '').localeCompare(a.tx.date || '')).slice(0, take),
    names: [...names.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, take),
    buckets, unit, busiestDay,
  };
}

/** Amount per subcategory id (null = no subcategory) of some parts. */
export function amountsBySub(lines: CategoryLine[]) {
  const out = new Map<string | null, number>();
  for (const line of lines) out.set(line.subId, (out.get(line.subId) || 0) + line.amount);
  return out;
}
