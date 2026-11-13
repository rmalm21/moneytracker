# Laporan 10.0: Asisten chat 3.0

Semua jalan di HP, tanpa AI di internet, tanpa unggahan. Tidak ada yang tersimpan sendiri: tiap kartu tetap menunggu
Simpan.

## Yang baru

1. **Ngerti banyak teks.** Salah ketik, singkatan, bahasa gaul, bahasa daerah, dan campur Inggris dibaca dulu sebelum
   aturan chat bekerja (`lib/chat/understand.ts`, `lib/chat/feature.ts`). Contohnya:
   - singkatan: bkin, mo, pgn/pngen, bajet/budjet/bujet, kluar, ngebatesin, ngerem, gaskeun;
   - Betawi: udeh, kagak, gimane;
   - "where did my money go", "duit aye berape", "boleh jajan brp hari ini", "sehari gw biasanya abis brp";
   - "ganti jd 40rb" pada kartu yang masih terbuka.
2. **Ngerti tujuan walau ditulis beda** (`lib/chat/goals.ts`): anggaran, dompet, tujuan dana, jadwal rutin, kategori,
   wish list, Split Bill, Scan struk, Impor, PIN, tema, dan "mulai dari nol".
   - Yang belum lengkap ditanya satu per satu di chat, dengan pilihan cepat dan tombol ke formulirnya. Tombol itu
     langsung membuka form baru di menu tujuan.
   - Yang sudah lengkap langsung jadi kartu, misalnya "bikinin bajet makan 1,5jt" atau "bikinin jadwal bayar kos tiap
     tgl 5 1,2jt".
   - "Budget jajan aman ga?" menyebut anggaran induknya. Kalau jajan belum punya anggaran, chat menawarkan untuk
     memasangnya.
3. **Komentar setelah Simpan** (`lib/chat/comment.ts`, `commentOnSaved`), mengikuti gaya bahasa yang dipilih:
   - sedekah dan zakat, nabung, bayar cicilan, dan pemasukan dipuji;
   - jajan yang sama berkali-kali dalam satu siklus diomelin;
   - anggaran yang baru jebol, atau pengeluaran besar, diingatkan.

   Komentar hanya muncul kalau memang pas. Bisa dimatikan di Pengaturan chat → "Komentar setelah mencatat" (bawaannya
   nyala, tersimpan di HP).
4. **Interaktif dan berkesinambungan.** Jawaban pendek ("jajan", "300rb aja", "gak jadi", "gas") dibaca dari pertanyaan
   terakhir, dan tawaran asisten bisa diiyakan.
   - Alurnya selesai begitu kartunya disimpan atau dibatalkan.
   - Kalimat catatan yang lengkap tidak pernah dianggap jawaban alur. Bug ini ditemukan saat demo di aplikasi (lihat
     di bawah).
5. **Saran nyata dan fitur yang pas** (`lib/chat/advice.ts`), dihitung dari catatan sendiri:
   - uang sisa sampai gajian (jatah per hari), bagi gaji 50/30/20 dalam rupiah, dana darurat ideal;
   - sering lupa nyatet (Pengingat), malas ngetik (kalimat sekaligus, Scan, Impor), teman ngutang (Piutang, Split Bill);
   - uang lari ke mana, langganan, belanja impulsif (aturan 24 jam, Wish list), investasi tanpa menyebut produk;
   - "aku boros banget ya".

## Hasil uji (bench/v100)

Dua set baru, masing-masing punya bagian dev (dipakai selama membangun) dan held-out (dijalankan sekali di akhir,
hasil pertamanya dibekukan).

| Set | 9.10 | 10.0 percobaan pertama (beku) | 10.0 akhir |
|---|---|---|---|
| Asisten 3.0, dev (89) | 24 (27%) | dipakai membangun | 89 (100%) |
| Asisten 3.0, held-out (89) | 28 (31%) | **85 (96%)** | 88 (99%) |
| Bahasa sehari-hari, dev (84) | 33 (39%) | dipakai membangun | 84 (100%) |
| Bahasa sehari-hari, held-out (84) | 42 (50%) | **77 (92%)** | 84 (100%) |

Set bahasa sehari-hari ditambahkan di tengah 10.0 atas permintaan: "bahasanya diperluas jangan hanya bahasa baku namun
juga mengerti bahasa yang biasa dipakai orang". Gagal di percobaan pertama ada di `FROZEN-heldout-first.md` dan
`FROZEN-gaul-heldout-first.md`. Semuanya bug nyata dan sudah diperbaiki sesudahnya.

Sisa satu yang masih gagal di held-out Asisten 3.0: "kasih saran biar irit dong" dijawab dengan potongan 20% dari
kategori terbesar (dari data). Jawabannya bukan salah, hanya tidak memakai kata yang dicari tes.

## Uji lama (9.10 vs 10.0)

Sama persis dengan 9.10:
- Intent chat: held-out, held-out2, held-out3.
- Dialog: dev dan held-out.
- v83 dev (3.024), held-out (7.298), dan tulisan tangan (187).
- v84 dev, held-out, dan tulisan tangan.

Ada satu perubahan yang disengaja: v80 o4. Sindiran "ke-N kalinya kopi" dulu menempel di kartu. Sekarang sindiran itu
menjadi komentar setelah Simpan, supaya tidak dobel dan bisa dimatikan. Tes unit lamanya
(`tests/chat-fun.test.mjs`) disesuaikan.

Sapuan 1.368 kalimat dari semua set Catat otomatis lewat chat: rutenya sama dengan 9.10, kecuali 3 yang sengaja
diperbaiki:
- "paling boros di kategori apa bulan ini" sekarang dijawab per kategori;
- "sisa budget hiburan/nongkrong" sekarang bilang belum ada anggarannya dan menawarkan memasangnya.

## Demo di aplikasi (emulator)

13/13 cek lolos (`c10-*.png`):
- "bkin anggaran dong" → kategori → "275rb aja" → Simpan, dan anggarannya tersimpan;
- sedekah → Simpan → komentar apresiasi;
- saklar komentar dimatikan → tanpa komentar;
- "Buka form Anggaran" membuka form Anggaran baru;
- "gw boros bgt ya", "budget jajan aman ga", dan "sering lupa nyatet" dijawab.

Bug yang ditemukan demo dan sudah diperbaiki:
- **Alur nyangkut setelah kartu disimpan.** Kalimat berikutnya ("sedekah jumatan 20rb") terbaca sebagai nominal
  anggaran dan mengubah anggaran. Sekarang alur berhenti saat kartunya disimpan atau dibatalkan, dan kalimat catatan
  lengkap tidak pernah dianggap jawaban alur. Ada tesnya di `tests/chat-v100.test.mjs`.
- **Kartu mengubah anggaran induk diam-diam.** Di data yang "jajan"-nya bukan subkategori sendiri, "anggaran jajan"
  mengubah anggaran Makan yang sudah ada. Kartunya memang menulis "Ubah anggaran", dan sekarang chat juga
  mengatakannya terus terang.
- **"Budget jajan aman ga" di data seperti itu.** Sekarang anggarannya dicari lewat kategori yang dipakai Catat
  otomatis.
