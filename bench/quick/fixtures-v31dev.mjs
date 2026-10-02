/**
 * Catat otomatis V3.1 — temporal development set (v31-dev).
 *
 * Built from the spec examples and the real failure "beli ayam dbesto 12k jam 1" (time leaking into the description).
 * Development data: V3.1 was tuned on it. Same entities as fixtures-v30dev.mjs; today is Thursday 15 October 2026 and
 * the sentence is written at 15:00 unless a case sets another `now` (the reference clock).
 *
 * Truth fields as in run-v30.mjs plus `time` ("HH:MM", null = must stay unset). `review: ['time']` = the time must be
 * marked to check (two readings stay plausible).
 */
import { ctx as base } from './fixtures-v30dev.mjs';
export const today = '2026-10-15';
export const ctx = { ...base, today, now: '15:00' };

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, Y = '2026-10-14', TM = '2026-10-16';
const at = now => ({ now });

/** [id, tags, text, actions, ctx override] */
const raw = [
  // Real failure (permanent).
  ['real-dbesto', ['real', 'boundary', 'time'], 'beli ayam dbesto 12k jam 1', [a('expense', 12000, { description: 'Ayam', merchant: "D'Besto", time: '13:00', date: T })]],
  ['core-cotti', ['boundary', 'half', 'time'], 'beli kopi di cotti coffee 19k jam set 12', [a('expense', 19000, { description: 'Kopi', merchant: 'Cotti Coffee', time: '11:30' })]],
  // §80 reference 15:00.
  ['r15-1', ['ampm'], 'kopi 20k jam 1', [a('expense', 20000, { time: '13:00' })]],
  ['r15-2', ['ampm'], 'kopi 20k jam 2', [a('expense', 20000, { time: '14:00' })]],
  ['r15-3', ['ampm'], 'kopi 20k jam 3', [a('expense', 20000, { time: '15:00' })]],
  ['r15-10', ['ampm'], 'kopi 20k jam 10', [a('expense', 20000, { time: '10:00' })]],
  ['r15-7', ['ampm'], 'kopi 20k jam 7', [a('expense', 20000, { time: '07:00' })]],
  ['r15-set2', ['half', 'ampm'], 'kopi 20k jam set 2', [a('expense', 20000, { time: '13:30' })]],
  ['r15-set3', ['half', 'ampm'], 'kopi 20k jam set 3', [a('expense', 20000, { time: '14:30' })]],
  ['r15-stg3', ['half', 'ampm'], 'kopi 20k jam setengah 3', [a('expense', 20000, { time: '14:30' })]],
  ['r15-lewat', ['lewat', 'ampm'], 'kopi 20k jam 3 lewat 10', [a('expense', 20000, { time: '15:10' })]],
  // §81 reference 08:00.
  ['r08-7', ['ampm'], 'kopi 20k jam 7', [a('expense', 20000, { time: '07:00' })], at('08:00')],
  ['r08-6', ['ampm'], 'kopi 20k jam 6', [a('expense', 20000, { time: '06:00' })], at('08:00')],
  ['r08-set8', ['half', 'ampm'], 'kopi 20k jam set 8', [a('expense', 20000, { time: '07:30' })], at('08:00')],
  ['r08-lewat', ['lewat', 'ampm'], 'kopi 20k jam 6 lewat 10', [a('expense', 20000, { time: '06:10' })], at('08:00')],
  // §82 reference 20:00.
  ['r20-7', ['ampm'], 'makan 30k jam 7', [a('expense', 30000, { time: '19:00' })], at('20:00')],
  ['r20-6', ['ampm'], 'makan 30k jam 6', [a('expense', 30000, { time: '18:00' })], at('20:00')],
  ['r20-set8', ['half', 'ampm'], 'makan 30k jam set 8', [a('expense', 30000, { time: '19:30' })], at('20:00')],
  ['r20-lewat', ['lewat', 'ampm'], 'makan 30k jam 7 lewat 10', [a('expense', 30000, { time: '19:10' })], at('20:00')],
  // §83 explicit daypart.
  ['dp-1pagi', ['daypart'], 'kopi 20k jam 1 pagi', [a('expense', 20000, { time: '01:00' })]],
  ['dp-1siang', ['daypart'], 'kopi 20k jam 1 siang', [a('expense', 20000, { time: '13:00' })]],
  ['dp-3sore', ['daypart'], 'kopi 20k jam 3 sore', [a('expense', 20000, { time: '15:00' })]],
  ['dp-7malam', ['daypart'], 'makan 30k jam 7 malam', [a('expense', 30000, { time: '19:00' })], at('21:00')],
  ['dp-set3sore', ['daypart', 'half'], 'kopi 20k jam set 3 sore', [a('expense', 20000, { time: '14:30' })]],
  ['dp-tiga-sore', ['daypart', 'words'], 'kopi 20k jam tiga sore', [a('expense', 20000, { time: '15:00' })]],
  // §84 formats.
  ['f-12', ['format'], 'kopi 20k jam 12', [a('expense', 20000, { time: '12:00' })]],
  ['f-colon', ['format'], 'kopi 20k jam 12:10', [a('expense', 20000, { time: '12:10' })]],
  ['f-dot', ['format'], 'kopi 20k jam 12.10', [a('expense', 20000, { time: '12:10' })]],
  ['f-space', ['format'], 'kopi 20k jam 12 10', [a('expense', 20000, { time: '12:10' })]],
  ['f-compact', ['format', 'money'], 'kopi 19k jam 1200', [a('expense', 19000, { time: '12:00' })]],
  ['f-lewat', ['format', 'lewat'], 'kopi 20k jam 12 lewat 10', [a('expense', 20000, { time: '12:10' })]],
  ['f-lwt', ['format', 'lewat'], 'kopi 20k jam 12 lwt 10', [a('expense', 20000, { time: '12:10' })]],
  ['f-jm', ['format'], 'makan 30k jm 2', [a('expense', 30000, { time: '14:00' })]],
  ['f-glued', ['format'], 'makan 30k jam2', [a('expense', 30000, { time: '14:00' })]],
  ['f-pukul', ['format'], 'makan 30k pukul 1945', [a('expense', 30000, { time: '19:45' })], at('21:00')],
  ['f-24h', ['format'], 'bensin 80k jam 13:30', [a('expense', 80000, { time: '13:30' })]],
  ['f-words-lewat', ['words', 'lewat'], 'kopi 20k jam dua belas lewat sepuluh', [a('expense', 20000, { time: '12:10' })]],
  ['f-kurang', ['words'], 'kopi 20k jam 3 kurang seperempat', [a('expense', 20000, { time: '14:45' })]],
  // §85 half hours.
  ['h-set1', ['half'], 'kopi 20k jam set 1', [a('expense', 20000, { time: '12:30' })]],
  ['h-setsatu', ['half', 'words'], 'kopi 20k jam set satu', [a('expense', 20000, { time: '12:30' })]],
  ['h-stg1', ['half'], 'kopi 20k jam setengah 1', [a('expense', 20000, { time: '12:30' })]],
  ['h-setngh1', ['half', 'typo'], 'kopi 20k jam setngh 1', [a('expense', 20000, { time: '12:30' })]],
  ['h-set12', ['half'], 'kopi 20k jam set 12', [a('expense', 20000, { time: '11:30' })]],
  ['h-stg-dua', ['half', 'words'], 'kopi 20k jam setengah dua', [a('expense', 20000, { time: '13:30' })]],
  // §86 dates.
  ['d-kemarin', ['date'], 'kemarin kopi 20k', [a('expense', 20000, { date: Y, time: null })]],
  ['d-kemaren', ['date', 'typo'], 'kemaren kopi 20k', [a('expense', 20000, { date: Y })]],
  ['d-kmrn', ['date', 'typo'], 'kmrn kopi 20k', [a('expense', 20000, { date: Y })]],
  ['d-kmrin', ['date', 'typo', 'boundary'], 'kmrin beli susu 7k', [a('expense', 7000, { date: Y, description: 'Susu' })]],
  ['d-tgl2', ['date', 'absolute'], 'tgl 2 makan 20k', [a('expense', 20000, { date: '2026-10-02', time: null })]],
  ['d-tgl2-glued', ['date', 'absolute'], 'tgl2 makan 20k', [a('expense', 20000, { date: '2026-10-02' })]],
  ['d-tanggal2', ['date', 'absolute'], 'tanggal 2 makan 20k', [a('expense', 20000, { date: '2026-10-02' })]],
  ['d-tnggl2', ['date', 'absolute', 'typo'], 'tnggl 2 makan 20k', [a('expense', 20000, { date: '2026-10-02' })]],
  ['d-slash', ['date', 'absolute'], 'kopi 20k 2/10', [a('expense', 20000, { date: '2026-10-02' })]],
  ['d-okt', ['date', 'absolute'], 'kopi 20k 2 okt', [a('expense', 20000, { date: '2026-10-02' })]],
  // §87 combined.
  ['c-kmrin-set3', ['date', 'half', 'daypart'], 'kmrin jam set 3 sore beli kopi 19k', [a('expense', 19000, { date: Y, time: '14:30' })]],
  ['c-tgl2-dot', ['date', 'format'], 'tgl 2 jam 12.10 makan 20k', [a('expense', 20000, { date: '2026-10-02', time: '12:10' })]],
  ['c-tgl2-setsatu', ['date', 'half'], 'tanggal 2 jam set satu kopi 20k', [a('expense', 20000, { date: '2026-10-02', time: '12:30' })]],
  ['c-kemaren-lewat', ['date', 'lewat', 'daypart'], 'kemaren jam tiga lewat 5 sore kopi 20k', [a('expense', 20000, { date: Y, time: '15:05' })]],
  ['c-tnggl-lwt', ['date', 'lewat', 'typo'], 'tnggl 2 makan 25k jam 7 lwt 5', [a('expense', 25000, { date: '2026-10-02', review: ['time'] })]],
  ['c-kemarin-1', ['date', 'ampm'], 'kemarin beli kopi 20k jam 1', [a('expense', 20000, { date: Y, time: '13:00' })]],
  // §88 time vs money.
  ['m-12000', ['money'], 'kopi 12000 jago', [a('expense', 12000, { wallet: 'jago', time: null })]],
  ['m-7,7k', ['money'], 'susu 7,7k jam 1', [a('expense', 7700, { time: '13:00' })]],
  ['m-qty', ['money', 'quantity'], 'beli 2 kopi 20k jam 7', [a('expense', 20000, { time: '07:00' })]],
  ['m-1200-plain', ['money'], 'beli air 1200', [a('expense', 1200, { time: null })]],
  ['m-tgl-money', ['money', 'date'], 'tgl 2 beli susu 7k', [a('expense', 7000, { date: '2026-10-02' })]],
  ['m-watch', ['money'], 'beli jam tangan 200rb', [a('expense', 200000, { time: null })]],
  // §89 future.
  ['fu-nanti', ['future'], 'nanti bayar 20k jam 7', [a('expense', 20000, { time: '19:00' })]],
  ['fu-besok', ['future', 'date'], 'besok bayar makan 30k jam 8', [a('plan_new', 30000, { date: TM, review: ['time'] })]],
  // §90 corrections, §58 negations.
  ['k-jam', ['correction'], 'kopi 20k jam 1 eh jam 2', [a('expense', 20000, { time: '14:00' })]],
  ['k-set3sore', ['correction', 'half'], 'kopi jam 3 sore eh jam set 3 sore 20k', [a('expense', 20000, { time: '14:30' })]],
  ['k-date', ['correction', 'date'], 'kemarin makan 20k eh hari ini', [a('expense', 20000, { date: T })]],
  ['k-tgl', ['correction', 'date'], 'tgl 2, eh tgl 3 kopi 20k', [a('expense', 20000, { date: '2026-10-03' })]],
  ['n-jam', ['negation'], 'kopi 20k bukan jam 1, jam 2', [a('expense', 20000, { time: '14:00' })]],
  ['n-date', ['negation', 'date'], 'bukan kemarin, hari ini kopi 20k', [a('expense', 20000, { date: T })]],
  ['n-tgl', ['negation', 'date'], 'bukan tgl 2, tgl 3 kopi 20k', [a('expense', 20000, { date: '2026-10-03' })]],
  ['k-dbesto', ['correction', 'boundary'], 'ayam dbesto 12k jam 1 eh jam 2', [a('expense', 12000, { description: 'Ayam', merchant: "D'Besto", time: '14:00' })]],
  // §59–61 multi action.
  ['ma-isolation', ['segmentation', 'context'], 'kopi 20k jam 10 terus makan 30k jam 1', [a('expense', 20000, { time: '10:00' }), a('expense', 30000, { time: '13:00' })]],
  ['ma-shared-date', ['segmentation', 'context', 'date'], 'kemarin kopi 20k jam 8 terus makan 30k jam 12', [a('expense', 20000, { date: Y, review: ['time'] }), a('expense', 30000, { date: Y, time: '12:00' })]],
  ['ma-shared-time', ['segmentation', 'context'], 'jam 8 beli kopi 20k sama roti 10k', [a('expense', 20000, { time: '08:00' }), a('expense', 10000, { time: '08:00' })]],
  ['ma-no-leak', ['segmentation', 'context'], 'kopi 20k jam 8 terus makan 30k', [a('expense', 20000, { time: '08:00' }), a('expense', 30000, { time: null })]],
  ['ma-dbesto-fore', ['segmentation', 'boundary'], 'ayam dbesto 12k jam 1 terus kopi fore 20k jam 2', [a('expense', 12000, { description: 'Ayam', merchant: "D'Besto", time: '13:00' }), a('expense', 20000, { description: 'Kopi', merchant: 'Fore', time: '14:00' })]],
  // Boundaries (§51–53).
  ['b-cotti-jam', ['boundary'], 'kopi di cotti coffee 19k jam 12', [a('expense', 19000, { description: 'Kopi', merchant: 'Cotti Coffee', time: '12:00' })]],
  ['b-jam-before-amount', ['boundary'], 'beli kopi di cotti coffee jam 1 19k', [a('expense', 19000, { description: 'Kopi', merchant: 'Cotti Coffee', time: '13:00' })]],
  ['b-cotti-set3', ['boundary', 'half', 'daypart'], 'kopi cotti 19k jam set 3 sore', [a('expense', 19000, { description: 'Kopi', merchant: 'Cotti Coffee', time: '14:30' })]],
  ['b-kemarin-ayam', ['boundary', 'date'], 'kemarin makan ayam 20k jam 7', [a('expense', 20000, { date: Y, description: 'Makan Ayam', review: ['time'] })]],
  ['b-kemarin-dbesto', ['boundary', 'date'], 'kemarin beli ayam dbesto 12k', [a('expense', 12000, { date: Y, description: 'Ayam', merchant: "D'Besto" })]],
  ['b-receivable', ['boundary', 'person'], 'talangin aldi makan 45k jam 1', [a('receivable_new', 45000, { person: 'Aldi', time: '13:00' })]],
  // Cross-midnight (§43–44).
  ['mn-tadi-11', ['midnight', 'context'], 'tadi makan 30k jam 11', [a('expense', 30000, { date: Y, time: '23:00' })], at('00:30')],
  ['mn-tadi-12', ['midnight'], 'tadi makan 30k jam 12', [a('expense', 30000, { date: T, time: '00:00' })], at('00:30')],
  ['mn-hari-ini', ['midnight', 'date'], 'hari ini makan 30k jam 11', [a('expense', 30000, { date: T, review: ['time'] })], at('00:30')],
  ['mn-setengah-satu', ['midnight', 'half'], 'tadi kopi 20k jam setengah satu', [a('expense', 20000, { date: T, time: '00:30' })], at('01:00')],
  // No time: unchanged behaviour.
  ['nt-plain', ['notime'], 'beli kopi 19k', [a('expense', 19000, { date: T, time: null })]],
];

export const cases = raw.map(([id, tags, text, actions, extra]) => ({ id, tags, text, actions, ...(extra ? { ctx: extra } : {}), set: 'dev' }));
