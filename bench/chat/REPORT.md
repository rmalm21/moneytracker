# Asisten chat (rilis 7.8, "chatbot v2")

Semua jalan di HP, tanpa internet dan tanpa layanan AI di awan. Rilis 7.8 menambahkan kepribadian dan percakapan yang
berlanjut di atas rilis 7.7 (bagian di bawah tetap berlaku).

## Yang baru di 7.8

- **Kepribadian** (`lib/chat/persona.ts`, semua kalimatnya ditulis untuk aplikasi ini):
  - 24 lelucon, pantun, dan gombalan, masing-masing dengan penjelasan lucunya untuk "maksudnya?".
  - Balasan bercanda, termasuk saat leluconnya dibilang garing.
  - Balasan saat pemakai marah: minta maaf, memberi petunjuk (kalau ada kartu yang menunggu), dan menawarkan untuk
    diajari.
  - Balasan saat pemakai minta maaf, dan mode serius.
  - Mendengarkan curhat sesuai topiknya: cinta, kerja, kuliah, keluarga, sepi, atau umum. Balasan pertama dan
    berikutnya berbeda.
  - Untuk kata-kata menyakiti diri, balasannya hati-hati dan menyebut layanan kesehatan jiwa 119 ekstensi 8 serta 112,
    tanpa candaan.
- **Percakapan berlanjut** (ingatan obrolan di `lib/chat/engine.ts`):
  - Topik terakhir: "lagi" atau "yang lain?" melanjutkan lelucon, tips, atau curhat.
  - Tawaran asisten: "Mau cek pengeluaran hari ini?" dijawab "boleh" atau "nggak usah".
  - Penjelasan jawaban terakhir untuk "kenapa?" atau "maksudnya?": ringkasan, boleh beli, gajian, anggaran, hitungan,
    target, tips, dan jawaban Tanya.
  - Mode serius: "udah ah serius, ringkasan bulan ini" langsung menjawab sisanya.
  - Kata yang divariasikan, jadi lelucon tidak terulang.
- **Diajari pemakai:**
  - Setelah dua pesan berturut-turut tidak dipahami, asisten menawarkan "Ajari aku" dan menanyakan maksud kalimat tadi.
  - Bisa juga langsung: "kalau aku bilang boncos artinya boros" atau "inget ya, X itu artinya Y". Maksudnya diperiksa
    dulu harus bisa dipahami, kalau belum, tidak disimpan.
  - Kata pendek yang diajarkan juga dipakai di dalam kalimat lain: "aku boncos banget" dibaca "aku boros banget".
  - Semua tersimpan di HP ini, maksimal 60, dan bisa dihapus satu per satu di pengaturan.
- **Singkatan dan salah ketik** (`lib/chat/feature.ts`): "km bs ngapain aj", "kpn", "pagiii kakk", dan sejenisnya
  diseragamkan sebelum dibaca model maupun aturan.
- **Model dilatih jauh lebih banyak:**
  - 668 kalimat tulisan tangan + 4.350 kalimat dari generator (`lib/chat/corpus-gen.ts`, pola dan isian kata yang
    ditulis untuk aplikasi ini), jadi 13.029 dengan variasi ejaan, untuk 26 maksud (sebelumnya 1.675 untuk 19).
  - 62 kalimat yang terbaca sama dengan set uji dibuang sebelum pelatihan.
  - Salinan kalimat latihan dibuang dari model yang dikirim ke HP. Skrip pelatihan memeriksa model kecilnya menjawab
    sama persis dengan model penuh pada 233 pesan uji.
  - Ukuran 1,1 MB mentah, 169 KB terunduh (gzip), dan baru dimuat saat chat dibuka.
- **Sumber data:** data percakapan bahasa Indonesia yang terbuka dicari dulu. Yang ditemukan berupa tweet tanpa lisensi
  yang jelas, atau set buatan AI yang kartunya sendiri menyebut isinya bisa tidak akurat. Karena itu tidak ada data
  luar yang dipakai.

### Ukuran 7.8

Semua set uji di bawah ditulis sebelum kemampuan 7.8 dibuat dan dijalankan pertama kali sekali saja (dibekukan).
`SET=heldout3 node bench/chat/run.mjs --fails`, `DIALOGS=heldout node bench/chat/run-dialogs.mjs --fails`.

