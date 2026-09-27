/** "Apa yang baru" (Pengaturan → Info aplikasi), newest first. Emoji must be in lib/emoji-set.ts. */
export type Release = { version: string; date: string; title: string; items: [emoji: string, text: string][] };

export const releases: Release[] = [
  { version: '73', date: '27 Sep 2026', title: 'Perbarui saldo utang & piutang, Arsip, dan privasi', items: [
    ['✏️', 'Utang dan piutang kini punya “Perbarui saldo” untuk bunga, denda, potongan, atau salah catat, tanpa mengubah saldo dompet.'],
    ['📝', 'Riwayat lengkap tiap utang dan piutang: pembayaran lewat dompet, pelunasan tanpa dompet, dan setiap perubahan saldo.'],
    ['🗂️', 'Mode Ringkas satu baris per catatan, dan yang sudah lunas pindah ke tab Arsip, dikelompokkan per bulan dan hari yang bisa dilipat.'],
    ['🔒', 'Pengaturan → Tampilan: “Selalu sembunyikan nominal” setiap aplikasi dibuka.'],
    ['🧾', 'Biaya tambahan Split Bill kini dipilih dari menu yang rapi, dan tiap biaya bisa dilipat.'],
  ] },
  { version: '72', date: '27 Sep 2026', title: 'Split Bill', items: [
    ['🧾', 'Menu baru Split Bill: bagi rata, sesuai pesanan (item berbagi dan per porsi), nominal manual, atau persentase, lengkap dengan pajak, service, diskon, ongkir, pembulatan, dan biaya bersama. Pembagian selalu pas sampai Rupiah terakhir.'],
    ['💳', 'Uang keluar dan pengeluaranmu dibedakan: bayar Rp600rb untuk berempat, saldo dompet berkurang Rp600rb tapi anggaran dan analisis hanya menghitung bagianmu. Bagian teman jadi piutang yang tertaut.'],
    ['🤝', 'Teman membayar balik tidak dihitung pemasukan; kalau orang lain yang bayar, bagianmu jadi pengeluaran dan utang, dan melunasinya tidak dihitung pengeluaran lagi.'],
    ['📷', 'Bisa dari transaksi yang sudah ada, dari foto struk (teks dibaca bila perangkat mendukung, atau tempel teks struk), atau dihitung manual; hasil baca selalu diperiksa dulu.'],
    ['📝', 'Status tiap orang, pembayaran sebagian, orang tersimpan dan grup, bagikan teks atau gambar ke WhatsApp, dan pengingat yang bisa kamu ubah sebelum dikirim.'],
    ['📊', 'Terhubung ke Beranda, Insight, Laporan, Periksa Data, Piutang, dan Utang.'],
  ] },
  { version: '71', date: '27 Sep 2026', title: 'Kategori yang membaca konteks', items: [
    ['💡', 'Kata yang punya banyak arti dibaca dari konteksnya: “beli air 5rb di alfa” jadi minuman, “bayar air 150rb” jadi tagihan air; “tiket kereta” masuk transportasi, “tiket konser” masuk hiburan; “grabfood” masuk makanan.'],
    ['✅', 'Arah uang ikut dibaca: “gaji art”, “thr art”, dan “tiket masuk” tetap pengeluaran; “bunga deposito”, “komisi”, dan “dapat hadiah” jadi pemasukan.'],
    ['🔄', 'Belajar dari kebiasaanmu: barang, tempat, dan kata yang biasa kamu catat di satu kategori ikut diperhitungkan.'],
    ['📝', 'Alasan pilihan kategori ditampilkan, dan formulir transaksi kini menyarankan kategori dari keterangan yang kamu ketik.'],
  ] },
  { version: '70', date: '26 Sep 2026', title: 'Catat otomatis untuk semua menu', items: [
    ['🚀', 'Satu kalimat kini bisa membuat anggaran, tujuan dana, wish list, dompet, kategori, jadwal rutin, rencana, dan pengingat, contohnya “anggaran makan 2jt” atau “langganan netflix 54rb tiap tanggal 5”.'],
    ['💰', 'Perbarui saldo cukup dengan “saldo bca sekarang 12jt”; selisihnya dicatat sebagai penyesuaian.'],
    ['🧭', 'Ketik “buka laporan”, “lihat utang”, atau “pengingat” untuk langsung pindah ke menunya.'],
    ['📝', 'Tanggal bisa ditulis bebas: besok, lusa, tgl 5, 17 agustus, minggu depan. Pengeluaran yang masih akan datang disimpan sebagai rencana.'],
    ['✅', 'Dompet default dan pilihan dompet kini mengikuti urutan di halaman Dompet.'],
  ] },
  { version: '69', date: '26 Sep 2026', title: 'Catat otomatis lebih jelas', items: [
    ['📝', 'Teks Catat otomatis dirapikan, dan contoh kalimat tampil sebagai kartu yang tinggal diketuk, lengkap dengan hasilnya.'],
  ] },
  { version: '68', date: '26 Sep 2026', title: 'Tombol Catat otomatis', items: [
    ['🚀', 'Tombol khusus “Catat otomatis” di atas Pengeluaran dan Pemasukan: ketik, cek pratinjau, lalu “Sesuai, simpan”.'],
  ] },
  { version: '67', date: '26 Sep 2026', title: 'Ketik cepat makin pintar', items: [
    ['🚀', 'Ketik cepat kini paham utang, piutang, klaim kantor, target, dan wish list, bukan hanya masuk dan keluar.'],
    ['✅', 'Pratinjau langsung saat mengetik, lalu Simpan sekali ketuk. Salah tebak? Ketuk “Bukan?” atau pilih jenisnya.'],
  ] },
  { version: '66', date: '26 Sep 2026', title: 'Ketik cepat', items: [
    ['🚀', 'Tulis “beli pocari 8rb di alfa”, formulir transaksi langsung terisi: nominal, tempat, kategori, dompet, dan tanggal.'],
  ] },
  { version: '65', date: '26 Sep 2026', title: 'Utang, piutang, dan grafik pemasukan', items: [
    ['💳', 'Bayar utang dan pelunasan piutang bisa diberi kategori dan masuk ke laporan.'],
    ['📊', 'Grafik kategori untuk pemasukan, di Beranda dan Analisis.'],
  ] },
  { version: '64', date: '26 Sep 2026', title: 'Privasi dan hemat kuota', items: [
    ['🔒', 'Ikon mata di sebelah lonceng: sembunyikan semua nominal sekali ketuk.'],
    ['📝', 'Transaksi, utang, piutang, dan klaim yang disimpan tercatat di notifikasi.'],
    ['🔄', 'Hemat kuota: data disimpan di perangkat, hanya perubahan yang diunduh.'],
    ['⚡', 'Laporan, riwayat siklus, dan pindah tab tidak memakai kuota baca.'],
    ['✅', 'Riwayat siklus hanya menandai siklus yang punya transaksi sebagai siap ditutup.'],
    ['📌', 'Tempat belanja di Laporan tidak lagi tercampur kategori atau keterangan.'],
    ['📊', 'Kartu Pemasukan & Pengeluaran di Beranda lebih ringkas dan muat lebih banyak.'],
  ] },
  { version: '63', date: '26 Sep 2026', title: 'Lebih ringkas, lebih mulus', items: [
    ['📱', 'Geser antartab, misalnya di Laporan, kini mulus tanpa kedipan.'],
    ['🚀', 'Halaman yang sudah siap langsung tampil, tanpa layar memuat sesaat.'],
    ['🛠️', 'Tombol Urutkan, Rentang, dan Periode lebih ringkas dan proporsional.'],
  ] },
  { version: '62', date: '26 Sep 2026', title: 'Lebih halus, lebih kaca', items: [
    ['🌙', 'Pindah ke mode gelap tanpa kedipan terang.'],
    ['⚡', 'Dari tombol Tambah ke formulir transaksi tanpa jeda.'],
    ['💳', 'Menu Lainnya di Dompet membuka ke atas bila dekat bilah bawah.'],
    ['🎨', 'Ukuran teks dan tampilan SS (super kecil); teks S jadi bawaan.'],
    ['🧾', 'Subkategori anggaran dipilih lewat dropdown.'],
    ['🤝', 'Utang & Piutang serta Tujuan dana tampil baru bergaya kaca.'],
    ['📱', 'Info aplikasi di Pengaturan: versi dan apa yang baru.'],
  ] },
  { version: '61', date: '26 Sep 2026', title: 'Kendali akun penuh', items: [
    ['🧹', 'Reset semua data untuk mulai dari awal, akun tetap ada.'],
    ['🛡️', 'Hapus akun permanen beserta semua datanya.'],
    ['🔒', 'Lupa dan ganti password versi baru, lengkap dengan meter kekuatan.'],
    ['🗂️', 'Tambah kartu Beranda dalam 9 kategori dropdown dan pencarian.'],
  ] },
  { version: '60', date: '26 Sep 2026', title: 'Beranda makin kaya', items: [
    ['📊', '15 kartu Beranda baru, misalnya Rasio Menabung dan Belanja 7 Hari.'],
    ['📝', 'Pilihan jenis huruf: Bawaan, Inter, Google Sans, Plus Jakarta Sans.'],
    ['📌', 'Kategori tampil ringkas; ketuk untuk membuka subkategori.'],
    ['💰', 'Saldo Dompet dan Komposisi Aset selalu cocok dengan Aset bersih.'],
  ] },
  { version: '59', date: '26 Sep 2026', title: 'Anggaran dan kategori baru', items: [
    ['🎯', 'Satu anggaran bisa mencakup beberapa subkategori.'],
    ['🎉', 'Tampilan baru untuk Anggaran, Kategori, dan panduan awal.'],
    ['💎', 'Kartu kantong bergaya kaca.'],
    ['📈', 'Perkiraan return investasi di Insight dibuat realistis.'],
  ] },
  { version: '56–58', date: '26 Sep 2026', title: 'Riwayat dan bantuan', items: [
    ['📉', 'Riwayat siklus dengan ringkasan setiap bulan gaji.'],
    ['🧭', 'Kontrol keuangan lebih fleksibel, lengkap dengan penjelasan.'],
    ['❓', 'Menu Tanya Jawab: istilah, fungsi menu, dan cara pakai.'],
  ] },
  { version: '52–55', date: '25 Sep 2026', title: 'Dompet ringkas', items: [
    ['👛', 'Tampilan Dompet Ringkas dengan warna kartu tiap dompet.'],
    ['📥', 'Kartu Pemasukan & Pengeluaran di Beranda.'],
    ['⌨️', 'Lembar isian naik di atas keyboard HP.'],
    ['🔁', 'Jadwal rutin tetap di tanggal yang sama tiap bulan.'],
  ] },
  { version: '42–51', date: '25 Sep 2026', title: 'Kantong dan formulir baru', items: [
    ['🪙', 'Kantong tabungan yang mengelompokkan beberapa dompet.'],
    ['🏦', 'Logo bank, e-money, dan kartu; cari emoji di semua pilihan ikon.'],
    ['💸', 'Formulir transaksi dan pop-up yang baru.'],
    ['✅', 'Audit menyeluruh: satu rumus Uang bebas di semua halaman.'],
  ] },
  { version: '25–41', date: '25 Sep 2026', title: 'Insight hadir', items: [
    ['💡', 'Insight: skor kesehatan, temuan, dan rencana aksi dari datamu sendiri.'],
    ['🎁', 'Wish list untuk barang impian.'],
    ['📱', 'Buka kunci dengan sidik jari atau wajah.'],
    ['🚀', 'Layar pembuka baru dan notifikasi mengambang.'],
  ] },
];
