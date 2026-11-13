/**
 * 10.0 Asisten chat 3.0 — bahasa sehari-hari, HELD-OUT set. Written together with cases-gaul-dev.mjs, before the engine
 * was changed for it, and run once at the end (`SET=gaul-heldout node bench/v100/run.mjs --first`). No sentence is shared
 * with the dev set. Format: see cases-dev.mjs.
 */
const Q = (extra = {}) => ({ notRecord: true, notUnknown: true, ...extra });
const one = (id, fam, say, check, voice = 'gaul') => ({ id, fam, voice, turns: [{ say, check }] });
const dlg = (id, fam, turns, check, voice = 'gaul') => ({ id, fam, voice, turns: turns.map((t, i) => ({ ...(typeof t === 'string' ? { say: t } : t), ...(i === turns.length - 1 ? { check } : {}) })) });
const SAVE = { save: true }, SAVE_OFF = { save: true, off: true };
const CANCELLED = Q({ any: [/oke|batal|gak jadi|nggak jadi|ga jadi|siap|sip|santai/i] });

export const cases = [
  /* 1 · paham */
  one('hp1', 'paham', 'sisa duit bebas w brp', Q({ any: [/Rp/], all: [/bebas/i] })),
  one('hp2', 'paham', 'total pengeluaran gw bulan ini brapa', Q({ all: [/Rp/] })),
  one('hp3', 'paham', 'kemaren gw ngabisin brp', Q({ all: [/Rp/] }), 'santai'),
  one('hp4', 'paham', 'ngopi gw bln ini abis brp', Q({ all: [/Kopi/i, /Rp/] })),
  one('hp5', 'paham', 'duit di jago tinggal brp', Q({ all: [/Jago/i, /Rp/] })),
  one('hp6', 'paham', 'bujet makan gw msh ada ga', Q({ all: [/Makan/i, /Rp/] })),
  one('hp7', 'paham', 'budget transport msh sisa brp', Q({ all: [/Transport/i, /Rp/] }), 'singkat'),
  one('hp8', 'paham', 'brp lama lg gajian', Q({ any: [/hari/i] })),
  one('hp9', 'paham', 'yg ngutang ke gw siapa aja', Q({ all: [/Rp/] })),
  one('hp10', 'paham', 'duwitku isih piro', Q({ all: [/Rp/] }), 'santai'),
  one('hp11', 'paham', 'duit abdi bulan ieu beak sabaraha', Q({ all: [/Rp/] }), 'sopan'),
  one('hp12', 'paham', 'aye udeh ngabisin berape bulan ini', Q({ all: [/Rp/] }), 'santai'),
  one('hp13', 'paham', 'how much money do i have left', Q({ all: [/Rp/] }), 'santai'),
  one('hp14', 'paham', 'rata2 sehari gw keluar brp', Q({ all: [/Rp/] })),
  one('hp15', 'paham', 'gw paling boros di kategori apa', Q({ any: [/Tagihan|Makan|Kopi|terbesar/i] })),
  one('hp16', 'paham', 'celengan liburan bali udh brp', Q({ all: [/Bali/i, /Rp/] })),

  /* 2 · tujuan */
  one('ht1', 'tujuan', 'mo bikin anggaran baru', Q({ ask: true, open: 'budgets' })),
  one('ht2', 'tujuan', 'pengen budgetin jajan', Q({ any: [/berapa/i], open: 'budgets' })),
  one('ht3', 'tujuan', 'set limit kopi 150rb sebulan', { record: { kind: 'budget', total: 150000 } }),
  one('ht4', 'tujuan', 'bikinin anggaran nongkrong 400rb', { record: { kind: 'budget', total: 400000 } }),
  one('ht5', 'tujuan', 'tolong buatin budget buat hiburan', Q({ any: [/berapa/i] }), 'santai'),
  one('ht6', 'tujuan', 'pengen ngerem pengeluaran jajan', Q({ any: [/berapa|batas/i], open: 'budgets' }), 'santai'),
  one('ht7', 'tujuan', 'tambahin rekening bni', { notUnknown: true, any: [/bni/i] }),
  one('ht8', 'tujuan', 'gw punya e-wallet baru, dana', { notUnknown: true, any: [/\bdana\b/i], none: [/tujuan dana/i] }),
  one('ht9', 'tujuan', 'pgn mulai nabung nih', Q({ ask: true, open: 'funds' })),
  one('ht10', 'tujuan', 'mau nyisihin duit buat beli hp baru', Q({ ask: true, any: [/\bhp\b/i] }), 'santai'),
  one('ht11', 'tujuan', 'bikin target tabungan umroh 30jt', { record: { kind: 'fund_new', total: 30000000 } }),
  one('ht12', 'tujuan', 'bayar listrik tiap tgl 20 bikinin jadwalnya 400rb', { record: { kind: 'recurring_new', total: 400000 } }),
  one('ht13', 'tujuan', 'langganan spotify tiap bulan biar otomatis dicatet', Q({ any: [/rutin|jadwal/i] }), 'santai'),
  one('ht14', 'tujuan', 'tambahin kategori hewan peliharaan', { record: { kind: 'category_new', has: ['hewan'] } }),
  one('ht15', 'tujuan', 'simpen di wishlist dulu kamera 5jt', { record: { kind: 'wish_new', total: 5000000 } }),
  one('ht16', 'tujuan', 'bagi tagihan makan sm anak2 gmn', Q({ all: [/Split Bill/i], open: 'splitbill' })),
  one('ht17', 'tujuan', 'mo urunan nih', Q({ all: [/Split Bill/i] })),
  one('ht18', 'tujuan', 'foto struk bisa ga', Q({ any: [/scan|struk/i] }), 'santai'),
  one('ht19', 'tujuan', 'mau ganti tema gelap', Q({ any: [/Tampilan|tema/i] }), 'santai'),
  one('ht20', 'tujuan', 'baru pertama pake app ginian, mulai dr mana', Q({ any: [/langkah|mulai|anggaran/i] })),

  /* 3 · komentar */
  dlg('hk1', 'komentar', ['sedekah ke panti 100rb', SAVE], { comment: 'good' }),
  dlg('hk2', 'komentar', ['zakat 250rb', SAVE], { comment: 'good' }, 'santai'),
  dlg('hk3', 'komentar', ['nyisihin 300rb ke tabungan laptop', SAVE], { comment: 'good' }),
  dlg('hk4', 'komentar', ['bayar paylater 400rb', SAVE], { comment: 'good' }, 'santai'),
  dlg('hk5', 'komentar', ['kopi susu 22rb', SAVE], { comment: 'warn' }),
  dlg('hk6', 'komentar', ['beli seblak 12rb', SAVE], { comment: 'warn', any: [/\b(?:lo|lu|gue|gw|bos)\b/i] }, 'barbar'),
  dlg('hk7', 'komentar', ['kopi 20rb', SAVE_OFF], { comment: 'none' }),
  dlg('hk8', 'komentar', ['gajian 6jt masuk bca', SAVE], { comment: 'good' }),
  dlg('hk9', 'komentar', ['dapet bonus 2jt', SAVE], { comment: 'good' }, 'santai'),
  dlg('hk10', 'komentar', ['co tokped 1,2jt', SAVE], { comment: 'warn' }),
  dlg('hk11', 'komentar', ['bayar parkir 3rb', SAVE], { comment: 'none' }, 'santai'),
  dlg('hk12', 'komentar', ['makan malam 35rb', SAVE], { comment: 'none' }, 'santai'),
  dlg('hk13', 'komentar', ['kopi 18rb', SAVE, 'hehe iya deh'], Q({ maxLen: 260 })),
  dlg('hk14', 'komentar', ['jajan cimol 10rb', SAVE, 'yaudah pasangin anggaran jajan'], Q({ any: [/berapa/i] })),

  /* 4 · interaktif */
  one('hi1', 'interaktif', 'aku boros parah ga sih', Q({ chips: 2, any: [/Rp/] }), 'santai'),
  one('hi2', 'interaktif', 'gw ngerasa boros bgt', Q({ any: [/Rp/] })),
  one('hi3', 'interaktif', 'lo bisa ngapain aja', Q({ chips: 2 })),
  one('hi4', 'interaktif', 'kasih saran biar ga boncos dong', Q({ any: [/hemat|anggaran|Rp/i] })),
  one('hi5', 'interaktif', 'budget kopi idealnya brp ya', Q({ any: [/Rp|rb\b/i] }), 'santai'),
  dlg('hi6', 'interaktif', ['mo bikin anggaran', 'buat ngopi'], Q({ any: [/berapa/i] })),
  dlg('hi7', 'interaktif', ['mo bikin anggaran', 'jajan', 'saranin dong brp'], Q({ any: [/Rp|rb\b/i] })),
  one('hi8', 'interaktif', 'duit gw udah sekarat nih wkwk', Q()),

  /* 5 · konteks */
  dlg('hc1', 'konteks', ['mo bikin anggaran', 'nongkrong', '400rb aja'], { record: { kind: 'budget', total: 400000 } }),
  dlg('hc2', 'konteks', ['pengen budgetin', 'kopi', '200rb deh'], { record: { kind: 'budget', total: 200000 } }),
  dlg('hc3', 'konteks', ['pgn mulai nabung nih', 'buat umroh', '30jt'], { record: { kind: 'fund_new', total: 30000000 } }),
  dlg('hc4', 'konteks', ['tambahin rekening dong', 'bni'], { notUnknown: true, any: [/bni/i] }),
  dlg('hc5', 'konteks', ['tambahin rekening dong', 'jenius', 'isinya 1jt'], { notUnknown: true, any: [/1\.000\.000|1 ?jt/i] }),
  dlg('hc6', 'konteks', ['mo bikin anggaran', 'ga usah deh'], CANCELLED),
  dlg('hc7', 'konteks', ['pgn mulai nabung nih', 'skip dulu'], CANCELLED, 'santai'),
  dlg('hc8', 'konteks', ['bagi tagihan makan sm anak2', 'berempat 600rb'], { notUnknown: true, all: [/150\.000/] }),
  dlg('hc9', 'konteks', ['bujet jajan msh aman?', 'boleh'], Q({ any: [/berapa/i] })),
  dlg('hc10', 'konteks', ['budget kopi aman ga', 'gaskeun'], Q({ any: [/berapa/i] })),
  dlg('hc11', 'konteks', ['mau nyisihin duit buat beli hp baru', '5jt', 'kalo sebulan 500rb brp lama'], { notUnknown: true, any: [/bulan/i] }),
  dlg('hc12', 'konteks', ['budget makan sisa brp', 'trus transport?'], Q({ all: [/Transport/i, /Rp/] })),
  dlg('hc13', 'konteks', ['ngopi gw bln ini brp', 'kalo jajan?'], Q({ all: [/Jajan/i, /Rp/] })),
  dlg('hc14', 'konteks', ['bikinin jadwal rutin', 'listrik', '400rb tiap tgl 20'], { record: { kind: 'recurring_new' } }),

  /* 6 · saran */
  one('hs1', 'saran', 'uang gw sisa 150rb padahal gajian 10 hari lg', Q({ any: [/sehari|per hari/i], all: [/Rp/] })),
  one('hs2', 'saran', 'gajiku 4,5jt bagusnya dibagi kyk gmn', Q({ all: [/2\.250\.000|2,25 ?jt/] }), 'santai'),
  one('hs3', 'saran', 'kok duit gw ludes mulu ya', Q({ all: [/Rp/] })),
  one('hs4', 'saran', 'gw suka lupa nyatet pengeluaran', Q({ any: [/Pengingat/i] })),
  one('hs5', 'saran', 'mager ngetik satu satu', Q({ any: [/sekaligus|Scan|Impor/i] })),
  one('hs6', 'saran', 'temen gw minjem duit ga balik2', Q({ any: [/Piutang/i] })),
  one('hs7', 'saran', 'gw gampang laper mata kalo liat diskon', Q({ any: [/24 jam|Wish ?list/i] })),
  one('hs8', 'saran', 'gimana caranya biar bisa nabung', Q({ any: [/awal|tabungan|gajian/i] }), 'santai'),
  one('hs9', 'saran', 'dana darurat yg aman tuh brp sih', Q({ any: [/3.{0,8}6/] })),
  one('hs10', 'saran', 'mau mulai investasi tapi bingung', Q({ any: [/dana darurat|risiko|reksa ?dana/i] }), 'santai'),
  one('hs11', 'saran', 'kebanyakan langganan nih kyknya', Q({ any: [/langganan|rutin/i] })),
  one('hs12', 'saran', 'crypto atau saham ya bagusnya', Q({ any: [/risiko|dana darurat|reksa ?dana/i] }), 'santai'),
];
