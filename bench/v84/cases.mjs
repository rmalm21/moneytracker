/**
 * 8.4 chat v4 — context that carries over, and everyday things v3 did not understand ("516rb piutang"). Written before
 * the v4 engine, on the v3 bench account (bench/v83/state.mjs); expected answers come from bench/v83/oracle.mjs.
 *
 * Two splits that share no template, no follow-up wording, no name and no amount: `dev` (used while building v4) and
 * `heldout` (run once at the end, first result frozen). Surfaces (words before and after, capitals) differ too.
 *
 *   build('dev' | 'heldout') → [{ id, fam, voice, turns: [{ say, check }] }]   (the last turn's check is what counts)
 *   check: { record: { kind, total, person, has } (a record card: what Catat otomatis reads; `has`: words the card's
 *            sentence keeps), any / all: [regex sources] on the answer, notRecord, notUnknown }
 */
import * as O from '../v83/oracle.mjs';

const M = O.money;
const VOICES = ['santai', 'sopan', 'gaul', 'singkat', 'barbar'];
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const SURFACE = {
  dev: { pre: ['', '', '', 'eh ', 'min, '], post: ['', '', '', ' ya', ' dong'], caps: ['lower', 'lower', 'cap'] },
  heldout: { pre: ['', '', '', 'kak ', 'oke, ', 'bot '], post: ['', '', '', ' nih', ' deh', ' kak'], caps: ['lower', 'lower', 'cap', 'upper'] },
};
function surface(text, split, r, bare = false) {
  if (bare) return text;
  const S = SURFACE[split], one = list => list[Math.floor(r() * list.length)];
  const s = `${one(S.pre)}${text}${one(S.post)}`.replace(/\s{2,}/g, ' ').trim(), caps = one(S.caps);
  return caps === 'upper' ? s.toUpperCase() : caps === 'cap' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);
const Q = (any, extra = {}) => ({ any: Array.isArray(any) ? any : [any], notRecord: true, notUnknown: true, ...extra });

/* ---------------------------------------------------------------- slot values (different per split) */
const WHO = { dev: ['andi', 'tono', 'rina', 'bayu'], heldout: ['yessy', 'fajar', 'putri', 'kevin'] };
const AMT = { dev: [['516rb', 516000], ['75rb', 75000], ['1,2jt', 1200000], ['300 ribu', 300000]], heldout: [['88rb', 88000], ['2jt', 2000000], ['450 ribu', 450000], ['150k', 150000]] };
const ITEM = { dev: [['makan siang', 'expense'], ['bensin', 'expense'], ['kopi', 'expense'], ['parkir', 'expense']], heldout: [['pulsa', 'expense'], ['ojek', 'expense'], ['sabun', 'expense'], ['jajan', 'expense']] };
const WAL = { dev: [['gopay', 'GoPay'], ['jenius', 'Jenius']], heldout: [['mandiri', 'Mandiri'], ['cash', 'Cash']] };

/* ---------------------------------------------------------------- expected numbers */
const P = O.PERIODS;
const top = period => O.parents(period);
const biggestTx = period => O.transactions.filter(t => t.type === 'expense' && t.date >= period[0] && t.date < period[1]).sort((a, b) => b.amount - a.amount)[0];
const name = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------------------------------------------------------------- families */
const FAMILIES = {};
const fam = (key, title, make) => { FAMILIES[key] = { title, make }; };

