# 8.6 · Buka aplikasi dan Transaksi

**Cara ukur.** Build produksi (file statis), akun demo di Firebase emulator (455 transaksi), layar 390×844, CPU
diperlambat **4×**. Tiga putaran, 8.5 dan 8.6 bergantian, lima kali per putaran (median).

## Buka aplikasi lagi (sudah masuk, file sudah tersimpan seperti aplikasi terpasang)

Muat ulang halaman sampai Beranda tergambar, dengan latensi jaringan 150 ms per bolak-balik. Skrip:
`bench/v86/perf-coldstart.mjs`.

| | 8.5 | 8.6 |
|---|---|---|
| Beranda tampil | 2100 / 2116 / 2072 ms | 1341 / 1211 / 1195 ms |
| JS yang dibaca sebelum Beranda tampil | 4020 KB | 2005 KB |
| Tugas panjang sebelum tampil | 281–396 ms | 131–230 ms |
| Blokir dalam 6 detik sesudah tampil | 368–551 ms | 417–527 ms |

Tanpa latensi jaringan: 8.5 1908 ms, 8.6 1220 ms.

**Yang diubah.**
1. Chat, formulir transaksi, pemindai struk, laporan utang-piutang (grafik), popup “Apa yang baru”, dan dialog lain
   tidak lagi ikut dimuat sebelum Beranda. Tombol chat tampil langsung; mesin chat dimuat saat tombolnya disentuh.
   Formulir transaksi diambil diam-diam saat HP senggang, jadi tombol “+” tetap langsung terbuka.
2. Halaman lain dulu dipanaskan sekaligus (~40 file) begitu login terbaca, berebut CPU dengan Beranda. Sekarang mulai
   4 detik setelah buka, satu file per jeda.
3. HP yang sudah pernah diizinkan masuk langsung membuka profil; pemeriksaan izin ke server (2 kali bolak-balik)
   berjalan bersamaan. Kalau izin dicabut, layar akses tetap muncul begitu pemeriksaan selesai. Keamanan data tetap
   dijaga aturan Firestore (setiap baca diperiksa).

**Jujur soal hasil.** Beranda tampil sekitar 40% lebih cepat. Kerja yang dipindah ke sesudah tampil membuat blokir
sesudah tampil kira-kira sama dengan 8.5 (tidak lebih ringan). Latensi di emulator lokal tidak mewakili semua kondisi
jaringan HP; di jaringan yang lebih lambat, langkah 3 seharusnya lebih terasa, tetapi itu belum diukur di HP asli.

## Beranda → Transaksi

Skrip: `bench/v85/perf-timeline.mjs`. Dua putaran.

| | 8.5 | 8.6 |
|---|---|---|
| Tampil | 119 / 126 ms | 102 / 101 ms |
| Tugas terpanjang | 72 / 85 ms | 68 / 59 ms |
| Total blokir | 49 / 57 ms | 29 / 22 ms |

Yang diubah: format rupiah dan tanggal memakai formatter yang dibuat sekali (dulu dibuat ulang tiap angka; rupiah kira-kira
14× lebih cepat, hasil sama persis), kategori dicari lewat indeks, dan baris yang tidak berubah tidak digambar ulang.
