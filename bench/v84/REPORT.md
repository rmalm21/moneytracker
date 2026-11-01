# Laporan 8.4: asisten chat v4, sembunyikan nominal dua tingkat, popup “Apa yang baru”

## 1. Sembunyikan nominal: tinggal dua tingkat

“Angka penting saja” dihapus karena hasilnya tetap belang-belang. Sekarang pilihannya **Super ketat** (semua
nominal di semua layar, termasuk chat dan notifikasi) dan **Beranda & Dompet** (Beranda, menu Dompet, dan jendela
yang dibuka dari sana). Perangkat yang dulu memilih “Angka penting saja” otomatis pindah ke Super ketat.

## 2. Popup “Apa yang baru”

Muncul sekali setelah aplikasi diperbarui, dibuat otomatis dari daftar perubahan. Orang yang terakhir melihat
perubahan di versi lama (misalnya 5.3) melihat **semua versi yang terlewat** sekaligus: versi terbaru lengkap, versi
sebelumnya masing-masing satu baris ringkas yang bisa dibuka. Perangkat dari sebelum 8.4 memakai catatan
“Info aplikasi terakhir dibuka” sebagai patokan. Akun baru tidak diberi popup.

## 3. Asisten chat v4

### Kemampuan baru

- **Utang dan piutang dengan urutan kata apa pun**, termasuk contoh dari kamu: “516rb piutang”, “piutang yudi
  516rb”, “td dipinjem mas agus 50rb”, “aku nalangin makan siang nia 45rb”, “850rb utang ke koperasi”. Kalau nama
  orangnya belum disebut, asisten bertanya “Siapa yang pinjam?” / “Pinjam ke siapa?”, dan jawaban pendek berikutnya
  (“yudi”, “yg minjem nia”, “ke om heru”, “dari kevin”) melengkapi kartunya.
- **Mulai mencatat, isinya menyusul**: “catat pengeluaran”, “mau nyatet nih”, “tolong catetin ya”, “catat dong”,
  “catat pemasukan”. Nominal yang datang duluan (“75rb”) disimpan dulu sampai barangnya disebut (“makan siang”).
  Nominal saja tanpa konteks (“45 ribu”) dijawab “buat apa?”, dan “barusan isi bensin” tanpa nominal ditanya
  nominalnya.
- **Transfer yang tujuannya menyusul**: “transfer 300rb” lalu “ke gopay”, atau “top up gopay 100rb” lalu “dari jago”.
- **“1,2jt” sebagai jawaban susulan** dibaca satu nominal. Dulu terpecah di koma jadi “1” dan “2jt”.
- **Pertanyaan susulan setelah total**, memakai periode pertanyaan sebelumnya: “rinciannya dong”, “yang paling besar
  apa?” (kategori terbesar dan transaksi terbesar), “kenapa banyak banget” (kategori penyumbang terbesar dan yang
  paling naik), serta “dibanding sebelumnya gimana?”. Bulan yang masih berjalan dibandingkan dengan hari yang sama di
  bulan sebelumnya (1–15 Sep untuk 1–15 Okt).
- **Tanya lanjut tentang yang barusan dijawab**: “dia kapan bayar?”, “jatuh temponya kapan?”, “udah lunas belum?”,
  “buat apa dulu?”, “sisa berapa bulan lagi”, “berapa nominalnya”.
- **Tanya lanjut dari daftar**: setelah “piutang aku siapa aja”, “yang paling lama siapa?”, “yang paling besar?”,
  “totalnya?”, “ada berapa?”. Lalu “dia kapan bayar?” untuk orang yang barusan dipilih.
- **Hal umum**: tanggal dan hari ini, jam sekarang, sapaan yang dibalas sesuai yang diucapkan (“pagi min” →
  “Selamat pagi”, “good morning”), ekspor ke Excel (tombol CSV di Transaksi), lupa PIN, “undo”, dan “gaji aku cukup
  ga” (dijawab perkiraan sampai gajian; dulu malah jadi kartu pemasukan gaji).
- Kata pembuka “oke,”, “sip,”, sapaan “kak”/“bot” di awal atau akhir kalimat, dan kalimat HURUF BESAR semua tidak
  lagi merusak pembacaan. Nama setelah “kak” tetap dipertahankan (“kak tio ngutang 25k”).

