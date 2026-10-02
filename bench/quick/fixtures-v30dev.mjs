/**
 * Catat otomatis V3 — development set (v30-dev).
 *
 * Natural, casual sentences, built from the real failures ("mie ayam di bedeng 12k", "kemarin beli susu di b1 piot 7,7k
 * krom") and the weak classes of the V2.5 held-out run (wallet, destination, person, corrections on new phrasing,
 * minimal questions). Used while building V3, so its numbers are development numbers, not a measure on unseen text.
 *
 * Besides the V2.5 fields, the truth can check entities:
 *   description, merchant  — exact text (case-insensitive); null = must stay empty
 *   person                 — the other person (lender, borrower, recipient)
 * Today is Saturday 26 September 2026.
 */
export const today = '2026-09-26';

export const ctx = {
  today,
  salaryDay: 25,
  wallets: [
    { id: 'jago', name: 'Jago', type: 'bank' }, { id: 'gopay', name: 'GoPay', type: 'ewallet' }, { id: 'jenius', name: 'Jenius', type: 'bank' },
    { id: 'mandiri', name: 'Mandiri', type: 'bank' }, { id: 'bri', name: 'BRI', type: 'bank' }, { id: 'krom', name: 'Krom', type: 'bank' },
    { id: 'cash', name: 'Cash', type: 'cash' },
  ],
  categories: [
    { id: 'food', name: 'Makan & Minum', type: 'expense' }, { id: 'drink', name: 'Minuman', type: 'expense', parentId: 'food' },
    { id: 'trans', name: 'Transportasi', type: 'expense' }, { id: 'park', name: 'Parkir', type: 'expense', parentId: 'trans' }, { id: 'fuel', name: 'Bensin', type: 'expense', parentId: 'trans' },
    { id: 'shop', name: 'Belanja', type: 'expense' }, { id: 'bills', name: 'Tagihan', type: 'expense' },
    { id: 'salary', name: 'Gaji', type: 'income' },
  ],
  history: [{ type: 'expense', description: 'Kopi', merchant: 'Fore', categoryId: 'drink', subcategoryId: null, date: '2026-09-10' }],
  debts: [{ id: 'd1', name: 'Pinjaman Rudi', provider: 'Rudi', outstandingAmount: 400_000 }],
  receivables: [{ id: 'r1', person: 'Sinta', description: 'Tiket', remainingAmount: 250_000, date: '2026-09-01' }],
  claims: [{ id: 'c1', name: 'Dinas Surabaya', remainingAmount: 1_200_000 }],
  funds: [], wishlist: [], budgets: [],
};

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, KEMARIN = '2026-09-25';

