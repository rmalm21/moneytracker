/**
 * 10.3.1 — the two weak spots of 10.3 (bench/v103 held-out): transfers said without a transfer verb, and slang words
 * that end up in a record's name. Written before any 10.3.1 code, with new words and new sentence shapes, plus traps
 * that a fix could break: places and things the app does not know, and two records paid from two wallets (not a
 * transfer). On the accounts of bench/v102/state.mjs (Thursday 15 Oct 2026).
 *
 *   build('dev') / build('heldout')
 *
 * The two splits share no special word (verbs, slang, places, things), and none of them is in bench/v103. `SPECIAL`
 * lists them so the pembaca kalimat's corpus can prove it uses none, on either side (scripts/tagger-corpus.mjs): dev
 * then measures words the tagger never saw, like held-out does.
 */
const WALLETS = [['jago', 'jago'], ['gopay', 'gopay'], ['jenius', 'jenius'], ['mandiri', 'mandiri'], ['bri', 'bri'], ['krom', 'krom'], ['cash', 'cash'], ['tunai', 'cash']];
function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const MM = 'Makan & Minum', TR = 'Transportasi', TG = 'Tagihan';

const LEX = {
  dev: {
    verbs: ['oper', 'geser', 'kirim', 'alihin'],
    fillers: ['gan', 'bro', 'sis', 'njir', 'yaelah', 'astaga'],
    tails: ['sih', 'gitu', 'xixi'],
    items: [['kopi susu', MM], ['nasi goreng', MM], ['es teh', MM], ['bensin', TR], ['parkir', TR], ['martabak', MM]],
    places: [['kedai rindu', 'es kopi'], ['warkop mantap', 'indomie'], ['depot barokah', 'nasi rawon'], ['toko berkah', 'sabun'], ['resto sambal ijo', 'ayam bakar']],
    odd: ['basreng', 'cuanki', 'seblak ceker', 'cimol keju', 'tahu walik'],
    amounts: [7, 12, 18, 25, 33, 45, 60, 85, 120, 250],
    formats: [n => `${n}rb`, n => `${n}k`, n => `${n}.000`, n => `${n} ribu`],
  },
  heldout: {
    verbs: ['pindahkan', 'lempar', 'masukin', 'ngirim'],
    fillers: ['gais', 'bund', 'bosku', 'anjay', 'buset', 'ciee'],
    tails: ['kok', 'tuh', 'awokwok'],
    items: [['mie ayam', MM], ['bakso', MM], ['jus jeruk', MM], ['tol', TR], ['pulsa', TG], ['roti bakar', MM]],
    places: [['kedai senja', 'kopi gula aren'], ['warung mbok darmi', 'sayur asem'], ['depot rejeki', 'nasi pecel'], ['toko makmur jaya', 'deterjen'], ['kopitiam ah seng', 'roti srikaya']],
    odd: ['batagor kuah', 'cilor', 'telur gulung', 'otak otak', 'lumpia basah'],
    amounts: [9, 14, 22, 28, 38, 52, 70, 95, 140, 300],
    formats: [n => `${n}rb`, n => `${n}K`, n => `Rp${n}.000`, n => `${n}ribu`],
  },
};
/** Words for a kind of place every speaker knows ("kedai", "toko"): not special, only the names after them are. */
const GENERIC = new Set(['kedai', 'warkop', 'depot', 'toko', 'resto', 'warung', 'kopitiam']);
/** The special words of each split (what the tagger's corpus must never contain): verbs, slang, place names, odd things. */
export const SPECIAL = Object.fromEntries(Object.entries(LEX).map(([k, L]) => [k, [...L.verbs, ...L.fillers, ...L.tails, ...L.places.map(p => p[0]), ...L.odd].flatMap(w => w.split(' ')).filter(w => !GENERIC.has(w))]));

