/**
 * Held-out receipts for V2.5: written after the parser was tuned on fixtures.mjs and fixtures-v25.mjs, and run once
 * (result-holdout-v25.json); nothing in the parser was changed after seeing this result. Same format as fixtures-v25.mjs.
 */
const rule = ['-'];
export const receipts = [
  {
    id: 'bakery', type: 'bakery',
    rows: [['c', 'TOKO ROTI HANGAT'], ['c', 'Jl. Seroja No. 2'], rule, ['l', '01/10/2026 07:12'], rule,
      ['l', 'ROTI SOBEK COKLAT'], ['r', '2 x 15.000', '30.000'], ['l', 'dipotong'], ['r', 'DONAT GULA', '8.000'], ['r', 'Diskon Member', '-3.000'], ['r', 'SUSU KEDELAI', '9.000'], rule,
      ['b', 'TOTAL', '44.000'], ['r', 'TUNAI', '50.000'], ['r', 'KEMBALI', '6.000']],
    truth: { merchant: 'TOKO ROTI HANGAT', date: '2026-10-01', time: '07:12', total: 44000, payment: 'cash', charges: {},
      items: [['ROTI SOBEK COKLAT', 2, 30000, { modifiers: ['dipotong'] }], ['DONAT GULA', 1, 8000, { discount: 3000 }], ['SUSU KEDELAI', 1, 9000]] },
  },
  {
    id: 'martabak', type: 'restaurant',
    rows: [['c', 'MARTABAK BULAN TERANG'], ['c', 'Jl. Pahlawan 45'], rule, ['l', 'Tgl 30/09/2026 Jam 20:31'], rule,
      ['l', 'MARTABAK MANIS'], ['l', 'KEJU COKLAT SUSU'], ['r', '', '65.000'], ['r', 'Teh Tarik', '12.000'], ['l', 'kurang manis'], rule,
      ['r', 'Subtotal', '77.000'], ['r', 'Promo', '-7.000'], ['b', 'Total', '70.000'], ['r', 'QRIS', '70.000']],
    truth: { merchant: 'MARTABAK BULAN TERANG', date: '2026-09-30', time: '20:31', total: 70000, payment: 'qris', charges: { discount: 7000 },
      items: [['MARTABAK MANIS KEJU COKLAT SUSU', 1, 65000], ['Teh Tarik', 1, 12000, { modifiers: ['kurang manis'] }]] },
  },
  {
    id: 'hardware', type: 'retail',
    rows: [['c', 'TOKO PERKAKAS JAYA'], ['c', 'CV PERKAKAS JAYA ABADI'], ['c', 'PLAZA KENARI'], ['c', 'Jl. Kenari Raya 7'], rule, ['l', '29/09/2026 11:48'], rule,
      ['l', 'METERAN GULUNG'], ['l', 'KP-220 / 5M'], ['r', '8991234  1 X 45,000', '45,000'], ['r', 'OBENG SET', '38,500'], rule,
      ['b', 'Total', '83,500'], ['r', 'Kredit', '83,500'], ['r', 'PPN INCLUDED', '8,275'], rule, ['c', 'Barang yang sudah dibeli tidak dapat ditukar']],
    truth: { merchant: 'TOKO PERKAKAS JAYA', legal: 'CV PERKAKAS JAYA ABADI', branch: 'PLAZA KENARI', date: '2026-09-29', time: '11:48', total: 83500, payment: 'credit', charges: {},
      items: [['METERAN GULUNG', 1, 45000, { variant: 'KP-220 / 5M', sku: '8991234' }], ['OBENG SET', 1, 38500]] },
  },
  {
    id: 'mie', type: 'restaurant',
    rows: [['c', 'MIE PEDAS NUSA'], ['c', 'Ruko Teratai A1'], rule, ['l', '28/09/2026 13:05'], rule,
      ['r', 'Mie Goreng Pedas', 'Rp28.000'], ['l', 'level 3 tanpa bawang'], ['r', 'Es Lemon Tea x2', 'Rp24.000'], ['r', 'Pangsit Kuah', 'Rp18.000'], rule,
      ['r', 'Subtotal', 'Rp70.000'], ['r', 'Service 5%', 'Rp3.500'], ['b', 'Total', 'Rp73.500'], ['r', 'Debit', 'Rp73.500']],
    truth: { merchant: 'MIE PEDAS NUSA', date: '2026-09-28', time: '13:05', total: 73500, payment: 'debit', charges: { service: 3500 },
      items: [['Mie Goreng Pedas', 1, 28000, { modifiers: ['level 3 tanpa bawang'] }], ['Es Lemon Tea', 2, 24000], ['Pangsit Kuah', 1, 18000]] },
  },
];
export { conditions } from './fixtures.mjs';
export const plan = { bakery: ['clean', 'shadow'], martabak: ['clean', 'blur'], hardware: ['clean', 'perspective'], mie: ['clean', 'small'] };
