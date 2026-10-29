/**
 * Catat otomatis V4 — held-out set (B). Written together with the development set, before the engine changed, with
 * different words, numbers and people; not looked at while building V4. Run once with --first to freeze the first
 * result. Same state and truth conventions as fixtures-v4dev.mjs.
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', SOSIAL = 'expense.sosial-sedekah', KERJA = 'expense.kerja', RUMAH = 'expense.rumah-kebutuhan';
const MINUM = C('Kopi & Minuman'), JAJAN = C('Jajan');

export const cases = [
  // Math.
  { id: 'hm1', group: 'matematika', text: 'makan 150rb dibagi 4', expect: { amount: 37500, cat: FOOD, split: false } },
  { id: 'hm2', group: 'matematika', text: 'uang makan 35rb kali 5 hari', expect: { amount: 175000, cat: FOOD } },
  { id: 'hm3', group: 'matematika', text: 'bayar parkir 3x 5rb', expect: { amount: 15000, cat: C('Parkir') } },
  { id: 'hm4', group: 'matematika', text: 'jajan 20rb tambah 15rb', expect: { amount: 35000, cat: JAJAN } },
  { id: 'hm5', group: 'matematika', text: 'bensin 200rb dikurang 50rb', expect: { amount: 150000, cat: C('Bensin') } },
  { id: 'hm6', group: 'matematika', text: '1/4 dari 400rb buat pulsa', expect: { amount: 100000, cat: C('Pulsa') } },
  { id: 'hm7', group: 'matematika', text: 'seperempat dari 2jt buat listrik', expect: { amount: 500000, cat: C('Listrik') } },
  { id: 'hm8', group: 'matematika', text: 'makan 45 ribu dikali 2', expect: { amount: 90000, cat: FOOD } },
  { id: 'hm9', group: 'matematika', text: 'kopi 22rb x 4', expect: { amount: 88000, cat: MINUM } },
  { id: 'hm10', group: 'matematika', text: 'martabak 60rb / 2', expect: { amount: 30000, cat: JAJAN } },
  { id: 'hm11', group: 'matematika', text: 'token listrik 100rb + 2500', expect: { amount: 102500, cat: C('Listrik') } },
  { id: 'hm12', group: 'matematika', text: '99.999 dibagi 3', expect: { amount: 33333 } },

  // Percent.
  { id: 'hp1', group: 'persen', text: 'baju 250rb diskon 40%', expect: { amount: 150000 } },
  { id: 'hp2', group: 'persen', text: 'makan 80rb pajak 10%', expect: { amount: 88000, cat: FOOD } },
  { id: 'hp3', group: 'persen', text: 'sepatu 400rb potongan 25%', expect: { amount: 300000, cat: C('Sepatu') } },
  { id: 'hp4', group: 'persen', text: 'servis motor 300rb diskon 15%', expect: { amount: 255000 } },
  { id: 'hp5', group: 'persen', text: '15% dari 1jt buat sedekah', expect: { amount: 150000, cat: C('Sedekah') } },

  // Shared with people.
  { id: 'hs1', group: 'bagi orang', text: 'makan 80rb dibagi 2 sama nisa', expect: { amount: 80000, split: true, share: 40000, people: ['nisa'], cat: FOOD } },
  { id: 'hs2', group: 'bagi orang', text: 'martabak 60rb patungan bertiga sama nisa dan aldi', expect: { amount: 60000, split: true, share: 20000, people: ['nisa', 'aldi'] } },
  { id: 'hs3', group: 'bagi orang', text: 'bayar kos 2,4jt dibagi berdua sama rina', expect: { amount: 2400000, split: true, share: 1200000, people: ['rina'] } },
  { id: 'hs4', group: 'bagi orang', text: 'taksi 90rb bagi tiga', expect: { amount: 30000, split: false } },
  { id: 'hs5', group: 'bagi orang', text: 'makan 200rb ber-4 patungan', expect: { amount: 50000, split: false, cat: FOOD } },
  { id: 'hs6', group: 'bagi orang', text: 'nonton 120rb dibagi dua sama pacar', expect: { amount: 120000, split: true, share: 60000, people: ['pacar'] } },
  { id: 'hs7', group: 'bagi orang', text: 'rina yang bayar makan 100rb, dibagi 2', expect: { amount: 100000, split: true, share: 50000, people: ['rina'], payer: 'rina' } },
  { id: 'hs8', group: 'bagi orang', text: 'sushi 300rb aku sama ferdi sama rina bagi rata', expect: { amount: 300000, split: true, share: 100000, people: ['ferdi', 'rina'], cat: FOOD } },
  { id: 'hs9', group: 'bagi orang', text: 'patungan bensin 150rb sama 2 teman', expect: { amount: 50000, split: false, cat: C('Bensin') } },
  { id: 'hs10', group: 'bagi orang', text: 'gojek 40rb split sama rina', expect: { amount: 40000, split: true, share: 20000, people: ['rina'] } },
  { id: 'hs11', group: 'bagi orang', text: 'mie ayam 33.333 bagi dua sama nisa', expect: { amount: 33333, split: true, share: 16667, people: ['nisa'], cat: FOOD } },

  // One purchase, several purposes.
  { id: 'ha1', group: 'alokasi', text: 'makan 120rb, separuh buat traktir nisa', expect: { amount: 120000, lines: [[FOOD, 60000], [SOSIAL, 60000]] } },
  { id: 'ha2', group: 'alokasi', text: 'bensin 80rb dibagi 2, satu pribadi satu kantor', expect: { amount: 80000, lines: [[C('Bensin'), 40000], [KERJA, 40000]] } },
  { id: 'ha3', group: 'alokasi', text: 'kado 200rb, 100rb buat ulang tahun nisa, 100rb buat pernikahan sepupu', expect: { amount: 200000, lines: [[C('Ulang Tahun'), 100000], [C('Pernikahan'), 100000]] } },
  { id: 'ha4', group: 'alokasi', text: 'belanja 400rb 75% bahan makanan 25% sabun', expect: { amount: 400000, lines: [[C('Bahan Makanan'), 300000], [RUMAH, 100000]] } },
  { id: 'ha5', group: 'alokasi', text: 'makan 60rb, 20rb punyaku 40rb traktir', expect: { amount: 60000, lines: [[FOOD, 20000], [SOSIAL, 40000]] } },
  { id: 'ha6', group: 'alokasi', text: 'hokben 90.001 dibagi 2 setengah buat aku setengah buat sedekah', expect: { amount: 90001, lines: [[FOOD, 45001], [C('Sedekah'), 45000]] } },

  // Must stay as they are.
  { id: 'ht1', group: 'jangan diubah', text: 'beli 3 donat 15rb', expect: { amount: 15000 } },
  { id: 'ht2', group: 'jangan diubah', text: 'nonton xxi 2 orang 100rb', expect: { amount: 100000, split: false } },
  { id: 'ht3', group: 'jangan diubah', text: 'kemeja ukuran xxl 150rb', expect: { amount: 150000 } },
  { id: 'ht4', group: 'jangan diubah', text: 'makan 30rb tanggal 13/10', expect: { amount: 30000, date: '2026-10-13', cat: FOOD } },
  { id: 'ht5', group: 'jangan diubah', text: 'bensin kurang lebih 25rb', expect: { amount: 25000, cat: C('Bensin') } },
  { id: 'ht6', group: 'jangan diubah', text: 'bayar listrik 2 bulan 700rb', expect: { amount: 700000, cat: C('Listrik') } },
  { id: 'ht7', group: 'jangan diubah', text: 'kopi 20rb plus roti 15rb', expect: { actions: [{ amount: 20000, cat: MINUM }, { amount: 15000 }] } },
  { id: 'ht8', group: 'jangan diubah', text: 'makan berdua 80rb aku yang traktir', expect: { amount: 80000, split: false } },
  { id: 'ht9', group: 'matematika', text: 'parkir 5rb, 2 kali', expect: { amount: 10000, cat: C('Parkir') } },
  { id: 'ht10', group: 'jangan diubah', text: 'beli 2 tiket 100rb', expect: { amount: 100000 } },
];
