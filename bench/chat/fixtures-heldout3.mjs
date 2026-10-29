/**
 * Chat intents, held-out round 3 (7.8, "chatbot v2"): written before the v2 corpus, rules and skills were built, and
 * never added to lib/chat/corpus.ts. One message each, no conversation before it. `intent` is lib/chat/engine.ts
 * ChatIntent. Covers the new personality (jokes, banter, anger, venting, serious, teaching, apologies) and every older
 * meaning again in new words, typos and slang ("paham abcde maksud user").
 */
export const cases = [
  // Jokes and humour asked for.
  { id: 'j1', text: 'ceritain lelucon dong', intent: 'joke' }, { id: 'j2', text: 'kasih jokes receh yg lucu', intent: 'joke' },
  { id: 'j3', text: 'pantun dong biar semangat', intent: 'joke' }, { id: 'j4', text: 'tebak tebakan yuk', intent: 'joke' },
  { id: 'j5', text: 'bikin aku ketawa dong', intent: 'joke' }, { id: 'j6', text: 'ada lawakan soal duit ga', intent: 'joke' },
  { id: 'j7', text: 'gombalin aku dong', intent: 'joke' },
  // Banter: laughing, teasing, playing along.
  { id: 'b1', text: 'wkwkwk receh bgt', intent: 'banter' }, { id: 'b2', text: 'garing ah', intent: 'banter' },
  { id: 'b3', text: 'hahaha bisa aja kamu', intent: 'banter' }, { id: 'b4', text: 'kamu ngelawak ya', intent: 'banter' },
  { id: 'b5', text: 'anjay lucu jg', intent: 'banter' }, { id: 'b6', text: 'jayus banget sumpah', intent: 'banter' },
  // Anger at the assistant.
  { id: 'a1', text: 'kamu bego ya', intent: 'angry' }, { id: 'a2', text: 'payah banget sih botnya', intent: 'angry' },
  { id: 'a3', text: 'kok salah mulu sih', intent: 'angry' }, { id: 'a4', text: 'ga guna lu', intent: 'angry' },
  { id: 'a5', text: 'nyebelin bgt asli', intent: 'angry' }, { id: 'a6', text: 'aku kesel sama kamu', intent: 'angry' },
  { id: 'a7', text: 'dasar bot lemot', intent: 'angry' },
  // Venting about life (not money).
  { id: 'c1', text: 'aku lagi patah hati', intent: 'curhat' }, { id: 'c2', text: 'capek banget sama kerjaan hari ini', intent: 'curhat' },
  { id: 'c3', text: 'abis berantem sama pacar', intent: 'curhat' }, { id: 'c4', text: 'skripsiku gak kelar kelar', intent: 'curhat' },
  { id: 'c5', text: 'rasanya sendirian terus', intent: 'curhat' }, { id: 'c6', text: 'boleh curhat ga', intent: 'curhat' },
  { id: 'c7', text: 'ortu lagi marahin aku terus', intent: 'curhat' }, { id: 'c8', text: 'hari ini berat banget', intent: 'curhat' },
  // Asking to be serious.
  { id: 's1', text: 'serius dong jangan bercanda', intent: 'serious' }, { id: 's2', text: 'oke sekarang mode serius ya', intent: 'serious' },
  { id: 's3', text: 'udah becandanya, fokus', intent: 'serious' },
  // Teaching the assistant.
  { id: 't1', text: 'aku mau ngajarin kamu', intent: 'teach' }, { id: 't2', text: 'kalau aku bilang boncos artinya boros', intent: 'teach' },
  { id: 't3', text: 'inget ya, cekidot itu artinya ringkasan', intent: 'teach' }, { id: 't4', text: 'ajarin kamu boleh?', intent: 'teach' },
  // Apologies.
  { id: 'p1', text: 'maaf ya tadi aku kasar', intent: 'apology' }, { id: 'p2', text: 'sori td kelepasan', intent: 'apology' },
  { id: 'p3', text: 'maafin aku ya bot', intent: 'apology' },
  // Older meanings in new words, typos and slang.
  { id: 'g1', text: 'pagiii kakk', intent: 'greet' }, { id: 'g2', text: 'helo helo', intent: 'greet' },
  { id: 'k1', text: 'makasi bnyk ya', intent: 'thanks' }, { id: 'k2', text: 'thx bgt bro', intent: 'thanks' },
  { id: 'h1', text: 'km bs ngapain aj sih', intent: 'help' }, { id: 'h2', text: 'gmn cara pakenya', intent: 'help' },
  { id: 'ab1', text: 'kamu tuh sebenernya apa', intent: 'about' },
  { id: 'e1', text: 'liat template nya dong', intent: 'examples' },
  { id: 'm1', text: 'gmn kabarnya hari ini', intent: 'smalltalk' }, { id: 'm2', text: 'lg ngapain km', intent: 'smalltalk' },
  { id: 'o1', text: 'duit gw tinggal dikit bgt', intent: 'mood' }, { id: 'o2', text: 'pusing tagihan numpuk', intent: 'mood' },
  { id: 'su1', text: 'rangkuman keuangan bln ini dong', intent: 'summary' }, { id: 'su2', text: 'kondisi dompetku gmn', intent: 'summary' },
  { id: 'bu1', text: 'cek anggaran semua dong', intent: 'budget' }, { id: 'bu2', text: 'budget gw aman ga', intent: 'budget' },
  { id: 'pd1', text: 'brp hari lg gajian', intent: 'payday' }, { id: 'pd2', text: 'gajian kpn sih', intent: 'payday' },
  { id: 'f1', text: 'aman ga kalo beli hp 2jt', intent: 'afford' }, { id: 'f2', text: 'boleh ga jajan boba 30rb', intent: 'afford' },
  { id: 'ti1', text: 'tips biar ga boros dong', intent: 'tips' }, { id: 'ti2', text: 'saran ngatur duit', intent: 'tips' },
  { id: 'n1', text: 'pengen nabung buat liburan ke bali', intent: 'goal' }, { id: 'n2', text: 'mau bikin dana darurat', intent: 'goal' },
  { id: 'ca1', text: 'itungin 75rb x 4', intent: 'calc' }, { id: 'ca2', text: 'brp 10% dari 3jt', intent: 'calc' },
  { id: 'r1', text: 'jajan seblak 15rb', intent: 'plan' }, { id: 'r2', text: '290k hokben kemarin gue cuma 45k', intent: 'plan' },
  { id: 'r3', text: 'gajian 7jt masuk bca', intent: 'plan' },
  { id: 'q1', text: 'pengeluaran minggu ini brp', intent: 'question' }, { id: 'q2', text: 'saldo gopay brp', intent: 'question' },
  { id: 'u1', text: 'hapus yg barusan aja', intent: 'undo' },
  { id: 'v1', text: 'ngomong pake bahasa gaul dong', intent: 'voice' },
];
