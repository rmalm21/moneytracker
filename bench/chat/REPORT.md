# Asisten chat (rilis 7.6)

Semua dibaca di HP. Catat otomatis (V4) dipakai apa adanya untuk mencatat, menjawab pertanyaan, dan mengubah atau
menghapus catatan terakhir. Mesin chat (`lib/chat/engine.ts`) menambahkan hal-hal yang tidak bisa dilakukan kotak
sekali-tulis:

| Kemampuan | Contoh |
|---|---|
| Ubah kartu yang belum disimpan | "jadi 45rb", "pakai jago", "kemarin", "kategorinya jajan", "bagi 2 sama rina", "gak jadi" |
| Ubah atau hapus catatan yang sudah disimpan | "jadi 50rb", "pindah ke kemarin", "batalin yang tadi" (selalu dengan kartu konfirmasi) |
| Pertanyaan lanjutan | "pengeluaran makan bulan ini berapa" → "kalau bulan lalu?" → "kalau transport?" |
| Kalkulator | "hitung 128181 dibagi 3 dikali 2", "(50rb+30rb)/2", "12 x 7", "dua puluh ribu dikali tiga" → "kalau dibagi 4?" |
| Ringkasan | "ringkasan bulan ini": pemasukan, pengeluaran, kategori terbesar, anggaran hampir habis, uang bebas, jatah harian |
| Boleh beli? | "aman nggak beli sepatu 500rb?": uang bebas, sisa setelah beli, jatah harian sebelum/sesudah, sisa anggaran kategorinya |
| Tips | "kasih tips hemat": kategori terbesar, anggaran terpakai, jajan kecil, batas harian sampai gajian |
| Obrolan | salam (dengan nama dan waktu), terima kasih, "bisa apa aja?", "contoh", dan balasan ramah kalau tidak paham |

Dompet yang belum ada ("pakai ovo" padahal OVO tidak ada) dijawab dengan daftar dompet yang ada, tidak ditebak.

## Uji

- `tests/chat.test.mjs`: 9 tes (kalkulator, percakapan ubah-kartu, dompet tidak ada, ubah/hapus setelah simpan,
  pertanyaan lanjutan, hitungan lanjutan tidak tertukar dengan pertanyaan, ringkasan/boleh beli/tips dari data contoh,
  salam/bantuan/tidak paham, riwayat 7/14/30 hari dan halaman 10 pesan).
- Dicoba di aplikasi demo (emulator, akun demo): catatan diubah lewat chat lalu disimpan, Split Bill tersimpan dengan
  piutang, Tanya dan tanya lanjutan, ringkasan, lima tampilan, mode gelap, dan desktop 1280 px.
- Contoh di tes ditulis bersamaan dengan mesinnya. Ini uji perilaku, bukan ukuran netral seperti set tersembunyi Catat V4.

## Ikut di 7.6 (Catat otomatis)

- "diskon 50% makan 80rb" → Rp40.000. Persen sebelum harga kini dipindah ke belakang harga lalu dihitung.
- "listrik 450rb sepertiga buat kosan sebelah", "wifi 300rb, rina bayar setengah", "token 200rb, 50rb nya ditanggung
  tetangga" → Split Bill dengan bagian yang ditulis; bagian mereka jadi piutang. Menraktir ("setengahnya buat traktir
  rina") tetap dibaca sebagai bagi kategori.
- Set latihan V4: 83/83 (4 kalimat baru x12–x15 ditambahkan sesudahnya). Set uji tersembunyi tetap 44/44. Shadow 1.213
  kalimat lama: tidak ada arti uang yang berubah.
