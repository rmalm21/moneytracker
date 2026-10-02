import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { planMutation } from '../lib/catat/mutation.ts';
import { readComposition, compositionReceipt } from '../lib/catat/composition.ts';
import { effects } from '../lib/accounting.ts';
/** The ledger fields `effects` reads (lib/firestore.ts newTx needs Firebase; the shape is the same). */
const newTx = t => ({ destinationWalletId: null, transferFee: 0, adjustmentDirection: 'in', splits: [], ...t });
import { ctx, at } from '../bench/quick/fixtures-v33state.mjs';

const T = '2026-10-15', Y = '2026-10-14', TM = '2026-10-16';
const plan = (text, c = ctx) => parseQuickPlan(text, c);
const one = (text, c = ctx) => { const p = plan(text, c); assert.equal(p.actions.length, 1, `${text}: ${p.actions.length} aksi`); return p.actions[0]; };
const rel = a => a.mutation.relationshipChanges;

test('V3.3 §81 partial payment: Rp12.000 → Rp7.000, one money movement, no new receivable', () => {
  const a = one('atuy bayar 5k');
  assert.equal(a.result.kind, 'receivable_payment'); assert.equal(a.result.preset.receivableId, 'ra');
  assert.equal(a.result.operation.type, 'PARTIAL_SETTLE');
  assert.deepEqual(rel(a).map(c => [c.before, c.after, c.status]), [[12000, 7000, 'partial']]);
  assert.equal(a.mutation.moneyMovements.length, 1); assert.equal(a.mutation.moneyMovements[0].delta, 5000);
  assert.ok(a.evidence.some(e => /Rp5\.000 dianggap pembayaran sebagian karena piutang Atuy yang masih terbuka saat ini Rp12\.000/.test(e)));
});

test('V3.3 §11 full payment settles; §82 "sisanya besok" plans the real remaining balance', () => {
  assert.equal(one('atuy bayar 12k').result.operation.type, 'SETTLE');
  const p = plan('atuy bayar 5k sisanya besok');
  assert.equal(p.actions.length, 2);
  const [pay, rest] = p.actions;
  assert.equal(pay.result.amount, 5000); assert.equal(pay.result.date, T); assert.equal(pay.result.operation.remainingAfter, 7000);
  assert.equal(rest.result.kind, 'plan_new'); assert.equal(rest.result.amount, 7000); assert.equal(rest.result.date, TM);
  assert.ok(rest.evidence.some(e => /bukan Rp12\.000/.test(e)));
});

test('V3.3 §83 overpayment is flagged and never makes the balance negative', () => {
  const a = one('atuy bayar 15k');
  assert.ok(a.review); assert.ok(a.checks.some(c => c.code === 'PAYMENT_EXCEEDS_REMAINING_BALANCE'));
  assert.ok(a.warnings.includes('Piutang Atuy tersisa Rp12.000, tapi pembayaran yang kamu tulis Rp15.000.'));
  assert.deepEqual(a.options.amount, [12000]);
  assert.ok(rel(a).every(c => c.after >= 0));
});

test('V3.3 §15 "setengah" works from the current balance only when the record is unique', () => {
  const a = one('atuy bayar setengah dulu');
  assert.equal(a.result.amount, 6000); assert.equal(a.result.operation.expect, 12000);
  const d = one('dina bayar 20k');
  assert.equal(d.result.preset.receivableId, undefined); assert.equal(d.ask.field, 'link'); assert.deepEqual(d.ask.choices, ['r2', 'r3']);
});

test('V3.3 §84 historical update changes the Cotti entry (no new transaction)', () => {
  const a = one('ubah kopi cotti tadi jadi 25k');
  assert.equal(a.result.kind, 'tx_update'); assert.equal(a.result.operation.target.id, 't1');
  assert.deepEqual(a.result.operation.changes.map(c => [c.field, c.before, c.after]), [['amount', 19000, 25000]]);
  assert.deepEqual(a.mutation.creates, []);
  assert.ok(a.evidence.some(e => /Cotti Coffee .*13:12.* dipilih karena cocok dengan kata “kopi”, merchant Cotti Coffee, waktu “tadi”/.test(e)));
});

test('V3.3 §85 historical delete targets today\'s Parkir and needs a confirmation', () => {
  const a = one('hapus parkir tadi');
  assert.equal(a.result.kind, 'tx_delete'); assert.equal(a.result.operation.target.id, 't2');
  assert.equal(a.confirm, 'destructive'); assert.ok(a.review);
  assert.deepEqual(a.mutation.creates, []); assert.deepEqual(a.mutation.deletes.length, 1);
});

