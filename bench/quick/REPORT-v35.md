# Catat otomatis V3.5: Compositional Language Intelligence

Rilis aplikasi 4.11. Prinsipnya: **pahami arti, bukan urutan kata.** Satu kalimat bisa memuat beberapa peran sekaligus. Mesin membaca peran tiap bagian kalimat, bukan mencocokkan kalimat dengan template.

```
Nongkrong 77k  di kongsi tiam  krom    beli               Teh Tarik  dan  Snack Platter  buat meeting  masuk ke kategori hiburan
ACTIVITY AMOUNT  PLACE          WALLET  DETAIL_INTRODUCER  ITEM            ITEM           PURPOSE       EXPLICIT_CATEGORY
```

## 1. Audit sumber

Jalur 4.10 adalah:

`parseQuickPlan` → `normalizeGeneral` (bahasa umum) → `readPlan` (klausa, entitas, Temporal Engine, relasi utang/piutang, komposisi V3.3, Bug Catcher) → `parseQuickPlanV3` (Kamus Pribadi, NLP.js, konsensus).

- Keterangan dibuat oleh `parseQuickText` dari sisa kata setelah nominal, dompet, tanggal, dan tempat "di …" diambil.
- Kategori diputuskan oleh `lib/categorize.ts` dari seluruh kata yang tersisa.

## 2. Keterbatasan komposisi di 4.10

Ada 25 kalimat audit dan 25 kalimat tambahan. Hasil 4.10:

| Masalah | Contoh di 4.10 |
|---|---|
| Rincian barang masuk ke keterangan | "Nongkrong Teh Tarik Snack Platter" |
| Kategori barang mengalahkan aktivitas | "nongkrong 100k beli kopi" → Minuman |
| Kategori yang disebut menjadi `category_new` atau ikut keterangan | "masuk ke kategori hiburan" |
| Tempat menelan aktivitas atau orang | "di kongsi tiam nongkrong", "Kongsi Tiam Bareng Andi" |
| Tempat tanpa "di" tidak terbaca | "krom 77k nongkrong kongsi tiam" |
| Harga per barang menjadi entri terpisah | 77k + 25k + 50k = tiga entri |
| Koma di dalam satu kejadian memecah entri | "nongkrong 77k, di kongsi tiam, krom, beli …" |
| Diskon di akhir kalimat menjadi entri kedua | "… krom diskon 7k" |
| Nama dompet di dalam nama tempat mengambil alih dompet | "di Krom Store … jago" → dibayar pakai Krom |
| "nongki" tidak dikenal | Keterangan "Nongki", tanpa kategori |

## 3. Arsitektur yang dipilih

Arsitekturnya **komposisi slot sebelum tata bahasa, lalu pemasangan slot ke kejadian pemiliknya** (`lib/catat/compose.ts`, dipanggil oleh `compose()` di `lib/quick-plan.ts`):

1. **Bacaan biasa.** `readPlan(teks)` dijalankan persis seperti 4.10 (bacaan V3.4).
2. **`composeSlots`.** Teks dibagi per klausa. Tiap klausa diperiksa untuk lingkup tambahan: rincian, keperluan, kategori eksplisit, batas tempat, teman, biaya, dan tempat yang memuat nama dompet. Bagian itu diambil, lalu tersisa **teks inti**.
3. **Bacaan inti.** `readPlan(inti)` membaca teks inti dengan mesin yang sama. Semua aturan V2.5–V3.4, Temporal Engine, entitas, utang, dan transfer tetap menjadi otoritas.
4. **Pemasangan slot.** Tiap slot punya posisi (`at`) di teks inti. Slot dipasang ke entri yang klausanya memuat posisi itu (`plan.clauses[i].source`).
5. **Bug Catcher V3.5.** Bacaan komposisi dibandingkan dengan bacaan biasa. Bila ada yang bergeser, bacaan biasa dipertahankan (lihat bagian 14).

Sifat arsitektur ini:
- Aditif. Bila tidak ada lingkup tambahan, `composeSlots` mengembalikan `null` dan hasilnya identik dengan 4.10.
- Tidak ada permutasi urutan kata dan tidak ada daftar template.
- Tidak mengubah logika keuangan.

