# Insight V2.5 — Explainable Financial Intelligence · laporan akhir (app 4.4)

Semua angka di laporan ini dari perintah yang bisa diulang (`node bench/insight/run.mjs`, `--seeds 20`, `run-heldout.mjs`, `npm test`). Tidak ada angka "akurasi %": yang diukur adalah perilaku per skenario.

## 1. Ringkasan
Insight V2.5 menambahkan lapisan sinyal yang bisa dijelaskan di atas Advisor 4.3 tanpa mengganti Advisor. Isinya:
- baseline bersama (median/MAD, dibandingkan di titik siklus yang sama);
- tingkat keyakinan, yang terpisah dari tingkat keparahan;
- pohon penyebab (kategori → subkategori → merchant → transaksi), dengan pemisahan efek frekuensi vs nominal per transaksi;
- satu cerita per akar masalah;
- siklus hidup: baru / memburuk / membaik / teratasi / ditunda / diabaikan;
- "Yang berubah", "Prioritas sekarang", "Kemajuan", "Riwayat Insight", ringkasan 2–4 kalimat, dan "Kenapa naik/turun N?" untuk skor;
- domain baru: klaim kantor, piutang, lintasan utang, tekanan target dana, perubahan harga langganan, transaksi tidak biasa, dan harga barang dari struk.

## 2. Audit sumber (4.3 = otoritas)
File yang diperiksa:
- **Advisor dan tampilan:** `lib/advisor.ts` (559 baris), `components/advisor-view.tsx`;
- **Insight:** `lib/insight-profile.ts`, `components/insight-layout-sheet.tsx`, `components/insight-profile-sheet.tsx`;
- **Keuangan:** `lib/accounting.ts`, `lib/category-analytics.ts`, `lib/forecast.ts`, `lib/finance-control.ts` (termasuk `scanData` = Kesehatan Data), `lib/savings.ts`, `lib/pockets.ts`;
- **Tes:** `tests/advisor*.test.mjs`, `tests/finance-control.test.mjs`.

Temuan penting:
- Klaim kantor sama sekali tidak dianalisis Advisor 4.3.
- Tidak ada penjelasan penyebab perubahan.
- "Abaikan" hanya tersimpan per perangkat (localStorage).
- Belum ada riwayat skor.

## 3. Yang dipertahankan
Semua fitur Advisor tetap ada dan tetap jadi sumber kartu masing-masing:
- skor + 6 indikator (rumus tidak berubah);
- semua kartu dan tab-nya;
- tombol "Ubah ke / Buat" anggaran;
- "Dari mana angka ini?";
- uang menganggur, rencana investasi (perkiraan, bukan janji), dan rencana gajian;
- profil Insight;
- pin, urutan dan sembunyikan bagian;
- "abaikan";
- kebutuhan vs keinginan dan perlindungan sedekah.

Bukti: tes parity membandingkan `analyzeInsight(...).advice` dengan salinan beku Advisor 4.3 (`bench/insight/baseline-v43/advisor.ts`) dan hasilnya identik di 6 skenario.

## 4. Arsitektur
`lib/insight-v25/` berisi:
- `types`, `context`, `baseline`, `confidence`, `drivers`, `cluster`, `lifecycle`, `health`, `rank`, `narrative`, `bridge`, `index`;
- `signals/`: spending (termasuk merchant dan laju), budget, income, claims, receivable, debt, goals, recurring, behavior (tidak biasa), prices, data-quality.

`advisor.ts` hanya berubah dua hal:
- satu helper yang dibagi bersama (`coveredCycles`);
- satu perbaikan keamanan (lihat §31).

## 5. Satu sumber kebenaran
Semua angka pengeluaran dan pemasukan berasal dari `lib/accounting.ts`: `expenseAllocations`, `transactionExpense`, `transactionIncome` dan `budgetCurrent`. Selain itu:
- Uang tersedia memakai `availableMoney` dari `finance-control`.
- Target dana memakai `savingsPlan`.
- Skor tetap milik Advisor.

## 6. Model sinyal
Isi `InsightSignal`:
- signature yang stabil (mis. `spending:category:food`) dan domain;
- tone: positif / netral / pantau / penting;
- severity 0–1, keyakinan, novelty;
- nilai sekarang / biasa / selisih;
- bukti dan pohon penyebab;
- status siklus hidup, aksi, dampak bulanan, urgensi;
- induk (untuk pengelompokan) dan batasan.

