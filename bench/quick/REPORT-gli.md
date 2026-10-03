# Catat otomatis — General Language Intelligence v1.0

Rilis aplikasi 4.10. Tujuannya: akun baru dengan Kamus Pribadi kosong sudah mengerti cara orang Indonesia mengetik di chat. Itu mencakup singkatan, salah ketik, huruf diulang, nominal yang menempel ("makan25k"), tanda baca ("mkn:25k"), kata pengisi ("wkwk", "catetin …"), emoji, dan teman makan ("ama temen").

Prinsip: **normalisasi boleh mengubah bentuk kata, tidak pernah arti keuangan.** Nominal, tanggal, dompet, arah uang, dan nama tidak pernah ditulis ulang.

## 1. Letak lapisan

```
kalimat mentah
  → BAHASA UMUM (lib/catat/language.ts)          ← baru
      1. pembersihan aman    emoji, "catetin/tolong catat", wkwk/haha, "mkn:25k", "makan25k", "ama temen"
      2. kamus terkurasi     singkatan chat, slang, salah ketik umum, kata waktu, kata kerja beli/pesan
      3. singkatan produktif bentuk yang belum pernah dilihat, dihitung dari kosakata kanonik
  → TATA BAHASA KEUANGAN (lib/quick-plan.ts) → WAKTU → ENTITAS → KAMUS PRIBADI → SESI → BUG CATCHER
```

`parseQuickPlan` sekarang:
1. menjalankan lapisan bahasa umum dulu;
2. membaca teks hasil normalisasi dengan tata bahasa yang sama seperti sebelumnya;
3. menyimpan kalimat asli (`sourceText`) dan setiap perubahan (`plan.language.notes`: raw → normalized, kelas, tingkat).

Perubahan kata tampil di "Kenapa?" ("Bahasa umum: “srapn” dibaca “sarapan”") dan di trace developer.

Kategori tetap diputuskan oleh mesin kategori (`lib/categorize.ts`). Singkatan hanya dipetakan ke **kata** kanonik, jadi keterangan tidak hilang: "srapn 22rb" tersimpan dengan keterangan **Sarapan** dan kategori Makan & Minum.

## 2. Mesin singkatan produktif

Daftar singkatan tidak ditambah satu per satu. Mesin menghitung sendiri bentuk singkat dari ±190 kata kanonik (makan, sarapan, parkir, bensin, listrik, tagihan, pengeluaran, tabungan, kereta, …). Bentuk yang dihasilkan:
- vokal dibuang semua atau sebagian (sarapan → srpn, srapn, sarapn, srpan);
- satu konsonan di tengah hilang (sarapan → sarpan).

Saringan keamanan:

| Aturan | Contoh yang ditolak |
|---|---|
| Minimal separuh huruf tersisa, minimal 2 konsonan | pengeluaran → "pnl" |
| Bentuk 3 huruf hanya kerangka konsonan penuh dari kata pendek | kantor → "kat" |
| Tidak membuang separuh pasangan vokal | kuota → "kota", tunai → "tuna", siang → "sang" |
| **Analisis tabrakan**: bentuk milik dua kata kanonik = ambigu, tidak dipakai | cmln (cemilan/camilan), krt (kereta/kartu), dns (dinas/donasi) |
| **Kata asli tidak pernah dianggap singkatan**. Sumbernya kosakata mesin kategori, nama tempat bawaan, dan daftar kecil kata umum. | kota, krim, kamus, kurus, seolah, tarian, plang, tuna |
| Bukan kata fungsi, bukan kunci kamus terkurasi | – |
| Hanya dipakai bila kalimat menyebut uang (nominal atau kata kerja uang) | "srapn" saja tidak diubah |

Hasil kompilasi: 1.148 bentuk unik dan 7 bentuk ambigu, dibangun sekali (±16 ms) lalu dicari dengan satu lookup per kata.

Mekanisme lain:
- huruf diulang ("makannn", "bensinn", "blnjaa"): diringkas hanya bila hasilnya kata yang dikenal dan bentuk aslinya bukan kata. "maaf" dan "saat" tetap.
- akhiran -nya ("srpnnya" → "sarapannya").

