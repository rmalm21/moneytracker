/**
 * Catat otomatis V3.1 — Temporal Intelligence Engine (deterministic; NLP.js never does clock arithmetic).
 *
 *   discovery (time spans after "jam / jm / pukul", a colon clock, "setengah 3 sore")
 *   → number words ("tiga", "dua belas", "seperempat") → clock grammar:
 *        24h "19:45" · dot "12.10" · space "12 10" · compact "1200" · "12 lewat 10" · "3 kurang 15"
 *        · Indonesian half hours ("setengah satu" = base 12:30, "set 12" = base 11:30) · plain "jam 1"
 *   → daypart (pagi / siang / sore / malam) → smart 12-hour inference (nearest plausible timestamp)
 *
 * Spans found here are owned by the time field: the amount reader, the merchant and the description never read them
 * (lib/quick-entry.ts blanks them by offset). Nothing here guesses money or a date that the text does not give.
 */

export type TimeKind = 'colon' | 'dot' | 'space' | 'compact' | 'lewat' | 'kurang' | 'half' | 'plain';
export type TimeExpr = {
  start: number; end: number; raw: string;
  /** Clock read from the words before any AM/PM choice: hour 1–12 for a 12-hour reading, 0–23 when `is24`. */
  hour: number; minute: number; is24: boolean;
  daypart?: 'pagi' | 'siang' | 'sore' | 'malam' | 'subuh';
  kind: TimeKind;
  /** The marker that made it a time ("jam", "pukul", ":" …). */
  marker: string;
};
export type TemporalResolution = {
  time: string; date: string;
  /** verified: the words fix the clock (24h, daypart); likely: chosen from context; check: two readings stay plausible. */
  status: 'verified' | 'likely' | 'check';
  inferred: boolean;
  alternatives: { date: string; time: string }[];
  reason: string;
  /** Developer trace of the candidates considered. */
  trace: string[];
};

/* ---------------------------------------------------------------- number words (one normalizer, reused) */

const UNITS: Record<string, number> = { nol: 0, kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, lapan: 8, sembilan: 9 };
const SINGLE: Record<string, number> = { sepuluh: 10, sebelas: 11, seperempat: 15, setengah: 30 };
/** "tiga" → 3, "dua belas" → 12, "lima belas" → 15, "dua puluh lima" → 25, "sepuluh" → 10, "seperempat" → 15; digits as they are. */
export function readNumberWords(text: string): { value: number; length: number } | null {
  const digits = text.match(/^\d+/);
  if (digits) return { value: Number(digits[0]), length: digits[0].length };
  const m = text.match(/^(\p{L}+)(?:(\s+)(\p{L}+))?(?:(\s+)(\p{L}+))?/u);
  if (!m) return null;
  const [w0, s1 = '', w1 = '', s2 = '', w2 = ''] = [m[1], m[2], m[3], m[4], m[5]];
  if (w0 in SINGLE) return { value: SINGLE[w0], length: w0.length };
  if (!(w0 in UNITS)) return null;
  const base = UNITS[w0];
  if (w1 === 'belas') return { value: 10 + base, length: w0.length + s1.length + w1.length };
  if (w1 === 'puluh') {
    const tail = w2 in UNITS ? UNITS[w2] : 0;
    return { value: base * 10 + tail, length: w0.length + s1.length + w1.length + (w2 in UNITS ? s2.length + w2.length : 0) };
  }
  return { value: base, length: w0.length };
}

/* ---------------------------------------------------------------- discovery and clock grammar */

const MARKER = /(?:^|[^\p{L}\p{N}])(jam|jm|pukul|pkl|pk)(?=\s*(?:\d|set|setengah|setngah|setngh|stengah|stgh|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|nol))/gu;
const HALF = /^(?:setengah|setngah|setngh|stengah|stgh|set)\s*(?=\S)/;
const DAYPART = /^\s*(pagi|siang|sore|malam|subuh|dini hari)(?![\p{L}])/u;
const MONEY_AFTER = /^\s*(?:(?:k|rb|ribu|rbu|jt|juta|x|kali|orang|org|pcs|buah|porsi|gelas)(?![\p{L}])|%)/u;
const valid = (h: number, m: number) => Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;

