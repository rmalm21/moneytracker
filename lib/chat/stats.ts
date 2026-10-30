/**
 * 8.1 — questions about one's own habits that Catat otomatis did not answer (or answered as something else):
 *   "berapa hari aku nggak jajan"      days of this cycle without spending, and the longest run
 *   "hari apa aku paling boros"        spending by day of the week (the last 8 weeks)
 *   "paling sering belanja di mana"    the shop named most often (and "toko langganan aku")
 *   "udah nyatet berapa transaksi"     records this cycle, and the days in a row with a record
 *   "transaksi terbesar bulan ini"     asked to Catat otomatis as "pengeluaran terbesar bulan ini"
 * 8.2:
 *   "terakhir makan apa", "terakhir beli apa", "transaksi terakhir apa", "terakhir ngopi di mana": the latest record
 *   of that kind, with what it was, where, how much and when ("kapan terakhir …" stays with Catat otomatis).
 */
import { transactionExpense } from '../accounting.ts';
import { readPeriod } from '../catat/ask.ts';
import type { LedgerTx } from '../types';
import type { Voice } from './voice.ts';
import { vo } from './fun.ts';

export type StatsAnswer = { title: string; text: string; lines?: { label: string; value: string }[]; plan?: string };
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ME = String.raw`(?:aku|gue|gw|saya|ku)?`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

const NO_SPEND = /\b(?:berapa\s+hari|hari\s+apa\s+(?:aja|saja))\b.*\b(?:nggak|ga|gak|tidak|tanpa|ngga|enggak|gk)\s+(?:jajan|belanja|keluar(?:in)?\s+(?:uang|duit)|ngeluarin|beli|pengeluaran)\b|\bhari\s+tanpa\s+(?:jajan|belanja|pengeluaran)\b|\bno\s*spend\b/;
const WEEKDAY = /\bhari\s+apa\b.*\b(?:paling\s+)?(?:boros|banyak\s+(?:belanja|jajan|keluar|pengeluaran)|sering\s+(?:belanja|jajan)|gede\s+pengeluaran)\b|\b(?:paling\s+boros|pengeluaran\s+(?:paling\s+)?(?:gede|besar))\s+(?:di\s+)?hari\s+apa\b/;
const SHOP = /\b(?:paling\s+sering|sering\s+banget|sering)\s+(?:belanja|beli|jajan|makan|ngopi|nongkrong)\s+(?:di\s+)?(?:mana|dimana)\b|\b(?:toko|tempat|warung|merchant)\s+(?:langganan|favorit|paling\s+sering)\b|\blangganan\s+(?:belanja|jajan)\s+(?:aku|gue|di\s+mana)\b/;
const COUNT = new RegExp(String.raw`\b(?:udah|sudah|dah)\s+(?:nyatet|mencatat|catat|nyatat)\s+berapa\b|\bberapa\s+(?:transaksi|catatan)\s+(?:yang\s+)?(?:${ME}\s*)?(?:udah|sudah|aku|gue|saya|bulan\s+ini|siklus|minggu|catat|dicatat)\b|\bjumlah\s+(?:transaksi|catatan)\b|\b(?:streak|beruntun)\s+(?:nyatet|catat|mencatat)\b`);
const BIGGEST = /\b(?:transaksi|belanjaan|pembelian|jajan(?:an)?)\s+(?:paling\s+)?(?:terbesar|termahal|paling\s+(?:besar|mahal|gede))\b/;

