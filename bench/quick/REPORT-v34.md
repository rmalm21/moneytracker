# Catat otomatis V3.4 — Kamus Pribadi (Adaptive Personal Intelligence)

Rilis aplikasi 4.8. Prinsipnya: **yang dipelajari kata, bukan uang.** V3.4 mengingat sebutan pribadi pengguna untuk tempat, orang, tempat langganan, dompet, dan singkatan. Nominal, tanggal, jam, dompet yang dipakai, arah utang, dan arah transfer tidak pernah diambil dari memori.

## 1. Audit sumber (V3.3, commit 70e44bd)

Alur yang ada sebelum V3.4:

| Tahap | File |
|---|---|
| Tata bahasa finansial | `lib/quick-plan.ts`, `lib/quick-entry.ts` |
| Entitas dan batas kata | `lib/catat/entities.ts` |
| Waktu | `catat/temporal.ts` |
| Relasi utang/piutang | `catat/relations.ts` |
| Segmentasi | `catat/segment.ts` |
| Riwayat dan operasi | `catat/history.ts`, `catat/mutation.ts`, `catat/composition.ts`, `catat/group.ts` |
| Bug Catcher | `catat/bug-catcher.ts` |
| NLP.js (pendapat kedua) dan konsensus | `catat/nlp-engine.ts`, `catat/v3.ts` |
| Pembelajaran kategori dari riwayat | `lib/categorize.ts` |

Temuan audit:
- Belum ada memori entitas pribadi. Komentar `QuickContext.merchants` menyebut `lib/catat/memory.ts`, tapi berkas itu tidak ada.
- Belum ada konteks sesi antar-kalimat.
- **Cacat umum V3.3:** nama orang dua kata terpotong ("muhammad tio ngutang 20k" → "Tio"). Penyebabnya dua:
  - `relations.ts` hanya mengambil satu kata sebelum kata kerja;
  - aturan "nama berhuruf besar" di `quick-plan.ts` menimpa nama lengkap.

  Ini diperbaiki **di mesin umum** (memakai nama yang sudah dikenal dari piutang, utang, dan kontak Split Bill), tidak ditutupi oleh personalisasi. Semua suite lama tetap 100%.
- V3.3 dibekukan sebagai pembanding: `bench/quick/baseline-v33`.

## 2. Arsitektur

```
Kalimat → bacaan umum (cold, tanpa memori)
        → kandidat personal (alias di kalimat, "dia" dari sesi, koreksi di kalimat)
        → mesin umum yang sama membaca ulang dengan kata kanonik (memori tidak menetapkan apa pun)
        → Bug Catcher personal: bandingkan warm vs cold per aksi
        → NLP.js + konsensus (seperti V3.3) → pratinjau → simpan
```

Kode baru:
- `lib/catat/personal.ts`: kamus, pencocokan, pertanyaan, pemeriksa, dan pembelajaran.
- `lib/catat/session.ts`: sesi singkat.

Integrasi ke `parseQuickPlanV3(teks, ctx, mode, personal)` dan ke bacaan sinkron di kotak Catat otomatis. Tanpa argumen `personal`, perilakunya identik dengan V3.3.

## 3. Skema `PersonalAlias`

Isi tiap alias:
- `id`, `alias` (bentuk asli), `key` (huruf kecil, tanpa tanda baca), `type`, `label`;
- `targetId`: id dompet, id kategori, atau `sp:<id kontak>`;
- `status`: candidate / provisional / learned / disabled;
- bukti: `confirm`, `correct`, `reject` (berbobot);
- `source`: explicit / correction / choice;
- `off` (dimatikan manual), `created`, `updated`, `used`.

Jenis alias: tempat belanja, orang, tempat, dompet, kategori, keperluan, singkatan. Tidak ada satu ember campuran.

## 4. Penyimpanan

Disimpan di `profile.personalLexicon` di dokumen pengguna sendiri. Tiap alias ditulis sebagai field terpisah (`personalLexicon.aliases.<id>`) lewat `saveLexicon`, dan hapus memakai `deleteField`. Jadi dua perangkat yang mengubah kata berbeda tidak saling menimpa.

## 5. Isolasi pengguna

- Rules Firestore yang ada (`users/{uid}`: hanya pemilik) berlaku.
- Data pribadi tidak masuk model NLP.js statis, kode, atau bundle.
- Sesi disimpan per uid di memori, dan dihapus saat login/logout.

## 6. Cache

