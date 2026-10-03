/**
 * Dompet Ajaib 5.0 — the Feature Registry: one canonical list of what the app can do.
 *
 * Search, the "Lainnya" menu, the sidebar, Jelajahi Dompet Ajaib (all features), "Yang bisa dilakukan di sini" and the
 * Discovery Engine all read this list, so a capability is described once. Nothing here decides money: it only says where
 * a capability lives, how people may call it, how much it should compete for attention by default, and which data makes
 * it relevant.
 *
 * Complexity sets default prominence only (never availability):
 *   core     always easy to reach (record, available money, wallets, recent activity, budget state)
 *   common   shown when relevant (claims, receivables, debts, recurring, goals)
 *   advanced reached through context, search or Jelajahi (reconcile, interest, cycle settings, scenarios)
 *   expert   still reachable, never competes with everyday tasks (resync, backup restore, account deletion)
 */

export type Complexity = 'core' | 'common' | 'advanced' | 'expert';
export type IntentGroup = 'catat' | 'uang' | 'kewajiban' | 'rencana' | 'pahami' | 'otomatis' | 'sistem';
/** How a feature is opened. `view` keys are the page keys of app/page.tsx; `focus` is the page's own deep link. */
export type FeatureAction =
  | { kind: 'view'; view: string; focus?: string }
  | { kind: 'tx'; type?: 'expense' | 'income' | 'transfer' | 'debt_payment' }
  | { kind: 'scan' }
  | { kind: 'quick' };
/** Data that makes a feature relevant (Discovery Engine) or shows it is already used ("learned"). */
export type Signal =
  | 'wallets' | 'savingsWallet' | 'interestWallet' | 'manyWallets' | 'kantong'
  | 'tx' | 'manyTx' | 'receiptTx' | 'manyReceipts' | 'repeatPayment' | 'splitBill'
  | 'budgets' | 'budgetPressure' | 'claims' | 'oldClaim' | 'receivables' | 'debts' | 'funds' | 'wishlist'
  | 'recurring' | 'plans' | 'inbox' | 'notes' | 'cycles' | 'fullCycle' | 'healthIssues' | 'lexicon' | 'pin' | 'reminders';

export type FeatureDef = {
  id: string;
  /** User-facing name (Indonesian, the app's own words). */
  name: string;
  /** One short sentence: what it does for the user. */
  description: string;
  group: IntentGroup;
  action: FeatureAction;
  /** User-language words and synonyms, including English and how people describe the need ("uang balik"). */
  keywords: string[];
  complexity: Complexity;
  /** Icon name, mapped to lucide-react in components/feature-icons.tsx. */
  icon: string;
  /** A top-level destination (page) rather than an action or sub-feature. */
  page?: boolean;
  /** The page this capability lives on (for "Yang bisa dilakukan di sini"). */
  on?: string;
  /** Data that makes it relevant now. */
  relevant?: Signal[];
  /** Data that shows the user already uses it (no more beginner promotion). */
  learned?: Signal[];
  /** Tanya Jawab item that explains it (lib/help-content.ts id). */
  help?: string;
};

export const intentGroups: { id: IntentGroup; title: string; lead: string; icon: string }[] = [
  { id: 'catat', title: 'Catat', lead: 'Mencatat uang masuk dan keluar dengan cara paling cepat.', icon: 'plus' },
  { id: 'uang', title: 'Kelola uang', lead: 'Di mana uangmu ada, dan seberapa banyak yang aman dipakai.', icon: 'wallet' },
  { id: 'kewajiban', title: 'Utang, piutang & klaim', lead: 'Uang yang harus dibayar, dan uang yang masih harus kembali.', icon: 'handcoins' },
  { id: 'rencana', title: 'Rencanakan', lead: 'Batas belanja, target, dan uang yang akan datang.', icon: 'target' },
  { id: 'pahami', title: 'Pahami', lead: 'Ke mana uang pergi, apa yang berubah, dan apa yang penting.', icon: 'lightbulb' },
  { id: 'otomatis', title: 'Otomatisasi', lead: 'Biarkan aplikasi mengingat dan menghitung untukmu.', icon: 'repeat' },
  { id: 'sistem', title: 'Data & pengaturan', lead: 'Akun, tampilan, keamanan, dan kesehatan data.', icon: 'settings' },
];

