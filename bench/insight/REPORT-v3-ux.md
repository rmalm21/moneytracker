# Insight V3.0: rebuild tampilan dan pengalaman (Dompet Ajaib 4.6)

Basis: commit `c5a8bd1` (rilis 4.5, 478 tes). Hasil: rilis 4.6, 490 tes lulus.

Mesin Insight tidak dibangun ulang. Rumus skor kesehatan, rute Tanya Insight, perilaku skenario yang hanya membaca, dan Jatah Aman (`safeDaily` bersama) tidak berubah. Yang berubah adalah apa yang ditampilkan, urutannya, dan kata-katanya.

---

## 1. Ringkasan
Halaman Insight disusun ulang dengan urutan **Keadaan → Yang berubah → Prioritas → Yang membaik → Rincian → Bukti**. Setiap bagian bisa diciutkan. Headernya jelas: ikon, judul, dan satu baris "isi bagian ini".

Istilah mesin diganti bahasa sehari-hari:

| Istilah mesin | Di layar sekarang |
|---|---|
| tekanan | Perlu dijaga |
| momentum | Arah |
| likuiditas | Uang sampai gajian |

Di halaman campuran (390 px), tinggi halaman turun **61%** dan jumlah kartu **72%**. Angka rupiah yang tampil turun dari 116 menjadi 27.

## 2. Masalah sebelum rebuild
Diukur di layar 390 px, data campuran:
- Layar pertama hanya berisi judul dan kartu skor.
- Ringkasan, Yang berubah, dan Prioritas mengulang cerita yang sama.
- Kartu prioritas berat: tiga kotak angka, daftar "kenapa", dan 2–3 badge per kartu.
- Momentum dan tekanan menampilkan semua komponennya sekaligus.
- Ada 11 tab rincian.
- Banyak jargon: tekanan, likuiditas, momentum, radar.

## 3. Prinsip
- Satu hal penting per kartu.
- Angka ringkas di ringkasan (Rp12,5 jt), angka penuh di rincian (Rp12.500.000).
- Badge maksimal satu per kartu.
- Rincian selalu bisa dibuka, tapi tidak dipaksakan.

## 4. Arsitektur
| Lapisan | File | Isi |
|---|---|---|
| Mesin (kebenaran) | `lib/insight-v3`, `lib/insight-v25`, `lib/advisor` | Semua perhitungan |
| View model | `lib/insight-v3/view.ts` | Hanya memilih dan menerjemahkan ke bahasa sederhana; tidak menghitung uang |
| Format | `lib/insight-v3/format.ts` | Rupiah ringkas/penuh, persen dengan koma, tanggal |
| Komponen | `components/insight/` | `section`, `hero`, `brief`, `stories`, `deep` |
| Halaman | `components/advisor-view.tsx` | Merangkai bagian |
| Desain | `app/globals.css` §148 | Kelas `ix-*` dengan token warna yang sudah ada |

## 5. Hirarki dan layar pertama
Di ponsel, layar pertama berisi judul, kartu keadaan, dan awal Ringkasan. "Yang berubah" baru terlihat setelah satu gulir, karena Ringkasan memuat sampai 4 kalimat. Ini dicatat sebagai keterbatasan (§36).

Di desktop (≥1100 px), kartu keadaan dan Ringkasan tampil berdampingan, dan "Yang berubah" sudah terlihat di layar pertama.

## 6. Kartu keadaan (hero)
Isinya: skor (utama), label (Sehat / Cukup sehat / Perlu perhatian / Rawan), satu kalimat, lalu dua fakta yang bisa diketuk: **Arah** dan **Perlu dijaga**. Tidak ada gauge.

"Kenapa skor ini?" membuka:
- perubahan skor sejak snapshot terakhir;
- "Kuat di" dan "Tertahan oleh";
- angka kunci;
- "Lihat perhitungan lengkap", yang menuju Indikator skor.

## 7. Arah (momentum)
Satu label (Membaik / Stabil / Campuran / Memburuk) dan satu kalimat. Komponennya tampil di sheet saat diketuk, beserta penjelasan singkat.

## 8. Perlu dijaga (tekanan)
Menampilkan 1–2 hal yang sedang berat. Saat diketuk, semua bidang tampil dengan level **Aman / Cukup / Perlu dijaga / Berat** dan alasan satu kalimat.

Di dalam halaman tidak ada lagi kata "tekanan". Judul jawaban Tanya Insight juga diganti (hanya teksnya, rutenya tetap): "Paling perlu dijaga: …" dan "Tidak ada yang sedang berat".

