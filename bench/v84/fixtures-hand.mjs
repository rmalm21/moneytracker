/**
 * 8.4 chat v4 — hand-written: messy chat sentences written one by one (not from the templates in cases.mjs), on the
 * v3 bench account. Written before the v4 engine. Same checks as cases.mjs.
 */
import * as O from '../v83/oracle.mjs';
const M = O.money, P = O.PERIODS;
const Q = (any, extra = {}) => ({ any: Array.isArray(any) ? any : [any], notRecord: true, notUnknown: true, ...extra });
const R = (kind, total, extra = {}) => ({ record: { kind, total, ...extra } });
const top = per => O.parents(P[per]);

const raw = [
  // Receivables and debts, any way of writing them
  ['owed', ['516rb piutang'], R('receivable_new', 516000)],
  ['owed', ['516rb piutang ke yudi'], R('receivable_new', 516000, { person: 'yudi' })],
  ['owed', ['piutang yudi 516rb'], R('receivable_new', 516000, { person: 'yudi' })],
  ['owed', ['yudi pinjem duit 200rb buat bayar kos'], R('receivable_new', 200000, { person: 'yudi' })],
  ['owed', ['td dipinjem mas agus 50rb'], R('receivable_new', 50000, { person: 'agus' })],
  ['owed', ['adik minjem 100k'], R('receivable_new', 100000, { person: 'adik' })],
  ['owed', ['aku nalangin makan siang nia 45rb'], R('receivable_new', 45000, { person: 'nia' })],
  ['owed', ['kasbon pak rt 300rb'], R('receivable_new', 300000)],
  ['owed', ['minjem 1jt ke mama'], R('debt_new', 1000000, { person: 'mama' })],
  ['owed', ['ngutang ke warung 35rb'], R('debt_new', 35000, { person: 'warung' })],
  ['owed', ['dipinjemin kak lia 500rb'], R('debt_new', 500000, { person: 'lia' })],
  ['owed', ['850rb utang ke koperasi'], R('debt_new', 850000, { person: 'koperasi' })],
  ['owed', ['hutang 250rb'], R('debt_new', 250000)],
  ['owed', ['catet piutang 75rb ya'], R('receivable_new', 75000)],
  // The person in the next message
  ['owedWho', ['piutang 516rb', 'yudi'], R('receivable_new', 516000, { person: 'yudi' })],
  ['owedWho', ['516rb piutang', 'yg minjem nia'], R('receivable_new', 516000, { person: 'nia' })],
  ['owedWho', ['ngutang 60rb', 'ke bang ojan'], R('debt_new', 60000, { person: 'ojan' })],
  ['owedWho', ['utang 2jt', 'sama om heru'], R('debt_new', 2000000, { person: 'heru' })],
  ['owedWho', ['pinjemin 150rb', 'ke citra'], R('receivable_new', 150000, { person: 'citra' })],
  // Starting a record, the rest after
  ['startRecord', ['catat pengeluaran', 'nasi padang 28rb'], R('expense', 28000, { has: ['nasi padang'] })],
  ['startRecord', ['mau nyatet nih', '50rb', 'beli obat'], R('expense', 50000, { has: ['obat'] })],
  ['startRecord', ['tolong catetin ya', 'laundry 40rb'], R('expense', 40000, { has: ['laundry'] })],
  ['startRecord', ['tadi beli galon', '20rb'], R('expense', 20000, { has: ['galon'] })],
  ['startRecord', ['catat pemasukan', 'freelance 750rb'], R('income', 750000)],
  ['startRecord', ['barusan isi bensin', '45 ribu'], R('expense', 45000, { has: ['bensin'] })],
  ['startRecord', ['catat dong', '35rb', 'potong rambut'], R('expense', 35000, { has: ['potong rambut'] })],
  // Transfers finished in the next message
  ['transferTo', ['transfer 300rb', 'ke gopay'], { record: { kind: 'transfer', total: 300000, has: ['gopay'] } }],
  ['transferTo', ['tf 1jt dari jago', 'ke jenius'], { record: { kind: 'transfer', total: 1000000, has: ['jenius'] } }],
  ['transferTo', ['top up gopay 100rb', 'dari jago'], { record: { kind: 'transfer', total: 100000, has: ['jago'] } }],
  // Follow-ups to a spending question
  ['askMore', ['pengeluaran bulan ini berapa', 'rinciin dong'], Q([`${top('bulan ini')[0].name}[^]*${M(top('bulan ini')[0].amount)}`])],
  ['askMore', ['bulan ini habis berapa', 'paling banyak kemana?'], Q([top('bulan ini')[0].name])],
  ['askMore', ['pengeluaran bulan ini', 'lebih boros dari bulan lalu ga?'], Q(['\\d+\\s?%', 'naik', 'turun', 'lebih (?:banyak|sedikit|hemat|boros)', M(O.spend(P['bulan lalu']))])],
  ['askMore', ['minggu ini keluar berapa', 'kok banyak ya'], Q([top('minggu ini')[0].name, top('minggu ini')[1].name])],
  ['askMore', ['pengeluaran bulan lalu berapa', 'apa aja tuh'], Q([`${top('bulan lalu')[0].name}[^]*${M(top('bulan lalu')[0].amount)}`])],
  ['askMore', ['pengeluaran makan bulan ini berapa', 'kalau transport?'], Q([M(O.spend(P['bulan ini'], t => O.inCategory(t, 'expense.transportasi')))])],
  ['askMore', ['pemasukan bulan ini berapa', 'kalau bulan lalu?'], Q([M(O.income(P['bulan lalu']))])],
  // About what was just answered
  ['aboutIt', ['dimas utang brp', 'dia janji bayar kapan'], Q(['30 Okt'])],
  ['aboutIt', ['piutang budi', 'udah dibayar blm'], Q(['belum', M(100000)])],
  ['aboutIt', ['cicilan hp', 'sisa berapa bulan lagi'], Q(['6 bulan', '\\b6\\b'])],
  ['aboutIt', ['klaim taksi gimana', 'berapa nominalnya'], Q([M(180000)])],
  ['aboutIt', ['saldo gopay', 'cukup buat makan seminggu ga'], Q(['cukup', 'kurang', 'aman', M(O.BALANCE.gopay)])],
  // From a list
  ['fromList', ['siapa aja yg punya utang ke aku', 'yg paling lama siapa'], Q(['Dimas'])],
  ['fromList', ['tagihan terdekat', 'brp'], Q([M(55000)])],
  ['fromList', ['klaim kantor apa aja', 'yang paling gede'], Q(['Bandung', M(420000)])],
  ['fromList', ['piutang aku siapa aja', 'totalnya?'], Q([M(400000)])],
  // Everyday
  ['everyday', ['tgl brp skrg'], Q(['15 Okt', '15 Oktober'])],
  ['everyday', ['jam brp nih'], Q(['\\d{1,2}[.:]\\d{2}', 'jam \\d'])],
  ['everyday', ['pagi min'], Q(['pagi', 'halo', 'hai'])],
  ['everyday', ['met malem'], Q(['malam', 'halo', 'hai'])],
  ['everyday', ['bisa dibikin excel ga datanya'], Q(['CSV', 'Excel'])],
  ['everyday', ['aku lupa pin aplikasi'], Q(['PIN', 'kunci', 'Keamanan'])],
  ['everyday', ['batalin catatan terakhir'], Q(['hapus', 'batal', 'terakhir'])],
  ['everyday', ['duitku cukup ga sampe gajian'], Q(['gajian', 'uang bebas', M(O.FREE)])],
  ['everyday', ['sekarang hari apa'], Q(['Kamis'])],
  ['everyday', ['gajian kapan sih'], Q(['24', 'gajian'])],
  // Old abilities stay
  ['keep', ['kopi 25rb'], R('expense', 25000)],
  ['keep', ['beli bensin 50rb pakai gopay'], R('expense', 50000)],
  ['keep', ['gaji 8jt masuk jago'], R('income', 8000000)],
  ['keep', ['sari bayar 50rb'], R('receivable_payment', 50000)],
  ['keep', ['kopi 25rb', 'eh 28rb'], R('expense', 28000)],
  ['keep', ['makan siang 30rb', 'sama es jeruk 8rb'], R('expense', 8000, { has: ['es jeruk'] })],
  ['keep', ['saldo jago berapa', 'kalau gopay?'], Q([M(O.BALANCE.gopay)])],
  ['keep', ['uang bebasku berapa'], Q([M(O.FREE)])],
];
export const cases = raw.map(([fam, turns, check], i) => ({ id: `hand-${i + 1}`, fam, voice: ['santai', 'gaul', 'sopan', 'singkat', 'barbar'][i % 5], turns: turns.map((say, j) => ({ say, check: j === turns.length - 1 ? check : {} })) }));
