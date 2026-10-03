# Dompet Ajaib 5.0 — Adaptive Simplicity

Rilis aplikasi 5.0, dengan 4.10 (commit 5853ffe) sebagai pembanding. Inti 5.0: **semua fitur tetap ada, tetapi yang tampil sekaligus lebih sedikit, dan fitur lebih mudah ditemukan.** Mesin keuangan tidak ditulis ulang, yaitu akuntansi, anggaran, Insight, OCR, parser Catat otomatis, utang, piutang, klaim, Split Bill, dan bunga. 5.0 hanya mengubah susunan, prioritas tampilan, navigasi, penemuan fitur, dan penjelasan.

## 1. Audit source 4.10

| Bagian | Temuan |
|---|---|
| Arsitektur | Satu halaman (`app/page.tsx`) dengan 25 tampilan (`view`). 3 hub bertab: Utang & Piutang, Jadwal, Laporan. Sidebar di desktop; bottom nav + sheet "Semua menu" di HP. |
| Pencarian | Tidak ada pencarian global. Hanya ada cari transaksi, cari kartu Beranda, dan cari Tanya Jawab. |
| Penemuan fitur | Tidak ada registry fitur atau mesin saran. Fitur lanjutan seperti bunga otomatis, Cocokkan saldo, Hitung ulang saldo, Kantong, Skenario, dan Indeks harga hanya bisa ditemukan kalau tahu letaknya. Contoh: menu ⋯ di kartu dompet, sub-tab Insight, Pengaturan › Data. |
| Beranda | Default 11 kartu: 3 kartu angka dengan perbandingan, Catat cepat, Transaksi terbaru, Grafik kategori, Anggaran, Dompet, Pemasukan & Pengeluaran, Proyeksi. Kartu bernilai nol tetap tampil. |
| Halaman lain | Utang, Piutang, Klaim, Anggaran, Dompet, dan Tujuan dana **sudah** memakai pola ringkasan di atas lalu daftar sejak 4.6–4.8. Sisa masalahnya kebisingan kecil: chip "0 hampir habis", "0 terlampaui", dan tombol ganda. |
| Bug yang ditemukan | Di Insight › Harga, analisis harga struk hanya berjalan kalau `tab === 'prices'`, padahal "Harga" adalah sub-tab. Daftar harga dari struk tidak pernah dihitung. **Sudah diperbaiki.** |

Inventaris 4.10 dibekukan **langsung dari source commit 4.10** ke `bench/ux/inventory-4.10.json`:
- 25 halaman (nav);
- 13 tab hub;
- 9 bagian Pengaturan;
- 9 aksi Tambah;
- 42 kartu Beranda;
- 107 jawaban Tanya Jawab.

## 2. Gerbang rilis "tanpa fitur hilang"

`tests/adaptive-5.test.mjs` memeriksa 5.0 terhadap inventaris 4.10 yang dibekukan:
- semua halaman masih dirender dan masih ada di daftar nav;
- semua tab hub, bagian Pengaturan, aksi Tambah, kartu Beranda, dan jawaban Tanya Jawab masih ada;
- setiap halaman dan setiap bagian Pengaturan punya entri registry, jadi bisa dicari dan muncul di Jelajahi.

**Hasil: 100% kemampuan 4.10 masih terjangkau, 0 hilang.**

## 3. Arsitektur informasi baru

**Feature Registry** (`lib/features.ts`) adalah satu daftar kanonik berisi 60 kemampuan. Tiap entri punya:
- nama dan deskripsi satu kalimat;
- kelompok kebutuhan;
- cara membuka (halaman + deep link);
- kata kunci bahasa sehari-hari, termasuk bahasa Inggris dan cara orang menyebut kebutuhannya;
- tingkat kompleksitas;
- sinyal relevansi dan sinyal "sudah dipakai";
- tautan Tanya Jawab.

Data ini dipakai bersama oleh pencarian, Lainnya, Jelajahi, "Yang bisa dilakukan di sini", Pengaturan, dan discovery, jadi tidak ada daftar ganda.

**Kelompok kebutuhan** (§36):
- Catat
- Kelola uang
- Utang, piutang & klaim
- Rencanakan
- Pahami
- Otomatisasi
- Data & pengaturan

**Kompleksitas adaptif** (§14–18) hanya mengatur seberapa menonjol sebuah fitur, bukan apakah fitur itu tersedia:

| Tingkat | Cara tampil | Contoh |
|---|---|---|
| Dasar | Selalu mudah dijangkau | Catat, uang tersedia, dompet, aktivitas terakhir, anggaran |
| Umum | Muncul saat relevan | Klaim, piutang, utang, rutin, target |
| Lanjutan | Lewat konteks, cari, atau Jelajahi | Cocokkan saldo, bunga, skenario, indeks harga, kontrol keuangan |
| Untuk ahli | Tetap terjangkau tapi tidak bersaing dengan tugas harian | Hitung ulang saldo, sinkron ulang, reset atau hapus akun |

**Perubahan navigasi:**
- **Sidebar desktop** dikelompokkan: Utama (Beranda, Transaksi, Dompet, Anggaran, Insight) · Rencanakan · Utang, piutang & klaim · Pahami · Lainnya (+ Jelajahi Dompet Ajaib).
- **Lainnya di HP** sekarang berisi:
  1. kolom cari di atas;
  2. Disematkan atau Sering dibuka;
  3. empat kelompok kebutuhan, tiap entri dengan satu baris penjelasan;
  4. kartu "Jelajahi semua fitur".
  Bottom nav tetap 5 tujuan.
- **Topbar** mendapat tombol cari: ikon di HP, pil "Cari fitur… Ctrl K" di desktop. Ada juga tombol "?" (Yang bisa dilakukan di sini) di halaman yang punya kemampuan tersembunyi.

## 4. Pencarian global (§39–43, §159)

**Sheet di HP dan command palette Ctrl/⌘+K di desktop**, dengan hasil berkelompok:
- **Fitur:** dari registry.
- **Datamu:** nama dompet, klaim, utang, piutang, tujuan dana, anggaran, rutin, dan kategori. Hanya nama; angka tetap di halamannya. Dompet tabungan juga muncul sebagai "Bunga <nama dompet>".
- **Bantuan:** 107 jawaban Tanya Jawab.
- Baris terakhir selalu "Cari “…” di transaksi".

**Cara mencocokkan:**
- Nama paling berbobot, lalu kata kunci, lalu deskripsi.
- Semua kata harus cocok, jadi "bunga mawar" tidak menghasilkan apa-apa.
- Cocok di tengah kata hanya untuk nama, sehingga "bunga" tidak menemukan "ta**bunga**n".
- Toleran salah ketik secara konservatif: 1 kesalahan untuk kata 5–7 huruf, 2 untuk kata ≥8 huruf, dan tukar dua huruf dihitung satu kesalahan.

**Contoh kueri bahasa sehari-hari** (semuanya diuji):

| Ketik | Hasil teratas |
|---|---|
| tagihan / tagihan bulanan | Rutin |
| uang balik | Piutang, Klaim kantor |
| bunga | Bunga otomatis dompet |
| uang aman / uang yang bisa dipakai | Uang tersedia & uang bebas |
| data error | Periksa data |
| rekonsiliasi / rekonsilasi (salah ketik) | Cocokkan saldo |
| kalau beli | Kalau beli ini? |
| spilt (salah ketik) | Split Bill |
| dark mode · pin · backup | Tampilan · Keamanan · Cadangan data |

**Terakhir dibuka dan Disematkan** (§44–45): muncul di pencarian kosong dan di Lainnya. Bintang di setiap hasil dan di Jelajahi; tidak perlu diatur.

**Pengaturan** juga punya kotak saring sendiri (§102) yang memakai kata kunci registry, misalnya "pin", "tema", atau "gaji".

## 5. Discovery Engine (§46–62)

Mesinnya ada di `lib/discovery.ts`: deterministik, lokal, dan hanya membaca data yang sudah dimuat (tanpa kueri tambahan). Ia hanya memilih **fitur yang sudah ada** yang bisa membantu, tidak pernah memutuskan apa pun soal uang.

| Aturan | Pemicu | Layar |
|---|---|---|
| Rutin | Nama yang sama dibayar di ≥3 bulan berbeda dengan nominal mirip (±10%), belum jadi Rutin. Makan siang harian tidak terhitung. | Beranda, Transaksi, Rutin |
| Bunga otomatis | Ada dompet tabungan bersaldo, dan belum ada dompet yang memakai bunga | Beranda, Dompet |
| Insight | Riwayat sudah satu siklus penuh (≥30 transaksi, ≥35 hari), tapi Insight belum pernah dibuka | Beranda |
| Indeks harga | ≥8 struk dengan item | Beranda, Insight |
| Anggaran | ≥20 pengeluaran, belum ada anggaran | Beranda, Transaksi, Analisis |
| Split Bill | Ada struk dengan ≥3 item, belum pernah Split Bill | Beranda, Transaksi |
| Bahasa Saya | ≥15 catatan lewat Catat otomatis, kamus masih kosong | Beranda |
| Pengingat | ≥30 transaksi, pengingat mati | Beranda |
| Periksa data | ≥80 transaksi, belum pernah membuka Periksa data | Beranda |
| Kartu Klaim di Beranda (§78) | Ada klaim aktif, Beranda sudah diatur sendiri tapi tanpa kartu Klaim | Beranda |

