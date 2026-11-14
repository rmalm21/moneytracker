/**
 * 10.3 Asisten chat 4.0 — free-written records, generated with the answer for every part (kind, amount, wallet, date,
 * main category, what was bought, where), on the accounts of bench/v102/state.mjs (Thursday 15 Oct 2026).
 *
 *   build('dev') / build('heldout')
 *
 * The two splits share no list: items, places, income sources, wallet misspellings, amount spellings, slang, days,
 * fillers, people and sentence shapes are written twice, once for each split. Only the account's own wallet names and
 * the numbers are common. So a reader that learned the dev shapes (or the sentences it was trained on) is caught out by
 * the held-out set. Written before any 4.0 code, and the held-out split is run once, at the end.
 */
const TODAY = '2026-10-15';

function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// What was bought, its main category (null: not checked, it could fairly be read two ways).
const LEX = {
  dev: {
    items: [['kopi', 'Makan & Minum'], ['bakso', 'Makan & Minum'], ['nasi goreng', 'Makan & Minum'], ['mie ayam', 'Makan & Minum'], ['es teh', 'Makan & Minum'], ['martabak', 'Makan & Minum'], ['nasi padang', 'Makan & Minum'], ['bensin', 'Transportasi'], ['parkir', 'Transportasi'], ['pulsa', 'Tagihan'], ['listrik', 'Tagihan'], ['obat', 'Kesehatan'], ['laundry', 'Rumah & Kebutuhan'], ['potong rambut', 'Personal'], ['tiket bioskop', 'Nongkrong & Hiburan'], ['kaos', 'Belanja'], ['spotify', 'Langganan']],
    english: [['lunch', 'Makan & Minum'], ['dinner', 'Makan & Minum'], ['coffee', 'Makan & Minum'], ['snack', 'Makan & Minum']],
    places: [['warteg bahari', 'Makan & Minum'], ['kopi kenangan', 'Makan & Minum'], ['mcd', 'Makan & Minum'], ['indomaret', null], ['shopee', 'Belanja'], ['apotek k24', 'Kesehatan'], ['shell', 'Transportasi']],
    placeItems: { 'warteg bahari': ['nasi', 'makan siang'], 'kopi kenangan': ['kopi susu', 'es kopi'], mcd: ['burger', 'paket ayam'], indomaret: ['sabun', 'tisu'], shopee: ['kaos', 'charger'], 'apotek k24': ['obat flu', 'vitamin c'], shell: ['bensin', 'v-power'] },
    income: [['gaji', 'Gaji'], ['bonus', 'Gaji'], ['hasil jualan kue', 'Penghasilan Tambahan'], ['fee freelance', 'Penghasilan Tambahan'], ['cashback', 'Penghasilan Keuangan']],
    typos: { gopay: ['gopey', 'gopy'], mandiri: ['mandri', 'mandirii'], jenius: ['jenuis'], jago: ['jagoo'], krom: ['kromm'] },
    walletLead: ['pake', 'pakai', 'via', 'lewat', 'bayar pake', ''],
    dates: [['kemarin', '2026-10-14'], ['kmrn', '2026-10-14'], ['tadi pagi', TODAY], ['senin', '2026-10-12'], ['tgl 12', '2026-10-12'], ['2 hari lalu', '2026-10-13'], ['hari selasa', '2026-10-13']],
    amounts: [5, 8, 12, 15, 18, 20, 25, 30, 35, 45, 60, 75, 120, 150],
    formats: [n => `${n}rb`, n => `${n}k`, n => `${n} ribu`, n => `${n}.000`, n => `Rp${n}.000`, n => `rp ${n}rb`],
    slang: [['goceng', 5000], ['ceban', 10000], ['gocap', 50000]],
    words: [['dua puluh ribu', 20000], ['lima belas ribu', 15000], ['seratus ribu', 100000]],
    fillers: ['eh', 'btw', 'td', 'barusan', 'gue', 'aku'],
    tails: ['', 'ya', 'wkwk', 'dong'],
    people: ['budi', 'sari'],
  },
  heldout: {
    items: [['siomay', 'Makan & Minum'], ['cilok', 'Makan & Minum'], ['soto ayam', 'Makan & Minum'], ['roti bakar', 'Makan & Minum'], ['jus alpukat', 'Makan & Minum'], ['nasi uduk', 'Makan & Minum'], ['pertalite', 'Transportasi'], ['tol', 'Transportasi'], ['token listrik', 'Tagihan'], ['paket data', 'Tagihan'], ['vitamin', 'Kesehatan'], ['cukur rambut', 'Personal'], ['nonton bioskop', 'Nongkrong & Hiburan'], ['celana', 'Belanja'], ['netflix', 'Langganan'], ['gas elpiji', null]],
    english: [['breakfast', 'Makan & Minum'], ['groceries', null], ['parking', 'Transportasi']],
    places: [['warung bu tini', 'Makan & Minum'], ['janji jiwa', 'Makan & Minum'], ['kfc', 'Makan & Minum'], ['alfamart', null], ['lazada', 'Belanja'], ['kimia farma', 'Kesehatan'], ['pertamina', 'Transportasi']],
    placeItems: { 'warung bu tini': ['nasi rames', 'gorengan'], 'janji jiwa': ['kopi aren', 'es coklat'], kfc: ['ayam goreng', 'paket nasi'], alfamart: ['shampo', 'air mineral'], lazada: ['celana', 'casing hp'], 'kimia farma': ['obat batuk', 'masker'], pertamina: ['pertalite', 'pertamax'] },
    income: [['lembur', 'Gaji'], ['insentif', 'Gaji'], ['thr', 'Gaji'], ['hasil jualan baju', 'Penghasilan Tambahan'], ['komisi', 'Penghasilan Tambahan'], ['bunga deposito', 'Penghasilan Keuangan']],
    typos: { gopay: ['gopai', 'gpay'], mandiri: ['mndiri', 'mandirri'], jenius: ['jeniuss'], jago: ['jaggo'], krom: ['krm'] },
    walletLead: ['pk', 'pakek', 'bayarnya', 'dr', ''],
    dates: [['kemaren', '2026-10-14'], ['td siang', TODAY], ['rabu', '2026-10-14'], ['tanggal 11', '2026-10-11'], ['3 hari lalu', '2026-10-12'], ['kemarin lusa', '2026-10-13'], ['hari minggu', '2026-10-11'], ['jumat lalu', '2026-10-09']],
    amounts: [6, 9, 11, 14, 16, 22, 27, 32, 40, 55, 65, 80, 110, 175],
    formats: [n => `${n} rebu`, n => `${n}K`, n => `Rp ${n}.000,-`, n => `${n}000`, n => `${n}rbu`, n => `${n}ribu`],
    slang: [['noceng', 2000], ['goban', 50000], ['cepek', 100000]],
    words: [['tiga puluh lima ribu', 35000], ['dua puluh lima rebu', 25000], ['tujuh ribu lima ratus', 7500]],
    fillers: ['cuy', 'duh', 'hadeh', 'anw', 'lur', 'bestie'],
    tails: ['', 'nih', 'deh', 'hehe'],
    people: ['dimas', 'rina'],
  },
};
const WALLETS = [['jago', 'jago'], ['gopay', 'gopay'], ['jenius', 'jenius'], ['mandiri', 'mandiri'], ['bri', 'bri'], ['krom', 'krom'], ['cash', 'cash'], ['tunai', 'cash']];
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const tidy = s => s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();

