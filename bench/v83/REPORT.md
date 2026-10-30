# Laporan 8.3: sembunyikan nominal 3 tingkat dan asisten chat v3

## 1. Sembunyikan nominal: tiga tingkat

Pilihan baru di **Pengaturan → Tampilan → Yang disembunyikan** (disimpan per perangkat):

| Tingkat | Yang disamarkan |
|---|---|
| Super ketat (bawaan, sama seperti sebelumnya) | Semua nominal di semua layar, termasuk chat dan notifikasi |
| Angka penting saja | Saldo, uang bebas, aset, pemasukan, tabungan, utang, piutang, proyeksi. Pengeluaran harian, anggaran, dan kategori tetap terlihat |
| Beranda saja | Hanya nominal di Beranda |

“Angka penting” memakai dua cara: area yang isinya pasti penting (hero Beranda, kartu dompet/aset/pemasukan/
proyeksi, menu Dompet, Tujuan, Utang, Piutang, Proyeksi), dan kata label terdekat sebelum nominal (“Uang bebas
Rp…”, “Pemasukan Rp…”, “Sisa utang Rp…” disamarkan; “Pengeluaran Rp…”, “Makan Rp…” tidak). Di chat, angka tanpa
label (angka besar di kartu, baris dompet) mengikuti topik jawabannya.

Dicek di aplikasi demo (emulator, bukan data asli) untuk 10 menu di ketiga tingkat. Pada tingkat penting,
Beranda menyamarkan 19 dari 75 nominal, Dompet/Tujuan/Utang semuanya, Anggaran dan Analisis tidak ada. Perbaikan
kecil ikut masuk: titik atau koma setelah nominal tidak lagi ikut tersamarkan (“Rp•••••.” bukan “Rp•••••”).

## 2. Asisten chat v3

### Kemampuan baru

- Uang bebas sekarang (“uang bebasku berapa”, “duit gue tinggal berapa”) dan jatah harian sampai gajian.
- Hitung nabung, tidak lagi jadi catatan: lama menabung, nabung per bulan, total setelah sekian waktu, dan
  susulannya (“kalau 1jt per bulan?”). Nominal dalam kata (“sejuta”, “setengah juta”) ikut dibaca.
- Tanggal dan hari tertentu: “tanggal 5”, “17 agustus”, “tanggal 20 bulan lalu”, “senin kemarin”, “rabu minggu
  lalu”, “hari minggu kemarin”, “tgl 1 kemarin”.
- Persentase satu jenis pengeluaran, rincian per kategori (sama dengan hitungan Beranda dan Laporan, termasuk
  “Bayar utang”), di mana harus hemat (kebutuhan tetap tidak disarankan dipotong), dan skor kesehatan dari Insight.
- Satu utang, piutang, tujuan dana, wish list, tagihan rutin, atau klaim menurut namanya, perkiraan lunas atau
  tercapai, tagihan terdekat, dan susulan “kalau dimas?”. Kalau tujuannya belum ada, asisten menawarkan membuatnya.
- Saldo satu dompet dengan kalimat apa pun (“isi jago berapa”, “uang cash aku berapa”).
- “total kopi bulan ini” dan “transport bulan ini” (tanpa “berapa”) dijawab.
- Pertanyaan dengan salah ketik, singkatan, sapaan (“bot,”, “min”, “kak”), emoji, akhiran -nya/-ku, bahasa Inggris,
  campuran, Jawa, Sunda, dan Betawi dipahami. Lapisan ini hanya dipakai untuk pesan **tanpa nominal**. Kalimat
  catatan tetap diteruskan ke Catat otomatis persis seperti diketik.

### Uji besar (`bench/v83`)

Ditulis **sebelum** mesin v3 diubah (commit de86de4), di atas akun uji baru: tiga bulan transaksi, tiga dompet,
dua utang, tiga piutang, tiga tujuan, dua wish list, empat tagihan rutin, dan dua klaim. Jawaban benarnya dihitung
oleh `oracle.mjs`, terpisah dari mesin chat; yang dicek adalah angka di jawaban, bukan hanya topiknya.

| Set | Kasus | Cara dibuat |
|---|---|---|
| dev | 3.024 | template × isian × permukaan (kata ganti, cara tulis “berapa”, kata depan/belakang, huruf besar), dipakai selama pengerjaan |
| held-out | 7.298 | template, permukaan, dan isian lain (kategori, toko, tanggal, nominal, salah ketik) |
| tulisan tangan | 187 | kalimat chat berantakan yang ditulis satu per satu, termasuk 20 cek kemampuan lama |

Ada 22 keluarga kemampuan, termasuk “tetap jadi catatan” (kalimat catatan yang tidak boleh diambil fitur baru) dan
tanya susulan dua giliran.

### Hasil

Held-out dan tulisan tangan dijalankan **satu kali**, dan hasil pertamanya dibekukan di `FROZEN-heldout-first.md` dan
`FROZEN-hand-first.md`.

| Set | 8.2 | 8.3, percobaan pertama (dibekukan) | 8.3 setelah perbaikan susulan |
|---|---|---|---|
| dev | 804/3.024 (27%) | – | 3.024/3.024 (100%) |
| held-out | 1.335/7.298 (18%) | **6.222/7.298 (85%)** | 7.298/7.298 (100%) |
| tulisan tangan | 85/187 (45%) | **175/187 (94%)** | 187/187 (100%) |