**Siklus hidup** (§59): UNSEEN → ELIGIBLE → SHOWN → TRIED → LEARNED, atau DISMISSED.

**Pencegah kelelahan** (§58–62):
- maksimal satu saran per layar;
- fitur yang sudah dipakai tidak pernah dipromosikan;
- saran yang ditutup hilang 60 hari;
- saran yang tampil di 3 hari berbeda tanpa disentuh berhenti;
- tidak ada tips acak.

**Saran berbasis tonggak** (§68): Insight, harga, dan Periksa data baru muncul setelah datanya cukup. Fiturnya sendiri tetap tersedia sejak awal; yang berubah hanya seberapa menonjol.

**Penyimpanan** (§150–153, 221–222): metadata pemakaian (`lib/usage.ts`) disimpan per akun di perangkat. Isinya fitur terakhir, sematan, jumlah halaman dibuka, status saran, dan catatan sekali tampil. **Tidak ada angka keuangan.** "Atur ulang saran" ada di Pengaturan › Info aplikasi.

## 6. Beranda baru (§74–79, 115–117, 243)

Pertanyaan yang dijawab Beranda: "Bagaimana uangku sekarang?"

**Susunan default 5.0** (`homeDefault()`), menyesuaikan keadaan:
1. **Uang Bebas** + tombol **Kenapa?** (lihat bagian 7).
2. Paling banyak **dua angka pendukung**: Sisa anggaran + Jatah aman per hari kalau ada anggaran; kalau tidak, Pengeluaran + Pemasukan.
3. **Perlu perhatian**: satu klaster, maksimal 3 baris, sisanya di balik satu ketukan. Isinya anggaran terlampaui atau hampir habis, cicilan jatuh tempo ≤7 hari, tagihan menunggu konfirmasi, klaim >14 hari, piutang lewat jatuh tempo, rencana ≤3 hari, dan hasil Periksa data ≤30 hari. Kalau tidak ada, tampil satu baris tenang: "Tidak ada yang perlu diurus sekarang."
4. Satu kartu saran, kalau memang relevan.
5. 7 hari mendatang (hanya kalau ada jadwal), Anggaran berjalan (hanya kalau ada anggaran), Transaksi terbaru, Saldo dompet.

Kartu bernilai nol (utang Rp0, klaim Rp0, piutang Rp0) tidak lagi tampil secara default.

**Migrasi kustomisasi** (§156–158):
- Pengguna yang memakai **default 4.x** otomatis mendapat default 5.0, karena default 4.x dikenali sebagai "belum pernah diatur".
- Beranda yang **sudah diatur sendiri tidak diubah**. Pengguna ini melihat tawaran sekali, "Coba tampilan rekomendasi 5.0". Kalau dicoba, susunan lama disimpan (`dashboardWidgetsBefore5`), dan **"Kembalikan tampilan sebelum 5.0"** ada di Atur Beranda.
- Semua 42 kartu, kartu baru "Perlu Perhatian", urutan, periode, dan pengaturan kartu tetap tersedia.

## 7. Kenapa angka ini? · Yang bisa dilakukan di sini · empty state · aksi berikutnya

**Kenapa?** (§33–34, 122): rincian dihitung dari `metrics().freeParts` dan pengaturan komitmen, tanpa hitungan baru:

| Baris | Tanda |
|---|---|
| Saldo dompet yang bisa dipakai | |
| Ada di kantong | − |
| Terkumpul untuk tujuan dana | − |
| **Uang Bebas** | = |
| Tagihan & rencana belum dibayar | − |
| Cadangan aman | − |
| **Uang Tersedia** | = |

Di bawahnya ada tautan "Atur cara hitungnya".

**Yang bisa dilakukan di sini** (§111–112): tombol "?" di topbar membuka daftar kemampuan halaman dari registry. Contoh di Dompet: bunga otomatis, cocokkan saldo, hitung ulang, kantong, arsip, tambah dompet. Tiap baris bisa langsung dibuka (deep link).

**Deep link baru:**
- Dompet: `add`, `kantong`, `interest[:id]`, `reconcile[:id]`, `recalculate[:id]`
- Insight: `lab`, `prices`, `cashflow`, `goals`, `data`
- Proyeksi: `whatif`
- Beranda: `why`, `customize`
- Pengaturan: `danger`

