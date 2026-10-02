/**
 * Catat otomatis V3.3 — contextual reasoning development set (v33-dev): state in, state change out.
 *
 * Starting state: fixtures-v33state.mjs (Atuy owes 12.000, Dina twice, Sinta 250.000; debts Rudi 400.000 and Aldi
 * 100.000; claims Dinas Surabaya and Makan kantor 100.000; recent entries t1 Cotti 19.000 Jago today 13:12, t2 Parkir 2.000
 * Cash today, t3 Makan 20.000 GoPay yesterday, t4 transfer Jago → Mandiri 100.000 today; plan WiFi 121.000 today;
 * schedule Spotify 30.000 on the 20th). Development data: V3.3 was tuned on it.
 *
 * expect: ops (operation per action, in order; "SETTLE?" = settle of unknown size) · money {wallet: delta, '' = default
 * wallet} · rel {record id: remaining after} · created {"receivable:Name"|"debt:Name"|"claim:new": remaining} · updates ·
 * deletes · schedules · recurring · plansDone · target · warn (Bug Catcher codes) · ask · review · duplicate · confirm ·
 * cash (wallet-moving entries; more = money counted twice) · query (text in the answer) · actions (parser fields).
 */
import { at, ctx as state } from './fixtures-v33state.mjs';
const T = '2026-10-15', Y = '2026-10-14', TM = '2026-10-16';
const now = state.nowMs;
const parkir2 = { id: 't5', type: 'expense', amount: 3_000, date: T, time: '11:40', walletId: 'cash', destinationWalletId: null, categoryId: 'trans', subcategoryId: 'park', merchant: '', description: 'Parkir', createdMs: at(T, '11:40') };
const fore = { id: 't6', type: 'expense', amount: 18_000, date: T, time: '08:10', walletId: 'gopay', destinationWalletId: null, categoryId: 'food', subcategoryId: 'drink', merchant: 'Fore', description: 'Kopi', createdMs: at(T, '08:10') };

