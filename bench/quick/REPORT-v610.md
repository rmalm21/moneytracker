# Catat otomatis 6.10 — bahasa sehari-hari, putaran ketiga

Lanjutan 6.9: dari penjelajahan ±120 kalimat sehari-hari (singkatan, salah ketik, format nominal, waktu, kata seru,
pemasukan kecil, merek). Tanpa bahasa daerah.

## Set

- State: `fixtures-v68state.mjs` (taksonomi bawaan yang sebenarnya, Kamis 15 Okt 2026, 15:00; dompet Jago, GoPay,
  Jenius, Mandiri, BRI, Krom, Cash).
- **A, pengembangan** `fixtures-v610dev.mjs` (60 kalimat, 12 di antaranya kontrol).
- **B, uji terpisah** `fixtures-v610heldout.mjs` (47 kalimat): ditulis dan di-commit sebelum mesin diubah (commit
  “6.10 bench: patokan 6.9, set dev dan set tersembunyi”), dikecualikan dari shadow sejak awal, dan tidak pernah
  dijalankan sebelum run pertama yang dibekukan (`heldout-first/v610-heldout-first.json`).
- Pembanding: mesin 6.9 dibekukan di `baseline-v69/`. Runner `run-v610.mjs` (shadow memuat set 6.8 dan 6.9 pada
  state-nya sendiri).

## Hasil (tanpa Kamus Pribadi)

| | 6.9 | 6.10 |
|---|---|---|
| A — benar seluruhnya | 13/60 (22%) | 60/60 (100%) |
| A — yakin tapi salah | 39 | 0 |
| B — benar seluruhnya (run pertama, beku) | 11/47 (23%) | 47/47 (100%) |
| B — yakin tapi salah (run pertama, beku) | 31 | 0 |
| Regresi A/B | – | 0 |
| Shadow 1114 kalimat set lama (termasuk 6.8 dan 6.9): berubah | – | 8 |
| · di antaranya arti keuangan berubah | – | 2, keduanya kini benar (“pake jns” → Jenius, “dari mdr” → Mandiri) |
| v34 uji terpisah tanpa Kamus Pribadi | 11/36 | 13/36 (dua kalimat singkatan dompet di atas) |
| Set 6.9, 6.8, 6.0, Tanya, v30–v35, GLI | – | sama seperti 6.9 |

Enam perubahan shadow lainnya hanya keterangan yang lebih bersih (“listrik bca” → Listrik, “jajan 10rb aja” → Jajan,
“ayam besto 13k jg” → Ayam Besto, “bayar karaoke … bagi rata” kini berketerangan Karaoke).

“Arti keuangan berubah” di A/B memang yang dituju: dompet singkatan kini terbaca, “uang kaget” dan “uang saku dari
mama” jadi pemasukan, menang lomba/giveaway jadi pemasukan, dan paylater tidak lagi dibaca sebagai nama orang.

**Batas angka ini.** B ditulis oleh orang yang sama dengan A, dari kelompok gejala yang sama (frasa lain, barang lain,
dompet lain). B mengukur apakah perbaikannya umum di dalam kelompok itu, bukan pada gejala yang belum pernah dilihat.
Anggap 100% sebagai batas atas, bukan jaminan.

## Ditemukan dan diperbaiki selama pengembangan

- Konsep Fast Food baru sempat membuat makanan biasa (“nasi padang”, “bakso”) masuk subkategori Restoran, karena
  Restoran kehilangan “seri”-nya dengan Fast Food. Aturan umum “subkategori seri dengan induknya → induk” dicoba dan
  ditolak (merusak “Minuman” di state V3.5). Perbaikannya: Restoran mendapat konsepnya sendiri (resto, restoran, rumah
  makan), jadi makanan biasa kembali ke Makan & Minum dan “makan di resto” kini ke Restoran.
- Salah ketik sempat membaca “kaleng” sebagai “kalung” (aksesori). Kini satu huruf yang tertukar hanya dihitung bila
  hurufnya bersebelahan di keyboard atau bunyinya mirip (s/z, c/k, f/p/v, i/y).
- “es teh dan gorengan” sempat tidak tergabung karena “teh” juga sapaan (bahasa Sunda); pemeriksaan sapaan dibuang,
  daftar kata orang (temen, mama, anak…) sudah cukup.

## Yang berubah

1. **Dompet disingkat** (`lib/catat/v3.ts`): huruf mati nama dompet berurutan (“gpy” GoPay, “mndr”/“mdr” Mandiri, “jns”
   Jenius) atau nama dompet kurang satu huruf hidup (“jgo” Jago, “gopy” GoPay) dibaca sebagai dompet itu, statusnya
   “Kemungkinan benar” dengan alasan. Tidak pernah untuk kata biasa, singkatan obrolan (“krm” = kirim, “dpt” = dapat),
   nama tempat, atau bentuk yang cocok untuk dua dompet. “pke” = pakai (`lib/catat/language.ts`).
2. **Dompet/bank yang belum dibuat, ditulis polos setelah nominal** (`lib/quick-entry.ts`, `lib/catat/entities.ts`):
   “15rb ovo”, “30rb bca”, “20rb dana” bukan keterangan dan bukan tempat; dompet bawaan tetap dipakai.
3. **Kata seru dan komentar harga**: duh, wah, waduh, astaga, anjir, ya ampun, huft, akhirnya, cuma, doang, aja,
   lumayan, mahal, murah, boros, banget, amat tidak masuk keterangan (pengeluaran dan pemasukan).
4. **Waktu**: “pagi/siang/sore/malam ini” dan “subuh” bukan keterangan. **Nominal**: “-an” (“15k-an”) dan “rupiah”.
5. **Nama uang**: “uang saku”, “uang kaget”, “uang sekolah”, “uang kas”… tetap dengan kata “uang”-nya; “jajan anak” tetap
   utuh. `lib/categorize.ts`: “uang kaget”, “uang saku/jajan dari …”, dan “menang lomba/giveaway/undian” adalah
   pemasukan (Hadiah Uang); “kirim uang kaget” tetap pengeluaran.
6. **Dua barang**: “kopi sama roti”, “bensin dan parkir”, “nasi sama ayam goreng” → “Kopi & Roti” dst., hanya bila
   kedua sisinya barang yang dikenal dan bukan orang (“makan sama temen” tetap “Makan”).
7. **Tempat makan dari namanya**: “mcd 45rb”, “kfc 50rb”, “hokben”, “kopken”, “janji jiwa” → tempatnya terisi,
   keterangan Makan/Kopi/Minuman. Konsep baru **Fast Food** (KFC, McD, HokBen, Burger King, A&W, Richeese Factory…),
   **Restoran**, dan **Denda** (tilang). “kopken” = Kopi Kenangan.
8. **Salah ketik nama makanan** sebagai jalan terakhir: bila tidak ada kategori sama sekali, kata yang beda satu ketikan
   dari kata yang dikenal (“bakzo” → bakso, “seblack” → seblak) dibaca ulang; hasilnya selalu “Kemungkinan benar”.
9. **Paylater bukan orang**: “bayar spaylater/kredivo/akulaku” → Tagihan; kata yang dikenal pembaca kategori setelah
   “bayar” tidak dianggap nama orang.
