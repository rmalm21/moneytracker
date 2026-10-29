/**
 * Chat intents, held-out: phrasings written before the model was evaluated and never added to lib/chat/corpus.ts.
 * One message each, no conversation before it. `intent` is what the assistant should do (lib/chat/engine.ts ChatIntent).
 */
export const cases = [
  // Talk.
  { id: 'g1', text: 'hallo kak', intent: 'greet' }, { id: 'g2', text: 'selamat siang bot', intent: 'greet' }, { id: 'g3', text: 'hai asistenku', intent: 'greet' },
  { id: 'g4', text: 'pagi min, apa kabar', intent: 'greet' },
  { id: 'k1', text: 'makasih banyak kak', intent: 'thanks' }, { id: 'k2', text: 'terimakasih ya bot', intent: 'thanks' }, { id: 'k3', text: 'wah makasih bantuannya', intent: 'thanks' },
  { id: 'h1', text: 'kamu bisa bantu apa aja sih', intent: 'help' }, { id: 'h2', text: 'aku bingung cara makenya', intent: 'help' }, { id: 'h3', text: 'apa aja fiturmu', intent: 'help' },
  { id: 'h4', text: 'jelasin dong cara pakai chat ini', intent: 'help' },
  { id: 'a1', text: 'kamu ini robot ya', intent: 'about' }, { id: 'a2', text: 'datanya aman kan ga dikirim', intent: 'about' },
  { id: 'e1', text: 'kasih contoh kalimat dong', intent: 'examples' }, { id: 'e2', text: 'ada template ga', intent: 'examples' },
  // Money overview.
  { id: 's1', text: 'gimana kondisi keuangan aku', intent: 'summary' }, { id: 's2', text: 'rekap bulan ini dong', intent: 'summary' }, { id: 's3', text: 'duitku masih aman ga', intent: 'summary' },
  { id: 's4', text: 'cukup nggak uangku sampe gajian', intent: 'summary' }, { id: 's5', text: 'overview keuanganku', intent: 'summary' }, { id: 's6', text: 'aku boros nggak sih', intent: 'summary' },
  { id: 'f1', text: 'aman ga kalau beli jaket 350rb', intent: 'afford' }, { id: 'f2', text: 'boleh nggak aku beli headphone 1,2jt', intent: 'afford' },
  { id: 'f3', text: 'kuat ga beli tiket konser 1,5jt', intent: 'afford' }, { id: 'f4', text: 'kalau checkout 400rb masih aman?', intent: 'afford' },
  { id: 'f5', text: 'sanggup gak ya liburan ke bali', intent: 'afford' },
  { id: 't1', text: 'tips ngatur duit dong', intent: 'tips' }, { id: 't2', text: 'gimana supaya nggak boros', intent: 'tips' }, { id: 't3', text: 'saran biar bisa nabung', intent: 'tips' },
  { id: 't4', text: 'cara hemat di akhir bulan', intent: 'tips' },
  // Calculator.
  { id: 'c1', text: 'hitung 75rb dikali 4', intent: 'calc' }, { id: 'c2', text: 'berapa 2,5jt dibagi 3', intent: 'calc' }, { id: 'c3', text: '300rb - 125rb', intent: 'calc' },
  { id: 'c4', text: 'itungin 10% dari 850rb', intent: 'calc' }, { id: 'c5', text: '45 x 12', intent: 'calc' },
  // Records and questions (handed to Catat otomatis).
  { id: 'r1', text: 'beli nasi padang 28rb', intent: 'plan' }, { id: 'r2', text: 'gojek ke stasiun 18rb pakai gopay', intent: 'plan' }, { id: 'r3', text: 'dapet bonus 1jt', intent: 'plan' },
  { id: 'r4', text: 'martabak 60rb bagi dua sama rina', intent: 'plan' }, { id: 'r5', text: 'bayar spotify 55rb', intent: 'plan' },
  { id: 'q1', text: 'berapa pengeluaran jajan minggu ini', intent: 'question' }, { id: 'q2', text: 'kapan terakhir bayar listrik', intent: 'question' },
  { id: 'q3', text: 'total belanja bulan lalu berapa', intent: 'question' },
  // Undo, voice.
  { id: 'u1', text: 'hapus aja catatan yang barusan', intent: 'undo' }, { id: 'u2', text: 'undo yang terakhir', intent: 'undo' },
  { id: 'v1', text: 'pakai bahasa yang lebih sopan ya', intent: 'voice' }, { id: 'v2', text: 'ngomongnya lo gue aja', intent: 'voice' }, { id: 'v3', text: 'jawab yang singkat aja', intent: 'voice' },
];
