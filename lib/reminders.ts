/** Daily reminders chosen by the user: update balances at set times, and upcoming bills. */
export type ReminderConfig = { balanceEnabled: boolean; times: string[]; billsEnabled: boolean; billTime: string; billDaysBefore: number; budgetAlerts?: boolean };
export const defaultReminders: ReminderConfig = { balanceEnabled: false, times: ['20:00'], billsEnabled: false, billTime: '08:00', billDaysBefore: 1 };
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
  const current = minutes(now), fire: ('balance' | 'bills')[] = [], consumed: string[] = [];
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
  return { fire, consumed };
}
