/**
 * Catat otomatis 6.0 — Tanya, held-out set. Written before the question engine, in phrasings the development set does
 * not use, and never looked at while building it. The first run is frozen in heldout-first/v60-ask-heldout-first.json.
 * State and truth helpers: fixtures-v60askstate.mjs (Thu 15 Oct 2026, salary cycle 25 Sep – 24 Oct).
 *
 * expect: intent + the number that answers it (total / count / date); `entry` = must stay a new entry, `none` = nothing
 * is recorded and nothing is answered as money.
 */
import { CYCLE, OCT, SEP, WEEK, DAY, spend, income, count, last, cat, sub, at, via, says, total, pick } from './fixtures-v60askstate.mjs';

export const cases = [
  { id: 'q1', text: 'total pengeluaran minggu ini berapa ya', expect: { intent: 'spend', total: spend(WEEK), start: WEEK[0], end: WEEK[1] } },
  { id: 'q2', text: 'bulan lalu habis berapa buat bensin', expect: { intent: 'spend', total: spend(SEP, sub('fuel')), start: SEP[0], end: SEP[1] } },
  { id: 'q3', text: 'saldo mandiri sekarang berapa', expect: { intent: 'balance', total: 5_200_000 } },
  { id: 'q4', text: 'kapan terakhir kali nonton', expect: { intent: 'last', date: last(sub('cinema')) } },
  { id: 'q5', text: 'udah berapa kali ngopi bulan ini', expect: { intent: 'count', count: count(OCT, sub('drink')) } },
  { id: 'q6', text: 'pengeluaran paling gede bulan ini apa', expect: { intent: 'top', total: Math.max(...pick(OCT, t => t.type === 'expense').map(t => t.amount)) } },
  { id: 'q7', text: 'sisa budget nongkrong', expect: { intent: 'budget', total: 400_000 - spend(CYCLE, cat('fun')) } },
  { id: 'q8', text: 'pemasukan bulan ini berapa', expect: { intent: 'income', total: income(OCT) } },
  { id: 'q9', text: 'belanja di indomaret bulan ini berapa', expect: { intent: 'spend', total: spend(OCT, at('Indomaret')) } },
  { id: 'q10', text: 'kemarin keluar duit berapa', expect: { intent: 'spend', total: spend(DAY('2026-10-14')) } },
  { id: 'q11', text: 'jajan bulan ini udah berapa', expect: { intent: 'spend', total: spend(OCT, says('jajan')) } },
  { id: 'q12', text: 'gopay kepake berapa minggu ini', expect: { intent: 'spend', total: spend(WEEK, via('gopay')) } },
  { id: 'q13', text: 'total uangku di semua dompet berapa', expect: { intent: 'balance', total } },
  { id: 'q14', text: 'kapan terakhir isi bensin', expect: { intent: 'last', date: last(sub('fuel')) } },
  { id: 'q15', text: 'pengeluaran bulan ini dibanding bulan lalu gimana', expect: { intent: 'compare', total: spend(OCT), compare: spend(['2026-09-01', '2026-09-16']) } },
  { id: 'q16', text: 'bulan ini berapa kali makan di warteg bahari', expect: { intent: 'count', count: count(OCT, at('Warteg Bahari')) } },
  { id: 'q17', text: 'rata-rata ngopi sekali berapa', expect: { intent: 'average', total: Math.round(spend(CYCLE, sub('drink')) / count(CYCLE, sub('drink'))) } },
  { id: 'q18', text: 'siklus ini pengeluaran makan berapa', expect: { intent: 'spend', total: spend(CYCLE, cat('food')) } },
  { id: 'q19', text: 'sisa anggaran bensin bulan ini', expect: { intent: 'budget', total: 300_000 - spend(CYCLE, sub('fuel')) } },
  { id: 'q20', text: 'tadi udah keluar berapa', expect: { intent: 'spend', total: spend(DAY('2026-10-15')) } },
  { id: 'q21', text: 'beli kopi 20rb gopay', expect: { entry: 'expense' } },
  { id: 'q22', text: 'berapa harga iphone sekarang', expect: { none: true } },
];
