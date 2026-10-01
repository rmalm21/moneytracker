/**
 * V2.5 benchmark receipts: the structure cases (modifiers, item boundaries, multi-line names, discount ownership,
 * merchant hierarchy, variants and SKUs). Same row format as fixtures.mjs; every shop, address and number is made up.
 * Truth items are [name, qty, total, extra?] where extra may hold `modifiers`, `discount`, `variant` and `sku`; the
 * receipt truth may also hold `legal` and `branch`.
 * Usage: SET=v25 node bench/receipts/generate.mjs · SET=v25 node bench/receipts/run.mjs <base-url> <label>
 */
const rule = ['-'];
export const receipts = [
  {
    id: 'modifier', type: 'cafe',
    rows: [['c', 'KEDAI TEH SEJUK'], ['c', 'Jl. Flamboyan No. 8'], rule, ['l', '27/09/2026 10:02'], rule,
      ['r', 'Es Teh Jumbo x3', 'Rp30.000'], ['l', '1 hangat 2 ice'], ['r', 'Roti Bakar Coklat', 'Rp18.000'], ['l', 'less sugar'], ['r', 'Air Mineral', 'Rp6.000'], rule,
      ['b', 'Total', 'Rp54.000'], ['r', 'QRIS', 'Rp54.000'], rule, ['c', 'Terima kasih']],
    truth: { merchant: 'KEDAI TEH SEJUK', date: '2026-09-27', time: '10:02', total: 54000, payment: 'qris', charges: {},
      items: [['Es Teh Jumbo', 3, 30000, { modifiers: ['1 hangat 2 ice'] }], ['Roti Bakar Coklat', 1, 18000, { modifiers: ['less sugar'] }], ['Air Mineral', 1, 6000]] },
  },
  {
    id: 'boundary', type: 'cafe',
    rows: [['c', 'CROFFLE CORNER'], ['c', 'Ruko Melati Blok C3'], rule, ['l', '28/09/2026 15:40'], rule,
      ['r', 'Croffle Original', 'Rp30.000'], ['l', 'springkle'], ['r', 'Mineral Water', 'Rp10.000'], ['r', 'Matcha Latte', 'Rp28.000'], ['l', 'extra shot'], rule,
      ['r', 'Subtotal', 'Rp68.000'], ['r', 'PB1 10%', 'Rp6.800'], ['b', 'Total', 'Rp74.800'], ['r', 'Tunai', 'Rp100.000'], ['r', 'Kembali', 'Rp25.200']],
    truth: { merchant: 'CROFFLE CORNER', date: '2026-09-28', time: '15:40', total: 74800, payment: 'cash', charges: { tax: 6800 },
      items: [['Croffle Original', 1, 30000, { modifiers: ['springkle'] }], ['Mineral Water', 1, 10000], ['Matcha Latte', 1, 28000, { modifiers: ['extra shot'] }]] },
  },
  {
    id: 'multiname', type: 'restaurant',
    rows: [['c', 'RUMAH MAKAN LAUT BIRU'], ['c', 'Jl. Pantai Indah 21'], rule, ['l', 'Tgl 29/09/2026 Jam 19:05'], rule,
      ['l', 'NASI GORENG'], ['l', 'SPECIAL SEAFOOD'], ['r', '', '35.000'], ['l', 'CUMI GORENG'], ['r', 'TEPUNG PEDAS', '42.000'], ['r', 'ES JERUK', '10.000'], rule,
      ['r', 'SUBTOTAL', '87.000'], ['b', 'TOTAL', '87.000'], ['r', 'DEBIT', '87.000']],
    truth: { merchant: 'RUMAH MAKAN LAUT BIRU', date: '2026-09-29', time: '19:05', total: 87000, payment: 'debit', charges: {},
      items: [['NASI GORENG SPECIAL SEAFOOD', 1, 35000], ['CUMI GORENG TEPUNG PEDAS', 1, 42000], ['ES JERUK', 1, 10000]] },
  },
  {
    id: 'itemdisc', type: 'restaurant',
    rows: [['c', 'BURGER BARU'], ['c', 'Jl. Cendana No. 4'], rule, ['l', '30/09/2026 12:20'], rule,
      ['r', 'Burger Keju', 'Rp50.000'], ['r', 'Member Discount', '-Rp10.000'], ['r', 'Kentang Goreng', 'Rp20.000'], ['r', 'Mineral Water', 'Rp10.000'], rule,
      ['r', 'Subtotal', 'Rp70.000'], ['b', 'Total', 'Rp70.000'], ['r', 'GoPay', 'Rp70.000']],
    truth: { merchant: 'BURGER BARU', date: '2026-09-30', time: '12:20', total: 70000, payment: 'gopay', charges: {},
      items: [['Burger Keju', 1, 50000, { discount: 10000 }], ['Kentang Goreng', 1, 20000], ['Mineral Water', 1, 10000]] },
  },
  {
    id: 'voucher', type: 'restaurant',
    rows: [['c', 'WARUNG BU TINI'], ['c', 'Jl. Kemuning 9'], rule, ['l', '30/09/2026 18:45'], rule,
      ['r', 'Nasi Goreng', '50.000'], ['r', 'Es Teh', '30.000'], rule, ['r', 'Subtotal', 'Rp80.000'], ['r', 'Voucher', '-Rp10.000'], ['b', 'Total', 'Rp70.000'], ['r', 'OVO', 'Rp70.000']],
    truth: { merchant: 'WARUNG BU TINI', date: '2026-09-30', time: '18:45', total: 70000, payment: 'ovo', charges: { discount: 10000 },
      items: [['Nasi Goreng', 1, 50000], ['Es Teh', 1, 30000]] },
  },
  {
    id: 'thermal', type: 'retail',
    rows: [['c', 'RUMAH SERBA GUNA'], ['c', 'PT SERBA GUNA NUSANTARA'], ['c', 'BEKASI GRAND MALL'], ['c', 'Jl. Ahmad Yani No. 10'], rule, ['l', '27/09/2026 14:02'], rule,
      ['l', 'AUTO FOLD UMBRELLA'], ['l', 'DB024 - 12/60'], ['r', '9038568  1 X 91,500', '91,500'], ['l', 'TISSUE BASAH'], ['l', 'TB110 - 24/96'], ['r', '8812044  2 X 10,000', '20,000'], rule,
      ['b', 'Total', '111,500'], ['r', 'Debit', '111,500'], ['r', 'PPN INCLUDED', '11,050'], rule, ['c', 'Terima kasih'], ['c', 'Customer care WA 0812 0000 0000']],
    truth: { merchant: 'RUMAH SERBA GUNA', legal: 'PT SERBA GUNA NUSANTARA', branch: 'BEKASI GRAND MALL', date: '2026-09-27', time: '14:02', total: 111500, payment: 'debit', charges: {},
      items: [['AUTO FOLD UMBRELLA', 1, 91500, { variant: 'DB024 - 12/60', sku: '9038568' }], ['TISSUE BASAH', 2, 20000, { variant: 'TB110 - 24/96', sku: '8812044' }]] },
  },
];
export { conditions } from './fixtures.mjs';
export const plan = {
  modifier: ['clean', 'faded', 'perspective'],
  boundary: ['clean', 'blur', 'small'],
  multiname: ['clean', 'angled'],
  itemdisc: ['clean', 'shadow'],
  voucher: ['clean', 'glare'],
  thermal: ['clean', 'faded', 'perspective', 'lowres'],
};