const v = (view: string, focus?: string): FeatureAction => ({ kind: 'view', view, ...(focus ? { focus } : {}) });

export const features: FeatureDef[] = [
  // ——— Catat ———
  { id: 'record', name: 'Catat transaksi', description: 'Pengeluaran, pemasukan, atau transfer lewat formulir.', group: 'catat', action: { kind: 'tx' }, keywords: ['tambah', 'input', 'catat', 'transaksi baru', 'add', 'record', 'pengeluaran baru', 'pemasukan baru', 'belanja', 'beli'], complexity: 'core', icon: 'plus', help: 'start-first-tx' },
  { id: 'record-expense', name: 'Catat pengeluaran', description: 'Uang keluar untuk belanja atau bayar sesuatu.', group: 'catat', action: { kind: 'tx', type: 'expense' }, keywords: ['keluar', 'expense', 'belanja', 'bayar', 'jajan', 'spend'], complexity: 'core', icon: 'down' },
  { id: 'record-income', name: 'Catat pemasukan', description: 'Gaji, bonus, atau uang masuk lain.', group: 'catat', action: { kind: 'tx', type: 'income' }, keywords: ['masuk', 'income', 'gaji', 'gajian', 'bonus', 'terima uang'], complexity: 'core', icon: 'up' },
  { id: 'record-transfer', name: 'Transfer antardompet', description: 'Pindahkan uang dari satu dompet ke dompet lain, termasuk biaya admin.', group: 'catat', action: { kind: 'tx', type: 'transfer' }, keywords: ['transfer', 'pindah', 'tf', 'top up', 'topup', 'isi saldo', 'tarik tunai', 'kirim ke rekening sendiri'], complexity: 'core', icon: 'transfer' },
  { id: 'quick', name: 'Catat otomatis', description: 'Tulis seperti chat ("mkn 25k jago"), semua menu terisi sendiri.', group: 'catat', action: { kind: 'quick' }, keywords: ['otomatis', 'chat', 'tulis', 'ketik', 'cepat', 'quick entry', 'catat otomatis', 'kalimat', 'ai'], complexity: 'core', icon: 'sparkles', help: 'h-quick-text' },
  { id: 'scan', name: 'Scan struk', description: 'Foto struk atau nota, nominal dan isinya dibaca otomatis.', group: 'catat', action: { kind: 'scan' }, keywords: ['struk', 'nota', 'foto', 'scan', 'receipt', 'kamera', 'ocr', 'bon', 'kwitansi'], complexity: 'core', icon: 'scan', learned: ['receiptTx'] },
  { id: 'inbox', name: 'Perlu dikonfirmasi', description: 'Tagihan rutin yang sudah jatuh tempo, menunggu kamu setujui.', group: 'catat', action: v('inbox'), keywords: ['konfirmasi', 'draft', 'draf', 'menunggu', 'inbox', 'persetujuan', 'tagihan jatuh tempo'], complexity: 'common', icon: 'inbox', page: true, relevant: ['inbox'] },
  { id: 'transactions', name: 'Transaksi', description: 'Semua uang masuk, keluar, dan pindah, bisa dicari dan difilter.', group: 'catat', action: v('transactions'), keywords: ['riwayat', 'history', 'mutasi', 'daftar transaksi', 'cari transaksi', 'filter', 'apa yang terjadi'], complexity: 'core', icon: 'list', page: true },

  // ——— Kelola uang ———
  { id: 'wallets', name: 'Dompet', description: 'Saldo setiap rekening, e-wallet, dan uang tunai.', group: 'uang', action: v('wallets'), keywords: ['saldo', 'rekening', 'bank', 'e-wallet', 'ewallet', 'tunai', 'cash', 'akun', 'wallet', 'di mana uangku'], complexity: 'core', icon: 'wallet', page: true },
  { id: 'wallet-add', name: 'Tambah dompet', description: 'Rekening, e-wallet, kartu, atau tabungan baru.', group: 'uang', action: v('wallets', 'add'), keywords: ['dompet baru', 'rekening baru', 'tambah rekening', 'add wallet'], complexity: 'core', icon: 'plus', on: 'wallets' },
  { id: 'available', name: 'Uang tersedia & uang bebas', description: 'Uang yang aman dipakai setelah dana disisihkan dan tagihan dekat.', group: 'uang', action: v('dashboard', 'why'), keywords: ['uang bebas', 'uang tersedia', 'uang yang bisa dipakai', 'uang aman', 'sisa uang', 'available', 'free money', 'jatah aman'], complexity: 'core', icon: 'sparkles', help: 't-available' },
  { id: 'kantong', name: 'Kantong', description: 'Kelompokkan dompet untuk satu tujuan, misalnya dana darurat. Tidak ikut uang bebas.', group: 'uang', action: v('wallets', 'kantong'), keywords: ['kantong', 'pocket', 'amplop', 'pisahkan uang', 'dana darurat', 'sisihkan', 'disimpan'], complexity: 'common', icon: 'layers', on: 'wallets', relevant: ['manyWallets'], learned: ['kantong'], help: 't-kantong' },
  { id: 'interest', name: 'Bunga otomatis dompet', description: 'Hitung dan catat bunga tabungan harian atau bulanan secara otomatis.', group: 'uang', action: v('wallets', 'interest'), keywords: ['bunga', 'interest', 'bunga tabungan', 'bunga harian', 'imbal hasil', 'deposito', 'jenius', 'seabank', 'bunga otomatis'], complexity: 'advanced', icon: 'percent', on: 'wallets', relevant: ['savingsWallet'], learned: ['interestWallet'] },
  { id: 'reconcile', name: 'Cocokkan saldo', description: 'Isi saldo asli di bank, aplikasi mencatat selisihnya.', group: 'uang', action: v('wallets', 'reconcile'), keywords: ['rekonsiliasi', 'reconcile', 'cocokkan', 'samakan saldo', 'saldo beda', 'saldo tidak sama', 'koreksi saldo', 'sesuaikan saldo'], complexity: 'advanced', icon: 'scale', on: 'wallets', help: 't-adjust' },
  { id: 'recalculate', name: 'Hitung ulang saldo', description: 'Samakan saldo tersimpan dengan semua transaksi dompet itu.', group: 'uang', action: v('wallets', 'recalculate'), keywords: ['hitung ulang', 'recalculate', 'saldo salah', 'perbaiki saldo'], complexity: 'expert', icon: 'refresh', on: 'wallets', help: 't-adjust' },
  { id: 'wallet-archive', name: 'Arsipkan dompet', description: 'Sembunyikan dompet yang tidak dipakai, riwayatnya tetap ada.', group: 'uang', action: v('wallets'), keywords: ['arsip', 'hapus dompet', 'tutup rekening', 'archive'], complexity: 'advanced', icon: 'archive', on: 'wallets' },
  { id: 'categories', name: 'Kategori', description: 'Kategori dan subkategori pengeluaran dan pemasukan.', group: 'uang', action: v('categories'), keywords: ['kategori', 'subkategori', 'category', 'jenis pengeluaran', 'gabung kategori', 'label'], complexity: 'common', icon: 'layers', page: true },

  // ——— Utang, piutang & klaim ———
  { id: 'debts', name: 'Utang & cicilan', description: 'Yang masih harus kamu bayar, sisa dan cicilannya.', group: 'kewajiban', action: v('debts'), keywords: ['utang', 'hutang', 'cicilan', 'pinjaman', 'kredit', 'paylater', 'kredivo', 'kpr', 'debt', 'loan', 'yang harus dibayar'], complexity: 'common', icon: 'card', page: true, relevant: ['debts'], learned: ['debts'], help: 't-debt' },
  { id: 'debt-pay', name: 'Bayar utang', description: 'Catat pembayaran cicilan atau pelunasan.', group: 'kewajiban', action: { kind: 'tx', type: 'debt_payment' }, keywords: ['bayar cicilan', 'lunasi utang', 'bayar utang', 'angsuran'], complexity: 'common', icon: 'card', on: 'debts', relevant: ['debts'] },
  { id: 'receivables', name: 'Piutang', description: 'Uang yang kamu pinjamkan dan masih harus kembali.', group: 'kewajiban', action: v('receivables'), keywords: ['piutang', 'dipinjam', 'pinjamkan', 'uang balik', 'uang kembali', 'teman pinjam', 'talangan teman', 'receivable', 'ditagih'], complexity: 'common', icon: 'handcoins', page: true, relevant: ['receivables'], learned: ['receivables'], help: 't-receivable' },
  { id: 'claims', name: 'Klaim kantor', description: 'Uang kerja yang kamu talangi dan menunggu diganti kantor, termasuk cair sebagian.', group: 'kewajiban', action: v('claims'), keywords: ['klaim', 'claim', 'reimburse', 'reimbursement', 'penggantian', 'talangan kantor', 'dinas', 'uang kantor', 'uang balik'], complexity: 'common', icon: 'shield', page: true, relevant: ['claims'], learned: ['claims'], help: 't-claim' },
  { id: 'splitbill', name: 'Split Bill', description: 'Bagi tagihan bareng teman per item atau rata, lalu tagih bagiannya.', group: 'kewajiban', action: v('splitbill'), keywords: ['split', 'split bill', 'patungan', 'bagi tagihan', 'bagi bill', 'urunan', 'bayarin teman', 'makan bareng'], complexity: 'common', icon: 'receipt', page: true, relevant: ['receiptTx'], learned: ['splitBill'] },
  { id: 'splitbill-new', name: 'Bagi tagihan baru', description: 'Mulai Split Bill dari struk atau isi manual.', group: 'kewajiban', action: v('splitbill', 'new'), keywords: ['split baru', 'bagi struk', 'patungan baru'], complexity: 'common', icon: 'receipt', on: 'splitbill' },
  { id: 'owedReport', name: 'Laporan utang & piutang', description: 'Ringkasan siapa berutang ke siapa, dan perkembangannya.', group: 'kewajiban', action: v('owedReport'), keywords: ['laporan utang', 'laporan piutang', 'rekap utang', 'ringkasan pinjaman'], complexity: 'advanced', icon: 'book', page: true, relevant: ['debts', 'receivables'] },
  { id: 'owedArchive', name: 'Arsip utang & piutang', description: 'Utang dan piutang yang sudah lunas.', group: 'kewajiban', action: v('owedArchive'), keywords: ['lunas', 'arsip utang', 'arsip piutang', 'riwayat pinjaman', 'selesai'], complexity: 'advanced', icon: 'archive', page: true },

  // ——— Rencanakan ———
  { id: 'budgets', name: 'Anggaran', description: 'Batas belanja per kategori, dan mana yang perlu perhatian.', group: 'rencana', action: v('budgets'), keywords: ['anggaran', 'budget', 'budgeting', 'batas belanja', 'limit', 'jatah', 'rencana belanja', 'pos'], complexity: 'core', icon: 'grid', page: true, relevant: ['manyTx'], learned: ['budgets'], help: 't-budget-types' },
  { id: 'rollover', name: 'Sisa anggaran dibawa ke periode berikutnya', description: 'Sisa (atau kelebihan) anggaran menggeser batas periode berikutnya.', group: 'rencana', action: v('budgets'), keywords: ['rollover', 'sisa dibawa', 'carry over', 'akumulasi anggaran'], complexity: 'advanced', icon: 'repeat', on: 'budgets', help: 't-rollover' },
  { id: 'funds', name: 'Tujuan dana', description: 'Target tabungan dengan tenggat, dan setoran yang perlu per bulan.', group: 'rencana', action: v('funds'), keywords: ['tujuan', 'target', 'goal', 'goals', 'tabungan', 'nabung', 'menabung', 'dp rumah', 'dana pendidikan', 'sinking fund'], complexity: 'common', icon: 'target', page: true, relevant: ['fullCycle'], learned: ['funds'], help: 't-fund' },
  { id: 'wishlist', name: 'Wish list', description: 'Barang yang ingin dibeli, kapan siap, dan masa tunggu supaya tidak impulsif.', group: 'rencana', action: v('wishlist'), keywords: ['wishlist', 'wish list', 'keinginan', 'ingin beli', 'barang impian', 'impulsif', 'cooling off'], complexity: 'common', icon: 'gift', page: true, learned: ['wishlist'] },
  { id: 'upcoming', name: 'Arus kas mendatang', description: 'Semua uang yang akan masuk dan keluar: tagihan, rencana, cicilan, klaim.', group: 'rencana', action: v('upcoming'), keywords: ['mendatang', 'akan datang', 'jadwal', 'upcoming', 'tagihan dekat', 'arus kas', 'cashflow', 'rencana pengeluaran', 'rencana'], complexity: 'common', icon: 'calendarclock', page: true, relevant: ['plans', 'recurring'] },
  { id: 'calendar', name: 'Kalender keuangan', description: 'Tagihan, rencana, gajian, dan catatan dalam satu kalender.', group: 'rencana', action: v('calendar'), keywords: ['kalender', 'calendar', 'tanggal', 'jadwal bulanan', 'catatan keuangan', 'pengingat tanggal'], complexity: 'common', icon: 'calendar', page: true, relevant: ['plans', 'notes'] },
  { id: 'whatif', name: 'Kalau beli ini?', description: 'Coba beli sesuatu: lihat dampaknya ke saldo sampai gajian.', group: 'rencana', action: v('forecast', 'whatif'), keywords: ['kalau beli', 'simulasi beli', 'mampu beli', 'boleh beli', 'what if', 'dampak pembelian'], complexity: 'advanced', icon: 'bag', on: 'forecast' },

  // ——— Pahami ———
  { id: 'insight', name: 'Insight', description: 'Yang penting di keuanganmu sekarang: keadaan, perubahan, prioritas.', group: 'pahami', action: v('advisor'), keywords: ['insight', 'saran', 'analisa', 'kondisi keuangan', 'nasihat', 'advisor', 'apa yang penting', 'kesehatan keuangan'], complexity: 'core', icon: 'lightbulb', page: true, relevant: ['fullCycle'] },
  { id: 'scenario', name: 'Skenario (simulasi)', description: 'Bagaimana kalau gaji turun, ada pengeluaran besar, atau mulai menabung.', group: 'pahami', action: v('advisor', 'lab'), keywords: ['skenario', 'simulasi', 'scenario', 'bagaimana jika', 'kalau gaji turun', 'lab'], complexity: 'advanced', icon: 'flask', on: 'advisor', relevant: ['fullCycle'] },
  { id: 'prices', name: 'Indeks harga pribadi', description: 'Perubahan harga barang yang sering kamu beli, dari struk.', group: 'pahami', action: v('advisor', 'prices'), keywords: ['harga', 'harga naik', 'inflasi', 'indeks harga', 'price', 'harga barang'], complexity: 'advanced', icon: 'tag', on: 'advisor', relevant: ['manyReceipts'] },
  { id: 'analytics', name: 'Analisis', description: 'Ke mana uang pergi, apa yang berubah, dan apa yang berulang.', group: 'pahami', action: v('analytics'), keywords: ['analisis', 'analytics', 'grafik', 'chart', 'statistik', 'ke mana uang pergi', 'pengeluaran terbesar', 'tren'], complexity: 'common', icon: 'chart', page: true, relevant: ['manyTx'] },
  { id: 'report', name: 'Laporan', description: 'Laporan bulanan dan tahunan yang lengkap, bisa diunduh.', group: 'pahami', action: v('report'), keywords: ['laporan', 'report', 'rekap', 'bulanan', 'tahunan', 'ringkasan', 'pdf', 'export'], complexity: 'common', icon: 'book', page: true, relevant: ['manyTx'] },
  { id: 'forecast', name: 'Proyeksi', description: 'Perkiraan saldo sampai gajian dan seterusnya.', group: 'pahami', action: v('forecast'), keywords: ['proyeksi', 'forecast', 'perkiraan', 'ramalan saldo', 'cukup sampai gajian', 'prediksi'], complexity: 'common', icon: 'trend', page: true, relevant: ['fullCycle'] },
  { id: 'cycles', name: 'Riwayat siklus', description: 'Ringkasan tiap siklus gaji yang sudah lewat.', group: 'pahami', action: v('cycles'), keywords: ['siklus', 'riwayat siklus', 'tutup buku', 'periode gaji', 'cycle', 'bulan lalu'], complexity: 'advanced', icon: 'scroll', page: true, relevant: ['fullCycle'], learned: ['cycles'], help: 't-cycle-close' },

  // ——— Otomatisasi ———
  { id: 'recurring', name: 'Rutin', description: 'Tagihan dan langganan yang terjadi berkala, dicatat atau diingatkan otomatis.', group: 'otomatis', action: v('recurring'), keywords: ['rutin', 'recurring', 'berulang', 'tagihan', 'bayar bulanan', 'langganan', 'subscription', 'tagihan bulanan', 'otomatis tiap bulan', 'spotify', 'netflix', 'listrik', 'internet'], complexity: 'common', icon: 'repeat', page: true, relevant: ['repeatPayment'], learned: ['recurring'] },
  { id: 'reminders', name: 'Pengingat', description: 'Ingatkan perbarui saldo dan tagihan di jam yang kamu pilih.', group: 'otomatis', action: v('settings', 'reminders'), keywords: ['pengingat', 'reminder', 'notifikasi', 'alarm', 'ingatkan', 'notif'], complexity: 'common', icon: 'bell', learned: ['reminders'] },
  { id: 'lexicon', name: 'Bahasa Saya', description: 'Kata, nama, dan singkatan pribadimu untuk Catat otomatis.', group: 'otomatis', action: v('settings', 'language'), keywords: ['kamus', 'kamus pribadi', 'bahasa saya', 'singkatan', 'alias', 'nama tempat', 'personalisasi'], complexity: 'advanced', icon: 'bookopen', learned: ['lexicon'], help: 'h-quick-text' },

  // ——— Data & pengaturan ———
  { id: 'health', name: 'Periksa data', description: 'Temukan saldo atau data yang tidak konsisten, lalu perbaiki.', group: 'sistem', action: v('health'), keywords: ['periksa data', 'data error', 'data salah', 'kesehatan data', 'health', 'tidak konsisten', 'bug', 'cek data', 'audit'], complexity: 'advanced', icon: 'pulse', page: true, relevant: ['healthIssues'] },
  { id: 'settings', name: 'Pengaturan', description: 'Akun, gaji, tampilan, keamanan, dan data.', group: 'sistem', action: v('settings'), keywords: ['pengaturan', 'setting', 'settings', 'atur', 'preferensi', 'konfigurasi'], complexity: 'core', icon: 'settings', page: true },
  { id: 'profile', name: 'Profil & gaji', description: 'Nama, tanggal gajian, perkiraan gaji, dan dompet bawaan.', group: 'sistem', action: v('settings', 'profile'), keywords: ['profil', 'gaji', 'tanggal gajian', 'siklus gaji', 'nama', 'zona waktu', 'dompet bawaan'], complexity: 'common', icon: 'user' },
  { id: 'control', name: 'Kontrol keuangan', description: 'Cara hitung uang tersedia, cadangan aman, aset bersih, dan batas anggaran.', group: 'sistem', action: v('settings', 'control'), keywords: ['kontrol', 'cadangan', 'buffer', 'aset bersih', 'net worth', 'cara hitung', 'horizon tagihan', 'uang tersedia'], complexity: 'advanced', icon: 'sliders', help: 't-available' },
  { id: 'security', name: 'Keamanan', description: 'PIN aplikasi, sidik jari, dan password.', group: 'sistem', action: v('settings', 'security'), keywords: ['pin', 'password', 'kata sandi', 'keamanan', 'kunci', 'sidik jari', 'biometrik', 'lock'], complexity: 'common', icon: 'key', learned: ['pin'] },
  { id: 'appearance', name: 'Tampilan', description: 'Tema warna, mode gelap, huruf, dan ukuran teks.', group: 'sistem', action: v('settings', 'appearance'), keywords: ['tema', 'tampilan', 'mode gelap', 'dark mode', 'warna', 'font', 'huruf', 'ukuran teks', 'theme'], complexity: 'common', icon: 'palette' },
  { id: 'home-layout', name: 'Atur Beranda', description: 'Pilih, urutkan, atau sembunyikan kartu di Beranda.', group: 'sistem', action: v('dashboard', 'customize'), keywords: ['atur beranda', 'widget', 'kartu beranda', 'dashboard', 'susun beranda', 'tambah kartu'], complexity: 'common', icon: 'grid' },
  { id: 'hide-amounts', name: 'Sembunyikan nominal', description: 'Tutup semua angka dengan tombol mata di atas.', group: 'sistem', action: v('dashboard'), keywords: ['sembunyikan', 'privasi', 'hide', 'samarkan nominal', 'mata'], complexity: 'common', icon: 'eye' },
  { id: 'backup', name: 'Cadangan data', description: 'Unduh semua data dalam satu file, atau pulihkan dari file.', group: 'sistem', action: v('settings', 'data'), keywords: ['backup', 'cadangan', 'unduh data', 'export', 'import', 'pulihkan', 'restore', 'json'], complexity: 'advanced', icon: 'database' },
  { id: 'resync', name: 'Sinkronkan ulang', description: 'Muat ulang semua data dari cloud kalau perangkat terasa tidak cocok.', group: 'sistem', action: v('settings', 'data'), keywords: ['sinkron', 'sync', 'muat ulang', 'data beda perangkat', 'refresh data'], complexity: 'expert', icon: 'refresh' },
  { id: 'install', name: 'Pasang aplikasi', description: 'Pasang ke layar utama agar cepat dibuka dan bisa offline.', group: 'sistem', action: v('settings', 'app'), keywords: ['pasang', 'install', 'pwa', 'layar utama', 'offline', 'aplikasi hp'], complexity: 'common', icon: 'phone' },
  { id: 'about', name: 'Info aplikasi', description: 'Versi, apa yang baru, dan tentang Dompet Ajaib.', group: 'sistem', action: v('settings', 'about'), keywords: ['versi', 'apa yang baru', 'changelog', 'update', 'tentang', 'about'], complexity: 'common', icon: 'info' },
  { id: 'account-danger', name: 'Reset data atau hapus akun', description: 'Kosongkan semua data atau hapus akun secara permanen.', group: 'sistem', action: v('settings', 'danger'), keywords: ['hapus akun', 'reset data', 'hapus semua', 'delete account', 'mulai dari nol'], complexity: 'expert', icon: 'alert' },
  { id: 'help', name: 'Tanya Jawab', description: 'Arti istilah, fungsi setiap menu, dan cara pakai.', group: 'sistem', action: v('help'), keywords: ['bantuan', 'help', 'tanya jawab', 'faq', 'cara pakai', 'panduan', 'istilah'], complexity: 'core', icon: 'help', page: true },
  { id: 'explore', name: 'Jelajahi Dompet Ajaib', description: 'Semua fitur dalam satu halaman, dikelompokkan menurut kebutuhan.', group: 'sistem', action: v('explore'), keywords: ['semua fitur', 'jelajahi', 'fitur', 'menu lengkap', 'explore', 'all features'], complexity: 'core', icon: 'compass', page: true },
];

