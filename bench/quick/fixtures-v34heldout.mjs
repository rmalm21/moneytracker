/**
 * Catat otomatis V3.4 held-out set, written after the rules were frozen and run once before any change
 * (first run frozen in bench/quick/heldout-first/v34-heldout-first.json). New aliases, new sentence shapes, no dev
 * phrase reused. Same format as fixtures-v34dev.mjs.
 */
const debts = { receivables: [{ id: 'rk', person: 'Kevin Wijaya', description: 'Futsal', remainingAmount: 60_000, originalAmount: 60_000, date: '2026-10-08' }] };

export const cases = [
  // Merchants and places, new names and shapes
  { id: 'h1', group: 'merchant', text: 'es teh solo 5rb cash', lex: [['solo', 'Es Teh Solo Pak Gendut', 'merchant']], expect: { merchant: 'Es Teh Solo Pak Gendut', amount: 5000, wallet: 'cash' } },
  { id: 'h2', group: 'merchant', text: 'Mie ayam Pakde 14rb via gopay', lex: [['pakde', 'Mie Ayam Pakde Karso', 'merchant']], expect: { merchant: 'Mie Ayam Pakde Karso', amount: 14000, wallet: 'gopay' } },
  { id: 'h3', group: 'merchant', text: 'tadi pagi sarapan bubur cikini 18k pakai jenius', lex: [['cikini', 'Bubur Ayam Cikini', 'merchant']], expect: { merchant: 'Bubur Ayam Cikini', amount: 18000, wallet: 'jenius' } },
  { id: 'h4', group: 'merchant', text: 'isi galon di depot jaya 6rb', lex: [['depot jaya', 'Depot Air Jaya Abadi', 'merchant']], expect: { merchant: 'Depot Air Jaya Abadi', amount: 6000 } },
  { id: 'h5', group: 'place', text: 'fotokopi 3k di bdg', lex: [['bdg', 'Bedeng', 'place']], expect: { merchant: 'Bedeng', amount: 3000 } },
  { id: 'h6', group: 'place', text: 'jajan gorengan 10rb basecmp', lex: [['basecmp', 'Basecamp', 'place']], expect: { merchant: 'Basecamp', amount: 10000 } },
  { id: 'h7', group: 'merchant', text: 'kemarin beli obat di apotek k24 35rb bri', lex: [['k24', 'Apotek K-24', 'merchant']], expect: { amount: 35000, wallet: 'bri', date: '2026-10-14' } },
  // People
  { id: 'h8', group: 'person', text: 'mas kev ngutang 25rb buat futsal', lex: [['mas kev', 'Kevin Wijaya', 'person']], expect: { kind: 'receivable_new', person: 'Kevin Wijaya', amount: 25000 } },
  { id: 'h9', group: 'person', text: 'mas kev bayar 20rb ke jago', lex: [['mas kev', 'Kevin Wijaya', 'person']], ctx: debts, expect: { kind: 'receivable_payment', link: 'rk', amount: 20000, wallet: 'jago' } },
  { id: 'h10', group: 'person', text: 'pinjem 200rb sama om hen masuk mandiri', lex: [['om hen', 'Hendra Gunawan', 'person']], expect: { kind: 'debt_new', person: 'Hendra Gunawan', amount: 200000, wallet: 'mandiri' } },
  { id: 'h11', group: 'person', text: 'si ucup minjem 40k', lex: [['ucup', 'Yusuf Maulana', 'person']], expect: { kind: 'receivable_new', person: 'Yusuf Maulana', amount: 40000 } },
  // Abbreviations
  { id: 'h12', group: 'abbr', text: 'jjn 15rb gopay', lex: [['jjn', 'jajan', 'abbr']], expect: { description: 'Jajan', amount: 15000, wallet: 'gopay' } },
  { id: 'h13', group: 'abbr', text: 'ongkr 12rb', lex: [['ongkr', 'ongkir', 'abbr']], expect: { amount: 12000 } },
  { id: 'h14', group: 'abbr', text: 'tkt bus 30rb cash', lex: [['tkt', 'tiket', 'abbr']], expect: { amount: 30000, wallet: 'cash' } },
  // Wallets
  { id: 'h15', group: 'wallet', text: 'kopi 20k pake jns', lex: [['jns', 'Jenius', 'wallet', 'jenius']], expect: { amount: 20000, wallet: 'jenius' } },
  { id: 'h16', group: 'wallet', text: 'tf 250rb dari mdr ke jago', lex: [['mdr', 'Mandiri', 'wallet', 'mandiri']], expect: { kind: 'transfer', wallet: 'mandiri', to: 'jago', amount: 250000 } },
  // Safety
  { id: 'h17', group: 'safety', text: 'es teh solo 6rb jago', lex: [['solo', 'Es Teh Solo Pak Gendut', 'merchant']], ctx: { history: 'cotti-jago' }, expect: { amount: 6000, wallet: 'jago', merchant: 'Es Teh Solo Pak Gendut' } },
  { id: 'h18', group: 'safety', text: 'om hen ngasih pinjaman 100rb', lex: [['om hen', 'Hendra Gunawan', 'person']], expect: { kind: 'debt_new', person: 'Hendra Gunawan', amount: 100000 } },
  { id: 'h19', group: 'safety', text: 'gue minjemin om hen 100rb', lex: [['om hen', 'Hendra Gunawan', 'person']], expect: { kind: 'receivable_new', person: 'Hendra Gunawan', amount: 100000 } },
  { id: 'h20', group: 'safety', text: 'bubur cikini', lex: [['cikini', 'Bubur Ayam Cikini', 'merchant']], expect: { amount: null } },
  { id: 'h21', group: 'safety', text: 'fotokopi 3k di bdg jam 8 malam', lex: [['bdg', 'Bedeng', 'place']], expect: { merchant: 'Bedeng', same: ['amount', 'date', 'time'] } },
  { id: 'h22', group: 'safety', text: 'tf 50rb jago ke gopay', lex: [['gpy', 'GoPay', 'wallet', 'gopay'], ['solo', 'Es Teh Solo Pak Gendut', 'merchant']], expect: { kind: 'transfer', wallet: 'jago', to: 'gopay', amount: 50000 } },
  { id: 'h23', group: 'safety', text: 'kevin ngutang 10rb', lex: [['kev', 'Kevin Wijaya', 'person']], expect: { notPerson: 'Kevin Wijaya' } },
  { id: 'h24', group: 'safety', text: 'makan 18rb pakai gopay', lexRaw: [{ id: 'merchant_gopay', alias: 'gopay', key: 'gopay', type: 'merchant', label: 'GoPay Mart', status: 'learned', confirm: 4, correct: 0, reject: 0, source: 'correction', created: 0, updated: 0 }], expect: { wallet: 'gopay', notMerchant: 'GoPay Mart' } },
  { id: 'h25', group: 'safety', text: 'beli 20 bakso', lexRaw: [{ id: 'abbr_20', alias: '20', key: '20', type: 'abbr', label: 'dua puluh ribu', status: 'learned', confirm: 4, correct: 0, reject: 0, source: 'correction', created: 0, updated: 0 }], expect: { same: ['amount', 'kind'] } },
  // Collisions, corrections, typos
  { id: 'h26', group: 'collision', text: 'mas kev ngutang 15rb', lex: [['mas kev', 'Kevin Wijaya', 'person'], ['mas kev', 'Kevin Anggara', 'person']], expect: { ask: true, notPerson: 'Kevin Wijaya' } },
  { id: 'h27', group: 'correction', text: 'mie ayam pakde 14rb, pakde maksudnya Mie Ayam Pakde Joyo', lex: [['pakde', 'Mie Ayam Pakde Karso', 'merchant']], expect: { merchant: 'Mie Ayam Pakde Joyo', amount: 14000 } },
  { id: 'h28', group: 'typo', text: 'bubur cikinii 18k jenius', lex: [['cikini', 'Bubur Ayam Cikini', 'merchant']], expect: { merchant: 'Bubur Ayam Cikini', amount: 18000 } },
  // Session
  { id: 'h29', group: 'session', text: 'doi udah balikin 6rb', lex: [], session: { people: ['Atuy'] }, expect: { kind: 'receivable_payment', link: 'ra', amount: 6000 } },
  { id: 'h30', group: 'session', text: 'orangnya bayar 10rb', lex: [], session: { people: ['Sinta', 'Dina'] }, expect: { ask: true } },
  { id: 'h31', group: 'session', text: 'yg tadi jadi 20rb', lex: [], session: { txIds: ['t1'] }, expect: { kind: 'tx_update', target: 't1', amount: 20000 } },
  { id: 'h32', group: 'session', text: 'sisanya lusa', lex: [], session: { people: ['Atuy'], relation: { kind: 'receivable', id: 'ra', person: 'Atuy' } }, ctx: { raRemaining: 4000 }, expect: { kind: 'plan_new', amount: 4000, date: '2026-10-17' } },
  // Several actions
  { id: 'h33', group: 'multi', text: 'es teh solo 5rb terus fotokopi 3k di bdg', lex: [['solo', 'Es Teh Solo Pak Gendut', 'merchant'], ['bdg', 'Bedeng', 'place']], expect: { actions: [{ merchant: 'Es Teh Solo Pak Gendut', amount: 5000 }, { merchant: 'Bedeng', amount: 3000 }] } },
  { id: 'h34', group: 'multi', text: 'mas kev ngutang 30rb, om hen ngutang 50rb', lex: [['mas kev', 'Kevin Wijaya', 'person'], ['om hen', 'Hendra Gunawan', 'person']], expect: { actions: [{ kind: 'receivable_new', person: 'Kevin Wijaya', amount: 30000 }, { kind: 'receivable_new', person: 'Hendra Gunawan', amount: 50000 }] } },
  // Controls
  { id: 'h35', group: 'control', text: 'bayar listrik 150rb mandiri', lex: [['solo', 'Es Teh Solo Pak Gendut', 'merchant'], ['mas kev', 'Kevin Wijaya', 'person']], expect: { same: ['kind', 'amount', 'wallet', 'merchant', 'description'] } },
  { id: 'h36', group: 'control', text: 'gaji masuk 8jt ke mandiri', lex: [['mdr', 'Mandiri', 'wallet', 'mandiri']], expect: { same: ['kind', 'amount', 'wallet'] } },
];
