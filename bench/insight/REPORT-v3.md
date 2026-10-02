# Insight V3.0 — Financial Intelligence OS · laporan akhir (app 4.5)

Semua angka bisa diulang. Perintahnya:
- `npm test`
- `node bench/insight/run-v3.mjs --seeds 10`
- `node bench/insight/run.mjs`
- `node bench/insight/run-heldout.mjs`

Tidak ada "akurasi %": setiap tugas punya aturan lulus yang tertulis di `run-v3.mjs`.

## 1. Audit dasar V2.5
V2.5 (app 4.4) stabil sebelum V3 dimulai. Kondisinya:
- semua tesnya lulus;
- dev set 21/21;
- held-out 10/12, sudah dibekukan;
- tetap utuh di dalam V3 (dibuktikan tes "V2.5 is preserved inside V3": sinyal, cerita, dan output Advisor sama).

Sumber yang diaudit:
- forecast (`forecast()`), finance-control (`upcomingEvents`, `committedAmount`, `availableMoney`, `scanData`), accounting (`metrics`);
- wallet-interest (catatan bunga bruto/pajak/neto), savings (`savingsPlan`), pockets;
- what-if pembelian di halaman Proyeksi.

**Temuan:** Jatah Aman dihitung langsung di dashboard. Rumusnya kini jadi fungsi bersama `safeDaily()` di finance-control, dipakai dashboard dan Insight.

## 2. Arsitektur V3
`lib/insight-v3/` terdiri dari:
- `world` — model FinancialWorld;
- `graph` — graf dampak;
- `state` — tekanan, momentum, regime;
- `scenario` — mesin skenario dan likuiditas;
- `income` — struktur pemasukan dan pertukaran target;
- `prices` — Indeks Biaya Pribadi dan harga per toko;
- `signals` — likuiditas, pola perilaku, konsentrasi, bunga;
- `decisions` — memori keputusan dan hasilnya;
- `guard` — konflik saran dan self-audit;
- `ask` — Ask Insight;
- `brief` — Ringkasan dan Jelaskan siklus;
- `index` — orkestrator.

V3 menjalankan V2.5 tanpa mengubahnya. Sinyal baru V3 masuk lewat hook `extend` milik V2.5, sehingga ikut siklus hidup, cerita, dan peringkat yang sama. Tidak ada mesin keuangan kedua.

## 3. Financial World Model
Model ini turunan, read-only, dan dihitung ulang setiap kali; tidak pernah disimpan. Isinya:
- siklus berjalan dan siklus historis (pemasukan tetap / tidak tetap, pengeluaran, sisa);
- pemasukan: biasa, gaji tetap, porsi tidak tetap, batas aman;
- likuiditas: uang bebas, tagihan, cadangan, uang tersedia, Jatah Aman, sebelum gajian, laju harian;
- kewajiban: utang, klaim, piutang, jadwal mendatang;
- target, kekayaan (aset, aset bersih, investasi, bunga 30 hari), dan kualitas data.

## 4. Pemakaian mesin kanonis
Semua angka diambil dari mesin kanonis:

| Angka | Sumber |
|---|---|
| Uang bebas, disimpan, aset, utang, sisa anggaran | `metrics` |
| Uang tersedia | `availableMoney` |
| Jatah Aman | `safeDaily` |
| Jadwal tagihan | `upcomingEvents` |
| Laju belanja / sebelum gajian | `forecast` |
| Target | `savingsPlan` |
| Bunga | catatan bunga dompet |

Tes "world: every number comes from the canonical engines" membandingkannya satu per satu.

## 5. Model sinyal
Sinyal V2.5 dipakai apa adanya, ditambah horizon: Segera / Siklus ini / Beberapa siklus / Jangka panjang. Relasinya ada di graf, aksinya tetap dari kartu Advisor, dan hasilnya di memori keputusan.

## 6. Graf dampak
Simpul graf: sinyal + keadaan (Uang tersedia, Sisa siklus, Ruang untuk target, Aset bersih). Jenis sisi: explains, increases, reduces, funds, estimated_to_affect, associated_with.

## 7. Langsung vs perkiraan vs bersamaan
- **Langsung:** aritmetika ledger. Contohnya bagian pohon penyebab, pengeluaran yang dihitung ke anggaran dan keluar dari dompet, dan klaim yang belum cair sehingga tidak ada di dompet.
- **Perkiraan:** hanya "bila pola berlanjut".
- **Bersamaan:** kebiasaan + kategori yang naik di siklus yang sama, tanpa klaim sebab.

