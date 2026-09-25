/**
 * Moving a recurring schedule forward. Monthly and yearly schedules keep their intended day
 * (`anchorDay`, e.g. 31): in a shorter month they fall on its last day, and the next month
 * goes back to the intended day instead of staying on the shortened one (31 Jan → 28 Feb → 31 Mar).
 */
import type { Recurring } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lastDay = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const validDay = (day: unknown) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;

/** The day a schedule is meant to fall on; older schedules without one use the day of their next date. */
export const scheduleDay = (schedule: Pick<Recurring, 'nextDate'> & { anchorDay?: number }) => validDay(schedule.anchorDay) ? schedule.anchorDay! : Number(schedule.nextDate.slice(8, 10)) || 1;

export function advanceSchedule(date: string, frequency: Recurring['frequency'], anchorDay?: number) {
  const d = new Date(`${date}T12:00:00`);
  if (frequency === 'weekly') { d.setDate(d.getDate() + 7); return iso(d); }
  const day = validDay(anchorDay) ? anchorDay! : d.getDate();
  const months = frequency === 'monthly' ? 1 : 12;
  const year = d.getFullYear() + Math.floor((d.getMonth() + months) / 12), month = (d.getMonth() + months) % 12;
  return iso(new Date(year, month, Math.min(day, lastDay(year, month)), 12));
}

/** Day to store when a schedule is saved: the chosen date's day, unless the date is unchanged (then keep the original). */
export function anchorFor(nextDate: string, previous?: { nextDate: string; anchorDay?: number } | null) {
  if (previous && previous.nextDate === nextDate && validDay(previous.anchorDay)) return previous.anchorDay!;
  return Number(nextDate.slice(8, 10)) || 1;
}