test('V3.3 §21 correction of an old entry; §22 cancel a transfer; §23 bulk delete is a stronger confirmation', () => {
  const u = one('yang kemarin harusnya 25 bukan 20');
  assert.equal(u.result.operation.target.id, 't3'); assert.equal(u.result.operation.changes[0].after, 25000);
  const c = one('batalin transfer jago ke mandiri tadi');
  assert.equal(c.result.operation.type, 'CANCEL'); assert.equal(c.result.operation.target.id, 't4');
  const extra = { ...ctx, recent: [...ctx.recent, { id: 't5', type: 'expense', amount: 3000, date: T, time: '11:40', walletId: 'cash', destinationWalletId: null, categoryId: 'trans', subcategoryId: 'park', merchant: '', description: 'Parkir', createdMs: at(T, '11:40') }] };
  const b = one('hapus semua parkir hari ini', extra);
  assert.equal(b.confirm, 'bulk'); assert.deepEqual(b.result.operation.targets.map(t => t.id).sort(), ['t2', 't5']);
  assert.ok(b.mutation.confirmations.includes('2 transaksi akan dihapus.'));
});

test('V3.3 §18 ambiguous historical target: nothing changes until the person picks', () => {
  const extra = { ...ctx, recent: [...ctx.recent, { id: 't6', type: 'expense', amount: 18000, date: T, time: '08:10', walletId: 'gopay', destinationWalletId: null, categoryId: 'food', subcategoryId: 'drink', merchant: 'Fore', description: 'Kopi', createdMs: at(T, '08:10') }] };
  const a = one('ubah kopi tadi jadi 20k', extra);
  assert.equal(a.result.operation.target, undefined); assert.equal(a.ask.field, 'link'); assert.equal(a.ask.choices.length, 2);
  assert.deepEqual(a.mutation.updates, []);
});

test('V3.3 §86 coreference inside the message; §87 ambiguous "dia" is asked', () => {
  const p = plan('atuy ngutang 20k terus dia bayar 5k');
  assert.deepEqual(p.actions.map(a => a.result.kind), ['receivable_new', 'receivable_payment']);
  const pay = p.actions[1];
  assert.equal(pay.result.person, 'Atuy'); assert.equal(pay.result.operation.linkAction, 'a0'); assert.equal(pay.result.preset.receivableId, undefined);
  assert.deepEqual(rel(pay).map(c => [c.before, c.after]), [[20000, 15000]]);
  const q = plan('atuy ngutang 20k budi ngutang 10k terus dia bayar 5k');
  const last = q.actions[2];
  assert.equal(last.result.person, ''); assert.equal(last.ask.field, 'person'); assert.deepEqual(last.ask.choices, ['Atuy', 'Budi']);
  assert.equal(last.ask.question, 'Atuy atau Budi yang bayar Rp5.000?');
});

test('V3.3 §88–89 arithmetic: "satu"/"@" multiply, a bare count never does', () => {
  const a = one('3 kopi 18k satu');
  assert.equal(a.result.amount, 54000); assert.deepEqual(a.result.quantity, { qty: 3, unit: 18000, total: 54000 });
  assert.equal(one('3 kopi @18k').result.amount, 54000);
  const b = one('3 kopi 18k');
  assert.equal(b.result.amount, 18000); assert.deepEqual(b.options.amount, [18000, 54000]); assert.equal(b.fields.amount.status, 'likely');
});

test('V3.3 §90–91 discount and service stay inside one expense; §34 cashback received vs promised', () => {
  const d = plan('makan 100k diskon 20k jago');
  assert.equal(d.actions.length, 1); assert.equal(d.actions[0].result.amount, 80000); assert.equal(d.actions[0].result.preset.walletId, 'jago');
  assert.equal(d.actions[0].result.composition.gross, 100000);
  assert.equal(one('makan 100k diskon 20k service 5k jago').result.amount, 85000);
  assert.equal(one('bensin 100k cashback 10k gopay').result.amount, 90000);
  const promised = plan('bensin 100k nanti dapet cashback 10k gopay');
  assert.equal(promised.actions.length, 1); assert.equal(promised.actions[0].result.amount, 100000); assert.equal(promised.actions[0].result.kind, 'expense');
  const r = compositionReceipt(readComposition('makan 100k diskon 20k service 5k'), 'Makan');
  assert.equal(r.subtotal, 100000); assert.equal(r.total, 85000); assert.deepEqual(r.charges.map(c => [c.type, c.amount]), [['discount', 20000], ['service', 5000]]);
});