## 9. Ringkasan (brief)
Berisi 2–4 kalimat. Kalimat yang punya sumber bisa diketuk untuk membuka ceritanya. Frasa mesin "tekanan utama" diganti dengan bahasa biasa.

## 10. Jelaskan siklus ini
Tombol sekunder yang membuka sheet berisi 7 langkah berurutan:
1. Keseluruhan
2. Pemasukan
3. Pengeluaran
4. Uang sampai gajian
5. Kewajiban
6. Kemajuan
7. Yang perlu diperhatikan

Tiap langkah menampilkan satu kalimat dan tombol "Selengkapnya".

## 11. Tanya Insight
- Awalnya tertutup: "Tanya tentang keuanganmu".
- Ada 3–4 saran pertanyaan yang sesuai data. Saran klaim hanya muncul kalau ada klaim. Kata gaul ("gue") dihapus.
- Jawaban tersusun: judul → kalimat pertama → poin (maksimal 2) → "Lihat detail" / "Lihat bukti".
- Pertanyaan di luar kemampuan dijawab "Aku belum memahami pertanyaan itu", disertai saran.
- Ada catatan kecil bahwa Tanya Insight hanya membaca datamu.
- Tes memastikan setiap saran memang dipahami mesin Ask (intent tidak UNKNOWN).

## 12. Yang berubah
- Maksimal 3 kartu, lalu "Lihat semua perubahan".
- Isi kartu: judul, selisih besar, satu kalimat penyebab, ↳ dampak, dan satu status.
- Petunjuk sekali saja: "Ketuk kartu untuk melihat kenapa."
- Kalau tidak ada perubahan berarti, tampil satu kalimat yang tenang.

## 13. Sheet cerita: Kenapa
Diawali kalimat jawaban dan perbandingan Sekarang / Biasanya / Selisih.

Bagian Kenapa berupa batang penyebab. Diketuk untuk turun ke merchant, lalu ke efek "lebih sering vs lebih mahal", lalu ke daftar transaksi.

## 14. Sheet cerita: Dampaknya
Alur vertikal dengan panah, sengaja dibuat berbeda dari batang Kenapa. Garis tepinya membedakan jenis dampak:

| Garis | Label |
|---|---|
| Solid | langsung |
| Putus-putus | perkiraan |
| Titik | bersamaan |

Legenda ada di tombol "?". Maksimal 3 langkah, lalu "Lihat dampak lengkap".

## 15. Bukti
Berada dalam bagian yang bisa dibuka: Sinyal terkait, Bukti & perhitungan (angka, langkah hitung, keyakinan, catatan), dan Transaksi.

Footer sheet berisi satu aksi utama. Aksi lain (Ingatkan minggu depan, Sembunyikan) ada di menu ⋯.

## 16. Prioritas sekarang
- Maksimal 3 baris: nomor, judul, satu alasan, dan satu aksi opsional.
- Sematkan, Ingatkan minggu depan, dan Sembunyikan ada di menu ⋯.
- Sematkan sekarang berlaku untuk semua baris, termasuk sinyal yang tidak berasal dari temuan Advisor.
- Cerita yang sudah tampil di "Yang berubah" tidak diulang.
- Sisanya dan peringatan lain ada di "Lihat lainnya (n)".

## 17. Yang membaik
Bagian ini hanya muncul kalau ada isinya. Item yang selesai tampil "Selesai sejak …" selama 7 hari, lalu pindah ke Riwayat. Item yang sudah tampil di "Yang berubah" tidak diulang.

## 18. Keadaan stabil
- Kalimat utamanya: "Keuangan relatif stabil."
- Tidak ada kartu pengisi.
- Di data stabil hanya ada 5 kartu (sebelumnya 28) dan 2 badge (sebelumnya 10).

## 19. Bagian yang bisa diciutkan
Semua bagian (12) memakai komponen yang sama, dengan `aria-expanded`, `aria-controls`, dan chevron.

Status buka/tutup disimpan per perangkat per pengguna di `localStorage` (`dompet-ajaib:insight-collapsed:<uid>`). Yang jarang dipakai tertutup secara bawaan: Indikator skor, Profil, Uang menganggur, Rencana gajian, Grafik, Riwayat, serta Arah & yang perlu dijaga.

## 20. Tab rincian
Dari 11 tab menjadi **5**: Pengeluaran (sub: Ringkas, Kategori, Kebiasaan, Harga), Arus uang, Target & aset, Skenario, Data.

