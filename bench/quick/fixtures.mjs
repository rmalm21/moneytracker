/**
 * Benchmark for "Catat otomatis": everyday Indonesian sentences and what they should become.
 *
 * Every case has the actions a careful person would expect, in order. Only the fields written in the truth are checked:
 *   kind, amount, date, wallet (source), to (destination wallet), link (debt/receivable/claim/fund/wish id), category
 *   (subcategory id, else category id) and person.
 * `null` means "must not be filled with a guess": an empty field is right, a filled one is wrong unless it is marked for
 * checking. `review` lists the fields the engine must mark as needing the person's attention (a conflict, a missing
 * transfer wallet, an unclear record). `actions: []` means nothing should be made (negative cases).
 * Today is Saturday 26 September 2026; the person's salary day is the 25th.
 */
export const today = '2026-09-26';

export const ctx = {
  today,
  salaryDay: 25,
  wallets: [{ id: 'bca', name: 'BCA', type: 'bank' }, { id: 'gopay', name: 'GoPay', type: 'ewallet' }, { id: 'cash', name: 'Tunai', type: 'cash' }, { id: 'jenius', name: 'Jenius', type: 'bank' }, { id: 'ovo', name: 'OVO', type: 'ewallet' }],
  categories: [
    { id: 'food', name: 'Makan & Minum', type: 'expense' }, { id: 'drink', name: 'Minuman', type: 'expense', parentId: 'food' },
    { id: 'trans', name: 'Transportasi', type: 'expense' }, { id: 'park', name: 'Parkir', type: 'expense', parentId: 'trans' }, { id: 'fuel', name: 'Bensin', type: 'expense', parentId: 'trans' },
    { id: 'shop', name: 'Belanja', type: 'expense' },
    { id: 'bills', name: 'Tagihan', type: 'expense' }, { id: 'elec', name: 'Listrik', type: 'expense', parentId: 'bills' }, { id: 'phone', name: 'Pulsa', type: 'expense', parentId: 'bills' },
    { id: 'fun', name: 'Hiburan', type: 'expense' }, { id: 'home', name: 'Tempat Tinggal', type: 'expense' },
    { id: 'salary', name: 'Gaji', type: 'income' }, { id: 'bonus', name: 'Bonus', type: 'income' },
  ],
  history: [{ type: 'expense', description: 'Sabun', merchant: 'Superindo Kemang', categoryId: 'shop', subcategoryId: null, date: '2026-09-01' }],
  debts: [{ id: 'd1', name: 'Cicilan laptop', provider: 'Kredivo', outstandingAmount: 5_500_000 }, { id: 'd2', name: 'Pinjaman Budi', provider: 'Budi', outstandingAmount: 300_000 }],
  receivables: [{ id: 'r1', person: 'Andi', description: 'Makan', remainingAmount: 150_000, date: '2026-09-01' }],
  claims: [{ id: 'c1', name: 'Hotel Bandung', remainingAmount: 900_000 }],
  funds: [{ id: 'f1', name: 'Dana Darurat', linkedWalletId: 'jenius' }, { id: 'f2', name: 'Liburan Bali', walletIds: ['bca'] }],
  wishlist: [{ id: 'w1', name: 'Headphone noise cancelling', status: 'active' }],
  budgets: [{ id: 'b1', name: 'Makan & Minum', categoryId: 'food', amount: 2_000_000, active: true }],
};

const a = (kind, amount, extra = {}) => ({ kind, ...(amount !== undefined ? { amount } : {}), ...extra });
const T = today, KEMARIN = '2026-09-25', BESOK = '2026-09-27';

