# Laporan 8.1

Pustaka bahasa asisten diperluas: kata kasar dan jorok (semua cara tulis, bahasa daerah), obrolan baik, kabar gembira,
konten seru (motivasi, fakta, tantangan, ramalan), permainan, pertanyaan data baru, cara pakai fitur, dan gaya Bar-bar.
Patokan 8.0 diambil dari `git archive 970b124` (`sh bench/v81/make-baseline.sh`).

## Set uji 8.1 (`bench/v81`, 68 kasus)

Kasusnya ditulis **sebelum** mesin 8.1 diubah. Hasil percobaan pertama dibekukan di `FROZEN-heldout-first.md`.

| | 8.0 | 8.1, percobaan pertama (dibekukan) | 8.1 setelah perbaikan |
|---|---|---|---|
| Semua kasus | 7/68 | **63/68** | 66/68 |
| Kata kasar (semua cara tulis) | 2/12 | 11/12 | 11/12 |
| Kata jorok | 1/4 | 2/4 | 4/4 |
| Nama hewan sungguhan | 0/3 | 3/3 | 3/3 |
| Obrolan baik | 1/15 | 15/15 | 15/15 |
| Seru: motivasi, fakta, permainan | 1/12 | 10/12 | 11/12 |
| Pertanyaan data baru | 0/6 | 6/6 | 6/6 |
| Cara pakai fitur | 0/8 | 8/8 | 8/8 |
| Gaya Bar-bar | 2/6 | 6/6 | 6/6 |
| Ketawa sambil mencatat | 0/2 | 2/2 | 2/2 |

Perbaikan susulan:
1. “ngewe yuk” dan “nonton bokep”: sisa kalimatnya (“yuk”, “nonton”) tidak bermakna sendiri, jadi dulu dijawab “belum
   paham”. Sekarang kata joroknya yang dijawab.
2. “5” dalam tebak angka dan “angka acak 1 sampai 100” dulu dibaca sebagai nominal. Sekarang angkanya dibaca sebagai
   tebakan atau rentang.

Dua kasus yang tetap gagal, dibiarkan apa adanya:
- **k7 “goblog sia”**: dijawab sebagai ejekan (maksud *angry*), bukan kata kasar. Jawabannya tetap mengikuti gaya
  (Sopan: “Astaghfirullah, jangan kasar-kasar ya…”), tapi maksudnya berbeda dari yang ditulis di set uji.
- **s10 tebak angka di gaya Gaul**: jawabannya “angkanya lebih gede”. Itu benar, tapi pola uji hanya menerima kata
  “besar” atau “kecil”.

## Uji lama, setelah 8.1

Selama pengerjaan sempat ada kemunduran. “kamu bisa ngapain aja” terbaca obrolan, “gajian kpn sih” terbaca kabar
gembira, “kamu ai beneran?” terbaca obrolan, “gimana caranya biar bisa nyisihin uang” terbaca cara pakai, dan “aku
bosen” kehilangan tawarannya. Semua sudah diperbaiki sebelum rilis.

| Set | 8.0 | 8.1 |
|---|---|---|
| Chat heldout / heldout2 / heldout3 | 47/48 · 50/50 · 71/71 | 47/48 · 50/50 · 71/71 |
| Percakapan dev / held-out | 11/11 · 13/13 | 11/11 · 13/13 |
| Dokumen latihan dev / held-out (v79) | 306/306 · 197/197 | 306/306 · 197/197 |
| Humor & menu (v80) | 41/41 | 41/41 |
| Catat V4 (4 set) | 83/83 · 44/44 · 18/18 · 14/14 | sama |
| Shadow Catat (1.368 kalimat) | – | tidak ada perubahan baru |
| `npm test` | 775 | 781 lulus, 0 gagal |

## Batasan

- Kata kasar dikenali dari daftar kata. Penulisan yang disamarkan dikenali bila setidaknya dua hurufnya terlihat
  (“a*jing”), dan setiap tanda * mewakili satu atau dua huruf.
- Gaya Bar-bar mengumpat untuk bercanda dan menyindir kebiasaan belanja. Ia tidak menyerang siapa orangnya, dan kata
  jorok tetap tidak diulang. Kalimat yang belum punya versi Bar-bar memakai kalimat gaya Gaul.
- Jawaban “cara pakai” diambil dari teks Tanya Jawab yang ada. Fitur yang belum ditulis di sana tidak bisa dijawab.
- Hasil permainan dan pilihan “pilihin dong” diambil dari hash pesan dan giliran, bukan acak sungguhan.
- Uji ditulis oleh penulis yang sama dengan mesinnya, jadi mungkin punya titik buta yang sama.
