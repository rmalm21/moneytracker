import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickText } from '../lib/quick-entry.ts';
import { flowOf } from '../lib/categorize.ts';
import { categoryTemplates } from '../lib/category-templates.ts';

// Every starter template, seeded the way the app seeds them (ids are the template keys here).
const templates = [];
for (const t of categoryTemplates) {
  templates.push({ id: t.key, name: t.name, type: t.type, parentId: null, icon: t.icon, templateKey: t.key });
  for (const s of t.subcategories) templates.push({ id: s.key, name: s.name, type: t.type, parentId: t.key, icon: s.icon, templateKey: s.key });
}
// A hand-made set with the person's own names.
const own = [
  { id: 'makan', name: 'Makan & Minum', type: 'expense' }, { id: 'kopi', name: 'Kopi', type: 'expense', parentId: 'makan' }, { id: 'siang', name: 'Makan siang', type: 'expense', parentId: 'makan' },
  { id: 'trans', name: 'Transportasi', type: 'expense' }, { id: 'bensin', name: 'Bensin', type: 'expense', parentId: 'trans' }, { id: 'parkir', name: 'Parkir', type: 'expense', parentId: 'trans' },
  { id: 'tagihan', name: 'Tagihan', type: 'expense' }, { id: 'listrik', name: 'Listrik', type: 'expense', parentId: 'tagihan' },
  { id: 'belanja', name: 'Belanja', type: 'expense' }, { id: 'hiburan', name: 'Hiburan', type: 'expense' },
  { id: 'gaji', name: 'Gaji', type: 'income' }, { id: 'lembur', name: 'Lembur', type: 'income' },
];
const base = { today: '2026-09-26', wallets: [{ id: 'bca', name: 'BCA' }, { id: 'gopay', name: 'GoPay' }], history: [] };
const read = (text, categories = templates, history = []) => { const r = parseQuickText(text, { ...base, categories, history }); return r && { kind: r.kind, category: r.preset.subcategoryId || r.preset.categoryId || null, why: r.why }; };
const cat = (text, categories, history) => read(text, categories, history)?.category;