/** [id, tags, text, actions] */
const raw = [
  // Real failures (permanent regressions).
  ['real-bedeng', ['real', 'merchant', 'boundary'], 'mie ayam di bedeng 12k', [a('expense', 12000, { date: T, description: 'Mie Ayam', merchant: 'Bedeng' })]],
  ['real-b1piot', ['real', 'merchant', 'boundary', 'wallet'], 'kemarin beli susu di b1 piot 7,7k krom', [a('expense', 7700, { date: KEMARIN, description: 'Susu', merchant: 'B1 Piot', wallet: 'krom' })]],
  // Required tests 81–93.
  ['req-implicit-wallet', ['merchant', 'wallet'], 'kopi fore 25k jago', [a('expense', 25000, { description: 'Kopi', merchant: 'Fore', wallet: 'jago' })]],
  ['req-explicit-wallet', ['merchant', 'wallet'], 'kopi di fore 25k pake jago', [a('expense', 25000, { description: 'Kopi', merchant: 'Fore', wallet: 'jago' })]],
  ['req-multiword', ['merchant', 'boundary', 'wallet'], 'susu di family mart 20k krom', [a('expense', 20000, { description: 'Susu', merchant: 'Family Mart', wallet: 'krom' })]],
  ['req-numeric-merchant', ['merchant', 'boundary', 'wallet'], 'kopi di 7 speed 18k jago', [a('expense', 18000, { description: 'Kopi', merchant: '7 Speed', wallet: 'jago' })]],
  ['req-wallet-before-amount', ['merchant', 'boundary', 'wallet'], 'makan di bedeng krom 12k', [a('expense', 12000, { description: 'Makan', merchant: 'Bedeng', wallet: 'krom' })]],
  ['req-wallet-dari', ['merchant', 'wallet'], 'makan di bedeng 12k dari krom', [a('expense', 12000, { description: 'Makan', merchant: 'Bedeng', wallet: 'krom' })]],
  ['req-merchant-correction', ['merchant', 'correction'], 'susu di b1 8k eh di piot', [a('expense', 8000, { description: 'Susu', merchant: 'Piot' })]],
  ['req-wallet-correction', ['wallet', 'correction'], 'makan 25k jago eh krom', [a('expense', 25000, { description: 'Makan', wallet: 'krom', merchant: null })]],
  ['req-person-vs-wallet', ['to', 'person'], 'transfer 100k dari jago ke budi', [a('expense', 100000, { wallet: 'jago', to: null, person: 'Budi' })]],
  ['req-wallet-destination', ['to', 'from'], 'transfer 100k dari jago ke mandiri', [a('transfer', 100000, { wallet: 'jago', to: 'mandiri' })]],
  ['req-lending-in', ['person', 'relation'], 'budi minjemin aku 100k', [a('debt_new', 100000, { person: 'Budi' })]],
  ['req-lending-out', ['person', 'relation'], 'aku minjemin budi 100k', [a('receivable_new', 100000, { person: 'Budi' })]],
  ['req-two-actions', ['segmentation', 'merchant', 'wallet'], 'mie ayam di bedeng 12k krom terus kopi fore 25k jago', [a('expense', 12000, { description: 'Mie Ayam', merchant: 'Bedeng', wallet: 'krom' }), a('expense', 25000, { description: 'Kopi', merchant: 'Fore', wallet: 'jago' })]],
  // Section 77 natural sentences.
  ['nat-bensin-80', ['amount', 'wallet'], 'bensin 80 krom', [a('expense', undefined, { wallet: 'krom', category: 'fuel', review: ['amount'] })]],
  ['nat-tf-shorthand', ['to', 'from'], 'tf 200k jago ke mandiri', [a('transfer', 200000, { wallet: 'jago', to: 'mandiri' })]],
  ['nat-talangin', ['person', 'wallet'], 'talangin aldi makan 45k jago', [a('receivable_new', 45000, { person: 'Aldi', wallet: 'jago' })]],
  ['nat-bayar-orang', ['person', 'amount'], 'bayar budi 100', [a('expense', undefined, { person: 'Budi', review: ['amount'] })]],
  // Merchant / description boundaries, paraphrases.
  ['bd-beli-di', ['merchant'], 'beli mie ayam di bedeng 12rb', [a('expense', 12000, { description: 'Mie Ayam', merchant: 'Bedeng' })]],
  ['bd-amount-first', ['merchant'], '12k mie ayam di bedeng', [a('expense', 12000, { description: 'Mie Ayam', merchant: 'Bedeng' })]],
  ['bd-kopi-kenangan', ['merchant', 'wallet'], 'es kopi susu di kopi kenangan 22k gopay', [a('expense', 22000, { description: 'Es Kopi Susu', merchant: 'Kopi Kenangan', wallet: 'gopay' })]],
  ['bd-burger-king', ['merchant', 'wallet'], 'whopper di burger king 45rb pake jenius', [a('expense', 45000, { description: 'Whopper', merchant: 'Burger King', wallet: 'jenius' })]],
  ['bd-warung', ['merchant', 'wallet'], 'nasi rames di warung bu sri 15rb cash', [a('expense', 15000, { description: 'Nasi Rames', merchant: 'Warung Bu Sri', wallet: 'cash' })]],
  ['bd-indomaret-no-di', ['merchant', 'wallet'], 'roti indomaret 12k krom', [a('expense', 12000, { description: 'Roti', merchant: 'Indomaret', wallet: 'krom' })]],
  ['bd-merchant-date-after', ['merchant', 'date'], 'sate di pak kumis kemarin 30rb', [a('expense', 30000, { date: KEMARIN, description: 'Sate', merchant: 'Pak Kumis' })]],
  ['bd-tadi', ['merchant', 'wallet'], 'makan tadi 35rb cash', [a('expense', 35000, { description: 'Makan', merchant: null, wallet: 'cash' })]],
  ['bd-kmrn', ['date', 'merchant', 'wallet'], 'kmrn beli susu di b1 piot 7.7k pake krom', [a('expense', 7700, { date: KEMARIN, description: 'Susu', merchant: 'B1 Piot', wallet: 'krom' })]],
  ['bd-no-date', ['merchant', 'wallet'], 'beli susu di b1 piot 7,7k krom', [a('expense', 7700, { date: T, description: 'Susu', merchant: 'B1 Piot', wallet: 'krom' })]],
  ['bd-plain', ['merchant'], 'parkir 5rb', [a('expense', 5000, { description: 'Parkir', merchant: null })]],
  ['bd-nasgor', ['merchant'], 'nasi goreng 20k', [a('expense', 20000, { description: 'Nasi Goreng', merchant: null })]],
  ['bd-kopi-tubruk', ['merchant'], 'kopi tubruk 8rb', [a('expense', 8000, { description: 'Kopi Tubruk', merchant: null })]],
  ['bd-at', ['merchant', 'wallet'], 'beli obat @ apotek k24 35k bri', [a('expense', 35000, { description: 'Obat', merchant: 'Apotek K24', wallet: 'bri' })]],
  ['bd-wallet-pk', ['wallet'], 'gorengan 10rb pk cash', [a('expense', 10000, { description: 'Gorengan', wallet: 'cash', merchant: null })]],
  ['bd-gopay-split', ['wallet', 'merchant'], 'martabak di pak joko 40rb go pay', [a('expense', 40000, { description: 'Martabak', merchant: 'Pak Joko', wallet: 'gopay' })]],
  ['bd-decimal-jt', ['amount', 'merchant'], 'servis motor di ahass 1,25jt mandiri', [a('expense', 1_250_000, { description: 'Servis Motor', merchant: 'Ahass', wallet: 'mandiri' })]],
  // To / from / person.
  ['to-kirim-orang', ['to', 'person'], 'kirim 50rb ke sinta pake gopay', [a('expense', 50000, { wallet: 'gopay', to: null, person: 'Sinta' })]],
  ['to-topup', ['to', 'from'], 'top up gopay 100rb dari jago', [a('transfer', 100000, { wallet: 'jago', to: 'gopay' })]],
  ['to-masuk-ke', ['to', 'from'], 'pindahin 500rb dari bri masuk ke jenius', [a('transfer', 500000, { wallet: 'bri', to: 'jenius' })]],
  ['to-no-source', ['to'], 'transfer 300k ke krom', [a('transfer', 300000, { to: 'krom', wallet: undefined, review: ['wallet'], ask: 'wallet' })]],
  ['to-ke-jago-wallet', ['to', 'person'], 'transfer ke jago 150rb dari mandiri', [a('transfer', 150000, { wallet: 'mandiri', to: 'jago', person: null })]],
  ['from-minjem-dari', ['person', 'from'], 'minjem 200rb dari budi masuk jago', [a('debt_new', 200000, { person: 'Budi', wallet: 'jago' })]],
  ['from-dapat-dari', ['person', 'from'], 'dapet 150rb dari aldi', [a('income', 150000, { person: 'Aldi' })]],
  ['person-pinjemin-wallet', ['person', 'wallet'], 'pinjemin rina 75rb pake krom', [a('receivable_new', 75000, { person: 'Rina', wallet: 'krom' })]],
  ['person-kasih-pinjem', ['person'], 'kasih pinjem dodi 300rb', [a('receivable_new', 300000, { person: 'Dodi' })]],
  ['person-known-debt', ['link'], 'bayar utang rudi 100rb jago', [a('debt_payment', 100000, { link: 'd1', wallet: 'jago' })]],
  ['person-receivable-paid', ['link'], 'sinta bayar 100rb masuk krom', [a('receivable_payment', 100000, { link: 'r1', wallet: 'krom' })]],
  // Corrections / negation on entities.
  ['corr-wallet-bukan', ['wallet', 'correction'], 'makan 30rb bukan jago, krom', [a('expense', 30000, { wallet: 'krom' })]],
  ['corr-place-bukan', ['merchant', 'correction'], 'susu 8k bukan di b1, di piot', [a('expense', 8000, { description: 'Susu', merchant: 'Piot' })]],
  ['corr-amount', ['amount', 'correction'], 'bakso di pak min 50rb eh 45rb krom', [a('expense', 45000, { description: 'Bakso', merchant: 'Pak Min', wallet: 'krom' })]],
  ['corr-person', ['person', 'correction'], 'talangin budi 40rb eh aldi', [a('receivable_new', 40000, { person: 'Aldi' })]],
  // References that use the merchant / description.
  ['ref-merchant', ['coref', 'merchant', 'wallet'], 'makan di bedeng 12k sama kopi di fore 25k. yang di bedeng cash', [a('expense', 12000, { merchant: 'Bedeng', wallet: 'cash' }), a('expense', 25000, { merchant: 'Fore' })]],
  ['ref-description', ['coref', 'wallet'], 'susu 8rb sama roti 12rb, yang susu pake krom', [a('expense', 8000, { description: 'Susu', wallet: 'krom' }), a('expense', 12000, { description: 'Roti' })]],
  // Multi-action isolation.
  ['multi-three', ['segmentation', 'merchant'], 'kopi di fore 25k, roti di indomaret 12k, parkir 5rb', [a('expense', 25000, { merchant: 'Fore' }), a('expense', 12000, { merchant: 'Indomaret' }), a('expense', 5000, { merchant: null })]],
  ['multi-wallet-each', ['segmentation', 'wallet'], 'bensin 50rb mandiri terus makan 20rb cash', [a('expense', 50000, { wallet: 'mandiri' }), a('expense', 20000, { wallet: 'cash' })]],
  // Typos / casual spelling.
  ['typo-kemaren', ['date', 'merchant'], 'kemaren jajan cilok di depan kampus 10rb', [a('expense', 10000, { date: KEMARIN, description: 'Cilok', merchant: 'Depan Kampus' })]],
  ['typo-trf', ['to', 'from'], 'trf 1jt dari mandiri ke jago', [a('transfer', 1_000_000, { wallet: 'mandiri', to: 'jago' })]],
  ['typo-tunai', ['wallet'], 'beli pulsa 25rb tunai', [a('expense', 25000, { wallet: 'cash' })]],
];

export const cases = raw.map(([id, tags, text, actions]) => ({ id, tags, text, actions, set: 'dev' }));
