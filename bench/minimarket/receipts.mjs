/**
 * Made-up minimarket receipts in the layouts real Indonesian chains print (40/42-column thermal paper, 32 for a small
 * shop's printer): four-column item rows, two-line items, weighed items, item and member discounts, PPN already in the
 * prices, cash with change or a card/QRIS/e-wallet. Every shop, address, number and person is invented; product names
 * are the abbreviations printed for common goods.
 *
 * makeSet(name, seed, count, split) → [{ id, style, lines: [{ text, kind }], truth }]; the same seed gives the same set.
 * Line kinds: 'l' as printed, 'bold', and the shop's name centred ('head') or in large letters ('big').
 * split 'hold' also draws products, shops and labels that 'dev' and 'train' never see; 'hold2' (7.3) its own other ones.
 */
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// [name, price]; the second list only in the hold-out set.
const PRODUCTS = [
  ['INDOMIE GRG SPC 85G', 3100], ['INDOMIE SOTO 70G', 3000], ['MIE SEDAAP GRG 90G', 3200], ['AQUA AIR MNRL 600ML', 3500], ['AQUA 1500ML', 6500],
  ['LE MINERALE 600ML', 3300], ['TEH PUCUK HRM 350ML', 3800], ['TEH BOTOL SSR 450ML', 5500], ['ULTRA MILK CKLT 250', 6200], ['ULTRA MILK FULL 1L', 19900],
  ['FRISIAN FLAG KNTL 370G', 13900], ['BEAR BRAND 189ML', 10900], ['POCARI SWEAT 500ML', 7900], ['YAKULT 5X65ML', 10500], ['GOOD DAY CAPP 250ML', 7200],
  ['KOPI KAPAL API 165G', 14900], ['NESCAFE CLASSIC 50G', 21900], ['SILVERQUEEN 58G', 14900], ['CHITATO SPCY 68G', 10500], ['QTELA SGKG BALADO', 9900],
  ['OREO VNL 133G', 9200], ['BENG BENG 20G', 2500], ['TANGO WAFER CKLT', 7500], ['ROMA KELAPA 300G', 9800], ['ROTI TAWAR SARI', 16900],
  ['SARI ROTI SOBEK CKLT', 15500], ['TELUR AYAM 10BTR', 27900], ['BERAS SANIA 5KG', 72500], ['GULA GULAKU 1KG', 17900], ['MINYAK BIMOLI 2L', 38900],
  ['MINYAK SANIA 1L', 19500], ['KECAP BANGO 520ML', 23900], ['SAUS ABC SMBL 335ML', 12900], ['ROYCO AYAM 100G', 6900], ['MASAKO SAPI 100G', 6500],
  ['GARAM REFINA 250G', 3900], ['TEPUNG SEGITIGA 1KG', 13500], ['SABUN LIFEBUOY 110G', 4500], ['SUNSILK SHMP 170ML', 25900], ['PANTENE SHMP 160ML', 27900],
  ['PEPSODENT 190G', 14500], ['SIKAT GIGI FORMULA', 9900], ['RINSO CAIR 800ML', 23900], ['SO KLIN PEWANGI 800ML', 13900], ['SUNLIGHT JRK NPS 755ML', 16900],
  ['TISU PASEO 250S', 18900], ['TISU NICE 180S', 9900], ['SOFTEX DAYLY 20S', 12500], ['MAMYPOKO PANTS L28', 79900], ['BAYGON AERO 600ML', 39900],
  ['AUTAN LOTION 50ML', 9900], ['TOLAK ANGIN CAIR', 4500], ['PROMAG 12S', 9900], ['MIZONE LYCHEE 500ML', 6000], ['FANTA STRWB 390ML', 6500],
  ['COCA COLA 390ML', 6500], ['SPRITE 1.5L', 15900], ['FLORIDINA ORG 360ML', 3800], ['GOLDA COFFEE 200ML', 3500], ['CLEO 1500ML', 6000],
  ['WALLS CORNETTO', 15000], ['WALLS PADDLE POP', 6000], ['SOSIS SO NICE', 4000], ['NUGGET FIESTA 500G', 49900], ['KORNET PRONAS 340G', 32900],
  ['SARDEN ABC 425G', 21900], ['SUSU DANCOW 800G', 105900], ['POP MIE AYAM 75G', 5500], ['SEDAAP CUP SOTO', 5200], ['HAPPY TOS MERAH', 10900],
  ['TARO NET 65G', 8900], ['POCKY CKLT 47G', 9500], ['KINDER JOY', 13500], ['CADBURY DM 62G', 19900], ['PERMEN RELAXA 120G', 6900],
  ['KACANG GARUDA 250G', 18900], ['BATERAI ABC AA 2S', 7900], ['KOREK GAS TOKAI', 3500], ['KANTONG PLASTIK', 200], ['ROTI SARI KEJU', 5500],
];
const PRODUCTS_HOLD = [
  ['SUSU BENDERA UHT 900ML', 18900], ['KOPI ABC SUSU 10S', 14500], ['TEH SARIWANGI 25S', 7900], ['MIE GELAS ISI 5', 6000], ['JETZ 55G', 7900],
  ['WAFER NABATI 145G', 7500], ['SARIMI ISI 2 AYAM', 3900], ['SABUN NUVO 100G', 3900], ['DETTOL CAIR 245ML', 29900], ['MOLTO ULTRA 900ML', 18900],
  ['DOWNY SACHET 6S', 6000], ['ZINC SHMP 170ML', 22900], ['CIPTADENT 190G', 9900], ['CHARM BODYFIT 20S', 15900], ['SGM EKSPLOR 400G', 47900],
  ['MILO ACTIV 300G', 34900], ['DELMONTE SAUS TOMAT', 12900], ['SEDAAP KECAP 520ML', 21900], ['ALE ALE JRK 200ML', 2000], ['KRATINGDAENG 150ML', 6500],
];
const WEIGHED = [['TELUR AYAM NEGRI', 28900], ['APEL FUJI', 39900], ['PISANG CAVENDISH', 24900], ['JERUK MEDAN', 29900], ['AYAM FILLET', 59900], ['BAWANG MERAH', 45900], ['TOMAT', 15900]];
const SHOPS = {
  idm: [['HEMATMART', 'PT. HEMAT RITEL NUSANTARA, TBK'], ['SURYAMART', 'PT. SURYA PRIMA RITELINDO'], ['MITRAMART', 'PT. MITRA NIAGA SENTOSA']],
  alfa: [['SENTOSAMART', 'PT. SENTOSA ALFA NIAGA, TBK'], ['PRIMAMART', 'PT. PRIMA RITEL MANDIRI'], ['CAHAYAMART', 'PT. CAHAYA SUMBER RITEL']],
  midi: [['PRIMAMIDI', 'PT. PRIMA MIDI UTAMA'], ['SEGAR SWALAYAN', 'PT. SEGAR PANGAN LESTARI']],
  cvs: [['BINTANG 24', 'PT. BINTANG CEPAT INDONESIA'], ['KILAT MART', 'PT. KILAT JAYA RITEL']],
  toko: [['TOKO BAROKAH JAYA', ''], ['TOKO SUMBER REJEKI', ''], ['MINIMARKET AMANAH', '']],
};
// 7.3: a second hold-out set ('hold2') with products, shops, labels and payments no other set uses.
const PRODUCTS_HOLD2 = [
  ['SUSU INDOMILK 190ML', 5500], ['KOPI GOOD DAY 10S', 13900], ['SABUN GIV 76G', 3500], ['SHAMPO CLEAR 160ML', 26900], ['PASTA GIGI CLOSE UP', 13500],
  ['BISKUIT KHONG GUAN', 39900], ['WAFER TANGO 176G', 9800], ['SARDEN BOTAN 155G', 12500], ['MIE SUKSES ISI 2', 3900], ['AIR VIT 600ML', 3000],
  ['TEH GELAS 170ML', 1500], ['SUSU BEAR BRAND GOLD', 11500], ['TISU MULTI 250S', 15900], ['DETERJEN DAIA 850G', 19900], ['PEMBALUT LAURIER 20S', 14900],
  ['KECAP ABC 520ML', 19900], ['MARGARIN BLUEBAND 200G', 10900], ['KEJU KRAFT 165G', 22900], ['SOSIS KANZLER 65G', 9900], ['ROTI SOBEK ROMA', 12500],
];
const SHOPS_HOLD2 = { idm: [['JAYAMART', 'PT. JAYA RITEL SEJAHTERA']], alfa: [['MAKMURMART', 'PT. MAKMUR ALFA SENTOSA, TBK']], midi: [['SWALAYAN BAHAGIA', 'PT. BAHAGIA PANGAN UTAMA']], cvs: [['TERANG 24', 'PT. TERANG MALAM RITEL']], toko: [['TOKO SINAR ABADI', '']] };
const LABELS_HOLD2 = {
  idm: { gross: ['JUMLAH HARGA'], total: ['TOTAL PEMBAYARAN'], change: ['KEMBALIAN UANG'], disc: ['DISKON ITEM'], saved: ['TOTAL HEMAT'] },
  alfa: { gross: ['Total Qty'], total: ['Total Pembelian'], change: ['Uang Kembali'], disc: ['Disc Item'], sumDisc: ['Total Potongan'] },
  midi: { gross: ['JUMLAH'], total: ['TOTAL BAYAR'], change: ['UANG KEMBALI'], disc: ['HEMAT'], member: ['DISC MEMBER CARD'] },
  cvs: { gross: ['Sub-Total'], cash: ['Uang Tunai'], change: ['Kembali'], disc: ['Promo'], sumDisc: ['Hemat Total'] },
  toko: { total: ['Grand Total'], cash: ['Uang'], change: ['Sisa'], disc: ['Disc'] },
};
const CARDS_HOLD2 = [['LINKAJA', 'linkaja'], ['DEBET BRI', 'debit'], ['KREDIT MANDIRI', 'credit'], ['QRIS BCA', 'qris']];
const SHOPS_HOLD = { idm: [['BERKAHMART', 'PT. BERKAH RITEL INDONESIA']], alfa: [['NUSAMART', 'PT. NUSA ALFA PRIMA, TBK']], midi: [['PASAR SEGAR', 'PT. PASAR SEGAR NIAGA']], cvs: [['MALAM 24', 'PT. MALAM TERANG RITEL']], toko: [['TOKO LANCAR MAKMUR', '']] };
const STREETS = ['JL. KENANGA RAYA NO.17', 'JL. ANGGREK NO.3', 'JL. MERPATI BLOK C2', 'JL. SUDIRMAN KM 4', 'JL. MELATI NO.21', 'RUKO MAWAR BLOK B5', 'JL. RAYA BOGOR NO.88'];
const CITIES = ['SLEMAN', 'KOTA BEKASI', 'DEPOK', 'TANGERANG SELATAN', 'BANDUNG', 'SURABAYA', 'BANTUL', 'MALANG'];
const CASHIERS = ['DEWI', 'RINA', 'ANDI', 'SITI', 'BUDI', 'NOVI', 'AGUS', 'YANTI'];
// Labels per style; an entry [label, 'hold'] is only used in the hold-out set.
const LABELS = {
  idm: { gross: ['HARGA JUAL', ['TOTAL HARGA', 'hold']], total: ['TOTAL', ['TOTAL BAYAR', 'hold']], cash: ['TUNAI'], change: ['KEMBALI', 'KEMBALIAN'], disc: ['DISC', 'POT. HARGA', ['POTONGAN', 'hold']], saved: ['ANDA HEMAT', ['HEMAT', 'hold']] },
  alfa: { gross: ['Total Item'], total: ['Total Belanja', ['Total Bayar', 'hold']], cash: ['Tunai'], change: ['Kembalian', ['Kembali', 'hold']], disc: ['Disc.', 'Hemat', ['Potongan', 'hold']], sumDisc: ['Total Disc.', ['Total Hemat', 'hold']] },
  midi: { gross: ['SUBTOTAL', ['SUB TOTAL', 'hold']], total: ['TOTAL', ['GRAND TOTAL', 'hold']], cash: ['TUNAI', 'CASH'], change: ['KEMBALI', 'KEMBALIAN'], disc: ['DISKON', 'DISC MEMBER', ['PROMO', 'hold']], member: ['DISKON MEMBER', 'VOUCHER', ['POTONGAN MEMBER', 'hold']] },
  cvs: { gross: ['Subtotal'], total: ['Total', ['Total Bayar', 'hold']], cash: ['Tunai', 'Cash'], change: ['Kembalian'], disc: ['Hemat', 'Diskon'], sumDisc: ['Total Hemat', ['Total Diskon', 'hold']] },
  toko: { gross: [], total: ['Total', 'TOTAL', ['Jumlah', 'hold']], cash: ['Bayar', 'Tunai', ['Dibayar', 'hold']], change: ['Kembali', 'Kembalian'], disc: ['Diskon', 'Potongan'] },
};
// [printed label, truth payment]; amounts as printed after the label.
const CARDS = [['DEBIT BCA', 'debit'], ['KARTU DEBIT', 'debit'], ['DEBIT MANDIRI', 'debit'], ['KARTU KREDIT', 'credit'], ['QRIS', 'qris'], ['GOPAY', 'gopay'], ['OVO', 'ovo'], ['DANA', 'dana'], ['SHOPEEPAY', 'shopeepay']];