/** Each family: how a sentence is written, and what it says. `S` holds this split's pieces. */
function families(split) {
  const L = LEX[split], dev = split === 'dev';
  const amount = rnd => { const n = pick(rnd, L.amounts); return { text: pick(rnd, L.formats)(n), value: n * 1000 }; };
  const wallet = rnd => { const [word, id] = pick(rnd, WALLETS); return { word, id }; };
  const lead = rnd => pick(rnd, L.walletLead);
  const item = rnd => { const [word, cat] = pick(rnd, L.items); return { word, cat }; };
  const date = rnd => { const [word, iso] = pick(rnd, L.dates); return { word, iso }; };
  return {
    // Word order: the parts in any order.
    urutan: rnd => {
      const it = item(rnd), a = amount(rnd), w = wallet(rnd), d = date(rnd), l = lead(rnd);
      const wp = l ? `${l} ${w.word}` : w.word;
      const orders = dev
        ? [[it.word, a.text, wp, d.word], [d.word, it.word, a.text, wp], [wp, it.word, a.text], [a.text, it.word, wp, d.word]]
        : [[it.word, wp, a.text, d.word], [d.word, wp, it.word, a.text], [a.text, wp, it.word], [it.word, d.word, a.text, wp]];
      const parts = pick(rnd, orders), withDate = parts.includes(d.word);
      return { text: tidy(parts.join(' ')), want: { kind: 'expense', total: a.value, wallet: w.id, ...(withDate ? { date: d.iso } : {}), cat: it.cat, item: it.word, clean: [w.word, d.word] } };
    },
    // No linking words: the wallet or the place bare, anywhere.
    polos: rnd => {
      const [place, cat] = pick(rnd, L.places), thing = pick(rnd, L.placeItems[place]), a = amount(rnd), w = wallet(rnd);
      const shapes = dev
        ? [`${place} ${a.text} ${w.word}`, `${w.word} ${place} ${thing} ${a.text}`, `${thing} ${place} ${a.text} ${w.word}`]
        : [`${place} ${w.word} ${a.text}`, `${a.text} ${place} ${w.word}`, `${place} ${thing} ${w.word} ${a.text}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, wallet: w.id, cat, place, clean: [w.word] } };
    },
    // A wallet name typed wrong.
    typo: rnd => {
      const it = item(rnd), a = amount(rnd), id = pick(rnd, Object.keys(L.typos)), typo = pick(rnd, L.typos[id]), l = lead(rnd);
      const wp = l ? `${l} ${typo}` : typo;
      const shapes = dev ? [`${it.word} ${a.text} ${wp}`, `${wp} ${it.word} ${a.text}`] : [`${it.word} ${wp} ${a.text}`, `${a.text} ${it.word} ${wp}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, wallet: id, cat: it.cat, item: it.word, clean: [typo] } };
    },
    // How much, written every way.
    nominal: rnd => {
      const it = item(rnd), kind = rnd();
      const a = kind < 0.5 ? amount(rnd) : kind < 0.75 ? (([t, v]) => ({ text: t, value: v }))(pick(rnd, L.slang)) : (([t, v]) => ({ text: t, value: v }))(pick(rnd, L.words));
      const shapes = dev ? [`${it.word} ${a.text}`, `${a.text} ${it.word}`, `beli ${it.word} ${a.text}`] : [`${it.word} abis ${a.text}`, `${a.text} buat ${it.word}`, `${it.word} kena ${a.text}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, cat: it.cat, item: it.word } };
    },
    // Where it was bought, with and without "di".
    tempat: rnd => {
      const [place, cat] = pick(rnd, L.places), thing = pick(rnd, L.placeItems[place]), a = amount(rnd);
      const shapes = dev ? [`beli ${thing} di ${place} ${a.text}`, `${thing} di ${place} ${a.text}`, `${place} ${thing} ${a.text}`] : [`${thing} ${a.text} di ${place}`, `jajan ${thing} ke ${place} ${a.text}`, `${place}: ${thing} ${a.text}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, cat, place, clean: [] } };
    },
    // When, anywhere in the sentence.
    waktu: rnd => {
      const it = item(rnd), a = amount(rnd), d = date(rnd);
      const shapes = dev ? [`${d.word} ${it.word} ${a.text}`, `${it.word} ${a.text} ${d.word}`, `${it.word} ${d.word} ${a.text}`] : [`${it.word} ${a.text} itu ${d.word}`, `${d.word} sempet ${it.word} ${a.text}`, `${a.text} ${it.word} ${d.word}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, date: d.iso, cat: it.cat, item: it.word, clean: [d.word] } };
    },
    // Money in.
    masuk: rnd => {
      const [src, cat] = pick(rnd, L.income), a = amount(rnd), w = wallet(rnd);
      const shapes = dev ? [`${src} ${a.text} masuk ${w.word}`, `dapet ${src} ${a.text} ke ${w.word}`, `terima ${src} ${a.text} di ${w.word}`] : [`${src} cair ${a.text} di ${w.word}`, `alhamdulillah ${src} ${a.text} masuk ${w.word}`, `${w.word} ketambahan ${src} ${a.text}`];
      return { text: pick(rnd, shapes), want: { kind: 'income', total: a.value, wallet: w.id, cat, clean: [] } };
    },
    // Between two wallets of one's own.
    transfer: rnd => {
      const a = amount(rnd); let w1 = wallet(rnd), w2 = wallet(rnd);
      while (w2.id === w1.id) w2 = wallet(rnd);
      const shapes = dev ? [`pindahin ${a.text} dari ${w1.word} ke ${w2.word}`, `tf ${a.text} ${w1.word} ke ${w2.word}`, `top up ${w2.word} ${a.text} dari ${w1.word}`] : [`mindahin ${a.text} dr ${w1.word} ke ${w2.word}`, `isi saldo ${w2.word} ${a.text} pake ${w1.word}`, `${w1.word} ke ${w2.word} ${a.text}`];
      return { text: pick(rnd, shapes), want: { kind: 'transfer', total: a.value, wallet: w1.id, to: w2.id } };
    },
    // Everyday chatter around the record, and English.
    gaul: rnd => {
      const english = rnd() < 0.35, [word, cat] = english ? pick(rnd, L.english) : pick(rnd, L.items), a = amount(rnd), w = wallet(rnd);
      const f = pick(rnd, L.fillers), tail = pick(rnd, L.tails);
      const shapes = dev ? [`${f} ${word} ${a.text} pake ${w.word} ${tail}`, `${f} abis ${word} ${a.text} ${w.word} ${tail}`] : [`${f}, ${word} ${a.text} ${w.word} ${tail}`, `${word} ${a.text} ${f} pk ${w.word} ${tail}`];
      return { text: tidy(pick(rnd, shapes)), want: { kind: 'expense', total: a.value, wallet: w.id, cat, item: word, clean: [w.word, f] } };
    },
    // Two records in one message.
    multi: rnd => {
      const i1 = item(rnd); let i2 = item(rnd); while (i2.word === i1.word) i2 = item(rnd);
      const a1 = amount(rnd), a2 = amount(rnd), w = wallet(rnd);
      const shapes = dev ? [`${i1.word} ${a1.text}, ${i2.word} ${a2.text} pake ${w.word}`, `${i1.word} ${a1.text} sama ${i2.word} ${a2.text} ${w.word}`] : [`${i1.word} ${a1.text} trus ${i2.word} ${a2.text} pk ${w.word}`, `${w.word}: ${i1.word} ${a1.text}; ${i2.word} ${a2.text}`];
      return { text: pick(rnd, shapes), want: { count: 2, records: [{ kind: 'expense', total: a1.value, wallet: w.id, cat: i1.cat, item: i1.word }, { kind: 'expense', total: a2.value, wallet: w.id, cat: i2.cat, item: i2.word }] } };
    },
    // Someone else in the sentence: paid for them, or got money from them (a person, not a wallet or an item).
    orang: rnd => {
      const p = pick(rnd, L.people), it = item(rnd), a = amount(rnd), w = wallet(rnd);
      const shapes = dev ? [`bayarin ${it.word} ${p} ${a.text} pake ${w.word}`, `${it.word} buat ${p} ${a.text} ${w.word}`] : [`traktir ${p} ${it.word} ${a.text} pk ${w.word}`, `${it.word} ${a.text} buat si ${p} ${w.word}`];
      // "bayarin" can fairly be a treat or money lent: the kind is not checked.
      return { text: pick(rnd, shapes), want: { total: a.value, wallet: w.id, clean: [w.word] } };
    },
  };
}

/** Chat follow-ups with a misspelled wallet or category (a card without them comes first). */
function chatCases(split, rnd, n) {
  const L = LEX[split], out = [];
  const catWords = split === 'dev' ? [['makan malem', 'Makan Malam'], ['transprot', 'Transportasi'], ['jajann', 'Jajan']] : [['mkn siang', 'Makan Siang'], ['trasnportasi', 'Transportasi'], ['bensinn', 'Bensin']];
  const fixLead = split === 'dev' ? ['eh dompetnya', 'pake', 'eh salah, pake'] : ['bukan cash tp', 'dompetnya', 'pk'];
  for (let i = 0; i < n; i++) {
    const it = pick(rnd, L.items), amt = pick(rnd, L.amounts) * 1000;
    if (rnd() < 0.5) {
      const id = pick(rnd, Object.keys(L.typos)), typo = pick(rnd, L.typos[id]);
      out.push({ turns: [{ say: `${it[0]} ${amt / 1000}rb` }, { say: `${pick(rnd, fixLead)} ${typo}`, check: { rec: { kind: 'expense', total: amt, wallet: id } } }] });
    } else {
      const [word, cat] = pick(rnd, catWords);
      out.push({ turns: [{ say: `abis ${amt / 1000}rb` }, { say: `masuk ${word}`, check: { rec: { kind: 'expense', total: amt, cat } } }] });
    }
  }
  return out;
}

export const FAMILIES = { urutan: 'Urutan bebas', polos: 'Tanpa kata sambung', typo: 'Dompet salah ketik', nominal: 'Nominal macam-macam', tempat: 'Tempat', waktu: 'Waktu', masuk: 'Uang masuk', transfer: 'Antardompet', gaul: 'Gaul & Inggris', multi: 'Dua catatan sekaligus', orang: 'Ada orang lain', chat: 'Susulan di chat (salah ketik)' };

export function build(split, per = 140) {
  const rnd = random(split === 'dev' ? 1031 : 7717), fam = families(split), out = [], seen = new Set();
  for (const [name, make] of Object.entries(fam)) {
    let made = 0, tries = 0;
    while (made < per && tries++ < per * 20) {
      const c = make(rnd);
      if (seen.has(c.text)) continue;
      seen.add(c.text); made++;
      out.push({ id: `${split === 'dev' ? 'd' : 'h'}-${name}-${made}`, fam: name, ...c });
    }
  }
  chatCases(split, rnd, per).forEach((c, i) => out.push({ id: `${split === 'dev' ? 'd' : 'h'}-chat-${i + 1}`, fam: 'chat', ...c }));
  return out;
}

/** The word lists, for the 10.3 tagger corpus to prove it uses none of the held-out words (scripts/tagger-corpus.mjs). */
export { LEX };