**Empty state edukatif** (§113–114), pendek dan dengan satu aksi: Klaim, Utang, Tujuan dana, Rutin, dan Perlu dikonfirmasi.

**Aksi berikutnya** (§63–67): satu opsi tenang per alur, misalnya "Dibayar bareng teman? Bagi lewat Split Bill" di Scan struk bila struk punya ≥3 item. Sebelumnya opsi ini hanya ada di menu ⋯. Aksi Split Bill lain tetap di tempatnya.

**Ringkasan dulu** (§20–22, 86):
- chip bernilai nol di Anggaran disembunyikan;
- tombol "Tambah kantong" di judul Dompet hanya muncul kalau belum ada kantong; setelah itu kantong punya petak "Kantong baru" dan "Kelola" sendiri.

**Orientasi 5.0** (§155): 3 layar singkat, sekali per akun, hanya untuk pengguna lama (≥5 transaksi). Isinya: tampilan lebih fokus · cari fitur apa pun · fitur lanjutan muncul saat relevan. Akun baru tidak melihatnya karena sudah lewat onboarding.

## 8. Ukuran beban kognitif sebelum/sesudah (§139–140, 209)

Skrip yang sama persis (`measure.mjs`) dijalankan pada 4.10 lalu 5.0. Pengguna: rama (power user, 441 transaksi) dan budi (data sedikit). Ukuran: HP 390 px dan desktop 1280 px. Satuan: elemen di layar pertama.

Data mentah: `bench/ux/metrics-4.10.json` dan `metrics-5.0.json`. Tabel per halaman: `bench/ux/COGNITIVE-before-after.md`.

**Beranda** (target utama 5.0, power user rama):

| Layar pertama | 4.10 HP | 5.0 HP | 4.10 desktop | 5.0 desktop |
|---|---|---|---|---|
| Aksi terlihat | 17 | **13** | 18 | **13** |
| Kartu | 6 | 5 | 6 | 5 |
| Angka (Rp/%) | 11 | 9 | 12 | 9 |
| Konsep/judul sekaligus | 4 | **2** | 5 | **2** |
| Penekanan besar | 1 | 1 | 5 | 4 |
| Panjang halaman (× layar) | 4,8 | **2,9** | 3,2 | **2,2** |

**Total semua halaman** (19 halaman × 2 pengguna × 2 ukuran, layar pertama):

| Ukuran | 4.10 | 5.0 | Perubahan |
|---|---|---|---|
| Angka | 321 | 298 | −7% |
| Konsep | 231 | 215 | −7% |
| Penekanan besar | 136 | 130 | −4% |
| Aksi | 716 | 710 | −1% |
| Badge | 51 | 51 | 0% |
| Kartu | 160 | 168 | +5% |

Penjelasan jujur angka total:
- Halaman Utang, Piutang, Klaim, Anggaran, dan Tujuan dana sudah memakai pola ringkasan dulu sejak 4.x, jadi 5.0 sengaja tidak merombaknya (§6: jangan rombak tanpa alasan).
- Kenaikan kartu (+5%) dan aksi di Transaksi/Dompet (+1) berasal dari **satu baris saran ringkas** yang hanya tampil bila relevan dan bisa ditutup. Ini harga yang diterima untuk penemuan fitur (§210: jangan sembunyikan semua hanya demi angka kecil).
- Lainnya: aksi 12 → 14 (tambah kolom cari dan Jelajahi), konsep 3 → 5 (empat kelompok kebutuhan dengan penjelasan). Ini disengaja: menu Lainnya tidak lagi sekadar "gudang fitur".

**Tes 5 detik / 15 detik** (penilaian dari screenshot, bukan uji pengguna):
- Beranda 5.0 menjawab "berapa uang yang aman" (satu angka besar + Kenapa?), "apa yang perlu diurus" (Perlu perhatian, maksimal 3 baris), dan "apa yang bisa dilakukan" (saran tunggal, tombol +).
- Beranda 4.10 menampilkan 3 kartu angka setara, deretan Catat cepat, dan periode sebelum ada informasi "perlu perhatian".

## 9. Penemuan fitur sebelum/sesudah (§143–148)

Matriks lengkap per fitur: `bench/ux/MATRIX.md`, dibuat otomatis dari registry.

| | 4.10 | 5.0 |
|---|---|---|
| Fitur yang bisa dicari dengan bahasa sehari-hari | 0 (tidak ada pencarian global) | 60 dari 60 |
| Fitur lanjutan dengan ≥2 jalur penemuan | Sebagian besar hanya 1 (lokasi menu) | Semua |
| Fitur gelap (kurang dari 2 jalur) | Bunga, Cocokkan saldo, Hitung ulang, Kantong, Skenario, Indeks harga, Kalau beli, Cadangan data, Sinkron ulang | **0** |