## 4. Slot semantik

| Slot | Sumber | Disimpan di |
|---|---|---|
| ACTIVITY | Kata aktivitas (nongkrong, ngopi, nonton, karaoke, sarapan, …) | Keterangan, bukti kategori |
| AMOUNT | Mesin nominal yang sama | `amount` |
| PLACE | "di X", atau frasa tak dikenal setelah aktivitas tempat | `merchant` |
| WALLET | Mesin dompet yang sama | `walletId` |
| ITEM_DETAILS | Setelah beli/pesen/order/ambil/beliin, ketika entri sudah punya aktivitas | `result.details`, catatan "Rincian: …", struk bila berharga |
| PURPOSE | "buat/untuk/utk meeting" | `result.purpose`, catatan "Keperluan: …" |
| EXPLICIT_CATEGORY | "masuk ke kategori …", "kategori …", "catat sebagai …" | `categoryId`/`subcategoryId`, terverifikasi |
| DATE | Temporal Engine (tidak diubah) | `date` |
| PEOPLE | "bareng/bersama/dengan X"; "buat X" bila X satu kata yang bukan keperluan | Catatan "Bersama: …" / "Untuk: …" |

## 5. Penanganan lingkup

- Batas lingkup: nominal berikutnya, dompet, frasa tanggal, kata penanda (di, buat, pake, kategori, terus, kemarin, …), atau akhir klausa.
- Klausa dipisah oleh ";", "terus/lalu/kemudian/abis itu", atau koma yang diikuti nominal sendiri.
- Koma tanpa nominal sesudahnya ("…, di kongsi tiam, krom, beli …") hanya memisahkan peran, bukan kejadian.
- **Tidak disentuh sama sekali** (`HANDS_OFF`): kalimat utang, piutang, talangan, pelunasan, klaim, transfer, top up, patungan, split, traktir, tabungan, anggaran, target, rencana, pengingat, jadwal rutin, gaji, bonus, refund, dan perintah ubah/hapus. Mesin V3.2–V3.3 tetap pemiliknya.

## 6. Pembacaan tempat

- Mesin entitas yang sudah ada tetap membaca "di X" dan berhenti di dompet: "di kongsi tiam krom" → Kongsi Tiam + Krom.
- **Tempat berhenti sebelum aktivitas.** "di kongsi tiam nongkrong 77k" memindahkan aktivitas keluar. Syaratnya: aktivitas ada di ujung frasa tempat, ditulis huruf kecil, dan belum disebut sebelum "di". Karena itu "jajan di Jajan Cafe 20k" tetap Jajan Cafe.
- **Tempat tanpa "di".** "nongkrong kongsi tiam" dibaca sebagai tempat hanya bila:
  - frasanya muncul tepat setelah aktivitas tempat;
  - semua katanya tidak dikenal (bukan kosakata kategori, bahasa umum, singkatan, orang, atau dompet);
  - panjangnya minimal 2 kata, atau ditulis dengan huruf kapital.

  Satu kata kecil seperti "ngopi tuku" sengaja tidak dibaca, karena prinsipnya presisi dulu.
- **Nama dompet di dalam nama tempat** ("di Krom Store … jago"): tempat diambil utuh bila kata kedua adalah akhiran tempat (store, cafe, mart, resto, …) **dan** dompet lain disebut di kalimat.
- "Makan Enak" tetap satu nama tempat. "di kantor" tidak dibuat menjadi rincian.

## 7. Rincian barang

