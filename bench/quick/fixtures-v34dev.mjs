/**
 * Catat otomatis V3.4 dev set: the sentence, the person's Kamus Pribadi (aliases only — never sentence → answer), an
 * optional short session, and what a careful person expects. Shared state: fixtures-v33state.mjs (today 15 Oct 2026).
 *
 *   lex:     [raw, label, type, targetId?] taught explicitly (learned), or { raw entries } to simulate bad synced data
 *   session: { people, txIds, relation } as the box would hold it right after saving
 *   expect:  only the fields written are checked; `null` = must not be guessed; `not` = must not be this value;
 *            `ask` = a personal question must be asked; `same` = fields that must equal the cold V3.4 reading
 */
const BESTO = ['besto', "D'Besto", 'merchant'], PIOT = ['piot', 'B1 Piot', 'merchant'], TIO = ['kak tio', 'Muhammad Tio', 'person'], KANTOR = ['kntor', 'Kantor', 'place'];
const rehan = { receivables: [{ id: 'rr', person: 'Rehan Pratama', description: 'Pinjam', remainingAmount: 100_000, originalAmount: 100_000, date: '2026-10-01' }] };
const raw = (key, type, label, extra = {}) => ({ id: `${type}_${key.replace(/\W/g, '')}`, alias: key, key, type, label, status: 'learned', confirm: 0, correct: 0, reject: 0, source: 'explicit', created: 0, updated: 0, ...extra });

