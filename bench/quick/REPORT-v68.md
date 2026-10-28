# Catat otomatis 6.8 — bahasa sehari-hari

Laporan dari keluhan nyata: “soyjoy jajan 25k bedeng” harusnya Soyjoy, kategori Jajan, tempat Bedeng, dompet bawaan;
“nasi padang buat makan malam / buat sarapan / sarapan” harusnya Nasi Padang dengan waktu makan sebagai kategori.
Tanpa memperluas bahasa daerah.

## Set

- **State** `fixtures-v68state.mjs`: taksonomi bawaan yang sebenarnya (204 kategori dari `lib/category-templates.ts`),
  dompet, catatan, dan transaksi terbaru V3.3. Kamis 15 Okt 2026, 15:00.
- **A, pengembangan** `fixtures-v68dev.mjs` (60 kalimat): tempat setelah nominal tanpa “di”, waktu makan, jajanan/minuman
  bermerek, kata setelah nominal yang bukan tempat (satuan, bensin, kendaraan, cara bayar, kata waktu), beberapa entri.
- **B, uji terpisah** `fixtures-v68heldout.mjs` (37 kalimat): barang, tempat, dan susunan lain. Ditulis sebelum mesin
  diubah. Run pertama dibekukan di `heldout-first/v68-heldout-first.json`.
- Pembanding: mesin 6.7 dibekukan di `baseline-v67/`. Runner `run-v68.mjs` (`--shadow` untuk semua set lama).

## Hasil (tanpa Kamus Pribadi)

| | 6.7 | 6.8 |
|---|---|---|
| A — benar seluruhnya | 24/60 (40%) | 60/60 (100%) |
| A — yakin tapi salah | 27 | 0 |
| B — benar seluruhnya (run pertama, beku) | 17/37 (46%) | 36/37 (97%) |
| B — yakin tapi salah (run pertama, beku) | 18 | 1 |
| Regresi A/B | – | 0 |
| Shadow 940 kalimat set lama: arti keuangan berubah | – | 0 (11 berubah: keterangan lebih bersih / tempat terisi) |
| Set lama lain (v30–v35, GLI, v60, Tanya) | – | tidak turun; v34 cold naik 23 → 25 |

Satu yang masih salah di B: “kemarin beli richeese 10rb alfamart” (Richeese juga nama restoran, kategorinya dibaca
makanan, bukan jajan). Sesudah pembekuan ditambahkan aturan umum “dua nama yang dikenal: yang setelah nominal adalah
tempatnya”; angka B yang dilaporkan tetap run pertama.

**Catatan kejujuran.** Sebelum run pertama B dibekukan, satu log shadow sempat ikut menampilkan keluaran beberapa
kalimat B (file B tidak dikecualikan dari shadow; sekarang sudah). Tidak ada perubahan mesin yang dibuat sesudah itu
sebelum pembekuan; B langsung dibekukan saat itu juga. Daftar kosakata jajanan/minuman ditulis luas dari nama-nama umum,
tetapi karena B ditulis oleh orang yang sama, sebagian merek di B ikut tercakup. Anggap angka B sebagai batas atas.

## Yang berubah di mesin

1. **Tempat tanpa “di”** (`lib/catat/entities.ts`, aturan 3): kata tepat setelah nominal yang menutup klausa (hanya
   boleh diikuti dompet, tanggal, atau penghubung) dibaca sebagai tempat bila ada barang sebelum nominal. Bukan tempat:
   angka, satuan/porsi, jenis bensin, kendaraan, cara bayar, kata waktu, orang, bilangan (“18k satu”), kata koreksi,
   nama kategori atau barang (`thingOrCategory`), dan nama dompet yang disingkat/salah ketik (“mand”). Jenis tempat
   (kantin, warung, pasar, kantor…) tetap tempat. Paling banyak tiga kata.
2. **Waktu makan = kategori** (`lib/quick-entry.ts`): sarapan/makan siang/makan malam/lunch/dinner/breakfast/ngemil
   dibuang dari keterangan bila masih ada makanan lain; sendirian tetap jadi keterangan. Teman makan (“w/ fam”) bukan
   barang. `lib/catat/compose.ts`: lunch/dinner/breakfast/maksi/makan malem/ngemil dikenali sebagai aktivitas.
   `lib/quick-plan.ts`: “beli nasi padang buat makan malam” → satu barang menjadi keterangan, bukan rincian.
3. **Kosakata** (`lib/categorize.ts`): jajanan bermerek dan jajanan pinggir jalan (Soyjoy, Oreo, SilverQueen,
   Beng-Beng, Taro, Pocky, Qtela, Tango, Malkist, cireng, cilor, risol, basreng, martabak…) dan minuman kemasan
   (Ultra Milk, Indomilk, Teh Kotak, Sosro, Milo, Good Day, Golda, Floridina, Cimory…).
4. **Dua nama yang dikenal**: yang setelah nominal adalah tempat, yang sebelumnya barang.
