/**
 * Catat otomatis V3.3 — first contextual held-out set (v33-heldout-first): new state, new sentences.
 *
 * Written after V3.3 was built and before it ran on these sentences; run once, first result frozen in
 * bench/quick/heldout-first/ (v33-v33heldout-*.json). Fixes made after that run turn it into development data.
 * Each case has its own starting state (on top of fixtures-v33state.mjs) and the state change expected.
 */
import { at, ctx as state } from './fixtures-v33state.mjs';
const T = '2026-10-15', Y = '2026-10-14', TM = '2026-10-16';
const now = state.nowMs;
const rec = (id, person, amount, description = '') => ({ id, person, description, remainingAmount: amount, originalAmount: amount, date: '2026-10-08' });
const tx = (id, amount, description, merchant, walletId, date, time, extra = {}) => ({ id, type: 'expense', amount, date, time, walletId, destinationWalletId: null, categoryId: 'food', subcategoryId: null, merchant, description, createdMs: at(date, time), ...extra });
const withRian = { receivables: [...state.receivables, rec('rr', 'Rian', 30_000, 'Bensin')] };
const withRecent = { recent: [tx('u1', 22_000, 'Mie Ayam', 'Bakmi GM', 'gopay', T, '12:40'), tx('u2', 5_000, 'Parkir', '', 'cash', T, '12:55', { categoryId: 'trans', subcategoryId: 'park' }), tx('u3', 35_000, 'Martabak', '', 'jago', Y, '20:10'), { id: 'u4', type: 'transfer', amount: 250_000, date: T, time: '07:30', walletId: 'bri', destinationWalletId: 'gopay', categoryId: null, subcategoryId: null, merchant: '', description: '', createdMs: at(T, '07:30') }] };

