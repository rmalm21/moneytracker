# Catat otomatis — Memori Konteks (rilis 5.0)

Tujuannya: setelah sekali menulis "kopi di Dopamine Avenue", cukup ketik "kopi dopamine 77k" dan tempatnya langsung dibaca Dopamine Avenue.

## Cara kerja

Kode ada di `lib/catat/context-memory.ts`. Langkahnya ada di composer V3.5 (`lib/catat/compose.ts`, langkah 3d) dan di `recallHabits` (`lib/quick-plan.ts`).

1. **Memori tempat dibangun dari riwayat akun sendiri.**
   - Sumbernya `ctx.history`, maksimal 1.500 transaksi terbaru, ditambah tempat yang pernah dikonfirmasi.
   - Untuk tiap tempat dicatat: berapa kali dipakai, tanggal terakhir, keterangan yang paling sering, dan kategori yang paling sering.
   - Dibangun sekali per array riwayat (WeakMap). Riwayat baru, termasuk transaksi yang baru saja disimpan, langsung ikut terbaca.
2. **Tempat yang disebut sebagian.** Satu kata khas dari nama tempat yang diingat dibaca sebagai tempat itu, tanpa perlu "di". Contoh: "dopamine" → Dopamine Avenue, "kongsi" → Kongsi Tiam.
   - Kata yang dihitung: minimal 4 huruf, bukan kata yang sudah dikenal aplikasi (kopi, makan, warung, motor, cafe, …), bukan dompet, bukan orang, dan bukan nama tempat bawaan.
   - Satu salah ketik diterima untuk kata minimal 6 huruf ("dopamin"), asal hanya cocok dengan satu kata.
   - Kalau kata itu cocok dengan dua tempat, dipilih yang jauh lebih sering dipakai (minimal 2× dan minimal 2 kali). Kalau tidak ada yang jelas lebih sering, tidak ditebak. Contoh: Kenari Bakery vs Kenari Laundry.
   - Tempat ditaruh di akhir klausa sebagai "di Nama Lengkap", lalu dibaca oleh mesin yang sama. Bug Catcher V3.5 tetap memeriksa hasilnya.
3. **Kebiasaan tempat.** Kalau entri di tempat yang diingat belum punya keterangan atau kategori, diisi dengan yang biasa dipakai di sana.
   - Keterangan diisi bila porsinya minimal 50% dari kunjungan; kategori bila minimal 60%.
   - Ditandai "kemungkinan benar".
   - Yang ditulis pengguna selalu menang: "makan dopamine 50k" tetap Makan.
4. **Yang tidak pernah diambil dari memori:** nominal, dompet, tanggal, dan jenis entri. Kalimat utang, transfer, anggaran, dan sejenisnya tidak disentuh.
5. **Privasi.**
   - Semuanya lokal, tanpa jaringan dan tanpa penyimpanan baru.
   - Riwayat milik akun sendiri, jadi akun lain tidak tahu.
   - Mematikan personalisasi di Bahasa Saya juga mematikan memori ini.

## Contoh

Riwayat berisi tiga kali "Kopi · Dopamine Avenue · Minuman":

| Ketik | Hasil |
|---|---|
| kopi dopamine 77k | Kopi · Dopamine Avenue · Minuman |
| dopamine kopi 77k / KOPI DOPAMINE 77K / kopi dopamin 77k | sama |
| dopamine 45k jago | Kopi · Dopamine Avenue · Minuman · Jago (dari kebiasaan) |
| makan dopamine 50k | Makan · Dopamine Avenue · Makan & Minum |
| kopi 25k | Kopi, tanpa tempat (tempat tidak ditebak dari keterangan saja) |

## Hasil tes

- 652 tes unit lulus, 11 di antaranya baru di `tests/catat-memory.test.mjs`. Isinya:
  - urutan kata, huruf besar, salah ketik;
  - kebiasaan;
  - kata yang ditulis menang;
  - nama yang cocok dengan dua tempat;
  - dompet di dalam nama tempat;
  - kata umum;
  - utang dan transfer;
  - personalisasi mati;
  - isolasi akun;
  - lokal saja.
- Semua suite lama tetap 100% (v25–v34, GLI). Set V3.5: dev 40/40, held-out 18/20 (beku), adversarial 23/23.
- Shadow terhadap 4.10: 0 perubahan pada 771 kalimat lama.
- QA browser 7/7 lulus, tanpa error konsol:
  - simpan sekali, lalu "kopi dopamine 77k";
  - "Kenapa?";
  - kebiasaan;
  - offline dengan salah ketik;
  - personalisasi mati;
  - akun lain.

## Batas

- Tempat tidak ditebak hanya dari keterangan ("kopi 25k" tidak otomatis Dopamine Avenue), karena satu keterangan bisa dicatat di banyak tempat.
- Kata yang juga kata umum (kopi, warung, motor) tidak pernah dipakai sebagai petunjuk tempat. Tempat bernama satu kata umum tetap perlu "di".