Contoh: "Bagaimana menemukan bunga otomatis?"
- **4.10:** Dompet › buka detail dompet › tombol Bunga.
- **5.0:** ketik "bunga" (cari) · Lainnya › Disematkan · "?" di Dompet · saran otomatis untuk dompet tabungan · Jelajahi › Kelola uang.

## 10. Validasi

**QA browser** (`qa5.mjs`, emulator, akun nina/rama/sari/dewi): **31/31 lulus.**

| Cek | Hasil |
|---|---|
| Akun baru | Tanpa orientasi, tanpa saran, tanpa kartu Rp0; "Tidak ada yang perlu diurus" tampil; empty state Klaim menjelaskan gunanya |
| Pengguna lama | Orientasi 3 layar sekali, tidak muncul lagi |
| Saran | Maksimal satu; yang ditutup tidak kembali, diganti saran lain yang relevan |
| Kenapa? | Merinci Uang Bebas dan Uang Tersedia |
| Perlu perhatian | Maksimal 3 baris |
| Pencarian | 5 kueri bahasa sehari-hari benar; "cicilan motor" muncul di Datamu; salah ketik + Enter langsung membuka Cocokkan saldo |
| Sematan | Muncul di Lainnya dan membuka sheet bunga dompet |
| Yang bisa dilakukan di sini | Di Dompet berisi bunga, cocokkan saldo, kantong |
| Offline | Pencarian tetap menjawab dari registry lokal |
| Lebar layar | Tanpa scroll ke samping di 360, 375, 390, 412, 430 px (Beranda) dan 360 px (Lainnya) |
| Beranda kustom | Tidak diubah; tawaran 5.0 tampil; "Coba" menyimpan susunan lama; "Kembalikan" memulihkannya |
| Tampilan | Gelap/terang, HP/desktop, command palette, dan Jelajahi diperiksa lewat screenshot |

Catatan: satu error konsol non-fatal ("Event") muncul saat mode offline disimulasikan, karena ada permintaan jaringan yang gagal. Pencarian dan halaman tetap berfungsi.

**Tes otomatis:**
- 604 lulus, termasuk 39 tes baru di `tests/adaptive-5.test.mjs`: retensi fitur vs inventaris 4.10, integritas registry, 20 kueri pencarian, salah ketik, latensi, siklus hidup discovery dan kelelahan, Perlu perhatian, Beranda adaptif, metadata pemakaian, dan offline.
- Semua suite benchmark Catat otomatis tetap 100%, termasuk bahasa umum 84/84 tanpa normalisasi salah. Mesin keuangan tidak berubah.

**Performa:**
- Pencarian registry di bawah 2 ms per kueri (diuji 1.000 kueri).
- Discovery hanya membaca data yang sudah dimuat (tanpa kueri Firestore tambahan) dan tidak memindai seluruh riwayat.
- Komponen pencarian beserta indeks Tanya Jawab dimuat saat pertama dibuka atau saat idle, bukan di unduhan awal.
- Ukuran bundel: build produksi lulus. First Load JS Beranda 739 kB (4.10) → 755 kB (5.0), naik 16 kB atau 2%, untuk registry, discovery, dan Beranda adaptif. Halaman lain tetap dimuat malas seperti sebelumnya.

**Aksesibilitas:**
- Pencarian memakai `role=combobox` + `listbox`/`option`, `aria-activedescendant`, navigasi ↑↓ Enter Esc, dan Ctrl/⌘+K.
- Kartu Jelajahi bisa dipakai dengan keyboard (Enter/Spasi).
- Semua tombol ikon punya `aria-label`; animasi orientasi mematuhi `prefers-reduced-motion`.
- Target sentuh minimal 34–56 px.

## 11. Batasan yang diketahui

- Beranda belum punya kartu ringkas Insight sendiri. Menghitung mesin Insight di Beranda terlalu berat, jadi Insight hadir lewat saran (setelah satu siklus penuh) dan menu.
- Saran merapikan Beranda ("3 kartu jarang dibuka", §79) belum ada, karena butuh pelacakan per kartu.
- Metadata pemakaian disimpan per perangkat, jadi sematan dan saran tidak ikut pindah ke perangkat lain.
- Periksa data tidak dijalankan otomatis karena butuh seluruh ledger. Beranda memakai jumlah masalah dari pemeriksaan terakhir (≤30 hari).
- Pengukuran beban kognitif adalah hitungan elemen otomatis, bukan uji pengguna sungguhan. Tes 5 detik dan 15 detik hanya dinilai dari screenshot.
