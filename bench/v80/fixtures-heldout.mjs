/**
 * 8.0 — the chat's humour and its link to every menu. Written after the engine pieces were in place but before they
 * were tried on these sentences; the first run is frozen (FROZEN-heldout-first.md).
 * A case: `voice`, `ctx` ('full' | 'boros'), and turns { say, intent, match (pattern the reply must have),
 * notMatch, open (the menu the button goes to), record (true: a card to save) }.
 */
const V = ['sopan', 'santai', 'gaul', 'singkat'];
export const cases = [
  // Swearing, alone: the style decides.
  { id: 's1', voice: 'sopan', turns: [{ say: 'anjing', intent: 'swear', match: /astaghfirullah/i }] },
  { id: 's2', voice: 'sopan', turns: [{ say: 'bangsat lu', intent: 'swear', match: /astaghfirullah|kasar|dijaga/i }] },
  { id: 's3', voice: 'gaul', turns: [{ say: 'anjing lo', intent: 'swear', match: /wkwk|santai|ngegas|galak|bacot/i, notMatch: /maaf|mohon/i }] },
  { id: 's4', voice: 'santai', turns: [{ say: 'babi', intent: 'swear', notMatch: /astaghfirullah/i }] },
  { id: 's5', voice: 'singkat', turns: [{ say: 'asu', intent: 'swear' }] },
  { id: 's6', voice: 'gaul', turns: [{ say: 'jancok', intent: 'swear' }] },
  { id: 's7', voice: 'sopan', turns: [{ say: 'dasar setan', intent: 'swear', match: /astaghfirullah/i }] },
  // Vulgar: understood, never repeated.
  { id: 'v1', voice: 'gaul', turns: [{ say: 'memek', intent: 'swear', match: /jorok/i, notMatch: /memek/i }] },
  { id: 'v2', voice: 'sopan', turns: [{ say: 'ngentot', intent: 'swear', match: /astaghfirullah/i, notMatch: /ngentot/i }] },
  { id: 'v3', voice: 'santai', turns: [{ say: 'kontol lu', intent: 'swear', notMatch: /kontol/i }] },
  // Swearing with something to do: it is still done.
  { id: 'w1', voice: 'gaul', turns: [{ say: 'anjir bensin 50rb pake gopay', record: true }] },
  { id: 'w2', voice: 'sopan', turns: [{ say: 'bangsat parkir 5rb tunai', record: true, match: /kasar|dijaga|astaghfirullah/i }] },
  { id: 'w3', voice: 'santai', turns: [{ say: 'sialan pengeluaran bulan ini berapa', notMatch: /kasar amat|ngegas 😅 santai dulu, ada apa/i, intent: 'question' }] },
  // Laughing.
  { id: 'l1', voice: 'gaul', turns: [{ say: 'WKWKWKWKWK', intent: 'banter', match: /WKWK/ }] },
  { id: 'l2', voice: 'santai', turns: [{ say: 'hahahaha', intent: 'banter', match: /haha/i }] },
  { id: 'l3', voice: 'santai', turns: [{ say: 'awokawokawok', intent: 'banter' }] },
  { id: 'l4', voice: 'gaul', turns: [{ say: '🤣🤣🤣', intent: 'banter' }] },
  { id: 'l5', voice: 'santai', turns: [{ say: 'kasih jokes dong', intent: 'joke' }, { say: 'wkwkwk', intent: 'banter', match: /lagi/i }] },
  { id: 'l6', voice: 'sopan', turns: [{ say: 'xixixi', intent: 'banter', notMatch: /wkwk/i }] },
  // Riddles: the assistant's, then the person's.
  { id: 'r1', voice: 'santai', turns: [{ say: 'teka teki dong', intent: 'joke', match: /\?/ }, { say: 'gatau', intent: 'riddle', match: /jawabannya/i }] },
  { id: 'r2', voice: 'gaul', turns: [{ say: 'kasih tebakan', intent: 'joke' }, { say: 'apa emang?', intent: 'riddle' }] },
  { id: 'r3', voice: 'santai', turns: [{ say: 'aku punya tebakan nih', intent: 'riddle' }, { say: 'buah apa yang suka bohong?', intent: 'riddle', match: /nyerah|apa jawabannya|kasih tau/i }, { say: 'buah duren, duren-duren lu!', intent: 'banter', match: /haha|wkwk/i }] },
  { id: 'r4', voice: 'gaul', turns: [{ say: 'tebak dong, hewan apa yang paling kaya?', intent: 'riddle' }, { say: 'ayam, soalnya punya bulu emas', intent: 'banter' }] },
  { id: 'r5', voice: 'santai', turns: [{ say: 'apa bedanya kamu sama kalkulator? kalkulator bisa ngitung, kamu cuma bisa bikin aku mikir', intent: 'banter', match: /haha|wkwk|\/10/i }] },
  { id: 'r6', voice: 'gaul', turns: [{ say: 'kenapa ikan ga bisa main bola? karena takut kena jaring', intent: 'banter' }] },
  { id: 'r7', voice: 'santai', turns: [{ say: 'pantun nih: ke pasar beli kangkung, kangkungnya layu sebelah, kalau kamu lagi bingung, catat aja jangan resah', intent: 'banter', match: /cakep/i }] },
  // Roasting from the records.
  { id: 'o1', voice: 'gaul', ctx: 'boros', turns: [{ say: 'roasting pengeluaran gue dong', intent: 'roast', match: /kopi/i }] },
  { id: 'o2', voice: 'sopan', ctx: 'boros', turns: [{ say: 'saya boros nggak?', intent: 'roast', notMatch: /wkwk/i }] },
  { id: 'o3', voice: 'santai', ctx: 'full', turns: [{ say: 'ejek dompetku dong', intent: 'roast' }] },
  { id: 'o4', voice: 'gaul', ctx: 'boros', turns: [{ say: 'kopi 45rb pake jago', record: true, match: /lagi|ke-/i }] },
  { id: 'o5', voice: 'singkat', ctx: 'boros', turns: [{ say: 'kopi 45rb pake jago', record: true, notMatch: /wkwk/i }] },
  // Every menu.
  { id: 'm1', voice: 'santai', ctx: 'full', turns: [{ say: 'bukain menu wishlist', intent: 'module', open: 'wishlist' }] },
  { id: 'm2', voice: 'santai', ctx: 'full', turns: [{ say: 'pindah ke kalender', intent: 'module', open: 'calendar' }] },
  { id: 'm3', voice: 'gaul', ctx: 'full', turns: [{ say: 'cicilan gue masih berapa', intent: 'module', open: 'debts', match: /1\.800\.000/ }] },
  { id: 'm4', voice: 'santai', ctx: 'full', turns: [{ say: 'siapa aja yang belum bayar utang ke aku', intent: 'module', open: 'receivables', match: /Budi/ }] },
  { id: 'm5', voice: 'sopan', ctx: 'full', turns: [{ say: 'progres tujuan dana saya', intent: 'module', open: 'funds', match: /Liburan Bali/ }] },
  { id: 'm6', voice: 'santai', ctx: 'full', turns: [{ say: 'langganan bulanan aku apa aja', intent: 'module', open: 'recurring', match: /Netflix/ }] },
  { id: 'm7', voice: 'santai', ctx: 'full', turns: [{ say: 'klaim kantor yang belum cair berapa', intent: 'module', open: 'claims', match: /180\.000/ }] },
  { id: 'm8', voice: 'gaul', ctx: 'full', turns: [{ say: 'tunjukin laporan', intent: 'module', open: 'report' }] },
  { id: 'm9', voice: 'santai', ctx: 'full', turns: [{ say: 'utang ke budi 50rb pake jago', record: true }] },
  { id: 'm10', voice: 'santai', ctx: 'full', turns: [{ say: 'sisa anggaran makan berapa', notIntent: 'module' }] },
];
export const VOICES = V;
