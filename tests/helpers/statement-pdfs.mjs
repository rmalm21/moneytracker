// 8.7 Made-up PDF statements in three layouts (an e-wallet history, a digital bank's e-statement with pockets, a classic
// bank e-statement), for the tests and the demo. No real account data.
import { makePdf, right } from './pdf.mjs';

export const T = (x, y, s, size = 8) => ({ x, y, s, size });

/** An e-wallet history: no balance, summary labels with the value under them, two lines per row, Coins cashback rows. */
export function ewalletPdf() {
  const row = (y, date, time, trx, id, method, method2, amount) => [T(21, y, date), T(95, y, trx), T(267, y, id), T(381, y, method), right(551, y, amount), T(21, y + 11, time), T(267, y + 11, 'X9'), ...(method2 ? [T(381, y + 11, method2)] : [])];
  const page1 = [
    T(86, 36, 'E-statement', 12), T(179, 35, 'Halaman 1 dari 2', 10), T(352, 35, 'Periode transaksi', 9), T(424, 35, ': 1 Oktober 2026 - 31 Oktober 2026', 9),
    T(25, 78, 'Budi Santoso', 9), T(25, 95, '+6281234567890', 9), T(25, 113, 'budi@example.com', 9),
    T(255, 89, 'Total Coins didapatkan', 6.8), T(348, 89, 'Total Coins dipakai', 6.8), T(429, 89, 'Total pemasukan', 6.8), T(505, 89, 'Total pengeluaran', 6.8),
    T(279, 104, '250', 8.3), T(366, 104, '250', 8.3), T(431, 104, 'Rp100.071', 8.3), T(508, 104, 'Rp110.264', 8.3),
    T(21, 163, 'Tanggal'), T(95, 163, 'Transaksi'), T(267, 163, 'ID transaksi'), T(381, 163, 'Metode pembayaran'), T(507, 163, 'Jumlah'),
    ...row(190, '05/10/2026', '08:15', 'Kopi Kenangan Senopati', 'A1B2C3', 'GoPay Saldo', '', '-Rp25.000'),
    ...row(236, '06/10/2026', '09:00', 'GoPay top up', 'T0P1UP', 'Transfer bank', '', 'Rp100.000'),
    ...row(282, '07/10/2026', '12:30', 'Cashback Kopi Kenangan', 'CB0001', 'GoPay Coins', '', '250'),
    ...row(328, '08/10/2026', '18:45', 'Indomaret Ciputat', 'IM0001', 'GoPay Saldo', 'GoPay Coins', '-Rp15.500'),
    ...row(374, '09/10/2026', '20:10', 'Ditransfer ke Budi Santoso', 'TF0001', 'GoPay Saldo', '', '-Rp50.000'),
    ...row(420, '10/10/2026', '21:00', 'Ditransfer ke Sari Wulandari', 'TF0002', 'GoPay Saldo', '', '-Rp20.000'),
  ];
  // The table goes on at the top of the next page without its header.
  const page2 = [T(86, 36, 'E-statement', 12), T(179, 35, 'Halaman 2 dari 2', 10),
    ...row(60, '12/10/2026', '23:59', 'Bunga', 'BG0001', 'GoPay Saldo', '', 'Rp71'),
    ...row(106, '12/10/2026', '23:59', 'Pajak atas bunga', 'PJ0001', 'GoPay Saldo', '', '-Rp14')];
  return makePdf([page1, page2]);
}

/** A digital bank's e-statement: summary on page 1, a table per pocket with an English line under the header and under
 * each row, amounts with cents, moves between pockets, and a time like "10.05 WIB" that must not read as a date. */
