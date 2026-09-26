/** "Apa yang baru" (Pengaturan → Info aplikasi), newest first. Emoji must be in lib/emoji-set.ts. */
export type Release = { version: string; date: string; title: string; items: [emoji: string, text: string][] };

export const releases: Release[] = [
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