Tes memastikan sisi korelasi tidak pernah berlabel langsung, dan nilai sisi langsung sama dengan aritmetikanya.

## 8. Mesin tekanan
Domainnya: likuiditas (titik terendah jalan uang), anggaran, utang (cicilan ÷ pemasukan), target, klaim, piutang, dan tagihan rutin. Levelnya Baik / Stabil / Pantau / Tertekan. "Tekanan utama" menampilkan maksimal 2.

## 9. Mesin momentum
Komponennya: sisa per siklus, pengeluaran, utang, dana darurat, dan target. Statusnya Membaik / Stabil / Campuran / Tertekan, selalu beserta komponennya; tidak pernah berupa angka misterius. Butuh minimal 3 siklus.

## 10. Integrasi skor kesehatan
- Rumus skor tidak berubah.
- Snapshot skor kini punya versi rumus (`hv`), dan skor dari versi berbeda tidak pernah dibandingkan.
- Tekanan tidak memengaruhi skor (diuji: klaim besar → tekanan klaim muncul, skor tetap).

## 11. Regime
Jenisnya: perjalanan, pembelian besar terencana, banyak klaim tertahan, pemasukan tinggi, dan pemasukan rendah. Semuanya hanya dari bukti: kategori/merchant/catatan bertema perjalanan, Rencana, wish list yang dibeli, klaim, dan pemasukan.

Di siklus perjalanan, pengeluaran perjalanan tetap dilaporkan tapi tidak sebagai peringatan.

## 12. Mesin skenario
Read-only, diuji: data identik sebelum dan sesudah.

Jalan uang dihitung per hari: mulai dari uang bebas − cadangan, dikurangi laju belanja (tanpa tagihan/rencana), ditambah/dikurangi jadwal tercatat, lalu gaji di akhir.

Masukan yang didukung:
- perubahan gaji (Rp atau %) dan tanpa lembur/bonus;
- pengeluaran sekali dan pembelian besar;
- laju harian ±%;
- hapus tagihan rutin dan tagihan rutin lebih besar;
- waktu klaim cair: tercatat / riwayat / lebih awal / tertunda;
- bayar utang lebih dan ubah setoran target;
- kategori kembali normal.

## 13. Lab Skenario
- Preset ditambah isian sendiri, maksimal 3 skenario.
- Kartu perbandingan: titik terendah, sebelum dan setelah gajian, ruang per hari, ruang untuk target, sisa utang, dana disimpan yang dibutuhkan.
- Selisih terhadap keadaan sekarang ditampilkan.
- Bisa disimpan; tersimpan di memori Insight.
- Tidak ada "pemenang". Label SIMULASI.

## 14. Uji ketahanan
Gaji −20%, klaim tertunda, tak terduga Rp1 jt, tagihan rutin +50%, tanpa lembur/bonus. Semuanya berlabel "bagaimana jika", bukan ramalan.

## 15. Pertukaran target
Pilihannya: pertahankan semua, dahulukan target X, tunda wish list. Perkiraan mundurnya target hanya muncul bila ada tenggat dan angkanya cukup. Tidak memilihkan (diuji: tidak ada kata "terbaik").

## 16. Waktu likuiditas
- Titik tersempit, dengan alasannya (pengeluaran terjadwal menjelang tanggal itu).
- Tagihan berdekatan: ≥ 2 dalam 4 hari, totalnya material.
- Klaim cair (median riwayat) vs tertunda selalu ditampilkan sebagai dua kasus.

## 17. Kecerdasan harga
Dibangun di atas pencocokan V2.5 (SKU + toko, atau nama + ukuran + varian + toko). Tambahannya:
- penguraian belanja berstruk menjadi efek harga, jumlah beli, dan barang baru/lain;
- kontributor harga terbesar;
- harga yang pernah dibayar di toko lain (riwayat, bukan "termurah sekarang").

## 18. Indeks Biaya Pribadi
- Gaya Laspeyres: keranjang barang yang sama, jumlah dari siklus dasar, harga median yang benar-benar dibayar.
- Tidak muncul bila barang yang cocok < 5, cakupan < 30%, atau riwayat < 3 siklus.
- Bukan inflasi Indonesia.
- Uji benchmark: kenaikan yang ditanam 7% terbaca 6,9%.