/** Reads the clock that starts at `at` (right after a marker). */
function clockAt(text: string, at: number, marker: string, markerStart: number): TimeExpr | null {
  let i = at; const skip = () => { while (text[i] === ' ') i++; };
  skip();
  const make = (hour: number, minute: number, kind: TimeKind, is24: boolean): TimeExpr | null => {
    if (!valid(is24 ? hour : hour % 12, minute) || (!is24 && (hour < 1 || hour > 12))) return null;
    let end = i;
    const dp = text.slice(end).match(DAYPART);
    const daypart = dp ? (dp[1] === 'dini hari' ? 'subuh' : dp[1]) as TimeExpr['daypart'] : undefined;
    if (dp) end += dp[0].length;
    return { start: markerStart, end, raw: text.slice(markerStart, end), hour, minute, is24, daypart, kind, marker };
  };
  // Half hours: "set 3", "setengah tiga" → base (3 − 1):30.
  const half = text.slice(i).match(HALF);
  if (half) {
    i += half[0].length;
    const n = readNumberWords(text.slice(i)); if (!n) return null;
    i += n.length;
    if (n.value < 1 || n.value > 12) return null;
    return make(n.value === 1 ? 12 : n.value - 1, 30, 'half', false);
  }
  // Compact "1200" / "0730" (marker required: it was found after one).
  const compact = text.slice(i).match(/^(\d{2})(\d{2})(?!\d)/);
  if (compact) {
    const h = Number(compact[1]), m = Number(compact[2]);
    if (!valid(h, m)) return null;
    i += 4;
    return make(h, m, 'compact', h === 0 || h > 12 || compact[1].startsWith('0'));
  }
  // Colon / dot.
  const sep = text.slice(i).match(/^(\d{1,2})([:.])(\d{2})(?!\d)/);
  if (sep) {
    const h = Number(sep[1]), m = Number(sep[3]);
    if (!valid(h, m)) return null;
    i += sep[0].length;
    return make(h, m, sep[2] === ':' ? 'colon' : 'dot', h === 0 || h > 12 || sep[1].length === 2 && sep[1].startsWith('0'));
  }
  // Hour (digits or words), then "lewat 10" / "kurang 15" / " 10" / nothing.
  const hourWord = readNumberWords(text.slice(i)); if (!hourWord) return null;
  if (MONEY_AFTER.test(text.slice(i + hourWord.length))) return null;
  const hour = hourWord.value; i += hourWord.length;
  if (hour > 23) return null;
  const is24 = hour === 0 || hour > 12 || /^0\d/.test(text.slice(i - hourWord.length, i));
  const after = text.slice(i);
  const rel = after.match(/^\s+(lewat|lwt|lebih|lbh|kurang|krg)\s+/);
  if (rel) {
    const mins = /^setengah/.test(after.slice(rel[0].length)) ? { value: 30, length: 8 } : readNumberWords(after.slice(rel[0].length));
    if (mins && mins.value > 0 && mins.value < 60 && !MONEY_AFTER.test(after.slice(rel[0].length + mins.length))) {
      i += rel[0].length + mins.length;
      if (/^(kurang|krg)/.test(rel[1])) { const h = hour === 0 ? 23 : hour === 1 && !is24 ? 12 : hour - 1; return make(h, 60 - mins.value, 'kurang', is24); }
      return make(hour, mins.value, 'lewat', is24);
    }
  }
  const space = after.match(/^ (\d{2})(?![\d.,:])/);
  if (space && Number(space[1]) <= 59 && !MONEY_AFTER.test(after.slice(space[0].length))) {
    i += space[0].length;
    return make(hour, Number(space[1]), 'space', is24);
  }
  return make(hour, 0, 'plain', is24);
}