## 7. Mesin baseline
Ringkasan robust: mean, median, p25/p75, MAD, min/max dan jumlah. Aturannya:
- Siklus pencilan (|z robust| > 3,5) tidak dihitung dalam nilai "biasa".
- Pembanding untuk siklus yang sedang berjalan adalah titik yang sama: hari ke-N siklus lalu.
- Siklus lalu, 3 dan 6 siklus terakhir disimpan sebagai bukti.

## 8. Perlindungan cakupan
Siklus yang tidak dipakai sebagai pembanding:
- siklus yang mulai dicatat lebih dari 7 hari setelah awal (aturan Advisor);
- siklus yang jumlah catatannya kurang dari 40% median, dianggap belum tercatat lengkap.

Dua batas waktu lain:
- Sinyal pengeluaran baru muncul setelah 15% siklus berjalan.
- Sebelum 25% siklus, sinyal butuh z ≥ 2,5 dan selisih minimal Rp150rb.

## 9. Uji kebetulan
Frekuensi diuji seperti hitungan Poisson: z = (c − b)/√b ≥ 2. Nominal per transaksi diuji terhadap sebaran tiket satuan: z ≥ 2,5.

Sebuah kategori juga dianggap berubah bila cabang yang membawa ≥ 50% perubahannya lulus uji. Ini menghilangkan salah alarm "6 vs 4,4 transaksi".

## 10. Keyakinan
Label yang ditampilkan: "Keyakinan tinggi", "Cukup yakin", atau "Data terbatas". Tidak ada persen.

Keyakinan turun bila:
- siklus pembanding sedikit;
- nilainya biasa naik-turun besar;
- perubahannya kecil dibanding naik-turun biasa;
- siklus baru berjalan sebentar;
- ada pengeluaran tanpa kategori;
- catatan yang mendasari sedikit.

Alasannya ditampilkan di drawer.

## 11. Integrasi Kesehatan Data
Bila ≥ 5% pengeluaran siklus ini tanpa kategori:
- keyakinan sinyal turun;
- semua sinyal pengeluaran (termasuk kartu Advisor) diberi batasan "X% pengeluaran siklus ini belum memiliki kategori";
- muncul catatan tersendiri dengan aksi "Isi kategorinya".

Siklus yang setengah tercatat dan jumlah temuan `scanData` (bila dikirim) juga dicatat.

## 12. Pohon penyebab
Urutannya kategori → subkategori → merchant → transaksi terbesar. Setiap level dijumlahkan persis sama dengan induknya; cabang yang tidak ditampilkan masuk "Lainnya". Ini diuji dengan uji properti acak (40 pohon) dan rekonsiliasi 11/11 di benchmark.

## 13. Frekuensi vs nominal
- `frequencyEffect = (cC − bC)(cA + bA)/2`
- `ticketEffect = (cA − bA)(cC + bC)/2`

Jumlah keduanya selalu sama dengan selisih (uji properti 500 kasus acak). Kata yang dipakai: "lebih sering", "lebih mahal per transaksi", "kebiasaan baru".

## 14. Intelijen merchant
Per merchant dihitung jumlah, total, rata-rata, median, porsi, perubahan dan frekuensi/nominal. Sinyal hanya untuk merchant yang muncul di ≥ 2 siklus, atau merchant baru dengan total ≥ Rp150rb.

## 15. Cerita (clustering)
Rantai merchant → subkategori → kategori dan anggaran → kategori menjadi satu cerita. Dampak uang dihitung dari akarnya saja (tidak dobel). Laju total disembunyikan dari "Yang berubah" bila satu cerita kategori sudah menjelaskan ≥ 60%-nya.

## 16. Yang berubah
- Maksimal 4.
- Hanya perubahan yang material dengan keyakinan bukan "Data terbatas".
- Kabar baik ikut masuk.
- Kosong dan tenang bila tidak ada perubahan.

## 17. Skor dan "Kenapa naik N?"
Rumus skor tidak berubah. Perubahannya hanya dibanding skor yang memang pernah ditampilkan (snapshot di memori), tidak pernah direka ulang.

Rincian per indikator dihitung sebagai Δindikator × bobot ÷ total bobot, dibulatkan agar jumlahnya sama dengan perubahan yang ditampilkan. Tanpa snapshot, yang tampil: "Perubahan skor muncul setelah Insight punya skor sebelumnya".