export const featureById = (id: string) => features.find(f => f.id === id);
export const featuresIn = (group: IntentGroup) => features.filter(f => f.group === group);
/** Capabilities that live on one page (for "Yang bisa dilakukan di sini"). */
export const featuresOn = (view: string) => features.filter(f => f.on === view || (f.action.kind === 'view' && f.action.view === view && f.action.focus && !f.page));

// ——— Search ———

const fold = (s: string) => s.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Levenshtein distance, capped (conservative typo tolerance). */
function distance(a: string, b: string, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), prevPrev: number[] = [];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Two neighbouring letters swapped ("spilt" → "split") is one typo.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], (prevPrev[j - 2] ?? Infinity) + 1);
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prevPrev = prev; prev = row;
  }
  return prev[b.length];
}
/** How well one query word matches one text: whole word 3, prefix 2, inside a name 1.2, one typo (5+ letters) 1. */
function wordScore(q: string, words: string[], text: string, inside = false) {
  if (words.includes(q)) return 3;
  if (words.some(w => w.startsWith(q)) && q.length >= 2) return 2;
  // Inside a word only for names ("bunga" must not find "ta-bunga-n" in a description).
  if (inside && q.length >= 4 && text.includes(q)) return 1.2;
  if (q.length >= 5 && words.some(w => w.length >= 4 && distance(q, w, q.length >= 8 ? 2 : 1) <= (q.length >= 8 ? 2 : 1))) return 1;
  return 0;
}
export type SearchHit<T> = { item: T; score: number };
/**
 * Scores searchable rows: name counts most, then keywords (user language), then description. Every query word must
 * match something (AND), so "bunga tabungan" finds wallet interest but "bunga mawar" finds nothing.
 */
