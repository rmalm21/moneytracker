/**
 * Catat otomatis V3.5 — fresh held-out composition set (B). Written after the composer was frozen for its first run;
 * places, items and phrasings that appear nowhere in the dev set, the adversarial set, the audit or the tests. The first
 * run is frozen in bench/quick/heldout-first/v35-heldout-first.json and never overwritten.
 */
export const cases = [
  { id: 'b1', text: 'karaoke 180k di inul vista jago pesen kentang goreng dan es jeruk', expect: { kind: 'expense', amount: 180000, description: 'Karaoke', merchant: 'Inul Vista', wallet: 'jago', details: ['Kentang Goreng', 'Es Jeruk'] } },
  { id: 'b2', text: '65k ngopi di tuku gopay', expect: { amount: 65000, description: 'Ngopi', merchant: 'Tuku', wallet: 'gopay' } },
  { id: 'b3', text: 'gopay 65k ngopi tuku', expect: { amount: 65000, description: 'Ngopi', merchant: 'Tuku', wallet: 'gopay' } },
  { id: 'b4', text: 'di bakmi gm makan malam 90k mandiri', expect: { amount: 90000, merchant: 'Bakmi Gm', wallet: 'mandiri', cat: 'food' } },
  { id: 'b5', text: 'nonton 100k di cgv jenius beli nachos', expect: { amount: 100000, description: 'Nonton', merchant: 'Cgv', wallet: 'jenius', cat: 'cinema', details: ['Nachos'] } },
  { id: 'b6', text: 'belanja 450k di zara bri beli kemeja dan ikat pinggang', expect: { amount: 450000, merchant: 'Zara', wallet: 'bri', cat: 'shop', details: ['Kemeja', 'Ikat Pinggang'] } },
  { id: 'b7', text: 'kmrn nongkrong 120k di kopi nako krom order es kopi susu & roti bakar', expect: { amount: 120000, description: 'Nongkrong', merchant: 'Kopi Nako', wallet: 'krom', date: '2026-10-14', cat: 'hang', details: ['Es Kopi Susu', 'Roti Bakar'] } },
  { id: 'b8', text: 'ngopi 40k di fore jago beli aren latte buat kerja', expect: { amount: 40000, description: 'Ngopi', wallet: 'jago', details: ['Aren Latte'], purpose: 'kerja' } },
  { id: 'b9', text: 'nongkrong 90k di warung tekko bareng rina gopay', expect: { amount: 90000, description: 'Nongkrong', merchant: 'Warung Tekko', wallet: 'gopay', people: ['Rina'] } },
  { id: 'b10', text: 'nongkrong 85k kategori hiburan pake jenius', expect: { amount: 85000, description: 'Nongkrong', wallet: 'jenius', explicit: 'fun' } },
  { id: 'b11', text: 'nonton 75k xxi jago masuk ke kategori hiburan', expect: { amount: 75000, wallet: 'jago', explicit: 'fun' } },
  { id: 'b12', text: 'jajan 15k beli seblak dan es teh', expect: { amount: 15000, description: 'Jajan', details: ['Seblak', 'Es Teh'] } },
  { id: 'b13', text: 'sarapan 30k di bubur barito cash beli bubur dan sate usus', expect: { amount: 30000, description: 'Sarapan', merchant: 'Bubur Barito', wallet: 'cash', cat: 'breakfast', details: ['Bubur', 'Sate Usus'] } },
  { id: 'b14', text: 'nongkrong 60k di kopi kenangan krom, parkir 5k cash', expect: { actions: [{ amount: 60000, description: 'Nongkrong', wallet: 'krom' }, { amount: 5000, wallet: 'cash', cat: 'park' }] } },
  { id: 'b15', text: 'makan siang 55k di solaria jago pesen nasi goreng sama es teh', expect: { amount: 55000, merchant: 'Solaria', wallet: 'jago', cat: 'food', details: ['Nasi Goreng', 'Es Teh'] } },
  { id: 'b16', text: 'gaming 50k di warnet jago', expect: { amount: 50000, description: 'Gaming', wallet: 'jago', cat: 'game' } },
  { id: 'b17', text: 'NONTON 50K DI XXI GOPAY', expect: { amount: 50000, description: 'Nonton', wallet: 'gopay', cat: 'cinema' } },
  { id: 'b18', text: 'nongkrong 70k di kongsi tiam krom beli teh tarik 30k dan roti 40k', expect: { amount: 70000, merchant: 'Kongsi Tiam', wallet: 'krom', details: ['Teh Tarik', 'Roti'] } },
  { id: 'b19', text: 'belanja 200k di miniso jago beli boneka buat adik', expect: { amount: 200000, merchant: 'Miniso', wallet: 'jago', details: ['Boneka'] } },
  { id: 'b20', text: 'ngopi 35k, di janji jiwa, gopay, beli kopi susu + croffle', expect: { amount: 35000, description: 'Ngopi', merchant: 'Janji Jiwa', wallet: 'gopay', details: ['Kopi Susu', 'Croffle'] } },
];