Tiap tab dibuka dengan satu pertanyaan, misalnya "Ke mana uangku pergi, dan apa yang berubah?". Daftar panjang dipotong menjadi 2–3 item, lalu "Lihat n lainnya".

## 21. Arus uang
Bagian pertama menjawab "aman sampai gajian?": titik tersempit, tanggalnya, dan statusnya (Aman / Mepet / Bisa minus).

Setelah itu ada:
- garis waktu kejadian;
- "Lihat grafik lengkap";
- dua kasus berlabel SIMULASI: "Jika klaim cair sesuai biasanya" dan "Jika klaim tertunda";
- kartu pemasukan "Biasanya sekitar RpX per siklus", dengan Rincian.

## 22. Lab Skenario
- Diawali keadaan sekarang, lalu chip "Bagaimana jika…" dan form "Buat sendiri".
- Hasil menampilkan **yang berubah dulu**; yang tetap sama dirangkum satu baris.
- Bisa menyimpan sampai 3 skenario, ditumpuk sebagai kartu.
- Setiap kartu berlabel SIMULASI. Tidak ada pemenang yang dipilihkan.
- Tidak menyentuh data asli.

## 23. Indeks harga pribadi
Kalau data struk belum cukup, hanya tampil satu kalimat; tidak ada kartu kosong.

## 24. Pemasukan
Ditulis "Pemasukan biasa sekitar RpX". Porsi pemasukan tidak tetap dijelaskan dengan kata-kata.

## 25. Pilihan target
Ditulis "Jika kamu memilih…", tanpa kata "terbaik", dengan catatan "Ini gambaran pilihan, bukan saran."

## 26. Keputusan & hasil
Garis waktu vertikal: tanggal, keputusan, lalu hasil dengan kata "setelah". Kalau belum ada, tampil penjelasan kosong yang ramah.

## 27. Tab Data
Ringkasan sederhana (batang kelengkapan) dan tombol "Buka Kesehatan Data".

## 28. Badge, angka, dan warna
- Badge maksimal satu per kartu. Chip keyakinan hanya muncul kalau data terbatas.
- Warna mengikuti makna: hijau = membaik, kuning = perlu dijaga, merah = hanya untuk minus atau berat. Halaman tidak lagi didominasi merah.
- Angka memakai `tabular-nums`. Persen memakai koma (6,9%).

## 29. Bahasa
Istilah mesin tidak tampil. Tes memeriksa kata tekanan, momentum, likuiditas, regime, MAD, p75, baseline, dan driver di teks hero, serta Tekanan, Momentum, dan Likuiditas di teks komponen.

## 30. Navigasi dan memori
Saat kembali dari transaksi, klaim, atau anggaran, posisi gulir, tab, dan bagian yang terbuka dipulihkan (`sessionStorage`). Di tes, posisi gulir 1548 px kembali tepat ke 1548 px.

## 31. Sheet dan desktop
- Sheet bawah untuk konteks kecil (Arah, Perlu dijaga, bantuan); sheet penuh untuk Cerita dan Jelaskan.
- Desktop: hero dan Ringkasan dua kolom, lebar maksimal 1180 px.

## 32. Ketahanan
- Setiap modul dibungkus error boundary. Kalau satu modul gagal, hanya bagian itu yang menampilkan catatan.
- Skeleton saat memuat mengikuti hirarki halaman.
- Petunjuk "Ketuk kartu…" muncul sekali.
- Bantuan "?" tersedia untuk Skor, Arah, Perlu dijaga, Indeks harga, dan label dampak. Tidak ada dinding tutorial.

## 33. Tidak ada fitur yang hilang
Masih ada semua:
- skor dan indikator;
- profil Insight dan kuis risiko;
- uang menganggur dan rencana investasi;
- rencana gajian; grafik siklus dan porsi;
- semua temuan Advisor (di tab dan "Lihat lainnya");
- sematkan, sembunyikan, tunda, dan pulihkan;
- pengaturan urutan bagian;
- semua isi V2.5/V3: cerita, bukti, transaksi, dampak, skenario, harga, klaim, keputusan, riwayat, dan milestone.

Komponen lama `components/insight-v3.tsx` dihapus karena seluruh isinya sudah dipindah. Urutan bawaan bagian disesuaikan, tapi urutan yang pernah disimpan pengguna tetap dihormati (`mergeOrder`).