export function searchRows<T>(rows: T[], query: string, fields: (row: T) => { name: string; keywords?: string[]; description?: string; boost?: number }): SearchHit<T>[] {
  const q = fold(query);
  if (!q) return [];
  const terms = q.split(' ').filter(Boolean);
  const out: SearchHit<T>[] = [];
  for (const row of rows) {
    const f = fields(row), name = fold(f.name), keys = (f.keywords || []).map(fold), desc = fold(f.description || '');
    const nameWords = name.split(' '), keyText = keys.join(' | '), keyWords = keyText.split(/[ |]+/), descWords = desc.split(' ');
    let total = 0, ok = true;
    // A keyword phrase typed whole ("uang balik", "kalau beli") is the strongest signal after the name itself.
    if (keys.includes(q)) total += 6;
    if (name === q) total += 8; else if (name.startsWith(q)) total += 4;
    for (const t of terms) {
      const s = Math.max(wordScore(t, nameWords, name, true) * 1.6, wordScore(t, keyWords, keyText) * 1.2, wordScore(t, descWords, desc) * 0.6);
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok && total > 0) out.push({ item: row, score: total + (f.boost || 0) });
  }
  return out.sort((a, b) => b.score - a.score);
}
/** Pages are a little ahead of sub-features with the same match, everyday ones ahead of expert ones. */
export const searchFeatures = (query: string, list: FeatureDef[] = features) => searchRows(list, query, f => ({ ...f, boost: (f.page ? 1 : 0) + (f.complexity === 'expert' ? -0.5 : 0) }));
