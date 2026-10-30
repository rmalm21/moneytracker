/**
 * 8.3 chat v3 — the big test. Every case is built from a question template, slot values and a surface (pronoun, how
 * "berapa" is written, words before and after, capitals), and checked against bench/v83/oracle.mjs: the number in the
 * answer has to be the right one, not just the topic.
 *
 * Two splits that share no template and no surface list: `dev` (used while building v3) and `heldout` (run once at
 * the end, first result frozen). Slot values differ too where a family has them (categories, shops, dates, amounts,
 * misspellings). Written before the v3 engine.
 *
 *   build('dev' | 'heldout') → [{ id, fam, voice, turns: [{ say, check }] }]
 *   check: { any: [regex sources] (one must match), all: [...] (every one), record: true (a record card),
 *            notRecord: true, notUnknown: true }
 */
import * as O from './oracle.mjs';

const M = O.money, esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sub = (parent, name) => O.data.categories.find(c => c.parentId === parent && c.name === name).id;
const VOICES = ['santai', 'sopan', 'gaul', 'singkat', 'barbar'];
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/* ---------------------------------------------------------------- surfaces (different per split) */
const SURFACE = {
  dev: { aku: ['aku', 'gue', 'gw', 'saya'], ku: ['ku', ' gue', ' gw', ' saya'], brp: ['berapa', 'brp', 'brapa'], pre: ['', '', 'eh ', 'min ', 'bot, '], post: ['', '', ' dong', ' sih', ' ya', '?', ' ??'], caps: ['lower', 'lower', 'cap'] },
  heldout: { aku: ['aku', 'gua', 'w', 'ane', 'aq'], ku: ['ku', ' gua', ' w', 'nya', ' aq'], brp: ['berapa', 'brpa', 'berapaan', 'brapah'], pre: ['', '', 'kak ', 'halo, ', 'cek ', 'mau tanya, '], post: ['', '', ' nih', ' deh', ' kak', '?', ' 🤔', ' ya?'], caps: ['lower', 'lower', 'cap', 'upper'] },
};
function surface(template, split, r, fixed = false) {
  const S = SURFACE[split], one = list => list[Math.floor(r() * list.length)];
  let s = template.replace(/\{aku\}/g, () => one(S.aku)).replace(/\{ku\}/g, () => one(S.ku)).replace(/\{brp\}/g, () => one(S.brp));
  if (fixed) return s;
  s = `${one(S.pre)}${s}${one(S.post)}`.replace(/\s+([?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const caps = one(S.caps);
  return caps === 'upper' ? s.toUpperCase() : caps === 'cap' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
const fill = (t, slots) => t.replace(/\{(kat|per|toko|d|M|T|N|D|item|who)\}/g, (_, k) => slots[k]);

/* ---------------------------------------------------------------- helpers for the checks */
const monthsRe = n => [`\\b${n}\\s?bulan`, ...(n >= 12 ? [n % 12 ? `\\b${Math.floor(n / 12)}\\s?tahun\\s?(?:lebih\\s?)?${n % 12}\\s?bulan` : `\\b${n / 12}\\s?tahun`] : [])];
const pctRe = p => [`(?<![\\d,.])(?:${p - 1}|${p}|${p + 1})(?:[,.]\\d+)?\\s?%`];
const countRe = n => [`\\b${n}\\s?(?:kali|x|×|transaksi)`];
const Q = (any, extra = {}) => ({ any: Array.isArray(any) ? any : [any], notRecord: true, notUnknown: true, ...extra });

/* ---------------------------------------------------------------- slot values */
const KAT = {
  dev: [['kopi', sub('expense.makan-minum', 'Kopi & Minuman')], ['makan siang', sub('expense.makan-minum', 'Makan Siang')], ['bensin', sub('expense.transportasi', 'Bensin')], ['ojek', sub('expense.transportasi', 'Ojek')], ['jajan', sub('expense.makan-minum', 'Jajan')]],
  heldout: [['transport', 'expense.transportasi'], ['listrik', sub('expense.tagihan', 'Listrik')], ['parkir', sub('expense.transportasi', 'Parkir')], ['makan', 'expense.makan-minum'], ['pulsa', sub('expense.tagihan', 'Pulsa')], ['gym', sub('expense.kesehatan', 'Gym')], ['bioskop', sub('expense.nongkrong-hiburan', 'Bioskop')]],
};
const PER = { dev: ['bulan ini', 'bulan lalu', 'minggu ini'], heldout: ['minggu lalu', 'agustus', 'bulan kemarin', 'september'] };
const TOKO = { dev: ['starbucks', 'indomaret', 'gojek', 'pertamina'], heldout: ['alfamart', 'grab', 'shell', 'tokopedia', 'hokben', 'solaria'] };
const DATES = {
  dev: [['tanggal 5', '2026-10-05'], ['tanggal 9', '2026-10-09'], ['tgl 12', '2026-10-12'], ['3 oktober', '2026-10-03'], ['17 agustus', '2026-08-17'], ['tanggal 20 bulan lalu', '2026-09-20'], ['senin kemarin', '2026-10-12'], ['hari sabtu kemarin', '2026-10-10']],
  heldout: [['tanggal 7', '2026-10-07'], ['tanggal 13', '2026-10-13'], ['tgl 2', '2026-10-02'], ['12 september', '2026-09-12'], ['27 september', '2026-09-27'], ['tanggal 10 bulan kemarin', '2026-09-10'], ['selasa kemarin', '2026-10-13'], ['jumat lalu', '2026-10-09'], ['rabu minggu lalu', '2026-10-07']],
};
const SAVE = {
  dev: { M: [['500rb', 5e5], ['1jt', 1e6], ['250 ribu', 2.5e5], ['2 juta', 2e6]], T: [['10jt', 1e7], ['6 juta', 6e6], ['12jt', 1.2e7]], N: [6, 12, 4], D: [['10rb', 1e4], ['20 ribu', 2e4]] },
  heldout: { M: [['750rb', 7.5e5], ['300 ribu', 3e5], ['1,5jt', 1.5e6], ['sejuta', 1e6]], T: [['9jt', 9e6], ['15 juta', 1.5e7], ['4,5jt', 4.5e6]], N: [3, 9, 18], D: [['15rb', 1.5e4], ['50 ribu', 5e4]] },
};

/* ---------------------------------------------------------------- families */
const FAMILIES = {};
const fam = (key, title, make) => { FAMILIES[key] = { title, make }; };

fam('bebas', 'uang bebas / sisa uang', split => {
  const strict = { dev: ['uang bebas{ku} {brp}', 'uang bebas{ku} sisa {brp}', 'uang yang bisa {aku} pakai {brp}', 'berapa uang bebas{ku} sekarang', 'uang siap pakai{ku} {brp}', 'uang bebas sekarang {brp}', 'cek uang bebas', 'uang bebas tinggal {brp} ya', 'masih ada uang bebas {brp}'],
    heldout: ['uang nganggur{ku} {brp}', 'uangku yang bebas tinggal {brp}', 'sisa uang yang bisa kupakai {brp}', '{brp} uang bebas {aku}', 'uang bebasnya tinggal {brp}', 'uang bebas skrg {brp}', 'sisa uang bebas{ku}', 'uang yang belum ada tujuannya {brp}', 'jumlah uang bebas{ku}'] }[split];
  const loose = { dev: ['sisa uang {aku} {brp}', 'duit {aku} tinggal {brp}', '{aku} masih punya duit {brp}'], heldout: ['duit{ku} sisa {brp}', 'masih ada {brp} duit{ku}', 'duit{ku} masih {brp} sih'] }[split];
  return [...strict.map(t => ({ t, check: Q(M(O.FREE)) })), ...loose.map(t => ({ t, check: Q([M(O.FREE), M(O.TOTAL_BALANCE)]) }))];
});
fam('saldo', 'saldo dompet', split => ({
  dev: [['saldo {aku} {brp}', O.TOTAL_BALANCE], ['total saldo semua dompet', O.TOTAL_BALANCE], ['saldo gopay {brp}', O.BALANCE.gopay], ['isi jago {brp}', O.BALANCE.jago], ['uang cash {aku} {brp}', O.BALANCE.cash], ['saldo semua dompet{ku}', O.TOTAL_BALANCE], ['gopay{ku} sisa {brp}', O.BALANCE.gopay], ['saldo cash {brp}', O.BALANCE.cash]],
  heldout: [['duit di gopay {brp}', O.BALANCE.gopay], ['saldo bank jago {brp}', O.BALANCE.jago], ['tunai tinggal {brp}', O.BALANCE.cash], ['total duit di semua dompet', O.TOTAL_BALANCE], ['saldo{ku} semuanya {brp}', O.TOTAL_BALANCE], ['jago{ku} masih {brp}', O.BALANCE.jago], ['uang tunai{ku} {brp}', O.BALANCE.cash], ['isi semua rekening {brp}', O.TOTAL_BALANCE]],
}[split].map(([t, v]) => ({ t, check: Q(M(v)) }))));
fam('harian', 'jatah harian', split => ({
  dev: ['sehari boleh jajan {brp}', 'jatah harian {aku} {brp}', 'per hari boleh habis {brp}', 'biar cukup sampai gajian sehari {brp}', 'jatah per hari {brp}', 'sehari aman belanja {brp}', 'uang harian {aku} {brp}'],
  heldout: ['sehari maksimal belanja {brp} biar aman', 'budget harian{ku} {brp}', 'tiap hari boleh keluar {brp}', 'biar nggak boncos sampai gajian, sehari {brp}', 'limit harian {aku} {brp}', 'per harinya {aku} boleh pakai {brp}', 'jatah sehari sampai gajian {brp}'],
}[split].map(t => ({ t, check: Q(M(O.DAILY)) }))));
fam('nabung', 'hitung nabung (bukan catatan)', split => {
  const S = SAVE[split], out = [];
  const T1 = { dev: ['kalau nabung {M} per bulan kapan dapet {T}', 'nabung {M} sebulan, berapa lama sampai {T}'], heldout: ['nyisihin {M} tiap bulan, {T} kekumpul kapan', 'berapa bulan buat ngumpulin {T} kalau sebulan {M}'] }[split];
  const T2 = { dev: ['mau punya {T} dalam {N} bulan, nabung {brp} sebulan', 'target {T} {N} bulan lagi, per bulan harus nyisihin {brp}'], heldout: ['biar dapet {T} dalam {N} bulan, sebulan harus nabung {brp}', 'pengen ngumpulin {T} {N} bulan, per bulannya {brp}'] }[split];
  const T3 = { dev: ['kalau nabung {D} sehari, setahun dapet {brp}'], heldout: ['sehari nyimpen {D}, setahun jadi {brp}'] }[split];
  const T4 = { dev: ['{M} per bulan selama {N} bulan jadi {brp}'], heldout: ['kalau tiap bulan nabung {M}, {N} bulan lagi terkumpul {brp}'] }[split];
  for (const [mw, mv] of S.M) for (const [tw, tv] of S.T) for (const t of T1) out.push({ t: fill(t, { M: mw, T: tw }), check: Q(monthsRe(Math.ceil(tv / mv))) });
  for (const [tw, tv] of S.T) for (const nn of S.N) for (const t of T2) out.push({ t: fill(t, { T: tw, N: nn }), check: Q([M(Math.round(tv / nn)), M(Math.ceil(tv / nn))]) });
  for (const [dw, dv] of S.D) for (const t of T3) out.push({ t: fill(t, { D: dw }), check: Q(M(dv * 365)) });
  for (const [mw, mv] of S.M) for (const nn of S.N) for (const t of T4) out.push({ t: fill(t, { M: mw, N: nn }), check: Q(M(mv * nn)) });
  return out;
});
fam('tanggal', 'tanggal & hari tertentu', split => {
  const T = { dev: ['{d} habis {brp}', '{d} belanja apa aja', 'pengeluaran {d} {brp}', '{d} {aku} beli apa aja'], heldout: ['{d} keluar duit {brp}', 'transaksi {d} apa aja', '{d} ngeluarin {brp}', 'habis {brp} {d}'] }[split];
  const out = [];
  for (const [dw, iso] of DATES[split]) { const v = O.spend(O.day(iso)); if (!v) continue; for (const t of T) out.push({ t: fill(t, { d: dw }), check: Q(M(v)) }); }
  return out;
});
fam('total', 'total per kategori', split => {
  const T = { dev: ['total {kat} {per}', '{kat} {per} {brp}', 'habis {brp} buat {kat} {per}', 'pengeluaran {kat} {per}'], heldout: ['{per} {kat} abis {brp}', 'keluar {brp} untuk {kat} {per}', '{kat} {per} totalnya {brp}', 'duit{ku} buat {kat} {per} {brp}'] }[split];
  const out = [];
  for (const [kw, id] of KAT[split]) for (const per of PER[split]) { const v = O.spend(O.PERIODS[per], t => O.inCategory(t, id)); if (!v) continue; for (const t of T) out.push({ t: fill(t, { kat: kw, per }), check: Q(M(v)) }); }
  return out;
});
fam('toko', 'per toko', split => {
  const T = { dev: ['total {toko} {per}', '{per} ke {toko} habis {brp}', 'belanja di {toko} {per} {brp}'], heldout: ['{toko} {per} {brp}', 'pengeluaran di {toko} {per}', 'jajan di {toko} {per} abis {brp}'] }[split];
  const C = { dev: ['berapa kali ke {toko} {per}'], heldout: ['{per} ke {toko} berapa kali'] }[split];
  const out = [];
  for (const toko of TOKO[split]) for (const per of PER[split]) {
    const keep = O.byMerchant(toko), v = O.spend(O.PERIODS[per], keep), n = O.count(O.PERIODS[per], keep); if (!v) continue;
    for (const t of T) out.push({ t: fill(t, { toko, per }), check: Q(M(v)) });
    for (const t of C) out.push({ t: fill(t, { toko, per }), check: Q(countRe(n)) });
  }
  return out;
});
fam('persen', 'persentase', split => {
  const K = { dev: [['makan', 'expense.makan-minum'], ['transport', 'expense.transportasi'], ['tagihan', 'expense.tagihan']], heldout: [['kesehatan', 'expense.kesehatan'], ['belanja', 'expense.belanja'], ['kopi', sub('expense.makan-minum', 'Kopi & Minuman')], ['ojek', sub('expense.transportasi', 'Ojek')]] }[split];
  const P = { dev: ['bulan ini', 'siklus ini'], heldout: ['bulan lalu', 'agustus'] }[split];
  const T = { dev: ['berapa persen pengeluaran buat {kat} {per}', '{kat} berapa persen dari total pengeluaran {per}'], heldout: ['porsi {kat} dari pengeluaran {per} berapa persen', 'persentase {kat} {per}'] }[split];
  const out = [];
  for (const [kw, id] of K) for (const per of P) { const all = O.spend(O.PERIODS[per]), v = O.spend(O.PERIODS[per], t => O.inCategory(t, id)); if (!v) continue; for (const t of T) out.push({ t: fill(t, { kat: kw, per }), check: Q(pctRe(Math.round(v / all * 100))) }); }
  return out;
});
fam('rincian', 'rincian per kategori', split => {
  const T = { dev: ['pengeluaran per kategori {per}', 'rincian pengeluaran {per}', '{per} habis buat apa aja', 'kategori paling boros {per}'], heldout: ['breakdown pengeluaran {per}', 'uang{ku} {per} lari ke mana aja', 'pengeluaran {per} dibagi per kategori', 'pos pengeluaran terbesar {per}'] }[split];
  const P = { dev: ['bulan ini', 'bulan lalu'], heldout: ['minggu lalu', 'agustus'] }[split];
  const out = [];
  for (const per of P) { const top = O.parents(O.PERIODS[per])[0]; for (const t of T) out.push({ t: fill(t, { per }), check: Q(esc(top.name), { all: [M(top.amount)] }) }); }
  return out;
});
fam('utang', 'utang per nama', split => ({
  dev: [['cicilan hp sisa {brp}', M(18e5)], ['utang ke kak rina {brp}', M(2e6)], ['kapan cicilan hp lunas', monthsRe(6)], ['total utang {aku} {brp}', M(38e5)], ['kredivo tinggal {brp}', M(18e5)], ['sisa utang cicilan hp', M(18e5)], ['pinjaman kak rina sisa {brp}', M(2e6)], ['cicilan hp tinggal berapa bulan', monthsRe(6)]],
  heldout: [['sisa pinjaman kak rina', M(2e6)], ['hp{ku} kurang {brp} lagi cicilannya', M(18e5)], ['berapa bulan lagi cicilan hp beres', monthsRe(6)], ['semua utang{ku} totalnya {brp}', M(38e5)], ['utang ke rina masih {brp}', M(2e6)], ['kurang {brp} lagi utang ke kak rina', M(2e6)], ['cicilan kredivo{ku} kelar kapan', monthsRe(6)], ['tanggungan cicilan hp masih {brp}', M(18e5)]],
}[split].map(([t, re]) => ({ t, check: Q(re) }))));
fam('piutang', 'piutang per orang', split => ({
  dev: [['budi masih utang {brp}', M(1e5)], ['piutang dimas', M(25e4)], ['sari kurang {brp}', M(5e4)], ['dimas kapan bayar', '30 Okt'], ['siapa aja yang belum bayar', M(4e5)], ['budi utang {brp} ke {aku}', M(1e5)], ['piutang sari sisa {brp}', M(5e4)], ['dimas belum bayar {brp}', M(25e4)]],
  heldout: [['duit{ku} di budi {brp}', M(1e5)], ['dimas minjem {brp} sih', M(25e4)], ['tagihan ke dimas jatuh tempo kapan', '30 Okt'], ['total piutang {aku}', M(4e5)], ['yang masih punya utang ke {aku} siapa aja', M(4e5)], ['sari masih nunggak {brp}', M(5e4)], ['uang yang dipinjam budi {brp}', M(1e5)], ['dimas janji balikin kapan', '30 Okt']],
}[split].map(([t, re]) => ({ t, check: Q(re) }))));
fam('tujuan', 'tujuan dana per nama', split => ({
  dev: [['liburan bali udah berapa persen', pctRe(25)], ['dana darurat {aku} {brp}', M(3e6)], ['laptop baru kurang {brp}', M(1e7)], ['kapan liburan bali tercapai', monthsRe(8)], ['tabungan liburan bali udah {brp}', M(125e4)], ['dana darurat kurang {brp} lagi', M(12e6)], ['laptop baru udah berapa persen', pctRe(17)]],
  heldout: [['progress tabungan liburan bali', [...pctRe(25), M(125e4)]], ['target laptop baru tinggal {brp} lagi', M(1e7)], ['dana darurat udah kekumpul {brp}', M(3e6)], ['berapa bulan lagi laptop baru kebeli', monthsRe(10)], ['tabungan bali{ku} {brp}', M(125e4)], ['dana darurat masih kurang {brp}', M(12e6)], ['liburan bali kurang {brp} lagi', M(375e4)], ['persentase dana darurat{ku}', pctRe(20)]],
}[split].map(([t, re]) => ({ t, check: Q(re) }))));
fam('wish', 'wish list per nama', split => ({
  dev: [['sepatu lari kurang {brp}', Q(M(6e5))], ['wishlist {aku} apa aja', Q('Sepatu lari', { all: ['Headphone'] })], ['headphone udah ditabung {brp}', Q(['Rp0', 'belum'])], ['harga sepatu lari {brp}', Q(M(9e5))], ['tabungan sepatu lari udah {brp}', Q(M(3e5))], ['headphone kurang {brp}', Q(M(12e5))]],
  heldout: [['barang incaran{ku} apa aja', Q('Sepatu lari', { all: ['Headphone'] })], ['buat sepatu lari tinggal {brp} lagi', Q(M(6e5))], ['headphone harganya {brp}', Q(M(12e5))], ['wish list{ku} isinya apa', Q('Sepatu lari', { all: ['Headphone'] })], ['sepatu lari udah kekumpul {brp}', Q(M(3e5))], ['buat headphone masih kurang {brp}', Q(M(12e5))]],
}[split].map(([t, check]) => ({ t, check }))));
fam('rutin', 'tagihan rutin per nama', split => ({
  dev: [['netflix kapan bayar', '20 Okt'], ['spotify {brp} sebulan', M(55e3)], ['tagihan terdekat apa', 'Spotify'], ['langganan {aku} apa aja', 'Netflix'], ['kos bayar kapan', '1 Nov'], ['internet indihome {brp}', M(33e4)], ['spotify jatuh tempo kapan', '18 Okt']],
  heldout: [['kapan jatuh tempo internet', '20 Okt'], ['bayar kos tanggal berapa', '1 Nov'], ['tagihan paling deket apa', 'Spotify'], ['netflix {brp} per bulan', M(65e3)], ['tagihan spotify kapan', '18 Okt'], ['kos{ku} sebulan {brp}', M(15e5)], ['yang harus dibayar duluan apa', 'Spotify']],
}[split].map(([t, re]) => ({ t, check: Q(re) }))));
fam('klaim', 'klaim kantor per nama', split => ({
  dev: [['klaim taksi udah cair belum', Q('[Bb]elum', { all: [M(18e4)] })], ['klaim makan dinas bandung kapan cair', Q('20 Okt')], ['total klaim yang belum cair', Q(M(6e5))], ['klaim makan dinas {brp}', Q(M(42e4))], ['klaim taksi kapan dibayar', Q('25 Okt')]],
  heldout: [['reimburse taksi meeting gimana', Q(M(18e4))], ['uang klaim kantor yang belum balik {brp}', Q(M(6e5))], ['kapan klaim bandung dibayar', Q('20 Okt')], ['reimburse bandung nilainya {brp}', Q(M(42e4))], ['taksi meeting klien cairnya kapan', Q('25 Okt')]],
}[split].map(([t, check]) => ({ t, check }))));
fam('skor', 'skor kesehatan keuangan', split => ({
  dev: ['skor keuangan {aku} {brp}', 'keuangan {aku} sehat nggak', 'nilai kesehatan keuangan{ku}', 'skor kesehatan keuangan', 'keuangan{ku} dapet nilai {brp}'],
  heldout: ['skor kesehatan finansial{ku}', 'kondisi keuangan {aku} sehat ga sih', 'financial health {aku} {brp}', 'rapor keuangan{ku} berapa', 'seberapa sehat keuangan{ku}'],
}[split].map(t => ({ t, check: Q(`\\b${O.SCORE}\\b`) }))));
fam('hemat', 'mau hemat di mana', split => {
  const top = O.parents(O.PERIODS['siklus ini']).filter(c => c.id !== 'expense.tagihan').slice(0, 2).map(c => esc(c.name));
  return { dev: ['{aku} harus hemat di mana', 'kategori apa yang bisa dikurangi', 'pengeluaran mana yang bisa dipotong', 'mau hemat, mulai dari mana', 'yang paling bisa dikurangin apa'], heldout: ['enaknya ngirit di bagian apa', 'biar hemat kurangin apa ya', 'pos mana yang paling bisa dihemat', 'pengen irit, potong yang mana', 'saran ngurangin pengeluaran dong'] }[split].map(t => ({ t, check: Q(top) }));
});
// Misspellings: each case takes a base question and misspells one or two of its words (different lists per split).
const TYPO = {
  dev: { pengeluaran: ['pengeluran', 'pngeluaran', 'pengeluaan', 'pengelaran'], pemasukan: ['pemasukn', 'pemasukkan', 'pmasukan'], berapa: ['berap', 'berpa'], saldo: ['sldo', 'saldi'], anggaran: ['anggran', 'angaran'], bebas: ['bebsa', 'bbas'], minggu: ['mggu', 'mingu'], kemarin: ['kmrn', 'kemaren'], transportasi: ['transportsi', 'trasportasi'] },
  heldout: { pengeluaran: ['pengluaran', 'pengeluarn', 'penegluaran', 'pengeluaram'], pemasukan: ['pemasukam', 'pemsukan', 'pemaskan'], berapa: ['berapq', 'beraoa'], saldo: ['saldp', 'sakdo'], anggaran: ['anggarn', 'anggaram', 'angggaran'], bebas: ['bebass', 'bwbas'], minggu: ['minggi', 'mnggu'], kemarin: ['kmarin', 'kemrin'], transportasi: ['tranportasi', 'transprotasi'] },
};
fam('typo', 'salah ketik', split => {
  const base = [['pengeluaran bulan ini berapa', M(O.spend(O.PERIODS['bulan ini']))], ['pemasukan bulan ini berapa', M(O.income(O.PERIODS['bulan ini']))], ['saldo gopay berapa', M(O.BALANCE.gopay)],
    ['sisa anggaran makan berapa', M(O.budgetLeft('Makan & Minum'))], ['uang bebas aku berapa', M(O.FREE)], ['pengeluaran minggu lalu berapa', M(O.spend(O.PERIODS['minggu lalu']))],
    ['saldo jago berapa', M(O.BALANCE.jago)], ['pemasukan bulan lalu berapa', M(O.income(O.PERIODS['bulan lalu']))], ['pengeluaran kemarin berapa', M(O.spend(O.PERIODS.kemarin))], ['sisa anggaran transportasi berapa', M(O.budgetLeft('Transportasi'))]];
  const out = [], r = rng(split === 'dev' ? 11 : 97);
  for (const [q, re] of base) {
    const words = q.split(' ').filter(w => TYPO[split][w]);
    for (const w of words) for (const bad of TYPO[split][w]) out.push({ t: q.replace(w, bad), check: Q(re), light: true });
    // two misspellings at once
    if (words.length >= 2) for (let i = 0; i < 3; i++) { let s = q; for (const w of words.slice(0, 2)) { const list = TYPO[split][w]; s = s.replace(w, list[Math.floor(r() * list.length)]); } out.push({ t: s, check: Q(re), light: true }); }
  }
  return out;
});
const KOPI = () => sub('expense.makan-minum', 'Kopi & Minuman'), MONTH = O.PERIODS['bulan ini'];
fam('inggris', 'bahasa Inggris & campur', split => ({
  dev: [['how much did i spend this month', M(O.spend(MONTH))], ['my balance', M(O.TOTAL_BALANCE)], ['how much money do i have left', [M(O.FREE), M(O.TOTAL_BALANCE)]], ['income this month', M(O.income(MONTH))],
    ['spending gue bulan ini berapa', M(O.spend(MONTH))], ['coffee this month how much', M(O.spend(MONTH, t => O.inCategory(t, KOPI())))], ['daily budget aku berapa', M(O.DAILY)],
    ['how much is my free money', M(O.FREE)], ['total spending last week', M(O.spend(O.PERIODS['minggu lalu']))], ['how much did i spend yesterday', M(O.spend(O.PERIODS.kemarin))], ['my gopay balance', M(O.BALANCE.gopay)],
    ['my total debt', M(38e5)], ['spending makan this month', M(O.spend(MONTH, t => O.inCategory(t, 'expense.makan-minum')))], ['income bulan lalu berapa', M(O.income(O.PERIODS['bulan lalu']))]],
  heldout: [["what's my total spending this month", M(O.spend(MONTH))], ['how much is my balance', M(O.TOTAL_BALANCE)], ['total income bulan ini', M(O.income(MONTH))], ['my free money', M(O.FREE)], ['spending minggu ini berapa', M(O.spend(O.PERIODS['minggu ini']))],
    ['how much did i spend on coffee last month', M(O.spend(O.PERIODS['bulan lalu'], t => O.inCategory(t, KOPI())))], ['budget transport left berapa', M(O.budgetLeft('Transportasi'))], ['how much do i owe', M(38e5)],
    ['what did i spend yesterday', M(O.spend(O.PERIODS.kemarin))], ['balance gopay aku', M(O.BALANCE.gopay)], ['expenses this week how much', M(O.spend(O.PERIODS['minggu ini']))], ['income last month', M(O.income(O.PERIODS['bulan lalu']))],
    ["how much is left in my food budget", M(O.budgetLeft('Makan & Minum'))], ['who owes me money', M(4e5)]],
}[split].map(([t, re]) => ({ t, check: Q(re), light: true }))));
fam('daerah', 'bahasa daerah', split => ({
  dev: [['duitku kari piro', [M(O.FREE), M(O.TOTAL_BALANCE)]], ['pengeluaranku sasi iki piro', M(O.spend(MONTH))], ['jajan sasi iki entek piro', M(O.spend(MONTH, t => O.inCategory(t, sub('expense.makan-minum', 'Jajan'))))], ['duit abdi sesa sabaraha', [M(O.FREE), M(O.TOTAL_BALANCE)]],
    ['saldoku piro', M(O.TOTAL_BALANCE)], ['pengeluaran wingi piro', M(O.spend(O.PERIODS.kemarin))], ['mangan sasi iki entek piro', M(O.spend(MONTH, t => O.inCategory(t, 'expense.makan-minum')))], ['saldo abdi sabaraha', M(O.TOTAL_BALANCE)], ['kamari beak sabaraha', M(O.spend(O.PERIODS.kemarin))]],
  heldout: [['dhuwitku isih piro', [M(O.FREE), M(O.TOTAL_BALANCE)]], ['pengeluaran abdi bulan ieu sabaraha', M(O.spend(MONTH))], ['aye punya duit berape', [M(O.FREE), M(O.TOTAL_BALANCE)]], ['kopi sasi iki piro', M(O.spend(MONTH, t => O.inCategory(t, KOPI())))],
    ['duit sing iso dienggo piro', M(O.FREE)], ['wingi entek piro', M(O.spend(O.PERIODS.kemarin))], ['jajan bulan ieu sabaraha', M(O.spend(MONTH, t => O.inCategory(t, sub('expense.makan-minum', 'Jajan'))))], ['saldo gopay piro', M(O.BALANCE.gopay)], ['aye abis berape bulan ini', M(O.spend(MONTH))]],
}[split].map(([t, re]) => ({ t, check: Q(re), light: true }))));
// Records that must stay records: the new questions may not take them.
fam('negatif', 'tetap jadi catatan', split => ({
  dev: ['kopi 25rb', 'tanggal 5 bayar kos 1,5jt', 'transport 20rb', 'total belanja 150rb di indomaret', 'bayar cicilan hp 300rb', 'budi bayar 100rb', 'beli sepatu lari 900rb', 'netflix 65rb', 'gaji masuk 8,5jt', 'senin kemarin makan siang 35rb', 'ojek 18rb tadi pagi', 'nabung 500rb ke jago',
    'makan siang 30rb pake gopay', 'beli pulsa 100rb', 'listrik 300rb kemarin', 'bensin 150rb', 'gajian 8,5jt', 'transfer 200rb ke gopay', 'nonton 50rb sama pacar', 'jajan 15rb di alfamart'],
  heldout: ['starbucks 52rb', 'tgl 7 isi bensin 120rb', 'parkir 5rb', 'totalnya 230rb belanja di alfamart', 'bayar utang ke kak rina 500rb', 'dimas balikin 250rb', 'beli headphone 1,2jt', 'spotify 55rb', 'dapet freelance 1,2jt', 'jumat lalu nonton bioskop 50rb', 'grab 25rb ke kantor', 'sehari jajan 20rb',
    'sarapan 15rb', 'bayar internet 330rb', 'kemarin ojek 20rb', 'top up gopay 100rb', 'beli obat 45rb', 'kopi kenangan 28rb tadi siang', 'tanggal 3 gym 250rb', 'makan malam 85rb di hokben'],
}[split].map(t => ({ t, check: { record: true }, light: true, record: true }))));

/* ---------------------------------------------------------------- follow-ups: two turns */
function dialogs(split) {
  const out = [], kat = KAT[split], per = PER[split];
  const first = { dev: '{kat} {per} {brp}', heldout: 'total {kat} {per}' }[split];
  const nextPer = { dev: ['kalau {per}?', 'yang {per}?'], heldout: ['terus {per}?', 'kalo {per} gimana'] }[split];
  const nextKat = { dev: ['kalo {kat}?', 'kalau {kat}?'], heldout: ['yang {kat} berapa?', 'kalau buat {kat} gimana?'] }[split];
  for (let i = 0; i < kat.length; i++) for (let j = 0; j < per.length; j++) {
    const [k1, id1] = kat[i], p1 = per[j], p2 = per[(j + 1) % per.length], [k2, id2] = kat[(i + 1) % kat.length];
    const v12 = O.spend(O.PERIODS[p2], t => O.inCategory(t, id1)), v21 = O.spend(O.PERIODS[p1], t => O.inCategory(t, id2));
    if (v12) for (const n of nextPer) out.push({ turns: [fill(first, { kat: k1, per: p1 }), fill(n, { per: p2 })], check: Q(M(v12)) });
    if (v21) for (const n of nextKat) out.push({ turns: [fill(first, { kat: k1, per: p1 }), fill(n, { kat: k2 })], check: Q(M(v21)) });
  }
  const named = {
    dev: [[['utang ke kak rina {brp}', 'kalau cicilan hp?'], M(18e5)], [['piutang budi', 'kalau dimas?'], M(25e4)], [['liburan bali udah {brp}', 'laptop baru?'], M(2e6)], [['kalau nabung 500rb per bulan kapan dapet 10jt', 'kalau 1jt per bulan?'], monthsRe(10)]],
    heldout: [[['sisa cicilan hp {brp}', 'yang ke kak rina?'], M(2e6)], [['dimas masih utang {brp}', 'kalo sari?'], M(5e4)], [['tabungan laptop baru {brp}', 'kalau dana darurat?'], M(3e6)], [['nyisihin 750rb tiap bulan, 9jt kekumpul kapan', 'kalau sejuta sebulan?'], monthsRe(9)]],
  }[split];
  for (const [turns, re] of named) out.push({ turns, check: Q(re) });
  return out;
}

/* ---------------------------------------------------------------- build */
export const familyTitles = { ...Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, f.title])), susulan: 'tanya susulan (2 giliran)' };
const PER_FAMILY = { dev: 8, heldout: 14 }, LIGHT = { dev: 4, heldout: 7 };
function light(text, split, r, record) {
  const S = SURFACE[split], one = list => list[Math.floor(r() * list.length)];
  const post = record ? S.post.filter(p => !/[?🤔]/u.test(p)) : S.post;
  const s = `${record ? '' : one(S.pre)}${text}${one(post)}`.replace(/\s+([?])/g, '$1').replace(/\s{2,}/g, ' ').trim(), caps = one(S.caps);
  return caps === 'upper' ? s.toUpperCase() : caps === 'cap' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
export function build(split) {
  const out = [], r = rng(split === 'dev' ? 830 : 8301);
  for (const [key, f] of Object.entries(FAMILIES)) {
    const seen = new Set();
    for (const [n, item] of f.make(split).entries()) {
      // Sentences written whole (misspellings, English, regional, records) get the light surface: words before,
      // capitals, and (not for records) words after.
      const variants = item.fixed ? 1 : item.light ? LIGHT[split] : PER_FAMILY[split];
      for (let k = 0; k < variants; k++) {
        const say = item.fixed ? item.t : item.light ? light(item.t, split, r, item.record) : surface(item.t, split, r);
        if (seen.has(say)) continue; seen.add(say);
        out.push({ id: `${key}-${n}-${k}`, fam: key, voice: VOICES[out.length % VOICES.length], turns: [{ say, check: item.check }] });
      }
    }
  }
  for (const [n, d] of dialogs(split).entries()) for (let k = 0; k < PER_FAMILY[split]; k++) {
    const turns = d.turns.map(t => light(surface(t, split, r, true), split, r, false)), key = turns.join(' / ');
    if (out.some(c => c.fam === 'susulan' && c.turns.map(t => t.say).join(' / ') === key)) continue;
    out.push({ id: `susulan-${n}-${k}`, fam: 'susulan', voice: VOICES[out.length % VOICES.length], turns: [{ say: turns[0] }, { say: turns[1], check: d.check }] });
  }
  return out;
}
