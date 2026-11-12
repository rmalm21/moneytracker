/**
 * 9.9.1 Reused date and number formatters. Making an Intl formatter is slow (a phone spends a good fraction of a
 * millisecond on each), and the app used to make a new one for every date it showed or counted: hundreds while it
 * opened, and again on every menu. The same formatter for the same language and options is now made once and kept.
 * The text it gives is exactly the same as before.
 */
const dates = new Map<string, Intl.DateTimeFormat>();
const numbers = new Map<string, Intl.NumberFormat>();

/** `new Intl.DateTimeFormat(locale, options)`, made once per locale + options (throws the same way for a bad time zone). */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dates.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, options); dates.set(key, f); }
  return f;
}

/** `new Intl.NumberFormat(locale, options)`, made once per locale + options. */
export function numberFormat(locale: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numbers.get(key);
  if (!f) { f = new Intl.NumberFormat(locale, options); numbers.set(key, f); }
  return f;
}

/**
 * Same text as `date.toLocaleDateString(locale, options)` for options that name a date part (day, month, year or
 * weekday), which is how the app always calls it; an invalid date still reads "Invalid Date".
 */
export function localeDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return Number.isNaN(date.getTime()) ? 'Invalid Date' : dateFormat(locale, options).format(date);
}

/** Same text as `date.toLocaleTimeString(locale, options)` for options that name a time part (hour, minute or second). */
export function localeTime(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return Number.isNaN(date.getTime()) ? 'Invalid Date' : dateFormat(locale, options).format(date);
}

/** Same text as `value.toLocaleString(locale, options)` for a number. */
export function localeNumber(value: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return numberFormat(locale, options).format(value);
}