export const cases = [
  // Merchants
  { id: 'm1', group: 'merchant', text: 'ayam besto 13k jago', lex: [BESTO], expect: { kind: 'expense', description: 'Ayam', merchant: "D'Besto", amount: 13000, wallet: 'jago' } },
  { id: 'm2', group: 'merchant', text: 'ayam besto 18k krom', lex: [BESTO], expect: { merchant: "D'Besto", amount: 18000, wallet: 'krom' } },
  { id: 'm3', group: 'merchant', text: 'susu piot 7,7k krom', lex: [PIOT], expect: { description: 'Susu', merchant: 'B1 Piot', amount: 7700, wallet: 'krom' } },
  { id: 'm4', group: 'merchant', text: 'roti piot 12rb gopay', lex: [PIOT], expect: { description: 'Roti', merchant: 'B1 Piot', amount: 12000, wallet: 'gopay' } },
  { id: 'm5', group: 'merchant', text: 'kopi kenkan 22k jenius', lex: [['kenkan', 'Kopi Kenangan', 'merchant']], expect: { merchant: 'Kopi Kenangan', amount: 22000, wallet: 'jenius' } },
  { id: 'm6', group: 'merchant', text: 'nasgor mang ujang 15k cash', lex: [['mang ujang', 'Warung Mang Ujang', 'merchant']], expect: { merchant: 'Warung Mang Ujang', amount: 15000, wallet: 'cash' } },
  { id: 'm7', group: 'control', text: 'beli sabun di indomaret 9k gopay', lex: [BESTO, PIOT], expect: { amount: 9000, wallet: 'gopay', same: ['kind', 'merchant', 'description', 'amount', 'wallet', 'date'] } },
  // People
  { id: 'p1', group: 'person', text: 'kak tio ngutang 20k', lex: [TIO], expect: { kind: 'receivable_new', person: 'Muhammad Tio', amount: 20000 } },
  { id: 'p2', group: 'person', text: 'gue ngutang 50k ke kak tio', lex: [TIO], expect: { kind: 'debt_new', person: 'Muhammad Tio', amount: 50000 } },
  { id: 'p3', group: 'person', text: 'minjemin bang rehan 100k dari jago', lex: [['bang rehan', 'Rehan Pratama', 'person']], expect: { kind: 'receivable_new', person: 'Rehan Pratama', amount: 100000, wallet: 'jago' } },
  { id: 'p4', group: 'person', text: 'bang rehan bayar 30k', lex: [['bang rehan', 'Rehan Pratama', 'person']], ctx: rehan, expect: { kind: 'receivable_payment', link: 'rr', amount: 30000 } },
  // Places
  { id: 'l1', group: 'place', text: 'parkir 2k kntor', lex: [KANTOR], expect: { description: 'Parkir', merchant: 'Kantor', amount: 2000 } },
  { id: 'l2', group: 'place', text: 'makan siang 25k di kmps', lex: [['kmps', 'Kampus', 'place']], expect: { merchant: 'Kampus', amount: 25000 } },
  { id: 'l3', group: 'control', text: 'bensin 30k deket rumah krom', lex: [KANTOR], expect: { amount: 30000, wallet: 'krom', same: ['kind', 'merchant', 'description', 'amount', 'wallet'] } },
  // Abbreviations
  { id: 'a1', group: 'abbr', text: 'prkr 2k', lex: [['prkr', 'parkir', 'abbr']], expect: { description: 'Parkir', amount: 2000 } },
  { id: 'a2', group: 'abbr', text: 'mkn 25k gopay', lex: [['mkn', 'makan', 'abbr']], expect: { description: 'Makan', amount: 25000, wallet: 'gopay' } },
  { id: 'a3', group: 'abbr', text: 'bnsn 30rb krom', lex: [['bnsn', 'bensin', 'abbr']], expect: { description: 'Bensin', amount: 30000, wallet: 'krom' } },
  // Wallet aliases (explicit = learned) and their safety
  { id: 'w1', group: 'wallet', text: 'ayam besto 13k jg', lex: [BESTO, ['jg', 'Jago', 'wallet', 'jago']], expect: { merchant: "D'Besto", amount: 13000, wallet: 'jago' } },
  { id: 'w2', group: 'wallet', text: 'transfer 100rb jg ke mandiri', lex: [['jg', 'Jago', 'wallet', 'jago']], expect: { kind: 'transfer', amount: 100000, wallet: 'jago', to: 'mandiri' } },
  { id: 'w3', group: 'safety', text: 'makan 20k mand', lexRaw: [raw('mand', 'wallet', 'Mandiri', { targetId: 'mandiri', source: 'correction', correct: 2, status: 'provisional' })], expect: { amount: 20000, notWallet: 'mandiri' } },
  // Safety: current sentence wins, money is never learned
  { id: 's1', group: 'safety', text: 'kopi cotti 19k krom', lex: [['cotti', 'Cotti Coffee', 'merchant']], ctx: { history: 'cotti-jago' }, expect: { merchant: 'Cotti Coffee', amount: 19000, wallet: 'krom' } },
  { id: 's2', group: 'safety', text: 'gue ngutang 20k ke atuy', lex: [['atuy', 'Atuy', 'person']], expect: { kind: 'debt_new', person: 'Atuy', amount: 20000 } },
  { id: 's3', group: 'safety', text: 'kopi cotti', lex: [['cotti', 'Cotti Coffee', 'merchant']], expect: { amount: null } },
  { id: 's4', group: 'safety', text: 'parkir 2k kntor jam 1', lex: [KANTOR], expect: { merchant: 'Kantor', same: ['amount', 'date', 'time'] } },
  { id: 's5', group: 'safety', text: 'kopi 20k jago', lexRaw: [raw('jago', 'merchant', 'Jago Coffee')], expect: { wallet: 'jago', notMerchant: 'Jago Coffee', same: ['kind', 'amount', 'wallet'] } },
  { id: 's6', group: 'safety', text: 'makan 20k pake krom', lexRaw: [raw('krom', 'place', 'Krom Cafe')], expect: { wallet: 'krom', notMerchant: 'Krom Cafe' } },
  { id: 's7', group: 'safety', text: 'cukur 50k barber king jago', lex: [BESTO], expect: { notMerchant: 'Burger King', amount: 50000 } },
  { id: 's8', group: 'safety', text: 'aldi ngutang 20k', lex: [['adi', 'Adi Saputra', 'person']], expect: { notPerson: 'Adi Saputra', amount: 20000 } },
  { id: 's9', group: 'safety', text: 'ayam besto 13k jago', lexRaw: [raw('besto', 'merchant', "D'Besto", { off: true })], expect: { notMerchant: "D'Besto", same: ['kind', 'amount', 'wallet', 'merchant'] } },
  { id: 's10', group: 'safety', text: 'susu piot 7k krom', lex: [PIOT], off: true, expect: { notMerchant: 'B1 Piot', same: ['kind', 'amount', 'wallet', 'merchant'] } },
  { id: 's11', group: 'safety', text: 'transfer 50rb jago ke krom', lex: [['krm', 'Krom', 'wallet', 'krom'], BESTO], expect: { kind: 'transfer', wallet: 'jago', to: 'krom', amount: 50000 } },
  // Collisions and corrections
  { id: 'c1', group: 'collision', text: 'ayam besto 13k jago', lex: [BESTO, ['besto', 'Best Meat', 'merchant']], expect: { ask: true, notMerchant: "D'Besto", amount: 13000 } },
  { id: 'c2', group: 'collision', text: 'ayam besto 13k jago', lex: [BESTO, ['besto', 'Best Meat', 'merchant']], choose: { besto: "D'Besto" }, expect: { merchant: "D'Besto", amount: 13000 } },
  { id: 'c3', group: 'correction', text: 'ayam besto 13k, besto maksud gue Best Meat', lex: [BESTO], expect: { merchant: 'Best Meat', amount: 13000 } },
  { id: 'c4', group: 'typo', text: 'ayam bestoo 15k jago', lex: [BESTO], expect: { merchant: "D'Besto", amount: 15000 } },
  // Session
  { id: 'q1', group: 'session', text: 'dia bayar 5k', lex: [BESTO], session: { people: ['Atuy'] }, expect: { kind: 'receivable_payment', link: 'ra', amount: 5000 } },
  { id: 'q2', group: 'session', text: 'dia bayar 5k', lex: [BESTO], session: { people: ['Atuy', 'Budi'] }, expect: { ask: true, notLink: 'ra' } },
  { id: 'q3', group: 'session', text: 'dia bayar 5k', lex: [BESTO], expect: { notLink: 'ra' } },
  { id: 'q4', group: 'session', text: 'yang tadi jadi 21k', lex: [BESTO], session: { txIds: ['t1'] }, expect: { kind: 'tx_update', target: 't1', amount: 21000 } },
  { id: 'q5', group: 'session', text: 'yang tadi jadi 5rb', lex: [BESTO], session: { txIds: ['t2'] }, expect: { kind: 'tx_update', target: 't2', amount: 5000 } },
  { id: 'q6', group: 'session', text: 'sisanya besok', lex: [BESTO], session: { people: ['Atuy'], relation: { kind: 'receivable', id: 'ra', person: 'Atuy' } }, ctx: { raRemaining: 7000 }, expect: { kind: 'plan_new', amount: 7000, date: '2026-10-16' } },
  { id: 'q7', group: 'session', text: 'sisanya besok', lex: [BESTO], ctx: { raRemaining: 7000 }, expect: { notKind: 'plan_new' } },
  // Several actions
  { id: 'x1', group: 'multi', text: 'ayam besto 13k jago terus parkir 2k kntor', lex: [BESTO, KANTOR], expect: { actions: [{ merchant: "D'Besto", amount: 13000 }, { merchant: 'Kantor', amount: 2000 }] } },
  { id: 'x2', group: 'multi', text: 'kak tio ngutang 20k terus dia bayar 5k', lex: [TIO], expect: { actions: [{ kind: 'receivable_new', person: 'Muhammad Tio', amount: 20000 }, { kind: 'receivable_payment', amount: 5000 }] } },
  { id: 'x3', group: 'multi', text: 'susu piot 7k sama roti piot 10k krom', lex: [PIOT], expect: { actions: [{ merchant: 'B1 Piot', amount: 7000 }, { merchant: 'B1 Piot', amount: 10000 }] } },
  // Controls: no personal word in the sentence
  { id: 'n1', group: 'control', text: 'beli pocari 8rb di alfa', lex: [BESTO, PIOT, TIO], expect: { same: ['kind', 'merchant', 'description', 'amount', 'wallet', 'date'] } },
  { id: 'n2', group: 'control', text: 'transfer 100rb jago ke mandiri', lex: [BESTO, ['jg', 'Jago', 'wallet', 'jago']], expect: { kind: 'transfer', same: ['kind', 'amount', 'wallet', 'to'] } },
  { id: 'n3', group: 'control', text: 'atuy bayar 5k', lex: [TIO], expect: { link: 'ra', same: ['kind', 'amount', 'link'] } },
];