test('V3.3 §92 + §104 transfer fee: source −102.500, destination +100.000; money is conserved', () => {
  const a = one('tf 100k jago ke mandiri admin 2500');
  assert.equal(a.result.amount, 100000); assert.equal(a.result.preset.transferFee, 2500);
  assert.deepEqual(a.mutation.moneyMovements.map(m => [m.walletId, m.delta]), [['jago', -102500], ['mandiri', 100000]]);
  assert.ok(!a.checks.some(c => c.code === 'TRANSFER_DESTINATION_RECEIVED_FEE'));
  for (const [amount, fee] of [[100000, 2500], [500000, 6500], [1, 0], [987654, 1234]]) {
    const e = effects(newTx({ type: 'transfer', amount, walletId: 'a', destinationWalletId: 'b', transferFee: fee, transferFeeCategoryId: 'fee' }));
    assert.equal(-e.a, e.b + fee, `${amount}/${fee}`);
  }
});

test('V3.3 §93–94 group: masing-masing makes one receivable each; a total is never given to each', () => {
  const each = plan('budi sama aldi masing2 ngutang 10k');
  assert.deepEqual(each.actions.map(a => [a.result.kind, a.result.person, a.result.amount]), [['receivable_new', 'Budi', 10000], ['receivable_new', 'Aldi', 10000]]);
  const total = plan('budi sama aldi total ngutang 20k');
  assert.deepEqual(total.actions.map(a => a.result.amount), [10000, 10000]);
  assert.ok(total.actions.every(a => a.review && a.fields.amount.status === 'check'));
});

test('V3.3 §95 + §106 Split Bill bridge: shares from the Split Bill engine add up to the total', () => {
  const a = one('gue bayar makan 150k bagi rata bertiga gue atuy budi');
  assert.equal(a.result.operation.type, 'SPLIT'); assert.deepEqual(a.result.split.shares, { me: 50000, p1: 50000, p2: 50000 });
  assert.deepEqual(rel(a).map(c => [c.label, c.after]), [['Piutang Atuy', 50000], ['Piutang Budi', 50000]]);
  assert.ok(a.evidence.some(e => /Bagi rata dipilih karena kamu menulis “bagi rata” dan menyebut kamu, Atuy, dan Budi/.test(e)));
  assert.equal(one('makan 150k buat gue atuy budi').result.split, undefined, 'no equal split without the words for it');
  for (const total of [100000, 150001, 99999, 1000]) {
    const s = one(`makan ${total} bagi rata bertiga gue atuy budi`, { ...ctx }).result.split;
    if (s) assert.equal(Object.values(s.shares).reduce((n, x) => n + x, 0), s.total);
  }
});

test('V3.3 §96–97 + §110 talangan: one cash outflow and one receivable; repaid later the same message', () => {
  const a = one('kmrn gue talangin atuy makan 50k pake jago');
  assert.deepEqual([a.result.kind, a.result.date, a.result.preset.walletId, a.result.purpose], ['receivable_new', Y, 'jago', 'Makan']);
  assert.equal(a.mutation.moneyMovements.length, 1);
  const p = plan('kmrn gue talangin atuy makan 50k pake jago terus tadi dia bayar 20k');
  assert.deepEqual(p.actions.map(x => [x.result.kind, x.result.date]), [['receivable_new', Y], ['receivable_payment', T]]);
  assert.deepEqual(rel(p.actions[1]).map(c => c.after), [30000]);
  assert.equal(p.actions.filter(x => x.result.kind === 'expense').length, 0);
});

test('V3.3 §98–99 claims: one event when made; partial payout leaves the rest', () => {
  const k = one('makan kantor 100k jago nanti direimburse');
  assert.deepEqual([k.result.kind, k.result.name], ['claim_new', 'Makan']);
  assert.equal(k.mutation.moneyMovements.length, 1);
  const c = one('claim makan cair 60k');
  assert.equal(c.result.preset.claimId, 'c2'); assert.deepEqual(rel(c).map(x => [x.before, x.after]), [[100000, 40000]]);
  assert.ok(one('claim makan cair 150k').checks.some(x => x.code === 'CLAIM_PAYMENT_EXCEEDS_REMAINING'));
});

test('V3.3 §100–101 plans and schedules keep the time; §48 paying a plan posts it', () => {
  const p = one('besok bayar wifi 121k jam 7 malam');
  assert.deepEqual([p.result.kind, p.result.amount, p.result.date, p.result.preset.time], ['plan_new', 121000, TM, '19:00']);
  const r = one('wifi 121k tiap tgl 24 jam 7 malam');
  assert.deepEqual([r.result.kind, r.result.date, r.result.preset.time, r.result.schedule.anchorDay, r.result.schedule.frequency], ['recurring_new', '2026-10-24', '19:00', 24, 'monthly']);
  const done = one('wifi tadi udah gue bayar');
  assert.deepEqual([done.result.kind, done.result.amount, done.result.preset.plannedId, done.result.preset.walletId], ['expense', 121000, 'p1', 'jago']);
});