// 1. A receivable or a debt written with the amount first, the word after, or a word for lending of its own.
fam('owed', 'utang & piutang dengan kalimat apa pun', split => {
  const T = {
    dev: {
      receivable: ['{M} piutang', '{M} piutang {who}', 'piutang {M}', 'piutang {who} {M}', '{who} pinjem {M}', 'dipinjem {who} {M}', '{M} dipinjem {who}', '{who} kasbon {M}'],
      debt: ['{M} utang ke {who}', 'utang {M} ke {who}', 'pinjem {M} ke {who}', '{M} pinjaman dari {who}', 'ngutang ke {who} {M}', '{M} utang'],
    },
    heldout: {
      receivable: ['piutang ke {who} {M}', '{M} buat piutang {who}', 'catat piutang {M}', '{who} ngutang {M} ke aku', 'tadi {who} minjem duit {M}', '{M} dipinjam {who}', '{who} hutang {M}', 'piutangin {who} {M}'],
      debt: ['hutang {M}', '{M} hutang ke {who}', 'catat utang {M} ke {who}', 'aku minjem {M} dari {who}', '{who} minjemin aku {M}', 'dipinjemin {who} {M}'],
    },
  }[split];
  const out = [];
  for (const [kind, list] of [['receivable_new', T.receivable], ['debt_new', T.debt]]) for (const t of list) for (const who of WHO[split]) for (const [ms, mv] of AMT[split]) {
    const say = fill(t, { M: ms, who });
    out.push({ turns: [{ say, check: { record: { kind, total: mv, ...(t.includes('{who}') ? { person: who } : {}) } } }] });
  }
  return out;
});

// 2. The person given in the next message ("piutang 516rb" → "andi").
fam('owedWho', 'siapa orangnya, di pesan berikutnya', split => {
  const T = {
    dev: [['piutang {M}', '{who}', 'receivable_new'], ['{M} piutang', 'ke {who}', 'receivable_new'], ['utang {M}', 'ke {who}', 'debt_new'], ['{M} utang', 'sama {who}', 'debt_new']],
    heldout: [['catat piutang {M}', 'si {who}', 'receivable_new'], ['{M} dipinjem', '{who}', 'receivable_new'], ['hutang {M}', 'dari {who}', 'debt_new'], ['{M} piutang', 'namanya {who}', 'receivable_new']],
  }[split];
  const out = [];
  for (const [a, b, kind] of T) for (const who of WHO[split]) for (const [ms, mv] of AMT[split]) out.push({ turns: [{ say: fill(a, { M: ms }), check: {} }, { say: fill(b, { who }), bare: true, check: { record: { kind, total: mv, person: who } } }] });
  return out;
});

// 3. A record started without the details ("catat pengeluaran"), the rest in the next messages.
fam('startRecord', 'mulai mencatat, isinya menyusul', split => {
  const T = {
    dev: [['catat pengeluaran', '{M} {item}'], ['mau nyatet', '{item} {M}'], ['tolong catetin', '{item} {M}'], ['catat pengeluaran', '{M}', '{item}'], ['tadi beli {item}', '{M}']],
    heldout: [['nyatet dong', '{item} {M}'], ['bantu catat pengeluaran', '{M} buat {item}'], ['mau catat', '{M}', '{item}'], ['habis beli {item}', 'harganya {M}'], ['catat ya', '{item} {M}']],
  }[split];
  const out = [];
  for (const turns of T) for (const [item, kind] of ITEM[split]) for (const [ms, mv] of AMT[split].slice(0, 3)) {
    const said = turns.map(t => fill(t, { M: ms, item }));
    out.push({ turns: said.map((say, i) => ({ say, bare: i > 0, check: i === said.length - 1 ? { record: { kind, total: mv, has: [item] } } : {} })) });
  }
  return out;
});

// 4. A transfer whose destination comes next ("transfer 500rb" → "ke gopay").
fam('transferTo', 'transfer, tujuannya menyusul', split => {
  const T = { dev: [['transfer {M}', 'ke {w}'], ['transfer {M} dari jago', 'ke {w}']], heldout: [['tf {M}', 'ke {w}'], ['pindahin {M} dari jago', 'ke {w} ya']] }[split];
  const out = [];
  for (const [a, b] of T) for (const [w, W] of WAL[split]) for (const [ms, mv] of AMT[split]) out.push({ turns: [{ say: fill(a, { M: ms }), check: {} }, { say: fill(b, { w }), bare: true, check: { record: { kind: 'transfer', total: mv, has: [w] } } }] });
  return out;
});

