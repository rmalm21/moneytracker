/**
 * 10.0 Asisten chat 3.0 — DEV set (used while building). Written before the 3.0 engine, on the bench account of
 * bench/v83/state.mjs (Dinda, 15 Oct 2026, pay cycle 24 Sep – 24 Oct; Jajan 9× and Kopi & Minuman 12× this cycle).
 * The held-out set (cases-heldout.mjs) shares no sentence with this one.
 *
 * A case: { id, fam, voice, turns: [{ say } | { save: true, off? }] } — the last turn's `check` is what counts.
 *   { save: true }: the card just shown is saved (the person taps Simpan); the check is on the comment that follows.
 *   { save: true, off: true }: the same, with comments switched off in the chat settings.
 * check: record { kind, total, has[] } · notRecord · notUnknown · any[] / all[] / none[] (regex on what is shown)
 *        · ask (a question back) · chips (at least n chips) · chipsAny[] (regex on the chips) · open (view of the button)
 *        · comment ('good' | 'warn' | 'none') · maxLen
 */
const Q = (extra = {}) => ({ notRecord: true, notUnknown: true, ...extra });
const one = (id, fam, say, check, voice = 'santai') => ({ id, fam, voice, turns: [{ say, check }] });
const dlg = (id, fam, turns, check, voice = 'santai') => ({ id, fam, voice, turns: turns.map((t, i) => ({ ...(typeof t === 'string' ? { say: t } : t), ...(i === turns.length - 1 ? { check } : {}) })) });
const SAVE = { save: true }, SAVE_OFF = { save: true, off: true };

