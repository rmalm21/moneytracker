/**
 * 10.0 Asisten chat 3.0 — bahasa sehari-hari, DEV set (used while building). Asked mid-10.0: "bahasanya diperluas jangan
 * hanya bahasa baku namun juga mengerti bahasa yang biasa dipakai orang". The same six families as cases-dev.mjs, every
 * sentence written the way people type in chat: shorthand (gw, bgt, gmn, udh, blm, pgn, mo, bkin), slang (boncos, bokek,
 * gas, ngerem, kalap), typos (bajet, budjet, anggran), Javanese / Sundanese / Betawi, English mixed in.
 * Bench account: bench/v83/state.mjs. The held-out set (cases-gaul-heldout.mjs) shares no sentence with this one.
 * Format: see cases-dev.mjs.
 */
const Q = (extra = {}) => ({ notRecord: true, notUnknown: true, ...extra });
const one = (id, fam, say, check, voice = 'gaul') => ({ id, fam, voice, turns: [{ say, check }] });
const dlg = (id, fam, turns, check, voice = 'gaul') => ({ id, fam, voice, turns: turns.map((t, i) => ({ ...(typeof t === 'string' ? { say: t } : t), ...(i === turns.length - 1 ? { check } : {}) })) });
const SAVE = { save: true }, SAVE_OFF = { save: true, off: true };
const CANCELLED = Q({ any: [/oke|batal|gak jadi|nggak jadi|ga jadi|siap|sip|santai/i] });