## 3. Perlindungan entitas (sebelum normalisasi)

Kata berikut tidak pernah diubah:
- nama dompet, kategori, orang di piutang/utang, kontak, dan tempat dari riwayat pengguna;
- kata di Kamus Pribadi yang aktif (mis. "srpn" diajarkan sebagai tempat Serpong);
- kata HURUF BESAR ("SRPN", "MKN", "BBM"), kecuali seluruh kalimat diketik besar;
- kata berhuruf kapital di tengah kalimat ("Ceban Cafe");
- kata sebelum store/cafe/coffee/resto/mart/…;
- kata sebelum kata kerja utang ("Mkn ngutang"), dan kata setelah ke/dari/sama di kalimat utang.

Kata ganti dan kata fungsi tidak pernah dianggap nama. "dia utang ke gue" tetap membaca "gue" = aku.

Slang nominal juga ikut dilindungi: "Ceban Cafe" tidak lagi menjadi "10000 Cafe".

## 4. Hasil benchmark (tanpa Kamus Pribadi)

Pembanding: 4.9, dibekukan di `bench/quick/baseline-v34`. Runner: `bench/quick/run-gli.mjs`.

### Set pengembangan (`fixtures-glidev.mjs`, 84 kalimat)

| | 4.9 | 4.10 |
|---|---|---|
| Benar seluruhnya | 59/84 (70%) | **84/84 (100%)** |
| · A kanonik | 20/20 | 20/20 |
| · B varian | 20/40 | 40/40 |
| · C adversarial | 19/24 | 24/24 |
| Keterangan tetap ada | 23/36 | 36/36 |
| **Normalisasi salah** | – | **0** |
| Regresi vs 4.9 | – | 0 |

### Held-out baru (`fixtures-gliheldout.mjs`, 40 kalimat; bentuk yang tidak ada di set dev, tabel, maupun tes)

| | 4.9 | 4.10 run pertama (dibekukan) | 4.10 akhir |
|---|---|---|---|
| Benar seluruhnya | 27/40 (68%) | 38/40 (95%) | 40/40 (100%) |
| Normalisasi salah | – | **0** | **0** |
| Regresi vs 4.9 | – | 0 | 0 |

Dua kegagalan pada run pertama adalah "bensinn" dan "blnjaa" (huruf ganda dua kali). Mekanismenya diperluas secara umum: huruf ganda diringkas bila hasilnya kata yang dikenal. Ini bukan tambalan per kata. Run pertama tersimpan di `heldout-first/gli-heldout-first.json`.

### Diff menyeluruh

Semua kalimat dari semua fixture (929 kalimat) dibaca oleh 4.9 dan 4.10, lalu setiap field dibandingkan: jenis, nominal, keterangan, tempat, orang, dompet, tujuan, tanggal, kategori. Hasilnya:
- 49 kalimat berubah, dan semuanya perbaikan. Contoh:
  - keterangan "Srapn" → "Sarapan";
  - "Bns Msk" (pengeluaran) → Bonus (pemasukan);
  - "SRPN Coffee" tidak lagi menjadi "Sarapan Coffee";
  - "Ceban Cafe" tidak lagi menjadi "10000 Cafe";
  - "BBM Cafe" tidak lagi berkategori Bensin;
  - "Mkn ngutang" kini piutang Mkn.
- Tidak ada perubahan arti yang salah.

### Semua suite lama

| Suite | Hasil |
|---|---|
| v25, holdout25, v30 dev/heldout, v31 dev/heldout, v32 dev/heldout, umum | 100% |
| v33 dev/heldout (V3.4 cold) | 100% |
| v34 dev (warm) | 48/48; cold naik 22 → 23 |
| v34 heldout (warm) | 36/36; cold naik 10 → 11 |
| Unit test | 565 lulus (36 baru di `tests/catat-gli.test.mjs`) |

### Waktu

| Kata kanonik | Bentuk | Ambigu | Kompilasi (ms) | Lookup / kalimat (ms) |
|---|---|---|---|---|
| 10 | 31 | 4 | 2.7 | 0.001 |
| 100 | 575 | 4 | 2.7 | 0.001 |
| 500 | 2.717 | 38 | 10.4 | 0.001 |
| 1.000 | 5.479 | 86 | 24.1 | 0.001 |
| 1.238 | 7.006 | 132 | 22.2 | 0.001 |