| Set | 7.7 | 7.8 percobaan pertama (dibekukan) | 7.8 setelah perbaikan post-hoc |
|---|---|---|---|
| Pesan tunggal baru (`fixtures-heldout3.mjs`, 71) | 28/71 (39%) | 66/71 (93%) | 71/71 (100%) |
| · maksud baru (bercanda, marah, humor, serius, curhat, ajari, maaf) | 0/38 | 38/38 | 38/38 |
| Percakapan berlanjut (`dialogs-heldout.mjs`, 13 percakapan, 34 giliran) | 1/13 · 13/34 giliran | 13/13 · 34/34 giliran | 13/13 |
| Percakapan, set latihan (`dialogs-dev.mjs`, 11) | 1/11 | dipakai saat membangun | 11/11 |
| Set uji 1 (48, sudah pernah dilihat) | 47/48 | | 47/48 |
| Set uji 2 (50, sudah pernah dilihat) | 50/50 | | 50/50 |

- Lima salah pada percobaan pertama semuanya maksud lama yang ditulis dengan singkatan atau susunan tak biasa:
  - "km bs ngapain aj sih" (bantuan)
  - "kamu tuh sebenernya apa" (tentang asisten)
  - "liat template nya dong" (contoh)
  - "duit gw tinggal dikit bgt" (perasaan soal uang)
  - "gajian kpn sih" (gajian)
- Perbaikan post-hoc:
  - Aturan juga membaca singkatan yang sudah diseragamkan.
  - Pola "kamu tuh sebenarnya apa", "liat template", dan "duit gue tinggal dikit" ditambahkan.
- Set 2 sempat mundur satu karena model baru: "balas pendek pendek aja" terbaca sebagai bercanda. Kata "balas/bales"
  ditambahkan ke pemicu gaya bahasa (post-hoc).
- **Catatan jujur:** set uji, korpus, dan aturan ditulis oleh penulis yang sama dalam sesi yang sama. Kalimat yang persis
  sama dibuang dari korpus. Meski begitu, angka ini kemungkinan lebih tinggi daripada di pemakaian nyata.

### Catat otomatis: bagian sendiri ("290k hokben kemarin gue cuma 45k")

`lib/catat/math.ts` `readOwnPart`. Hanya bagianmu yang dicatat; tidak ada Split Bill atau piutang. Totalnya satu ketukan
("Catat totalnya"). Kalau "jadi 50rb" ditulis di chat, yang berubah bagianmu, bukan total tagihannya.

| Set (`SET=v78dev|v78heldout node bench/quick/run-v4.mjs`) | 7.7 | 7.8 |
|---|---|---|
| Latihan (18, termasuk 4 kalimat penjaga) | 4/18 (bagian sendiri 0/14) | 18/18 |
| Uji terpisah (14), percobaan pertama (dibekukan: `bench/quick/FROZEN-v78heldout-first.json`) | 3/14 (bagian sendiri 1/12) | 13/14, tanpa "yakin tapi salah" |
| Uji terpisah setelah perbaikan post-hoc | | 14/14 |

- Satu salah di percobaan pertama: nominal "hotpot 480rb aku cuma 120rb, sisanya biarin" sudah benar, tapi kategori
  hotpot belum dikenal. Post-hoc: hotpot, shabu, suki, dan steamboat ditambahkan ke kosakata makanan.
- Set V4 lama tetap 83/83 dan 44/44. Shadow 1.213 kalimat lama: tidak ada arti uang atau kategori yang berubah.

### Lain-lain di 7.8

- Membuka chat atau Catat otomatis tidak lagi memfokuskan kotak ketik di HP, jadi keyboard tidak muncul sendiri. Di
  laptop dengan mouse, kotak ketik tetap langsung siap.
- Kapsul fakta di kartu hasil dirapikan: tingginya sama, teksnya di tengah, dan "Kenapa?" sejajar. Nominal tidak lagi
  patah baris, dan di kartu sempit tombol "Bukan ini?" pindah ke bawah judul.
- `tests/chat.test.mjs`: 18 tes (4 baru untuk v2). `tests/catat-v4.test.mjs`: 1 tes baru untuk bagian sendiri.
  `npm test`: 745 lulus.

---

# Rilis 7.7

