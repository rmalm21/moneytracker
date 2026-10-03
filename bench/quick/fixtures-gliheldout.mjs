/**
 * General Language Intelligence v1.0 — held-out set. Written after the language pack was frozen, with forms that
 * appear nowhere in the dev set, the curated tables or the tests; run once before any change (first run frozen in
 * bench/quick/heldout-first/gli-heldout-first.json). Same format as fixtures-glidev.mjs.
 */
export const cases = [
  // A: canonical
  { id: 'ha1', group: 'A', text: 'beli sepatu 350rb jago', expect: { kind: 'expense', amount: 350000, wallet: 'jago', cat: 'shop' } },
  { id: 'ha2', group: 'A', text: 'bayar internet 300rb mandiri', expect: { kind: 'expense', amount: 300000, wallet: 'mandiri', cat: 'net' } },
  { id: 'ha3', group: 'A', text: 'kemarin minum es teh 5rb cash', expect: { kind: 'expense', amount: 5000, wallet: 'cash', date: '2026-10-14', cat: 'drink' } },
  { id: 'ha4', group: 'A', text: 'bonus masuk 1jt jenius', expect: { kind: 'income', amount: 1000000, wallet: 'jenius' } },
  { id: 'ha5', group: 'A', text: 'beli krim wajah 60rb gopay', expect: { kind: 'expense', amount: 60000, wallet: 'gopay' } },
  { id: 'ha6', group: 'A', text: 'naik kereta ke kota 8rb bri', expect: { kind: 'expense', amount: 8000, wallet: 'bri', cat: 'trans' } },
  { id: 'ha7', group: 'A', text: 'langganan netflix 54rb jago', expect: { kind: 'expense', amount: 54000, wallet: 'jago' } },
  { id: 'ha8', group: 'A', text: 'dina bayar 20rb ke jago', expect: { kind: 'receivable_payment', amount: 20000, wallet: 'jago' } },
  // B: unseen variants
  { id: 'hb1', group: 'B', text: 'sptu 350k jago', expect: { amount: 350000, description: 'Sepatu', wallet: 'jago', cat: 'shop' } },
  { id: 'hb2', group: 'B', text: 'byr intrnt 300k mandiri', expect: { amount: 300000, wallet: 'mandiri', cat: 'net' } },
  { id: 'hb3', group: 'B', text: 'kmaren mnum es teh 5k cash', expect: { amount: 5000, wallet: 'cash', date: '2026-10-14', cat: 'drink' } },
  { id: 'hb4', group: 'B', text: 'bns msk 1jt jenius', expect: { kind: 'income', amount: 1000000, wallet: 'jenius' } },
  { id: 'hb5', group: 'B', text: 'lngganan netflix 54k jago', expect: { amount: 54000, wallet: 'jago' } },
  { id: 'hb6', group: 'B', text: 'srapan 17k krom', expect: { amount: 17000, description: 'Sarapan', wallet: 'krom', cat: 'food' } },
  { id: 'hb7', group: 'B', text: 'sraapn 17k krom', expect: { amount: 17000, wallet: 'krom' } },
  { id: 'hb8', group: 'B', text: 'mkan siang 35k jago', expect: { amount: 35000, wallet: 'jago', cat: 'food' } },
  { id: 'hb9', group: 'B', text: 'parkr motor 3k cash', expect: { amount: 3000, wallet: 'cash', cat: 'park' } },
  { id: 'hb10', group: 'B', text: 'bensinn 60k jago', expect: { amount: 60000, description: 'Bensin', wallet: 'jago', cat: 'fuel' } },
  { id: 'hb11', group: 'B', text: 'blnjaa 90k mandiri', expect: { amount: 90000, description: 'Belanja', wallet: 'mandiri', cat: 'shop' } },
  { id: 'hb12', group: 'B', text: 'ongkr 12k gopay', expect: { amount: 12000, wallet: 'gopay' } },
  { id: 'hb13', group: 'B', text: 'bayar tghan listrik 180k mandiri', expect: { amount: 180000, wallet: 'mandiri', cat: 'bills' } },
  { id: 'hb14', group: 'B', text: 'bensin40k jago', expect: { amount: 40000, description: 'Bensin', wallet: 'jago', cat: 'fuel' } },
  { id: 'hb15', group: 'B', text: 'parkir=3rb cash', expect: { amount: 3000, description: 'Parkir', wallet: 'cash' } },
  { id: 'hb16', group: 'B', text: 'masukin jajan 12k krom hehe', expect: { amount: 12000, description: 'Jajan', wallet: 'krom' } },
  { id: 'hb17', group: 'B', text: 'mkn 40k bareng keluarga jago', expect: { amount: 40000, description: 'Makan', wallet: 'jago' } },
  { id: 'hb18', group: 'B', text: 'tf 200k dr mandiri ke gopay', expect: { kind: 'transfer', amount: 200000, wallet: 'mandiri', to: 'gopay' } },
  { id: 'hb19', group: 'B', text: 'gw minjem 50k ke rudi', expect: { kind: 'debt_new', amount: 50000, person: 'Rudi' } },
  { id: 'hb20', group: 'B', text: 'kmrn plng kntor naik ojek 25k gopay', expect: { amount: 25000, wallet: 'gopay', date: '2026-10-14', cat: 'trans' } },
  { id: 'hb21', group: 'B', text: 'kmrn srpan 15k trus bnsin 30k jago', expect: { actions: [{ amount: 15000, description: 'Sarapan', date: '2026-10-14' }, { amount: 30000, description: 'Bensin', date: '2026-10-14' }] } },
  { id: 'hb22', group: 'B', text: 'pesenin grabfood 50k gopay', expect: { amount: 50000, wallet: 'gopay', cat: 'food' } },
  // C: adversarial
  { id: 'hc1', group: 'C', text: 'ngopi di PRKR Coffee 28k jago', keep: ['prkr'], expect: { amount: 28000, merchant: 'Prkr Coffee', wallet: 'jago', notCat: 'park' } },
  { id: 'hc2', group: 'C', text: 'Bnsn ngutang 40k', keep: ['bnsn'], expect: { kind: 'receivable_new', amount: 40000, person: 'Bnsn' } },
  { id: 'hc3', group: 'C', text: 'makan di Goceng Resto 35k jago', keep: ['goceng'], expect: { amount: 35000, wallet: 'jago' } },
  { id: 'hc4', group: 'C', text: 'beli tiket ke kuta 900rb jago', keep: ['kuta'], expect: { amount: 900000, wallet: 'jago' } },
  { id: 'hc5', group: 'C', text: 'beli plang toko 150rb cash', keep: ['plang'], expect: { amount: 150000, wallet: 'cash' } },
  { id: 'hc6', group: 'C', text: 'aldi ngutang 30k, sinta ngutang 20k', expect: { actions: [{ kind: 'receivable_new', amount: 30000, person: 'Aldi' }, { kind: 'receivable_new', amount: 20000, person: 'Sinta' }] } },
  { id: 'hc7', group: 'C', text: 'gaji transferan 5jt jenius', expect: { kind: 'income', amount: 5000000, wallet: 'jenius' } },
  { id: 'hc8', group: 'C', text: 'beli mie ayam 15rb sing enak', expect: { amount: 15000 } },
  { id: 'hc9', group: 'C', text: 'belanja di SPTU Store 200k jago', keep: ['sptu'], expect: { amount: 200000, merchant: 'Sptu Store', wallet: 'jago' } },
  { id: 'hc10', group: 'C', text: 'jajan 10k di kantin kampus', expect: { amount: 10000 } },
];
