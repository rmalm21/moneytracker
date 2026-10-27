/**
 * Catat otomatis — 6.0 preparation, development set (A). The language people really type that 5.10 still misreads:
 * slang amounts, corrections said with "nggak / no", leftovers around amounts (",-", "an"), chat typos of verbs,
 * Javanese and Sundanese verbs, English, "semalam", payment-method words, "nge-" verbs and a friend paying back by
 * transfer. Plus control sentences that must keep working. State: bench/quick/fixtures-v35state.mjs (Thu 15 Oct 2026).
 */
export const cases = [
  // Amounts in slang and with leftovers.
  { id: 'n1', group: 'nominal', text: 'gopek permen', expect: { kind: 'expense', amount: 500, description: 'permen' } },
  { id: 'n2', group: 'nominal', text: 'goceng parkir cash', expect: { amount: 5000, wallet: 'cash', cat: 'park' } },
  { id: 'n3', group: 'nominal', text: 'beli sepatu Rp 450.000,- pake bri', expect: { amount: 450000, wallet: 'bri', description: 'sepatu', cat: 'shop' } },
  { id: 'n4', group: 'nominal', text: 'kopi 25k an', expect: { amount: 25000, description: 'kopi', cat: 'drink' } },
  { id: 'n5', group: 'nominal', text: 'setengah juta buat servis motor', expect: { amount: 500000, cat: 'trans' } },
  { id: 'n6', group: 'nominal', text: 'jajan 15ribuan', expect: { amount: 15000, description: 'jajan' } },
  { id: 'n7', group: 'nominal', text: 'parkir kira-kira 3rb', expect: { amount: 3000, description: 'parkir', cat: 'park' } },
  // Corrections.
  { id: 'k1', group: 'ralat', text: 'makan siang sejuta? nggak, makan siang 35rb', expect: { actions: [{ amount: 35000, description: 'makan siang', cat: 'food' }] } },
  { id: 'k2', group: 'ralat', text: 'pulsa 3 jt? no, pulsa 30rb', expect: { actions: [{ amount: 30000, cat: 'bills' }] } },
  { id: 'k3', group: 'ralat', text: 'bensin 50rb, salah, 40rb', expect: { actions: [{ amount: 40000, cat: 'fuel' }] } },
  { id: 'k4', group: 'ralat', text: 'parkir 5rb ralat 3rb', expect: { actions: [{ amount: 3000, cat: 'park' }] } },
  // Chat typos of verbs and "nge-" verbs.
  { id: 't1', group: 'ketik', text: 'bli bensin 20rb gopay', expect: { amount: 20000, wallet: 'gopay', description: 'bensin', cat: 'fuel' } },
  { id: 't2', group: 'ketik', text: 'mamam bakso 20rb', expect: { amount: 20000, description: 'makan bakso', cat: 'food' } },
  { id: 't3', group: 'ketik', text: 'ngebensin 30rb', expect: { amount: 30000, description: 'bensin', cat: 'fuel' } },
  { id: 't4', group: 'ketik', text: 'duit jajan anak 50rb', expect: { amount: 50000, description: 'uang jajan anak' } },
  // Regional verbs and nouns.
  { id: 'd1', group: 'daerah', text: 'tuku sego 15rb', expect: { amount: 15000, description: 'nasi', cat: 'food' } },
  { id: 'd2', group: 'daerah', text: 'nukoni bensin 20rb', expect: { amount: 20000, description: 'bensin', cat: 'fuel' } },
  { id: 'd3', group: 'daerah', text: 'meuli kopi 10rb', expect: { amount: 10000, description: 'kopi', cat: 'drink' } },
  { id: 'd4', group: 'daerah', text: 'tumbas gorengan 10rb cash', expect: { amount: 10000, wallet: 'cash', description: 'gorengan', cat: 'food' } },
  // English.
  { id: 'e1', group: 'inggris', text: 'paid electricity 300k', expect: { amount: 300000, description: 'listrik', cat: 'bills' } },
  { id: 'e2', group: 'inggris', text: 'got paid 2jt from freelance', expect: { kind: 'income', amount: 2000000, description: 'freelance' } },
  { id: 'e3', group: 'inggris', text: 'bought shoes 300k bri', expect: { amount: 300000, wallet: 'bri', cat: 'shop' } },
  { id: 'e4', group: 'inggris', text: 'breakfast 25k', expect: { amount: 25000, cat: 'food' } },
  // Time.
  { id: 'w1', group: 'waktu', text: 'semalem beli martabak 35rb', expect: { amount: 35000, date: '2026-10-14', description: 'martabak', cat: 'food' } },
  { id: 'w2', group: 'waktu', text: 'semalam ngopi 28rb gopay', expect: { amount: 28000, date: '2026-10-14', wallet: 'gopay', cat: 'drink' } },
  { id: 'w3', group: 'waktu', text: 'nginep hotel semalam 450rb', expect: { amount: 450000, date: '2026-10-15' } },
  // Payment-method words.
  { id: 'm1', group: 'metode', text: 'makan 30rb via qris jago', expect: { amount: 30000, wallet: 'jago', description: 'makan', cat: 'food' } },
  { id: 'm2', group: 'metode', text: 'bayar pake debit mandiri 120rb belanja', expect: { amount: 120000, wallet: 'mandiri', description: 'belanja', cat: 'shop' } },
  { id: 'm3', group: 'metode', text: 'jajan 12rb qris', expect: { amount: 12000, description: 'jajan' } },
  // A friend pays back by transfer.
  { id: 'p1', group: 'piutang', text: 'dina transfer balik 30rb ke jago', expect: { kind: 'receivable_payment', amount: 30000, wallet: 'jago', person: 'dina' } },
  { id: 'p2', group: 'piutang', text: 'sinta udah tf 250rb ke mandiri buat tiket', expect: { kind: 'receivable_payment', amount: 250000, wallet: 'mandiri', person: 'sinta' } },
  // Controls that must keep working.
  { id: 'c1', group: 'kontrol', text: 'trf ke mandiri 500rb dr jago', expect: { kind: 'transfer', amount: 500000, wallet: 'jago', to: 'mandiri' } },
  { id: 'c2', group: 'kontrol', text: 'gjian 8jt masuk jago', expect: { kind: 'income', amount: 8000000, wallet: 'jago', cat: 'salary' } },
  { id: 'c3', group: 'kontrol', text: 'makan 30rb, kopi 20rb, parkir 5rb', expect: { actions: [{ amount: 30000, cat: 'food' }, { amount: 20000, cat: 'drink' }, { amount: 5000, cat: 'park' }] } },
  { id: 'c4', group: 'kontrol', text: 'andi minjem 100rb ke gw', expect: { kind: 'receivable_new', amount: 100000, person: 'andi' } },
  { id: 'c5', group: 'kontrol', text: 'bayar utang ke rudi 100rb pake mandiri', expect: { kind: 'debt_payment', amount: 100000, wallet: 'mandiri' } },
  { id: 'c6', group: 'kontrol', text: 'berapa pengeluaranku bulan ini', expect: { actions: [] } },
  { id: 'c7', group: 'kontrol', text: 'kemarin malam makan 40rb', expect: { amount: 40000, date: '2026-10-14', cat: 'food' } },
  { id: 'c8', group: 'kontrol', text: 'lusa bayar arisan 100rb', expect: { kind: 'plan_new', amount: 100000, date: '2026-10-17' } },
];
