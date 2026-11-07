# 8.5 · Halaman berat lebih kencang (Beranda, Transaksi)

**Cara ukur.** Build produksi (`next build`, file statis), akun demo di Firebase emulator (455 transaksi), layar 390×844,
CPU diperlambat **4×** (kira-kira HP kelas menengah/bawah). Dari ketukan di menu bawah sampai halaman tujuan tergambar
(diukur di dalam halaman: MutationObserver + satu frame), serta tugas panjang (>50 ms) sesudah ketukan.
Lima kali per arah, median; dua putaran, 8.4.1 dan 8.5 bergantian. Skrip: `bench/v85/perf-timeline.mjs`.

| | 8.4.1 | 8.5 |
|---|---|---|
| Transaksi → **Beranda**: tampil | 225 / 239 ms | 86 / 100 ms |
| Beranda: tugas terpanjang | 186 / 212 ms | 92 / 106 ms |
| Beranda: total blokir | 186 / 218 ms | 57 / 89 ms |
| Beranda → **Transaksi**: tampil | 196 / 184 ms | 107 / 114 ms |
| Transaksi: tugas terpanjang | 68 / 65 ms | 77 / 71 ms |
| Transaksi: total blokir | 42 / 22 ms | 27 / 56 ms |
| Gulir Transaksi 12× | 0 tugas panjang | 0 tugas panjang |

(Angka "a / b" = putaran 1 / putaran 2.)

**Yang diubah.**
1. Riwayat periode terakhir disimpan di memori (`usePeriodTransactions`): membuka Beranda/Transaksi lagi langsung
   tergambar dengan datanya, bukan halaman kosong dulu lalu digambar ulang.
2. Beranda: kartu di bawah layar pertama digambar bertahap sesudah halaman tampil (2 kartu per jeda, sebagai
   pembaruan prioritas rendah yang bisa disela ketukan). Tempatnya dijaga supaya tidak meloncat.
3. Transaksi: 6 baris pertama digambar dulu, sisanya (sampai 50) menyusul di jeda berikutnya.

**Jujur soal hasil.** Beranda jelas lebih cepat (sekitar 2,4× lebih cepat tampil, tugas terpanjang setengahnya).
Transaksi lebih cepat tampil (sekitar 40%), tetapi tugas terpanjang dan total blokirnya **tidak membaik**: kira-kira
sama dengan 8.4.1 (dalam batas naik-turun pengukuran). Percobaan pertama dengan 14 baris awal malah sedikit lebih berat
(tugas terpanjang 87–98 ms), jadi diturunkan ke 6 baris. Percobaan `content-visibility` per baris tidak memberi beda
yang terukur dan tidak dipakai (kartu per hari sudah memakainya sejak dulu).

**Temuan sampingan (diperbaiki).** Di 8.4.1, keterangan baris Split Bill yang panjang ("Split Bill · dibayar … · belum
kamu ganti") membuat semua kartu hari di Transaksi melebar melewati layar (nominal di kanan terpotong) pada HP 390 px.
Sekarang keterangannya turun ke baris kedua dan kartu pas di layar.
