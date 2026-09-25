/**
 * Wish list maths: progress, when it can be bought, a mindful waiting period for big
 * purchases, and whether it is affordable right now. Pure functions, no storage.
 */
import type { WishItem } from './types';

const DAY = 86400000;
const parse = (date: string) => new Date(`${date}T12:00:00`);
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / DAY);

export const wishEmojis = ['🎧', '📱', '💻', '⌚', '📷', '🎮', '👟', '👜', '👗', '🕶️', '💄', '🎒', '💍', '💎', '🖥️', '⌨️', '📺', '🎸', '🎹', '📚', '🛋️', '🍳', '🪴', '🧸', '🐶', '🎁', '🚲', '🛵', '🏍️', '🚗', '🏠', '✈️', '🏖️', '⛺', '🧳', '🎫', '🎨'];
export const wishColors = ['#7b5cff', '#2fb7a3', '#f2a33a', '#e2558f', '#3f7fb0', '#d9534f', '#6b8e23', '#8b5e3c'];
export const priorityLabels: Record<WishItem['priority'], string> = { 1: 'Prioritas tinggi', 2: 'Prioritas sedang', 3: 'Santai saja' };

export const remaining = (w: Pick<WishItem, 'price' | 'saved'>) => Math.max(0, w.price - Math.max(0, w.saved || 0));
export const progress = (w: Pick<WishItem, 'price' | 'saved'>) => w.price > 0 ? Math.min(1, Math.max(0, w.saved || 0) / w.price) : 0;

/** Big purchases (≥ 20% of monthly income, or ≥ Rp2 jt without income) get 30 days to think; others 7 days. */
export function coolingDays(price: number, monthlyIncome: number) { return price >= (monthlyIncome ? monthlyIncome * .2 : 2_000_000) ? 30 : 7; }
export function coolingLeft(w: Pick<WishItem, 'price' | 'addedDate'>, monthlyIncome: number, today: string) {
  return Math.max(0, coolingDays(w.price, monthlyIncome) - daysBetween(w.addedDate, today));
}

/** When the item is reached at the monthly set-aside (or the target date's pace). */
export function eta(w: Pick<WishItem, 'price' | 'saved' | 'monthly' | 'targetDate'>, today: string): { months: number; date: string } | null {
  const left = remaining(w);
  if (!left) return { months: 0, date: today };
  const monthly = w.monthly || 0;
  if (monthly > 0) { const months = Math.ceil(left / monthly); const d = parse(today); d.setMonth(d.getMonth() + months); return { months, date: iso(d) }; }
  return null;
}
/** Monthly set-aside needed to reach the target date. */
export function monthlyForDate(w: Pick<WishItem, 'price' | 'saved'>, targetDate: string, today: string) {
  const months = Math.max(1, Math.ceil(daysBetween(today, targetDate) / 30.4));
  return Math.ceil(remaining(w) / months / 10_000) * 10_000;
}

export type Readiness = { kind: 'reached' | 'affordable' | 'saving' | 'wait'; label: string };
/** Can it be bought now? Uses what is still missing against free money after bills; never more than half of it. */
export function readiness(w: WishItem, freeAfterBills: number, monthlyIncome: number, today: string): Readiness {
  const left = remaining(w), wait = coolingLeft(w, monthlyIncome, today);
  if (!left) return wait ? { kind: 'wait', label: `Terkumpul! Tunggu ${wait} hari lagi sebelum beli` } : { kind: 'reached', label: 'Terkumpul — siap dibeli' };
  if (left <= Math.max(0, freeAfterBills) * .5) return wait ? { kind: 'wait', label: `Mampu beli, tapi tunggu ${wait} hari lagi` } : { kind: 'affordable', label: 'Aman dibeli dari uang bebas' };
  return { kind: 'saving', label: wait ? `Masa pikir-pikir ${wait} hari lagi` : 'Terus sisihkan' };
}

export function sortWishes(list: WishItem[], mode: 'manual' | 'priority' | 'nearest' | 'cheap' | 'expensive', today: string) {
  const copy = [...list];
  if (mode === 'manual') return copy.sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.addedDate.localeCompare(b.addedDate));
  if (mode === 'priority') return copy.sort((a, b) => a.priority - b.priority || progress(b) - progress(a));
  if (mode === 'cheap') return copy.sort((a, b) => remaining(a) - remaining(b));
  if (mode === 'expensive') return copy.sort((a, b) => b.price - a.price);
  const months = (w: WishItem) => { const e = eta(w, today); return e ? e.months : 1e6 - progress(w); };
  return copy.sort((a, b) => months(a) - months(b));
}

export function wishSummary(list: WishItem[]) {
  const active = list.filter(w => w.status === 'active');
  const total = active.reduce((n, w) => n + w.price, 0), saved = active.reduce((n, w) => n + Math.min(w.price, Math.max(0, w.saved || 0)), 0);
  return { count: active.length, total, saved, monthly: active.filter(w => remaining(w) > 0).reduce((n, w) => n + (w.monthly || 0), 0), ready: active.filter(w => !remaining(w)).length, bought: list.filter(w => w.status === 'bought').length, progress: total ? saved / total : 0 };
}