## 19. Ketergantungan pemasukan
- Lembur, bonus, proyek, dan sampingan dikenali dari kategori/keterangan.
- Klaim dan piutang bukan pemasukan.
- Batas aman = gaji tetap terendah; lembur/bonus tidak pernah masuk (diuji).
- Kalimat "pengeluaran biasa butuh pemasukan tambahan" hanya muncul bila datanya ≥ 3 siklus.

## 20. Tekanan klaim
Gabungan dari jumlah klaim terhadap uang tersedia, umur klaim, dan lama cair biasanya.

## 21. Tekanan piutang
Gabungan dari jumlah, keterlambatan, dan porsinya terhadap uang tersedia. Konsentrasi per orang tetap tampil dari V2.5, tanpa penilaian orang.

## 22. Tekanan utang
Cicilan ÷ pemasukan dan sisa utang. Lintasan dan perkiraan lunas mengikuti V2.5.

## 23. Pola perilaku
- Pola setelah gajian: porsi belanja harian di 3 hari pertama, dan perlambatan di minggu terakhir.
- Harus terjadi di ≥ 60% siklus.
- Tagihan, rencana, dan transaksi besar sekali jalan tidak dihitung.
- Bahasanya netral.

Konsentrasi merchant ≥ 30% juga ditampilkan sebagai fakta.

## 24. Memori keputusan
Saat tombol "Ubah ke / Buat" anggaran di Insight ditekan, dicatat: tanggal, jenis, sinyal dan kartu asal, kategori, serta nilai sebelum dan sesudah (≤ 30 catatan). Anggarannya sendiri tetap disimpan lewat alur normal.

## 25. Pelacakan hasil
Pengeluaran kategori dibandingkan antara siklus sebelum dan siklus lengkap sesudahnya. Bila belum ada siklus lengkap, dipakai perkiraan dari siklus berjalan (berlabel). Kalimatnya memakai "setelahnya", bukan "karena", dan menyebut bila masih di atas batas baru. Hasilnya masuk Riwayat Insight sekali.

## 26. Konflik saran
Saran berikut ditahan, dengan alasan yang ditampilkan:
- investasi atau memindahkan uang saat jalan uang ke gajian tipis;
- investasi saat utang berbunga tinggi harus didahulukan;
- anggaran di bawah tagihan rutin yang sudah terjadwal.

## 27. Ask Insight
- Read-only. Diuji dua cara: sumbernya tidak mengimpor fungsi tulis, dan data serta memori identik setelah 12 pertanyaan.
- 14 intent, termasuk skenario "kalau X balik normal" dan "kalau klaim telat".
- Setiap jawaban menyertakan bukti.
- Pertanyaan di luar kemampuan dijawab dengan saran pertanyaan, bukan karangan.
- Benchmark: 10/10 pertanyaan tetap diarahkan benar di 30 pengguna.

## 28. Ringkasan V3
- 2–5 kalimat: pemasukan, pengeluaran dan penyebabnya, kemajuan, klaim, arah dan tekanan utama.
- Setiap kalimat punya sumber.
- Kalimat yang bertentangan (domain dan horizon sama, arah berlawanan) dibuang.

## 29. Jelaskan siklus ini
Lima bagian singkat: Ringkasan, Penyebab utama, Kemajuan, Tekanan, Kewajiban terdekat.

## 30. Timeline
Isinya dari V2.5 (muncul, memburuk, membaik, teratasi, muncul lagi) ditambah:
- pencapaian: dana darurat mencapai N bulan, utang turun di bawah Rp N jt;
- hasil keputusan.

Setiap entri hanya dicatat sekali.

## 31. Siklus hidup
- Status V2.5 tetap.
- Memori ditambah: severitas puncak, berapa kali diabaikan/ditunda, perubahan material terakhir.
- Tetap idempoten (diuji).

## 32. UI
Urutan halaman:
1. Hero: skor + momentum + tekanan utama + satu kalimat. Contoh: "Likuiditas aman, tapi target dana dan anggaran sedang mendapat tekanan."
2. Ringkasan, dengan Tanya Insight dan Jelaskan siklus ini.
3. Yang berubah.
4. Prioritas.
5. Kemajuan.
6. Keadaan & tekanan (radar ringkas, tanpa grafik laba-laba).
7. Rincian, dengan tab:
   - Cashflow: jalan uang + klaim cair/tertunda;
   - Target: pilihan pertukaran;
   - Harga: Indeks Biaya Pribadi;
   - Data;
   - Lab Skenario.