test('"air" is read from its context: a drink, or the water bill', () => {
  for (const text of ['beli air 5rb', 'air 8rb di alfa', 'beli air galon 20rb', 'air mineral 2 botol 10rb']) assert.equal(cat(text), 'expense.makan-minum.kopi-minuman', text);
  for (const text of ['bayar air 150rb', 'tagihan air 180rb', 'air pdam 120rb', 'air 200rb']) assert.equal(cat(text), 'expense.tagihan.air', text);
  assert.match(read('beli air 5rb').why, /air.*minuman/);
  // With only a main "Tagihan" and "Makan & Minum" of one's own.
  assert.deepEqual(['beli air 5rb', 'bayar air 150rb'].map(text => cat(text, own)), ['makan', 'tagihan']);
  // An airline, a pump, a fryer are none of the two.
  assert.notEqual(cat('tiket batik air 900rb'), 'expense.tagihan.air');
});
test('the same word means different things next to different words', () => {
  const cases = {
    'tiket kereta 150rb': 'expense.transportasi.kereta', 'tiket konser 800rb': 'expense.nongkrong-hiburan.konser', 'tiket pesawat 1,2jt': 'expense.transportasi.pesawat',
    'grab 25rb': 'expense.transportasi', 'grabfood 60rb': 'expense.makan-minum.delivery', 'gojek makan 45rb': 'expense.makan-minum.delivery', 'ojek 15rb': 'expense.transportasi.ojek',
    'ayam goreng 20rb': 'expense.makan-minum', 'ayam 1 kg 40rb': 'expense.makan-minum.bahan-makanan', 'beras 5kg 70rb': 'expense.makan-minum.bahan-makanan',
    'servis motor 150rb': 'expense.kendaraan.service', 'servis hp 300rb': 'expense.belanja', 'cuci motor 20rb': 'expense.kendaraan.cuci-kendaraan', 'laundry 35rb': 'expense.rumah-kebutuhan.laundry',
    'obat 20rb': 'expense.kesehatan.obat', 'obat nyamuk 15rb': 'expense.rumah-kebutuhan', 'beli bunga 100rb': 'expense.sosial-sedekah.hadiah', 'bunga pinjaman 200rb': 'expense.biaya-keuangan.bunga-biaya',
    'token 50rb': 'expense.tagihan.listrik', 'pulsa 50rb': 'expense.tagihan.pulsa', 'kuota 100rb': 'expense.tagihan.paket-data', 'sewa motor 100rb': 'expense.transportasi.sewa-kendaraan', 'bayar kos 1,5jt': 'expense.tagihan.sewa-kost',
    'netflix 54rb': 'expense.langganan.film-streaming', 'spotify 55rb': 'expense.langganan.musik', 'kondangan 100rb': 'expense.sosial-sedekah.pernikahan', 'makan siang 30rb': 'expense.makan-minum.makan-siang',
    'baju 150rb': 'expense.belanja.pakaian', 'sepatu 400rb': 'expense.belanja.sepatu', 'pajak motor 250rb': 'expense.kendaraan.pajak-kendaraan', 'makanan kucing 60rb': null,
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(cat(text) ?? null, expected, text);
});
test('money in or out is read from the words around it', () => {
  for (const text of ['gaji 7,5jt', 'bonus 1jt', 'thr 5jt', 'lembur 500rb', 'komisi 300rb', 'honor ngajar 300rb', 'jual sepatu 300rb', 'dividen 150rb', 'bunga deposito 50rb', 'cashback 10rb', 'refund tiket 500rb', 'dapat hadiah 100rb', 'terima patungan 50rb', 'masuk 500rb']) assert.equal(flowOf(text), 'income', text);
  // Paying the people who work for you, entry fees, loan interest, flowers, rent: spending.
  for (const text of ['gaji art 1,5jt', 'bayar gaji pembantu 1,8jt', 'thr art 500rb', 'kasih thr bibi 300rb', 'tiket masuk 50rb', 'obat masuk angin 20rb', 'beli bunga 100rb', 'bunga pinjaman 200rb', 'kos 1,5jt', 'hadiah 100rb', 'beli pulsa pakai cashback 20rb']) assert.equal(flowOf(text), 'expense', text);
  assert.deepEqual(read('gaji art 1,5jt'), { kind: 'expense', category: 'expense.rumah-kebutuhan', why: '“gaji art” dibaca sebagai asisten rumah tangga' });
  assert.equal(read('bunga pinjaman 200rb').kind, 'expense');
});
test('income lands in the matching income category', () => {
  const cases = { 'gaji 7,5jt masuk bca': 'income.gaji', 'gajian 8jt': 'income.gaji.gaji-bulanan', 'lembur 500rb': 'income.gaji.lembur', 'bonus 1jt': 'income.gaji.bonus', 'thr 5jt': 'income.gaji.tunjangan', 'komisi 300rb': 'income.penghasilan-tambahan.komisi', 'jual sepatu 300rb': 'income.penghasilan-tambahan.penjualan', 'dividen 150rb': 'income.penghasilan-keuangan.dividen', 'bunga deposito 50rb': 'income.penghasilan-keuangan.bunga', 'cashback 10rb': 'income.penghasilan-keuangan.cashback', 'refund tiket 500rb': 'income.uang-kembali-dari-orang.pengembalian-uang', 'terima patungan 50rb': 'income.uang-kembali-dari-orang.patungan' };
  for (const [text, expected] of Object.entries(cases)) assert.equal(cat(text), expected, text);
  // Own names: a THR with no THR category goes to the salary one.
  assert.deepEqual(['thr 5jt', 'lembur 300rb'].map(text => cat(text, own)), ['gaji', 'lembur']);
});
test('a subcategory is chosen when it fits better, and its main category decides what an unclear name means', () => {
  assert.equal(cat('kopi susu 25rb', own), 'kopi');
  assert.equal(cat('makan malam 50rb', own), 'makan');
  // "Air" under Makan & Minum is drinking water; under Tagihan it is the water bill.
  const drinkingWater = [...own, { id: 'airminum', name: 'Air', type: 'expense', parentId: 'makan' }];
  assert.equal(cat('beli air 5rb', drinkingWater), 'airminum');
  const waterBill = [...own, { id: 'pdam', name: 'Air', type: 'expense', parentId: 'tagihan' }];
  assert.deepEqual(['beli air 5rb', 'bayar air 150rb'].map(text => cat(text, waterBill)), ['makan', 'pdam']);
});
test('the person’s own habits count: the same item, place or words as before', () => {
  // Someone who always files "air" under Tagihan keeps getting Tagihan, even for a small amount.
  const bills = [1, 2, 3].map(() => ({ type: 'expense', description: 'Air', merchant: '', categoryId: 'tagihan', subcategoryId: null }));
  assert.equal(cat('air 10rb', own, bills), 'tagihan');
  assert.match(read('air 10rb', own, bills).why, /sebelumnya/);
  // A place they shop at for one category.
  const shop = [1, 2].map(() => ({ type: 'expense', description: 'Belanja', merchant: 'Toko Jaya', categoryId: 'belanja', subcategoryId: null }));
  assert.equal(cat('sesuatu 50rb di toko jaya', own, shop), 'belanja');
  // Words they used before for a category ("galon" → Makan & Minum).
  const galon = [{ type: 'expense', description: 'Galon Aqua', merchant: '', categoryId: 'makan', subcategoryId: null }, { type: 'expense', description: 'Isi galon', merchant: '', categoryId: 'makan', subcategoryId: null }];
  assert.equal(cat('galon 20rb', own, galon), 'makan');
});
