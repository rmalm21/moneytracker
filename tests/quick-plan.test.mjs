import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCorrections, normalizeQuick, parseQuickPlan } from '../lib/quick-plan.ts';
import { cases, ctx } from '../bench/quick/fixtures.mjs';

const plan = (text, extra = {}) => parseQuickPlan(text, { ...ctx, ...extra });
const kinds = text => plan(text).actions.map(a => a.result.kind);
const one = (text, extra) => { const p = plan(text, extra); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} actions`); return p.actions[0]; };
const flagged = a => Object.entries(a.fields).filter(([, f]) => f.status === 'check' || f.status === 'missing').map(([k]) => k);

test('one action or several: joining words only split where each side is an action', () => {
  assert.deepEqual(kinds('beli nasi dan es teh 25rb'), ['expense']);
  assert.deepEqual(kinds('makan 25rb dan parkir 5rb'), ['expense', 'expense']);
  assert.deepEqual(kinds('makan 25rb terus parkir 5rb'), ['expense', 'expense']);
  assert.deepEqual(kinds('transfer 200rb dari bca ke gopay'), ['transfer']);
  assert.deepEqual(kinds('transfer dari bca ke gopay 300rb'), ['transfer']);
  assert.deepEqual(kinds('budget makan untuk sarapan, makan siang dan kopi 2jt'), ['budget']);
  assert.deepEqual(kinds('makan sama andi 60rb'), ['expense']);
  assert.deepEqual(kinds('gaji 7jt, makan 30rb, lalu tf 500rb dari bca ke gopay'), ['income', 'expense', 'transfer']);
});

test('several kinds in one message, each kept apart and skippable', () => {
  const p = plan('besok bayar kos 1,5jt, ingetin perpanjang stnk tanggal 20, sama budget makan bulan depan 2jt');
  assert.deepEqual(p.actions.map(a => [a.result.kind, a.result.amount, a.result.date]), [['plan_new', 1_500_000, '2026-09-27'], ['note_new', 0, '2026-10-20'], ['budget', 2_000_000, '2026-09-26']]);
  // Each action keeps the words it came from.
  assert.deepEqual(p.actions.map(a => a.text), ['besok bayar kos 1,5jt', 'ingetin perpanjang stnk tanggal 20', 'budget makan bulan depan 2jt']);
  assert.ok(p.clauses.every(c => p.sourceText.slice(...c.source).trim() === c.text));
});

test('a value said once counts for the others; a clause’s own value always wins', () => {
  const shared = plan('kemarin makan 25rb, parkir goceng, bensin 30rb pakai gopay').actions;
  assert.deepEqual(shared.map(a => [a.result.date, a.result.preset.walletId]), [['2026-09-25', 'gopay'], ['2026-09-25', 'gopay'], ['2026-09-25', 'gopay']]);
  assert.equal(shared[1].fields.date.status, 'likely');
  const own = plan('kemarin makan 30rb pakai gopay, bensin 100rb hari ini pake bca').actions;
  assert.deepEqual(own.map(a => [a.result.date, a.result.preset.walletId]), [['2026-09-25', 'gopay'], ['2026-09-26', 'bca']]);
  // Income's wallet is not spending's wallet.
  const mixed = plan('gajian 7jt masuk bca\nbayar kos 1,5jt').actions;
  assert.equal(mixed[1].result.preset.walletId, undefined);
});

test('references: dua-duanya, yang bensin, sisanya; unclear ones are left alone and reported', () => {
  assert.deepEqual(plan('makan 30rb, parkir 5rb, dua-duanya pakai gopay').actions.map(a => a.result.preset.walletId), ['gopay', 'gopay']);
  assert.deepEqual(plan('makan 30rb, bensin 100rb, yang bensin pakai bca').actions.map(a => a.result.preset.walletId), [undefined, 'bca']);
  assert.deepEqual(plan('makan 30rb pakai bca, parkir 5rb, kopi 20rb, sisanya pakai gopay').actions.map(a => a.result.preset.walletId), ['bca', 'gopay', 'gopay']);
  const unclear = plan('makan 30rb, parkir 5rb, yang ketiga pakai bca');
  assert.deepEqual(unclear.actions.map(a => a.result.preset.walletId), [undefined, undefined]);
  assert.match(unclear.references[0], /yang ketiga/);
  const alone = plan('yang kopi pakai bca');
  assert.equal(alone.actions.length, 0); assert.equal(alone.references.length, 1);
});

test('corrections: the corrected value wins', () => {
  assert.equal(one('makan 30rb eh 35rb').result.amount, 35_000);
  assert.equal(one('makan 50rb maksudnya 45rb').result.amount, 45_000);
  assert.equal(one('makan 30rb pakai gopay, bukan bca').result.preset.walletId, 'gopay');
  assert.equal(one('bensin 50rb pakai bca eh gopay').result.preset.walletId, 'gopay');
  assert.equal(one('kemarin, eh tadi pagi makan 20rb').result.date, '2026-09-26');
  assert.equal(one('bukan pengeluaran, transfer 200rb dari bca ke gopay').result.kind, 'transfer');
  assert.deepEqual(applyCorrections('makan 30rb eh 35rb', ctx).notes, ['dikoreksi: “30rb” → “35rb”']);
});

test('nothing is invented: a missing or contradicting fact is marked, never filled', () => {
  const tf = one('tf 200rb ke gopay');
  assert.equal(tf.result.preset.walletId, undefined); assert.equal(tf.fields.wallet.status, 'missing'); assert.ok(tf.review);
  const bare = one('transfer 500rb');
  assert.equal(bare.result.kind, 'transfer'); assert.deepEqual(flagged(bare).sort(), ['to', 'wallet']);
  const same = one('tf 100rb dari bca ke bca');
  assert.equal(same.result.preset.destinationWalletId, undefined); assert.equal(same.fields.to.status, 'check');
  assert.deepEqual(one('budget makan 2jt dan 3jt').options.amount, [2_000_000, 3_000_000]);
  assert.deepEqual(one('makan 30rb 35rb').options.amount, [30_000, 35_000]);
  assert.equal(one('makan 25rb kemarin 30 september').fields.date.status, 'check');
  assert.equal(one('makan 20rb pakai gopay pakai bca').fields.wallet.status, 'check');
  assert.equal(one('saldo sekarang 2jt').fields.wallet.status, 'missing');
  assert.equal(one('bayar utang 200rb').fields.link.status, 'missing');
  // Without a salary day in the profile, "pas gajian" is a date to pick, not today.
  assert.equal(one('bayar pajak motor pas gajian berikutnya 300rb', { salaryDay: undefined }).fields.date.status, 'missing');
  assert.equal(one('bayar pajak motor pas gajian berikutnya 300rb').result.date, '2026-10-25');
  // An amount without its amount is asked for, not dropped.
  const noAmount = plan('transfer dari bca ke gopay, beli pulsa 50rb').actions[0];
  assert.equal(noAmount.result.kind, 'transfer'); assert.equal(noAmount.fields.amount.status, 'missing');
});

test('a payment is never attached to the wrong record on a partial match', () => {
  const motor = one('bayar cicilan motor 800rb');
  assert.equal(motor.result.kind, 'expense'); assert.equal(motor.result.preset.debtId, undefined);
  assert.ok(motor.alternatives.some(alt => alt.kind === 'debt_payment'));
  assert.equal(one('bayar cicilan hp 500rb').result.preset.debtId, undefined);
  const withLoan = one('bayar cicilan motor 800rb', { debts: [...ctx.debts, { id: 'd3', name: 'Cicilan motor', provider: 'Adira', outstandingAmount: 8_000_000 }] });
  assert.equal(withLoan.result.preset.debtId, 'd3'); assert.equal(withLoan.fields.link.status, 'verified');
  assert.equal(one('bayar cicilan laptop 500rb').result.preset.debtId, 'd1');
});

test('everyday words keep their meaning', () => {
  assert.equal(one('beli dompet baru 150rb').result.kind, 'expense');
  assert.equal(one('belanja bulanan 500rb').result.kind, 'expense');
  assert.equal(one('parkir 5rb tiap hari').result.kind, 'expense');
  // "promo gopay" names a promotion, not the wallet paid with.
  assert.equal(one('beli kopi 30rb promo gopay').result.preset.walletId, undefined);
  assert.equal(plan('promo gopay cashback 20%').actions.length, 0);
  // Explicit words beat habits.
  const history = [{ type: 'expense', description: 'Kopi', merchant: '', categoryId: 'shop', subcategoryId: null, date: '2026-09-01' }];
  assert.equal(one('kopi 25rb pakai bca', { history }).result.preset.walletId, 'bca');
  // Not every number is money.
  for (const text of ['kamar 205', 'nomor rekening 1234567890', 'meeting jam 3', 'iphone 15']) assert.equal(plan(text).actions.length, 0, text);
  assert.equal(one('jam 7 pagi sarapan 20rb').result.preset.time, '07:00');
});

test('chat spellings and money words', () => {
  assert.equal(normalizeQuick('kmrn mkn bakso 15rb pk gopay'), 'kemarin makan bakso 15rb pakai gopay');
  assert.equal(one('tf 1.5jt dari jenius ke bca').result.amount, 1_500_000);
  assert.equal(one('bayar internet 350rbu').result.amount, 350_000);
  assert.equal(one('go pay tinggal 80rb').result.kind, 'balance');
  assert.equal(one('sejuta setengah buat bayar kos').result.amount, 1_500_000);
  assert.equal(one('senin kemarin makan 30rb').result.date, '2026-09-21');
});

test('every sentence that worked before still works (section 23)', () => {
  const expected = {
    'beli pocari 8rb di alfa': 'expense', 'gaji 7,5jt masuk bca': 'income', 'tf 200rb dari bca ke gopay': 'transfer', 'pinjam 500rb dari budi': 'debt_new',
    'bayar cicilan laptop 500rb': 'debt_payment', 'pinjemin andi 100rb': 'receivable_new', 'andi bayar 50rb': 'receivable_payment', 'klaim hotel 300rb': 'claim_new',
    'klaim cair 300rb': 'claim_payment', 'nabung 500rb ke dana darurat': 'target', 'anggaran makan 2jt': 'budget', 'target liburan bali 10jt desember 2027': 'fund_new',
    'pengen headphone 1,5jt': 'wish_new', 'saldo bca sekarang 12jt': 'balance', 'langganan netflix 54rb tiap tanggal 5': 'recurring_new',
    'ingetin perpanjang stnk 20 oktober': 'note_new', 'buka laporan': 'open',
  };
  for (const [text, kind] of Object.entries(expected)) assert.equal(one(text).result.kind, kind, text);
});

test('clean entries need no review; the benchmark stays free of confident mistakes', () => {
  assert.equal(plan('beli pocari 8rb di alfa').confidence, 'high');
  assert.equal(plan('makan 25rb terus parkir 5rb').confidence, 'high');
  // The whole benchmark (main and held-out sets): no action that is wrong while the preview says it is fine.
  let wrong = 0;
  for (const c of cases) {
    const p = parseQuickPlan(c.text, { ...ctx, ...(c.ctx || {}) });
    if (!c.actions.length) { wrong += p.actions.filter(a => !a.review).length; continue; }
    c.actions.forEach((t, i) => {
      const a = p.actions[i]; if (!a || a.review) return;
      const r = a.result, got = { kind: r.kind, amount: r.amount || undefined, date: r.preset.date || r.date, wallet: r.preset.walletId, to: r.preset.destinationWalletId, link: r.preset.debtId || r.preset.receivableId || r.preset.claimId || r.preset.fundId || r.wishId };
      if (['kind', 'amount', 'date', 'wallet', 'to', 'link'].some(k => k in t && (t[k] === null ? got[k] : got[k] !== t[k]))) wrong++;
    });
  }
  assert.equal(wrong, 0);
});