8. Riwayat: keputusan & hasil, timeline.

Drawer "Kenapa?" kini menampilkan "Dampaknya" (Langsung / Perkiraan / Terjadi bersamaan), horizon, dan keputusan sebelumnya.

## 33. Kualitas data
Tab Data menampilkan cakupan kategori, nama tempat, jam, dan struk siklus ini. Pemeriksaan saldo dan tautan tetap di Kesehatan Data.

## 34. Offline
Semua perhitungan di perangkat tanpa jaringan. Di uji browser, koneksi diputus lalu Ask Insight dan tab tetap bekerja. Muat ulang dalam keadaan offline tidak diuji di mode dev.

## 35. Performa
- 448 transaksi: V3 ±7–8 ms tanpa cache.
- Ada cache sidik jari data (hasil sama → tidak dihitung ulang).
- Indeks harga, harga per toko, uji ketahanan, dan Lab hanya dihitung saat dibuka.
- Tes performa: riwayat kecil, sedang, besar, dan kaya struk semuanya di bawah batas.
- Web Worker tidak dipakai karena profil tidak membutuhkannya.

## 36. Tes
`npm test` lulus semua: 478 sebelum rilis, termasuk 23 tes V3 baru dan 37 tes V2.5. Rumpun tes V3:
- world model, graf, tanpa sebab palsu;
- tekanan vs skor, momentum campuran;
- skenario read-only, klaim cair vs tertunda;
- pertukaran target tanpa pemenang;
- indeks harga (ukuran, cakupan), ketergantungan pemasukan;
- keputusan & hasil;
- Ask Insight read-only + bukti + fallback;
- ringkasan tanpa kontradiksi, keadaan diam;
- konflik & self-audit;
- memori idempoten, pencapaian, versi skor, horizon;
- V2.5 utuh, performa.

## 37. Benchmark
`RESULTS-v3.md`: 10 tipe pengguna realistis × 10 seed. V3 lulus semua tugas.

V2.5 tidak punya kemampuan berikut: dampak berantai, tekanan, momentum, skenario, Ask Insight, dan indeks harga. Untuk perilaku yang sama-sama dimiliki:

| Perilaku | V2.5 | V3 |
|---|---|---|
| Akar masalah | lulus | lulus |
| Ringkasan bersumber | lulus | lulus |
| Diam saat stabil | lulus | lulus |
| Pembelian terencana | lulus | lulus |
| Konflik saran (Advisor sudah menahan investasi saat uang tipis) | lulus | lulus |
| Siklus perjalanan | 0/10, memberi peringatan palsu | 10/10 |

## 38. Keterbatasan yang jujur
- Benchmark V3 ditulis bersamaan dengan mesinnya dan memakai data sintetis buatan sendiri. Ini bukan held-out; data nyata lebih acak.
- Jalan uang memakai laju belanja rata-rata siklus ini dan jadwal yang tercatat. Pengeluaran yang tidak dijadwalkan atau tidak rata tidak terbaca.
- Klaim tanpa tanggal perkiraan baru masuk simulasi bila ada ≥ 3 klaim lunas.
- Penjelasan "kenapa uang tersedia turun" menguraikan arus siklus ini (pemasukan, pengeluaran, setoran, tagihan), bukan saldo awal siklus yang direka ulang.
- Hasil keputusan baru terukur setelah satu siklus lengkap. Hasil itu berarti "setelah", tidak membuktikan sebab.
- Indeks Biaya Pribadi hanya dari struk yang dipindai, per toko dan ukuran yang sama.
- Ask Insight memakai pola kata tetap, bukan pemahaman bahasa bebas. Pertanyaan yang bentuknya jauh berbeda bisa tidak dikenali (ia akan bilang belum bisa menjawab).
- Regime perjalanan dikenali dari kata kunci kategori/merchant/catatan, jadi bisa terlewat bila namanya tidak umum.
- Insight bukan nasihat keuangan profesional, dan tidak pernah memindahkan uang atau mengubah catatan sendiri.