const raw = [
  ['e01', ['partial', 'remaining'], 'rian bayar 10rb', { ops: ['PARTIAL_SETTLE'], rel: { rr: 20000 }, money: { '': 10000 }, target: 'rr', cash: 1 }, withRian],
  ['e02', ['partial', 'remaining', 'plan', 'unsuffixed'], 'rian bayar 10 sisanya senin', { ops: ['PARTIAL_SETTLE', 'SCHEDULE'], rel: { rr: 20000 }, money: { '': 10000 }, schedules: [{ amount: 20000, date: '2026-10-19' }], review: true }, withRian],
  ['e03', ['settle'], 'rian udah lunasin utangnya', { ops: ['SETTLE'], rel: { rr: 0 }, money: { '': 30000 } }, withRian],
  ['e04', ['overpay'], 'rian bayar 50rb', { ops: ['SETTLE'], warn: ['PAYMENT_EXCEEDS_REMAINING_BALANCE'], review: true }, withRian],
  ['e05', ['partial', 'remaining'], 'rian balikin separuh dulu', { ops: ['PARTIAL_SETTLE'], rel: { rr: 15000 }, money: { '': 15000 } }, withRian],
  ['e06', ['partial'], 'nyicil utang ke rudi 100rb', { ops: ['PARTIAL_SETTLE'], rel: { d1: 300000 }, money: { '': -100000 }, target: 'd1' }],
  ['e07', ['claim', 'partial'], 'klaim dinas surabaya cair 700rb', { ops: ['PARTIAL_SETTLE'], rel: { c1: 500000 }, money: { '': 700000 }, target: 'c1' }],
  ['e08', ['ambiguous'], 'dina balikin 25rb', { ops: ['SETTLE?'], ask: 'link', review: true, money: { '': 25000 } }],
  ['e09', ['reference', 'partial'], 'nisa minjem 40rb terus dia balikin 15rb', { ops: ['CREATE', 'PARTIAL_SETTLE'], created: { 'receivable:Nisa': 25000 }, money: { '': 15000 } }],
  ['e10', ['reference', 'ambiguous'], 'nisa minjem 40rb rian minjem 20rb terus dia bayar 10rb', { ops: ['CREATE', 'CREATE', 'SETTLE?'], created: { 'receivable:Nisa': 40000, 'receivable:Rian': 20000 }, ask: 'person', review: true, money: { '': 10000 } }],
  ['e11', ['reference', 'talang', 'partial'], 'tadi gue nalangin dodi bensin 60rb pake gopay terus dia balikin 20rb', { ops: ['CREATE', 'PARTIAL_SETTLE'], created: { 'receivable:Dodi': 40000 }, money: { gopay: -60000, '': 20000 }, cash: 2 }],
  ['e12', ['update'], 'ubah mie ayam tadi jadi 25rb', { ops: ['UPDATE'], target: 'u1', updates: { u1: { amount: 25000 } }, money: { gopay: -3000 } }, withRecent],
  ['e13', ['update'], 'martabak kemarin harusnya 40rb', { ops: ['UPDATE'], target: 'u3', updates: { u3: { amount: 40000 } }, money: { jago: -5000 } }, withRecent],
  ['e14', ['delete'], 'hapusin parkir yang tadi', { ops: ['DELETE'], target: 'u2', deletes: ['u2'], review: true }, withRecent],
  ['e15', ['delete'], 'batalin transfer bri ke gopay tadi pagi', { ops: ['CANCEL'], target: 'u4', deletes: ['u4'], review: true }, withRecent],
  ['e16', ['update'], 'yang bakmi gm tadi ganti jadi pake jago', { ops: ['UPDATE'], target: 'u1', updates: { u1: { wallet: 'jago' } }, money: { gopay: 22000, jago: -22000 } }, withRecent],
  ['e17', ['delete'], 'hapus kopi kemarin', { ops: ['DELETE'], review: true }, withRecent],
  ['e18', ['query'], 'rian masih punya utang berapa ke gue', { ops: ['QUERY'], query: 'Rp30.000' }, withRian],
  ['e19', ['query'], 'utang gue total berapa', { ops: ['QUERY'], query: 'Rp500.000' }],
  ['e20', ['query'], 'siapa saja yang masih ngutang', { ops: ['QUERY'], query: 'Dina' }],
  ['e21', ['arithmetic'], '2 es teh 5rb satu', { ops: ['CREATE'], actions: [{ amount: 10000 }], money: { '': -10000 } }],
  ['e22', ['arithmetic'], '5 gorengan @2rb', { ops: ['CREATE'], actions: [{ amount: 10000 }], money: { '': -10000 } }],
  ['e23', ['arithmetic'], '2 burger 35rb', { ops: ['CREATE'], actions: [{ amount: 35000 }], money: { '': -35000 } }],
  ['e24', ['discount'], 'sepatu 400rb diskon 100rb jago', { ops: ['CREATE'], actions: [{ amount: 300000 }], money: { jago: -300000 }, cash: 1 }],
  ['e25', ['discount', 'fee'], 'makan malam 250rb voucher 50rb pajak 20rb gopay', { ops: ['CREATE'], actions: [{ amount: 220000 }], money: { gopay: -220000 }, cash: 1 }],
  ['e26', ['cashback'], 'pulsa 100rb cashback 5rb gopay', { ops: ['CREATE'], actions: [{ kind: 'expense', amount: 95000 }], money: { gopay: -95000 }, cash: 1 }],
  ['e27', ['transfer', 'fee'], 'tf 1jt dari bri ke jenius admin 6500', { ops: ['TRANSFER'], money: { bri: -1006500, jenius: 1000000 } }],
  ['e28', ['group'], 'dodi sama nisa masing-masing minjem 50rb', { ops: ['CREATE', 'CREATE'], created: { 'receivable:Dodi': 50000, 'receivable:Nisa': 50000 } }],
  ['e29', ['group'], 'dodi dan nisa total ngutang 90rb', { ops: ['CREATE', 'CREATE'], created: { 'receivable:Dodi': 45000, 'receivable:Nisa': 45000 }, review: true }],
  ['e30', ['split'], 'bayar karaoke 300rb bagi rata berempat gue dodi nisa rian', { ops: ['SPLIT'], created: { 'receivable:Dodi': 75000, 'receivable:Nisa': 75000, 'receivable:Rian': 75000 }, money: { '': -300000 }, cash: 1 }],
  ['e31', ['split'], 'patungan kado 90rb bertiga aku dodi nisa', { ops: ['SPLIT'], created: { 'receivable:Dodi': 30000, 'receivable:Nisa': 30000 }, money: { '': -90000 }, cash: 1 }],
  ['e32', ['talang'], 'kemarin talangin nisa tiket 75rb pake jenius', { ops: ['CREATE'], created: { 'receivable:Nisa': 75000 }, money: { jenius: -75000 }, cash: 1, actions: [{ kind: 'receivable_new', date: Y }] }],
  ['e33', ['claim'], 'taksi ke klien 85rb jago nanti diklaim ke kantor', { ops: ['CREATE'], created: { 'claim:new': 85000 }, money: { jago: -85000 }, cash: 1, actions: [{ kind: 'claim_new' }] }],
  ['e34', ['plan'], 'lusa bayar listrik 350rb jam 9 pagi', { ops: ['SCHEDULE'], schedules: [{ amount: 350000, date: '2026-10-17', time: '09:00' }] }],
  ['e35', ['plan'], 'wifi barusan udah dibayar', { ops: ['CONFIRM'], plansDone: ['p1'], money: { jago: -121000 }, target: 'p1' }],
  ['e36', ['recurring'], 'netflix 65rb tiap tanggal 3 jam 8 malam', { ops: ['RECUR'], recurring: { new: { amount: 65000, date: '2026-11-03', time: '20:00' } } }],
  ['e37', ['recurring'], 'mulai bulan depan spotify naik jadi 45rb', { ops: ['RECUR'], recurring: { s1: { amount: 45000, from: '2026-11-01' } } }],
  ['e38', ['recurring'], 'stop langganan spotify bulan depan', { ops: ['STOP_RECURRING'], recurring: { s1: { stop: true, from: '2026-11-01' } } }],
  ['e39', ['duplicate'], 'mie ayam bakmi gm 22rb gopay', { ops: ['CREATE'], duplicate: true, money: { gopay: -22000 }, review: true }, { recent: [{ ...withRecent.recent[0], createdMs: now - 20_000 }, ...withRecent.recent.slice(1)] }],
  ['e40', ['duplicate'], 'mie ayam bakmi gm 22rb gopay', { ops: ['CREATE'], duplicate: false, money: { gopay: -22000 } }, withRecent],
  ['e41', ['unsuffixed'], 'roti 15 gopay susu 12 jago', { ops: ['CREATE', 'CREATE'], actions: [{ amount: 15000, wallet: 'gopay' }, { amount: 12000, wallet: 'jago' }], review: true, confirm: true, money: { gopay: -15000, jago: -12000 } }],
  ['e42', ['simple'], 'parkir 3rb cash', { ops: ['CREATE'], money: { cash: -3000 }, review: false }],
  ['e43', ['simple'], 'bonus 500rb masuk bri', { ops: ['CREATE'], money: { bri: 500000 } }],
];

export const cases = raw.map(([id, tags, text, expect, override]) => ({ id, tags, text, expect, ...(override ? { state: override } : {}), set: 'heldout' }));