/** [id, tags, text, expect, state override] */
const raw = [
  // Settlement against the open record
  ['s01', ['partial', 'remaining', 'required'], 'atuy bayar 5k', { ops: ['PARTIAL_SETTLE'], rel: { ra: 7000 }, money: { '': 5000 }, target: 'ra', cash: 1 }],
  ['s02', ['settle'], 'atuy bayar 12k', { ops: ['SETTLE'], rel: { ra: 0 }, money: { '': 12000 }, target: 'ra' }],
  ['s03', ['overpay', 'required'], 'atuy bayar 15k', { ops: ['SETTLE'], warn: ['PAYMENT_EXCEEDS_REMAINING_BALANCE'], review: true, ask: 'amount' }],
  ['s04', ['partial', 'remaining', 'plan', 'required'], 'atuy bayar 5k sisanya besok', { ops: ['PARTIAL_SETTLE', 'SCHEDULE'], rel: { ra: 7000 }, money: { '': 5000 }, schedules: [{ amount: 7000, date: TM }] }],
  ['s05', ['partial', 'remaining'], 'atuy bayar setengah dulu', { ops: ['PARTIAL_SETTLE'], rel: { ra: 6000 }, money: { '': 6000 } }],
  ['s06', ['settle'], 'atuy lunasin', { ops: ['SETTLE'], rel: { ra: 0 }, money: { '': 12000 } }],
  ['s07', ['partial', 'remaining', 'plan'], 'sinta bayar 50rb sisanya minggu depan', { ops: ['PARTIAL_SETTLE', 'SCHEDULE'], rel: { r1: 200000 }, money: { '': 50000 }, schedules: [{ amount: 200000 }] }],
  ['s08', ['ambiguous'], 'dina bayar 20k', { ops: ['SETTLE?'], ask: 'link', review: true, money: { '': 20000 } }],
  ['s09', ['partial'], 'bayar utang ke aldi 50k', { ops: ['PARTIAL_SETTLE'], rel: { d2: 50000 }, money: { '': -50000 }, target: 'd2' }],
  ['s10', ['settle'], 'gue lunasin utang ke aldi', { ops: ['SETTLE'], rel: { d2: 0 }, money: { '': -100000 } }],
  ['s11', ['claim', 'partial', 'required'], 'claim makan cair 60k', { ops: ['PARTIAL_SETTLE'], rel: { c2: 40000 }, money: { '': 60000 }, target: 'c2' }],
  ['s12', ['claim', 'settle'], 'klaim makan kantor cair 100rb', { ops: ['SETTLE'], rel: { c2: 0 }, money: { '': 100000 } }],
  ['s13', ['claim', 'overpay'], 'claim makan cair 150k', { ops: ['SETTLE'], warn: ['CLAIM_PAYMENT_EXCEEDS_REMAINING'], review: true }],
  // References inside the message
  ['n01', ['reference', 'partial', 'required'], 'atuy ngutang 20k terus dia bayar 5k', { ops: ['CREATE', 'PARTIAL_SETTLE'], created: { 'receivable:Atuy': 15000 }, money: { '': 5000 } }],
  ['n02', ['reference', 'ambiguous', 'required'], 'atuy ngutang 20k budi ngutang 10k terus dia bayar 5k', { ops: ['CREATE', 'CREATE', 'SETTLE?'], created: { 'receivable:Atuy': 20000, 'receivable:Budi': 10000 }, ask: 'person', review: true, money: { '': 5000 } }],
  ['n03', ['reference', 'talang', 'partial', 'required'], 'kmrn gue talangin atuy makan 50k pake jago terus tadi dia bayar 20k', { ops: ['CREATE', 'PARTIAL_SETTLE'], created: { 'receivable:Atuy': 30000 }, money: { jago: -50000, '': 20000 }, cash: 2, actions: [{ kind: 'receivable_new', date: Y, purpose: 'Makan' }, { kind: 'receivable_payment', date: T }] }],
  ['n04', ['reference', 'partial'], 'rudi minjem 100rb terus doi balikin 40rb', { ops: ['CREATE', 'PARTIAL_SETTLE'], created: { 'receivable:Rudi': 60000 }, money: { '': 40000 } }],
  // Existing records: update, delete, cancel
  ['h01', ['update', 'required'], 'ubah kopi cotti tadi jadi 25k', { ops: ['UPDATE'], target: 't1', updates: { t1: { amount: 25000 } }, money: { jago: -6000 } }],
  ['h02', ['update'], 'yang kopi cotti tadi ubah jadi 25k', { ops: ['UPDATE'], target: 't1', updates: { t1: { amount: 25000 } }, money: { jago: -6000 } }],
  ['h03', ['delete', 'required'], 'hapus parkir tadi', { ops: ['DELETE'], target: 't2', deletes: ['t2'], review: true }],
  ['h04', ['update'], 'yang kemarin harusnya 25 bukan 20', { ops: ['UPDATE'], target: 't3', updates: { t3: { amount: 25000 } }, money: { gopay: -5000 } }],
  ['h05', ['delete'], 'batalin transfer jago ke mandiri tadi', { ops: ['CANCEL'], target: 't4', deletes: ['t4'], review: true }],
  ['h06', ['delete'], 'hapus semua parkir hari ini', { ops: ['DELETE'], deletes: ['t2', 't5'], review: true }, { recent: [...state.recent, parkir2] }],
  ['h07', ['delete'], 'hapus yang terakhir', { ops: ['DELETE'], target: 't1', deletes: ['t1'], review: true }],
  ['h08', ['update'], 'ubah makan kemarin jadi pake jago', { ops: ['UPDATE'], target: 't3', updates: { t3: { wallet: 'jago' } }, money: { gopay: 20000, jago: -20000 } }],
  ['h09', ['update', 'ambiguous'], 'ubah kopi tadi jadi 20k', { ops: ['UPDATE'], ask: 'link', review: true }, { recent: [...state.recent, fore] }],
  ['h10', ['delete'], 'hapus bensin tadi', { ops: ['DELETE'], review: true }],
  // Questions
  ['q01', ['query', 'required'], 'atuy masih ngutang berapa', { ops: ['QUERY'], query: 'Rp12.000' }],
  ['q02', ['query'], 'siapa aja yang belum bayar', { ops: ['QUERY'], query: 'Sinta' }],
  ['q03', ['query'], 'sisa utang gue ke aldi berapa', { ops: ['QUERY'], query: 'Rp100.000' }],
  ['q04', ['query'], 'piutang gue total berapa', { ops: ['QUERY'], query: 'Rp342.000' }],
  ['q05', ['query'], 'klaim yang belum cair berapa', { ops: ['QUERY'], query: 'Rp1.300.000' }],
  // Arithmetic
  ['a01', ['arithmetic', 'required'], '3 kopi 18k satu', { ops: ['CREATE'], actions: [{ amount: 54000 }], money: { '': -54000 } }],
  ['a02', ['arithmetic'], '3 kopi @18k', { ops: ['CREATE'], actions: [{ amount: 54000 }], money: { '': -54000 } }],
  ['a03', ['arithmetic'], '2 tiket bioskop 50k per orang', { ops: ['CREATE'], actions: [{ amount: 100000 }], money: { '': -100000 } }],
  ['a04', ['arithmetic', 'required'], '3 kopi 18k', { ops: ['CREATE'], actions: [{ amount: 18000 }], money: { '': -18000 } }],
  ['a05', ['arithmetic'], 'beli 4 donat masing2 5rb', { ops: ['CREATE'], actions: [{ amount: 20000 }], money: { '': -20000 } }],
  // Composition
  ['c01', ['discount', 'required'], 'makan 100k diskon 20k jago', { ops: ['CREATE'], actions: [{ kind: 'expense', amount: 80000, wallet: 'jago' }], money: { jago: -80000 }, cash: 1 }],
  ['c02', ['discount', 'fee', 'required'], 'makan 100k diskon 20k service 5k jago', { ops: ['CREATE'], actions: [{ amount: 85000 }], money: { jago: -85000 }, cash: 1 }],
  ['c03', ['discount'], 'belanja 150k potongan 15k gopay', { ops: ['CREATE'], actions: [{ amount: 135000 }], money: { gopay: -135000 }, cash: 1 }],
  ['c04', ['cashback'], 'bensin 100k cashback 10k gopay', { ops: ['CREATE'], actions: [{ kind: 'expense', amount: 90000 }], money: { gopay: -90000 }, cash: 1 }],
  ['c05', ['cashback'], 'bensin 100k nanti dapet cashback 10k gopay', { ops: ['CREATE'], actions: [{ kind: 'expense', amount: 100000 }], money: { gopay: -100000 }, cash: 1 }],
  ['c06', ['fee'], 'makanan online 50k ongkir 10k gopay', { ops: ['CREATE'], actions: [{ amount: 60000 }], money: { gopay: -60000 }, cash: 1 }],
  ['c07', ['fee'], 'makan 100k pajak 10k', { ops: ['CREATE'], actions: [{ amount: 110000 }], money: { '': -110000 }, cash: 1 }],
  // Transfers with a fee
  ['t01', ['transfer', 'fee', 'required'], 'tf 100k jago ke mandiri admin 2500', { ops: ['TRANSFER'], money: { jago: -102500, mandiri: 100000 } }],
  ['t02', ['transfer', 'fee'], 'transfer 500rb dari jago ke bri biaya admin 6500', { ops: ['TRANSFER'], money: { jago: -506500, bri: 500000 } }],
  // Groups and Split Bill
  ['g01', ['group', 'required'], 'budi sama aldi masing2 ngutang 10k', { ops: ['CREATE', 'CREATE'], created: { 'receivable:Budi': 10000, 'receivable:Aldi': 10000 } }],
  ['g02', ['group', 'required'], 'budi sama aldi total ngutang 20k', { ops: ['CREATE', 'CREATE'], created: { 'receivable:Budi': 10000, 'receivable:Aldi': 10000 }, review: true }],
  ['g03', ['group'], 'nisa dan rian masing-masing pinjem 25rb', { ops: ['CREATE', 'CREATE'], created: { 'receivable:Nisa': 25000, 'receivable:Rian': 25000 } }],
  ['p01', ['split', 'required'], 'gue bayar makan 150k bagi rata bertiga gue atuy budi', { ops: ['SPLIT'], created: { 'receivable:Atuy': 50000, 'receivable:Budi': 50000 }, money: { '': -150000 }, cash: 1 }],
  ['p02', ['split'], 'makan 150k bertiga gue atuy budi', { ops: ['SPLIT'], created: { 'receivable:Atuy': 50000, 'receivable:Budi': 50000 }, money: { '': -150000 }, cash: 1 }],
  ['p03', ['split'], 'patungan pizza 120k berempat aku budi aldi nisa', { ops: ['SPLIT'], created: { 'receivable:Budi': 30000, 'receivable:Aldi': 30000, 'receivable:Nisa': 30000 }, money: { '': -120000 }, cash: 1 }],
  ['p04', ['split'], 'makan 150k buat gue atuy budi', { ops: ['CREATE'], money: { '': -150000 }, cash: 1 }],
  // Lending on someone's behalf, claims
  ['l01', ['talang', 'required'], 'kmrn gue talangin atuy makan 50k pake jago', { ops: ['CREATE'], created: { 'receivable:Atuy': 50000 }, money: { jago: -50000 }, cash: 1, actions: [{ kind: 'receivable_new', date: Y, purpose: 'Makan' }] }],
  ['l02', ['talang'], 'bayarin budi parkir 5rb pake gopay', { ops: ['CREATE'], created: { 'receivable:Budi': 5000 }, money: { gopay: -5000 }, cash: 1 }],
  ['k01', ['claim', 'required'], 'makan kantor 100k jago nanti direimburse', { ops: ['CREATE'], created: { 'claim:new': 100000 }, money: { jago: -100000 }, cash: 1, actions: [{ kind: 'claim_new' }] }],
  // Plans and schedules
  ['m01', ['plan', 'required'], 'besok bayar wifi 121k jam 7 malam', { ops: ['SCHEDULE'], schedules: [{ amount: 121000, date: TM, time: '19:00' }] }],
  ['m02', ['plan'], 'senin depan bayar kos 1,5jt', { ops: ['SCHEDULE'], schedules: [{ amount: 1500000 }] }],
  ['m03', ['plan'], 'wifi tadi udah gue bayar', { ops: ['CONFIRM'], plansDone: ['p1'], money: { jago: -121000 }, target: 'p1' }],
  ['m04', ['plan'], 'wifi 121k udah dibayar', { ops: ['CONFIRM'], plansDone: ['p1'], money: { jago: -121000 } }],
  ['r01', ['recurring', 'required'], 'wifi 121k tiap tgl 24 jam 7 malam', { ops: ['RECUR'], recurring: { new: { amount: 121000, date: '2026-10-24', time: '19:00' } } }],
  ['r02', ['recurring'], 'mulai bulan depan spotify jadi 35k', { ops: ['RECUR'], recurring: { s1: { amount: 35000, from: '2026-11-01' } } }],
  ['r03', ['recurring'], 'bulan depan stop spotify', { ops: ['STOP_RECURRING'], recurring: { s1: { stop: true, from: '2026-11-01' } } }],
  ['r04', ['recurring'], 'spotify naik jadi 40rb', { ops: ['RECUR'], recurring: { s1: { amount: 40000, from: '2026-10-20' } } }],
  // Duplicates (a warning, never a rejection)
  ['d01', ['duplicate', 'required'], 'kopi cotti 19k jago', { ops: ['CREATE'], duplicate: true, money: { jago: -19000 }, review: true }, { recent: [{ ...state.recent[0], createdMs: now - 10_000 }, ...state.recent.slice(1)] }],
  ['d02', ['duplicate'], 'kopi cotti 19k jago', { ops: ['CREATE'], duplicate: false, money: { jago: -19000 } }],
  ['d03', ['duplicate'], 'parkir 2rb', { ops: ['CREATE'], duplicate: true, money: { '': -2000 }, review: true }, { recent: [state.recent[0], { ...state.recent[1], createdMs: now - 30_000 }, ...state.recent.slice(2)] }],
  ['d04', ['duplicate'], 'kopi 19k gopay', { ops: ['CREATE'], duplicate: false, money: { gopay: -19000 } }, { recent: [{ ...state.recent[0], createdMs: now - 10_000 }, ...state.recent.slice(1)] }],
  // Plain numbers
  ['u01', ['unsuffixed', 'required'], 'kopi 20 jago bensin 80 krom', { ops: ['CREATE', 'CREATE'], actions: [{ amount: 20000, wallet: 'jago' }, { amount: 80000, wallet: 'krom' }], review: true, confirm: true, money: { jago: -20000, krom: -80000 } }],
  ['u02', ['unsuffixed'], 'bensin 30 krom', { ops: ['CREATE'], actions: [{ amount: 30000 }], review: true, money: { krom: -30000 } }],
  // Simple stays simple
  ['x01', ['simple'], 'makan 25k jago', { ops: ['CREATE'], money: { jago: -25000 }, review: false }],
  ['x02', ['simple'], 'gaji 5jt masuk jago', { ops: ['CREATE'], money: { jago: 5000000 } }],
];

export const cases = raw.map(([id, tags, text, expect, override]) => ({ id, tags, text, expect, ...(override ? { state: override } : {}), set: 'dev' }));