`normalizeGeneral` untuk satu kalimat lengkap: ±0,08 ms. Rata-rata baca kalimat penuh (V3, termasuk NLP.js) 10–12 ms, sama atau lebih cepat dari 4.9.

## 5. Kasus wajib (§80)

Semua kasus di bawah lulus di akun baru (tes unit):
- mkn 25k jago · jjn 15k krom · prkr 5k cash · bnsn 80k jago · kmrn mkn 30k jago · td ngopi 20k krom
- gue ngutang 100k ke aldi · aldi ngutang 100k · aldi balikin 50k
- tf 500k jago ke mandiri · topup gopay 100k dr jago · gaji msk 6,3jt jenius · claim cair 350k mandiri
- budget mkn 1,5jt · nabung 300k buat kuliah

Keluarga varian:
- sarapan (srpn, srpan, srapn, sarapn, sarpan)
- makan (mkn, mkan, makn, makannn)
- parkir (prkr, prkir, parkr, pakir)
- bensin (bnsn, bensn, bnsin, bensinn)
- belanja (blnj, blnja, blanja, blnjaa)

Gabungan:
- "kmrn srpn 22rb trus prkr 5k pake jg" dengan jg = Jago pribadi: dua entri, kemarin, Jago.
- "kmrn srpn besto 18k jago" dengan besto = D'Besto: Sarapan · D'Besto · kemarin · Jago.

## 6. Keamanan dan privasi

- Seluruhnya offline dan deterministik, tanpa LLM, tanpa jaringan, tanpa penyimpanan (tes memeriksa kode sumbernya).
- Kamus Pribadi tetap per akun. Kata pribadi dilindungi dari lapisan umum dan tidak pernah dijadikan umum.
- Kamus Pribadi menolak singkatan yang sudah dikenali lapisan umum, termasuk bentuk produktif ("srapn", "tkt").
- Arah uang tidak berubah. "transferin" dibaca transfer, tetapi "gaji ditransfer" tetap pemasukan. "pinjem 100k sama temen" tetap utang ke Temen; "sama temen" hanya dibuang di kalimat belanja biasa.

## 7. Cek di browser (emulator)

Dev server dan Firebase emulator, ponsel 390 px, akun budi (baru) dan rama. Hasil: **12/12 lulus, tanpa error konsol.**

| Cek | Hasil |
|---|---|
| Akun baru: Kamus Pribadi kosong | ✓ |
| "kmrn srapn 22rb trus prkr 5k" | ✓ Sarapan Rp22.000 + Parkir Rp5.000, kemarin |
| "Kenapa?" | ✓ menampilkan "Bahasa umum: “srapn” dibaca “sarapan”" |
| "makan di SRPN Coffee 30k" | ✓ tempat Srpn Coffee |
| "mkn:25k wkwk 😋" | ✓ Makan Rp25.000, tanpa wkwk/titik dua di keterangan |
| "Mkn ngutang 50k" | ✓ piutang Mkn |
| Personalisasi dimatikan: "sarpan 18k" | ✓ Sarapan (bahasa umum tetap jalan) |
| Offline: "bensinn 60k" | ✓ Bensin |
| Akun A mengajarkan "srpn" = Serpong (tempat) | ✓ "makan 30k di srpn" → Serpong |
| Reset Kamus Pribadi | ✓ "srpn 20k" kembali dibaca Sarapan |
| Ganti akun ke B | ✓ "srpn 20k" → Sarapan; Serpong milik A tidak bocor |

## 8. Yang belum ditangani (jujur)

- "pnglrn 50k" terbaca keterangan Pengeluaran tanpa kategori, karena kata itu memang umum.
- "plng naik ojek" menjadi keterangan "Pulang Naik". Pola keterangan ini sudah ada sebelumnya.
- Bentuk yang ambigu (cmln, krt, dns) sengaja tidak dibaca.
- Kosakata kanonik v1.0 berisi ±190 kata. Menambah kata cukup di satu daftar (`VOCAB`), lalu analisis tabrakan berjalan otomatis.