export function bankPocketsPdf() {
  const W = 842, H = 1191;
  const header = y => [T(25, y, 'Tanggal & Waktu'), T(187, y, 'Detail Transaksi'), T(510, y, 'Tipe Transaksi'), T(787, y, 'Jumlah'), T(25, y + 12, 'Date & Time', 6), T(187, y + 12, 'Transactions Detail', 6), T(510, y + 12, 'Transactions Type', 6), T(792, y + 12, 'Amount', 6)];
  const row = (y, date, time, detail, detail2, type, type2, amount, detail3) => [T(25, y, date), T(186, y, detail), T(510, y, type), right(818, y, amount), T(510, y + 12, type2), T(25, y + 14, time), T(186, y + 14, detail2), ...(detail3 ? [T(186, y + 26, detail3)] : [])];
  const balances = (y, prev, inn, end, out) => [T(17, y, 'Saldo Sebelumnya /'), T(99, y, 'Previous Balance'), T(306, y, prev), T(502, y, 'Total Pemasukan /'), T(578, y, 'Total Incoming'), T(769, y, inn),
    T(17, y + 13, 'Saldo Akhir /'), T(69, y + 13, 'Ending Balance'), T(300, y + 13, end), T(502, y + 13, 'Total Pengeluaran /'), T(582, y + 13, 'Total Outgoing'), T(770, y + 13, out)];
  const footer = n => [T(703, 44, `Halaman ${n} dari 2`, 9), T(777, 44, `/ Page ${n} of 2`, 9), T(101, 1156, 'PT Bank Contoh Digital Tbk berizin dan diawasi oleh Otoritas Jasa Keuangan (OJK)', 9), T(754, 1156, 'contohbank.id', 9)];
  const page1 = [
    T(17, 90, 'Pemilik Rekening /'), T(89, 90, 'Account Owner'), T(17, 102, 'Budi Santoso'),
    T(295, 90, 'Saldo Sebelumnya /'), T(375, 90, 'Previous Balance'), T(295, 102, 'Rp1.000.000,00'),
    T(571, 90, 'Total Pemasukan /'), T(644, 90, 'Total Incoming'), T(571, 102, '+Rp111.012,34'),
    T(17, 120, 'No. Rek. Utama /'), T(82, 120, 'Main Acc. No.'), T(17, 132, '770012345678'),
    T(295, 120, 'Saldo Akhir /'), T(344, 120, 'Ending Balance'), T(295, 132, 'Rp825.512,08'),
    T(571, 120, 'Total Pengeluaran /'), T(648, 120, 'Total Outgoing'), T(571, 132, '-Rp285.500,26'),
    T(25, 443, 'Jenis Kantong'), T(258, 443, 'Saldo Sebelumnya'), T(426, 443, 'Total Pemasukan'), T(583, 443, 'Total Pengeluaran'), T(773, 443, 'Saldo Akhir'),
    T(23, 482, 'Tabungan Utama'), T(300, 488, 'Rp1.000.000,00'), T(439, 488, '+Rp61.012,34'), T(602, 488, '-Rp285.500,26'), T(780, 488, 'Rp775.512,08'),
    ...footer(1),
  ];
  const page2 = [
    T(15, 85, 'Rincian Transaksi /', 10), T(117, 85, 'Transaction Details', 10), T(15, 113, 'Tabungan Utama', 9), T(15, 127, 'No. Rek. /', 6), T(43, 127, 'Acc. No. 770012345678', 6),
    ...balances(155, 'Rp1.000.000,00', '+Rp61.012,34', 'Rp775.512,08', '-Rp285.500,26'),
    ...header(201),
    ...row(240, '01 October 2026', '07.43 WIB', 'Dompet Anak Bangsa', 'Cimb Niaga | 84573F1234', 'Transfer Masuk', 'Incoming Transfer', '+Rp61.000,00', 'GoPay Bank Transfer ID123456'),
    ...row(290, '03 October 2026', '10.05 WIB', 'Kantong Liburan', '88FB1234567', 'Pemindahan Saldo', 'Balance Movement', '-Rp50.000,00'),
    ...row(329, '15 October 2026', '12.00 WIB', 'Budi Santoso', 'Mandiri | 1234567890', 'Transfer Keluar', 'Outgoing Transfer', '-Rp200.000,00'),
    ...row(368, '20 October 2026', '19.30 WIB', 'Toko Sinar Jaya', 'Bca | 9876543210', 'Transfer Keluar', 'Outgoing Transfer', '-Rp35.500,00'),
    ...row(407, '31 October 2026', '23.59 WIB', 'Bunga', 'Interest', 'Bunga', 'Interest', '+Rp12,34'),
    ...row(446, '31 October 2026', '23.59 WIB', 'Pajak', 'Tax', 'Pajak', 'Tax', '-Rp0,26'),
    T(15, 520, 'Kantong Liburan', 9), T(15, 534, 'No. Rek. /', 6), T(43, 534, 'Acc. No. 770098765432', 6),
    ...balances(562, 'Rp0,00', '+Rp50.000,00', 'Rp50.000,00', '-Rp0,00'),
    ...header(608),
    ...row(647, '03 October 2026', '10.05 WIB', 'Tabungan Utama', '88FB1234567', 'Pemindahan Saldo', 'Balance Movement', '+Rp50.000,00'),
    ...footer(2),
  ];
  return makePdf([page1, page2], { width: W, height: H });
}

/** A classic bank e-statement: DB marks on money out (none on money in), wrapped descriptions, running balance, the
 * period without a day, and the totals at the bottom. */
export function classicBankPages() {
  const row = (y, date, lines, mutasi, saldo, cbg) => [T(30, y, date), ...lines.map((l, i) => T(80, y + i * 10, l)), ...(cbg ? [T(280, y, cbg)] : []), ...(mutasi ? [right(460, y, mutasi)] : []), right(560, y, saldo)];
  return [[
    T(220, 40, 'REKENING TAHAPAN', 10), T(30, 70, 'BUDI SANTOSO'), T(350, 70, 'NO. REKENING : 1234567890'), T(350, 82, 'PERIODE : OKTOBER 2026'), T(350, 94, 'MATA UANG : IDR'),
    T(30, 130, 'TANGGAL'), T(80, 130, 'KETERANGAN'), T(280, 130, 'CBG'), T(420, 130, 'MUTASI'), T(530, 130, 'SALDO'),
    ...row(150, '01/10', ['SALDO AWAL'], '', '1,000,000.00'),
    ...row(166, '02/10', ['TRSF E-BANKING DB', '0210/FTSCY/WS95051', 'SARI WULANDARI'], '50,000.00 DB', '950,000.00'),
    ...row(202, '05/10', ['KR OTOMATIS', 'GAJI OKTOBER PT MAJU'], '5,000,000.00', '5,950,000.00', '0000'),
    T(30, 700, 'SALDO AWAL'), T(110, 700, ':'), right(230, 700, '1,000,000.00'),
    T(30, 712, 'MUTASI CR'), T(110, 712, ':'), right(230, 712, '5,000,000.00'), T(260, 712, '1'),
    T(30, 724, 'MUTASI DB'), T(110, 724, ':'), right(230, 724, '50,000.00'), T(260, 724, '1'),
    T(30, 736, 'SALDO AKHIR'), T(110, 736, ':'), right(230, 736, '5,950,000.00'),
    T(250, 800, 'Bersambung ke Halaman berikut'),
  ]];
}

