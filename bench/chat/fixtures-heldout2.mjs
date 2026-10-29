/**
 * Chat intents, held-out round 2 (7.7): written before the larger corpus and the new skills were built, and never
 * added to lib/chat/corpus.ts. One message each, no conversation before it. `intent` is lib/chat/engine.ts ChatIntent.
 * Covers the 7.6 meanings in new words and the 7.7 skills (budget overview, payday, mood, small talk, goals).
 */
export const cases = [
  // Talk.
  { id: 'g1', text: 'halooo kak asisten', intent: 'greet' }, { id: 'g2', text: 'malam kak, masih bangun?', intent: 'greet' }, { id: 'g3', text: 'hai hai dompet ajaib', intent: 'greet' },
  { id: 'k1', text: 'oke thank you ya', intent: 'thanks' }, { id: 'k2', text: 'makasih udah dibantu', intent: 'thanks' },
  { id: 'h1', text: 'gimana sih cara nyatet di sini', intent: 'help' }, { id: 'h2', text: 'kamu bisa ngapain aja emangnya', intent: 'help' }, { id: 'h3', text: 'tolong ajarin pake fitur chat', intent: 'help' },
  { id: 'a1', text: 'kamu ai beneran?', intent: 'about' }, { id: 'a2', text: 'chat ini nyimpen data aku di server ga', intent: 'about' },
  { id: 'e1', text: 'mau liat contoh-contohnya', intent: 'examples' },
  { id: 'm1', text: 'apa kabar kamu hari ini', intent: 'smalltalk' }, { id: 'm2', text: 'lagi ngapain', intent: 'smalltalk' }, { id: 'm3', text: 'aku bosen nih', intent: 'smalltalk' },
  // Mood.
  { id: 'o1', text: 'aduh aku lagi bokek banget', intent: 'mood' }, { id: 'o2', text: 'pusing mikirin tagihan bulan ini', intent: 'mood' }, { id: 'o3', text: 'duitku abis terus nih sedih', intent: 'mood' },
  { id: 'o4', text: 'stres banget sama keuangan', intent: 'mood' },
  // Money overview.
  { id: 's1', text: 'kondisi duitku sekarang gimana', intent: 'summary' }, { id: 's2', text: 'tolong rangkum pengeluaranku periode ini', intent: 'summary' }, { id: 's3', text: 'laporan keuangan singkat dong', intent: 'summary' },
  { id: 'b1', text: 'anggaranku gimana', intent: 'budget' }, { id: 'b2', text: 'cek semua budget dong', intent: 'budget' }, { id: 'b3', text: 'budget mana yang udah mau habis', intent: 'budget' },
  { id: 'p1', text: 'berapa hari lagi gajian', intent: 'payday' }, { id: 'p2', text: 'kapan gajian lagi ya', intent: 'payday' }, { id: 'p3', text: 'masih lama ga ke tanggal gajian', intent: 'payday' },
  { id: 'f1', text: 'aman nggak kalau aku beli kamera 4jt', intent: 'afford' }, { id: 'f2', text: 'mampu ga ya beli sepatu lari 900rb', intent: 'afford' }, { id: 'f3', text: 'kalau beli tiket pesawat 1,8jt masih aman?', intent: 'afford' },
  { id: 't1', text: 'kasih aku tips hemat dong', intent: 'tips' }, { id: 't2', text: 'gimana caranya biar bisa nyisihin uang', intent: 'tips' }, { id: 't3', text: 'saran ngatur keuangan buat anak kos', intent: 'tips' },
  { id: 'n1', text: 'aku pengen nabung buat nikah', intent: 'goal' }, { id: 'n2', text: 'mau mulai nabung buat beli motor', intent: 'goal' }, { id: 'n3', text: 'pengen punya dana darurat', intent: 'goal' },
  // Calculator.
  { id: 'c1', text: 'hitungin 1,2jt dibagi 6', intent: 'calc' }, { id: 'c2', text: 'berapa 35% dari 400rb', intent: 'calc' }, { id: 'c3', text: '(120rb + 80rb) x 3', intent: 'calc' },
  // Records and questions.
  { id: 'r1', text: 'beli kopi susu 24rb pakai gopay', intent: 'plan' }, { id: 'r2', text: 'terima freelance 2,5jt', intent: 'plan' }, { id: 'r3', text: 'pizza 150rb dibagi tiga sama rina dan budi', intent: 'plan' },
  { id: 'r4', text: 'isi bensin 40rb tadi pagi', intent: 'plan' },
  { id: 'q1', text: 'pengeluaran hari ini berapa', intent: 'question' }, { id: 'q2', text: 'saldo dompetku berapa aja', intent: 'question' }, { id: 'q3', text: 'berapa kali jajan minggu ini', intent: 'question' },
  { id: 'q4', text: 'kapan terakhir beli kopi', intent: 'question' },
  // Undo, voice.
  { id: 'u1', text: 'yang barusan dihapus aja', intent: 'undo' }, { id: 'v1', text: 'ngomongnya pakai bahasa baku dong', intent: 'voice' }, { id: 'v2', text: 'balas pendek pendek aja', intent: 'voice' },
];