- Diambil hanya setelah kata pengantar (beli, beliin, pesan, pesen, order, orderin, ambil, checkout), dan hanya bila entri sudah punya aktivitas (sebelum pengantar, atau dari "buat nongkrong").
- Dipisah dengan dan / sama / ama / & / + / plus / koma. Hasilnya tetap **satu transaksi**.
- Jumlah barang dibaca ("2 teh tarik", "dua kopi"). Angka kecil di depan barang tidak dianggap uang.
- Keterangan tambahan tetap menempel pada barangnya ("Teh Tarik Less Sugar", "Snack Platter Large").
- **Harga per barang:**
  - Bila semua barang berharga dan jumlahnya sama dengan total: tersimpan sebagai struk terstruktur (`receipt.items`).
  - Bila jumlahnya tidak sama: tetap satu entri dengan total yang ditulis, barang tanpa harga, plus peringatan "Harga rincian 75.000 tidak sama dengan total 77.000".
  - "beli rokok 30k" (satu barang dengan harga sendiri di luar daftar berharga) tetap entri sendiri.
- "beli teh dan kopi 30k" (tanpa aktivitas): satu entri, keterangan "Teh & Kopi", dua rincian.
- Rincian tidak mewarisi dompet dan tidak pernah menjadi entri.

## 8. Kategori dan aktivitas

- Teks inti tidak lagi memuat rincian, jadi kategori diputuskan oleh aktivitas: "nongkrong 100k beli kopi" → Nongkrong & Hiburan › Nongkrong; "nonton … beli popcorn" → Bioskop.
- Mesin kategori tidak diubah. Bahasa umum hanya mendapat kata "nongkrong" di kosakata kanonik, ditambah bentuk nongki / nongky / nongkr / nongkie.

## 9. Kategori eksplisit

- `findCategory` hanya memetakan ke kategori **yang sudah ada**:
  - "hiburan" → induk;
  - "hiburan > nongkrong" atau "hiburan nongkrong" → induk dan sub;
  - "bioskop" → sub.
- Kalimatnya tidak menjadi keterangan dan tidak menjadi `category_new`. Status kategori menjadi **Terverifikasi**.
- Bila yang disebut hanya induk, sub yang dipilih aktivitas di dalam induk itu tetap dipakai: "77k nongkrong … masuk ke kategori hiburan" → Nongkrong & Hiburan › Nongkrong.
- Kategori yang disebut mengalahkan tebakan: "nongkrong … masuk ke kategori belanja" → Belanja.
- Kategori yang tidak ada ("kategori xyz") tidak dibuat. Kategori ditandai "Perlu dicek" dan muncul peringatan "Kategori “xyz” belum ada".
- "buat kategori hiburan baru" tetap menjadi perintah membuat kategori (tidak disentuh).

## 10. Bebas urutan kata

Setiap span diberi peran sendiri, jadi semua urutan aman membaca kejadian yang sama. Kalimat berikut semuanya menghasilkan **Pengeluaran 77.000 · Nongkrong · Kongsi Tiam · Krom · Nongkrong & Hiburan › Nongkrong** (tes properti §151):
- nongkrong 77k di kongsi tiam krom
- 77k nongkrong di kongsi tiam krom
- krom 77k nongkrong di kongsi tiam
- di kongsi tiam nongkrong 77k pake krom
- nongkrong di kongsi tiam 77k krom
- pake krom nongkrong 77k di kongsi tiam
- nongkrong di kongsi tiam pake krom 77k
- krom 77k nongkrong kongsi tiam

## 11. Kepemilikan di banyak kejadian

Slot dipasang lewat posisi klausa. Contoh: "nongkrong 77k di kongsi tiam krom beli teh tarik dan snack platter, bensin 80k jago" menghasilkan:
- Nongkrong (dengan rincian, Krom);
- Bensin 80.000 (Jago, tanpa rincian).

Rincian tanpa pemilik membuat seluruh komposisi ditolak.

## 12. Integrasi Kamus Pribadi

Composer berjalan di dalam `parseQuickPlan`, jadi berlaku juga untuk pembacaan V3 dengan Kamus Pribadi. Contoh: "srpn 25k di besto jago beli ayam dan teh" dengan besto = D'Besto (pribadi) → Sarapan · D'Besto · Jago · Rincian Ayam · Teh.

Composer tidak menyimpan apa pun dan tidak membuat perilaku belajar sendiri. Pembelajaran dari koreksi tetap memakai aturan V3.4.

## 13. Integrasi bahasa umum