Semua jalan di HP, tanpa internet dan tanpa layanan AI di awan. Ada tiga lapis:

1. **Catat otomatis (V4)** dipakai apa adanya untuk mencatat, menjawab pertanyaan, serta mengubah atau menghapus
   catatan terakhir.
2. **Aturan percakapan** (`lib/chat/engine.ts`) menangani konteks obrolan, tanya balik, kalkulator, ringkasan,
   anggaran, gajian, "boleh beli?", tips, target tabungan, perasaan soal uang, obrolan ringan, gaya bahasa, dan template.
3. **Model maksud pesan** (`lib/chat/model.ts`): NLP.js, pustaka JavaScript khusus chatbot yang jalan offline. Model ini
   dilatih saat build dari `lib/chat/corpus.ts` dan hanya membaca pesan yang tidak tertangkap aturan.
   - 7.7: 494 kalimat (sebelumnya 221) untuk 19 maksud (sebelumnya 14). Maksud baru: anggaran, gajian, target, perasaan,
     dan obrolan ringan.
   - Setiap kalimat juga dilatih dalam ejaan sehari-hari (`augment`: aku/gue/saya, ga/nggak/gak, gimana/gmn,
     berapa/brp, akhiran "dong"/"sih"), sehingga totalnya 1.675 kalimat.
   - Ukuran model 410 KB. Model hanya dimuat saat chat dibuka.

Selain itu, asisten **belajar dari pemakai**. Kalau ia belum paham lalu kamu menulis ulang, ungkapan pertama diingat di HP
ini, maksimal 60 ungkapan, dan bisa dihapus di pengaturan. Ini hanya berlaku untuk maksud tanpa nominal. Uang selalu
dibaca ulang dari kalimatnya.

## Ukuran: maksud pesan di set uji terpisah

`SET=heldout2 node bench/chat/run.mjs --fails` dan `SET=heldout node bench/chat/run.mjs --fails`. Kolom "7.6" adalah
salinan beku mesin 7.6 (`bench/chat/baseline-v76/`).

### Set uji 2 (50 pesan, 7.7)

`fixtures-heldout2.mjs` berisi semua maksud 7.6 dengan kata-kata baru, ditambah kemampuan 7.7. Set ini ditulis sebelum
korpus diperbesar dan sebelum kemampuan baru dibuat.

| | 7.6 | Aturan saja | Aturan + model |
|---|---|---|---|
| **Percobaan pertama** (dibekukan: `FROZEN-heldout2-first.md`) | 31/50 (62%) | 37/50 (74%) | 49/50 (98%) |
| Setelah perbaikan post-hoc | | 38/50 (76%) | 50/50 (100%) |

- Pada percobaan pertama model memutuskan 12 pesan, dan tidak ada yang salah.
- Satu-satunya salah di percobaan pertama: "malam kak, masih bangun?" dibaca sebagai pertanyaan. Perbaikan post-hoc
  dibuat setelah melihat hasil itu: salam yang diikuti basa-basi pendek sesudah koma dibaca sebagai salam. Angka 100%
  sudah dibantu set uji.
- **Catatan jujur:** set uji dan korpus latihan ditulis oleh penulis yang sama dalam sesi yang sama. Sebelum
  pelatihan, kalimat uji yang persis sama setelah nominal dan angka diganti (4 kalimat) dibuang dari korpus. Meski
  begitu, gaya bahasanya mirip, jadi angka ini kemungkinan lebih tinggi daripada di pemakaian nyata.

### Set uji 1 (48 pesan, 7.6)

| | Aturan saja | Aturan + model |
|---|---|---|
| Percobaan pertama 7.6 (dibekukan: `FROZEN-heldout-first.md`) | 32/48 (67%) | 43/48 (90%) |
| 7.6 setelah perbaikan post-hoc | 38/48 (79%) | 47/48 (98%) |
| 7.7 sebelum perbaikan salam | 38/48 (79%) | 46/48 (96%) |
| 7.7 | 39/48 (81%) | 47/48 (98%) |

- Set ini sudah dipakai untuk perbaikan di 7.6, jadi bukan lagi uji buta. Gunanya untuk memastikan tidak ada yang
  mundur.
- Di 7.7 sempat ada satu kemunduran: "pagi min, apa kabar" terbaca sebagai obrolan ringan, bukan salam. Penyebabnya
  sama dengan salah di set 2, dan perbaikan salam di atas memulihkannya.