Semua tetap menyiapkan kartu: tidak ada yang tersimpan sebelum kamu mengetuk Simpan.

### Uji (`bench/v84`)

Ditulis **sebelum** mesin v4 diubah (commit e08b155), di atas akun uji v3. Patokannya 8.3.3
(`sh bench/v84/make-baseline.sh`).

| Set | Kasus | Cara dibuat |
|---|---|---|
| dev | 397 | template × isian × permukaan, dipakai selama pengerjaan |
| held-out | 401 | template, nama orang (yessy/fajar/putri/kevin), nominal, barang, dompet, dan permukaan lain |
| tulisan tangan | 63 | kalimat chat berantakan yang ditulis satu per satu, termasuk 8 cek kemampuan lama |

### Hasil

Held-out dan tulisan tangan dijalankan **satu kali** dengan mesin yang sama (commit f9a29d3). Hasil pertamanya
dibekukan di `FROZEN-heldout-first.md` dan `FROZEN-hand-first.md`.

| Set | 8.3.3 | 8.4, percobaan pertama (dibekukan) | 8.4 setelah perbaikan susulan |
|---|---|---|---|
| dev | 152/397 (38%) | – | 397/397 (100%) |
| held-out | 258/401 (64%) | **344/401 (86%)** | 400/401 (99,8%) |
| tulisan tangan | 33/63 (52%) | **60/63 (95%)** | 61/63 (97%) |

Per keluarga di held-out (8.3.3 → percobaan pertama): utang & piutang 88% → 88%, nama orang di pesan berikutnya
0% → 78%, mulai mencatat 77% → 88%, transfer 50% → 100%, susulan setelah total 20% → 100%, tanya lanjut tentang
yang barusan 0% → 80%, dari daftar 0% → 80%, hal umum 22% → 78%, kemampuan lama 50% → 50%.

Hampir semua kegagalan percobaan pertama punya satu penyebab: kata pembuka dan sapaan di sekitar kalimat (“oke,
fajar ngutang 2jt ke aku kak”, “Kak dipinjemin yessy 450 ribu”, “OKE, MAU CATAT NIH”). “Oke” terbaca sebagai nama
orang, dan “kak hutang 150k” terbaca seolah “kak” yang berutang. Kelemahan ini sudah ada di 8.3.3: keluarga
“kemampuan lama” juga gagal 4 dari 8 di sana.

**Perbaikan susulan** (dibuat setelah melihat kegagalan held-out, jadi kolom terakhir tidak buta):
- pembersih kata di sekitar kalimat (“oke,”, “sip,”, “kak …”/“bot …” di awal, “… kak” di akhir, huruf besar semua);
- “saldo gopay berapa deh” lalu “kalau jago?” (kata “deh” dulu merusak susulan);
- “yang paling lama belum bayar” dari daftar;
- sapaan gaya Bar-bar yang menyebut waktu;
- nominal saja tanpa konteks (“45 ribu” → “buat apa?”) dan “barusan isi bensin” tanpa nominal (temuan set tulisan
  tangan).

Pembersih kata ini sempat membuat dua kemunduran di uji lama, dan keduanya diperbaiki sebelum rilis.
- Pertanyaan susulan berhuruf besar di v83 held-out sempat turun ke 95%, karena tanda tanya ikut terbuang.
- Penanya nominal sempat menjawab “datanya aman kan ga dikirim” dan “makan jangan dulu” dengan “Nominalnya berapa?”.
  Sekarang penanya nominal hanya jalan untuk kalimat kegiatan berbayar yang tidak berisi kata ingkar atau pertanyaan.

### Yang masih gagal dan kenapa

- **“dimas bayar 250rb” / “sari bayar 50rb”** (held-out keep-4, tulisan tangan hand-59) jadi pengeluaran, bukan
  pelunasan piutang. Penyebabnya ada di alat uji, bukan di aplikasi. Di akun uji v3, daftar piutang untuk Catat
  otomatis (Sinta, Dina, Atuy, dari fixture lama) berbeda dengan data chat (Dimas, Budi, Sari). Di aplikasi keduanya
  berasal dari data yang sama. Dengan daftar yang disamakan, kedua kalimat itu terbaca sebagai pelunasan piutang
  Dimas dan Sari (sudah dicek). Akun ujinya tidak diubah, karena dipakai juga oleh 10.000+ kasus v83.