## 18. Klaim kantor
- Umur dikelompokkan 0–7 / 8–14 / 15–30 / > 30 hari.
- Lama cair biasanya = median dari ≥ 3 klaim lunas, ditulis "riwayat, bukan janji".
- Klaim tidak pernah dihitung sebagai uang tersedia.
- Ada sinyal per klaim untuk yang berumur > max(30 hari, 2× biasanya) atau lewat perkiraan cair.

## 19. Piutang
- Umur, lewat janji, dan cicilan sebagian.
- Konsentrasi per orang (fakta saja, tanpa skor kepercayaan).
- Lama kembali biasanya (median, ≥ 3).
- Termasuk piutang Split Bill.
- Tidak dihitung sebagai uang tersedia.

## 20. Lintasan utang
Utang per akhir siklus direka dari saldo hari ini + pembayaran / pinjaman / pembaruan saldo sesudahnya (cara yang sama dengan snapshot siklus). Perkiraan lunas hanya muncul bila utang turun stabil ≥ 3 siklus berturut-turut (variasi < 35%). Kalau tidak stabil, tidak ada perkiraan (diuji).

## 21. Pemasukan
- Nilai biasa dihitung robust: bulan bonus tidak dihitung sebagai biasa.
- Penurunan nyata dilaporkan.
- Pemasukan tetap / tidak tetap mengikuti profil bila diisi, selain itu dari riwayat.
- Pemasukan yang belum masuk di siklus berjalan tidak dinilai.

## 22. Tekanan target dana
Total kebutuhan semua target bertenggat dibanding sisa uang biasa (pemasukan biasa − median pengeluaran). Pilihan pertukarannya (mundurkan tenggat ±N bulan) ditampilkan, tapi Insight tidak memilihkan.

## 23. Perubahan harga langganan
Harga tetap ≥ 2 kali yang kemudian berubah ≥ 5% dan ≥ Rp2rb. Ditampilkan netral sebagai informasi, dengan efek per tahun. Perubahan yang sudah dijadwalkan pengguna (pendingChange) ditampilkan sebagai rencana.

## 24. Tidak biasa
Transaksi ≥ Rp150rb, ≥ 3× median tempat/subkategori/kategori yang sama, dan z robust ≥ 4. Yang tidak pernah ditandai:
- transaksi dari Rencana (plannedId / posted);
- wish list yang sudah dibeli;
- jadwal rutin dan draf.

Kenaikan kategori yang terutama berasal dari pembelian terencana menjadi netral, bukan peringatan.

## 25. Harga barang dari struk (awal)
- Dicocokkan lewat SKU + toko, atau nama ternormalisasi + ukuran + varian + toko.
- Ukuran berbeda tidak pernah dicocokkan (1L ≠ 2L).
- Harga = total baris ÷ qty; harga coret (`originalPrice`) tidak pernah dipakai.
- Minimal 3 pembelian (2 sebelum yang terakhir).
- Lazy: hanya dihitung saat tab Harga dibuka.

## 26. Siklus hidup
- **NEW:** 3 hari pertama.
- **WORSENING / IMPROVING:** 3 hari setelah bergerak ≥ 15% dari acuan.
- **RESOLVED:** hilang saat domainnya diperiksa.
  - Sinyal milik siklus lama berakhir diam-diam bersama siklusnya.
  - Domain yang tidak diperiksa tidak dianggap teratasi.
- **SNOOZED:** sampai tanggal tertentu.
- **DISMISSED:** abaikan ≠ teratasi. Muncul lagi sebagai WORSENING bila memburuk ≥ 25% atau severity melonjak. Kedaluwarsa setelah 60 hari.
- Idempoten: dijalankan dua kali hasilnya tidak berubah, sehingga tidak ada loop tulis.

## 27. Kejenuhan
Sinyal ACTIVE kehilangan 0,12 novelty untuk setiap hari ia ditampilkan lagi (minimal 0,1). Riwayat Insight hanya mencatat perubahan material: muncul, memburuk, membaik, teratasi, muncul lagi.

## 28. Penyimpanan
`profile.insightMemory` ada di dokumen profil pengguna sendiri (per-UID, ikut sinkron antar perangkat, tidak perlu aturan Firestore baru). Isinya hanya:
- acuan ukuran per sinyal;
- tanggal;
- pilihan abaikan / tunda;
- ≤ 24 snapshot skor;
- ≤ 40 entri riwayat.

Tidak ada salinan transaksi. Ukuran di uji browser ±4,6 KB. "Reset data" ikut menghapusnya. Daftar "abaikan" lama per perangkat dipindah sekali ke memori.