- Profil dibaca lewat cache Firestore persisten milik aplikasi, yang per uid.
- Kamus yang sudah dikompilasi di-memo per objek kamus, dompet, kategori, dan kontak. Tidak ada pemindaian riwayat transaksi sama sekali.

## 7. Belajar eksplisit

- Kalimat seperti "ingat besto itu D'Besto", "piot itu B1 Piot", "kak tio itu Muhammad Tio", atau "kntor itu kantor" memunculkan kartu Kamus Pribadi. Jenisnya ditebak dan bisa diganti dengan chip, lalu disimpan dengan status **learned**.
- Tanpa kata "ingat", kartu hanya muncul kalau artinya terlihat seperti nama: berhuruf besar, entitas yang dikenal, kata tempat, atau bentuk panjang dari singkatan. "kopi itu enak" tidak mengajarkan apa pun.
- Halaman Bahasa Saya juga punya tombol "Tambah kata".

## 8. Belajar pasif

Saat kartu disimpan, pembacaan parser dibandingkan dengan nilai akhir:
- Tempat yang dikoreksi lewat field baru **Tempat** di kartu Pengeluaran/Pemasukan menjadi kandidat. Kata di kalimat yang dipakai adalah kata yang terkandung dalam nama tempatnya ("besto" → D'Besto, "piot" → B1 Piot).
- Orang yang dikoreksi menjadi kandidat, hanya kalau orang itu sudah ada (piutang, utang, atau kontak).
- Pembelajaran terjadi diam-diam, tanpa pertanyaan "ingat ini?".

## 9. Ambang promosi

Skor = koreksi + konfirmasi − 1,5 × penolakan. Kata yang diajarkan eksplisit mendapat basis 4.

| Skor | Status | Perilaku |
|---|---|---|
| < 2 | candidate | Tidak dipakai |
| ≥ 2 | provisional | Dipakai, kolomnya ditandai "kemungkinan benar" |
| ≥ 4 atau eksplisit | learned | Dipakai |

Bobot bukti:
- koreksi = 1;
- memilih jawaban dari pertanyaan = 1;
- simpan tanpa mengubah = 0,5 (hanya untuk alias yang memang sedang dipakai).

Alias dompet baru dipakai kalau sudah *learned*.

## 10. Penolakan

Setiap kali alias yang dipakai diubah kembali oleh pengguna, penolakannya +1. Dua penolakan yang mengalahkan bukti → **disabled** (tetap terlihat di daftar dan bisa diaktifkan lagi). Mengajarkan arti baru untuk kata dan jenis yang sama otomatis mematikan arti lama.

## 11. Decay

- Kandidat yang 60 hari tidak dipakai dihapus.
- Provisional non-eksplisit yang 180 hari tidak dipakai turun jadi kandidat.
- Kata eksplisit tidak pernah hilang sendiri.
- Decay dijalankan saat halaman Bahasa Saya dibuka.

## 12–15. Tempat belanja, orang, tempat, dompet

| Kalimat | Hasil |
|---|---|
| "ayam besto 13k jago" | Ayam · D'Besto · Rp13.000 · Jago |
| "susu piot 7,7k krom" | Susu · B1 Piot · Rp7.700 · Krom |
| "kak tio ngutang 20k" | Piutang Muhammad Tio Rp20.000 (tanpa orang "Kak Tio") |
| "parkir 2k kntor" | Parkir · Kantor |
| "tf 250rb dari mdr ke jago" | Transfer Mandiri → Jago |

- Orang memakai id kontak kalau ada. Nama kontak yang diganti tetap memakai alias lama.
- Kata yang sama dengan nama dompet terdaftar **tidak bisa** menjadi alias jenis lain.

## 16. Kategori

Tidak ada mesin kategori kedua. Alias yang sudah diganti ke nama kanonik dibaca oleh `lib/categorize.ts` seperti biasa. Contoh: "jjn" → "jajan" → Makan & Minum.

## 17–18. Keterangan dan singkatan

- "ayam besto" → keterangan Ayam, tempat D'Besto. Entitasnya tidak dilebur balik ke keterangan.
- "besto 13k" → tempat D'Besto.
- Singkatan seperti "mkn", "prkr", "bnsn" dipelajari dari pengajaran eksplisit, atau dari koreksi di halaman Bahasa Saya.
- Pencocokan salah ketik (satu huruf) hanya berlaku untuk kata tempat yang sudah *learned* dengan panjang ≥ 5. Tidak berlaku untuk orang maupun dompet.

## 19–22. Sesi, kedaluwarsa, kata ganti, referensi antar-kalimat

Sesi menyimpan **id asli** transaksi yang disimpan, orang yang disebut, dan catatan yang baru dibayar. Masa berlakunya 30 menit, hanya di memori (hilang setelah aplikasi dimuat ulang), dan dihapus saat logout atau pindah akun.

| Kalimat | Hasil |
|---|---|
| "dia bayar 5k" setelah "atuy ngutang 20k" | Pembayaran Atuy |
| "dia bayar 5k" dengan dua orang di sesi | Ditanya, dan simpan diblokir sampai dijawab |
| "dia bayar 5k" setelah 30 menit | Tidak diselesaikan |
| "yang tadi jadi 21k" | UPDATE transaksi yang barusan disimpan (lewat `ctx.sessionTxIds` di resolver riwayat) |
| "sisanya besok" | Rencana sebesar sisa catatan itu sekarang, bukan nominal tebakan |

## 23–24. Tabrakan dan koreksi

- Satu kata dengan dua arti ditanya: "“besto” maksudnya D'Besto atau Best Meat?" Pilihan [D'Besto] [Best Meat] [Bukan keduanya]. Jawabannya menambah bukti untuk arti yang dipilih dan mengurangi yang lain.
- "…, besto maksud gue Best Meat" berlaku untuk kalimat itu saja. Saat disimpan, arti lama mendapat penolakan dan arti baru jadi kandidat.

## 25. Kenapa?

Contoh baris penjelasan:
- "D'Besto dipilih karena sebelumnya kamu menyimpan “besto” sebagai D'Besto."
- "“kak tio” dikenali sebagai Muhammad Tio dari Kamus Pribadi."
- "“dia” dibaca Atuy: orang yang baru saja kamu catat."

Tidak ada penjelasan tentang kebiasaan, tidak ada angka keyakinan, dan tidak ada badge di kartu.

## 26–28. UI Bahasa Saya

Lokasi: Pengaturan › Aplikasi › Bahasa Saya. Isinya:
- tombol **Personalisasi bahasa** (Off = hanya mesin umum; kata yang tersimpan tidak dihapus);
- daftar per kata dengan status (Baru sekali / Kemungkinan benar / Dikenali / Nonaktif);
- ubah arti, nonaktifkan/aktifkan, hapus;
- cari dan filter (muncul kalau lebih dari 6 kata);
- tambah kata;
- **Reset Kamus Pribadi** (dua ketukan). Reset hanya mengosongkan kamus; transaksi, dompet, utang, piutang, klaim, kontak, dan riwayat tidak berubah (diuji di browser).

## 29–31. Offline, sinkronisasi, pindah akun

- **Offline:** di browser, alias tetap terbaca saat jaringan diputus.
- **Sinkronisasi:** lewat profil Firestore, ditulis per alias. Kalau dua perangkat mengajarkan arti berbeda untuk kata yang sama, keduanya tersimpan dan pengguna ditanya. Nilainya tidak bolak-balik.
- **Pindah akun:** di browser, akun B tidak membaca kata akun A, tidak mendapat sesi akun A, dan halaman Bahasa Saya-nya kosong.

## 32. Bug Catcher personal

Yang ditolak bila memori menyebabkannya:
- `PERSONALIZATION_CHANGED_AMOUNT`, `_DATE`, `_TIME`
- `_DEBT_DIRECTION`, `_TRANSFER_DIRECTION`
- `_EXPLICIT_WALLET`, `KNOWN_WALLET_OVERRIDDEN_BY_MEMORY`
- `_KIND`, `_STRUCTURE`
- `PERSONAL_MEMORY_WRONG_ENTITY_TYPE`
- `ORPHANED_PERSONAL_ALIAS`

Bila ditolak, mesin mencoba sekali lagi tanpa alias berisiko (dompet, singkatan, kategori, keperluan). Kalau masih gagal, bacaan umum yang dipakai.

Satu pengecualian: kalau mesin umum tidak menemukan aksi apa pun, hasil personal tetap diterima asalkan setiap nominalnya tertulis di kalimat. Contoh: "kak tio minjem 100rb dari jg kemarin".

Kata yang tidak bisa jadi alias: nominal, satuan (k, rb, jt), kata waktu, kata arah (ke, dari), kata kerja keuangan, dan kata ganti.

## 33–34. Benchmark cold vs warm

Set pengembangan, 48 kalimat (`SET=v34dev node bench/quick/run-v34.mjs`):

| Kelompok | V3.3 cold | V3.4 cold | V3.4 warm |
|---|---|---|---|
| **Benar seluruhnya** | 20/48 (42%) | 20/48 | **48/48 (100%)** |
| Tempat belanja | 0/6 | 0/6 | 6/6 |
| Orang | 1/4 | 1/4 | 4/4 |
| Tempat | 0/2 | 0/2 | 2/2 |
| Singkatan | 1/3 | 1/3 | 3/3 |
| Dompet | 0/2 | 0/2 | 2/2 |
| Keamanan | 11/12 | 11/12 | 12/12 |
| Tabrakan / koreksi / salah ketik | 0/4 | 0/4 | 4/4 |
| Sesi | 2/7 | 2/7 | 7/7 |
| Banyak aksi | 0/3 | 0/3 | 3/3 |
| Kontrol | 5/5 | 5/5 | 5/5 |

Contoh representatif, V3.3 cold → V3.4 warm:

| Kalimat | V3.3 cold | V3.4 warm |
|---|---|---|
| "ayam besto 13k jg" | keterangan "Ayam Besto Juga", tanpa dompet | Ayam · D'Besto · Jago |
| "kak tio ngutang 50rb buat bensin" | piutang "Tio" | piutang Muhammad Tio |
| "td siang mkn besto 25rb pk jg trs parkir 2rb kntor" | "Makan Besto Juga" dan "Parkir Kntor" | Makan · D'Besto · Jago, lalu Parkir · Kantor |
| "kemarin jam 7 malam mkn besto 30rb gopay" | kemarin 19:00 | kemarin 19:00 (waktu sama persis) |

## 35. Held-out, run pertama (dibekukan)

Hasil disimpan di `bench/quick/heldout-first/v34-heldout-first.json`. Set ini ditulis setelah aturan dibekukan, memakai alias dan pola kalimat baru, dan dijalankan sekali sebelum ada perubahan.

| | V3.3 cold | V3.4 cold | V3.4 warm |
|---|---|---|---|
| Benar seluruhnya (36) | 10 (28%) | 10 (28%) | **35 (97%)** |

Satu kasus gagal: **h12** "jjn 15rb gopay".
- Ekspektasi tes: keterangan "Jajan".
- Hasil warm: "jjn" → "jajan" → kategori Makan & Minum tanpa keterangan, karena mesin umum menaruh "jajan" sebagai kategori.
- Bacaan cold malah tanpa kategori.
- Tidak ada kolom uang yang salah. Ini beda konvensi antara ekspektasi saya dan mesin, dan mesin tidak disetel untuk kasus ini.

Setelah run pertama dua perbaikan masuk: penerimaan saat bacaan umum kosong, dan "besto 13k" → tempat. Angka held-out setelah perbaikan tetap 35/36.

## 36–37. Diselamatkan dan regresi

- **Diselamatkan personalisasi:** 28 kasus di set pengembangan, 25 di held-out.
- **Regresi karena personalisasi:** 0 di kedua set.
- **Regresi cold V3.4 dibanding V3.3:** 0.
- **Alias salah pasang di kalimat kontrol:** 0.

## 38–39. Pertanyaan dan koreksi

Jumlah pertanyaan + kolom yang perlu dicek:

| Set | V3.3 | V3.4 warm |
|---|---|---|
| Pengembangan | 9 | 5 |
| Held-out | 16 | 13 |

Ini sudah termasuk pertanyaan tabrakan yang memang disengaja.

Di uji browser, kata yang dikoreksi dua kali ("piot" → B1 Piot) dibaca otomatis pada kalimat ketiga, tanpa koreksi lagi.

## 40. Latensi

Benchmark (rata-rata / P95):

| Set | V3.3 | V3.4 cold | V3.4 warm |
|---|---|---|---|
| Pengembangan | 26 / 16 ms | 11 / 18,5 ms | 12,4 / 23,7 ms |
| Held-out | 33,8 / 31,6 ms | 13,6 / 33 ms | 19,3 / 46,3 ms |

Rata-rata V3.3 lebih tinggi karena pemanasan NLP.js pada panggilan pertama.

Lapisan personal saja:
- 10 alias: 2,7–3,9 ms
- 100 alias: 4,3–5,3 ms
- 400 alias: ±11 ms

Kunci alias disaring dengan himpunan kata di kalimat sebelum regex dicoba.

## 41. Ukuran penyimpanan

±255 byte per alias. 100 alias ≈ 25 KB, 400 alias ≈ 100 KB (batas 400 alias; kandidat terlemah dibuang lebih dulu). Dokumen profil Firestore berbatas 1 MB.

## 42. Regresi

Semua suite lama tetap 100% dengan V3.4:
- V2.5: `v25`, `holdout25`, dan set asli
- V3.0: `v30dev`, `v30heldout`
- V3.1: `v31dev`, `v31heldout`
- V3.2: `v32dev`, `v32heldout`
- V3.3: `v33dev`, `v33heldout`

Yang ikut dicek di suite itu: waktu V3.1, relasi V3.2, dan operasi V3.3.

## 43. Jumlah tes

**527 lulus.** Sebelumnya 491, ditambah 36 tes di `tests/catat-v34.test.mjs`. Isinya:
- semua tes wajib 98–112 dari spesifikasi;
- token terlindungi, Bug Catcher personal, kata ganti, tabrakan;
- orang mirip (Adi ≠ Aldi, Tio ≠ Tiyo, Rama ≠ Rahma), Barber King ≠ Burger King;
- promosi, penolakan, tidak ada penguatan diri, ganti nama, alias yatim, alias dompet lemah;
- belajar eksplisit, decay, "sisanya", perbaikan nama dua kata, id field Firestore, kinerja.

## 44. Typecheck dan build

`tsc` bersih dan build produksi berhasil.

## 45. Browser

Uji di 390 px, alur nyata dengan dua akun di emulator: **25/25 lulus**, tanpa error konsol. Yang dicek:
1. Kartu "ingat …" dan alias tersimpan, tanpa transaksi ikut tersimpan.
2. Bacaan warm dan Kenapa.
3. "Yang tadi" lewat sesi.
4. Alias orang dan "dia".
5. Belajar pasif: kandidat setelah koreksi pertama, provisional setelah kedua, otomatis di kalimat ketiga.
6. Halaman Bahasa Saya.
7. Toggle mati.
8. Arti baru mematikan arti lama.
9. Tabrakan ditanya, simpan diblokir, jawaban diterapkan.
10. Offline.
11. Reset hanya mengosongkan kamus.
12. Pindah akun.

## 46. Keterbatasan

- **Orang di piutang/utang hanya punya nama, tanpa id.** Alias orang menunjuk id hanya untuk kontak Split Bill. Mengganti nama orang yang hanya ada di piutang tidak ikut memperbarui alias.
- **Koreksi tempat di formulir lengkap belum jadi bahan belajar.** Yang dipakai hanya field Tempat di kartu Catat otomatis dan koreksi orang di kartu.
- **Singkatan hanya dipelajari dari pengajaran eksplisit,** karena kartu pengeluaran tidak punya field keterangan. Ini disengaja supaya salah ketik tidak dihafal.
- **Sesi hilang setelah aplikasi dimuat ulang,** termasuk kalau PWA ditutup. Batas 30 menit ditetapkan tanpa data pengguna nyata.
- **Pertanyaan tabrakan memblokir simpan,** termasuk ketika bacaan umum sudah cukup. Ini lebih aman, tapi menambah satu ketukan.
- **Ukuran korpus.** Set pengembangan dan held-out ditulis oleh pengembang. Korpus kalimat "nyata" (12 kalimat berantakan, di bagian berikutnya) masih kecil dan bukan data pengguna sungguhan.

## Lampiran: korpus kalimat realistis (12 kalimat)

Dijalankan dengan kamus: besto, piot, kak tio, kntor, jg, mkn, ucup, indo.

| Kalimat | V3.3 cold | V3.4 warm |
|---|---|---|
| "AYAM BESTO 13K JAGO" | Ayam Besto · Jago | Ayam · D'Besto · Jago |
| "beli susu di indo 8k sama roti piot 12k krom" | aksi kedua "Roti Piot" | Roti · B1 Piot |
| "gw ngutang 20rb ke kak tio" | utang ke "Tio" | utang ke Muhammad Tio |
| "tf 100rb jg ke mandiri" | transfer tanpa dompet asal | Jago → Mandiri |
| "ucup bayar 10rb" | pengeluaran "Ucup" | pengeluaran "Yusuf Maulana" (tidak ada piutang Yusuf, jadi tetap pengeluaran — sama dengan bacaan umum) |
| "mkn 15" | tidak ada aksi | tidak ada aksi (nominal tidak ditebak) |
| "kak tio minjem 100rb dari jg kemarin" | tidak ada aksi | piutang Muhammad Tio Rp100.000 dari Jago, kemarin |