export function makeSet(name, seed, count, split = 'dev') {
  const r = rng(seed), hold = split === 'hold', hold2 = split === 'hold2';
  const pick = list => list[Math.floor(r() * list.length)];
  const label = (style, key) => { const all = [...LABELS[style][key].filter(l => hold || !Array.isArray(l)), ...(hold2 ? LABELS_HOLD2[style][key] || [] : [])]; const l = pick(hold2 && LABELS_HOLD2[style][key] && r() < .6 ? LABELS_HOLD2[style][key] : all); return Array.isArray(l) ? l[0] : l; };
  const products = hold ? [...PRODUCTS, ...PRODUCTS_HOLD, ...PRODUCTS_HOLD] : hold2 ? [...PRODUCTS, ...PRODUCTS_HOLD2, ...PRODUCTS_HOLD2] : PRODUCTS;
  const out = [];
  for (let n = 0; n < count; n++) {
    const style = pick(['idm', 'idm', 'alfa', 'alfa', 'midi', 'cvs', 'toko', 'toko']);
    const [shop, company] = pick([...SHOPS[style], ...(hold ? SHOPS_HOLD[style] : []), ...(hold2 ? SHOPS_HOLD2[style] : [])]);
    const width = style === 'toko' ? (r() < .6 ? 32 : 40) : style === 'cvs' ? 42 : 40;
    const sep = style === 'toko' || style === 'cvs' ? '.' : ',', rp = style === 'cvs' && r() < .7 ? 'Rp ' : '';
    const num = v => (v < 0 ? '-' : '') + Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    const money = v => (v < 0 ? '-' : '') + rp + num(Math.abs(v));
    const lines = [], add = (text, kind = 'l') => lines.push({ text, kind });
    const center = s => ' '.repeat(Math.max(0, Math.floor((width - s.length) / 2))) + s;
    const pair = (a, b) => { const room = width - b.length - 1; return (a.length > room ? a.slice(0, room) : a).padEnd(room) + ' ' + b; };
    const rule = () => add((style === 'alfa' || style === 'cvs' ? '-' : r() < .5 ? '=' : '-').repeat(width));
    // Date and time.
    const day = 1 + Math.floor(r() * 28), month = 1 + Math.floor(r() * 12), hour = 7 + Math.floor(r() * 15), minute = Math.floor(r() * 60), second = Math.floor(r() * 60);
    const p2 = v => String(v).padStart(2, '0'), date = `2026-${p2(month)}-${p2(day)}`, time = `${p2(hour)}:${p2(minute)}`;
    // Items.
    const count = Math.max(1, Math.round(style === 'toko' ? 1 + r() * 6 : r() < .15 ? 18 + r() * 14 : 1 + r() * 9));
    const items = [], used = new Set();
    for (let i = 0; i < count; i++) {
      let p; do p = pick(products); while (used.has(p[0]) && used.size < products.length - 1); used.add(p[0]);
      const weighed = style === 'midi' && r() < .25;
      if (weighed) { const [wname, perKg] = pick(WEIGHED); const kg = Math.round((.2 + r() * 1.3) * 1000) / 1000; items.push({ name: wname, qty: 1, price: perKg, total: Math.round(kg * perKg), kg }); continue; }
      const qty = p[1] === 200 ? 1 : r() < .7 ? 1 : r() < .7 ? 2 : 3 + Math.floor(r() * 4);
      const item = { name: p[0], qty, price: p[1], total: qty * p[1] };
      if (r() < .12 && item.total >= 5000) item.discount = Math.min(item.total - 1000, (r() < .5 ? Math.round(item.total * pick([.1, .15, .2, .25]) / 100) * 100 : pick([500, 1000, 1500, 2000, 3000])));
      items.push(item);
    }
    const gross = items.reduce((s, i) => s + i.total, 0), itemDisc = items.reduce((s, i) => s + (i.discount || 0), 0);
    const memberDisc = style === 'midi' && r() < .3 ? pick([2000, 5000, 10000]) : 0;
    const total = gross - itemDisc - memberDisc;
    // Payment.
    let payment = 'cash', payLabel = label(style, 'cash'), paid, change = 0;
    if (r() < .45) { const [l, p] = pick(style === 'toko' ? [['QRIS', 'qris'], ['TRANSFER', 'transfer']] : hold2 ? [...CARDS, ...CARDS_HOLD2] : CARDS); payLabel = l; payment = p; paid = total; }
    else { const note = pick([1000, 5000, 10000, 20000, 50000, 50000, 100000]); paid = r() < .1 ? total : Math.ceil(total / note) * note; change = paid - total; }
    const dpp = Math.round(total / 1.11), ppn = total - dpp;
    const cashier = pick(CASHIERS), street = pick(STREETS), city = pick(CITIES);
    const npwp = `NPWP : 0${Math.floor(r() * 9)}.${100 + Math.floor(r() * 899)}.${100 + Math.floor(r() * 899)}.${Math.floor(r() * 9)}-${100 + Math.floor(r() * 899)}.000`;
    const truthItems = [];
    // Header.
    add(center(shop), r() < .6 ? 'big' : 'head');
    if (company) add(center(company));
    add(center(street)); if (style !== 'toko' || r() < .5) add(center(city));
    if (style === 'toko') add(center(`Telp 08${Math.floor(1e9 + r() * 8e9)}`.replace(/(\d{4})(\d{4})(\d+)$/, '$1-$2-$3')));
    else add(center(npwp));
    if (style === 'idm') add(pair(`${p2(day)}.${p2(month)}.26-${time}`, `2J${p2(1 + Math.floor(r() * 9))}/${cashier}`));
    if (style === 'alfa') add(pair(`Bon ${(1 + Math.floor(r() * 9))}A${Math.floor(r() * 90 + 10)}-1-${Math.floor(r() * 90000 + 10000)}`, `Kasir : ${cashier}`));
    if (style === 'midi') add(pair(`No: 3C${Math.floor(r() * 90 + 10)}-${Math.floor(r() * 9)}-${Math.floor(r() * 90000 + 10000)}`, `${p2(day)}/${p2(month)}/26 ${time}`));
    if (style === 'cvs') { add(pair(`${p2(day)}/${p2(month)}/2026 ${time}`, `No.${Math.floor(r() * 9000 + 1000)}-${Math.floor(r() * 9000 + 1000)}`)); add(`Kasir: 0${Math.floor(r() * 90 + 10)} ${cashier}`); }
    if (style === 'toko') { add(pair(`${p2(day)}-${p2(month)}-2026 ${time}`, `Kasir: ${r() < .5 ? 'ADMIN' : cashier}`)); add(`No: TRX-${String(Math.floor(r() * 99999)).padStart(6, '0')}`); }
    rule();
    // Item rows.
    const four = (name, qty, price, tot) => { const right = `${String(qty).padStart(3)}${num(price).padStart(8)}${num(tot).padStart(9)}`; const room = width - right.length - 1; return (name.length > room ? name.slice(0, room) : name).padEnd(room) + ' ' + right; };
    for (const it of items) {
      const shown = { ...it };
      if (it.kg) { add(it.name); add(pair(`   ${it.kg.toFixed(3)} KG x ${num(it.price)}`, num(it.total))); }
      else if (style === 'idm' || style === 'alfa' || (style === 'midi' && it.name.length <= width - 21)) { add(four(it.name, it.qty, it.price, it.total)); shown.name = it.name.slice(0, width - 21).trim(); }
      else if (style === 'cvs') { if (it.qty > 1) { add(it.name); add(pair(`  ${it.qty} @ ${money(it.price)}`, money(it.total))); } else add(pair(it.name, money(it.total))); }
      else { add(it.name); add(pair(`   ${it.qty} x ${num(it.price)}`, num(it.total))); }
      if (it.discount) add(pair(`   ${label(style, 'disc')}`, style === 'cvs' ? money(-it.discount) : num(-it.discount)));
      truthItems.push([shown.name, it.qty, it.total, ...(it.discount ? [{ discount: it.discount }] : [])]);
    }
    rule();
    // Summary.
    let subtotal = null;
    const sumRow = (l, v) => add(style === 'idm' ? pair(`${' '.repeat(Math.max(0, width - 30))}${l.padEnd(11)}:`, num(v)) : style === 'toko' ? pair(`${l.padEnd(10)}:`, num(v)) : pair(l, style === 'cvs' ? money(v) : num(v)));
    if (style === 'idm') { if (itemDisc || r() < .7) { sumRow(label(style, 'gross'), gross); subtotal = gross; } sumRow(label(style, 'total'), total); }
    if (style === 'alfa') { add(pair(`${label(style, 'gross')}`.padEnd(14) + String(items.reduce((s, i) => s + i.qty, 0)).padStart(4), num(gross))); subtotal = gross; if (itemDisc) add(pair(label(style, 'sumDisc'), num(-itemDisc))); add(pair(label(style, 'total'), num(total))); }
    if (style === 'midi') { add(pair(label(style, 'gross'), num(gross - itemDisc))); subtotal = gross - itemDisc; if (memberDisc) add(pair(label(style, 'member'), num(-memberDisc))); add(pair(label(style, 'total'), num(total)), 'bold'); }
    if (style === 'cvs') { if (itemDisc || r() < .6) { add(pair(label(style, 'gross'), money(gross))); subtotal = gross; } if (itemDisc) add(pair(label(style, 'sumDisc'), money(-itemDisc))); add(pair(label(style, 'total'), money(total)), 'bold'); }
    if (style === 'toko') { if (r() < .6) add(`Total Item : ${items.reduce((s, i) => s + i.qty, 0)}`); sumRow(label(style, 'total'), total); }
    // Payment.
    if (style === 'idm' || style === 'toko') { sumRow(payLabel, paid); if (payment === 'cash') sumRow(label(style, 'change'), change); }
    else { add(pair(payLabel, style === 'cvs' ? money(paid) : num(paid))); if (payment === 'cash') add(pair(label(style, 'change'), style === 'cvs' ? money(change) : num(change))); }
    // PPN inside the prices, and the footer.
    if (style === 'idm') { add(`PPN : DPP=${num(dpp)} PPN=${num(ppn)}`); rule(); if (itemDisc) add(pair(`${label(style, 'saved')} :`, num(itemDisc))); add(center(`LAYANAN KONSUMEN ${shop}`)); add(center(`SMS/WA 0811 ${Math.floor(r() * 9000 + 1000)} ${Math.floor(r() * 900 + 100)}`)); }
    if (style === 'alfa') { add(`PPN (${num(ppn).padStart(9)}) DPP (${num(dpp).padStart(10)})`); add(`Tgl. ${p2(day)}-${p2(month)}-2026 ${time}:${p2(second)} V.2026.${month}.0`); add(`Kritik&Saran:1500${Math.floor(r() * 900 + 100)}`); }
    if (style === 'midi') { rule(); if (r() < .6) { add(`MEMBER : 0812****${Math.floor(r() * 9000 + 1000)}`); add(`POIN DIDAPAT : ${Math.floor(total / 10000)}  TOTAL POIN : ${Math.floor(r() * 900 + 50)}`); } add(`PPN DPP: ${num(dpp)}  PPN: ${num(ppn)}`); add(center('TERIMA KASIH')); }
    if (style === 'cvs') { rule(); add(center('Harga sudah termasuk PPN')); add(center(`Telp. (021) 555-${Math.floor(r() * 9000 + 1000)}`)); }
    if (style === 'toko') { rule(); add(center('Terima Kasih Atas Kunjungan')); if (r() < .5) { add(center('Barang yg sdh dibeli tdk dpt')); add(center('ditukar/dikembalikan')); } }
    out.push({ id: `${name}-${String(n).padStart(3, '0')}`, style, width, lines, truth: {
      family: 'paper', type: style === 'midi' ? 'supermarket' : 'minimarket', merchant: shop, date, time, total, subtotal, items: truthItems,
      charges: memberDisc ? { discount: memberDisc } : {}, paid, change: change || null, payment,
    } });
  }
  return out;
}
