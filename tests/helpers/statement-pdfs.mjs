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


/* 8.7 More bank layouts, made up from the shapes banks commonly use (column names, two money columns with 0.00 in the
   unused one, a D/K column, dates with the time beside or under them, totals named differently). No real data. */

/** A new-style e-statement: Nominal with + and −, time under the date, a three-line description, summary boxes on top. */
export function nominalSignedPdf() {
  const row = (y, date, time, lines, amount, saldo) => [T(30, y, date), T(30, y + 11, time), ...lines.map((l, i) => T(110, y + i * 11, l)), right(430, y, amount), right(560, y, saldo)];
  return makePdf([[
    T(30, 40, 'e-Statement', 12), T(30, 60, 'BUDI SANTOSO'), T(330, 60, 'Periode: 01 Okt 2026 - 31 Okt 2026'),
    T(30, 90, 'Saldo Awal'), T(170, 90, 'Dana Masuk'), T(310, 90, 'Dana Keluar'), T(450, 90, 'Saldo Akhir'),
    T(30, 102, 'Rp 2.000.000,00'), T(170, 102, 'Rp 1.000.000,00'), T(310, 102, 'Rp 85.500,00'), T(450, 102, 'Rp 2.914.500,00'),
    T(30, 140, 'Tanggal'), T(110, 140, 'Keterangan'), T(380, 140, 'Nominal (IDR)'), T(520, 140, 'Saldo (IDR)'),
    ...row(165, '01 Okt 2026', '08:15:22 WIB', ['Transfer BI Fast', 'Ke SARI WULANDARI', 'BCA - 1234567890'], '-50.000,00', '1.950.000,00'),
    ...row(205, '05 Okt 2026', '12:01:09 WIB', ['Pembayaran QR', 'KOPI KENANGAN SENOPATI'], '-35.500,00', '1.914.500,00'),
    ...row(245, '25 Okt 2026', '09:00:00 WIB', ['Transfer Masuk', 'Dari PT MAJU JAYA', 'Gaji Oktober'], '+1.000.000,00', '2.914.500,00'),
    T(230, 800, 'Halaman 1 dari 1'),
  ]]);
}

/** A classic two-column statement: Debet and Kredit both filled (0.00 in the unused one), date and time in one cell,
 * totals named "Total Transaksi Debet/Kredit" at the bottom. */
export function debitCreditPdf() {
  const row = (y, date, desc, teller, db, cr, saldo) => [T(25, y, date), T(130, y, desc), T(300, y, teller), right(390, y, db), right(470, y, cr), right(565, y, saldo)];
  return makePdf([[
    T(200, 40, 'LAPORAN TRANSAKSI', 11), T(25, 70, 'Nama : BUDI SANTOSO'), T(330, 70, 'Periode Transaksi : 01/10/26 - 31/10/26'),
    T(25, 120, 'Tanggal Transaksi'), T(130, 120, 'Uraian Transaksi'), T(300, 120, 'Teller'), T(355, 120, 'Debet'), T(435, 120, 'Kredit'), T(530, 120, 'Saldo'),
    ...row(140, '02/10/26 08:15:22', 'TRANSFER KE SARI WULANDARI', '8888', '50,000.00', '0.00', '950,000.00'),
    ...row(155, '03/10/26 19:02:11', 'INDOMARET CIPUTAT', '8888', '27,300.00', '0.00', '922,700.00'),
    ...row(170, '25/10/26 07:00:00', 'GAJI OKTOBER PT MAJU', '0000', '0.00', '4,000,000.00', '4,922,700.00'),
    T(25, 230, 'Saldo Awal'), T(150, 230, 'Total Transaksi Debet'), T(300, 230, 'Total Transaksi Kredit'), T(450, 230, 'Saldo Akhir'),
    T(25, 242, '1,000,000.00'), T(150, 242, '77,300.00'), T(300, 242, '4,000,000.00'), T(450, 242, '4,922,700.00'),
  ]]);
}

/** English headers with two date columns, Amount and a D/K column, and a running balance. */
export function postingDatePdf() {
  const row = (y, d1, d2, desc, amount, dk, bal) => [T(20, y, d1), T(80, y, d2), T(150, y, desc), right(420, y, amount), T(440, y, dk), right(565, y, bal)];
  return makePdf([[
    T(20, 40, 'ACCOUNT STATEMENT', 11), T(20, 60, 'Period : 01-Oct-2026 - 31-Oct-2026'),
    T(20, 100, 'Posting Date'), T(80, 100, 'Effective Date'), T(150, 100, 'Transaction Description'), T(380, 100, 'Amount'), T(440, 100, 'DB/CR'), T(520, 100, 'Balance'),
    ...row(120, '01/10/26', '01/10/26', 'TRF KE SARI WULANDARI', '50,000.00', 'D', '450,000.00'),
    ...row(135, '10/10/26', '10/10/26', 'PEMBELIAN PULSA TELKOMSEL', '25,000.00', 'D', '425,000.00'),
    ...row(150, '28/10/26', '28/10/26', 'TRF DARI ANDI PRATAMA', '100,000.00', 'K', '525,000.00'),
    T(20, 200, 'Beginning Balance'), right(200, 200, '500,000.00'), T(20, 212, 'Total Debit'), right(200, 212, '75,000.00'), T(20, 224, 'Total Credit'), right(200, 224, '100,000.00'), T(20, 236, 'Ending Balance'), right(200, 236, '525,000.00'),
  ]]);
}

/** A digital bank with Sumber/Tujuan and Rincian columns, amounts with Rp and a sign, the time under the date. */
export function sourceDestPdf() {
  const row = (y, date, time, who, what, amount, saldo) => [T(25, y, date), T(25, y + 11, time), T(120, y, who), T(270, y, what), right(470, y, amount), right(565, y, saldo)];
  return makePdf([[
    T(25, 40, 'Riwayat Transaksi', 12), T(25, 60, 'Periode 1 Oktober 2026 - 31 Oktober 2026'),
    T(25, 110, 'Tanggal & Waktu'), T(120, 110, 'Sumber/Tujuan'), T(270, 110, 'Rincian Transaksi'), T(430, 110, 'Jumlah'), T(530, 110, 'Saldo'),
    ...row(135, '02 Okt 2026', '10:11', 'Sari Wulandari', 'Transfer keluar', '-Rp50.000', 'Rp450.000'),
    ...row(170, '09 Okt 2026', '13:45', 'Grab', 'Pembayaran', '-Rp32.000', 'Rp418.000'),
    ...row(205, '20 Okt 2026', '20:30', 'Andi Pratama', 'Transfer masuk', '+Rp75.000', 'Rp493.000'),
  ]]);
}