export const cases = [
  /* 1 · paham: many ways of writing the same thing (slang, typos, English, shorthand) */
  one('p1', 'paham', 'duit gw tinggal brp skrg', Q({ any: [/Rp/], all: [/bebas|sisa|saldo/i] }), 'gaul'),
  one('p2', 'paham', 'berapa sih total jajanku bulan ini', Q({ all: [/Jajan/i, /Rp/] })),
  one('p3', 'paham', 'how much did i spend this month', Q({ all: [/Rp/] })),
  one('p4', 'paham', 'pengeluaran paling boros apa ya', Q({ any: [/Makan|Kopi|Ojek|terbesar/i] })),
  one('p5', 'paham', 'saldo jago brp', Q({ all: [/Jago/, /Rp/] })),
  one('p6', 'paham', 'td pagi beli nasi uduk 12k', { record: { kind: 'expense', total: 12000 } }),
  one('p7', 'paham', 'abis isi bensin 50rb pake cash', { record: { kind: 'expense', total: 50000 } }),
  one('p8', 'paham', 'gajian masuk 8jt ke jago', { record: { kind: 'income', total: 8000000 } }),
  one('p9', 'paham', 'kapan gajian', Q({ any: [/gajian|hari/i] })),
  one('p10', 'paham', 'aman ga kalo beli hp 3jt', Q({ any: [/aman|cukup|bebas|kurang|sisa/i] })),
  one('p11', 'paham', 'rata2 sehari aku abis brp', Q({ all: [/Rp/], any: [/sehari|per hari|hari/i] })),
  one('p12', 'paham', 'pengeluaran kopi minggu ini', Q({ all: [/Rp/], any: [/Kopi/i] })),
  one('p13', 'paham', 'aku pengen ngatur duit biar ga boncos', Q({ any: [/anggaran|langkah|catat|hemat/i] })),
  one('p14', 'paham', 'can i afford a 2 million phone', Q({ any: [/aman|cukup|bebas|kurang|sisa/i] })),
  one('p15', 'paham', 'tlg cek budget makan msh aman gak', Q({ all: [/Makan/i], any: [/Rp|%/] })),

  /* 2 · tujuan: what the person wants, whatever the words; asked in the chat with a button to the full form */
  one('t1', 'tujuan', 'budgeting baru', Q({ all: [/anggaran/i], ask: true, open: 'budgets', chips: 3 })),
  one('t2', 'tujuan', 'bikin anggaran baru dong', Q({ all: [/anggaran/i], ask: true, open: 'budgets' })),
  one('t3', 'tujuan', 'create new budget', Q({ all: [/anggaran/i], ask: true, open: 'budgets' })),
  one('t4', 'tujuan', 'set limit jajan 500rb sebulan', { record: { kind: 'budget', total: 500000, has: ['jajan'] } }),
  one('t5', 'tujuan', 'batasin pengeluaran makan max 1,5jt', { record: { kind: 'budget', total: 1500000 } }),
  one('t6', 'tujuan', 'tambah dompet baru', Q({ all: [/dompet/i], ask: true, open: 'wallets' })),
  one('t7', 'tujuan', 'add wallet seabank', { record: { kind: 'wallet_new', has: ['seabank'] } }),
  one('t8', 'tujuan', 'mau bikin tabungan', Q({ any: [/tujuan dana|target|tabungan/i], ask: true, open: 'funds' })),
  one('t9', 'tujuan', 'bikin target nabung motor 15jt', { record: { kind: 'fund_new', total: 15000000 } }),
  one('t10', 'tujuan', 'langganan netflix 54rb tiap bulan', { record: { kind: 'recurring_new', total: 54000 } }),
  one('t11', 'tujuan', 'bikin jadwal rutin', Q({ all: [/rutin/i], ask: true, open: 'recurring' })),
  one('t12', 'tujuan', 'patungan makan sama temen', Q({ all: [/Split Bill/i], open: 'splitbill' })),
  one('t13', 'tujuan', 'split bill dong', Q({ all: [/Split Bill/i], open: 'splitbill' })),
  one('t14', 'tujuan', 'aku punya mutasi bank mau dimasukin', Q({ all: [/Impor mutasi/i] })),
  one('t15', 'tujuan', 'foto struk aja bisa?', Q({ all: [/Scan struk|struk/i] })),
  one('t16', 'tujuan', 'pengen pasang pin', Q({ all: [/PIN/], open: 'settings' })),
  one('t17', 'tujuan', 'ganti tema gelap', Q({ any: [/Tampilan|tema/i], open: 'settings' })),
  one('t18', 'tujuan', 'bikin kategori baru', Q({ all: [/kategori/i], ask: true })),
  one('t19', 'tujuan', 'mau atur keuangan dari nol', Q({ any: [/anggaran/i], all: [/1|pertama|dulu/i] })),
  one('t20', 'tujuan', 'pengen beli ps5 tapi nanti', Q({ any: [/wish list|impian|tujuan dana|target/i] })),
  one('t21', 'tujuan', 'budget transport baru', Q({ all: [/anggaran/i, /transport/i], ask: true })),
  one('t22', 'tujuan', 'Anggaran baru', Q({ all: [/anggaran/i], ask: true }), 'sopan'),

  /* 3 · komentar: what the assistant says once a record is saved, in the chosen way of talking */
  dlg('k1', 'komentar', ['sedekah jumat 50rb', SAVE], { comment: 'good' }),
  dlg('k2', 'komentar', ['infaq masjid 20rb', SAVE], { comment: 'good', any: [/gue|lo|mantap|keren/i] }, 'gaul'),
  dlg('k3', 'komentar', ['donasi bencana 100rb', SAVE], { comment: 'good', none: [/\b(?:lo|gue|lu|gw)\b/i] }, 'sopan'),
  dlg('k4', 'komentar', ['zakat 200rb', SAVE], { comment: 'good', maxLen: 110 }, 'singkat'),
  dlg('k5', 'komentar', ['jajan cilok 10rb', SAVE], { comment: 'warn', any: [/jajan/i] }),
  dlg('k6', 'komentar', ['jajan seblak 15rb', SAVE], { comment: 'warn', any: [/\b(?:gue|lo|lu)\b/i] }, 'barbar'),
  dlg('k7', 'komentar', ['kopi susu 28rb', SAVE], { comment: 'warn', any: [/kopi/i] }),
  dlg('k8', 'komentar', ['bayar cicilan motor 1,2jt', SAVE], { comment: 'good' }),
  dlg('k9', 'komentar', ['gajian 8jt masuk jago', SAVE], { comment: 'good', any: [/nabung|sisihkan|tabung|tujuan dana/i] }),
  dlg('k10', 'komentar', ['beli tv 6jt pake jago', SAVE], { comment: 'warn' }),
  dlg('k11', 'komentar', ['bensin 30rb', SAVE], { comment: 'none' }),
  dlg('k12', 'komentar', ['parkir 5rb', SAVE], { comment: 'none' }),
  dlg('k13', 'komentar', ['jajan cilok 10rb', SAVE_OFF], { comment: 'none' }),
  dlg('k14', 'komentar', ['jajan es teh 5rb', SAVE], { comment: 'warn', none: [/\b(?:lo|gue|lu|gw)\b/i] }, 'sopan'),
  dlg('k15', 'komentar', ['sedekah 10rb', SAVE], { comment: 'good', any: [/\b(?:gue|lo|lu)\b/i] }, 'barbar'),

  /* 4 · interaktif: the reply leads somewhere (a question, choices, an offer) */
  one('i1', 'interaktif', 'ringkasan bulan ini', Q({ chips: 2 })),
  one('i2', 'interaktif', 'budgeting baru', Q({ chips: 3, chipsAny: [/makan|transport|jajan|kopi/i] })),
  dlg('i3', 'interaktif', ['jajan cilok 10rb', SAVE], { comment: 'warn', chipsAny: [/anggaran|batas/i] }),
  one('i4', 'interaktif', 'aku boros banget ya', Q({ chips: 2, any: [/Rp/] })),
  dlg('i5', 'interaktif', ['sedekah jumat 50rb', SAVE], { comment: 'good', chips: 1 }),
  one('i6', 'interaktif', 'mau bikin tabungan', Q({ chips: 2 })),
  one('i7', 'interaktif', 'gimana biar hemat', Q({ chips: 2 })),
  one('i8', 'interaktif', 'tambah dompet baru', Q({ chips: 2 })),

  /* 5 · konteks: what was said before still counts */
  dlg('c1', 'konteks', ['budgeting baru', 'makan', '1,5jt'], { record: { kind: 'budget', total: 1500000, has: ['makan'] } }),
  dlg('c2', 'konteks', ['bikin anggaran baru', 'buat jajan', '500rb aja'], { record: { kind: 'budget', total: 500000, has: ['jajan'] } }),
  dlg('c3', 'konteks', ['tambah dompet baru', 'namanya seabank'], { record: { kind: 'wallet_new', has: ['seabank'] } }),
  dlg('c4', 'konteks', ['mau bikin tabungan', 'buat beli motor', '15jt'], { record: { kind: 'fund_new', total: 15000000 } }),
  dlg('c5', 'konteks', ['jajan cilok 10rb', SAVE, 'boleh'], Q({ all: [/anggaran/i, /jajan/i], ask: true })),
  dlg('c6', 'konteks', ['jajan cilok 10rb', SAVE, 'iya bikinin anggaran jajan', '400rb'], { record: { kind: 'budget', total: 400000, has: ['jajan'] } }),
  dlg('c7', 'konteks', ['pengeluaran makan bulan ini berapa', 'bandingin sama bulan lalu'], Q({ any: [/naik|turun|lebih|kurang|sama/i], all: [/Rp/] })),
  dlg('c8', 'konteks', ['patungan makan sama temen', 'berempat totalnya 480rb'], Q({ all: [/120\.000/] })),
  dlg('c9', 'konteks', ['mau nabung buat liburan', '10jt', 'kalau sebulan 1jt berapa lama'], Q({ all: [/10 bulan/] })),
  dlg('c10', 'konteks', ['budgeting baru', 'eh nggak jadi'], { notRecord: true, any: [/oke|sip|batal|nggak jadi|siap/i], none: [/belum nangkep/i] }),
  dlg('c11', 'konteks', ['budgeting baru', 'transport', 'enaknya berapa ya?'], Q({ all: [/Rp/], any: [/rata|biasa|bulan/i] })),
  dlg('c12', 'konteks', ['tambah dompet baru', 'seabank', 'saldonya 2jt'], { record: { kind: 'wallet_new', has: ['seabank', '2jt'] } }),
  dlg('c13', 'konteks', ['bikin jadwal rutin', 'bayar kos', '1,5jt tiap tanggal 5'], { record: { kind: 'recurring_new', total: 1500000 } }),
  dlg('c14', 'konteks', ['kopi susu 28rb', SAVE, 'iya iya maaf'], Q({ none: [/belum nangkep/i] })),
  dlg('c15', 'konteks', ['budgeting baru', 'makan', '1,5jt', 'eh 2jt deh'], { record: { kind: 'budget', total: 2000000 } }),

  /* 6 · saran: advice for real life, and the feature that fits */
  one('s1', 'saran', 'gimana biar hemat', Q({ any: [/masak|bekal|anggaran|kurangi|batasi/i] })),
  one('s2', 'saran', 'tips nabung buat nikah', Q({ any: [/tujuan dana|target|per bulan|sisihkan/i] })),
  one('s3', 'saran', 'uang tinggal 300rb sampai gajian gimana', Q({ all: [/Rp/], any: [/sehari|per hari|hari/i] })),
  one('s4', 'saran', 'dana darurat idealnya berapa', Q({ any: [/3.{0,8}6|enam|tiga/i] })),
  one('s5', 'saran', 'aku sering lupa nyatet', Q({ any: [/pengingat|ingetin|reminder/i] })),
  one('s6', 'saran', 'males ngetik satu-satu', Q({ any: [/Scan struk|Catat otomatis|sekaligus|impor/i] })),
  one('s7', 'saran', 'sering bayarin temen dulu', Q({ any: [/piutang|Split Bill/i] })),
  one('s8', 'saran', 'pengen tau uangku lari kemana', Q({ any: [/Laporan|Analisis|kategori|terbesar/i] })),
  one('s9', 'saran', 'langganan aku banyak banget', Q({ any: [/langganan|rutin/i] })),
  one('s10', 'saran', 'investasi yang bagus apa', Q({ any: [/reksa ?dana|risiko|dana darurat/i] })),
  one('s11', 'saran', 'cara biar ga impulsif belanja', Q({ any: [/wish list|tunggu|24 jam|tunda/i] })),
  one('s12', 'saran', 'gaji 5jt idealnya dibagi gimana', Q({ all: [/2\.500\.000|2,5 ?jt/] })),
  one('s13', 'saran', 'pengen lebih disiplin catat keuangan', Q({ any: [/pengingat|Arena|streak|tiap hari/i] })),
  one('s14', 'saran', 'kebanyakan jajan nih aku', Q({ any: [/anggaran|batas|jajan/i] })),
];
