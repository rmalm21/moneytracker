/**
 * Catat otomatis V4 — development set (A): math, sharing with people, one purchase for several purposes, and sentences
 * that must stay as they are. Used while building V4. State: fixtures-v68state.mjs (the real default taxonomy,
 * Thu 15 Oct 2026, 15:00, default wallet Jago).
 *
 * Truth conventions:
 *   amount  the money of the action: for a Split Bill the total paid; for "my share only" the share.
 *   split   true = a Split Bill (you paid the total, the others owe their shares); false = no Split Bill.
 *   share   your share in the Split Bill (Split Bill engine shares: 162.003 / 2 → 81.002 for you, 81.001 for Ferdi).
 *   people  the other participants, in the order written.   payer  who paid when it was not you.
 *   lines   one purchase allocated to several categories: [category, amount] in the order written (parent accepted).
 * Division rounds to whole rupiah at the end ("128181 dibagi 3 dikali 2" = 85.454).
 */
import { C } from './fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', SOSIAL = 'expense.sosial-sedekah', KERJA = 'expense.kerja', RUMAH = 'expense.rumah-kebutuhan';
const MINUM = C('Kopi & Minuman'), JAJAN = C('Jajan'), FAST = C('Fast Food');

export const cases = [
  // 1. Math said in the sentence: the amount is the result.
  { id: 'm1', group: 'matematika', text: '128181 dibagi 3 dikali 2', expect: { amount: 85454 } },
  { id: 'm2', group: 'matematika', text: 'makan 128181 dibagi 3 dikali 2', expect: { amount: 85454, cat: FOOD } },
  { id: 'm3', group: 'matematika', text: 'kopi 3 x 18rb', expect: { amount: 54000, cat: MINUM } },
  { id: 'm4', group: 'matematika', text: 'kopi 18rb x 3', expect: { amount: 54000, cat: MINUM } },
  { id: 'm5', group: 'matematika', text: 'beli pulsa 2x 25rb', expect: { amount: 50000, cat: C('Pulsa') } },
  { id: 'm6', group: 'matematika', text: 'makan 50rb + 25rb', expect: { amount: 75000, cat: FOOD } },
  { id: 'm7', group: 'matematika', text: 'makan 100rb dikurangi 20rb', expect: { amount: 80000, cat: FOOD } },
  { id: 'm8', group: 'matematika', text: 'bensin 40rb ditambah 10rb', expect: { amount: 50000, cat: C('Bensin') } },
  { id: 'm9', group: 'matematika', text: 'setengah dari 80rb buat jajan', expect: { amount: 40000, cat: JAJAN } },
  { id: 'm10', group: 'matematika', text: 'separuh dari 700rb buat listrik', expect: { amount: 350000, cat: C('Listrik') } },
  { id: 'm11', group: 'matematika', text: 'sepertiga dari 90rb buat bensin', expect: { amount: 30000, cat: C('Bensin') } },
  { id: 'm12', group: 'matematika', text: 'jajan 150rb/3', expect: { amount: 50000, cat: JAJAN } },
  { id: 'm13', group: 'matematika', text: 'nasi padang 25rb*2', expect: { amount: 50000, cat: FOOD } },
  { id: 'm14', group: 'matematika', text: 'parkir 2000 x 3', expect: { amount: 6000, cat: C('Parkir') } },
  { id: 'm15', group: 'matematika', text: 'makan (50rb+30rb)/2', expect: { amount: 40000, cat: FOOD } },
  { id: 'm16', group: 'matematika', text: 'kopi 18rb kali 2', expect: { amount: 36000, cat: MINUM } },
  { id: 'm17', group: 'matematika', text: 'makan dua puluh ribu dikali tiga', expect: { amount: 60000, cat: FOOD } },
  { id: 'm18', group: 'matematika', text: '2,5jt dibagi 5 buat arisan', expect: { amount: 500000, cat: SOSIAL } },
  { id: 'm19', group: 'matematika', text: 'belanja 100rb - 15rb', expect: { amount: 85000 } },
  { id: 'm20', group: 'matematika', text: 'obat 120rb dibagi 4', expect: { amount: 30000, cat: C('Obat'), split: false } },

  // 2. Percent inside one purchase.
  { id: 'p1', group: 'persen', text: 'makan 100rb diskon 20%', expect: { amount: 80000, cat: FOOD } },
  { id: 'p2', group: 'persen', text: 'makan 200rb ppn 11%', expect: { amount: 222000, cat: FOOD } },
  { id: 'p3', group: 'persen', text: 'sepatu 500rb diskon 30%', expect: { amount: 350000, cat: C('Sepatu') } },
  { id: 'p4', group: 'persen', text: 'makan 150rb service 5% pajak 10%', expect: { amount: 172500, cat: FOOD } },
  { id: 'p5', group: 'persen', text: '10% dari 2jt buat zakat', expect: { amount: 200000, cat: SOSIAL } },
  { id: 'p6', group: 'persen', text: 'bensin 100rb cashback 10%', expect: { amount: 90000, cat: C('Bensin') } },
  { id: 'p7', group: 'persen', text: 'kopi 25rb tip 10%', expect: { amount: 27500, cat: MINUM } },

  // 3. Shared with people. Named people + a dividing word → Split Bill; a count alone → only your share.
  { id: 's1', group: 'bagi orang', text: 'hokben 162.003 dibagi2 sama ferdi', expect: { amount: 162003, split: true, share: 81002, people: ['ferdi'], cat: FAST } },
  { id: 's2', group: 'bagi orang', text: 'hokben 162.003 dibagi 2 sama ferdi', expect: { amount: 162003, split: true, share: 81002, people: ['ferdi'], cat: FAST } },
  { id: 's3', group: 'bagi orang', text: 'makan 90rb dibagi 3 sama ferdi dan rina', expect: { amount: 90000, split: true, share: 30000, people: ['ferdi', 'rina'], cat: FOOD } },
  { id: 's4', group: 'bagi orang', text: 'bensin 100rb patungan sama ferdi', expect: { amount: 100000, split: true, share: 50000, people: ['ferdi'], cat: C('Bensin') } },
  { id: 's5', group: 'bagi orang', text: 'pizza 120rb bagi rata sama ferdi rina dan budi', expect: { amount: 120000, split: true, share: 30000, people: ['ferdi', 'rina', 'budi'] } },
  { id: 's6', group: 'bagi orang', text: 'makan 90rb bertiga, patungan', expect: { amount: 30000, split: false, cat: FOOD } },
  { id: 's7', group: 'bagi orang', text: 'kos 1,8jt dibagi bertiga', expect: { amount: 600000, split: false } },
  { id: 's8', group: 'bagi orang', text: 'listrik 400rb dibagi 2 sama adik', expect: { amount: 400000, split: true, share: 200000, people: ['adik'], cat: C('Listrik') } },
  { id: 's9', group: 'bagi orang', text: 'nonton 100rb, ferdi yang bayar, dibagi 2', expect: { amount: 100000, split: true, share: 50000, people: ['ferdi'], payer: 'ferdi' } },
  { id: 's10', group: 'bagi orang', text: 'makan 150rb ber-3 masing2 50rb', expect: { amount: 50000, split: false, cat: FOOD } },
  { id: 's11', group: 'bagi orang', text: 'patungan kado buat rina 200rb ber-5', expect: { amount: 40000, split: false } },
  { id: 's12', group: 'bagi orang', text: 'bayar wifi 300rb split sama ferdi', expect: { amount: 300000, split: true, share: 150000, people: ['ferdi'], cat: C('Internet') } },
  { id: 's13', group: 'bagi orang', text: 'grab 60rb dibagi dua sama rina', expect: { amount: 60000, split: true, share: 30000, people: ['rina'], cat: 'expense.transportasi' } },
  { id: 's14', group: 'bagi orang', text: 'makan 75rb, aku sama ferdi bagi dua', expect: { amount: 75000, split: true, share: 37500, people: ['ferdi'], cat: FOOD } },
  { id: 's15', group: 'bagi orang', text: 'makan 150rb bagi rata bertiga gue atuy budi', expect: { amount: 150000, split: true, share: 50000, people: ['atuy', 'budi'], cat: FOOD } },
  { id: 's16', group: 'bagi orang', text: 'makan 120rb berempat', expect: { amount: 120000, split: false, cat: FOOD } },
  { id: 's17', group: 'bagi orang', text: 'makan berempat masing-masing 35rb, aku bayarin semua', expect: { amount: 140000, split: false, cat: FOOD } },

  // 4. One purchase, several purposes: one expense with category lines.
  { id: 'a1', group: 'alokasi', text: 'hokben 162.003 dibagi 2, satu untuk gue makan biasa, satu lagi traktir teman', expect: { amount: 162003, lines: [[FOOD, 81002], [SOSIAL, 81001]] } },
  { id: 'a2', group: 'alokasi', text: 'hokben 162.003 dibagi 2, setengah makan aku setengah sedekah', expect: { amount: 162003, lines: [[FOOD, 81002], [C('Sedekah'), 81001]] } },
  { id: 'a3', group: 'alokasi', text: 'indomaret 120rb: 80rb makanan, 40rb sabun', expect: { amount: 120000, lines: [[FOOD, 80000], [RUMAH, 40000]] } },
  { id: 'a4', group: 'alokasi', text: 'makan 100rb, setengahnya buat traktir rina', expect: { amount: 100000, lines: [[FOOD, 50000], [SOSIAL, 50000]] } },
  { id: 'a5', group: 'alokasi', text: 'bensin 100rb, 30rb nya buat kantor', expect: { amount: 100000, lines: [[C('Bensin'), 70000], [KERJA, 30000]] } },
  { id: 'a6', group: 'alokasi', text: 'belanja bulanan 500rb, 60% bahan makanan 40% kebutuhan rumah', expect: { amount: 500000, lines: [[C('Bahan Makanan'), 300000], [C('Kebutuhan Rumah'), 200000]] } },
  { id: 'a7', group: 'alokasi', text: 'kado 300rb dibagi 2, satu buat ulang tahun ibu satu buat pernikahan teman', expect: { amount: 300000, lines: [[C('Ulang Tahun'), 150000], [C('Pernikahan'), 150000]] } },
  { id: 'a8', group: 'alokasi', text: 'makan 90rb, 30rb makan gue, 60rb traktir ferdi dan rina', expect: { amount: 90000, lines: [[FOOD, 30000], [SOSIAL, 60000]] } },

  // 5. Must stay as they are: no math, no split.
  { id: 't1', group: 'jangan diubah', text: 'kopi 2 gelas 36rb', expect: { amount: 36000, cat: MINUM } },
  { id: 't2', group: 'jangan diubah', text: 'bensin 50rb + parkir 5rb', expect: { actions: [{ amount: 50000, cat: C('Bensin') }, { amount: 5000, cat: C('Parkir') }] } },
  { id: 't3', group: 'jangan diubah', text: 'beli kaos xl 80rb', expect: { amount: 80000 } },
  { id: 't4', group: 'jangan diubah', text: 'tiket xxi 50rb', expect: { amount: 50000 } },
  { id: 't5', group: 'jangan diubah', text: 'transfer 100rb ke gopay', expect: { kind: 'transfer', amount: 100000, to: 'gopay' } },
  { id: 't6', group: 'jangan diubah', text: 'makan kurang lebih 50rb', expect: { amount: 50000, cat: FOOD } },
  { id: 't7', group: 'jangan diubah', text: 'bayar 2 bulan kos 1,8jt', expect: { amount: 1800000 } },
  { id: 't8', group: 'jangan diubah', text: 'isi bensin 30rb tadi jam 7-8', expect: { amount: 30000, cat: C('Bensin') } },
  { id: 't9', group: 'jangan diubah', text: 'pulsa 50rb tgl 14/10', expect: { amount: 50000, date: '2026-10-14' } },
  { id: 't10', group: 'jangan diubah', text: 'kali ini makan 40rb', expect: { amount: 40000, cat: FOOD } },
  { id: 't11', group: 'jangan diubah', text: 'nonton bertiga 150rb aku traktir semua', expect: { amount: 150000, split: false } },
  { id: 't12', group: 'jangan diubah', text: 'makan 2 porsi 30rb', expect: { amount: 30000, cat: FOOD } },
  { id: 't13', group: 'jangan diubah', text: 'laundry 3kg 21rb', expect: { amount: 21000 } },
  { id: 't14', group: 'jangan diubah', text: 'bayar utang ke rudi 100rb', expect: { kind: 'debt_payment', amount: 100000 } },
  { id: 't15', group: 'jangan diubah', text: 'makan 50rb, kopi 20rb', expect: { actions: [{ amount: 50000, cat: FOOD }, { amount: 20000, cat: MINUM }] } },
  { id: 't16', group: 'jangan diubah', text: 'jajan 15k-an', expect: { amount: 15000, cat: JAJAN } },

  // 6. Added after the first 68 passed (post-hoc, from the user's own sentence and a round of new phrasings).
  { id: 'x1', group: 'alokasi', text: 'hokben 162.003 dibagi 2, satu untuk gue expense makan biasa, satu lagi entertain/traktir teman/sedekah', expect: { amount: 162003, lines: [[FOOD, 81002], [SOSIAL, 81001]] } },
  { id: 'x2', group: 'bagi orang', text: 'ferdi bayarin makan 90rb, aku hutang setengah', expect: { amount: 90000, split: true, share: 45000, people: ['ferdi'], payer: 'ferdi', cat: FOOD } },
  { id: 'x3', group: 'bagi orang', text: 'makan 300rb kita berlima', expect: { amount: 300000, split: false, cat: FOOD } },
  { id: 'x4', group: 'alokasi', text: 'belanja 200rb, 150rb buat makan, sisanya sabun', expect: { amount: 200000, lines: [[FOOD, 150000], [RUMAH, 50000]] } },
  { id: 'x5', group: 'bagi orang', text: 'kado 300rb 50:50 sama rina', expect: { amount: 300000, split: true, share: 150000, people: ['rina'] } },
  { id: 'x6', group: 'bagi orang', text: 'makan 100rb aku 60rb ferdi 40rb', expect: { amount: 100000, split: true, share: 60000, people: ['ferdi'], cat: FOOD } },
  { id: 'x7', group: 'jangan diubah', text: 'bayar kos 1.5jt 2 bulan', expect: { amount: 1500000 } },
  { id: 'x8', group: 'bagi orang', text: 'rina yang bayar sushi 250rb aku 150rb rina 100rb', expect: { amount: 250000, split: true, share: 150000, people: ['rina'], payer: 'rina' } },
  { id: 'x9', group: 'matematika', text: '128181 dibagi 3 dikali 2 ditambah 5000 dikurangi 2000', expect: { amount: 88454 } },
  { id: 'x10', group: 'matematika', text: 'makan (50rb+30rb)/2', expect: { amount: 40000, cat: FOOD } },
  { id: 'x11', group: 'alokasi', text: 'bensin 100rb, 30rb nya buat kantor sisanya pribadi', expect: { amount: 100000, lines: [[C('Bensin'), 70000], [KERJA, 30000]] } },
];
