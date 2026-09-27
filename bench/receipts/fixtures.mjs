/**
 * Sanitized benchmark receipts for the on-device receipt reader. Every shop, address, number and person here is made
 * up; no real receipt photo is used. Each receipt is rendered in Chromium (generate.mjs) under several photo
 * conditions, and the reader's result is compared with `truth` field by field (run.mjs).
 *
 * Rows: ['c', text] centred · ['l', text] left · ['r', left, right] a row with an amount · ['b', left, right] bold row
 * · ['-'] a dashed rule.
 */
const rule = ['-'];
export const receipts = [
  {
    id: 'restaurant', type: 'restaurant',
    rows: [['c', 'WARUNG MAKAN SEDERHANA RASA'], ['c', 'Jl. Kenanga Raya No. 17'], ['c', 'Telp 0274-555123'], rule, ['l', 'Tgl 14/08/2026   Jam 12:41'], ['l', 'Kasir: Ani     Meja 7'], rule,
      ['l', 'NASI GORENG SPESIAL'], ['r', '2 x 25.000', '50.000'], ['l', 'ES TEH MANIS'], ['r', '2 x 6.000', '12.000'], ['r', 'AYAM BAKAR MADU', '32.000'], ['r', 'KOPI SUSU GULA AREN', '18.000'], rule,
      ['r', 'SUBTOTAL', '112.000'], ['r', 'SERVICE 5%', '5.600'], ['r', 'PB1 10%', '11.760'], ['b', 'TOTAL', '129.360'], ['r', 'TUNAI', '150.000'], ['r', 'KEMBALI', '20.640'], rule, ['c', 'Terima kasih atas kunjungan Anda']],
    truth: { merchant: 'WARUNG MAKAN SEDERHANA RASA', date: '2026-08-14', time: '12:41', total: 129360, payment: 'cash', charges: { service: 5600, tax: 11760 },
      items: [['NASI GORENG SPESIAL', 2, 50000], ['ES TEH MANIS', 2, 12000], ['AYAM BAKAR MADU', 1, 32000], ['KOPI SUSU GULA AREN', 1, 18000]] },
  },
  {
    id: 'cafe', type: 'cafe',
    rows: [['c', 'KOPI SENJA KITA'], ['c', 'Ruko Mawar Blok B2'], rule, ['l', '03-09-2026 08:15'], ['l', 'Order #A-2231'], rule,
      ['r', 'CAFFE LATTE', '32.000'], ['l', '  NO ICE'], ['l', '  LESS SUGAR'], ['r', '+ EXTRA SHOT', '6.000'], ['r', 'CROISSANT BUTTER', '24.000'], ['r', '2 x AIR MINERAL', '16.000'], rule,
      ['r', 'Subtotal', '78.000'], ['r', 'PB1 10%', '7.800'], ['b', 'Total', '85.800'], ['r', 'QRIS', '85.800'], rule, ['c', 'Follow kami @kopisenjakita']],
    truth: { merchant: 'KOPI SENJA KITA', date: '2026-09-03', time: '08:15', total: 85800, payment: 'qris', charges: { tax: 7800 },
      items: [['CAFFE LATTE', 1, 32000], ['EXTRA SHOT', 1, 6000], ['CROISSANT BUTTER', 1, 24000], ['AIR MINERAL', 2, 16000]] },
  },
  {
    id: 'minimarket', type: 'minimarket',
    rows: [['c', 'TOKO SERBA ADA MAKMUR'], ['c', 'Jl. Anggrek 3 Sleman'], ['c', 'NPWP 01.234.567.8-901.000'], rule,
      ['r', 'INDOMIE GRG', '3.100'], ['r', 'TELUR AYAM 1KG', '28.500'], ['r', 'SUSU UHT 1L', '19.900'], ['r', '2 x 5.000 AQUA 600', '10.000'], ['r', 'ROTI TAWAR', '15.500'], ['r', 'SABUN MANDI', '4.200'], rule,
      ['r', 'HARGA JUAL', '81.200'], ['b', 'TOTAL', '81.200'], ['r', 'TUNAI', '100.000'], ['r', 'KEMBALIAN', '18.800'], ['r', 'DPP', '73.153'], ['r', 'PPN', '8.047'], rule, ['l', '12.09.26-19:02 / NO TRX 230912190233'], ['c', 'Belanja hemat setiap hari']],
    truth: { merchant: 'TOKO SERBA ADA MAKMUR', date: '2026-09-12', time: '19:02', total: 81200, payment: 'cash', charges: {},
      items: [['INDOMIE GRG', 1, 3100], ['TELUR AYAM 1KG', 1, 28500], ['SUSU UHT 1L', 1, 19900], ['AQUA 600', 2, 10000], ['ROTI TAWAR', 1, 15500], ['SABUN MANDI', 1, 4200]] },
  },
  {
    id: 'supermarket', type: 'supermarket',
    rows: [['c', 'PASAR SWALAYAN SEGAR JAYA'], ['c', 'Cabang Cempaka'], rule, ['l', 'Tanggal: 21 Sep 2026  17:48'], rule,
      ['r', 'BERAS PULEN 5KG', '72.000'], ['r', 'MINYAK GORENG 2L', '38.000'], ['r', 'DISC MINYAK', '-5.000'], ['r', 'GULA PASIR 1KG', '17.500'], ['r', 'APEL FUJI', '24.300'], ['r', 'SABUN CUCI PIRING', '12.900'], rule,
      ['r', 'SUBTOTAL', '159.700'], ['r', 'MEMBER DISC', '-7.000'], ['b', 'TOTAL BAYAR', '152.700'], ['r', 'DEBIT BCA', '152.700'], rule, ['c', 'PROMO GOPAY CASHBACK 20%'], ['c', 'Terima kasih']],
    truth: { merchant: 'PASAR SWALAYAN SEGAR JAYA', date: '2026-09-21', time: '17:48', total: 152700, payment: 'debit', charges: { discount: 7000 },
      items: [['BERAS PULEN 5KG', 1, 72000], ['MINYAK GORENG 2L', 1, 38000], ['GULA PASIR 1KG', 1, 17500], ['APEL FUJI', 1, 24300], ['SABUN CUCI PIRING', 1, 12900]] },
  },
  {
    id: 'fuel', type: 'fuel',
    rows: [['c', 'SPBU 34.123.45'], ['c', 'Jl. Raya Magelang Km 9'], rule, ['l', 'Shift: 2   No. Trans: 889123'], ['l', 'Waktu: 19/09/2026 07:22'], ['l', 'Pulau/Pompa: 3'], rule,
      ['r', 'Nama Produk', 'PERTAMAX'], ['r', 'Harga/Liter', 'Rp 12.900'], ['r', 'Volume', '4,92 L'], ['b', 'Total Harga', 'Rp 63.468'], ['r', 'CASH', 'Rp 70.000'], ['r', 'Kembali', 'Rp 6.532'], rule, ['c', 'Terima kasih, selamat jalan']],
    truth: { merchant: '', date: '2026-09-19', time: '07:22', total: 63468, payment: 'cash', charges: {}, items: [['PERTAMAX', 1, 63468]] },
  },
  {
    id: 'parking', type: 'parking',
    rows: [['c', 'PARKIR MAL KOTA HIJAU'], rule, ['l', 'No. Tiket 0045512'], ['l', 'Masuk  : 22/09/2026 10:05'], ['l', 'Keluar : 22/09/2026 13:40'], ['l', 'Durasi : 3 jam 35 mnt'], rule,
      ['r', 'Tarif Mobil', '10.000'], ['b', 'TOTAL', '10.000'], ['r', 'E-MONEY', '10.000'], rule, ['c', 'Simpan tiket ini']],
    truth: { merchant: 'PARKIR MAL KOTA HIJAU', date: '2026-09-22', time: ['13:40', '10:05'], total: 10000, payment: 'debit', charges: {}, items: [['Tarif Mobil', 1, 10000]] },
  },
  {
    id: 'delivery', type: 'food_delivery',
    rows: [['c', 'PESANAN ANTAR MAKAN'], ['c', 'Resto Bakmi Pelangi'], rule, ['l', '24 Sep 2026, 19:31'], rule,
      ['r', '1x Bakmi Ayam Jamur', '38.000'], ['r', '2x Pangsit Goreng', '24.000'], ['r', '1x Es Jeruk', '12.000'], rule,
      ['r', 'Subtotal', '74.000'], ['r', 'Ongkos kirim', '9.000'], ['r', 'Biaya layanan', '2.000'], ['r', 'Biaya kemasan', '3.000'], ['r', 'Voucher', '-15.000'], ['b', 'Total pembayaran', '73.000'], ['r', 'Dibayar dengan OVO', '73.000']],
    truth: { merchant: '', date: '2026-09-24', time: '19:31', total: 73000, payment: 'ovo', charges: { delivery: 9000, service: 2000, fee: 3000, discount: 15000 },
      items: [['Bakmi Ayam Jamur', 1, 38000], ['Pangsit Goreng', 2, 24000], ['Es Jeruk', 1, 12000]] },
  },
  {
    id: 'marketplace', type: 'marketplace',
    rows: [['c', 'INVOICE BELANJA ONLINE'], ['l', 'No. Invoice INV/20260915/XYZ/551'], ['l', 'Tanggal Pembelian 15 September 2026'], rule,
      ['r', 'Kabel Data USB-C 1m', '45.000'], ['r', '2 x 15.000 Pelindung Layar', '30.000'], rule,
      ['r', 'Subtotal Produk', '75.000'], ['r', 'Ongkos Kirim', '12.000'], ['r', 'Asuransi Pengiriman', '1.500'], ['r', 'Biaya Layanan', '1.000'], ['r', 'Diskon Ongkos Kirim', '-12.000'], ['b', 'Total Tagihan', '77.500'], ['r', 'Metode Bayar: Transfer Bank', '']],
    truth: { merchant: '', date: '2026-09-15', time: '', total: 77500, payment: 'transfer', charges: { delivery: 12000, fee: 1500, service: 1000, discount: 12000 },
      items: [['Kabel Data USB-C 1m', 1, 45000], ['Pelindung Layar', 2, 30000]] },
  },
  {
    id: 'multiline', type: 'restaurant',
    rows: [['c', 'RUMAH MAKAN PADANG SEPAKAT'], ['c', 'Jl. Flamboyan 21'], rule, ['l', '26/09/2026 13:05'], rule,
      ['l', 'AYAM GEPREK'], ['r', 'SAMBAL MATAH', '32.000'], ['l', 'NASI RAMES'], ['r', 'TELUR BALADO', '27.000'], ['r', 'TEH TAWAR HANGAT', '5.000'], rule,
      ['b', 'TOTAL', '64.000'], ['r', 'TUNAI', '100.000'], ['r', 'KEMBALI', '36.000']],
    truth: { merchant: 'RUMAH MAKAN PADANG SEPAKAT', date: '2026-09-26', time: '13:05', total: 64000, payment: 'cash', charges: {},
      items: [['AYAM GEPREK SAMBAL MATAH', 1, 32000], ['NASI RAMES TELUR BALADO', 1, 27000], ['TEH TAWAR HANGAT', 1, 5000]] },
  },
  {
    id: 'discounts', type: 'retail',
    rows: [['c', 'TOKO SEPATU LANGKAH'], ['c', 'Mall Taman Sari Lt 2'], rule, ['l', 'Date: 2026-09-10 16:20'], rule,
      ['r', 'SNEAKER PUTIH 42', '450.000'], ['r', 'DISKON 20%', '-90.000'], ['r', 'KAOS KAKI 3PCS', '45.000'], ['r', 'SEMIR SEPATU', '25.000'], rule,
      ['r', 'SUBTOTAL', '430.000'], ['r', 'VOUCHER MEMBER', '-30.000'], ['b', 'GRAND TOTAL', '400.000'], ['r', 'KARTU KREDIT', '400.000'], rule, ['c', 'Barang yang sudah dibeli tidak dapat ditukar']],
    truth: { merchant: 'TOKO SEPATU LANGKAH', date: '2026-09-10', time: '16:20', total: 400000, payment: 'credit', charges: { discount: 30000 },
      items: [['SNEAKER PUTIH 42', 1, 450000], ['KAOS KAKI', 3, 45000], ['SEMIR SEPATU', 1, 25000]] },
  },
  {
    id: 'cashback', type: 'cafe',
    rows: [['c', 'TEH TARIK CORNER'], rule, ['l', '05/09/2026 15:10'], rule, ['r', 'TEH TARIK JUMBO', '22.000'], ['r', 'ROTI BAKAR COKLAT', '18.000'], rule,
      ['b', 'TOTAL', '40.000'], ['r', 'SHOPEEPAY', '40.000'], ['r', 'Cashback koin', '4.000'], rule, ['c', 'Terima kasih']],
    truth: { merchant: 'TEH TARIK CORNER', date: '2026-09-05', time: '15:10', total: 40000, payment: 'shopeepay', charges: {}, items: [['TEH TARIK JUMBO', 1, 22000], ['ROTI BAKAR COKLAT', 1, 18000]] },
  },
  {
    id: 'long', type: 'supermarket',
    rows: (() => {
      const names = ['BAWANG MERAH 250G', 'BAWANG PUTIH 250G', 'CABAI RAWIT 100G', 'TOMAT 500G', 'WORTEL 500G', 'KENTANG 1KG', 'BAYAM IKAT', 'KANGKUNG IKAT', 'TAHU PUTIH', 'TEMPE PAPAN', 'IKAN KEMBUNG 500G', 'DADA AYAM 500G', 'KECAP MANIS 520ML', 'SAUS SAMBAL 340ML', 'GARAM HALUS', 'MERICA BUBUK', 'TEPUNG TERIGU 1KG', 'MENTEGA 200G', 'KEJU CHEDDAR', 'SUSU KENTAL MANIS', 'TEH CELUP 25S', 'KOPI BUBUK 200G', 'DETERJEN 800G', 'PEWANGI 900ML', 'TISU GULUNG 4S', 'PASTA GIGI 190G'];
      const prices = [8900, 9900, 6500, 7800, 6900, 18500, 3500, 3000, 6000, 7500, 24900, 32500, 21900, 14900, 3900, 5500, 13900, 16900, 22500, 12500, 7900, 18900, 23900, 19900, 21500, 15900];
      const sum = prices.reduce((a, b) => a + b, 0);
      return [['c', 'HIPERMARKET SUMBER REJEKI'], ['c', 'Jl. Merpati 88'], rule, ['l', '18/09/2026 20:14'], rule, ...names.map((n, i) => ['r', n, prices[i].toLocaleString('id-ID')]), rule,
        ['r', 'TOTAL ITEM 26', ''], ['b', 'TOTAL', sum.toLocaleString('id-ID')], ['r', 'DEBIT MANDIRI', sum.toLocaleString('id-ID')], rule, ['c', 'Terima kasih']];
    })(),
    truth: (() => {
      const names = ['BAWANG MERAH 250G', 'BAWANG PUTIH 250G', 'CABAI RAWIT 100G', 'TOMAT 500G', 'WORTEL 500G', 'KENTANG 1KG', 'BAYAM IKAT', 'KANGKUNG IKAT', 'TAHU PUTIH', 'TEMPE PAPAN', 'IKAN KEMBUNG 500G', 'DADA AYAM 500G', 'KECAP MANIS 520ML', 'SAUS SAMBAL 340ML', 'GARAM HALUS', 'MERICA BUBUK', 'TEPUNG TERIGU 1KG', 'MENTEGA 200G', 'KEJU CHEDDAR', 'SUSU KENTAL MANIS', 'TEH CELUP 25S', 'KOPI BUBUK 200G', 'DETERJEN 800G', 'PEWANGI 900ML', 'TISU GULUNG 4S', 'PASTA GIGI 190G'];
      const prices = [8900, 9900, 6500, 7800, 6900, 18500, 3500, 3000, 6000, 7500, 24900, 32500, 21900, 14900, 3900, 5500, 13900, 16900, 22500, 12500, 7900, 18900, 23900, 19900, 21500, 15900];
      return { merchant: 'HIPERMARKET SUMBER REJEKI', date: '2026-09-18', time: '20:14', total: prices.reduce((a, b) => a + b, 0), payment: 'debit', charges: {}, items: names.map((n, i) => [n, 1, prices[i]]) };
    })(),
  },
];

