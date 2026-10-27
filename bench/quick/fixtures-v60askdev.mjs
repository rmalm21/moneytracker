/**
 * Catat otomatis 6.0 — Tanya, development set: questions about one's own money, answered from the ledger in
 * fixtures-v60askstate.mjs (Thu 15 Oct 2026, salary cycle 25 Sep – 24 Oct). Used while building lib/catat/ask.ts.
 * Plus controls: entries, a balance statement, the existing utang/piutang questions, small talk.
 */
import { CYCLE, OCT, SEP, WEEK, LAST_WEEK, DAY, spend, income, count, last, cat, sub, at, via, says, total, pick } from './fixtures-v60askstate.mjs';

const top = range => Math.max(...pick(range, t => t.type === 'expense').map(t => t.amount));
export const cases = [
  { id: 'a1', text: 'berapa pengeluaranku bulan ini', expect: { intent: 'spend', total: spend(OCT), start: OCT[0], end: OCT[1] } },
  { id: 'a2', text: 'pengeluaran hari ini berapa', expect: { intent: 'spend', total: spend(DAY('2026-10-15')) } },
  { id: 'a3', text: 'bensin bulan ini habis berapa', expect: { intent: 'spend', total: spend(OCT, sub('fuel')) } },
  { id: 'a4', text: 'saldo gopay berapa', expect: { intent: 'balance', total: 185_000 } },
  { id: 'a5', text: 'kapan terakhir bayar wifi', expect: { intent: 'last', date: last(says('wifi')) } },
  { id: 'a6', text: 'berapa kali parkir minggu ini', expect: { intent: 'count', count: count(WEEK, sub('park')) } },
  { id: 'a7', text: 'pengeluaran terbesar minggu lalu', expect: { intent: 'top', total: top(LAST_WEEK) } },
  { id: 'a8', text: 'sisa anggaran makan berapa', expect: { intent: 'budget', total: 1_500_000 - spend(CYCLE, cat('food')) } },
  { id: 'a9', text: 'gaji bulan lalu berapa', expect: { intent: 'income', total: income(SEP, cat('salary')) } },
  { id: 'a10', text: 'total saldo semua dompet berapa', expect: { intent: 'balance', total } },
  { id: 'a11', text: 'nongkrong bulan lalu habis berapa', expect: { intent: 'spend', total: spend(SEP, sub('hang')) } },
  { id: 'a12', text: 'pengeluaran pakai mandiri bulan ini berapa', expect: { intent: 'spend', total: spend(OCT, via('mandiri')) } },
  { id: 'a13', text: 'kopi kenangan bulan ini berapa', expect: { intent: 'spend', total: spend(OCT, at('Kopi Kenangan')) } },
  { id: 'a14', text: 'kemarin habis berapa', expect: { intent: 'spend', total: spend(DAY('2026-10-14')) } },
  { id: 'a15', text: 'rata-rata makan sehari bulan ini', expect: { intent: 'average', total: Math.round(spend(OCT, cat('food')) / 15) } },
  { id: 'a16', text: 'bulan ini lebih boros dari bulan lalu?', expect: { intent: 'compare', total: spend(OCT), compare: spend(['2026-09-01', '2026-09-16']) } },
  { id: 'a17', text: 'kapan terakhir ke indomaret', expect: { intent: 'last', date: last(at('Indomaret')) } },
  { id: 'a18', text: 'belanja bulan ini berapa', expect: { intent: 'spend', total: spend(OCT, cat('shop')) } },
  { id: 'a19', text: 'pemasukan siklus ini berapa', expect: { intent: 'income', total: income(CYCLE) } },
  { id: 'a20', text: 'pengeluaran 7 hari terakhir berapa', expect: { intent: 'spend', total: spend(['2026-10-09', '2026-10-16']) } },
  { id: 'a21', text: 'pengeluaran bulan september berapa', expect: { intent: 'spend', total: spend(SEP) } },
  { id: 'a22', text: 'berapa kali nonton bulan ini', expect: { intent: 'count', count: count(OCT, sub('cinema')) } },
  { id: 'a23', text: 'paling boros di kategori apa bulan ini', expect: { intent: 'top', total: spend(OCT, cat('shop')), label: 'Belanja' } },
  { id: 'a24', text: 'sisa budget hiburan', expect: { intent: 'budget', total: 400_000 - spend(CYCLE, cat('fun')) } },
  { id: 'a25', text: 'berapa bayar listrik bulan ini', expect: { intent: 'spend', total: 0 } },
  { id: 'a26', text: 'pengeluaran siklus ini berapa', expect: { intent: 'spend', total: spend(CYCLE) } },
  // Controls.
  { id: 'c1', text: 'utang aku ke rudi berapa', expect: { intent: 'owed', total: 400_000 } },
  { id: 'c2', text: 'atuy masih ngutang berapa', expect: { intent: 'owed', total: 12_000 } },
  { id: 'c3', text: 'beli kopi 25rb', expect: { entry: 'expense' } },
  { id: 'c4', text: 'saldo jago 1jt', expect: { entry: 'balance' } },
  { id: 'c5', text: 'apa kabar', expect: { none: true } },
  { id: 'c6', text: 'makan siang 30rb pake gopay', expect: { entry: 'expense' } },
];
