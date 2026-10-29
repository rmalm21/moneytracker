/**
 * Training sentences for the chat intent model (scripts/build-chat-model.mjs → lib/chat/chat-model.ts), all on the
 * device. The rules in lib/chat/engine.ts decide first; the model reads what the rules do not catch ("gmn kondisi
 * duitku", "duitku cukup ga buat ps5"). Numbers and names are replaced by placeholders so the model learns the shape.
 * The held-out sentences in bench/chat/fixtures-heldout.mjs are never added here.
 */
export type ChatModelIntent = 'greet' | 'thanks' | 'help' | 'about' | 'examples' | 'summary' | 'afford' | 'tips' | 'calc' | 'cancel' | 'undo' | 'record' | 'question' | 'style';

export const CHAT_CORPUS: Record<ChatModelIntent, string[]> = {
  greet: ['halo', 'hai', 'hi', 'helo kak', 'halo min', 'pagi', 'selamat pagi', 'siang kak', 'malam bot', 'assalamualaikum', 'hey asisten', 'hai dompet', 'halo apa kabar', 'permisi', 'met pagi', 'selamat malam', 'hai hai', 'halo bro', 'pagi pagi', 'yo'],
  thanks: ['makasih', 'makasih ya', 'terima kasih', 'thanks', 'thank you', 'thx', 'tq', 'makasih banyak', 'mksh', 'trims', 'oke makasih', 'sip makasih', 'tengkyu', 'suwun', 'nuhun', 'makasih bantuannya', 'terima kasih banyak ya', 'thanks bro'],
  help: ['bisa apa aja', 'kamu bisa apa', 'bantuan', 'help', 'cara pakai', 'gimana cara pakainya', 'fitur apa aja', 'apa aja yang bisa dilakukan', 'bisa bantu apa', 'tolong jelasin fiturnya', 'aku harus ngetik apa', 'ini gimana makenya', 'cara nyatet gimana', 'bisa ngapain aja', 'panduan', 'menu bantuan', 'gimana caranya', 'apa yang bisa kamu lakukan', 'kemampuanmu apa aja', 'bingung pakainya'],
  about: ['kamu siapa', 'siapa kamu', 'kamu itu apa', 'ini apa', 'kamu robot ya', 'kamu ai ya', 'kamu manusia bukan', 'ini chat apa', 'asisten apa ini', 'kamu pakai internet ga', 'datanya dikirim ke mana', 'aman ga datanya', 'kamu chatgpt ya'],
  examples: ['contoh', 'kasih contoh', 'contohnya', 'template', 'minta contoh dong', 'contoh kalimat', 'ide kalimat', 'contoh catatan', 'kasih ide', 'template apa aja', 'liat contoh', 'contoh chat'],
  summary: ['ringkasan bulan ini', 'rangkuman', 'rekap minggu ini', 'kondisi keuanganku gimana', 'gimana keuanganku', 'keuangan aku aman ga', 'laporan singkat dong', 'status keuangan', 'gmn kondisi duitku', 'duitku gimana', 'keuanganku bulan ini', 'rekap pengeluaran', 'overview keuangan', 'aman ga sampai gajian', 'cukup ga uangku sampai gajian', 'sisa duitku berapa', 'cashflow bulan ini', 'ringkas aja keuanganku', 'gimana kondisi dompetku', 'rangkum bulan ini dong', 'keadaan uangku', 'aku boros ga bulan ini'],
  afford: ['boleh beli sepatu 500rb ga', 'aman ga beli hp 3jt', 'bisa beli laptop 7jt ga', 'sanggup ga beli ps5', 'duitku cukup ga buat beli tas 400rb', 'kalau aku beli baju 300rb gimana', 'mau checkout keranjang 250rb aman ga', 'boleh jajan 100rb ga', 'aman nggak nonton konser 1jt', 'kuat ga liburan 2jt', 'bisa ga aku traktir temen 300rb', 'pengen beli headset 600rb boleh ga', 'aman kah beli skincare 200rb', 'mampu ga beli motor', 'bisa ambil cicilan 500rb sebulan ga', 'oke ga beli kopi tiap hari', 'kalau langganan netflix aman ga', 'boleh ga belanja online 150rb'],
  tips: ['kasih tips hemat', 'tips hemat dong', 'saran keuangan', 'gimana biar hemat', 'cara nabung', 'aku boros banget gimana', 'kasih saran', 'tips ngirit', 'gimana caranya bisa nabung', 'biar ga boros gimana', 'tips atur uang', 'saran biar uang cukup', 'gimana ngatur gaji', 'cara mengurangi jajan', 'tips biar akhir bulan aman', 'aku pengen hemat'],
  calc: ['hitung 128181 dibagi 3 dikali 2', 'berapa 15 persen dari 2jt', 'hitungin 50rb tambah 30rb', '12 x 7', 'berapa 100rb dibagi 4', 'kalkulator 2500 kali 12', 'itungin 1jt kurang 350rb', 'berapa setengah dari 80rb', '250rb + 175rb berapa', 'hasil 7 dibagi 2', 'hitung dong 45rb kali 3', 'berapa 20 persen dari 150rb'],
  cancel: ['batal', 'gak jadi', 'nggak jadi', 'ga usah', 'cancel', 'skip aja', 'jangan dicatat', 'hapus aja', 'batalin', 'enggak jadi deh', 'gajadi', 'udah ga usah', 'lewati', 'nggak usah dicatat'],
  undo: ['batalin yang tadi', 'hapus yang barusan', 'hapus catatan terakhir', 'undo', 'yang tadi salah hapus aja', 'batalkan transaksi terakhir', 'hapus transaksi yang barusan', 'yang terakhir dihapus aja', 'cancel yang tadi', 'tarik lagi yang barusan'],
  record: ['makan siang 35rb', 'kopi 22rb pakai gopay', 'bensin 50rb', 'gaji 8jt masuk bca', 'transfer 500rb ke tabungan', 'beli pulsa 50rb', 'parkir 5rb', 'bayar listrik 300rb', 'jajan bakso 15rb tadi', 'belanja indomaret 87rb', 'grab ke kantor 25rb', 'terima transferan 200rb dari ibu', 'bayar kos 1,5jt', 'nonton 50rb kemarin', 'hokben dibagi dua sama ferdi', 'pinjem 100rb ke budi', 'bayar utang ke rudi 200rb', 'anggaran makan 2jt', 'ingatkan bayar wifi tanggal 5', 'top up gopay 100rb'],
  question: ['pengeluaran bulan ini berapa', 'berapa habis buat makan minggu ini', 'kapan terakhir isi bensin', 'saldo semua dompet berapa', 'sisa anggaran makan berapa', 'pemasukan bulan lalu berapa', 'paling banyak keluar buat apa', 'rata rata jajan per hari berapa', 'berapa kali ke starbucks bulan ini', 'utangku ke siapa aja', 'total transfer ke gopay', 'pengeluaran terbesar bulan ini apa', 'berapa uang di bca', 'dibanding bulan lalu gimana pengeluaranku'],
  style: ['ngomong santai aja', 'pakai bahasa formal', 'bahasanya yang sopan dong', 'jawabnya singkat aja', 'pakai lo gue aja', 'jangan kaku', 'bahasa baku ya', 'gaya bahasa santai', 'ganti gaya bahasa', 'jawab yang pendek', 'ngobrol kayak temen aja', 'pakai anda saja'],
};

/** Numbers and amounts as one token, so "beli hp 3jt" and "beli tas 400rb" look alike to the model. */
export const chatFeature = (text: string) => text.toLocaleLowerCase('id-ID')
  .replace(/(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta|m)\b/g, ' nominal ')
  .replace(/\d[\d.,]*/g, ' angka ')
  .replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
