/**
 * Catat otomatis — 6.0 preparation, held-out set (B). Written before any 6.0 language work, with words and phrasings that
 * appear nowhere in the dev set, and never looked at while tuning. The first run after the work is frozen in
 * bench/quick/heldout-first/v60-heldout-first.json and never overwritten. State: fixtures-v35state.mjs.
 */
export const cases = [
  { id: 'h1', text: 'beli permen gopek', expect: { kind: 'expense', amount: 500, description: 'permen' } },
  { id: 'h2', text: 'beli sabun 18.500,- di indomaret', expect: { amount: 18500, description: 'sabun', merchant: 'indomaret' } },
  { id: 'h3', text: 'es kopi 22k an pake gopay', expect: { amount: 22000, wallet: 'gopay', description: 'es kopi', cat: 'drink' } },
  { id: 'h4', text: 'byr wifi 300rb, eh salah, 330rb', expect: { actions: [{ amount: 330000, cat: 'bills' }] } },
  { id: 'h5', text: 'tumbas roti 12rb', expect: { amount: 12000, description: 'roti', cat: 'food' } },
  { id: 'h6', text: 'nuku gorengan 10rb', expect: { amount: 10000, description: 'gorengan', cat: 'food' } },
  { id: 'h7', text: 'meuli bensin 25rb', expect: { amount: 25000, description: 'bensin', cat: 'fuel' } },
  { id: 'h8', text: 'paid internet bill 330k jago', expect: { amount: 330000, wallet: 'jago', cat: 'bills' } },
  { id: 'h9', text: 'semalam makan nasi goreng 30rb', expect: { amount: 30000, date: '2026-10-14', cat: 'food' } },
  { id: 'h10', text: 'hotel semalam 450rb', expect: { amount: 450000, date: '2026-10-15' } },
  { id: 'h11', text: 'ngegrab ke kantor 28rb', expect: { amount: 28000, cat: 'trans' } },
  { id: 'h12', text: 'jajan 20rb lewat qris', expect: { amount: 20000, description: 'jajan' } },
  { id: 'h13', text: 'makan 45rb pake kartu debit jago', expect: { amount: 45000, wallet: 'jago', description: 'makan', cat: 'food' } },
  { id: 'h14', text: 'sinta transfer balik 250rb ke mandiri', expect: { kind: 'receivable_payment', amount: 250000, wallet: 'mandiri', person: 'sinta' } },
  { id: 'h15', text: 'atuy balikin 12rb cash', expect: { kind: 'receivable_payment', amount: 12000, wallet: 'cash', person: 'atuy' } },
  { id: 'h16', text: 'dinner w/ fam 250k', expect: { amount: 250000, cat: 'food' } },
  { id: 'h17', text: 'ngopi 30rb, terus ngebensin 25rb', expect: { actions: [{ amount: 30000, cat: 'drink' }, { amount: 25000, cat: 'fuel' }] } },
  { id: 'h18', text: 'top up gopay 100rb dr jago', expect: { kind: 'transfer', amount: 100000, wallet: 'jago', to: 'gopay' } },
  { id: 'h19', text: 'berapa sisa uang di jago?', expect: { actions: [] } },
  { id: 'h20', text: 'tadi siang maksi 35rb', expect: { amount: 35000, cat: 'food' } },
  { id: 'h21', text: 'lunch meeting 150k pake jenius', expect: { amount: 150000, wallet: 'jenius', cat: 'food' } },
  { id: 'h22', text: 'transfr ke bri 1jt dr mandiri', expect: { kind: 'transfer', amount: 1000000, wallet: 'mandiri', to: 'bri' } },
  { id: 'h23', text: 'dapet duit freelance 1,5jt masuk jago', expect: { kind: 'income', amount: 1500000, wallet: 'jago' } },
  { id: 'h24', text: 'got salary 9jt jago', expect: { kind: 'income', amount: 9000000, wallet: 'jago', cat: 'salary' } },
  { id: 'h25', text: 'parkir 2rb, ralat, 4rb', expect: { actions: [{ amount: 4000, cat: 'park' }] } },
  { id: 'h26', text: 'nukoni pulsa 50rb', expect: { amount: 50000, description: 'pulsa', cat: 'bills' } },
  { id: 'h27', text: 'tadi malem jajan sate 25rb', expect: { amount: 25000, date: '2026-10-15', cat: 'food' } },
  { id: 'h28', text: 'beli obat 45.000,- cash', expect: { amount: 45000, wallet: 'cash', description: 'obat' } },
];