// 5. A follow-up to a question about spending: the breakdown, the biggest, compared with before, why.
fam('askMore', 'pertanyaan susulan setelah total', split => {
  const Qs = { dev: [['pengeluaran bulan ini berapa', 'bulan ini', 'bulan lalu'], ['pengeluaran minggu ini berapa', 'minggu ini', 'minggu lalu']], heldout: [['total belanja bulan lalu brp', 'bulan lalu', null], ['minggu lalu habis berapa', 'minggu lalu', null]] }[split];
  const F = {
    dev: [['rinciannya dong', 'breakdown'], ['yang paling besar apa?', 'biggest'], ['dibanding sebelumnya gimana?', 'compare'], ['kenapa banyak banget', 'why']],
    heldout: [['detailnya?', 'breakdown'], ['paling banyak buat apa', 'biggest'], ['kalau dibanding periode sebelumnya?', 'compare'], ['kok bisa segitu', 'why'], ['itu buat apa aja', 'breakdown']],
  }[split];
  const out = [];
  for (const [q, per] of Qs) for (const [f, what] of F) {
    const cats = top(P[per]), tx = biggestTx(P[per]);
    const expect = what === 'breakdown' ? [`${name(cats[0].name)}[^]*${M(cats[0].amount)}`, `${M(cats[0].amount)}[^]*${name(cats[0].name)}`]
      : what === 'biggest' ? [name(cats[0].name), name(tx.merchant || '___')]
      : what === 'compare' ? ['\\d+\\s?%', 'naik', 'turun', 'lebih (?:banyak|sedikit|hemat|boros)']
      : [name(cats[0].name), name(cats[1].name)];
    out.push({ turns: [{ say: q, check: {} }, { say: f, bare: true, check: Q(expect) }] });
  }
  return out;
});

// 6. "dia", "itu", "-nya": a follow-up about the item just answered.
fam('aboutIt', 'tanya lanjut tentang yang barusan', split => {
  const T = {
    dev: [['budi masih utang berapa', 'dia kapan bayar?', ['belum ada tanggal', 'belum (?:ada )?janji', 'tanggal janji']], ['dimas masih utang berapa', 'kapan bayarnya?', ['30 Okt']], ['cicilan hp sisa berapa', 'jatuh temponya kapan?', ['20 Okt']], ['piutang sari berapa', 'udah lunas belum?', ['belum lunas', 'masih', M(50000)]], ['dimas masih utang berapa', 'buat apa dulu?', ['tiket konser', 'konser']]],
    heldout: [['piutang dimas berapa', 'jatuh temponya?', ['30 Okt']], ['budi utang berapa ke aku', 'udah bayar belum dia', ['belum', M(100000)]], ['utang ke kak rina berapa', 'kapan harus lunas?', ['belum ada (?:tanggal|jatuh tempo)', 'tanpa (?:tanggal|jatuh tempo)', 'tidak ada (?:tanggal|jatuh tempo)']], ['sari utang berapa', 'itu buat apa ya', ['kado']], ['cicilan hp berapa lagi', 'tanggal berapa jatuh temponya', ['20 Okt']]],
  }[split];
  return T.map(([a, b, any]) => ({ turns: [{ say: a, check: {} }, { say: b, bare: true, check: Q(any) }] }));
});

// 7. A follow-up to a list: the oldest, the biggest, how much, when.
fam('fromList', 'tanya lanjut dari daftar', split => {
  const T = {
    dev: [['piutang aku siapa aja', 'yang paling lama siapa?', ['Dimas']], ['piutang aku siapa aja', 'yang paling besar?', ['Dimas[^]*' + M(250000), M(250000) + '[^]*Dimas']], ['tagihan terdekat apa', 'berapa?', [M(55000)]], ['tagihan terdekat apa', 'kapan?', ['18 Okt']]],
    heldout: [['siapa aja yang utang ke aku', 'paling gede siapa', ['Dimas']], ['daftar piutang', 'yang paling lama belum bayar', ['Dimas']], ['tagihan terdekat', 'nominalnya?', [M(55000)]], ['tagihan terdekat apa', 'tanggal berapa itu', ['18 Okt']], ['utang aku apa aja', 'yang paling besar yang mana', ['Rina[^]*' + M(2000000), M(2000000)]]],
  }[split];
  return T.map(([a, b, any]) => ({ turns: [{ say: a, check: {} }, { say: b, bare: true, check: Q(any) }] }));
});

