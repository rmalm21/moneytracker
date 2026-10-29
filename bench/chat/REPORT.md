# Asisten chat (rilis 7.6)

Semua jalan di HP, tanpa internet dan tanpa layanan AI di awan. Ada tiga lapis:

1. **Catat otomatis (V4)** dipakai apa adanya untuk mencatat, menjawab pertanyaan, serta mengubah atau menghapus
   catatan terakhir.
2. **Aturan percakapan** (`lib/chat/engine.ts`) menangani konteks obrolan, tanya balik, kalkulator, ringkasan,
   "boleh beli?", tips, gaya bahasa, dan template.
3. **Model maksud pesan** (`lib/chat/model.ts`): NLP.js, pustaka JavaScript khusus chatbot yang jalan offline. Model ini
   dilatih saat build dari `lib/chat/corpus.ts` (221 kalimat, 14 maksud, 100 KB) dan hanya membaca pesan yang tidak
   tertangkap aturan. Model yang sama dipakai Catat otomatis untuk pendapat kedua.

Selain itu, asisten **belajar dari pemakai**. Kalau ia belum paham lalu kamu menulis ulang, ungkapan pertama diingat di HP
ini, maksimal 60 ungkapan, dan bisa dihapus di pengaturan. Ini hanya berlaku untuk maksud tanpa nominal (ringkasan, tips,
bantuan, dan sejenisnya). Uang selalu dibaca ulang dari kalimatnya.

## Ukuran: maksud pesan di set uji terpisah (48 pesan)

`node bench/chat/run.mjs`. Set ini (`bench/chat/fixtures-heldout.mjs`) ditulis sebelum model dievaluasi dan tidak pernah
masuk korpus latihan.

| | Aturan saja | Aturan + model |
|---|---|---|
| **Percobaan pertama** (dibekukan: `FROZEN-heldout-first.md`) | 32/48 (67%) | 43/48 (90%) |
| Setelah perbaikan post-hoc | 38/48 (79%) | 47/48 (98%) |

- Pada percobaan pertama model memutuskan 11 pesan, dan tidak ada yang salah.
- Perbaikan post-hoc dibuat setelah melihat set uji, jadi angka 98% sudah dibantu set itu. Isinya: aturan "cara pakai …",
  "kalau checkout … aman?", "cukup nggak uangku sampe gajian", dan "boleh beli" tanpa harga dijawab dengan menanyakan
  harganya.
- Sisa 1 salah: "aku boros nggak sih" dijawab dengan tips, padahal di set ditandai sebagai ringkasan. Tips juga masih
  masuk akal.

## Semua template dicoba

Semua template dijalankan lewat mesin chat dan Catat otomatis pada data contoh, dan semuanya menghasilkan aksi atau
jawaban yang benar. Template ikut nama dompet pemakai: "pakai gopay" hanya muncul kalau dompet GoPay memang ada.
Sebelumnya, "transfer 500rb ke tabungan" terbaca sebagai pengeluaran pada akun tanpa dompet Tabungan.

## Kemampuan

| Kemampuan | Contoh |
|---|---|
| Tanya balik | "beli 25rb" → "Masuk kategori apa?" + pilihan → "jajan" |
| Ubah kartu yang belum disimpan | "jadi 45rb", "pakai jago", "kemarin", "kategorinya jajan", "bagi 2 sama rina", "gak jadi" |
| Ubah atau hapus yang sudah disimpan | "jadi 50rb", "batalin yang tadi" (selalu dengan kartu konfirmasi) |
| Pertanyaan lanjutan | "pengeluaran makan bulan ini berapa" → "kalau bulan lalu?" → "kalau transport?" |
| Kalkulator | "hitung 128181 dibagi 3 dikali 2", "(50rb+30rb)/2", "dua puluh ribu dikali tiga" → "kalau dibagi 4?" |
| Ringkasan, boleh beli, tips | dari uang bebas, anggaran, dan pengeluaran sendiri |
| Gaya bahasa | Santai, Sopan, Singkat, Gaul; dipilih di pengaturan atau dengan "pakai bahasa formal" |
| Obrolan | salam (nama dan waktu), terima kasih, bantuan, contoh, balasan ramah kalau belum paham |

## Uji lain

- `tests/chat.test.mjs`: 12 tes, termasuk tanya balik, empat gaya bahasa, dan belajar dari pemakai.
- `npm test`: 738 lulus.
- Dicoba di aplikasi demo (emulator, akun demo): pertama kali dibuka (pilih gaya), tanya balik lalu isi, simpan, belajar,
  ganti gaya bahasa, template, pengaturan, lima tampilan, mode gelap, dan desktop.

## Kenapa bukan LLM sungguhan?

LLM yang jalan di browser (misalnya WebLLM atau transformers.js) butuh unduhan model sekitar 1–2 GB dan GPU. Itu
berat untuk HP, lambat saat pertama dibuka, dan boros kuota. NLP.js dipilih karena memang dibuat untuk chatbot, jalan
offline di HP, mendukung bahasa Indonesia, dan sudah ada di aplikasi. Kalau nanti dibutuhkan, LLM kecil bisa
ditambahkan sebagai pilihan yang diunduh atas izin pemakai.

## Ikut di 7.6 (Catat otomatis)

- "diskon 50% makan 80rb" → Rp40.000.
- "listrik 450rb sepertiga buat kosan sebelah", "wifi 300rb, rina bayar setengah" → Split Bill dengan bagian yang
  ditulis.
- Set latihan V4: 83/83 (x12–x15 ditambahkan sesudahnya). Set uji tersembunyi V4 tetap 44/44. Shadow 1.213 kalimat
  lama: tidak ada arti uang yang berubah.
