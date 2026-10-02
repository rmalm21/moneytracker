/**
 * Catat otomatis V3.3 — the starting financial state shared by the V3.3 sets (a case may override parts of it).
 * Today is Thursday 15 October 2026, the sentence is written at 15:00 (nowMs = 15:00 local, as epoch ms in UTC+7).
 *
 *   Piutang: Sinta r1 Rp250.000 (Tiket) · Dina r2 Rp50.000 (Bensin) · Dina r3 Rp30.000 (Makan) · Atuy ra Rp12.000 (Makan)
 *   Utang:   Rudi d1 Rp400.000 · Aldi d2 Rp100.000 (Bensin)
 *   Klaim:   Dinas Surabaya c1 Rp1.200.000 · Makan kantor c2 Rp100.000
 *   Terbaru: t1 Kopi · Cotti Coffee Rp19.000 Jago hari ini 13:12 · t2 Parkir Rp2.000 Cash hari ini 10:05 ·
 *            t3 Makan Rp20.000 Gopay kemarin 12:30 · t4 transfer Jago → Mandiri Rp100.000 hari ini 09:00
 *   Rencana: p1 WiFi Rp121.000 hari ini · Jadwal rutin: s1 Spotify Rp30.000 tiap tgl 20 (berikutnya 20 Okt)
 */
import { ctx as base } from './fixtures-v30dev.mjs';
export const today = '2026-10-15';
const at = (date, time) => Date.parse(`${date}T${time}:00+07:00`);
export const nowMs = at(today, '15:00');

export const ctx = {
  ...base, today, now: '15:00', nowMs,
  categories: [...base.categories, { id: 'net', name: 'Internet', type: 'expense', parentId: 'bills' }, { id: 'subs', name: 'Langganan', type: 'expense', parentId: 'bills' }, { id: 'admin', name: 'Biaya Admin', type: 'expense' }, { id: 'refund', name: 'Pemasukan Lain', type: 'income' }],
  receivables: [
    { id: 'r1', person: 'Sinta', description: 'Tiket', remainingAmount: 250_000, originalAmount: 250_000, date: '2026-09-01' },
    { id: 'r2', person: 'Dina', description: 'Bensin', remainingAmount: 50_000, originalAmount: 50_000, date: '2026-10-01' },
    { id: 'r3', person: 'Dina', description: 'Makan', remainingAmount: 30_000, originalAmount: 30_000, date: '2026-10-05' },
    { id: 'ra', person: 'Atuy', description: 'Makan', remainingAmount: 12_000, originalAmount: 12_000, date: '2026-10-10' },
  ],
  debts: [{ id: 'd1', name: 'Pinjaman Rudi', provider: 'Rudi', outstandingAmount: 400_000 }, { id: 'd2', name: 'Pinjaman Aldi', provider: 'Aldi', outstandingAmount: 100_000 }],
  claims: [{ id: 'c1', name: 'Dinas Surabaya', remainingAmount: 1_200_000, amount: 1_200_000 }, { id: 'c2', name: 'Makan kantor', remainingAmount: 100_000, amount: 100_000 }],
  recent: [
    { id: 't1', type: 'expense', amount: 19_000, date: today, time: '13:12', walletId: 'jago', destinationWalletId: null, categoryId: 'food', subcategoryId: 'drink', merchant: 'Cotti Coffee', description: 'Kopi', createdMs: at(today, '13:12') },
    { id: 't2', type: 'expense', amount: 2_000, date: today, time: '10:05', walletId: 'cash', destinationWalletId: null, categoryId: 'trans', subcategoryId: 'park', merchant: '', description: 'Parkir', createdMs: at(today, '10:05') },
    { id: 't3', type: 'expense', amount: 20_000, date: '2026-10-14', time: '12:30', walletId: 'gopay', destinationWalletId: null, categoryId: 'food', subcategoryId: null, merchant: '', description: 'Makan', createdMs: at('2026-10-14', '12:30') },
    { id: 't4', type: 'transfer', amount: 100_000, date: today, time: '09:00', walletId: 'jago', destinationWalletId: 'mandiri', categoryId: null, subcategoryId: null, merchant: '', description: '', createdMs: at(today, '09:00') },
  ],
  plans: [{ id: 'p1', title: 'WiFi', type: 'expense', amount: 121_000, date: today, walletId: 'jago', categoryId: 'bills', subcategoryId: 'net', status: 'planned' }],
  recurring: [{ id: 's1', name: 'Spotify', type: 'expense', amount: 30_000, walletId: 'jago', categoryId: 'bills', frequency: 'monthly', anchorDay: 20, nextDate: '2026-10-20', active: true }],
};
export { at };
