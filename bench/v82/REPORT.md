# Laporan 8.2: perbaikan menyeluruh

Isi 8.2: pemeriksaan semua kalimat uji lama terhadap chat, pengecekan tiap menu, pengecekan tampilan di aplikasi
demo (emulator Firebase lokal, bukan data asli), lalu perbaikan semua yang ditemukan.

## Cara memeriksa

- `node bench/v82/chat-shadow.mjs`: 1.712 kalimat dari semua uji lama (Catat otomatis, chat, percakapan, dokumen
  latihan), masing-masing dikirim sendiri ke chat 8.0 dan chat sekarang. Daftar keluarannya berisi kalimat yang
  berubah maksud atau catatannya.
- Satu pertanyaan per menu untuk ke-25 menu (`$S/v82/ask-full.mjs`, di luar repo).
- Aplikasi demo dibuka di Chromium 390 × 844 dan 360 px: template, pilihan gaya, tombol menu, permainan, kartu,
  saran di atas kolom chat, dan error di konsol.

## Yang ditemukan dan diperbaiki

| Temuan | Sebelum | Sekarang |
|---|---|---|
| “pemasukan bulan ini berapa” (juga di kotak Catat otomatis) | dijawab pengeluaran | dijawab pemasukan. Penyebabnya aturan 7.9 “masukin X aja” yang ikut terpicu di dalam kata “pe**masukan**” |
| “kategori aku apa aja” | menyiapkan kategori baru | daftar kategori + tombol |
| “total utang piutang” | menyiapkan piutang baru | utang, piutang, dan selisih bersih |
| “terakhir makan apa”, “terakhir beli apa” | total siklus | catatan terakhir: apa, di mana, berapa, kapan |
| “transaksi terakhir apa”, “transaksi kemarin apa aja”, “catatan minggu ini apa saja” | tidak paham / dijawab “aku asisten…” | daftar transaksi |
| “tagihan minggu depan”, “tagihan bulan depan” | tagihan yang sudah lewat / menyiapkan catatan | rutin, rencana, dan cicilan yang akan datang |
| “perkiraan uang akhir bulan”, “akhir bulan sisa berapa” | menyiapkan catatan kalender | perkiraan sisa uang bebas saat gajian + tombol Proyeksi |
| “ada draf yang perlu dikonfirmasi?” | tidak paham | jumlah dan daftarnya |
| “split bill yang belum lunas” | tidak paham | patungan yang belum dibayar |
| “insight bulan ini apa”, “laporan bulan ini”, “analisis pengeluaran aku” | dijawab “aku asisten…” / tidak paham | ringkasan + tombol ke menunya |
| “kekayaan bersih aku berapa”, “dana darurat cukup berapa bulan” | tidak ada | dijawab dari dompet, utang, piutang, dan pengeluaran 3 bulan |
| “aku boros nggak sih” | roasting saja (uji chat lama gagal sejak 8.0) | kartu ringkasan + vonis sesuai gaya |
| Kartu Catat otomatis | catatan seperti kembalian tersimpan tapi tidak terlihat | baris “Catatan” di kartu |
| Saran di atas kolom chat setelah permainan | tetap “Suit lagi / Tebak angka” | berganti mengikuti topik |
| Titik hijau di kepala chat | lingkarannya terpotong di kiri | utuh |

Dua salah tangkap yang sempat dibuat oleh perbaikan di atas ditemukan oleh pemeriksaan 1.712 kalimat dan dibetulkan
sebelum rilis: “stop langganan spotify bulan depan” (perintah, bukan pertanyaan tagihan) dan “pengeluaran 7 hari
terakhir berapa” (periode, bukan transaksi terakhir).

## Hasil

| Uji | 8.1 | 8.2 |
|---|---|---|
| Pemeriksaan 1.712 kalimat (berubah dibanding 8.0) | 2 | 5, semuanya perbaikan: wkwk/hehe tidak ikut dicatat (2), “pengeluaran paling gede bulan ini apa” kini dijawab, “laporan keuangan singkat dong” kini dijawab, “aku boros nggak sih” kini ringkasan |
| Chat heldout / heldout2 / heldout3 | 47/48 · 50/50 · 71/71 | **48/48** · 50/50 · 71/71 |
| Percakapan dev / held-out | 11/11 · 13/13 | sama |
| Dokumen latihan dev / held-out | 306/306 · 197/197 | sama |
| Humor & menu (v80) | 41/41 | 40/41: lihat catatan di bawah |
| Set 8.1 (v81) | 66/68 | 66/68 |
| Catat V4 (4 set), shadow Catat 1.368 kalimat | lulus, 4 perubahan disengaja | sama |
| Struk: 9 kirimanmu, 90 + 90 buatan, 262 lama | 9/9 · 90/90 · 90/90 · 0 berubah | sama |
| `npm test` | 781 | 785 lulus, 0 gagal |

Catatan v80 o2: “saya boros nggak?” di set humor 8.0 diharapkan berlabel *roast*. Set chat lama dari 7.6 (ditulis
terpisah, dan dibekukan lebih dulu) mengharapkan *summary* untuk “aku boros nggak sih”. Keduanya tidak bisa sama-sama
lulus, jadi 8.2 mengikuti set yang lebih lama. Jawabannya tetap berisi vonis sesuai gaya (Sopan tanpa “wkwk”).
