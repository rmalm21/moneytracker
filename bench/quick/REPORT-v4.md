# Catat otomatis V4 (rilis 7.5): berhitung, patungan, bagi kategori

Patokan: mesin 7.4 dibekukan di `bench/quick/baseline-v74`. Semua angka dijalankan tanpa Kamus Pribadi, di taksonomi
bawaan asli (`fixtures-v68state.mjs`, Kamis 15 Okt 2026, dompet utama Jago). "Yakin tapi salah" berarti ada isian
yang salah pada kartu yang tidak ditandai untuk dicek.

```
SET=v4dev node bench/quick/run-v4.mjs --fails
SET=v4heldout node bench/quick/run-v4.mjs          # sudah dibekukan: FROZEN-v4heldout-first.json
node bench/quick/run-v4.mjs --shadow               # semua kalimat dari set lama
```

## Hasil

| | 7.4 | V4 |
|---|---|---|
| **Set latihan** (79 kalimat) benar seluruhnya | 20 (25%) | 79 (100%) |
| · matematika | 0/22 | 22/22 |
| · persen | 0/7 | 7/7 |
| · bagi orang | 4/22 | 22/22 |
| · alokasi kategori | 0/11 | 11/11 |
| · jangan diubah | 16/17 | 17/17 |
| Yakin tapi salah | 44 | 0 |
| **Set uji terpisah** (44 kalimat, percobaan pertama) benar seluruhnya | 11 (25%) | 44 (100%) |
| · matematika | 0/13 | 13/13 |
| · persen | 0/5 | 5/5 |
| · bagi orang | 2/11 | 11/11 |
| · alokasi kategori | 0/6 | 6/6 |
| · jangan diubah | 9/9 | 9/9 |
| Yakin tapi salah | 25 | 0 |
| Waktu baca rata-rata / P95 (set uji) | 32,5 / 33,7 ms | 12,3 / 13,9 ms |

Regresi terhadap 7.4 di kedua set: 0.

**Shadow** (1.213 kalimat unik dari 27 set lama, tiap set di state-nya sendiri): 2 kalimat berubah dan nol yang
arti uangnya berubah (jenis, nominal, dompet, tujuan, tanggal, orang, split, jumlah baris kategori). Keduanya cuma
keterangan yang lebih bersih: "pizza berempat" jadi "pizza", "kado bertiga" jadi "kado". `npm test`: 725 lulus, 0 gagal
(10 tes baru di `tests/catat-v4.test.mjs`). Tanya: 32/32 dan 22/22, tidak berubah.

## Catatan kejujuran

- Set latihan awalnya 68 kalimat (67/68 lalu 68/68). Kalimat **x1–x11 ditambahkan sesudahnya**, diambil dari
  kalimatmu sendiri ("…satu untuk gue **expense** makan biasa…", yang ternyata gagal) dan dari satu putaran kalimat
  baru yang kucoba. Jadi 100% di set latihan sudah dibantu perbaikan; itu bukan ukuran yang netral.
- Set uji terpisah ditulis bersama set latihan, sebelum mesin diubah, dengan kata, angka, dan nama yang berbeda.
  Isinya sempat terbuka di konteks kerjaku selama pengembangan, tapi tidak ada aturan yang dibuat untuk kalimat-kalimat
  itu. Set uji dijalankan sekali, lalu hasil pertamanya dibekukan.
- Satu isian kebenaran set latihan diubah sebelum dibekukan: s13 "grab" jadi Transportasi saja, karena grab bisa mobil
  atau motor.

## Yang dibaca

- **Hitungan**: kata (dikali, dibagi, ditambah, dikurangi) dihitung dari kiri ke kanan. Simbol (× x * / ÷ + −) memakai
  urutan biasa dan bisa pakai kurung. Juga pecahan dan persen dari suatu nominal ("1/4 dari 400rb", "setengah dari…",
  "15% dari 1jt"), persen yang punya peran (diskon, pajak, service, tip, cashback, admin, ongkir), "5rb, 2 kali",
  "60rb 2x". Hasil dibulatkan ke rupiah di akhir.
- **Patungan dengan nama**: jadi Split Bill (bagi rata atau bagian yang ditulis), plus pilihan "Bagianku saja". Kalau
  yang bayar orang lain ("rina yang bayar", "ferdi bayarin…, aku hutang setengah"), dompetmu tidak dipotong dan
  bagianmu jadi utang ke dia.
- **Patungan tanpa nama** ("taksi 90rb bagi tiga"): yang dicatat bagianmu, total tinggal satu ketukan. Hitungan orang
  tanpa kata membagi ("makan 300rb kita berlima"): total tetap, bagianmu hanya ditawarkan.
- **Satu belanja, beberapa kategori**: bagi rata ("dibagi 2, satu …, satu …"), setengah-setengah, nominal, persen,
  "sisanya". Bagian "gue / aku / pribadi / makan biasa" ikut kategori belanjanya sendiri. Nama kategori yang dipakai
  di dua tempat (mis. "Makan" di Travel dan Reimbursement) tidak dicocokkan mentah-mentah, tapi dibaca oleh pengenal
  kategori.

## Ikut diperbaiki (bug lama sejak sebelum 7.4)

- "bayar kos 1.5jt 2 bulan" terbaca Rp15.200.000 dan "kos 1,5jt 2 bulan" terbaca Rp1.520. Pola "2jt200" sekarang tidak
  berlaku di dalam desimal atau di depan hitungan (bulan, hari, orang, unit…).

## Sengaja dibiarkan seperti 7.4

- "bensin 30rb kurang 5rb lagi": artinya masih kurang, bukan dikurangi.
- "cicilan hp 3 kali 500rb": satu cicilan, tidak dikali.
- "gaji 5jt dibagi 3 pos": pemasukan tidak dibagi.

## Belum bisa

- "kopi 25rb dua gelas": tidak dianggap harga satuan, karena memang bisa total.
- (Diperbaiki di 7.6: "diskon 50% makan 80rb" dan "listrik 450rb sepertiga buat kosan sebelah"; lihat bench/chat/REPORT.md.)
