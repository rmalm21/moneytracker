/** Daily reminders chosen by the user: update balances at set times, and upcoming bills. */
export type ReminderConfig = { balanceEnabled: boolean; times: string[]; billsEnabled: boolean; billTime: string; billDaysBefore: number; budgetAlerts?: boolean;
  /** 8.5 "Hari ini belum ada catatan": at this time, only on a day with nothing recorded yet. */
  quietEnabled?: boolean; quietTime?: string };
export const defaultReminders: ReminderConfig = { balanceEnabled: false, times: ['20:00'], billsEnabled: false, billTime: '08:00', billDaysBefore: 1, quietEnabled: false, quietTime: '20:30' };
/** Sensible times for 1–4 reminders a day. */
export const presetTimes: Record<number, string[]> = { 1: ['20:00'], 2: ['12:00', '20:00'], 3: ['08:00', '13:00', '20:00'], 4: ['08:00', '12:00', '17:00', '21:00'] };
/** Only remind for a time that passed at most this long ago (so opening the app late still reminds once). */
export const GRACE_MINUTES = 180;
const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/**
 * Which reminders to show now. Several missed balance times collapse into one notification;
 * every time that has passed is marked as done so it is not shown again today.
 */
export function dueReminders(config: ReminderConfig, now: string, fired: string[]) {
  const current = minutes(now), fire: ('balance' | 'bills' | 'quiet')[] = [], consumed: string[] = [];
  const passed = (time: string) => validTime(time) && minutes(time) <= current;
  const recent = (time: string) => current - minutes(time) <= GRACE_MINUTES;
  if (config.balanceEnabled) {
    const open = config.times.filter(time => passed(time) && !fired.includes(`balance@${time}`));
    if (open.some(recent)) fire.push('balance');
    consumed.push(...open.map(time => `balance@${time}`));
  }
  if (config.billsEnabled && passed(config.billTime) && !fired.includes(`bills@${config.billTime}`)) {
    if (recent(config.billTime)) fire.push('bills');
    consumed.push(`bills@${config.billTime}`);
  }
  const quiet = config.quietTime || defaultReminders.quietTime!;
  if (config.quietEnabled && passed(quiet) && !fired.includes(`quiet@${quiet}`)) {
    if (recent(quiet)) fire.push('quiet');
    consumed.push(`quiet@${quiet}`);
  }
  return { fire, consumed };
}

/**
 * 8.5 The last day something was recorded by the person: wallet interest and schedules recorded by themselves do not
 * count ("Hari ini belum ada catatan" is about what the person writes down).
 */
export function lastRecordDate(transactions: { id: string; date: string; recurringTransactionId?: string | null; interest?: unknown }[]): string {
  let last = '';
  for (const t of transactions) if (!t.id.startsWith('wint_') && !t.interest && !t.recurringTransactionId && t.date > last) last = t.date;
  return last;
}
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 864e5);
/** The reminder for a day with nothing recorded yet, or null when something was (today or later). */
export function quietReminder(lastRecord: string, today: string): { title: string; body: string } | null {
  if (lastRecord && lastRecord >= today) return null;
  const days = lastRecord ? dayNumber(today) - dayNumber(lastRecord) : 0;
  return days >= 2
    ? { title: `Sudah ${days} hari belum ada catatan 📝`, body: 'Ada yang kelewat? Jajan, parkir, atau transfer kecil, catat sekarang biar saldo tetap cocok.' }
    : { title: 'Hari ini belum ada catatan 📝', body: 'Ada yang kelewat? Jajan, parkir, atau transfer kecil, catat sekarang biar saldo tetap cocok.' };
}