export const cases = [
  /* 1 · paham: questions as people type them */
  one('gp1', 'paham', 'duit bebas gw brp', Q({ any: [/Rp/], all: [/bebas/i] })),
  one('gp2', 'paham', 'bln ini gw udh abis brp', Q({ all: [/Rp/] })),
  one('gp3', 'paham', 'kmrn kluar duit brp', Q({ all: [/Rp/] }), 'santai'),
  one('gp4', 'paham', 'jajan gw bln ini brp an', Q({ all: [/Jajan/i, /Rp/] })),
  one('gp5', 'paham', 'saldo gopay gw brp', Q({ all: [/GoPay/i, /Rp/] })),
  one('gp6', 'paham', 'budget mkn msh aman ga', Q({ all: [/Makan/i, /Rp/] })),
  one('gp7', 'paham', 'anggaran transport sisa brp lg', Q({ all: [/Transport/i, /Rp/] }), 'singkat'),
  one('gp8', 'paham', 'gajian brp hari lg sih', Q({ any: [/hari/i] })),
  one('gp9', 'paham', 'siapa aja yg blm bayar utang ke gw', Q({ all: [/Rp/] })),
  one('gp10', 'paham', 'duitku kari piro', Q({ all: [/Rp/] }), 'santai'),
  one('gp11', 'paham', 'artos abdi sesa sabaraha', Q({ all: [/Rp/] }), 'sopan'),
  one('gp12', 'paham', 'duit aye berape sekarang', Q({ all: [/Rp/] }), 'santai'),
  one('gp13', 'paham', 'where did my money go this month', Q({ all: [/Rp/] }), 'santai'),
  one('gp14', 'paham', 'sehari gw biasanya abis brp', Q({ all: [/Rp/] })),
  one('gp15', 'paham', 'paling boros di apa ya gw', Q({ any: [/Tagihan|Makan|Kopi|terbesar/i] })),
  one('gp16', 'paham', 'tabungan laptop udh kekumpul brp', Q({ all: [/Laptop/i, /Rp/] })),

  /* 2 · tujuan: what they want to set up, in everyday words */
  one('gt1', 'tujuan', 'bkin anggaran dong', Q({ ask: true, open: 'budgets' })),
  one('gt2', 'tujuan', 'gw mo bikin budget jajan', Q({ any: [/berapa/i], open: 'budgets' })),
  one('gt3', 'tujuan', 'pgn bikin limit ngopi 200rb sebulan', { record: { kind: 'budget', total: 200000 } }),
  one('gt4', 'tujuan', 'bikinin bajet makan 1,5jt dong', { record: { kind: 'budget', total: 1500000 } }),
  one('gt5', 'tujuan', 'tolong pasangin budjet nongkrong', Q({ any: [/berapa/i] }), 'santai'),
  one('gt6', 'tujuan', 'mau ngebatesin jajan biar ga kebablasan', Q({ any: [/berapa|batas/i], open: 'budgets' }), 'santai'),
  one('gt7', 'tujuan', 'mo nambah rekening seabank', { notUnknown: true, any: [/seabank/i] }),
  one('gt8', 'tujuan', 'add dompet ovo dong', { notUnknown: true, any: [/ovo/i] }),
  one('gt9', 'tujuan', 'gw pgn nabung buat nikah', Q({ ask: true, open: 'funds' })),
  one('gt10', 'tujuan', 'pngen ngumpulin duit buat beli motor', Q({ ask: true, any: [/motor/i] }), 'santai'),
  one('gt11', 'tujuan', 'mo bikin celengan buat liburan ke jogja', Q({ ask: true, any: [/jogja|liburan/i] })),
  one('gt12', 'tujuan', 'bikinin jadwal bayar kos tiap tgl 5 1,2jt', { record: { kind: 'recurring_new', total: 1200000 } }),
  one('gt13', 'tujuan', 'tagihan wifi tiap bln biar otomatis kecatet gmn', Q({ any: [/rutin|jadwal/i] }), 'santai'),
  one('gt14', 'tujuan', 'bkin kategori skincare', { record: { kind: 'category_new', has: ['skincare'] } }),
  one('gt15', 'tujuan', 'masukin wishlist sepatu 800rb', { record: { kind: 'wish_new', total: 800000 } }),
  one('gt16', 'tujuan', 'patungan sm temen2 gmn caranya', Q({ all: [/Split Bill/i], open: 'splitbill' })),
  one('gt17', 'tujuan', 'mo split bil nih', Q({ all: [/Split Bill/i] })),
  one('gt18', 'tujuan', 'gmn cara scan struk', Q({ any: [/scan|struk/i] }), 'santai'),
  one('gt19', 'tujuan', 'pin aplikasi gmn pasangnya', Q({ any: [/PIN|Keamanan/i] }), 'santai'),
  one('gt20', 'tujuan', 'gw mulai dr nol nih, ngatur duit gmn ya', Q({ any: [/langkah|mulai|anggaran/i] })),

  /* 3 · komentar: after Simpan, in the chosen way of talking */
  dlg('gk1', 'komentar', ['sedekah jumatan 20rb', SAVE], { comment: 'good' }),
  dlg('gk2', 'komentar', ['infaq masjid 50rb', SAVE], { comment: 'good' }, 'santai'),
  dlg('gk3', 'komentar', ['nabung 500rb ke dana darurat', SAVE], { comment: 'good' }),
  dlg('gk4', 'komentar', ['nyicil hp 500rb', SAVE], { comment: 'good' }, 'santai'),
  dlg('gk5', 'komentar', ['ngopi lg 25rb', SAVE], { comment: 'warn' }),
  dlg('gk6', 'komentar', ['jajan cilok 10rb', SAVE], { comment: 'warn', any: [/\b(?:lo|lu|gue|gw|bos)\b/i] }, 'barbar'),
  dlg('gk7', 'komentar', ['jajan lagi 15rb', SAVE_OFF], { comment: 'none' }),
  dlg('gk8', 'komentar', ['gaji masuk 5jt', SAVE], { comment: 'good' }),
  dlg('gk9', 'komentar', ['dpt thr 3jt', SAVE], { comment: 'good' }, 'santai'),
  dlg('gk10', 'komentar', ['checkout shopee 1,5jt', SAVE], { comment: 'warn' }),
  dlg('gk11', 'komentar', ['bayar parkir 2rb', SAVE], { comment: 'none' }, 'santai'),
  dlg('gk12', 'komentar', ['makan siang 30rb', SAVE], { comment: 'none' }, 'santai'),
  dlg('gk13', 'komentar', ['ngopi lg 25rb', SAVE, 'iya iya maap wkwk'], Q({ maxLen: 260 })),
  dlg('gk14', 'komentar', ['jajan seblak 15rb', SAVE, 'iyaa bikinin anggaran jajan deh'], Q({ any: [/berapa/i] })),

  /* 4 · interaktif */
  one('gi1', 'interaktif', 'gw boros bgt ya', Q({ chips: 2, any: [/Rp/] })),
  one('gi2', 'interaktif', 'kyknya gw boros dah', Q({ any: [/Rp/] })),
  one('gi3', 'interaktif', 'emg lo bisa bantu apa aja sih', Q({ chips: 2 })),
  one('gi4', 'interaktif', 'saran dong biar ga bokek', Q({ any: [/hemat|anggaran|Rp/i] })),
  one('gi5', 'interaktif', 'enaknya budget jajan brp ya', Q({ any: [/Rp|rb\b/i] }), 'santai'),
  dlg('gi6', 'interaktif', ['bkin anggaran dong', 'yg jajan aja'], Q({ any: [/berapa/i] })),
  dlg('gi7', 'interaktif', ['bkin anggaran dong', 'jajan', 'enaknya brp ya'], Q({ any: [/Rp|rb\b/i] })),
  one('gi8', 'interaktif', 'wkwk duit gw sekarat', Q()),

  /* 5 · konteks */
  dlg('gc1', 'konteks', ['bkin anggaran dong', 'jajan', '300rb aja'], { record: { kind: 'budget', total: 300000 } }),
  dlg('gc2', 'konteks', ['gw mo bikin budget', 'ngopi', '250rb deh'], { record: { kind: 'budget', total: 250000 } }),
  dlg('gc3', 'konteks', ['pgn nabung nih', 'buat nikah', '50jt'], { record: { kind: 'fund_new', total: 50000000 } }),
  dlg('gc4', 'konteks', ['mo nambah dompet', 'jago'], { notUnknown: true, any: [/jago/i] }),
  dlg('gc5', 'konteks', ['mo nambah dompet', 'seabank', 'saldonya 500rb'], { notUnknown: true, any: [/500/] }),
  dlg('gc6', 'konteks', ['bkin anggaran dong', 'ga jd deh'], CANCELLED),
  dlg('gc7', 'konteks', ['bkin anggaran dong', 'batal aja'], CANCELLED, 'santai'),
  dlg('gc8', 'konteks', ['patungan makan sm temen', 'berlima totalnya 500rb'], { notUnknown: true, all: [/100\.000/] }),
  dlg('gc9', 'konteks', ['budget jajan aman ga', 'iya'], Q({ any: [/berapa/i] })),
  dlg('gc10', 'konteks', ['budget jajan aman ga', 'gas'], Q({ any: [/berapa/i] })),
  dlg('gc11', 'konteks', ['gw pgn nabung buat beli laptop', '10jt', 'kalo sebulan 1jt brp lama'], { notUnknown: true, any: [/bulan/i] }),
  dlg('gc12', 'konteks', ['anggaran makan sisa brp', 'kalo transport?'], Q({ all: [/Transport/i, /Rp/] })),
  dlg('gc13', 'konteks', ['jajan gw bln ini brp', 'kalo kopi?'], Q({ all: [/Kopi/i, /Rp/] })),
  dlg('gc14', 'konteks', ['bikin jadwal rutin dong', 'bayar kos', '1,2jt tiap tgl 5'], { record: { kind: 'recurring_new' } }),

  /* 6 · saran */
  one('gs1', 'saran', 'duit gw tinggal 200rb, gajian masih seminggu lg', Q({ any: [/sehari|per hari/i], all: [/Rp/] })),
  one('gs2', 'saran', 'gaji gw 6jt enaknya dibagi gmn', Q({ all: [/3\.000\.000|3 ?jt/] })),
  one('gs3', 'saran', 'napa ya duit gw cepet bgt abisnya', Q({ all: [/Rp/] })),
  one('gs4', 'saran', 'sering lupa nyatet nih gmn dong', Q({ any: [/Pengingat/i] })),
  one('gs5', 'saran', 'males bgt ngetik satu2', Q({ any: [/sekaligus|Scan|Impor/i] })),
  one('gs6', 'saran', 'temen gw ngutang mulu, gmn ya', Q({ any: [/Piutang/i] })),
  one('gs7', 'saran', 'gw kalap belanja online mulu', Q({ any: [/24 jam|Wish ?list/i] })),
  one('gs8', 'saran', 'tips nabung dong buat pemula', Q({ any: [/awal|tabungan|gajian/i] }), 'santai'),
  one('gs9', 'saran', 'dana darurat tuh idealnya brp', Q({ any: [/3.{0,8}6/] })),
  one('gs10', 'saran', 'investasi yg aman buat pemula apa', Q({ any: [/dana darurat|risiko|reksa ?dana/i] }), 'santai'),
  one('gs11', 'saran', 'langganan gw kebanyakan ga ya', Q({ any: [/langganan|rutin/i] })),
  one('gs12', 'saran', 'mending emas atau reksadana', Q({ any: [/risiko|dana darurat|reksa ?dana/i] }), 'santai'),
];