/** [id, tags, text, actions, options] */
const raw = [
  // Section 23: sentences that already worked must keep working.
  ['c01', 'compat clean merchant category', 'beli pocari 8rb di alfa', [a('expense', 8000, { date: T, category: 'drink' })]],
  ['c02', 'compat clean wallet', 'gaji 7,5jt masuk bca', [a('income', 7_500_000, { wallet: 'bca', category: 'salary' })]],
  ['c03', 'compat abbrev transfer', 'tf 200rb dari bca ke gopay', [a('transfer', 200_000, { wallet: 'bca', to: 'gopay' })]],
  ['c04', 'compat debt person', 'pinjam 500rb dari budi', [a('debt_new', 500_000, { person: 'Budi' })]],
  ['c05', 'compat debt record', 'bayar cicilan laptop 500rb', [a('debt_payment', 500_000, { link: 'd1' })]],
  ['c06', 'compat receivable person', 'pinjemin andi 100rb', [a('receivable_new', 100_000, { person: 'Andi' })]],
  ['c07', 'compat receivable record', 'andi bayar 50rb', [a('receivable_payment', 50_000, { link: 'r1' })]],
  ['c08', 'compat claim', 'klaim hotel 300rb', [a('claim_new', 300_000)]],
  ['c09', 'compat claim record', 'klaim cair 300rb', [a('claim_payment', 300_000, { link: 'c1' })]],
  ['c10', 'compat fund record', 'nabung 500rb ke dana darurat', [a('target', 500_000, { link: 'f1' })]],
  ['c11', 'compat budget', 'anggaran makan 2jt', [a('budget', 2_000_000, { category: 'food' })]],
  ['c12', 'compat fund date', 'target liburan bali 10jt desember 2027', [a('fund_new', 10_000_000)]],
  ['c13', 'compat wish', 'pengen headphone 1,5jt', [a('wish_new', 1_500_000)]],
  ['c14', 'compat wallet balance', 'saldo bca sekarang 12jt', [a('balance', 12_000_000, { wallet: 'bca' })]],
  ['c15', 'compat recurring date', 'langganan netflix 54rb tiap tanggal 5', [a('recurring_new', 54_000, { date: '2026-10-05' })]],
  ['c16', 'compat reminder date', 'ingetin perpanjang stnk 20 oktober', [a('note_new', undefined, { date: '2026-10-20' })]],
  ['c17', 'compat nav', 'buka laporan', [a('open')]],

  // Clean single entries.
  ['s01', 'clean category', 'makan siang 30rb', [a('expense', 30_000, { date: T, category: 'food' })]],
  ['s02', 'clean wallet category', 'bensin 100rb pakai bca', [a('expense', 100_000, { wallet: 'bca', category: 'fuel' })]],
  ['s03', 'clean category', 'parkir 5000', [a('expense', 5000, { category: 'park' })]],
  ['s04', 'clean category', 'bayar listrik 350rb', [a('expense', 350_000, { category: 'elec' })]],
  ['s05', 'clean date category', 'pulsa 100rb kemarin', [a('expense', 100_000, { date: KEMARIN, category: 'phone' })]],
  ['s06', 'clean category', 'bonus 500rb', [a('income', 500_000, { category: 'bonus' })]],
  ['s07', 'clean', 'jual sepatu bekas 300rb', [a('income', 300_000)]],
  ['s08', 'clean transfer', 'topup gopay 100rb dari bca', [a('transfer', 100_000, { wallet: 'bca', to: 'gopay' })]],
  ['s09', 'clean transfer', 'tarik tunai 500rb dari bca', [a('transfer', 500_000, { wallet: 'bca', to: 'cash' })]],
  ['s10', 'clean regression', 'beli dompet baru 150rb', [a('expense', 150_000)]],
  ['s11', 'clean regression', 'belanja bulanan 500rb', [a('expense', 500_000)]],
  ['s12', 'clean regression', 'parkir 5rb tiap hari', [a('expense', 5000, { category: 'park' })]],
  ['s13', 'clean wallet', 'kopi 25rb pakai bca', [a('expense', 25_000, { wallet: 'bca' })]],
  ['s14', 'clean merchant category', 'beli kopi 25rb di kenangan', [a('expense', 25_000, { category: 'drink' })]],
  ['s15', 'clean', 'makan 30 ribu', [a('expense', 30_000, { category: 'food' })]],
  ['s16', 'clean', 'rp 45.000 makan malam', [a('expense', 45_000, { category: 'food' })]],

  // Slang, abbreviations, typos, no punctuation.
  ['t01', 'slang abbrev date', 'kmrn mkn bakso 15rb', [a('expense', 15_000, { date: KEMARIN, category: 'food' })]],
  ['t02', 'slang abbrev date', 'td pagi ngopi 18k', [a('expense', 18_000, { date: T, category: 'drink' })]],
  ['t03', 'abbrev wallet', 'byr kos 1,5jt pake bca', [a('expense', 1_500_000, { wallet: 'bca', category: 'home' })]],
  ['t04', 'slang abbrev wallet', 'maksi 35rb pk gopay', [a('expense', 35_000, { wallet: 'gopay', category: 'food' })]],
  ['t05', 'typo abbrev transfer', 'trf 250rb dr bca ke ovo', [a('transfer', 250_000, { wallet: 'bca', to: 'ovo' })]],
  ['t06', 'money transfer', 'tf 1.5jt dari jenius ke bca', [a('transfer', 1_500_000, { wallet: 'jenius', to: 'bca' })]],
  ['t07', 'slang debt person', 'gw pinjem duit budi 200rb', [a('debt_new', 200_000, { person: 'Budi' })]],
  ['t08', 'slang money', 'parkir goceng', [a('expense', 5000, { category: 'park' })]],
  ['t09', 'slang money', 'jajan ceban', [a('expense', 10_000, { category: 'food' })]],
  ['t10', 'slang money wallet', 'bensin gocap pake tunai', [a('expense', 50_000, { wallet: 'cash', category: 'fuel' })]],
  ['t11', 'money words', 'sejuta setengah buat bayar kos', [a('expense', 1_500_000, { category: 'home' })]],
  ['t12', 'money words', 'dua puluh lima ribu makan siang', [a('expense', 25_000, { category: 'food' })]],
  ['t13', 'clean wallet', 'gaji masuk 7jt ke bca', [a('income', 7_000_000, { wallet: 'bca', category: 'salary' })]],
  ['t14', 'typo date', 'kemaren beli bensin 20rb', [a('expense', 20_000, { date: KEMARIN, category: 'fuel' })]],
  ['t15', 'abbrev balance', 'skrg saldo gopay 150rb', [a('balance', 150_000, { wallet: 'gopay' })]],
  ['t16', 'typo balance', 'go pay tinggal 80rb', [a('balance', 80_000, { wallet: 'gopay' })]],
  ['t17', 'typo money', 'bayar internet 350rbu', [a('expense', 350_000)]],
  ['t18', 'typo', 'beli bensn 30rb', [a('expense', 30_000)]],

  // Dates.
  ['d01', 'date', 'makan 25rb kemarin lusa', [a('expense', 25_000, { date: '2026-09-24' })]],
  ['d02', 'date', 'bakso 15rb 3 hari lalu', [a('expense', 15_000, { date: '2026-09-23' })]],
  ['d03', 'date', 'tadi malam makan 40rb', [a('expense', 40_000, { date: T })]],
  ['d04', 'date', 'kemarin sore beli roti 20rb', [a('expense', 20_000, { date: KEMARIN })]],
  ['d05', 'date', 'senin beli bensin 50rb', [a('expense', 50_000, { date: '2026-09-21' })]],
  ['d06', 'date', 'minggu lalu servis motor 300rb', [a('expense', 300_000, { date: '2026-09-19' })]],
  ['d07', 'date', 'makan 30rb tgl 5', [a('expense', 30_000, { date: '2026-09-05' })]],
  ['d08', 'date plan', 'bayar kos akhir bulan 1,5jt', [a('plan_new', 1_500_000, { date: '2026-09-30' })]],
  ['d09', 'date plan', 'beli tiket konser 500rb 5 okt', [a('plan_new', 500_000, { date: '2026-10-05' })]],
  ['d10', 'date plan', 'awal bulan depan bayar asuransi 400rb', [a('plan_new', 400_000, { date: '2026-10-01' })]],
  ['d11', 'date plan', 'besok bayar arisan 200rb', [a('plan_new', 200_000, { date: BESOK })]],
  ['d12', 'date plan', 'bayar pajak motor pas gajian berikutnya 300rb', [a('plan_new', 300_000, { date: '2026-10-25' })]],
  ['d13', 'money negative-number', 'jam 7 pagi sarapan 20rb', [a('expense', 20_000, { date: T })]],
  ['d14', 'money negative-number', 'makan di meja 12 bayar 85rb', [a('expense', 85_000)]],

  // Places, wallets, people.
  ['w01', 'merchant category history', 'beli sabun 12rb di superindo', [a('expense', 12_000, { category: 'shop' })]],
  ['w02', 'wallet merchant', 'makan di warteg 20rb pakai tunai', [a('expense', 20_000, { wallet: 'cash', category: 'food' })]],
  ['w03', 'wallet', 'pake ovo beli pulsa 50rb', [a('expense', 50_000, { wallet: 'ovo', category: 'phone' })]],
  ['w04', 'merchant', 'beli buku 80rb @gramedia', [a('expense', 80_000)]],
  ['w05', 'wallet ambiguous', 'beli kopi 30rb promo gopay', [a('expense', 30_000, { wallet: null })]],
  ['w06', 'person', 'makan sama andi 60rb', [a('expense', 60_000)]],

  // Debts, receivables, claims.
  ['r01', 'debt ambiguous', 'bayar cicilan motor 800rb', [a('expense', 800_000, { link: null })]],
  ['r02', 'debt record', 'bayar cicilan motor 800rb', [a('debt_payment', 800_000, { link: 'd3' })], { ctx: { debts: [...ctx.debts, { id: 'd3', name: 'Cicilan motor', provider: 'Adira', outstandingAmount: 8_000_000 }] } }],
  ['r03', 'debt ambiguous', 'bayar cicilan hp 500rb', [a('expense', 500_000, { link: null })]],
  ['r04', 'debt record', 'lunasin utang budi', [a('debt_payment', 300_000, { link: 'd2' })]],
  ['r05', 'debt record slang', 'balikin duit budi 100rb', [a('debt_payment', 100_000, { link: 'd2' })]],
  ['r06', 'receivable record', 'terima 50rb dari andi', [a('receivable_payment', 50_000, { link: 'r1' })]],
  ['r07', 'receivable person', 'bayarin sinta makan 50rb', [a('receivable_new', 50_000, { person: 'Sinta' })]],
  ['r08', 'receivable person', 'andi pinjam 100rb', [a('receivable_new', 100_000, { person: 'Andi' })]],
  ['r09', 'claim', 'reimburse taksi 80rb', [a('claim_new', 80_000)]],
  ['r10', 'claim record wallet', 'klaim hotel bandung cair 900rb masuk bca', [a('claim_payment', 900_000, { link: 'c1', wallet: 'bca' })]],
  ['r11', 'debt', 'bunga pinjaman 50rb', [a('expense', 50_000)]],
  ['r12', 'debt', 'kasbon 1jt ke kantor', [a('debt_new', 1_000_000)]],
  ['r13', 'debt ambiguous', 'bayar utang 200rb', [a('debt_payment', 200_000, { link: null, review: ['link'] })]],

  // Funds and wish list.
  ['f01', 'fund record wallet', 'isi dana darurat 1jt dari bca', [a('target', 1_000_000, { link: 'f1', wallet: 'bca' })]],
  ['f02', 'wish record', 'sisihkan 100rb buat headphone', [a('wish', 100_000, { link: 'w1' })]],
  ['f03', 'wish', 'pengen ps5 8jt', [a('wish_new', 8_000_000)]],
  ['f04', 'fund', 'target dana nikah 50jt 2028', [a('fund_new', 50_000_000)]],

  // Budgets.
  ['b01', 'budget segmentation', 'budget makan untuk sarapan, makan siang dan kopi 2jt', [a('budget', 2_000_000)]],
  ['b02', 'budget multi', 'budget makan 2jt, transport 800rb, hiburan 500rb', [a('budget', 2_000_000), a('budget', 800_000), a('budget', 500_000)]],
  ['b03', 'budget', 'jatah jajan 300rb per minggu', [a('budget', 300_000)]],
  ['b04', 'budget record', 'naikin anggaran makan 200rb', [a('budget', 2_200_000)]],

  // Schedules, plans, reminders.
  ['p01', 'recurring wallet', 'gaji 7,5jt tiap tanggal 25 masuk bca', [a('recurring_new', 7_500_000, { date: '2026-10-25', wallet: 'bca' })]],
  ['p02', 'recurring', 'arisan 200rb tiap minggu', [a('recurring_new', 200_000)]],
  ['p03', 'plan date', 'rencana servis motor 500rb tgl 10', [a('plan_new', 500_000, { date: '2026-10-10' })]],
  ['p04', 'reminder', 'ingetin tagih andi 150rb', [a('note_new')]],
  ['p05', 'reminder', 'catatan: cek tagihan kartu kredit', [a('note_new')]],

  // Other menus.
  ['n01', 'nav', 'lihat utang', [a('open')]],
  ['n02', 'nav', 'pengaturan', [a('open')]],
  ['n03', 'menu', 'kategori baru jajan', [a('category_new')]],
  ['n04', 'menu', 'rekening baru jago saldo 1jt', [a('wallet_new', 1_000_000)]],

  // Negative cases: nothing should be made.
  ['x01', 'negative', 'halo', []],
  ['x02', 'negative', 'apa kabar', []],
  ['x03', 'negative', 'berapa pengeluaranku bulan ini?', []],
  ['x04', 'negative', 'iphone 15', []],
  ['x05', 'negative', 'promo gopay cashback 20%', []],
  ['x06', 'negative', 'meeting jam 3', []],
  ['x07', 'negative money', 'kamar 205', []],
  ['x08', 'negative money', 'nomor rekening 1234567890', []],
  ['x09', 'negative', 'nanti aja', []],
  ['x10', 'negative coref', 'yang kopi pakai bca', []],

  // Several actions in one sentence.
  ['m01', 'multi segmentation', 'makan 25rb terus parkir 5rb', [a('expense', 25_000, { category: 'food' }), a('expense', 5000, { category: 'park' })]],
  ['m02', 'multi segmentation', 'makan 25rb dan parkir 5rb', [a('expense', 25_000), a('expense', 5000)]],
  ['m03', 'multi segmentation', 'beli nasi dan es teh 25rb', [a('expense', 25_000, { category: 'food' })]],
  ['m04', 'multi segmentation mixed', 'gaji 7jt, makan 30rb, lalu tf 500rb dari bca ke gopay', [a('income', 7_000_000), a('expense', 30_000), a('transfer', 500_000, { wallet: 'bca', to: 'gopay' })]],
  ['m05', 'multi mixed segmentation date', 'besok bayar kos 1,5jt, ingetin perpanjang stnk tanggal 20, sama budget makan bulan depan 2jt', [a('plan_new', 1_500_000, { date: BESOK }), a('note_new', undefined, { date: '2026-10-20' }), a('budget', 2_000_000)]],
  ['m06', 'multi inheritance', 'kemarin makan 25rb, parkir goceng, bensin 30rb pakai gopay', [a('expense', 25_000, { date: KEMARIN, wallet: 'gopay' }), a('expense', 5000, { date: KEMARIN, wallet: 'gopay' }), a('expense', 30_000, { date: KEMARIN, wallet: 'gopay' })]],
  ['m07', 'multi inheritance override', 'kemarin makan 30rb pakai gopay, bensin 100rb hari ini pake bca', [a('expense', 30_000, { date: KEMARIN, wallet: 'gopay' }), a('expense', 100_000, { date: T, wallet: 'bca' })]],
  ['m08', 'multi coref', 'makan 30rb, parkir 5rb, dua-duanya pakai gopay', [a('expense', 30_000, { wallet: 'gopay' }), a('expense', 5000, { wallet: 'gopay' })]],
  ['m09', 'multi coref', 'makan 30rb, bensin 100rb, yang bensin pakai bca', [a('expense', 30_000, { wallet: null }), a('expense', 100_000, { wallet: 'bca' })]],
  ['m10', 'multi coref', 'makan 30rb pakai bca, parkir 5rb, kopi 20rb, sisanya pakai gopay', [a('expense', 30_000, { wallet: 'bca' }), a('expense', 5000, { wallet: 'gopay' }), a('expense', 20_000, { wallet: 'gopay' })]],
  ['m11', 'multi mixed', 'pinjemin andi 100rb terus bayar cicilan laptop 500rb', [a('receivable_new', 100_000, { person: 'Andi' }), a('debt_payment', 500_000, { link: 'd1' })]],
  ['m12', 'multi mixed', 'nabung 500rb ke dana darurat, anggaran transport 800rb', [a('target', 500_000, { link: 'f1' }), a('budget', 800_000)]],
  ['m13', 'multi transfer ambiguous', 'tf 200rb ke gopay, makan 20rb', [a('transfer', 200_000, { wallet: null, to: 'gopay', review: ['wallet'] }), a('expense', 20_000)]],
  ['m14', 'multi segmentation', 'gajian 7jt masuk bca\nbayar kos 1,5jt\nmakan 40rb', [a('income', 7_000_000, { wallet: 'bca' }), a('expense', 1_500_000, { wallet: null }), a('expense', 40_000, { wallet: null })]],
  ['m15', 'multi slang segmentation', 'makan 25rb trs parkir 5rb abis itu bensin 20rb', [a('expense', 25_000), a('expense', 5000), a('expense', 20_000)]],
  ['m16', 'multi segmentation', 'beli makan dan minum 50rb', [a('expense', 50_000)]],
  ['m17', 'multi segmentation transfer', 'transfer dari bca ke gopay 300rb', [a('transfer', 300_000, { wallet: 'bca', to: 'gopay' })]],
  ['m18', 'multi mixed reminder', 'ingetin bayar listrik tgl 20 dan budget listrik 400rb', [a('note_new', undefined, { date: '2026-10-20' }), a('budget', 400_000)]],
  ['m19', 'multi segmentation', 'kopi 20rb; roti 15rb; susu 12rb', [a('expense', 20_000), a('expense', 15_000), a('expense', 12_000)]],
  ['m20', 'multi inheritance override', 'makan 30rb kemarin, terus hari ini parkir 5rb', [a('expense', 30_000, { date: KEMARIN }), a('expense', 5000, { date: T })]],
  ['m21', 'multi coref ambiguous', 'makan 30rb, parkir 5rb, yang ketiga pakai bca', [a('expense', 30_000, { wallet: null }), a('expense', 5000, { wallet: null })]],
  ['m22', 'multi mixed', 'gaji 7jt masuk bca terus nabung 1jt ke dana darurat', [a('income', 7_000_000, { wallet: 'bca' }), a('target', 1_000_000, { link: 'f1' })]],

  // Corrections.
  ['k01', 'correction money', 'makan 30rb eh 35rb', [a('expense', 35_000)]],
  ['k02', 'correction wallet', 'makan 30rb pakai gopay, bukan bca', [a('expense', 30_000, { wallet: 'gopay' })]],
  ['k03', 'correction wallet', 'bensin 50rb pakai bca eh gopay', [a('expense', 50_000, { wallet: 'gopay' })]],
  ['k04', 'correction date', 'kemarin, eh tadi pagi makan 20rb', [a('expense', 20_000, { date: T })]],
  ['k05', 'correction kind', 'bukan pengeluaran, transfer 200rb dari bca ke gopay', [a('transfer', 200_000, { wallet: 'bca', to: 'gopay' })]],
  ['k06', 'correction money', 'makan 50rb maksudnya 45rb', [a('expense', 45_000)]],

  // Conflicts and missing facts: must be marked, never guessed.
  ['z01', 'conflict transfer', 'tf 100rb dari bca ke bca', [a('transfer', 100_000, { to: null, review: ['to'] })]],
  ['z02', 'conflict wallet', 'makan 20rb pakai gopay pakai bca', [a('expense', 20_000, { review: ['wallet'] })]],
  ['z03', 'conflict date', 'makan 25rb kemarin 30 september', [a('expense', 25_000, { review: ['date'] })]],
  ['z04', 'conflict money budget', 'budget makan 2jt dan 3jt', [a('budget', undefined, { review: ['amount'] })]],
  ['z05', 'ambiguous transfer', 'tf 200rb ke gopay', [a('transfer', 200_000, { wallet: null, to: 'gopay', review: ['wallet'] })]],
  ['z06', 'ambiguous transfer', 'transfer 500rb', [a('transfer', 500_000, { wallet: null, to: null, review: ['wallet', 'to'] })]],
  ['z07', 'ambiguous balance', 'saldo sekarang 2jt', [a('balance', 2_000_000, { wallet: null, review: ['wallet'] })]],
  ['z08', 'conflict money', 'makan 30rb 35rb', [a('expense', undefined, { review: ['amount'] })]],

  // Held out: written after the engine was built and never used to tune it. Reported on their own.
  ['h01', 'holdout clean', 'abis isi bensin 40rb di pertamina', [a('expense', 40_000, { category: 'fuel' })]],
  ['h02', 'holdout date', 'barusan bayar parkir 3rb', [a('expense', 3000, { date: T, category: 'park' })]],
  ['h03', 'holdout date wallet', 'kemarin malam makan bareng temen 120rb pake ovo', [a('expense', 120_000, { date: KEMARIN, wallet: 'ovo', category: 'food' })]],
  ['h04', 'holdout wallet', 'gajian masuk jenius 8,2jt', [a('income', 8_200_000, { wallet: 'jenius', category: 'salary' })]],
  ['h05', 'holdout transfer', 'pindahin 300rb dari jenius ke gopay', [a('transfer', 300_000, { wallet: 'jenius', to: 'gopay' })]],
  ['h06', 'holdout transfer', 'isi saldo ovo 50rb pake bca', [a('transfer', 50_000, { wallet: 'bca', to: 'ovo' })]],
  ['h07', 'holdout transfer ambiguous', 'top up gopay 75rb', [a('transfer', 75_000, { wallet: null, to: 'gopay', review: ['wallet'] })]],
  ['h08', 'holdout transfer ambiguous', 'tarik tunai 1jt', [a('transfer', 1_000_000, { wallet: null, to: 'cash', review: ['wallet'] })]],
  ['h09', 'holdout category', 'beli token listrik 200rb', [a('expense', 200_000, { category: 'elec' })]],
  ['h10', 'holdout multi segmentation', 'beli pulsa 25rb sama kuota 50rb', [a('expense', 25_000), a('expense', 50_000)]],
  ['h11', 'holdout multi segmentation', 'ongkos ojek 15rb terus beli es kopi 22rb', [a('expense', 15_000), a('expense', 22_000)]],
  ['h12', 'holdout multi date', 'tadi siang makan padang 28rb, sore ngopi 25rb', [a('expense', 28_000, { date: T }), a('expense', 25_000, { date: T })]],
  ['h13', 'holdout multi inheritance', 'kemarin beli sayur 30rb sama bayar laundry 45rb', [a('expense', 30_000, { date: KEMARIN }), a('expense', 45_000, { date: KEMARIN })]],
  ['h14', 'holdout debt person', 'budi minjemin aku 300rb', [a('debt_new', 300_000, { person: 'Budi' })]],
  ['h15', 'holdout debt record', 'cicil utang budi 100rb', [a('debt_payment', 100_000, { link: 'd2' })]],
  ['h16', 'holdout receivable record', 'andi udah balikin 150rb', [a('receivable_payment', 150_000, { link: 'r1' })]],
  ['h17', 'holdout claim', 'talangin makan siang tim kantor 250rb, nanti diklaim', [a('claim_new', 250_000)]],
  ['h18', 'holdout claim record', 'uang hotel bandung udah cair 900rb', [a('claim_payment', 900_000, { link: 'c1' })]],
  ['h19', 'holdout fund record', 'setor 200rb ke liburan bali', [a('target', 200_000, { link: 'f2' })]],
  ['h20', 'holdout budget', 'anggaran bensin 600rb per bulan', [a('budget', 600_000, { category: 'fuel' })]],
  ['h21', 'holdout budget record', 'kurangi budget makan 300rb', [a('budget', 1_700_000)]],
  ['h22', 'holdout recurring', 'tiap tanggal 1 bayar wifi 350rb', [a('recurring_new', 350_000, { date: '2026-10-01' })]],
  ['h23', 'holdout recurring', 'bayar bpjs 150rb tiap bulan', [a('recurring_new', 150_000)]],
  ['h24', 'holdout plan', 'lusa bayar servis ac 250rb', [a('plan_new', 250_000, { date: '2026-09-28' })]],
  ['h25', 'holdout reminder', 'jangan lupa bayar pbb tanggal 30', [a('note_new', undefined, { date: '2026-09-30' })]],
  ['h26', 'holdout wish', 'pengen sepatu lari 900rb prioritas tinggi', [a('wish_new', 900_000)]],
  ['h27', 'holdout nav', 'lihat anggaran', [a('open')]],
  ['h28', 'holdout menu', 'subkategori tol di transportasi', [a('category_new')]],
  ['h29', 'holdout balance', 'saldo ovo tinggal 12rb', [a('balance', 12_000, { wallet: 'ovo' })]],
  ['h30', 'holdout wallet', 'beli hadiah ultah 200rb promo shopeepay', [a('expense', 200_000, { wallet: null })]],
  ['h31', 'holdout correction', 'makan 35rb eh 38rb pakai gopay', [a('expense', 38_000, { wallet: 'gopay' })]],
  ['h32', 'holdout correction', 'bayar kos 1,5jt pakai jenius, bukan bca', [a('expense', 1_500_000, { wallet: 'jenius' })]],
  ['h33', 'holdout conflict', 'tf 250rb dari ovo ke ovo', [a('transfer', 250_000, { to: null, review: ['to'] })]],
  ['h34', 'holdout coref', 'kopi 20rb, roti 15rb, semuanya pakai ovo', [a('expense', 20_000, { wallet: 'ovo' }), a('expense', 15_000, { wallet: 'ovo' })]],
  ['h35', 'holdout coref', 'bensin 50rb pakai bca, makan 30rb, yang makan pakai tunai', [a('expense', 50_000, { wallet: 'bca' }), a('expense', 30_000, { wallet: 'cash' })]],
  ['h36', 'holdout inheritance date', 'senin kemarin makan 30rb, parkir 2rb', [a('expense', 30_000, { date: '2026-09-21' }), a('expense', 2000, { date: '2026-09-21' })]],
  ['h37', 'holdout negative', 'thanks ya', []],
  ['h38', 'holdout negative', 'hari ini hujan', []],
  ['h39', 'holdout negative', 'rapat jam 10 di lantai 5', []],
  ['h40', 'holdout ambiguous', 'bayar 50rb', [a('expense', 50_000, { review: ['category'] })]],
  ['h41', 'holdout multi mixed', 'gaji 7jt, zakat 175rb, sisanya nabung 2jt ke dana darurat', [a('income', 7_000_000), a('expense', 175_000), a('target', 2_000_000, { link: 'f1' })]],
  ['h42', 'holdout multi slang', 'mkn siang 25rb pk tunai trs parkir 2rb', [a('expense', 25_000, { wallet: 'cash' }), a('expense', 2000)]],
  ['h43', 'holdout date', 'beli obat 45rb di apotek kemarin sore', [a('expense', 45_000, { date: KEMARIN })]],
  ['h44', 'holdout debt record', 'bayar cicilan kredivo 1,2jt', [a('debt_payment', 1_200_000, { link: 'd1' })]],
  ['h45', 'holdout debt ambiguous', 'bayar cicilan mobil 3jt', [a('expense', 3_000_000, { link: null })]],
];

export const cases = raw.map(([id, tags, text, actions, options = {}]) => ({ id, tags: tags.split(' '), text, actions, ...options }));
