# 10.4 Asisten chat 4.5

`gen.mjs` membuat 13 keluarga per split (dev / held-out), 1.068 kasus per split. Kata, bentuk kalimat, dan isi
setiap split berbeda; tidak ada kasus (atau pesan terakhir sebuah kasus) yang sama di dev dan held-out. Tiap kasus
dijalankan di dua akun (`bench/v102/state.mjs`) dan baru dihitung benar kalau benar di keduanya. Patokannya 10.3.3
(commit 3cef884), dengan aturan dan model terlatihnya sendiri.

    sh bench/v104/make-baseline.sh              # 10.3.3 ke bench/v104/baseline-v1033 (gitignore)
    SET=dev node bench/v104/run.mjs --fails
    SET=heldout node bench/v104/run.mjs --first # sekali saja; hasilnya dibekukan di FROZEN-heldout-first.md
    SET=dev|heldout node bench/v104/run-model.mjs --fails   # model chat saja, keluarga 13

Keluarga: nominal kata & format, bahasa Inggris, ada angka tapi bukan catatan, tanya catatan, pertanyaan lanjutan,
nabung/utang/anggaran/klaim, cerita panjang, koreksi, tanggal, singkatan & salah ketik, menu & cara, ngobrol &
perasaan, dan obrolan di luar aturan (yang diputuskan model terlatih).

## Hasil

| | 10.3.3 | 10.4 |
|---|---|---|
| dev (dipakai untuk menyetel) | 770/1068 (72%) | 1068/1068 (100%) |
| **held-out, sekali, dibekukan** (`FROZEN-heldout-first.md`) | **661/1068 (62%)** | **877/1068 (82%)** |
| held-out sesudah perbaikan post-hoc (`posthoc-heldout.txt`, bukan ukuran bersih) | 661/1068 (62%) | 1041/1068 (97%) |
| model saja, held-out, sekali (`FROZEN-heldout-model-first.md`) | 41/72 benar, 5 yakin-tapi-salah | 39/72 benar, 13 yakin-tapi-salah |
| model saja, held-out, post-hoc (bukan ukuran bersih) | 41/72, 5 | 50/72, 0 |

Ukuran bersihnya adalah baris yang dibekukan: 62% → 82%. Jarak dev 100% dan held-out 82% besar. Yang tertinggal di
held-out pertama: cerita panjang (25/80, sama dengan 10.3.3), tanya catatan (97/120, sama), koreksi (76/100), dan
obrolan di luar aturan (41/72). Model chat pada uji pertama **tidak lebih baik** dari 10.3.3 (39 vs 41 dari 72), dan
lebih sering yakin tapi salah (13 vs 5; hampir semuanya ditebak "game").

## Perbaikan post-hoc (sesudah held-out pertama)

Semua yang berikut dibuat sesudah melihat kegagalan held-out pertama, jadi angka post-hoc tidak lagi mengukur kalimat
yang belum pernah dilihat. Tiap perbaikan dibuat umum (bukan per kalimat), dicek ulang di dev (tetap 1068/1068) dan
semua set lama, dan dikunci di `tests/chat-v104.test.mjs`.

- Cerita panjang: kategori dan nama barang dibaca dari bagian kalimat yang memuat nominal ("abis meeting langsung
  cabut, sempet beli soto 27rb" → Soto, Makan & Minum; dulu kategori "kerja" dan nama seluruh cerita).
- Koreksi di pesan yang sama: "eh bentar, 30rb ding", "koreksi jadi 15rb". Waktu dicoba di aplikasi demo, "ding" masih
  muncul sebagai nama tempat di kartu (bench hanya memeriksa nominal dan nama barang); "ding/deng" sekarang bukan tempat.
- "sejeti" = 1 juta, "IDR 45.000", "ngopi2" (kata ulang dengan 2), "ke rekening mandiri" sebagai tujuan.
- Tanya: "per harinya", "total bayar pk jago bulan kemarin" tanpa "berapa", "kpn terakhir", "transaksi paling mahal"
  per periode, susulan dengan periode singkat ("bln ini", "kemaren"), "rata-ratanya?".
- "budget 80rb dapet kamera ga" sebagai pertanyaan cukup/nggak (kata "dapet" sudah diubah jadi "dapat" sebelum aturan
  membacanya, jadi aturannya tidak pernah cocok).
- Model chat: kata ganti bahasa Inggris tidak lagi dibaca sebagai "aku"/"kamu" (kalimat yang tinggal "aku" condong ke
  "game"), kalimat yang isinya cuma kata ganti/pengisi dilatih sebagai "diam", "main tebak2an" tidak lagi dilabeli game
  (tebak-tebakan itu jokes), dan kosakata bahasa Inggris sehari-hari ditambahkan (`G104B`, tidak dijaga dari kata
  held-out; kalimat held-out yang persis sama tetap dibuang dari data latih). Hasilnya 0 yakin-tapi-salah di held-out.
- Tiga pertanyaan chat lama (set heldout2) yang tergeser model baru ditangani aturan: "kamu ai beneran?", data
  disimpan di server, "rangkum pengeluaranku".

## Latih ulang

- **Model chat** (`scripts/build-chat-model.mjs`): 898 kalimat tulisan tangan + 13.123 kalimat buatan, 33.088 dengan
  variasi ejaan; 431 kalimat yang sama dengan kalimat uji tersembunyi (semua set chat, v103, v1031, v104) dibuang.
  Kalimat 4.5 (`generatedCorpus104`) dijaga: build berhenti kalau memakai kata yang cuma ada di held-out 4.5. Ukuran
  2,46 MB (10.3.3: 2,42 MB); tetap dimuat setelah chat dibuka.
- **Pembaca kalimat** (`scripts/train-tagger.mjs`): 40.000 kalimat 10.3 dibuat persis sama (dicek identik), ditambah
  6.000 kalimat 10.4 dari benih acak sendiri (bahasa Inggris, nominal dengan kata, kata pengantar dompet singkat);
  daftar kata 10.4 dijaga dari kata khas held-out 4.5 (`assert104`). Uji sendiri pada kalimat bentuk lama 98,59% →
  98,62% kata benar; pada kalimat bentuk 10.4 81,5% → 99,97% (generator yang sama dengan data latih, jadi wajar tinggi).
  Ambang perbaikan ejaan dompet tidak diubah (203/203 salah ketik dev v103 tetap diperbaiki, jebakan sama).
  Ukuran 460 KB (10.3.3: 435 KB).

## Set lama (posthoc, mesin saja)

Sama atau lebih baik dari 10.3.3 di semua set, kecuali v1031 held-out 516 → 515 (satu kasus: "bosku, 300ribu buat
pulsa krom"; kata seru di depan kalimat yang sengaja dijauhkan dari data latih). v103 held-out 1620 → 1631, v1031 dev
550 → 553, chat heldout2 (aturan saja) 41 → 44 dari 50. npm test 1005/1005.

## Catatan kejujuran

- Kedua split ditulis oleh orang yang sama yang menulis mesinnya; held-out tidak buta terhadap penulisnya.
- Beberapa aturan pra-held-out ditulis untuk bentuk kalimat yang juga ada di generator held-out (penulisnya sama),
  misalnya pola "budget … dapet … ga"; pola itu justru tidak berjalan di uji pertama.
- Keluarga 13 ditambahkan ke kedua split sebelum held-out pertama dijalankan, sesudah kegagalannya di dev dilihat.
