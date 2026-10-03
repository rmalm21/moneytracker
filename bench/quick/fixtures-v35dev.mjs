/**
 * Catat otomatis V3.5 — development composition set (A). Required tests #1–#10 (§136–145), word-order permutations of
 * the same event (§94/§151), property tests (§152–154), mixed language, punctuation, case. Context: fixtures-v35state.
 * expect: kind, amount, description, merchant, wallet, date, cat (sub or parent id), details (item names), purpose,
 * people (notes "Bersama"), explicit (category named by the user), actions (several events).
 */
const KT = { kind: 'expense', amount: 77000, description: 'Nongkrong', merchant: 'Kongsi Tiam', wallet: 'krom', cat: 'hang' };
const ITEMS = ['Teh Tarik', 'Snack Platter'];
export const cases = [
  // Required tests
  { id: 'r1', group: 'required', text: 'Nongkrong 77k di kongsi tiam krom beli Teh Tarik dan Snack Platter', expect: { ...KT, details: ITEMS } },
  { id: 'r2', group: 'required', text: '77k nongkrong di kongsi tiam krom', expect: KT },
  { id: 'r3', group: 'required', text: '77k nongkrong di kongsi tiam krom masuk ke kategori hiburan', expect: { ...KT, explicit: 'fun' } },
  { id: 'r4', group: 'required', text: 'krom 77k nongkrong kongsi tiam', expect: KT },
  { id: 'r5', group: 'required', text: 'kemarin nongkrong 77k di kongsi tiam krom beli teh tarik dan snack platter', expect: { ...KT, date: '2026-10-14', details: ITEMS } },
  { id: 'r6', group: 'required', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik dan snack platter, bensin 80k jago', expect: { actions: [{ ...KT, details: ITEMS }, { kind: 'expense', amount: 80000, description: 'Bensin', wallet: 'jago', cat: 'fuel' }] } },
  { id: 'r7', group: 'required', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik dan snack platter buat meeting', expect: { ...KT, details: ITEMS, purpose: 'meeting' } },
  { id: 'r8', group: 'required', text: 'nonton 120k di xxi krom beli popcorn dan coke', expect: { kind: 'expense', amount: 120000, description: 'Nonton', merchant: 'Xxi', wallet: 'krom', cat: 'cinema', details: ['Popcorn', 'Coke'] } },
  { id: 'r9', group: 'required', text: 'belanja 300k di uniqlo mandiri beli kaos dan celana', expect: { kind: 'expense', amount: 300000, merchant: 'Uniqlo', wallet: 'mandiri', cat: 'shop', details: ['Kaos', 'Celana'] } },
  { id: 'r10', group: 'required', text: 'beli teh tarik dan snack platter 77k di kongsi tiam krom buat nongkrong', expect: { ...KT, details: ITEMS } },
  // Word order (§94, §151)
  { id: 'p1', group: 'order', text: 'nongkrong 77k di kongsi tiam krom', expect: KT },
  { id: 'p2', group: 'order', text: 'nongkrong di kongsi tiam 77k krom', expect: KT },
  { id: 'p3', group: 'order', text: 'krom 77k nongkrong di kongsi tiam', expect: KT },
  { id: 'p4', group: 'order', text: 'di kongsi tiam nongkrong 77k pake krom', expect: KT },
  { id: 'p5', group: 'order', text: '77k krom nongkrong di kongsi tiam', expect: KT },
  { id: 'p6', group: 'order', text: 'pake krom nongkrong 77k di kongsi tiam', expect: KT },
  { id: 'p7', group: 'order', text: 'nongkrong di kongsi tiam pake krom 77k', expect: KT },
  // Properties (§152–154)
  { id: 'q1', group: 'property', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik', expect: { ...KT, details: ['Teh Tarik'] } },
  { id: 'q2', group: 'property', text: 'kemarin nongkrong 77k di kongsi tiam krom', expect: { ...KT, date: '2026-10-14' } },
  { id: 'q3', group: 'property', text: 'nongkrong 77k di kongsi tiam krom kategori hiburan', expect: { ...KT, explicit: 'fun' } },
  { id: 'q4', group: 'property', text: 'nongkrong 77k kategori hiburan > nongkrong', expect: { kind: 'expense', amount: 77000, description: 'Nongkrong', cat: 'hang', explicit: 'hang' } },
  // Style, mixed language, punctuation, case (§131–135)
  { id: 's1', group: 'style', text: 'nongkrong 100k di starbucks krom order latte dan croissant', expect: { kind: 'expense', amount: 100000, description: 'Nongkrong', wallet: 'krom', cat: 'hang', details: ['Latte', 'Croissant'] } },
  { id: 's2', group: 'style', text: 'watch movie 150k di xxi jago beli popcorn', expect: { amount: 150000, merchant: 'Xxi', wallet: 'jago', cat: 'cinema', details: ['Popcorn'] } },
  { id: 's3', group: 'style', text: 'nongkrong 77k, di kongsi tiam, krom, beli teh tarik + snack platter', expect: { ...KT, details: ITEMS } },
  { id: 's4', group: 'style', text: 'nongkrong77k di kongsi tiam krom beli teh tarik dan snack platter', expect: { ...KT, details: ITEMS } },
  { id: 's5', group: 'style', text: 'NONGKRONG 77K DI KONGSI TIAM KROM', expect: KT },
  { id: 's6', group: 'style', text: 'nongki 50k krom', expect: { amount: 50000, description: 'Nongkrong', wallet: 'krom', cat: 'hang' } },
  { id: 's7', group: 'style', text: 'kmrn nongki 60k di warkop jago beliin kopi sama gorengan', expect: { amount: 60000, description: 'Nongkrong', merchant: 'Warkop', wallet: 'jago', date: '2026-10-14', cat: 'hang', details: ['Kopi', 'Gorengan'] } },
  { id: 's8', group: 'style', text: 'srpn 25k di besto jago beli ayam dan teh', expect: { amount: 25000, description: 'Sarapan', wallet: 'jago', cat: 'breakfast', details: ['Ayam', 'Teh'] } },
  { id: 's9', group: 'style', text: 'td ngopi 25k di cotti pake krom pesen americano', expect: { amount: 25000, description: 'Ngopi', wallet: 'krom', details: ['Americano'] } },
  // Items: quantity, modifier, prices (§124–130)
  { id: 'i1', group: 'items', text: 'ngopi 45k di kopi kenangan jago beli dua kopi', expect: { amount: 45000, merchant: 'Kopi Kenangan', wallet: 'jago', details: ['Kopi'] } },
  { id: 'i2', group: 'items', text: 'nongkrong 77k di kongsi tiam krom beli 2 teh tarik less sugar dan snack platter large', expect: { ...KT, details: ['Teh Tarik Less Sugar', 'Snack Platter Large'] } },
  { id: 'i3', group: 'items', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik 25k dan snack platter 52k', expect: { ...KT, details: ITEMS } },
  { id: 'i4', group: 'items', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik 25k dan snack platter 50k', expect: { ...KT, details: ITEMS } },
  { id: 'i5', group: 'items', text: 'jajan 20k beli cilok dan cimol', expect: { amount: 20000, description: 'Jajan', details: ['Cilok', 'Cimol'] } },
  { id: 'i6', group: 'items', text: 'sarapan 45k di mekdi jago beli bubur ayam dan kopi', expect: { amount: 45000, description: 'Sarapan', wallet: 'jago', cat: 'breakfast', details: ['Bubur Ayam', 'Kopi'] } },
  // People and purpose
  { id: 'o1', group: 'people', text: 'nongkrong 77k di kongsi tiam bareng andi krom', expect: { ...KT, people: ['Andi'] } },
  { id: 'o2', group: 'people', text: 'nongkrong 77k di kongsi tiam krom beli teh tarik buat budi', expect: { ...KT, details: ['Teh Tarik'] } },
  // Multi-event
  { id: 'm1', group: 'multi', text: 'beli bensin 50k terus ngopi 30k di cotti beli latte', expect: { actions: [{ amount: 50000, cat: 'fuel' }, { amount: 30000, description: 'Ngopi', details: ['Latte'] }] } },
  { id: 'm2', group: 'multi', text: 'makan 25k dan parkir 5k', expect: { actions: [{ amount: 25000, description: 'Makan' }, { amount: 5000, description: 'Parkir', cat: 'park' }] } },
];