/** "terakhir makan apa", "makan terakhir apa", "transaksi terakhir", "terakhir nyatet apa", "terakhir ngopi di mana". */
const LAST = /\bterakhir(?:nya)?\b/;
const LAST_ASK = /\b(?:apa|apaan|di\s*mana|dimana|mana|berapa|brp|siapa)\b|\?$|^(?:transaksi|catatan|pengeluaran|pemasukan|belanja(?:an)?)\s+terakhir/;
/** What the word asks about: a category name to look for, or every record. */
const KINDS: [RegExp, RegExp | 'expense' | 'income' | 'any'][] = [
  [/\b(?:transaksi|catatan|nyatet|mencatat|catat|dicatat)\b/, 'any'],
  [/\b(?:pemasukan|gajian|gaji|dapet\s+(?:uang|duit)|dapat\s+(?:uang|duit)|uang\s+masuk)\b/, 'income'],
  [/\b(?:makan|sarapan|makan\s+siang|makan\s+malam|kuliner)\b/, /\bmakan(?!an)|sarapan|kuliner|food|restoran|warteg|warung\s+makan/i],
  [/\b(?:ngopi|kopi|minum|boba|jajan\s+minum)\b/, /kopi|minum|coffee/i],
  [/\b(?:jajan|ngemil|camilan|snack)\b/, /jajan|camilan|snack/i],
  [/\b(?:isi\s+bensin|bensin|bbm|ngisi\s+bensin)\b/, /bensin|bahan\s+bakar|bbm/i],
  [/\b(?:parkir)\b/, /parkir/i],
  [/\b(?:ojol|ojek|grab|gojek|taksi|transport)\b/, /transport|ojek|ojol|taksi/i],
  [/\b(?:belanja\s+bulanan|belanja\s+dapur|bahan\s+makanan|sayur)\b/, /bahan\s+makanan|dapur|sembako|groceries/i],
  [/\b(?:pulsa|kuota|paket\s+data)\b/, /pulsa|kuota|data|internet/i],
  [/\b(?:listrik|token|pln)\b/, /listrik/i],
  [/\b(?:beli|belanja|bayar|keluar(?:in)?\s+(?:uang|duit)|pengeluaran|jajan)\b/, 'expense'],
];
const ago = (date: string, today: string) => { const n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 864e5); return n <= 0 ? 'hari ini' : n === 1 ? 'kemarin' : `${n} hari lalu`; };
const dayMonth = (date: string) => { const [, m, d] = date.split('-').map(Number); return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][m - 1]}`; };

/** "transaksi kemarin apa aja", "catatan hari ini", "transaksi minggu ini apa saja": the records of a period, listed. */
const LIST = /^(?:semua\s+|daftar\s+|list\s+)?(?:transaksi|catatan|mutasi)\s*(?:aku|gue|gw|saya|ku)?\s+(?:di\s+|pada\s+|tanggal\s+)?(?:hari\s+ini|kemarin|kemaren|minggu\s+(?:ini|lalu)|bulan\s+(?:ini|lalu)|siklus\s+(?:ini|lalu)|(?:\d+\s+)?hari\s+lalu|tgl\s+\d{1,2}|tanggal\s+\d{1,2}|(?:hari\s+)?(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu)(?:\s+(?:kemarin|lalu))?)\b(?:.*\b(?:apa\s+(?:aja|saja)|apa|ada\s+apa|mana\s+aja))?\s*$/;
export function readStats(t: string, txs: LedgerTx[], cycle: { start: string; end: string }, today: string, v: Voice, categories: { id: string; name: string; parentId: string | null }[] = [], salaryDay = 24): StatsAnswer | null {
  if (LIST.test(t)) {
    const period = readPeriod(t, today, salaryDay);
    if (period) {
      const nameOf = (id: string | null | undefined) => (id && categories.find(c => c.id === id)?.name) || '';
      const list = txs.filter(x => x.date >= period.start && x.date < period.end && x.date <= today).sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')));
      const out = list.reduce((n, x) => n + transactionExpense(x), 0), income = list.filter(x => x.type === 'income').reduce((n, x) => n + x.amount, 0);
      const label = period.said.trim() || period.label;
      if (!list.length) return { title: 'Transaksi', text: vo(v, { santai: `Belum ada transaksi ${label}.`, sopan: `Belum ada transaksi ${label}.`, gaul: `Belum ada transaksi ${label}, bro.`, singkat: 'Belum ada.' }) };
      return { title: 'Transaksi', text: vo(v, {
        santai: `${label.charAt(0).toUpperCase() + label.slice(1)} ada ${list.length} transaksi: keluar ${rp(out)}${income ? `, masuk ${rp(income)}` : ''}.`,
        sopan: `Terdapat ${list.length} transaksi ${label}: pengeluaran ${rp(out)}${income ? `, pemasukan ${rp(income)}` : ''}.`,
        gaul: `${label.charAt(0).toUpperCase() + label.slice(1)} ${list.length} transaksi, keluar ${rp(out)}${income ? `, masuk ${rp(income)}` : ''}.`,
        singkat: `${list.length} transaksi, keluar ${rp(out)}.`,
      }), lines: list.slice(0, 8).map(x => ({ label: `${x.description?.trim() || nameOf(x.subcategoryId) || nameOf(x.categoryId) || x.type}${x.merchant ? ` · ${x.merchant}` : ''}`.slice(0, 40), value: `${x.type === 'income' ? '+' : ''}${rp(x.type === 'expense' ? transactionExpense(x) || x.amount : x.amount)}${period.end > addDays(period.start, 1) ? ` · ${dayMonth(x.date)}` : ''}` })) };
    }
  }
  // Not "7 hari terakhir", "sebulan terakhir": the last days are a period (Catat otomatis answers those).
  if (LAST.test(t) && LAST_ASK.test(t) && !/\bkapan\b/.test(t) && !/\b(?:\d+|beberapa|dua|tiga|seminggu|sebulan|setahun)\s*(?:hari|minggu|pekan|bulan|tahun)?\s+terakhir\b|\b(?:minggu|pekan|bulan|tahun)\s+terakhir\b/.test(t)) {
    const kind = KINDS.find(([re]) => re.test(t))?.[1] || 'any';
    const nameOf = (id: string | null | undefined) => (id && categories.find(c => c.id === id)?.name) || '';
    const fits = (x: LedgerTx) => {
      if (x.date > today) return false;
      if (kind === 'any') return true;
      if (kind === 'income') return x.type === 'income';
      if (kind === 'expense') return transactionExpense(x) > 0;
      if (transactionExpense(x) <= 0) return false;
      // The most specific name only: "Kopi & Minuman" under "Makan & Minum" is not a meal.
      return kind.test(`${nameOf(x.subcategoryId) || nameOf(x.categoryId)} ${x.description || ''} ${x.merchant || ''}`);
    };
    const last = txs.filter(fits).sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')))[0];
    if (!last) return { title: 'Terakhir', text: vo(v, { santai: 'Belum ada catatan seperti itu.', sopan: 'Belum ada catatan seperti itu.', gaul: 'Belum ada catetan kayak gitu, bro.', singkat: 'Belum ada.' }) };
    const what = last.description?.trim() || nameOf(last.subcategoryId) || nameOf(last.categoryId) || (last.type === 'income' ? 'pemasukan' : 'transaksi');
    const where = last.merchant?.trim() ? ` di ${last.merchant.trim()}` : '', when = `${ago(last.date, today)} (${dayMonth(last.date)})`;
    const amount = rp(last.type === 'expense' ? transactionExpense(last) || last.amount : last.amount);
    return { title: 'Terakhir', text: vo(v, {
      santai: `Terakhir: ${what}${where}, ${amount}, ${when}.`,
      sopan: `Catatan terakhir: ${what}${where}, ${amount}, ${when}.`,
      gaul: `Terakhir lo ${what}${where}, ${amount}, ${when}.`,
      singkat: `${what}${where}, ${amount}, ${when}.`,
      barbar: `Terakhir lo ${what}${where}, ${amount}, ${when}. Inget aja ga bisa, anjir WKWK.`,
    }) };
  }
  const spentOn = new Map<string, number>(), inCycle = (x: LedgerTx) => x.date >= cycle.start && x.date < cycle.end && x.date <= today;
  for (const x of txs) { const s = transactionExpense(x); if (s > 0) spentOn.set(x.date, (spentOn.get(x.date) || 0) + s); }
  if (BIGGEST.test(t)) {
    const period = t.match(/\b(?:bulan\s+(?:ini|lalu)|minggu\s+(?:ini|lalu)|hari\s+ini|kemarin|tahun\s+ini|siklus\s+ini)\b/)?.[0] || 'bulan ini';
    return { title: 'Terbesar', text: '', plan: `pengeluaran terbesar ${period}` };
  }
  if (NO_SPEND.test(t)) {
    const days: string[] = []; for (let d = cycle.start; d <= today && d < cycle.end; d = addDays(d, 1)) days.push(d);
    const free = days.filter(d => !spentOn.get(d));
    let best = 0, run = 0; for (const d of days) { run = spentOn.get(d) ? 0 : run + 1; best = Math.max(best, run); }
    const n = free.length, of = days.length;
    return { title: 'Hari tanpa belanja', text: vo(v, {
      santai: `Siklus ini ada ${n} hari tanpa pengeluaran dari ${of} hari. Paling lama ${best} hari berturut-turut. ${n >= of / 3 ? 'Keren, hemat banget! 👏' : 'Coba tambah satu hari tanpa jajan minggu ini, yuk.'}`,
      sopan: `Pada siklus ini terdapat ${n} hari tanpa pengeluaran dari ${of} hari, dengan rekor ${best} hari berturut-turut.`,
      gaul: `Siklus ini lo ${n} hari ga ngeluarin duit dari ${of} hari. Rekor ${best} hari beruntun. ${n >= of / 3 ? 'Mantul! 👏' : 'Tambahin dong hari tanpa jajannya WKWK.'}`,
      singkat: `${n} dari ${of} hari tanpa pengeluaran. Rekor ${best} hari.`,
      barbar: `Lo cuma ${n} hari ga jajan dari ${of} hari, anjir. Rekor ${best} hari doang. ${n >= of / 3 ? 'Lumayan, tumben.' : 'Boros lo kebangetan, bangsat WKWK.'}`,
    }) };
  }
  if (WEEKDAY.test(t)) {
    const since = addDays(today, -56), by = Array(7).fill(0), count = Array(7).fill(0);
    for (const [date, amount] of spentOn) if (date > since && date <= today) { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); by[d] += amount; count[d]++; }
    if (!by.some(Boolean)) return { title: 'Hari paling boros', text: vo(v, { santai: 'Belum ada pengeluaran 8 minggu terakhir untuk dibandingkan.', sopan: 'Belum ada pengeluaran dalam 8 minggu terakhir.', gaul: 'Belum ada pengeluaran 8 minggu ini, bro.', singkat: 'Belum ada data.' }) };
    const order = by.map((amount, d) => ({ d, amount })).sort((a, b) => b.amount - a.amount), top = order[0];
    return { title: 'Hari paling boros', text: vo(v, {
      santai: `Hari ${DAYS[top.d]} paling boros: ${rp(top.amount)} dalam 8 minggu terakhir. Hati-hati tiap ${DAYS[top.d]} ya wkwk.`,
      sopan: `Pengeluaran terbesar Anda jatuh pada hari ${DAYS[top.d]}: ${rp(top.amount)} dalam 8 minggu terakhir.`,
      gaul: `${DAYS[top.d]} hari paling boros lo: ${rp(top.amount)} dalam 8 minggu. Waspada tiap ${DAYS[top.d]} WKWK.`,
      singkat: `${DAYS[top.d]}: ${rp(top.amount)} (8 minggu).`,
      barbar: `${DAYS[top.d]} tuh hari lo kalap, anjir: ${rp(top.amount)} dalam 8 minggu. Tiap ${DAYS[top.d]} kunci dompet lo, goblok WKWK.`,
    }), lines: order.filter(x => x.amount > 0).slice(0, 4).map(x => ({ label: DAYS[x.d], value: rp(x.amount) })) };
  }
  if (SHOP.test(t)) {
    const by = new Map<string, { name: string; count: number; amount: number }>();
    for (const x of txs) { const s = transactionExpense(x), name = (x.merchant || '').trim(); if (s <= 0 || !name || x.date < addDays(today, -90)) continue; const key = name.toLowerCase(), b = by.get(key) || { name, count: 0, amount: 0 }; b.count++; b.amount += s; by.set(key, b); }
    const list = [...by.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
    if (!list.length) return { title: 'Tempat langganan', text: vo(v, { santai: 'Belum ada nama tempat di catatanmu 3 bulan terakhir. Tulis tempatnya waktu mencatat, misalnya “kopi 20rb di kopi kenangan”.', sopan: 'Belum ada nama tempat pada catatan 3 bulan terakhir.', gaul: 'Catetan lo belum ada nama tempatnya. Tulis aja, misal “kopi 20rb di kopi kenangan”.', singkat: 'Belum ada nama tempat.' }) };
    const top = list[0];
    return { title: 'Tempat langganan', text: vo(v, {
      santai: `Tempat langgananmu: ${top.name}, ${top.count} kali (${rp(top.amount)}) dalam 3 bulan terakhir.`,
      sopan: `Tempat yang paling sering Anda kunjungi: ${top.name}, ${top.count} kali (${rp(top.amount)}) dalam 3 bulan terakhir.`,
      gaul: `Markas lo: ${top.name}, ${top.count} kali (${rp(top.amount)}) 3 bulan ini. Udah kayak member VIP WKWK.`,
      singkat: `${top.name}: ${top.count}× (${rp(top.amount)}).`,
      barbar: `${top.name} ${top.count} kali (${rp(top.amount)}), anjir. Lo pemegang saham apa gimana WKWK.`,
    }), lines: list.slice(0, 5).map(x => ({ label: x.name, value: `${x.count}× · ${rp(x.amount)}` })) };
  }
  if (COUNT.test(t)) {
    const records = txs.filter(inCycle), days = new Set(records.map(x => x.date));
    let streak = 0; for (let d = today; days.has(d); d = addDays(d, -1)) streak++;
    return { title: 'Catatanmu', text: vo(v, {
      santai: `Siklus ini kamu sudah mencatat ${records.length} transaksi di ${days.size} hari berbeda. ${streak >= 2 ? `Lagi beruntun ${streak} hari, pertahankan! 🔥` : 'Yuk catat tiap hari biar makin rapi.'}`,
      sopan: `Pada siklus ini Anda telah mencatat ${records.length} transaksi pada ${days.size} hari berbeda.${streak >= 2 ? ` Anda mencatat ${streak} hari berturut-turut.` : ''}`,
      gaul: `Siklus ini lo udah nyatet ${records.length} transaksi di ${days.size} hari. ${streak >= 2 ? `Streak ${streak} hari, gas terus 🔥` : 'Rajinin dong WKWK.'}`,
      singkat: `${records.length} transaksi, ${days.size} hari.${streak >= 2 ? ` Beruntun ${streak} hari.` : ''}`,
      barbar: `Lo udah nyatet ${records.length} transaksi di ${days.size} hari, anjir. ${streak >= 2 ? `Streak ${streak} hari, tumben rajin 🔥` : 'Males lo, catet tiap hari, bangsat WKWK.'}`,
    }) };
  }
  return null;
}