Per keluarga di held-out (8.2 → percobaan pertama): uang bebas 0% → 67%, saldo 27% → 94%, jatah harian 15% → 95%,
hitung nabung 0% → 46%, tanggal 4% → 60%, total per kategori 39% → 100%, per toko 14% → 80%, persentase 0% → 97%,
rincian 0% → 100%, utang 40% → 94%, piutang 21% → 87%, tujuan 19% → 87%, wish list 11% → 88%, tagihan rutin
19% → 100%, klaim 27% → 100%, skor 0% → 99%, hemat 79% → 100%, salah ketik 7% → 100%, Inggris 15% → 98%, daerah
5% → 100%, tetap jadi catatan 100% → 100%, tanya susulan 17% → 90%.

**Perbaikan susulan** (dibuat setelah melihat kegagalan held-out, jadi angka 100% di kolom terakhir tidak buta):
akhiran -nya/-ku (“nganggurnya”, “jagonya”, “daruratku”), nominal dalam kata (“sejuta”), “berapaan”/“brapah” di
kalimat nabung, kata kerja “ngeluarin”/“ngabisin”, “tgl 1 kemarin” (dulu terbaca bulan lalu), “sebulan kemarin”,
“transaksi tanggal 7 apa aja”, emoji yang merusak tanya susulan, “jajan di grab” (dulu dibatasi kategori Jajan),
urutan pemeriksaan (pertanyaan v3 sebelum obrolan dan FAQ), dan “yang bener-bener” yang dulu terbaca “serius dong”.

### Yang perlu diketahui tentang angka di atas

- Uji dan mesin ditulis oleh penulis yang sama. Template held-out sudah ada saat aturan v3 ditulis, jadi kosakata
  beberapa keluarga (Inggris, daerah, kata tanya per item seperti “nunggak” atau “kebeli”) bukan ukuran buta.
  Yang benar-benar tidak dikodekan ke aturan adalah isiannya (kategori, toko, tanggal, nominal, nama) dan
  permukaannya (sapaan, huruf besar, akhiran, emoji).
- Dua perbaikan pada alat uji, keduanya sebelum held-out dijalankan: akun uji v3 memakai tanggal gajian 24 untuk
  Catat dan chat (fixture lama memberi Catat 25, padahal di aplikasi keduanya dari profil yang sama), dan satu
  harapan di set tulisan tangan (“wkwkwk” berlabel *banter*, bukan *laugh*).
- Pemeriksaan di aplikasi demo menemukan dua hal yang tidak tertangkap uji, dan keduanya sudah diperbaiki:
  “aku harus hemat di mana” sempat menyarankan kategori sewa milik pemakai, dan “liburan bali” sempat dijawab
  dengan tujuan “Liburan Jepang”.

## 3. Uji lama setelah 8.3

Selama pengerjaan sempat ada kemunduran: lapisan pemahaman v3 mengubah kalimat catatan (“kak tio ngutang 25k” jadi
“tio …”, “SRPN Coffee” jadi “kopi”, “dinner w/ fam” jadi “aku/ fam”), menghapus sapaan “hai hai”, dan menjawab curhat
“duit gw tinggal dikit bgt” dengan uang bebas. Semuanya ditemukan lewat uji lama dan diperbaiki sebelum rilis.

| Uji | 8.2 | 8.3 |
|---|---|---|
| Chat heldout / heldout2 / heldout3 | 48/48 · 50/50 · 71/71 | sama |
| Percakapan dev / held-out | 11/11 · 13/13 | sama |
| Dokumen latihan dev / held-out (v79) | 306/306 · 197/197 | sama |
| Humor & menu (v80), set 8.1 (v81) | 40/41 · 66/68 | sama |
| Catat V4 (4 set) | 83 · 44 · 18 · 14 | sama |
| Pemeriksaan 1.712 kalimat (berubah dibanding 8.0) | 5 | 6: lima yang sama, plus “berapa sisa uang di jago?” yang kini dijawab kartu chat dengan angka yang sama |
| Shadow Catat 1.368 kalimat | 4 perubahan yang disengaja (7.9) | sama |
| Struk: 9 kirimanmu, 90 + 90 buatan, 262 lama | 9/9 · 90/90 · 90/90 · 0 berubah | sama |
| `npm test` | 785 | 794 lulus, 0 gagal |

## Batasan

- Hitung nabung tidak memperhitungkan bunga atau inflasi; bulan dihitung 30 hari dan setahun 365 hari.
- Salah ketik hanya dibetulkan ke kata uang yang umum (pengeluaran, pemasukan, saldo, anggaran, dan sejenisnya),
  satu huruf meleset untuk kata pendek atau dua untuk kata panjang, dan tidak pada kalimat yang berisi nominal.
- Bahasa Inggris dan bahasa daerah yang dikenali terbatas pada kata dan ungkapan seputar uang.
- “Angka penting” bergantung pada label di dekat nominal. Nominal tanpa label yang jelas, di layar yang belum
  dipetakan, bisa tetap terlihat; pilih Super ketat untuk privasi penuh.