Composer membaca teks yang sudah dinormalisasi bahasa umum:
- "kmrn nongki 60k … beliin kopi sama gorengan" → kemarin, Nongkrong, dua rincian;
- "nongkrong77k" dipisah dengan aman;
- teks HURUF BESAR dibaca sama.

## 14. Perubahan Bug Catcher (V3.5)

Bacaan komposisi **ditolak** (dibaca seperti V3.4, dengan alasan di trace) bila:
- nominal di entri tidak ditulis di kalimat (kecuali nominal kotor dari diskon/biaya);
- nominal bacaan biasa hilang (kecuali harga barang atau biaya yang kini menempel ke nominal utama);
- dompet tidak disebut;
- tanggal berubah;
- muncul jenis entri baru selain pengeluaran/pemasukan;
- jumlah entri bertambah;
- ada rincian yang tidak punya pemilik;
- rincian menempel ke entri yang bukan belanja. Contoh: "nongkrong 77k beli teh tarik buat besok" adalah rencana, jadi tetap dibaca seperti V3.4.

Di semua fixture lama dan baru, **0 komposisi ditolak secara tak terduga**. Satu-satunya contoh tolak adalah kasus rencana di atas, dan itu memang disengaja dan diuji.

## 15. Contoh wajib dari pengguna

| # | Kalimat | Hasil |
|---|---|---|
| 1 | Nongkrong 77k di kongsi tiam krom beli Teh Tarik dan Snack Platter | Pengeluaran 77.000 · Nongkrong · Kongsi Tiam · Krom · Nongkrong & Hiburan › Nongkrong · Rincian Teh Tarik · Snack Platter |
| 2 | 77k nongkrong di kongsi tiam krom | sama, tanpa rincian |
| 3 | 77k nongkrong di kongsi tiam krom masuk ke kategori hiburan | sama · kategori **disebut** Nongkrong & Hiburan (terverifikasi) |
| 4 | krom 77k nongkrong kongsi tiam | sama seperti #2 |
| 5 | kemarin nongkrong 77k … beli teh tarik dan snack platter | #1 + tanggal kemarin |
| 6 | … snack platter, bensin 80k jago | 2 entri: Nongkrong (rincian) + Bensin 80.000 Jago |
| 7 | … snack platter buat meeting | #1 + Untuk meeting |
| 8 | nonton 120k di xxi krom beli popcorn dan coke | Nonton · Xxi · Krom · **Bioskop** · Rincian Popcorn · Coke |
| 9 | belanja 300k di uniqlo mandiri beli kaos dan celana | Belanja · Uniqlo · Mandiri · Rincian Kaos · Celana |
| 10 | beli teh tarik dan snack platter 77k di kongsi tiam krom buat nongkrong | sama seperti #1 |

## 16. Benchmark pengembangan (A, `fixtures-v35dev.mjs`, 40 kalimat)

Runner: `bench/quick/run-v35.mjs`. Pembanding: 4.10, dibekukan di `bench/quick/baseline-v410`.

| | 4.10 | V3.5 |
|---|---|---|
| Benar seluruhnya | 10/40 (25%) | **40/40 (100%)** |
| Pemisahan entri benar | 37/40 | 40/40 |
| · nominal | 43/43 | 43/43 |
| · dompet | 35/37 | 37/37 |
| · keterangan (aktivitas) | 16/39 | 39/39 |
| · kategori | 30/38 | 38/38 |
| · kategori eksplisit | 0/3 | 3/3 |
| · tempat | 23/31 | 31/31 |
| · rincian | 0/23 | 23/23 |
| · keperluan / orang | 0/1 · 0/1 | 1/1 · 1/1 |
| **Yakin tapi salah** | 29 | **0** |
| Regresi vs 4.10 | – | 0 |

## 17. Held-out baru, run pertama dibekukan (B, `fixtures-v35heldout.mjs`, 20 kalimat)

Kalimat ditulis setelah composer dibekukan. Isinya tempat, barang, dan gaya yang tidak muncul di set lain. Run pertama tersimpan di `heldout-first/v35-heldout-first.json` dan **tidak ditimpa**.