/** Every time expression in a (lower-case) clause, left to right, without overlaps. */
export function findTimes(text: string): TimeExpr[] {
  const out: TimeExpr[] = [];
  for (const m of text.matchAll(MARKER)) {
    const markerStart = (m.index ?? 0) + m[0].length - m[1].length;
    const e = clockAt(text, markerStart + m[1].length, m[1], markerStart);
    if (e && !out.some(o => o.start < e.end && e.start < o.end)) out.push(e);
  }
  // A colon clock without a marker ("kopi 12:10"), and a half hour with a daypart ("set 3 sore").
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}.,])(\d{1,2}):(\d{2})(?![\d:])/gu)) {
    const start = (m.index ?? 0) + m[0].length - m[1].length - m[2].length - 1, h = Number(m[1]), min = Number(m[2]);
    if (!valid(h, min) || out.some(o => o.start < start + 5 && start < o.end)) continue;
    const e = clockAt(text, start, ':', start);
    if (e) out.push(e);
  }
  for (const m of text.matchAll(/(?:^|[^\p{L}])((?:setengah|setngah|setngh|stengah)\s*\S+|set\s+\S+\s+(?=pagi|siang|sore|malam))/gu)) {
    const start = (m.index ?? 0) + m[0].length - m[1].length;
    if (out.some(o => o.start <= start && start < o.end)) continue;
    const e = clockAt(text, start, 'setengah', start);
    if (e && (e.daypart || /^setengah|^setngah|^setngh|^stengah/.test(m[1]))) out.push(e);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The spans owned by time expressions (for the amount reader and the description builder). */
export const timeSpans = (text: string) => findTimes(text).map(t => ({ start: t.start, end: t.end }));

/* ---------------------------------------------------------------- daypart and smart inference */

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function addDays(date: string, n: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dayDiff(a: string, b: string) { return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000); }

/** A daypart fixes the 12-hour clock: "3 sore" 15:00, "1 siang" 13:00, "7 malam" 19:00, "2 malam" 02:00, "12 malam" 00:00. */
export function applyDaypart(hour: number, daypart: NonNullable<TimeExpr['daypart']>): number {
  const h = hour % 12; // 12 → 0
  switch (daypart) {
    case 'subuh': case 'pagi': return h;
    case 'siang': return hour === 12 ? 12 : h >= 10 ? h : h + 12;
    case 'sore': return h + 12;
    case 'malam': return h >= 5 ? h + 12 : h; // "jam 2 malam" is 02:00; "jam 12 malam" 00:00
  }
}

export type ResolveContext = {
  today: string;
  /** Local time the sentence is written (the reference clock), "HH:MM". */
  now: string;
  /** The transaction date already read from the text, and whether the text named it (locks it). */
  date: string; dateLocked: boolean;
  /** "nanti", "besok", a plan or a reminder: the event is still to come. */
  future: boolean;
  /** "tadi", "barusan", "semalam": the event just happened (allows the previous evening without asking). */
  pastCue?: boolean;
};

/** Nearest plausible timestamp for a clock expression (spec §19–34, §41–44). */
export function resolveTime(e: TimeExpr, c: ResolveContext): TemporalResolution {
  const trace: string[] = [`frasa “${e.raw}” → ${e.is24 ? 'jam 24' : 'jam 12'} ${pad(e.hour)}:${pad(e.minute)}${e.daypart ? ` + ${e.daypart}` : ''}`];
  // Clocks the words allow.
  const clocks = e.daypart ? [applyDaypart(e.hour, e.daypart) * 60 + e.minute] : e.is24 ? [e.hour * 60 + e.minute] : [(e.hour % 12) * 60 + e.minute, (e.hour % 12 + 12) * 60 + e.minute];
  const fixed = clocks.length === 1;
  // Dates it may fall on: the named date only; otherwise today, or the day before / after for a clock across midnight.
  const dates = c.dateLocked ? [c.date] : c.future ? [c.today, addDays(c.today, 1)] : [c.today, addDays(c.today, -1)];
  const ref = toMin(c.now), TOL = 30;
  // The reference clock only means something for today (and the night across midnight when the date was not named);
  // for a named other day ("kemarin jam 8", "tgl 2 jam 7") only the hours people usually spend count.
  const anchored = !c.dateLocked || c.date === c.today;
  type Cand = { date: string; clock: number; score: number; note: string };
  const cands: Cand[] = [];
  for (const date of dates) for (const clock of clocks) {
    const t = dayDiff(date, c.today) * 1440 + clock, delta = t - ref;
    let score: number, note: string;
    if (c.dateLocked && date !== c.today && Math.abs(dayDiff(date, c.today)) > 1 || !anchored) {
      // A named date far from today: no reference clock to lean on, only when people usually spend.
      score = clock < 5 * 60 ? 600 : Math.abs(clock - 13 * 60) / 4; note = 'tanggal jauh dari hari ini: pilih jam yang umum';
    } else if (c.future) {
      score = delta < -TOL ? 100_000 + -delta : delta; note = delta < -TOL ? 'sudah lewat (padahal masih akan terjadi)' : `${Math.round(delta / 60)} jam lagi`;
    } else {
      score = delta > TOL ? 100_000 + delta : -delta; note = delta > TOL ? 'belum terjadi (padahal sudah dicatat)' : `${Math.round(-delta / 60)} jam lalu`;
      if (clock < 5 * 60 && delta < -3 * 60) score += 360; // a small-hours purchase hours ago is less likely than one yesterday afternoon
      if (date !== c.today) score += 120; // the previous day only when it clearly fits better
    }
    cands.push({ date, clock, score, note });
  }
  cands.sort((a, b) => a.score - b.score);
  for (const k of cands) trace.push(`kandidat ${k.date} ${hhmm(k.clock)}: ${k.note}`);
  const best = cands[0], second = cands.find(k => k.clock !== best.clock || k.date !== best.date);
  const alternatives = cands.filter(k => k !== best && k.score < 100_000).slice(0, 2).map(k => ({ date: k.date, time: hhmm(k.clock) }));
  const time = hhmm(best.clock);
  if (fixed && (best.date === c.date || !anchored || c.dateLocked)) {
    const why = e.daypart ? `${time} dibaca dari “${e.raw}”.` : `${time} dibaca dari “${e.raw}”${e.kind === 'compact' ? ' karena muncul setelah kata “' + e.marker + '”' : ''}.`;
    return { time, date: best.date, status: best.score >= 100_000 ? 'check' : 'verified', inferred: false, alternatives: [], reason: why, trace };
  }
  const margin = second ? second.score - best.score : Infinity;
  const smallHours = best.clock < 5 * 60 && Math.abs(dayDiff(best.date, c.today) * 1440 + best.clock - ref) > 120;
  const crossed = !c.dateLocked && best.date !== c.today && !c.pastCue;
  const status: TemporalResolution['status'] = best.score >= 100_000 || margin < 240 || smallHours || crossed ? 'check' : 'likely';
  const base = `${pad(e.hour)}:${pad(e.minute)}`;
  const reason = !anchored || c.dateLocked && best.date !== c.today
    ? `${time} dipilih dari “${e.raw}” sebagai jam yang paling umum${status === 'check' ? '; cek kalau maksudnya ' + alternatives.map(a => a.time).join(' / ') : ''}.`
    : c.future
      ? `${time} dipilih dari “${e.raw}” karena ini akan terjadi, dan ${time} adalah waktu berikutnya yang paling dekat.`
      : `${time} dipilih dari “${e.raw}”${e.kind === 'half' ? ` (setengah = ${base})` : ''} karena transaksi dicatat sekitar jam ${c.now} dan ${time} adalah waktu sebelumnya yang paling masuk akal${best.date !== c.today ? ' (kemarin)' : ''}.`;
  trace.push(`dipilih ${best.date} ${time} (${status})`);
  return { time, date: best.date, status, inferred: true, alternatives, reason, trace };
}
