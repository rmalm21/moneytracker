/**
 * Tanya Jawab: terms, what every menu does, and how-tos. Answers may mark key words as **bold**.
 * `go` opens the related page (`target` picks a Pengaturan section); `children` are follow-up questions shown inside the answer.
 */
export type HelpItem = { id: string; q: string; a: string; steps?: string[]; tip?: string; go?: { view: string; label: string; target?: string }; children?: HelpItem[]; keywords?: string };
export type HelpGroup = { id: string; title: string; lead: string; icon: 'rocket' | 'book' | 'compass' | 'wand' | 'shield' | 'wrench'; items: HelpItem[] };

export const helpGroups: HelpGroup[] = [
  {
    id: 'start', title: 'Mulai cepat', lead: 'Langkah pertama supaya semua angka langsung benar.', icon: 'rocket',
    items: [
      { id: 'start-order', q: 'Apa yang sebaiknya diatur pertama kali?', a: 'Urutan yang paling enak: **dompet → gaji → kategori → anggaran**. Setelah itu cukup catat transaksi harian; semua laporan dan saran terisi sendiri.', steps: ['Buka **Dompet**, tambahkan semua rekening, e-wallet, dan uang tunai dengan saldo sekarang.', 'Buka **Pengaturan → Profil & gaji**, isi tanggal gajian dan perkiraan gaji bulanan.', 'Periksa **Kategori**; tambah atau ubah sesuai kebiasaanmu.', 'Buat **Anggaran** untuk pos yang ingin dijaga, misalnya Makan atau Hiburan.'], go: { view: 'wallets', label: 'Buka Dompet' } },
      { id: 'start-first-tx', q: 'Bagaimana mencatat transaksi pertama?', a: 'Tekan tombol **+** (di tengah bawah pada HP, atau **Catat transaksi** di kanan atas pada komputer). Pilih jenisnya — pengeluaran (**Keluar**), pemasukan (**Masuk**), atau **Transfer** — isi nominal, pilih kategori dan dompet, lalu **Simpan**.', tip: 'Kategori yang sering dipakai muncul sebagai pilihan cepat di atas daftar kategori.' },
      { id: 'start-daily', q: 'Kebiasaan harian yang disarankan?', a: 'Catat setiap pengeluaran saat itu juga, lalu sekali sehari cocokkan saldo dompet dengan saldo aslinya. Nyalakan **Pengingat** di Pengaturan agar diingatkan di jam yang kamu pilih.', go: { view: 'settings', label: 'Atur Pengingat', target: 'reminders' } },
    ],
  },
  {
    id: 'terms', title: 'Istilah', lead: 'Arti kata-kata yang sering muncul di aplikasi.', icon: 'book',
    items: [
      { id: 't-free', q: 'Uang bebas', keywords: 'bisa dipakai', a: 'Uang yang **belum punya tujuan** dan aman dibelanjakan: saldo dompet yang bisa dipakai, dikurangi dompet yang masuk **kantong** dan uang yang sudah terkumpul untuk **tujuan dana**. Dompet bertanda **Disimpan** tidak dihitung.', children: [
        { id: 't-free-vs', q: 'Bedanya dengan Total saldo?', a: '**Total saldo** menjumlah semua dompet, termasuk tabungan dan investasi. **Uang bebas** hanya uang yang benar-benar boleh dipakai sekarang.' },
        { id: 't-free-change', q: 'Bagaimana mengubah cara hitungnya?', a: 'Di **Pengaturan → Kontrol keuangan** kamu bisa memilih dompet mana yang ikut uang bebas, dan melihat rinciannya dengan angkamu sendiri.', go: { view: 'settings', label: 'Buka Kontrol keuangan', target: 'control' } },
      ] },
      { id: 't-available', q: 'Uang tersedia', a: '**Uang bebas** dikurangi **tagihan & rencana yang belum dibayar** (sampai gajian, 7 hari, atau 30 hari — bisa dipilih) dan **cadangan aman** kalau kamu mengaturnya. Inilah angka yang aman dipakai sampai gajian.', go: { view: 'settings', label: 'Atur di Kontrol keuangan', target: 'control' } },
      { id: 't-networth', q: 'Aset bersih', a: 'Seluruh saldo dompet yang dihitung **dikurangi utang** yang belum lunas. Piutang dan klaim kantor bisa ikut dihitung atau tidak, sesuai pengaturanmu.' },
      { id: 't-reserved', q: 'Dompet Disimpan', a: 'Tanda untuk dompet yang tidak dipakai belanja, misalnya tabungan atau investasi. Saldonya tetap masuk aset, tapi **tidak masuk uang bebas**.' },
      { id: 't-cycle', q: 'Siklus gaji', a: 'Satu periode dari tanggal gajian sampai sehari sebelum gajian berikutnya, misalnya 25 Agustus – 24 September. Anggaran, laporan, dan Insight memakai siklus ini.', children: [
        { id: 't-cycle-close', q: 'Apa artinya menutup siklus?', a: 'Menyimpan ringkasan satu siklus — pemasukan, pengeluaran, anggaran, aset, utang — sebagai riwayat. Transaksi lama tetap bisa diubah; laporannya dihitung ulang otomatis.', go: { view: 'cycles', label: 'Buka Riwayat siklus' } },
      ] },
      { id: 't-pp', q: 'vs PP (periode lalu)', a: 'Perbandingan dengan periode sebelumnya. Saat periode masih berjalan, periode lalu dipotong ke **jumlah hari yang sama**, jadi hari ke-10 dibandingkan dengan hari ke-10 juga.' },
      { id: 't-kantong', q: 'Kantong', keywords: 'dana darurat kelompok dompet pocket', a: 'Kelompok dompet untuk satu tujuan, misalnya **Dana darurat = Mandiri + BRI**. Saldo kantong otomatis sama dengan total saldo dompet di dalamnya, dan dompet itu tidak dihitung sebagai uang bebas.', go: { view: 'wallets', label: 'Buka Dompet' } },
      { id: 't-fund', q: 'Tujuan dana', a: 'Target tabungan dengan nominal dan tenggat, misalnya DP rumah. Aplikasi menghitung setoran yang perlu per bulan dan per minggu. Tujuan dana bisa dijadikan kantong agar saldonya mengikuti dompet tertentu.', go: { view: 'funds', label: 'Buka Tujuan dana' } },
      { id: 't-emergency', q: 'Dana darurat', a: 'Uang jaga-jaga untuk keadaan mendesak (sakit, kehilangan pekerjaan). Umumnya 3–12 bulan kebutuhan hidup. Buat kantong **Dana darurat** agar Insight bisa memantaunya.' },
      { id: 't-commit', q: 'Komitmen (tagihan & rencana)', a: 'Pengeluaran yang sudah pasti tapi belum dibayar: jadwal rutin, rencana pengeluaran, dan transaksi yang menunggu konfirmasi. Tidak mengubah saldo, tapi mengurangi uang tersedia.' },
      { id: 't-claim', q: 'Talangan & klaim kantor', keywords: 'reimburse reimbursement penggantian kantor', a: '**Talangan kantor** adalah uang pribadimu yang dipakai dulu untuk keperluan kantor. Saat kantor mengganti, tekan **Catat pencairan**. Klaim yang ditolak dicatat sebagai pengeluaranmu sendiri.' },
      { id: 't-receivable', q: 'Piutang', keywords: 'pinjamkan dipinjam teman talangan', a: 'Uang yang kamu pinjamkan ke orang lain dan belum kembali (**Talangan teman**). Bisa dilunasi lewat dompet, atau ditandai lunas tanpa dompet kalau dibayar tunai yang tidak dicatat.' },
      { id: 't-debt', q: 'Utang & cicilan', a: 'Pinjaman yang harus kamu bayar. Isi nominal cicilan per bulan agar Insight bisa menghitung beban cicilan terhadap pemasukan (sehatnya di bawah 30%).' },
      { id: 't-adjust', q: 'Koreksi, cocokkan, dan hitung ulang saldo', a: '**Koreksi saldo** menambah atau mengurangi saldo dengan satu transaksi. **Cocokkan saldo** mengisi saldo asli lalu aplikasi mencatat selisihnya. **Hitung ulang saldo** menyamakan saldo tersimpan dengan seluruh transaksi yang tercatat.' },
      { id: 't-budget-types', q: 'Jenis anggaran', a: '**Kebutuhan** untuk belanja sehari-hari, **Tagihan tetap** untuk yang nominalnya pasti, **Tujuan dana** untuk menyisihkan rutin, dan **Tabungan** untuk setoran tabungan. Anggaran bisa per siklus gaji, per bulan, per minggu, atau mulai tanggal tertentu.', children: [
        { id: 't-rollover', q: 'Sisa dibawa ke periode berikutnya?', a: 'Kalau **Sisa dibawa ke periode berikutnya** dicentang, sisa anggaran menambah batas periode berikutnya; kalau terlampaui, kelebihannya mengurangi batas berikutnya. Cocok untuk pos yang tidak rutin tiap bulan.' },
      ] },
      { id: 't-needwant', q: 'Kebutuhan vs keinginan', a: 'Insight menebak dari nama kategori: makan, tagihan, transport, dan cicilan dianggap **kebutuhan**; jajan, hiburan, dan belanja dianggap **keinginan**. Sedekah dan zakat tidak pernah disarankan untuk dikurangi.' },
      { id: 't-idle', q: 'Uang menganggur', a: 'Uang di atas kebutuhan sampai gajian, cadangan, dan target dana darurat. Insight menyarankan ke mana bisa dipindahkan sesuai profil risikomu.', children: [
        { id: 't-idle-return', q: 'Seberapa pasti angka imbal hasilnya?', keywords: 'return imbal hasil bunga investasi persen', a: 'Tidak pasti. Angka seperti **4–7% per tahun** adalah perkiraan rata-rata jangka panjang yang sudah dikurangi pajak dan biaya, hanya untuk gambaran. Hasil nyata mengikuti pasar — saham, reksa dana, dan emas bisa turun. Selalu cek imbal hasil terbaru di aplikasi atau bank resmi yang diawasi OJK sebelum membeli.' },
      ] },
      { id: 't-risk', q: 'Profil risiko', a: '**Konservatif**, **Moderat**, atau **Agresif** — seberapa siap kamu melihat nilai investasi naik-turun. Dipakai untuk menyusun contoh pembagian investasi di Insight.' },
      { id: 't-cooling', q: 'Masa pikir-pikir (wish list)', a: 'Waktu tunggu sebelum membeli: 30 hari untuk barang besar (≥ 20% pemasukan), 7 hari untuk yang lain. Membantu menghindari belanja impulsif.' },
    ],
  },
  {
    id: 'menus', title: 'Fungsi menu', lead: 'Apa isi setiap menu dan kapan dipakai.', icon: 'compass',
    items: [
      { id: 'm-home', q: 'Beranda', a: 'Ringkasan keuanganmu: uang bebas, sisa anggaran, pemasukan, pengeluaran, transaksi terbaru, grafik kategori, saldo dompet, pemasukan & pengeluaran per kategori, dan proyeksi.', children: [
        { id: 'm-home-edit', q: 'Mengatur kartu di Beranda', a: 'Ketuk tombol **Atur Beranda** (ikon pengaturan di pojok kartu atas), lalu tambah, sembunyikan, atau geser urutan kartu. Periode Beranda bisa diganti di pilihan **Periode**.' },
        { id: 'm-home-quick', q: 'Catat cepat', a: 'Tombol pintas untuk transaksi yang sering, misalnya kopi atau bensin. Satu ketukan langsung membuka form yang sudah terisi.' },
      ], go: { view: 'dashboard', label: 'Buka Beranda' } },
      { id: 'm-tx', q: 'Transaksi', a: 'Semua catatan uang masuk dan keluar. Bisa dicari, difilter per jenis, dompet, kategori, dan periode, serta diunduh sebagai CSV.', children: [
        { id: 'm-tx-swipe', q: 'Mengubah atau menghapus transaksi', a: 'Ketuk transaksinya untuk mengubah. Di HP, geser baris ke samping untuk pilihan cepat. Transaksi yang dihapus bisa dibatalkan sesaat lewat tombol **Batalkan**.' },
      ], go: { view: 'transactions', label: 'Buka Transaksi' } },
      { id: 'm-budget', q: 'Anggaran', a: 'Batas belanja per kategori — untuk seluruh kategori atau hanya beberapa subkategori pilihan. Ringkasan di atas menunjukkan sisa semua anggaran dan jatah aman per hari. Tiap kartu punya cincin pemakaian, sisa, batas, dan yang direncanakan; ketuk kartunya untuk melihat laju belanja per hari dan per minggu.', go: { view: 'budgets', label: 'Buka Anggaran' } },
      { id: 'm-insight', q: 'Insight', a: 'Pemeriksaan kesehatan keuangan dari riwayatmu: skor, rencana aksi, yang perlu dikurangi, anggaran yang bisa ditekan, uang menganggur, dan rencana gajian. Semua dihitung di perangkatmu.', children: [
        { id: 'm-insight-profile', q: 'Personalisasi Insight', a: 'Isi profil risiko, target menabung, dana darurat, dan prioritasmu agar saran lebih sesuai. Tampilan Insight juga bisa diatur urutannya dan kartunya disematkan.' },
        { id: 'm-insight-calc', q: 'Dari mana angkanya?', a: 'Hampir setiap kartu punya tombol **Dari mana angka ini?** berisi hitungan langkah demi langkah.' },
      ], go: { view: 'advisor', label: 'Buka Insight' } },
      { id: 'm-wallets', q: 'Dompet', a: 'Semua rekening dan uang tunai, dikelompokkan **Operasional**, **Tabungan**, dan **Investasi**. Tampilan bisa **Kartu** atau **Ringkas**. Dari sini juga kantong dibuat.', go: { view: 'wallets', label: 'Buka Dompet' } },
      { id: 'm-funds', q: 'Tujuan dana', a: 'Target tabungan dengan tenggat dan rencana setoran, plus kartu kantong.', go: { view: 'funds', label: 'Buka Tujuan dana' } },
      { id: 'm-wish', q: 'Wish list', a: 'Daftar barang impian dengan harga, uang yang sudah disisihkan, perkiraan kapan tercapai, dan masa pikir-pikir sebelum membeli.', go: { view: 'wishlist', label: 'Buka Wish list' } },
      { id: 'm-debts', q: 'Utang & Piutang', a: 'Tiga tab: **Utang** (pinjaman dan cicilan), **Piutang** (uang yang dipinjam orang), dan **Klaim kantor** (talangan untuk kantor).', go: { view: 'debts', label: 'Buka Utang & Piutang' } },
      { id: 'm-plan', q: 'Jadwal', a: 'Empat tab untuk yang akan datang.', children: [
        { id: 'm-plan-cash', q: 'Arus kas', a: 'Perkiraan uang masuk dan keluar dalam rentang yang dipilih, termasuk rencana, jadwal rutin, utang jatuh tempo, dan klaim yang akan cair.', go: { view: 'upcoming', label: 'Buka Arus kas' } },
        { id: 'm-plan-cal', q: 'Kalender', a: 'Semua jadwal dan catatan keuangan dalam tampilan kalender bulanan.', go: { view: 'calendar', label: 'Buka Kalender' } },
        { id: 'm-plan-rec', q: 'Rutin', a: 'Jadwal transaksi berulang (mingguan, bulanan, tahunan) dan cara memprosesnya.', go: { view: 'recurring', label: 'Buka Rutin' } },
        { id: 'm-plan-inbox', q: 'Konfirmasi', a: 'Transaksi dari jadwal rutin yang menunggu kamu periksa sebelum dicatat. Saldo belum berubah sampai dikonfirmasi.', go: { view: 'inbox', label: 'Buka Konfirmasi' } },
      ] },
      { id: 'm-reports', q: 'Laporan', a: 'Empat tab untuk melihat ke belakang dan ke depan.', children: [
        { id: 'm-rep-report', q: 'Laporan', a: 'Rangkuman satu periode atau satu tahun: arus kas, kategori, dompet, anggaran, dan posisi keuangan. Bisa dicetak atau disimpan sebagai PDF.', go: { view: 'report', label: 'Buka Laporan' } },
        { id: 'm-rep-analytics', q: 'Analisis', a: 'Grafik mendalam: kategori, tren, hari dan jam belanja, ukuran transaksi, dan tempat paling sering.', go: { view: 'analytics', label: 'Buka Analisis' } },
        { id: 'm-rep-forecast', q: 'Proyeksi', a: 'Perkiraan uang bebas sampai gajian dan 6 bulan ke depan, dengan skenario belanja lebih hemat atau lebih boros, serta simulasi "Kalau beli ini?".', go: { view: 'forecast', label: 'Buka Proyeksi' } },
        { id: 'm-rep-cycles', q: 'Riwayat siklus', a: 'Tren antarsiklus, 12 siklus terakhir, dan laporan lengkap tiap siklus: posisi keuangan, anggaran per pos, kategori, dompet, pola belanja, dan catatan.', go: { view: 'cycles', label: 'Buka Riwayat siklus' } },
      ] },
      { id: 'm-categories', q: 'Kategori', a: 'Kategori dan subkategori per jenis (Pengeluaran, Pemasukan, Tabungan, dan lainnya), lengkap dengan ikon, warna, dan pemakaiannya di siklus ini. Ketuk kategori atau subkategori untuk mengubahnya; kategori yang tidak dipakai bisa digabung atau diarsipkan.', go: { view: 'categories', label: 'Buka Kategori' } },
      { id: 'm-settings', q: 'Pengaturan', a: 'Semua pengaturan aplikasi.', children: [
        { id: 'm-set-profile', q: 'Profil & gaji', a: 'Nama, tanggal gajian, perkiraan gaji, zona waktu, dan dompet serta kategori yang otomatis terisi saat mencatat.', go: { view: 'settings', label: 'Buka Profil & gaji', target: 'profile' } },
        { id: 'm-set-security', q: 'Keamanan', a: 'PIN 4 angka, buka kunci dengan sidik jari atau wajah (di perangkat yang mendukung), dan ganti password.', go: { view: 'settings', label: 'Buka Keamanan', target: 'security' } },
        { id: 'm-set-reminders', q: 'Pengingat', a: 'Pengingat perbarui saldo di jam pilihanmu, tagihan yang akan jatuh tempo, dan peringatan anggaran.', go: { view: 'settings', label: 'Buka Pengingat', target: 'reminders' } },
        { id: 'm-set-look', q: 'Tampilan', a: 'Tema warna, mode terang/gelap, dan ukuran teks.', go: { view: 'settings', label: 'Buka Tampilan', target: 'appearance' } },
        { id: 'm-set-control', q: 'Kontrol keuangan', a: 'Cara uang bebas, uang tersedia, dan aset bersih dihitung — termasuk cadangan aman, tagihan yang dihitung, dompet mana yang ikut, dan batas peringatan anggaran.', go: { view: 'settings', label: 'Buka Kontrol keuangan', target: 'control' } },
        { id: 'm-set-data', q: 'Data & cadangan', a: 'Unduh cadangan seluruh data, atau pulihkan dari file cadangan.', go: { view: 'settings', label: 'Buka Data & cadangan', target: 'data' } },
      ], go: { view: 'settings', label: 'Buka Pengaturan' } },
    ],
  },
  {
    id: 'howto', title: 'Cara pakai', lead: 'Langkah demi langkah untuk hal yang sering dilakukan.', icon: 'wand',
    items: [
      { id: 'h-transfer', q: 'Mencatat transfer antardompet', keywords: 'pindah saldo top up topup isi saldo tarik tunai', a: 'Pilih **Transfer** di form transaksi, isi nominal, pilih dompet asal dan tujuan. Kalau ada biaya, isi **Biaya admin** lalu pilih **Kategori biaya** — biaya itu dihitung sebagai pengeluaran.' },
      { id: 'h-split', q: 'Satu transaksi untuk beberapa kategori', keywords: 'pembagian split bagi pecah', a: 'Di form pengeluaran, buka **Bagi ke beberapa kategori**, lalu isi nominal untuk tiap kategori sampai sisanya **Rp0** (jumlahnya sama dengan total transaksi).' },
      { id: 'h-correct', q: 'Saldo di aplikasi berbeda dengan saldo asli', keywords: 'selisih beda koreksi cocokkan salah', a: 'Buka **Dompet**, ketuk **⋯ → Cocokkan saldo**, lalu isi saldo aslinya. Aplikasi mencatat selisihnya sebagai koreksi. Kalau curiga ada transaksi yang terlewat, cek dulu riwayat transaksinya.', go: { view: 'wallets', label: 'Buka Dompet' } },
      { id: 'h-kantong', q: 'Membuat kantong Dana darurat', a: 'Pisahkan dana darurat dari uang harian.', steps: ['Buka **Dompet → Tambah kantong**.', 'Pilih **Dana darurat**, beri nama, lalu centang dompet yang menjadi tempat dana darurat.', 'Isi target (opsional), lalu **Simpan**.'], tip: 'Saldo kantong mengikuti saldo dompetnya. Untuk menambah isi, cukup transfer ke salah satu dompet itu.', go: { view: 'wallets', label: 'Buka Dompet' } },
      { id: 'h-budget-subs', q: 'Anggaran untuk beberapa subkategori saja', keywords: 'anggaran budget subkategori sebagian', a: 'Satu anggaran bisa mencakup beberapa subkategori, misalnya **Makan & Minum** tapi hanya **Kopi** dan **Sarapan**.', steps: ['Buka **Anggaran → Buat anggaran**.', 'Pilih kategorinya, lalu ketuk subkategori yang ingin dihitung. Biarkan **Semua subkategori** kalau ingin seluruh kategori.', 'Isi batas per periode, lalu **Simpan**.'], tip: 'Kalau kategori utamanya juga punya anggaran sendiri, totalnya tidak dihitung dua kali di ringkasan.', go: { view: 'budgets', label: 'Buka Anggaran' } },
      { id: 'h-debt', q: 'Mencatat utang dan membayar cicilan', a: 'Buka **Utang & Piutang → Utang → Catat utang**. Isi nominal, jatuh tempo, bunga, dan cicilan per bulan. Saat membayar, tekan **Bayar cicilan** — saldo dompet dan sisa utang langsung berkurang.', go: { view: 'debts', label: 'Buka Utang' } },
      { id: 'h-receivable', q: 'Teman membayar tunai yang tidak kucatat', a: 'Di **Piutang**, pilih **Catat pelunasan** lalu gunakan pilihan **tanpa dompet**. Sisa piutang berkurang tanpa mengubah saldo dompet mana pun.', go: { view: 'receivables', label: 'Buka Piutang' } },
      { id: 'h-claim', q: 'Klaim kantor dari awal sampai cair', a: 'Catat klaim saat kamu menalangi (saldo dompet berkurang). Lampirkan bukti kalau perlu. Saat kantor mengganti, tekan **Catat pencairan**. Kalau ditolak, pilih **Tolak** — nominalnya jadi pengeluaran.', go: { view: 'claims', label: 'Buka Klaim kantor' } },
      { id: 'h-recurring', q: 'Mengatur tagihan rutin', keywords: 'langganan bulanan berulang jadwal otomatis', a: 'Di **Jadwal → Rutin → Jadwal baru**, isi nama, nominal, dompet, frekuensi, dan tanggal berikutnya. Lalu pilih perilakunya:', children: [
        { id: 'h-rec-modes', q: 'Pilihan perilaku jadwal', a: '**Pengingat saja**: hanya mengingatkan. **Tunggu konfirmasi**: muncul di Konfirmasi untuk diperiksa. **Simpan sebagai draf**: disiapkan tanpa mengubah saldo. **Catat otomatis**: langsung dicatat dan saldo berubah.' },
        { id: 'h-rec-31', q: 'Jadwal tanggal 29–31', a: 'Di bulan yang lebih pendek jadwal jatuh di tanggal terakhir, lalu kembali ke tanggal aslinya di bulan berikutnya.' },
      ], go: { view: 'recurring', label: 'Buka Rutin' } },
      { id: 'h-close', q: 'Menutup siklus gaji', a: 'Buka **Laporan → Riwayat siklus**, ketuk siklus bertanda **Siap ditutup**, periksa ringkasannya, lalu **Tutup siklus**. Kamu juga bisa menulis catatan untuk siklus itu.', go: { view: 'cycles', label: 'Buka Riwayat siklus' } },
      { id: 'h-reorder', q: 'Menggeser urutan dompet, anggaran, atau kartu', a: 'Di HP, **tahan sebentar** pegangan titik-titik sampai kartunya terangkat, lalu geser. Di komputer, langsung tarik pegangannya.' },
      { id: 'h-buffer', q: 'Menyisihkan cadangan aman', a: 'Di **Pengaturan → Kontrol keuangan**, isi **Cadangan aman**. Nominal itu tidak pernah dihitung sebagai uang tersedia, tanpa memindahkan uang dari dompet mana pun.', go: { view: 'settings', label: 'Buka Kontrol keuangan', target: 'control' } },
      { id: 'h-lock', q: 'Mengunci aplikasi dengan PIN atau sidik jari', keywords: 'kunci keamanan face id wajah biometrik', a: 'Buka **Pengaturan → Keamanan**, buat PIN 4 angka. Di perangkat yang mendukung, sidik jari atau wajah bisa diaktifkan untuk membuka kunci; PIN tetap jadi cadangan.', go: { view: 'settings', label: 'Buka Keamanan', target: 'security' } },
      { id: 'h-install', q: 'Memasang aplikasi ke layar utama', keywords: 'install instal pwa unduh aplikasi offline', a: 'Buka **Pengaturan → Aplikasi di perangkat**, lalu ikuti tombol pasang. Setelah terpasang, aplikasi terbuka seperti aplikasi biasa dan bisa dipakai saat offline.', go: { view: 'settings', label: 'Buka Aplikasi di perangkat', target: 'app' } },
      { id: 'h-backup', q: 'Mencadangkan dan memulihkan data', keywords: 'backup restore impor ekspor pindah hp', a: 'Di **Pengaturan → Data & cadangan**, tekan **Unduh cadangan** untuk menyimpan file. Untuk memulihkan, pilih file cadangan lalu pilih **Gabungkan dengan data yang ada** atau **Ganti seluruh data keuangan**.', go: { view: 'settings', label: 'Buka Data & cadangan', target: 'data' } },
    ],
  },
  {
    id: 'data', title: 'Data & keamanan', lead: 'Di mana datamu disimpan dan siapa yang bisa melihatnya.', icon: 'shield',
    items: [
      { id: 'd-where', q: 'Di mana data disimpan?', a: 'Di akun cloud milikmu sendiri. Setiap akun hanya bisa membaca dan mengubah datanya sendiri.' },
      { id: 'd-offline', q: 'Bisakah mencatat saat offline?', a: 'Bisa. Transaksi disimpan di perangkat dan otomatis dikirim saat internet kembali. Tanda sinkron di atas menunjukkan statusnya.' },
      { id: 'd-insight', q: 'Apakah Insight mengirim dataku ke luar?', a: 'Tidak. Semua analisis Insight dihitung langsung di perangkatmu.' },
      { id: 'd-pin', q: 'Lupa PIN?', a: 'Masuk ulang dengan password akun, lalu buat PIN baru di **Pengaturan → Keamanan**. PIN hanya disimpan dalam bentuk acak (hash), bukan angka aslinya.', go: { view: 'settings', label: 'Buka Keamanan', target: 'security' } },
    ],
  },
  {
    id: 'fix', title: 'Kalau ada masalah', lead: 'Solusi untuk hal yang paling sering terjadi.', icon: 'wrench',
    items: [
      { id: 'f-balance', q: 'Saldo tidak cocok dengan transaksi', a: 'Buka **Pengaturan → Kontrol keuangan → Periksa Data**. Aplikasi memeriksa saldo, kategori, dan tautan catatan tanpa mengubah apa pun, lalu menawarkan **Samakan saldo** atau **Cocokkan saldo**.', go: { view: 'health', label: 'Buka Periksa Data' } },
      { id: 'f-notif', q: 'Notifikasi tidak muncul sebagai pop-up', keywords: 'notif popup pengingat tidak bunyi', a: 'Pastikan izin notifikasi aplikasi aktif. Di Android, buka pengaturan notifikasi aplikasi dan izinkan tampil sebagai pop-up. Coba dengan tombol **Coba kirim** di **Pengaturan → Pengingat**.', go: { view: 'settings', label: 'Buka Pengingat', target: 'reminders' } },
      { id: 'f-cycle', q: 'Tanggal siklus terasa salah', a: 'Periksa tanggal gajian dan zona waktu di **Pengaturan → Profil & gaji**. Siklus dan laporan langsung menyesuaikan.', go: { view: 'settings', label: 'Buka Profil & gaji', target: 'profile' } },
      { id: 'f-free', q: 'Uang bebas lebih kecil dari perkiraan', a: 'Mungkin ada dompet yang masuk kantong, uang yang terkumpul untuk tujuan dana, atau dompet bertanda Disimpan. Rinciannya ada di **Pengaturan → Kontrol keuangan**.', go: { view: 'settings', label: 'Lihat rinciannya', target: 'control' } },
      { id: 'f-report', q: 'Laporan siklus lama tidak berubah setelah transaksi diubah', a: 'Buka **Riwayat siklus** lalu tekan **Perbarui laporan** untuk menghitung ulang semua siklus dari transaksi terbaru.', go: { view: 'cycles', label: 'Buka Riwayat siklus' } },
    ],
  },
];

/** Every item with the path to it, for search. */
export function flattenHelp() {
  const rows: { item: HelpItem; group: HelpGroup; path: string[] }[] = [];
  const walk = (items: HelpItem[], group: HelpGroup, path: string[]) => { for (const item of items) { rows.push({ item, group, path }); if (item.children) walk(item.children, group, [...path, item.q]); } };
  for (const group of helpGroups) walk(group.items, group, [group.title]);
  return rows;
}
export const plainText = (text: string) => text.replace(/\*\*/g, '');