| | 4.10 | V3.5 run pertama (beku) |
|---|---|---|
| Benar seluruhnya | 3/20 (15%) | **18/20 (90%)** |
| Pemisahan entri benar | 18/20 | 20/20 |
| Rincian | 0/11 | 11/11 |
| Tempat | 8/13 | 12/13 |
| Kategori eksplisit | 0/2 | 2/2 |
| **Yakin tapi salah** | 16 | 1 |
| Regresi vs 4.10 | – | 0 |

Dua kalimat yang gagal tidak ditambal (run akhir sama dengan run pertama):
- **b3** "gopay 65k ngopi tuku": satu kata kecil yang tidak dikenal setelah aktivitas sengaja tidak dibaca sebagai tempat. Keterangannya menjadi "Ngopi Tuku", sama seperti 4.10.
- **b16** "gaming 50k di warnet": kata "gaming" belum dikenal mesin kategori. Ini di luar lingkup V3.5, karena V3.5 bukan mesin kategori baru.

## 18. Set adversarial (C, `fixtures-v35adv.mjs`, 23 kalimat)

| | 4.10 | V3.5 |
|---|---|---|
| Benar seluruhnya | 17/23 (74%) | **23/23 (100%)** |
| Yakin tapi salah | 3 | 0 |
| Regresi | – | 0 |

Isinya:
- tabrakan entitas (Kongsi Tiam vs Krom, Krom Store vs Jago, Makan Enak, Jajan Cafe, "di kantor");
- "dan" di antara barang vs di antara kejadian;
- kategori barang vs aktivitas;
- kategori yang tidak ada;
- kalimat milik mesin lain (utang "buat nongkrong", pinjam "buat beli kopi dan roti", transfer, buat kategori, anggaran, nabung, gaji, pembayaran piutang);
- keamanan uang (harga barang tidak cocok, "2 kopi 18k satu", diskon di akhir).

## 19. Semua regresi lama (D)

| Suite | Hasil |
|---|---|
| v25, holdout25, v30 dev/heldout, v31 dev/heldout, v32 dev/heldout, umum | 100% |
| v33 dev/heldout (V3.4 cold) | 100% |
| v34 dev / heldout (warm) | 48/48 · 36/36, regresi 0 |
| GLI dev / heldout | 84/84 · 40/40, normalisasi salah 0, regresi 0 |
| **Shadow 4.10 vs V3.5** (`run-v35.mjs --shadow`) | 821 kalimat unik dari 17 fixture. 771 kalimat dari fixture lama: **0 berubah**. 50 perubahan semuanya di set V3.5 dan semuanya perbaikan yang terverifikasi oleh ekspektasi. |

Triase shadow:

| Kelas | Jumlah | Contoh |
|---|---|---|
| Perbaikan yang disengaja | 50 | Rincian keluar dari keterangan, kategori eksplisit, tempat tanpa "di", koma, harga barang, diskon di akhir, Krom Store |
| Netral | 0 | – |
| Regresi | 0 | – |

Dari 50 perubahan, 13 mengubah **arti keuangan**, dan semuanya membetulkan kesalahan 4.10:
- dompet yang hilang karena "kategori …";
- entri yang terpecah oleh koma atau harga barang;
- diskon yang menjadi entri kedua;
- Krom Store yang dibaca sebagai dompet Krom.

## 20. Performa

| Kalimat | `composeSlots` | `parseQuickPlan` 4.10 | `parseQuickPlan` 4.11 |
|---|---|---|---|
| Contoh #1 | 0,18 ms | 5,8 ms | 6,3 ms |
| makan 25k jago (tanpa komposisi) | 0,03 ms | 1,34 ms | 1,38 ms |
| #6 (dua kejadian) | 0,23 ms | 5,2 ms | 7,8 ms |

Bacaan inti hanya dijalankan bila ada slot. Tidak ada permutasi kata. Rata-rata baca penuh V3 di benchmark: 17–26 ms (4.10: 39–61 ms pada set yang sama; 4.10 lebih lambat karena NLP.js mencoba ejaan ulang pada kalimat yang tidak dipahaminya).

