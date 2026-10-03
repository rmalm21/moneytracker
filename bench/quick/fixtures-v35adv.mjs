/**
 * Catat otomatis V3.5 — adversarial collision set (C, §146–150). Wallet next to / inside a place, "dan" between items vs
 * between events, item category vs activity, a place that looks like a common word, sentences the composer must leave
 * to the relationship / operation engines (debts, transfers, splits, budgets, new categories).
 * `noDetails`: no item list may be read; `noMerchant`: no place may be invented.
 */
export const cases = [
  { id: 'c1', group: 'collision', text: 'nongkrong 77k di kongsi tiam krom', expect: { merchant: 'Kongsi Tiam', wallet: 'krom' } },
  { id: 'c2', group: 'collision', text: 'belanja 120k di Krom Store jago', expect: { amount: 120000, wallet: 'jago' } },
  { id: 'c3', group: 'collision', text: 'beli teh dan kopi 30k jago', expect: { amount: 30000, wallet: 'jago', details: ['Teh', 'Kopi'] } },
  { id: 'c4', group: 'collision', text: 'makan 25k dan parkir 5k', expect: { actions: [{ amount: 25000 }, { amount: 5000 }] } },
  { id: 'c5', group: 'collision', text: 'nongkrong 100k beli kopi', expect: { amount: 100000, description: 'Nongkrong', cat: 'hang', details: ['Kopi'] } },
  { id: 'c6', group: 'collision', text: 'makan 50k di Makan Enak jago', expect: { amount: 50000, merchant: 'Makan Enak', wallet: 'jago', noDetails: true } },
  { id: 'c7', group: 'collision', text: 'jajan di Jajan Cafe 20k', expect: { amount: 20000, merchant: 'Jajan Cafe', description: 'Jajan' } },
  { id: 'c8', group: 'collision', text: 'beli kopi 25k di cotti', expect: { amount: 25000, description: 'Kopi', noDetails: true } },
  { id: 'c9', group: 'collision', text: 'makan siang 35k jago', expect: { amount: 35000, wallet: 'jago', noMerchant: true, noDetails: true } },
  { id: 'c10', group: 'collision', text: 'nongkrong 50k bareng temen krom', expect: { amount: 50000, description: 'Nongkrong', wallet: 'krom', noMerchant: true } },
  { id: 'c11', group: 'collision', text: 'ngopi 30k di kantor jago', expect: { amount: 30000, wallet: 'jago' } },
  { id: 'c12', group: 'collision', text: 'nongkrong 77k di kongsi tiam krom masuk ke kategori xyz', expect: { amount: 77000, notKind: 'category_new' } },
  // Hands off: other engines own these sentences
  { id: 'h1', group: 'handsoff', text: 'aldi ngutang 50k buat nongkrong', expect: { kind: 'receivable_new', amount: 50000, person: 'Aldi', noDetails: true } },
  { id: 'h2', group: 'handsoff', text: 'gue pinjem 100k ke budi buat beli kopi dan roti', expect: { kind: 'debt_new', amount: 100000, noDetails: true } },
  { id: 'h3', group: 'handsoff', text: 'tf 200k dr jago ke krom buat nongkrong', expect: { kind: 'transfer', amount: 200000, wallet: 'jago', to: 'krom' } },
  { id: 'h4', group: 'handsoff', text: 'buat kategori hiburan baru', expect: { kind: 'category_new' } },
  { id: 'h5', group: 'handsoff', text: 'budget nongkrong 500k', expect: { kind: 'budget', amount: 500000 } },
  { id: 'h6', group: 'handsoff', text: 'nabung 300k buat liburan', expect: { amount: 300000, noDetails: true } },
  { id: 'h7', group: 'handsoff', text: 'gaji masuk 5jt jenius', expect: { kind: 'income', amount: 5000000, wallet: 'jenius' } },
  { id: 'h8', group: 'handsoff', text: 'sinta bayar 20k ke jago', expect: { kind: 'receivable_payment', amount: 20000, wallet: 'jago' } },
  // Money safety
  { id: 'x1', group: 'money', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik 25k dan snack platter 50k', expect: { actions: [{ amount: 77000, wallet: 'krom' }] } },
  { id: 'x2', group: 'money', text: 'beli 2 kopi 18k satu jago', expect: { amount: 36000, wallet: 'jago' } },
  { id: 'x3', group: 'money', text: 'nongkrong 77k di kongsi tiam krom diskon 7k', expect: { wallet: 'krom' } },
];
