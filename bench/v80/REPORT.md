# Laporan 8.0

8.0 menggabungkan pekerjaan yang semula disiapkan sebagai 7.9 (dokumen latihan chatbot, saran chat, pembaca struk)
dengan permintaan baru: kata kasar, roasting, ketawa, jokes, dan chat yang tersambung ke semua menu. Semua angka di
bawah ini dari skrip di repo. Patokan 7.8 diambil dari `git archive f9431d4` (`sh bench/v79/make-baseline.sh`).

## 1. Chat dan Catat otomatis sesuai dokumen latihan (`bench/v79`)

| Set | 7.8 | 8.0 |
|---|---|---|
| Dev (306 kasus, dipakai selama membangun) | 11/306 | 306/306 |
| Held-out (197 kasus), **percobaan pertama, dibekukan** | 55/197 | **195/197** |
| Held-out setelah 2 perbaikan susulan (kata “poin” untuk cashback; wedang/bandrek/bajigur bukan bahan dapur) | 55/197 | 197/197 |

- Shadow Catat otomatis: 1.368 kalimat unik dari 31 set lama. 4 nominal berubah, semuanya disengaja (misalnya “Budi udah
  transfer balik 50rb” sekarang dibaca sebagai pengembalian dari Budi). 4 kalimat lain hanya berubah kategori.
- Held-out ditulis oleh penulis yang sama sebelum mesin diubah, jadi bisa punya titik buta yang sama dengan mesinnya.

## 2. Pembaca struk (`bench/v79/receipts-*.mjs`)

| Set | 7.8 | 8.0 |
|---|---|---|
| 9 struk kirimanmu (dev, dipakai selama membangun) | 2/9 | 9/9 |
| 90 struk buatan, 9 tata letak (dev) | 29/90 | 90/90 |
| 90 struk buatan, kosakata & label baru, **percobaan pertama, dibekukan** | 26/90 | **88/90 (98%)** |
| Set yang sama setelah perbaikan susulan (satuan “ROL”) | 26/90 | 90/90 |
| Shadow: 262 struk dari bench lama (fixtures & minimarket) | – | 0 berubah |

Satu struk benar seluruhnya berarti nama toko, tanggal, jam, total, subtotal, bayar, kembalian, cara bayar, dan semua
barang (nama dan harga bersih) benar, dan tidak “yakin” kalau angkanya tidak cocok.

Yang dipelajari: baris “jumlah × harga” di bawah nama barang (grosir “4.000 Kg X 12.500 Rp. 50.000.000”, toko bangunan
“5,000.00 x 4.00 PCS = 20,000.00”, UD “2.500 x2 = 5.000”), “Rp.10.000” yang menempel, nama toko diapit garis, kode
barang panjang di ujung nama, “BARIS=3 QTY=6.00” sebagai total, harga normal dan “disc toko” Hypermart, jam setelah
kode, nomor antrean besar (“2045”, “5096”), “22/Apr/2025”, “Total Inc Tax” dengan “Net Sales”, nama tiga baris
“1x …” dengan pilihan “Less Ice”, “+Normal Sweet 1”, “31,500 1 31,500”, “x5 2.000” di atas barangnya (O!Save), dan
“TIME … BILL : 142523”.

Batasannya, ditulis apa adanya:
- Kesembilan struk diketik ulang dari foto seperti hasil OCR, termasuk salah baca yang terlihat (“BANGJNAN”,
  “12,000.0J”). Mesin OCR-nya sendiri (Tesseract) tidak dilatih ulang. Yang dilatih adalah pembaca teks hasil OCR.
- Struk buatan memakai 9 tata letak yang sama. Set held-out mengukur kosakata, label, dan angka baru dalam tata letak
  itu, bukan tata letak baru.
- Kebenaran struk u1 diperbaiki sekali: “800 Pcs X 9.000 Rp. 7.800.000” ternyata 7.200.000, karena hanya angka itu yang
  cocok dengan jumlah × harga dan dengan subtotal.

## 3. Humor dan semua menu (`bench/v80`)

41 kasus: kata kasar per gaya bahasa, kata jorok, kasar sambil mencatat, ketawa, tebak-tebakan dua arah dan jokes
buatanmu, roasting, dan semua menu. Kasus-kasus ini ditulis setelah bagian mesinnya ada, tapi sebelum dicoba pada
kalimat-kalimat ini.

| | 7.8 | 8.0, percobaan pertama (dibekukan) | 8.0 setelah perbaikan |
|---|---|---|---|
| Semua kasus | 6/41 | **38/41** | 41/41 |
| Kata kasar | 0/7 | 7/7 | 7/7 |
| Kata jorok | 0/3 | 2/3 | 3/3 |
| Kasar sambil mencatat | 2/3 | 3/3 | 3/3 |
| Ketawa | 1/6 | 6/6 | 6/6 |
| Tebak-tebakan & jokes orang | 0/7 | 7/7 | 7/7 |
| Roasting | 1/5 | 4/5 | 5/5 |
| Semua menu | 2/10 | 9/10 | 10/10 |

Ketiga perbaikan susulan:
1. Satu balasan untuk kata jorok di gaya Gaul tidak menegur “jorok”.
2. Roasting hanya menyebut kategori terbesar, dan menulis “jatah Rp0” saat uang bebas sudah habis. Sekarang roasting
   juga menyebut kebiasaan yang paling sering (misalnya “Kopi 20×”) dan bilang uang bebasnya sudah habis.
3. “tunjukin laporan” terbaca sebagai pertanyaan. Sekarang permintaan membuka menu diperiksa lebih dulu.

## 4. Uji lama

| Set | Hasil |
|---|---|
| Chat heldout / heldout2 / heldout3 | 47/48 · 50/50 · 71/71 |
| Percakapan dev / held-out | 11/11 · 13/13 |
| Catat V4 v4dev / v4heldout / v78dev / v78heldout | 83/83 · 44/44 · 18/18 · 14/14 |
| `npm test` | 775 lulus, 0 gagal |

## Batasan

- Kata kasar dikenali dari daftar kata. Kata yang tidak ada di daftar dianggap kata biasa.
- Gaya Gaul membalas ejekan dengan candaan soal kebiasaan, bukan soal orangnya. Kata jorok tidak pernah diulang.
- Model chat yang dilatih (NLP.js) tidak dilatih ulang untuk maksud baru (kata kasar, roasting, tebak-tebakan, menu).
  Maksud-maksud ini ditangani aturan sebelum model dipakai.