## 21. Offline

Seluruhnya lokal dan deterministik:
- tanpa jaringan;
- tanpa penyimpanan;
- tanpa model cloud (tes memeriksa sumber `compose.ts`).

QA browser offline: "krom 77k nongkrong kongsi tiam" → Nongkrong · Kongsi Tiam · Krom.

## 22. QA browser

Emulator Firebase dan dev server, akun budi dan rama. Hasilnya **11/11 lulus, 0 error konsol**. Screenshot ada di `v35qa/`.

| Cek | Hasil |
|---|---|
| Ponsel 390 px, contoh #1 | ✓ Rp77.000 · Nongkrong · Kongsi Tiam · Nongkrong · Krom · **Rincian Teh Tarik · Snack Platter** |
| "Kenapa?" | ✓ "Teh Tarik dan Snack Platter dibaca sebagai rincian pembelian." |
| Simpan | ✓ Satu transaksi: keterangan Nongkrong, tempat Kongsi Tiam, Krom, sub Nongkrong, catatan "Rincian: Teh Tarik, Snack Platter" |
| Kategori eksplisit | ✓ "Kategori Nongkrong & Hiburan › Nongkrong disebut langsung", tanpa "Kategori baru" |
| Banyak aksi | ✓ 2 baris: Nongkrong 77.000 + Bensin 80.000 |
| Keperluan | ✓ "Untuk meeting" |
| Formulir lengkap | ✓ Keterangan, tempat, kategori, dan catatan "Rincian: … · Keperluan: meeting" terbawa |
| Offline | ✓ |
| 360 px | ✓ Tanpa geser horizontal; rincian satu baris yang membungkus |
| Kamus Pribadi | ✓ Sarapan · D'Besto · Krom · Rincian Ayam · Teh |
| Desktop 1280 px | ✓ Nonton → Bioskop; barang tidak memaksa Makan |

Catatan QA: satu run sempat gagal tepat setelah ganti akun, karena dompet belum selesai dimuat (data emulator sedang sinkron). Login ulang memberi hasil benar. Script diberi jeda muat 6 detik, lalu seluruh QA lulus. Ini perilaku pemuatan data yang sudah ada, bukan bagian parser.

## 23. Total tes

- **641 tes unit lulus**, termasuk 76 tes baru di `tests/catat-v35.test.mjs`:
  - tes wajib #1–#10;
  - urutan kata;
  - properti §151–154;
  - gaya, rincian, orang, banyak kejadian;
  - adversarial;
  - Kamus Pribadi;
  - Bug Catcher;
  - lokal-saja.
- Benchmark: A 40/40, B 18/20 (beku), C 23/23, semua suite lama 100%.

## 24. Hasil build

`npm run build` lulus (ekspor statis, tanpa `.env.local`). `npx tsc --noEmit` bersih.

## 25. Keterbatasan yang diketahui

- Tempat tanpa "di" yang hanya satu kata kecil ("ngopi tuku") tidak dibaca, karena presisi didahulukan. Dengan "di" ("ngopi di tuku") atau dua kata, tempat terbaca.
- "makan 80k sama budi": "sama" hanya dibaca sebagai teman bila namanya dikenal (piutang, kontak) atau kata orang (temen, pacar, …), karena "sama" juga penghubung barang. "bareng/bersama/dengan X" selalu dibaca sebagai teman.
- "buat budi" dibaca "Untuk: Budi" (orang). "buat X" yang tidak dikenal dan lebih dari satu kata menjadi keperluan.
- Kategori yang belum dikenal mesin kategori ("gaming") tetap kosong. Menambah kosakata kategori ada di luar V3.5.
- Rincian tanpa harga disimpan di catatan (satu baris, dipisah "·", karena kolom Catatan di formulir satu baris). Daftar terstruktur hanya disimpan sebagai struk bila harganya cocok dengan total.
- Composer tidak mencoba membaca kalimat utang, transfer, anggaran, atau rencana. Kalimat itu tetap persis seperti 4.10.