// 8. Everyday things: the date and time, a greeting, export, a forgotten PIN, undo, "is my money enough".
fam('everyday', 'hal umum sehari-hari', split => {
  const T = {
    dev: [['hari ini tanggal berapa', ['15 Okt', '15 Oktober']], ['sekarang jam berapa', ['\\d{1,2}[.:]\\d{2}', 'jam \\d']], ['good morning', ['pagi', 'morning', 'halo', 'hai']], ['bisa export excel?', ['CSV', 'Excel']], ['lupa pin', ['PIN', 'kunci', 'Keamanan']], ['undo', ['hapus', 'batal', 'terakhir']], ['gaji aku cukup ga', ['gajian', 'uang bebas', M(O.FREE)]], ['hari apa sekarang', ['Kamis']]],
    heldout: [['tanggal berapa sekarang', ['15 Okt', '15 Oktober']], ['jam berapa ya', ['\\d{1,2}[.:]\\d{2}', 'jam \\d']], ['selamat pagi', ['pagi', 'halo', 'hai']], ['cara download data ke excel', ['CSV', 'Excel']], ['lupa kode pin', ['PIN', 'kunci', 'Keamanan']], ['batalin yang tadi', ['hapus', 'batal', 'terakhir']], ['uangku cukup sampe gajian ga', ['gajian', 'uang bebas', M(O.FREE)]], ['gajian masih lama ga', ['24', '9 hari', 'gajian']], ['malam bot', ['malam', 'halo', 'hai']]],
  }[split];
  return T.map(([say, any]) => ({ turns: [{ say, check: Q(any) }] }));
});

// 9. Records and old abilities stay as they were (the new layer must not take them).
fam('keep', 'yang lama tetap', split => {
  const T = {
    dev: [[['kopi 25rb'], { record: { kind: 'expense', total: 25000 } }], [['gaji 8jt masuk jago'], { record: { kind: 'income', total: 8000000 } }], [['transfer 500rb dari jago ke gopay'], { record: { kind: 'transfer', total: 500000 } }], [['budi bayar 100rb'], { record: { kind: 'receivable_payment', total: 100000 } }], [['kopi 25rb', 'eh 30rb'], { record: { kind: 'expense', total: 30000 } }], [['kopi 25rb', 'sama roti 15rb'], { record: { kind: 'expense', total: 15000, has: ['roti'] } }], [['pengeluaran bulan ini berapa', 'kalau minggu lalu?'], Q([M(O.spend(P['minggu lalu']))])], [['saldo jago berapa', 'kalau gopay?'], Q([M(O.BALANCE.gopay)])]],
    heldout: [[['makan siang 30rb pakai gopay'], { record: { kind: 'expense', total: 30000 } }], [['bonus 1jt masuk jago'], { record: { kind: 'income', total: 1000000 } }], [['tf 200rb ke gopay dari jago'], { record: { kind: 'transfer', total: 200000 } }], [['dimas bayar 250rb'], { record: { kind: 'receivable_payment', total: 250000 } }], [['bensin 50rb', 'eh 60rb'], { record: { kind: 'expense', total: 60000 } }], [['nasi goreng 20rb', 'plus es teh 5rb'], { record: { kind: 'expense', total: 5000, has: ['es teh'] } }], [['pengeluaran minggu ini berapa', 'kalau bulan lalu?'], Q([M(O.spend(P['bulan lalu']))])], [['saldo gopay berapa', 'kalau jago?'], Q([M(O.BALANCE.jago)])]],
  }[split];
  return T.map(([turns, check]) => ({ turns: turns.map((say, i) => ({ say, bare: i > 0, check: i === turns.length - 1 ? check : {} })) }));
});

export const familyTitles = Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, f.title]));

/** Every case of a split, with its surface: the first turn gets words around it; follow-ups stay as written. */
export function build(split) {
  const r = rng(split === 'dev' ? 84 : 4084), out = [];
  for (const [key, f] of Object.entries(FAMILIES)) {
    f.make(split).forEach((c, i) => out.push({ id: `${key}-${i + 1}`, fam: key, voice: VOICES[Math.floor(r() * VOICES.length)], turns: c.turns.map((t, j) => ({ say: surface(t.say, split, r, j > 0 || t.bare), check: t.check })) }));
  }
  return out;
}