function families(split) {
  const L = LEX[split], dev = split === 'dev';
  const amount = rnd => { const n = pick(rnd, L.amounts); return { text: pick(rnd, L.formats)(n), value: n * 1000 }; };
  const wallet = (rnd, not) => { let w; do w = pick(rnd, WALLETS); while (not && w[1] === not); return { word: w[0], id: w[1] }; };
  return {
    // Between two of one's own wallets, with an unknown verb or none.
    transfer: rnd => {
      const a = amount(rnd), w1 = wallet(rnd), w2 = wallet(rnd, w1.id), v = pick(rnd, L.verbs);
      const shapes = dev
        ? [`${w1.word} ke ${w2.word} ${a.text}`, `${v} ${a.text} dari ${w1.word} ke ${w2.word}`, `${v} ${a.text} ${w1.word} ke ${w2.word}`, `${a.text} ${w1.word} ke ${w2.word}`]
        : [`${w1.word} ${a.text} ke ${w2.word}`, `${v} ${a.text} ke ${w2.word} dari ${w1.word}`, `dari ${w1.word} ke ${w2.word} ${a.text}`, `${v} ${w1.word} ke ${w2.word} ${a.text}`];
      return { text: pick(rnd, shapes), want: { kind: 'transfer', total: a.value, wallet: w1.id, to: w2.id } };
    },
    // Slang around a record: it must not end up in the name.
    seru: rnd => {
      const [it, cat] = pick(rnd, L.items), a = amount(rnd), w = wallet(rnd), f = pick(rnd, L.fillers), t = pick(rnd, L.tails);
      const shapes = dev
        ? [`${f}, ${it} ${a.text} pake ${w.word}`, `${it} ${a.text} ${f} pake ${w.word} ${t}`, `${it} ${a.text} ${w.word} ${f}`]
        : [`${f} ${it} ${a.text} via ${w.word}`, `${it} ${a.text} via ${w.word} ${f} ${t}`, `${f}, ${a.text} buat ${it} ${w.word}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, wallet: w.id, cat, item: it, clean: [f, t, w.word] } };
    },
    // A place the app does not know: it must stay the place.
    tempat: rnd => {
      const [pl, it] = pick(rnd, L.places), a = amount(rnd), w = wallet(rnd);
      const shapes = dev
        ? [`${it} ${a.text} ${pl} ${w.word}`, `${pl} ${it} ${a.text} pake ${w.word}`, `${it} di ${pl} ${a.text}`]
        : [`${pl} ${a.text} ${w.word}`, `${it} ${a.text} ${pl} via ${w.word}`, `beli ${it} di ${pl} ${a.text} ${w.word}`];
      const text = pick(rnd, shapes), withWallet = text.includes(w.word);
      return { text, want: { kind: 'expense', total: a.value, ...(withWallet ? { wallet: w.id } : {}), place: pl, clean: withWallet ? [w.word] : [] } };
    },
    // A thing the app does not know: it must stay the name.
    barang: rnd => {
      const it = pick(rnd, L.odd), a = amount(rnd), w = wallet(rnd);
      const shapes = dev ? [`${it} ${a.text} ${w.word}`, `${it} ${a.text} pake ${w.word}`, `${w.word} ${it} ${a.text}`] : [`${it} ${w.word} ${a.text}`, `${a.text} ${it} ${w.word}`, `beli ${it} ${a.text} via ${w.word}`];
      return { text: pick(rnd, shapes), want: { kind: 'expense', total: a.value, wallet: w.id, item: it, clean: [w.word] } };
    },
    // Two things paid from two wallets: two records, not a transfer.
    duadompet: rnd => {
      const [i1, c1] = pick(rnd, L.items); let i2 = pick(rnd, L.items); while (i2[0] === i1) i2 = pick(rnd, L.items);
      const a1 = amount(rnd), a2 = amount(rnd), w1 = wallet(rnd), w2 = wallet(rnd, w1.id);
      const text = dev ? `${i1} ${a1.text} ${w1.word}, ${i2[0]} ${a2.text} ${w2.word}` : `${i1} ${a1.text} pake ${w1.word} terus ${i2[0]} ${a2.text} pake ${w2.word}`;
      return { text, want: { count: 2, records: [{ kind: 'expense', total: a1.value, wallet: w1.id, cat: c1 }, { kind: 'expense', total: a2.value, wallet: w2.id, cat: i2[1] }] } };
    },
  };
}

export const FAMILIES = { transfer: 'Antardompet tanpa kata kerja / kata kerja baru', seru: 'Kata seru di sekitar catatan', tempat: 'Tempat yang belum dikenal (jebakan)', barang: 'Barang yang belum dikenal (jebakan)', duadompet: 'Dua catatan, dua dompet (jebakan)' };

export function build(split, per = 120) {
  const rnd = random(split === 'dev' ? 3101 : 9311), fam = families(split), out = [], seen = new Set();
  for (const [name, make] of Object.entries(fam)) {
    let made = 0, tries = 0;
    while (made < per && tries++ < per * 30) {
      const c = make(rnd);
      if (seen.has(c.text)) continue;
      seen.add(c.text); made++;
      out.push({ id: `${split === 'dev' ? 'd' : 'h'}-${name}-${made}`, fam: name, ...c });
    }
  }
  return out;
}
