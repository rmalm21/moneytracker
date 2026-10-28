# Catat otomatis 6.9 — bahasa sehari-hari, putaran kedua

Lanjutan 6.8: dari penjelajahan ±100 kalimat sehari-hari di luar makanan (transport, tagihan, belanja, kesehatan,
sosial, hiburan, pemasukan, perpindahan uang). Tanpa bahasa daerah.

## Set

- State: `fixtures-v68state.mjs` (taksonomi bawaan yang sebenarnya, Kamis 15 Okt 2026, 15:00).
- **A, pengembangan** `fixtures-v69dev.mjs` (50 kalimat).
- **B, uji terpisah** `fixtures-v69heldout.mjs` (32 kalimat): ditulis sebelum mesin diubah, dikecualikan dari shadow
  sejak awal, dan tidak pernah dijalankan sebelum run pertama yang dibekukan (`heldout-first/v69-heldout-first.json`).
- Pembanding: mesin 6.8 dibekukan di `baseline-v68/`. Runner `run-v69.mjs` (shadow kini juga memuat set 6.8 pada
  state-nya sendiri).

## Hasil (tanpa Kamus Pribadi)

| | 6.8 | 6.9 |
|---|---|---|
| A — benar seluruhnya | 13/50 (26%) | 50/50 (100%) |
| A — yakin tapi salah | 28 | 0 |
| B — benar seluruhnya (run pertama, beku) | 5/32 (16%) | 32/32 (100%) |
| B — yakin tapi salah (run pertama, beku) | 19 | 0 |
| Regresi A/B | – | 0 |
| Shadow 1036 kalimat set lama (termasuk 6.8): arti keuangan berubah | – | 0 (10 berubah, semuanya lebih rapi) |
| Set 6.8, 6.0, Tanya, v30–v35, GLI | – | sama seperti 6.8 |

“Arti keuangan berubah” di A/B hanya top up game (sebelumnya transfer antardompet, sekarang pengeluaran), memang
yang dituju. B ditulis oleh orang yang sama dengan A; anggap angka B sebagai batas atas, bukan jaminan.

## Yang berubah

1. **Kata kecil & periode** (`lib/quick-entry.ts`): abis, habis, kena, kepake, ngabisin, harganya, total, sekitar, dan
   “bulan/minggu/tahun ini/lalu” tidak masuk keterangan.
2. **“keluar 50rb buat bensin”** (`lib/catat/compose.ts`): bila di luar “buat …” tidak ada apa-apa selain nominal dan kata
   pengeluaran, yang setelah “buat” adalah barangnya, bukan keperluan.
3. **Perjalanan** (`lib/quick-entry.ts`): “gojek ke kantor”, “grab pulang”, “ojek ke pasar”, “krl ke bogor” menjadi
   keterangan utuh; tujuan bukan tempat. `lib/catat/v3.ts`: layanan (Gojek, Grab, Maxim, GoFood…) tidak lagi
   “diselamatkan” NLP.js sebagai tempat, dan kata biasa (“ojek”) tidak dikoreksi ejaannya menjadi nama tempat.
4. **Dibelikan untuk orang** (“beliin adek susu”): orangnya keluar dari keterangan dan masuk catatan (“Untuk Adek”).
5. **Pesan antar** (“gofood ayam geprek”): makanan jadi keterangan, aplikasinya jadi tempat.
6. **Cara bayar yang belum jadi dompet** (“pake ovo”, “via shopeepay”): bukan keterangan; dompet bawaan tetap dipakai.
7. **Toko saja** (“indomaret 87rb”): jadi tempat, keterangan “Belanja”.
8. **Kirim uang ke keluarga** (`lib/categorize.ts`): “tf/kirim/transfer ke mama/adek/ortu” → Sosial & Sedekah › Keluarga.
9. **Top up game** (`lib/quick-plan.ts`): top up game/diamond/steam/free fire adalah pengeluaran (Gaming), bukan transfer;
   top up dompet tetap transfer. “belanja bulanan” → Bahan Makanan.
