/**
 * 8.1 — questions about one's own habits that Catat otomatis did not answer (or answered as something else):
 *   "berapa hari aku nggak jajan"      days of this cycle without spending, and the longest run
 *   "hari apa aku paling boros"        spending by day of the week (the last 8 weeks)
 *   "paling sering belanja di mana"    the shop named most often (and "toko langganan aku")
 *   "udah nyatet berapa transaksi"     records this cycle, and the days in a row with a record
 *   "transaksi terbesar bulan ini"     asked to Catat otomatis as "pengeluaran terbesar bulan ini"
 */
import { transactionExpense } from '../accounting.ts';
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

export function readStats(t: string, txs: LedgerTx[], cycle: { start: string; end: string }, today: string, v: Voice): StatsAnswer | null {
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