- Sisa 1 salah sama seperti 7.6: "aku boros nggak sih" dijawab dengan tips, padahal ditandai sebagai ringkasan.

## Kemampuan baru 7.7

| Kemampuan | Contoh | Jawaban |
|---|---|---|
| Semua anggaran | "anggaranku gimana", "budget mana yang mau habis" | Sisa total, bar per anggaran (hijau/kuning/merah). Satu anggaran yang disebut namanya tetap dijawab Tanya. |
| Gajian | "kapan gajian?", "jatah harian sampai gajian berapa" | Sisa hari, tanggal gajian, uang bebas, jatah per hari, rata-rata belanja, bar periode gaji |
| Perasaan soal uang | "aduh lagi bokek", "pusing mikirin tagihan" | Kalimat menenangkan, angka uang bebas, dan tiga langkah kecil (salah satunya dari pengeluaran terbesar) |
| Target tabungan | "pengen nabung 30jt buat nikah", "mau siapin dana darurat" | Cicilan per bulan (12 dan 6 bulan) dan tombol "target nikah 30jt" yang dibaca Catat otomatis sebagai tujuan dana baru. Tanpa nominal: saran 10–20% pemasukan; dana darurat: 3–6 kali pengeluaran sebulan. |
| Obrolan ringan | "apa kabar", "aku bosen nih", "lagi galau" | Balasan singkat sesuai gaya bahasa, dengan saran pesan |

Kalimat yang mirip tetap masuk ke jalurnya masing-masing: "nabung 500rb ke jago" tetap dicatat, "gimana caranya bisa
nabung" tetap dijawab tips, "gajian 8jt masuk jago" tetap dicatat, dan "sisa anggaran makan berapa" tetap dijawab Tanya.

## Kartu jawaban

- Setiap jawaban chat sekarang berupa kartu dengan ikon dan warna sesuai jenisnya, angka utama, kotak angka kecil, bar
  progres, dan langkah bernomor.
- Kartu Catat otomatis dan Tanya memakai rangka yang sama, baik di luar maupun di dalam chat.
- Diperiksa dengan screenshot di aplikasi demo (emulator, akun demo), dalam mode terang dan gelap.

## Hapus pesan dan tata letak

- Pesan bisa dipilih lewat tekan lama, klik kanan, atau "Pilih pesan" di pengaturan. Setelah itu ada tombol Salin, Hapus,
  dan Urungkan (6 detik). Riwayat yang tersimpan di HP ikut berubah. Kalau kartu yang belum disimpan ikut terhapus,
  obrolan tidak lagi merujuk ke kartu itu.
- Audit otomatis dilakukan di 5 tampilan × lebar 360, 390, dan 1280 px × terang/gelap (30 kombinasi). Hasilnya: tidak
  ada elemen yang keluar panel, teks yang terpotong, gelembung yang mepet ke tepi atau ke avatar, atau tombol kirim yang
  mepet.
- Yang diperbaiki dari audit:
  - Chip saran dan tombol kecil dinaikkan ke tinggi minimal 32 px.
  - Placeholder kotak ketik tidak lagi turun baris.
  - Subjudul header dipendekkan.
  - Chat selalu terbuka di pesan terakhir. Sebelumnya, kartu yang selesai digambar belakangan membuat posisi gulir
    tertinggal.

## Uji lain

- `tests/chat.test.mjs`: 14 tes, termasuk anggaran, gajian, perasaan, target, obrolan ringan, dan salam dengan basa-basi.
- `npm test`: 740 lulus.
- Mesin Catat otomatis tidak berubah di 7.7, jadi hasil 7.6 tetap berlaku: V4 latihan 83/83, uji tersembunyi 44/44,
  dan shadow 1.213 kalimat tanpa perubahan arti uang.

## Kenapa bukan LLM sungguhan?

LLM yang jalan di browser (misalnya WebLLM atau transformers.js) butuh unduhan model sekitar 1–2 GB dan GPU. Itu
berat untuk HP, lambat saat pertama dibuka, dan boros kuota. NLP.js dipilih karena memang dibuat untuk chatbot, jalan
offline di HP, mendukung bahasa Indonesia, dan sudah ada di aplikasi.