- **“kasbon pak rt 300rb”** (hand-8) dibaca sebagai utang (kamu kasbon ke Pak RT). Harapan di uji: piutang. Kalimat
  ini memang bisa dibaca dua arah, jadi dibiarkan. Kartunya bisa diganti jenisnya sebelum disimpan.

### Yang perlu diketahui tentang angka di atas

- Uji dan mesin ditulis oleh penulis yang sama. Kosakata keluarga baru (kata sapaan, kata tanya susulan) sudah ada di
  template saat aturan ditulis. Yang tidak dikodekan ke aturan adalah isiannya (nama orang, nominal, barang, dompet)
  dan permukaannya.
- Satu perbaikan pada pemeriksa uji, dibuat setelah dev dan sebelum held-out dijalankan: kartu konfirmasi hapus untuk
  “undo” (“hapus transaksi terakhir”, baru terhapus kalau diketuk) tidak dihitung sebagai “catatan baru”. Ini memang
  cara kerja undo sejak 7.6.

### Pemeriksaan di aplikasi demo

Dicek di aplikasi demo (emulator, data demo, bukan data asli), di layar HP: popup “Apa yang baru” dari versi 5.3,
“516rb piutang” → “yudi”, “catat pengeluaran” → “75rb” → “makan siang”, “barusan isi bensin” → “45 ribu”, daftar piutang
→ “yang paling lama siapa?” → “dia kapan bayar?”, tanggal hari ini, “oke, kak hutang 150k”, dan pengaturan sembunyikan
nominal dua tingkat. Ada tiga temuan yang tidak tertangkap uji, dan semuanya sudah diperbaiki:
- kartu “516rb piutang ke yudi” masih bertanya “Siapa yang meminjam?”, karena Catat otomatis belum menganggap
  “piutang” dan “dipinjem” sebagai kata kerja (nama Yudi ditandai “perlu dicek”);
- saat ada kartu yang belum disimpan, tanya lanjut dari daftar dan tentang yang barusan tidak jalan, dan “dia kapan
  bayar?” malah mencari catatan “yudi”;
- dengan kartu yang belum disimpan, “barusan isi bensin” tidak ditanya nominalnya, sehingga “45 ribu” berikutnya
  mengubah kartu yang lama.

## 4. Uji lama setelah 8.4

| Uji | 8.3.3 | 8.4 |
|---|---|---|
| Chat heldout / heldout2 / heldout3 | 48/48 · 50/50 · 71/71 | sama |
| Percakapan dev / held-out | 11/11 · 13/13 | sama |
| Dokumen latihan dev / held-out (v79) | 306/306 · 197/197 | sama |
| Humor & menu (v80), set 8.1 (v81) | 40/41 · 66/68 | sama |
| Chat v3 dev / held-out / tulisan tangan (v83) | 3.024 · 7.298 · 187 (100%) | sama |
| Catat V4 (4 set) | 83 · 44 · 18 · 14 | sama |
| Pemeriksaan 1.712 kalimat chat (berubah dibanding 8.3.3) | – | 6: tiga kalimat HURUF BESAR kini ditulis kecil di kartu dan dua “oke …” tanpa “oke” (arti sama), plus “duitku masih aman ga” yang dulu tidak dipahami dan kini dijawab perkiraan sampai gajian |
| Shadow Catat 1.368 kalimat (berubah dibanding 8.3.3) | – | 0 |
| Struk: 9 kirimanmu, 90 + 90 buatan, 262 lama | 9/9 · 90/90 · 90/90 · 0 berubah | sama |
| `npm test` | 798 | 811 lulus, 0 gagal |

Shadow Catat dibandingkan 7.8 tetap 4 perubahan uang. Keempatnya sudah ada sebelum 8.4 (terhadap 8.3.3: 0).

## Batasan

- Konteks hanya mengingat satu langkah ke belakang: catatan, pertanyaan, catatan yang barusan dijawab, atau daftar
  terakhir. Topik dari tiga pesan sebelumnya tidak diingat lagi.
- “Dia” hanya dipahami untuk orang di piutang yang barusan dijawab atau dipilih dari daftar.
- Jam sekarang diambil dari zona waktu di profil saat pesan dikirim.
- Kalimat yang bisa dibaca dua arah (“kasbon pak rt 300rb”) mengikuti satu tebakan. Cek jenisnya di kartu sebelum
  disimpan.