## 34. Pengujian
- `tests/insight-view.test.mjs`: 12 tes baru. Mencakup format, potongan kalimat, hero tanpa jargon, keadaan stabil, maksimal 3 kartu, dedup prioritas dan yang membaik, pin untuk sinyal, ringkasan, saran Ask yang dipahami mesin, arus uang, 7 langkah Jelaskan, tab Data, dan lapisan tampilan yang tidak menulis data.
- Total **490 tes lulus** (478 lama + 12 baru).
- Tes interaksi di browser: 24 lulus, 0 gagal, 0 error konsol. Mencakup "Kenapa skor ini?", sheet Arah dan Perlu dijaga, menciutkan bagian beserta persistensinya, Jelaskan, Tanya (didukung dan tidak), sheet cerita, drill-down, Dampaknya, menu ⋯ dan sematkan, 5 tab, arus uang, skenario (tambah/simpan/hapus), memori navigasi, 320 px, teks 125%, nama tombol, aria-expanded, dan target sentuh ≥32 px.

## 35. Responsif dan offline
- Lebar 320/360/390/430/1366, mode terang dan gelap, teks 125%: tidak ada overflow horizontal (0 px).
- Data yang diuji: campuran, stabil, tekanan, klaim berat, target berat, dan pengguna baru.

Uji offline memakai build produksi dengan service worker aktif:
1. Muat online.
2. Putuskan jaringan.
3. Muat ulang: aplikasi dan data tampil dalam 286 ms.
4. Buka Insight saat offline: tampil dalam 1,7 detik dengan 11 bagian dan 2 kartu perubahan.

Catatan: muat ulang selalu kembali ke Beranda, baik online maupun offline, karena aplikasi menghapus `?view=` dari URL. Ini perilaku lama, bukan masalah offline.

## 36. Kinerja
Mesin (data target berat):

| Ukuran | Waktu |
|---|---|
| `analyzeInsightV3` | 50 ms |
| Semua view model sekaligus | 0,65 ms |
| `whatIf` | 0,03 ms |

Build produksi di browser: buka Insight 1,26 detik (termasuk Firestore emulator), ganti tab 15 ms, buka sheet cerita 31 ms, tambah skenario kurang dari 1 frame.

Halaman lebih ringan karena elemen di DOM jauh lebih sedikit. Bagian yang tertutup tidak dirender.

## 37. Scorecard beban kognitif (halaman penuh, 390 px)
| Data | Tinggi | Kartu | Badge | Angka Rp | Persen | Judul |
|---|---|---|---|---|---|---|
| Campuran | 10.186 → **3.947** | 36 → **10** | 12 → **7** | 116 → **27** | 41 → **9** | 18 → 14 |
| Stabil | 8.609 → **3.167** | 28 → **5** | 10 → **2** | 96 → **16** | 34 → **6** | 17 → 14 |
| Tekanan | 9.084 → **3.490** | 30 → **7** | 11 → **4** | 104 → **21** | 35 → **8** | 17 → 14 |
| Klaim | 9.129 → **3.187** | 29 → **5** | 10 → **2** | 101 → **14** | 33 → **5** | 17 → 14 |
| Target | 9.158 → **3.225** | 34 → **5** | 16 → **2** | 95 → **18** | 33 → **8** | 23 → 14 |
| Pengguna baru | 6.629 → **1.940** | 22 → **1** | 4 → **0** | 63 → **1** | 22 → **0** | 10 → 11 |

Desktop 1366 px (campuran): tinggi 6.271 → 2.650, badge 18 → 7.

Kedalaman ketukan: penyebab utama tetap 1 ketukan (kartu → Kenapa), transaksi 2–3 ketukan.

Jumlah konsep di layar pertama: skor, arah, perlu dijaga, dan ringkasan (4). Sebelumnya: skor, 6 indikator, ring, tekanan, momentum, dan radar.

## 38. Keterbatasan
- **Jumlah tombol tidak turun** (51 → 52). Setiap bagian sekarang punya tombol header untuk diciutkan (12 tombol). Yang turun adalah jumlah informasi yang harus dibaca.
- Di ponsel, "Yang berubah" belum masuk layar pertama kalau Ringkasan berisi 4 kalimat. Ringkasan sengaja tidak dipotong, supaya tidak menyembunyikan isi.
- Skrip audit menghitung "kartu" dari kelas tertentu. Hero dan Ringkasan tidak ikut dihitung, jadi angka kartu di layar pertama (0) tidak berarti layar kosong.
- Kartu temuan Advisor lama di dalam tab masih memakai gaya lama, hanya dipotong menjadi 2 item dan "Lihat lainnya".
- Belum ada uji pembaca layar sungguhan (VoiceOver/TalkBack). Yang diuji baru nama tombol, aria-expanded, dan target sentuh.