/**
 * Photo conditions. `receipt` is CSS for the paper, `scene` for the table, `overlay` an extra layer over the paper
 * (shadow, glare). Every receipt is shot clean; the others are spread over the receipts so the set stays small.
 */
export const conditions = {
  clean: { rotate: -1 },
  blur: { rotate: 1.5, filter: 'blur(1.4px)' },
  shadow: { rotate: -2, overlay: 'linear-gradient(115deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.35) 30%, rgba(0,0,0,0) 55%)' },
  angled: { rotate: 9 },
  perspective: { transform: 'perspective(900px) rotateX(24deg) rotateZ(-4deg)' },
  faded: { rotate: 1, ink: '#8a8a8a' },
  glare: { rotate: -1.5, overlay: 'radial-gradient(ellipse 45% 22% at 60% 55%, rgba(255,255,255,.92), rgba(255,255,255,0) 70%)' },
  small: { rotate: -3, scale: .52 },
  dark: { rotate: 2, filter: 'brightness(.55)' },
  // Harder shots.
  steep: { transform: 'perspective(700px) rotateX(34deg) rotateY(-8deg) rotateZ(6deg)' },
  heavyblur: { rotate: -1, filter: 'blur(2.1px)' },
  lowres: { rotate: 1, scale: .4, quality: 45 },
  hardshadow: { rotate: -1, overlay: 'linear-gradient(100deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.62) 38%, rgba(0,0,0,0) 38.5%)' },
};
export const plan = {
  restaurant: ['clean', 'blur', 'shadow', 'perspective', 'angled', 'steep', 'hardshadow'],
  cafe: ['clean', 'faded', 'perspective', 'heavyblur'],
  minimarket: ['clean', 'glare', 'angled', 'steep', 'lowres'],
  supermarket: ['clean', 'shadow', 'small', 'hardshadow'],
  fuel: ['clean', 'dark', 'steep'],
  parking: ['clean', 'blur'],
  delivery: ['clean', 'perspective', 'lowres'],
  marketplace: ['clean', 'faded', 'heavyblur'],
  multiline: ['clean', 'angled'],
  discounts: ['clean', 'glare', 'steep'],
  cashback: ['clean', 'small'],
  long: ['clean'],
};