test('V3.3 §51–52 recurring changes apply from a date and never rewrite history', () => {
  const c = one('mulai bulan depan spotify jadi 35k');
  assert.deepEqual([c.result.kind, c.result.operation.recurring.amount, c.result.operation.recurring.from], ['recurring_change', 35000, '2026-11-01']);
  const s = one('bulan depan stop spotify');
  assert.deepEqual([s.result.operation.type, s.result.operation.recurring.stop, s.result.operation.recurring.from], ['STOP_RECURRING', true, '2026-11-01']);
  assert.ok(!c.checks?.some(x => x.code === 'RECURRING_HISTORY_REWRITE'));
});

test('V3.3 §102 + §57 duplicate: a warning, never an automatic rejection', () => {
  const fresh = { ...ctx, recent: [{ ...ctx.recent[0], createdMs: ctx.nowMs - 10_000 }, ...ctx.recent.slice(1)] };
  const a = one('kopi cotti 19k jago', fresh);
  assert.equal(a.result.duplicateOf, 't1'); assert.ok(a.review); assert.equal(a.result.amount, 19000);
  assert.ok(a.warnings.some(w => /Transaksi mirip baru saja dicatat/.test(w)));
  assert.equal(one('kopi cotti 19k jago').result.duplicateOf, undefined, 'an hour later is not a duplicate');
});

test('V3.3 §103 plain numbers: two actions, suggested as thousands, one tap to confirm, never silent', () => {
  const p = plan('kopi 20 jago bensin 80 krom');
  assert.deepEqual(p.actions.map(a => [a.result.amount, a.result.preset.walletId, a.fields.amount.status]), [[20000, 'jago', 'check'], [80000, 'krom', 'check']]);
  assert.equal(p.confirm.question, 'Anggap 20 = Rp20.000 dan 80 = Rp80.000?');
  assert.equal(one('parkir 750').result.amount, 750, 'three digits are never scaled');
});

test('V3.3 §53 + §109 questions never mutate', () => {
  for (const [text, answer] of [['atuy masih ngutang berapa', 'Atuy masih berutang Rp12.000 ke kamu.'], ['sisa utang gue ke aldi berapa', 'Sisa utangmu ke Aldi Rp100.000.'], ['piutang gue total berapa', 'Total piutangmu Rp342.000.']]) {
    const a = one(text);
    assert.equal(a.result.kind, 'query'); assert.equal(a.result.operation.query.answer, answer);
    const m = a.mutation;
    assert.deepEqual([m.moneyMovements, m.relationshipChanges, m.creates, m.updates, m.deletes, m.schedules], [[], [], [], [], [], []]);
  }
});

test('V3.3 §105 + §107 + §108 + §111 properties: balances ≥ 0, updates/deletes create nothing, one inflow per repayment', () => {
  for (let paid = 1000; paid <= 30000; paid += 1000) {
    const a = one(`atuy bayar ${paid / 1000}k`);
    for (const c of rel(a)) assert.ok(c.after >= 0, `${paid}: ${c.after}`);
    if (paid > 12000) assert.ok(a.review, `${paid} over the balance must be checked`);
    assert.equal(a.mutation.moneyMovements.filter(m => m.delta > 0).length, 1);
  }
  for (const text of ['ubah kopi cotti tadi jadi 25k', 'yang kemarin harusnya 25 bukan 20', 'hapus parkir tadi', 'hapus yang terakhir']) {
    const a = one(text);
    assert.deepEqual(a.mutation.creates, [], text); assert.equal(a.mutation.relationshipChanges.length, 0, text);
  }
});

test('V3.3 simple input stays simple and fast (no consequence preview)', () => {
  const t0 = performance.now(); const a = one('makan 25k jago'); const ms = performance.now() - t0;
  assert.equal(a.mutation.complex, false); assert.equal(a.result.operation, undefined);
  assert.ok(ms < 200, `${ms} ms`);
});

test('V3.3 mutation plan of a hand-made action reconciles with the ledger effects', () => {
  const a = one('tf 500rb dari jago ke bri biaya admin 6500');
  const m = planMutation(a, ctx, [a]);
  const tx = newTx({ type: 'transfer', amount: a.result.amount, walletId: 'jago', destinationWalletId: 'bri', transferFee: a.result.preset.transferFee, transferFeeCategoryId: 'admin' });
  const e = effects(tx);
  assert.deepEqual(m.moneyMovements.map(x => x.delta), [e.jago, e.bri]);
});
