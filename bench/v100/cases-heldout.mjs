/**
 * 10.0 Asisten chat 3.0 — HELD-OUT set. Written together with the dev set, before the 3.0 engine, and not looked at
 * while building: run once at the end (`--first` freezes that first result). No sentence, item, name or amount is shared
 * with cases-dev.mjs. Same format as cases-dev.mjs.
 */
const Q = (extra = {}) => ({ notRecord: true, notUnknown: true, ...extra });
const one = (id, fam, say, check, voice = 'santai') => ({ id, fam, voice, turns: [{ say, check }] });
const dlg = (id, fam, turns, check, voice = 'santai') => ({ id, fam, voice, turns: turns.map((t, i) => ({ ...(typeof t === 'string' ? { say: t } : t), ...(i === turns.length - 1 ? { check } : {}) })) });
const SAVE = { save: true }, SAVE_OFF = { save: true, off: true };

export const cases = [
  /* 1 · paham */
  one('p1', 'paham', 'uangku sisa berapaan ya kak', Q({ any: [/Rp/], all: [/bebas|sisa|saldo/i] })),
  one('p2', 'paham', 'total ngemil aku sebulan ini brp', Q({ all: [/Rp/] })),
  one('p3', 'paham', "what's my gopay balance", Q({ all: [/GoPay/i, /Rp/] })),
  one('p4', 'paham', 'kategori yg paling nyedot duit apa', Q({ any: [/Makan|Kopi|Ojek|terbesar/i] })),
  one('p5', 'paham', 'jenius ada berapa duitnya', Q({ all: [/Jenius/, /Rp/] })),
  one('p6', 'paham', 'barusan beli gorengan 8 rebu', { record: { kind: 'expense', total: 8000 } }),
  one('p7', 'paham', 'isi pertalite 40k pk gopay', { record: { kind: 'expense', total: 40000 } }),
  one('p8', 'paham', 'transferan gaji udh masuk 7,5jt di bri', { record: { kind: 'income', total: 7500000 } }),
  one('p9', 'paham', 'gajian tinggal berapa hari lagi', Q({ any: [/gajian|hari/i] })),
  one('p10', 'paham', 'kuat ga beli sepatu 900rb', Q({ any: [/aman|cukup|bebas|kurang|sisa/i] })),
  one('p11', 'paham', 'sehari biasanya keluar duit brp', Q({ all: [/Rp/] })),
  one('p12', 'paham', 'ngopi minggu ini abis brp', Q({ all: [/Rp/] })),
  one('p13', 'paham', 'tolong bantu aku biar keuangan ga berantakan', Q({ any: [/anggaran|langkah|catat|hemat/i] })),
  one('p14', 'paham', 'is it safe to buy a 1.5 million bag', Q({ any: [/aman|cukup|bebas|kurang|sisa/i] })),
  one('p15', 'paham', 'anggaran transport masih sisa ga', Q({ all: [/Transport/i], any: [/Rp|%/] })),

  /* 2 · tujuan */
  one('t1', 'tujuan', 'bujet baru', Q({ all: [/anggaran/i], ask: true, open: 'budgets', chips: 3 })),
  one('t2', 'tujuan', 'pengen ngebudget nih', Q({ all: [/anggaran/i], ask: true, open: 'budgets' })),
  one('t3', 'tujuan', 'make a new budget please', Q({ all: [/anggaran/i], ask: true, open: 'budgets' })),
  one('t4', 'tujuan', 'kasih batas jajan 400rb per bulan', { record: { kind: 'budget', total: 400000, has: ['jajan'] } }),
  one('t5', 'tujuan', 'anggarin transport 700rb', { record: { kind: 'budget', total: 700000 } }),
  one('t6', 'tujuan', 'nambah rekening', Q({ any: [/dompet|rekening/i], ask: true, open: 'wallets' })),
  one('t7', 'tujuan', 'new account dana', { record: { kind: 'wallet_new', has: ['dana'] } }),
  one('t8', 'tujuan', 'pengen mulai nabung', Q({ any: [/tujuan dana|target|tabungan/i], ask: true, open: 'funds' })),
  one('t9', 'tujuan', 'target tabungan nikah 50jt', { record: { kind: 'fund_new', total: 50000000 } }),
  one('t10', 'tujuan', 'spotify 55rb per bulan otomatis', { record: { kind: 'recurring_new', total: 55000 } }),
  one('t11', 'tujuan', 'atur tagihan bulanan biar otomatis', Q({ all: [/rutin/i], ask: true, open: 'recurring' })),
  one('t12', 'tujuan', 'patungan villa sama anak kantor', Q({ all: [/Split Bill/i], open: 'splitbill' })),
  one('t13', 'tujuan', 'bagi tagihan makan malam', Q({ all: [/Split Bill/i], open: 'splitbill' })),
  one('t14', 'tujuan', 'upload rekening koran bisa ga', Q({ all: [/Impor mutasi/i] })),
  one('t15', 'tujuan', 'males ngetik, bisa scan nota?', Q({ all: [/Scan struk|struk/i] })),
  one('t16', 'tujuan', 'kunci aplikasinya pakai pin', Q({ all: [/PIN/], open: 'settings' })),
  one('t17', 'tujuan', 'mode gelap dong', Q({ any: [/Tampilan|tema/i], open: 'settings' })),
  one('t18', 'tujuan', 'tambahin kategori', Q({ all: [/kategori/i], ask: true })),
  one('t19', 'tujuan', 'bantu aku mulai ngatur duit', Q({ any: [/anggaran/i], all: [/1|pertama|dulu/i] })),
  one('t20', 'tujuan', 'suatu hari pengen beli kamera', Q({ any: [/wish list|impian|tujuan dana|target/i] })),
  one('t21', 'tujuan', 'anggaran baru buat belanja', Q({ all: [/anggaran/i, /belanja/i], ask: true })),
  one('t22', 'tujuan', 'Saya ingin membuat anggaran', Q({ all: [/anggaran/i], ask: true }), 'sopan'),

  /* 3 · komentar */
  dlg('k1', 'komentar', ['sedekah anak yatim 100rb', SAVE], { comment: 'good' }),
  dlg('k2', 'komentar', ['sumbangan masjid 50rb', SAVE], { comment: 'good', any: [/gue|lo|mantap|keren/i] }, 'gaul'),
  dlg('k3', 'komentar', ['amal jariyah 25rb', SAVE], { comment: 'good', none: [/\b(?:lo|gue|lu|gw)\b/i] }, 'sopan'),
  dlg('k4', 'komentar', ['infak 30rb', SAVE], { comment: 'good', maxLen: 110 }, 'singkat'),
  dlg('k5', 'komentar', ['jajan martabak 30rb', SAVE], { comment: 'warn', any: [/jajan/i] }),
  dlg('k6', 'komentar', ['jajan cimol 7rb', SAVE], { comment: 'warn', any: [/\b(?:gue|lo|lu)\b/i] }, 'barbar'),
  dlg('k7', 'komentar', ['es kopi gula aren 22rb', SAVE], { comment: 'warn', any: [/kopi/i] }),
  dlg('k8', 'komentar', ['bayar cicilan hp 900rb', SAVE], { comment: 'good' }),
  dlg('k9', 'komentar', ['bonus masuk 2jt ke bri', SAVE], { comment: 'good', any: [/nabung|sisihkan|tabung|tujuan dana/i] }),
  dlg('k10', 'komentar', ['beli kulkas 5jt pake bri', SAVE], { comment: 'warn' }),
  dlg('k11', 'komentar', ['pulsa 50rb', SAVE], { comment: 'none' }),
  dlg('k12', 'komentar', ['tol 15rb', SAVE], { comment: 'none' }),
  dlg('k13', 'komentar', ['jajan martabak 30rb', SAVE_OFF], { comment: 'none' }),
  dlg('k14', 'komentar', ['jajan pentol 6rb', SAVE], { comment: 'warn', none: [/\b(?:lo|gue|lu|gw)\b/i] }, 'sopan'),
  dlg('k15', 'komentar', ['donasi 15rb', SAVE], { comment: 'good', any: [/\b(?:gue|lo|lu)\b/i] }, 'barbar'),

  /* 4 · interaktif */
  one('i1', 'interaktif', 'rangkuman pengeluaranku dong', Q({ chips: 2 })),
  one('i2', 'interaktif', 'bujet baru', Q({ chips: 3, chipsAny: [/makan|transport|jajan|kopi/i] })),
  dlg('i3', 'interaktif', ['jajan martabak 30rb', SAVE], { comment: 'warn', chipsAny: [/anggaran|batas/i] }),
  one('i4', 'interaktif', 'kayaknya aku boros deh', Q({ chips: 2, any: [/Rp/] })),
  dlg('i5', 'interaktif', ['sedekah anak yatim 100rb', SAVE], { comment: 'good', chips: 1 }),
  one('i6', 'interaktif', 'pengen mulai nabung', Q({ chips: 2 })),
  one('i7', 'interaktif', 'gimana caranya biar irit', Q({ chips: 2 })),
  one('i8', 'interaktif', 'nambah rekening', Q({ chips: 2 })),

  /* 5 · konteks */
  dlg('c1', 'konteks', ['bujet baru', 'transportasi', '900rb'], { record: { kind: 'budget', total: 900000, has: ['transport'] } }),
  dlg('c2', 'konteks', ['pengen ngebudget nih', 'kopi', '300rb'], { record: { kind: 'budget', total: 300000, has: ['kopi'] } }),
  dlg('c3', 'konteks', ['nambah rekening', 'bca'], { record: { kind: 'wallet_new', has: ['bca'] } }),
  dlg('c4', 'konteks', ['pengen mulai nabung', 'buat umroh', '35jt'], { record: { kind: 'fund_new', total: 35000000 } }),
  dlg('c5', 'konteks', ['jajan martabak 30rb', SAVE, 'oke'], Q({ all: [/anggaran/i, /jajan/i], ask: true })),
  dlg('c6', 'konteks', ['jajan martabak 30rb', SAVE, 'yaudah bikin batas jajan', '350rb'], { record: { kind: 'budget', total: 350000, has: ['jajan'] } }),
  dlg('c7', 'konteks', ['jajan bulan ini berapa', 'dibanding bulan kemarin gimana'], Q({ any: [/naik|turun|lebih|kurang|sama/i], all: [/Rp/] })),
  dlg('c8', 'konteks', ['bagi tagihan makan malam', 'bertiga, totalnya 450rb'], Q({ all: [/150\.000/] })),
  dlg('c9', 'konteks', ['pengen mulai nabung', 'buat beli laptop', '12jt', 'kalau nabung 2jt per bulan berapa lama'], Q({ all: [/6 bulan/] })),
  dlg('c10', 'konteks', ['bujet baru', 'gajadi deh'], { notRecord: true, any: [/oke|sip|batal|nggak jadi|siap/i], none: [/belum nangkep/i] }),
  dlg('c11', 'konteks', ['bujet baru', 'makan', 'idealnya berapa?'], Q({ all: [/Rp/], any: [/rata|biasa|bulan/i] })),
  dlg('c12', 'konteks', ['nambah rekening', 'bca', 'isinya 3jt'], { record: { kind: 'wallet_new', has: ['bca', '3jt'] } }),
  dlg('c13', 'konteks', ['atur tagihan bulanan biar otomatis', 'internet', '350rb tiap tanggal 10'], { record: { kind: 'recurring_new', total: 350000 } }),
  dlg('c14', 'konteks', ['es kopi gula aren 22rb', SAVE, 'hehe iya deh'], Q({ none: [/belum nangkep/i] })),
  dlg('c15', 'konteks', ['bujet baru', 'transportasi', '900rb', 'ganti 1jt aja'], { record: { kind: 'budget', total: 1000000 } }),

  /* 6 · saran */
  one('s1', 'saran', 'kasih saran biar irit dong', Q({ any: [/masak|bekal|anggaran|kurangi|batasi/i] })),
  one('s2', 'saran', 'cara nabung buat beli rumah', Q({ any: [/tujuan dana|target|per bulan|sisihkan/i] })),
  one('s3', 'saran', 'duit tinggal 150rb masih 9 hari lagi gajian', Q({ all: [/Rp/], any: [/sehari|per hari|hari/i] })),
  one('s4', 'saran', 'berapa sih dana darurat yang aman', Q({ any: [/3.{0,8}6|enam|tiga/i] })),
  one('s5', 'saran', 'suka kelupaan nyatet pengeluaran', Q({ any: [/pengingat|ingetin|reminder/i] })),
  one('s6', 'saran', 'ribet nyatet satu satu', Q({ any: [/Scan struk|Catat otomatis|sekaligus|impor/i] })),
  one('s7', 'saran', 'temen sering minjem duit ke aku', Q({ any: [/piutang|Split Bill/i] })),
  one('s8', 'saran', 'kok uangku cepet abis ya', Q({ any: [/Laporan|Analisis|kategori|terbesar/i] })),
  one('s9', 'saran', 'tagihan streaming numpuk', Q({ any: [/langganan|rutin/i] })),
  one('s10', 'saran', 'mending deposito atau saham', Q({ any: [/reksa ?dana|risiko|dana darurat/i] })),
  one('s11', 'saran', 'gimana biar ga laper mata pas belanja', Q({ any: [/wish list|tunggu|24 jam|tunda/i] })),
  one('s12', 'saran', 'gaji 8jt enaknya dibagi gimana', Q({ all: [/4\.000\.000|4 ?jt/] })),
  one('s13', 'saran', 'aku pengen konsisten nyatet tiap hari', Q({ any: [/pengingat|Arena|streak|tiap hari/i] })),
  one('s14', 'saran', 'kopi terus nih tiap hari', Q({ any: [/anggaran|batas|kopi/i] })),
];