## 29. Migrasi tampilan
Urutan bagian yang tersimpan tetap dihormati. Bagian baru (Ringkasan, Yang berubah, Kemajuan, Riwayat Insight) disisipkan di posisi bawaannya (`mergeOrder`). Pin dan sembunyikan tetap bekerja.

## 30. Peringkat
Rumusnya: 0,30·severity + 0,15·keyakinan + 0,20·dampak + 0,15·urgensi + 0,10·novelty + 0,05·profil + 0,05·bisa ditindak. Profil hanya mengubah urutan, bukan fakta (diuji). Akar masalah didahulukan.

## 31. Keamanan keuangan
- Transfer dan setoran dana tidak dihitung sebagai belanja.
- Split Bill hanya bagian sendiri.
- Klaim dan piutang bukan uang tunai.
- Uang yang disimpan tetap dilindungi (logika Advisor).
- Insight tidak mengubah data: diuji bahwa ledger identik setelah analisis.
- Tombol aksi hanya lewat alur simpan normal setelah ditekan.

**Perbaikan baru:** pembayaran utang tanpa kategori (grup "Bayar utang") sebelumnya dianggap "keinginan", sehingga Advisor 4.3 bisa menyarankan "Kurangi Bayar utang". Sekarang grup itu dianggap kebutuhan (ada tesnya). Ini satu-satunya perubahan perilaku Advisor yang disengaja.

## 32. Benchmark (dev, 21 skenario)
Dev set lulus 21/21 (`RESULTS.md`). Ketahanan 20 seed per skenario (`RESULTS-seeds.md`):

| Skenario | V2.5 | Advisor 4.3 |
|---|---|---|
| Data stabil (salah alarm) | tenang 20/20 | memberi saran "kurangi" di 20/20 |
| Pesan antar melonjak | 20/20, lengkap dengan penyebab (GrabFood, lebih sering) | menangkap 9/20, tanpa penyebab |
| Kopi lebih mahal per gelas | 15/20 | 2/20 |
| Pembelian terencana | tenang 20/20 | menandai "tidak biasa" 20/20 |
| Mulai mencatat terlambat | 19/20 | – |
| Klaim, lintasan utang, harga barang | lulus | tidak dianalisis |

Sisa skenario lulus 20/20.

## 33. Held-out
12 skenario baru ditulis sebelum pernah dijalankan; run pertama 10/12, dibekukan di `heldout-first.json`. Yang gagal:
- **h01 bensin ×1,4:** hanya 2 kali isi = +Rp45rb, di bawah ambang Rp50rb.
- **h03 belanja dapur berhenti:** 0 vs biasanya ±2,3 kali; peluang kebetulan ±10%, belum lolos uji Poisson z ≥ 2.

Ambang **tidak** diubah demi skor.

## 34. Performa dan gerbang rilis
**Performa:** 448 transaksi — Advisor 2,7 ms, V2.5 total 9,7 ms (sudah termasuk Advisor). Harga barang hanya dihitung saat tab Harga dibuka.

Gerbang rilis:

| Gerbang | Hasil |
|---|---|
| `tsc` | bersih |
| `npm test` | lulus semua (termasuk 37 tes V2.5 baru) |
| `next build` | sukses |
| Browser emulator, ponsel 390px terang & gelap + desktop 1366px | tanpa error console dan tanpa scroll horizontal |
| Abaikan / pulihkan | tetap setelah halaman dibuka ulang |

**Offline:** semua perhitungan lokal tanpa panggilan jaringan, tapi tidak diuji khusus di browser dalam mode offline.

## 35. Keterbatasan yang jujur
- Benchmark memakai data sintetis yang dibuat sendiri. Riwayat nyata lebih acak, jadi angka per skenario bukan jaminan untuk data asli.
- Perubahan kecil (di bawah ±Rp50rb per subkategori, atau satu-dua transaksi) sengaja tidak disebut.
- Perubahan skor baru muncul setelah Insight menyimpan snapshot, jadi tidak ada pada hari pertama setelah pembaruan.
- Lama cair klaim dan lama kembali piutang butuh minimal 3 riwayat lunas.
- Harga barang hanya dari struk yang dipindai, per toko; bukan indeks inflasi.
- Kebutuhan / keinginan masih ditebak dari nama kategori.
- Tidak ada fitur V3.0: tanya-jawab, simulasi skenario, sebab-akibat, atau belajar dari hasil.
- Insight bukan nasihat keuangan profesional.
