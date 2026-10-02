import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFinances } from '../lib/advisor.ts';
import { transactionExpense } from '../lib/accounting.ts';
import { analyzeInsight, analyzePrices } from '../lib/insight-v25/index.ts';
import { compare, stats } from '../lib/insight-v25/baseline.ts';
import { confidence } from '../lib/insight-v25/confidence.ts';
import { buildContext } from '../lib/insight-v25/context.ts';
import { decompose, driverTree, roundToTotal } from '../lib/insight-v25/drivers.ts';
import { applyLifecycle, dismiss, emptyMemory, restoreAll, snooze } from '../lib/insight-v25/lifecycle.ts';
import { recordScore, scoreDelta } from '../lib/insight-v25/health.ts';
import { itemIdentity } from '../lib/insight-v25/signals/prices.ts';
import { mainDriver } from '../lib/insight-v25/signals/spending.ts';
import { analyzeFinances as frozenAdvisor } from '../bench/insight/baseline-v43/advisor.ts';
import { cases } from '../bench/insight/cases.mjs';
import { addDays, makeUser } from '../bench/insight/scenarios.mjs';

const scenario = (id, extra = {}) => makeUser({ ...cases.find(c => c.id === id).options, ...extra });
const run = (id, extra = {}, options = {}) => { const { input } = scenario(id, extra); return { input, report: analyzeInsight(input, options) }; };
const sig = (report, signature) => report.signals.find(s => s.signature === signature);
function rng(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; }

// ——— Parity: the current Advisor is preserved ———
test('parity: Insight V2.5 carries the Advisor output unchanged (same as the frozen 4.3 Advisor)', () => {
  for (const id of ['stable', 'delivery-frequency', 'late-start', 'thin-history', 'claims-aging', 'budget-pressure']) {
    const { input } = scenario(id);
    const report = analyzeInsight(input);
    assert.deepEqual(JSON.parse(JSON.stringify(report.advice)), JSON.parse(JSON.stringify(frozenAdvisor(input))), id);
    assert.deepEqual(JSON.parse(JSON.stringify(analyzeFinances(input))), JSON.parse(JSON.stringify(frozenAdvisor(input))), id);
  }
});
test('parity: every Advisor action card is either linked to a V2.5 signal or kept as its own signal', () => {
  const { report } = run('budget-pressure');
  for (const f of report.advice.actions) assert.ok(report.signals.some(s => s.finding?.id === f.id), f.id);
  const budget = sig(report, 'budget:pressure:b-food');
  const tight = report.advice.budgetTips.find(f => f.id === 'tight-b-food');
  if (tight) assert.equal(budget.finding?.id, 'tight-b-food', 'the V2.5 budget signal reuses the Advisor card');
  const { report: other } = run('uncategorized');
  assert.ok(sig(other, 'data:uncategorized').finding?.id === 'uncategorized' || !other.advice.alerts.some(f => f.id === 'uncategorized'));
});

// ——— Baseline ———
test('baseline: robust stats and one outlier cycle left out of the typical value', () => {
  const s = stats([100, 110, 90, 105, 95]);
  assert.equal(s.median, 100); assert.equal(s.count, 5); assert.equal(s.min, 90); assert.equal(s.max, 110);
  const b = compare(120, [100, 105, 95, 100, 900], 'full');
  assert.deepEqual(b.outliers, [4]);
  assert.equal(b.typical, 100);
  assert.equal(b.previous, 900);
  assert.equal(compare(120, [100, 105, 95, 900], 'full').typical, 100);
});
test('baseline: a running cycle is compared with earlier cycles at the same day, not whole cycles', () => {
  const { input } = scenario('stable');
  const ctx = buildContext(input);
  assert.equal(ctx.current.elapsed, 18);
  for (const c of ctx.baseline) assert.ok(ctx.samePoint(c).every(l => l.date < addDays(c.start, 18)));
  const full = ctx.baseline[0].lines.reduce((n, l) => n + l.amount, 0), part = ctx.samePoint(ctx.baseline[0]).reduce((n, l) => n + l.amount, 0);
  assert.ok(part < full);
});
test('baseline: early in a cycle (day 3, rent already paid) nothing is called a change', () => {
  const { report } = run('early-cycle-rent');
  assert.ok(!report.signals.some(s => /^(spending|merchant|cashflow):/.test(s.signature)));
});

// ——— Drivers (property tests) ———
test('drivers: frequency effect + ticket effect always equal the change (random property test)', () => {
  const r = rng(42);
  for (let i = 0; i < 500; i++) {
    const cur = { amount: Math.round(r() * 2e6), count: Math.floor(r() * 30) }, base = { amount: Math.round(r() * 2e6), count: r() * 30 };
    if (!cur.count) cur.amount = 0; if (base.count < 1e-9) base.amount = 0;
    const d = decompose(cur, base);
    assert.ok(Math.abs(d.frequencyEffect + d.ticketEffect - (cur.amount - base.amount)) < 1e-6);
  }
});
test('drivers: every level of the tree adds up to its parent, "Lainnya" included (random ledgers)', () => {
  const { input } = scenario('stable');
  const ctx = buildContext(input);
  const r = rng(7);
  const check = d => { if (d.children?.length) { assert.ok(Math.abs(d.children.reduce((n, c) => n + c.delta, 0) - d.delta) < 1e-6, d.id); assert.ok(Math.abs(d.children.reduce((n, c) => n + c.current, 0) - d.current) < 1e-6); d.children.forEach(check); } assert.ok(Math.abs((d.frequencyEffect ?? 0) + (d.ticketEffect ?? 0) - d.delta) < 1e-6); };
  for (let i = 0; i < 40; i++) {
    const pick = lines => lines.filter(() => r() < .7);
    const cur = pick(ctx.current.lines), base = ctx.baseline.map(c => pick(ctx.samePoint(c)));
    check(driverTree(ctx, 'root', 'Semua', 'category', cur, base, ['subcategory', 'merchant'], 1 + Math.floor(r() * 4)));
  }
});
test('drivers: rounded rows still add up to the rounded total', () => {
  const r = rng(3);
  for (let i = 0; i < 200; i++) { const values = Array.from({ length: 1 + Math.floor(r() * 6) }, () => (r() - .5) * 1e5); const total = values.reduce((n, v) => n + v, 0); assert.equal(roundToTotal(values, total).reduce((n, v) => n + v, 0), Math.round(total)); }
});
test('drivers: a delivery surge is explained by GrabFood, more often; a coffee rise by a pricier ticket', () => {
  const freq = sig(run('delivery-frequency').report, 'spending:category:food');
  const path = mainDriver(freq.drivers[0]);
  assert.deepEqual(path.map(d => d.label), ['Pesan Antar', 'GrabFood']);
  assert.ok(Math.abs(path[1].frequencyEffect) > Math.abs(path[1].ticketEffect));
  assert.match(freq.headline, /GrabFood \(lebih sering\)/);
  const coffee = sig(run('coffee-ticket').report, 'spending:subcategory:food-coffee');
  const last = mainDriver(coffee.drivers[0]).pop();
  assert.equal(last.label, 'Kopi Kenangan');
  assert.ok(Math.abs(last.ticketEffect) > Math.abs(last.frequencyEffect));
  assert.match(coffee.headline, /lebih mahal per transaksi/);
});

// ——— Confidence & coverage ———
test('confidence: separate from severity, shown only as a label with reasons', () => {
  const sure = confidence({ cycles: 6, volatility: .1, z: 4, progress: .6 }), thin = confidence({ cycles: 2, volatility: .9, z: 1.2, progress: .2 });
  assert.equal(sure.level, 'high'); assert.equal(sure.label, 'Keyakinan tinggi');
  assert.equal(thin.level, 'low'); assert.equal(thin.label, 'Data terbatas');
  assert.ok(![sure.label, thin.label, ...thin.reasons].some(t => /\d+\s?%/.test(t) && !/kategori/.test(t)));
  const unc = confidence({ cycles: 6, uncategorized: .18 });
  assert.ok(unc.reasons.includes('18% pengeluaran belum memiliki kategori'));
});
test('coverage: Data Health — uncategorized spending lowers confidence and is said plainly', () => {
  const { report } = run('uncategorized');
  const note = sig(report, 'data:uncategorized');
  assert.ok(note && /pengeluaran belum memiliki kategori/.test(note.title));
  const spending = report.signals.filter(s => s.domain === 'spending' && s.signature !== 'data:uncategorized');
  assert.ok(spending.length > 0);
  for (const s of spending) assert.ok(s.caveats.some(c => /belum memiliki kategori/.test(c)), s.signature);
});
test('coverage: new user and thin history — Insight is learning, no comparisons, no invented patterns', () => {
  for (const [id, cycles] of [['new-user', 0], ['thin-history', 1]]) {
    const { report } = run(id);
    assert.equal(report.learning.active, true);
    assert.equal(report.learning.cycles, cycles);
    assert.match(report.learning.message, /Insight masih mempelajari pola normalmu/);
    assert.match(report.learning.detail, new RegExp(`${cycles} siklus lengkap tersedia`));
    assert.equal(report.changed.length, 0);
    assert.ok(report.brief.some(b => /mempelajari pola normalmu/.test(b.text)));
  }
});
test('coverage: a cycle recorded only from halfway is not a baseline; a half-empty cycle is skipped', () => {
  const { report } = run('late-start');
  assert.ok(report.context.baseline.length <= 5);
  const { input } = makeUser({ seed: 5 });
  const cutStart = buildContext(input).baseline[2].start;
  input.history = input.history.filter(t => !(t.date >= cutStart && t.date < addDays(cutStart, 30) && t.type === 'expense' && t.categoryId !== 'home'));
  const ctx = buildContext(input);
  assert.ok(ctx.cycles.some(c => !c.usable));
  assert.ok(analyzeInsight(input).signals.some(s => s.signature === 'data:sparse-cycles'));
});

// ——— Domains ———
test('claims: aging buckets, usual payout time from history (not a promise), never liquid', () => {
  const { report } = run('claims-aging');
  const all = sig(report, 'claims:outstanding');
  assert.match(all.title, /3 klaim kantor belum cair/);
  assert.ok(all.evidence.some(e => /Umur > 30 hari/.test(e.label)));
  assert.ok(all.evidence.some(e => e.label === 'Lama cair biasanya' && /riwayat, bukan janji/.test(e.note)));
  assert.match(all.summary, /belum dihitung sebagai uang tersedia/);
  assert.ok(sig(report, 'claims:aging:c1'));
  assert.ok(!sig(report, 'claims:aging:c2'));
  assert.equal(sig(report, 'claims:aging:c1').parent, 'claims:outstanding');
});
test('receivables: overdue, partial, concentration — facts only, no trust score', () => {
  const { report } = run('receivable-late');
  const all = sig(report, 'receivable:outstanding');
  assert.ok(all.evidence.some(e => /dicicil sebagian/.test(e.label)));
  assert.ok(sig(report, 'receivable:late:r1'));
  assert.ok(!sig(report, 'receivable:late:r2'));
  assert.ok(!report.signals.some(s => /percaya|trust|tidak bisa dipercaya|skor kepercayaan/i.test(`${s.title} ${s.summary}`)));
});
test('debt: trajectory down with a payoff estimate only when steady; no estimate when irregular', () => {
  const steady = sig(run('debt-paydown').report, 'debt:trajectory');
  assert.equal(steady.tone, 'positive');
  assert.ok(steady.evidence.some(e => e.label === 'Perkiraan lunas' && /±6 bulan/.test(e.value)));
  const { input } = scenario('debt-paydown');
  // Irregular payments: no estimate.
  const pays = input.history.filter(t => t.type === 'debt_payment');
  pays.forEach((t, i) => { t.amount = [300_000, 1_800_000, 200_000, 1_500_000, 400_000][i] || t.amount; });
  input.data.debts[0].outstandingAmount = 6_000_000;
  const rough = analyzeInsight(input).signals.find(s => s.signature === 'debt:trajectory');
  assert.ok(rough && !rough.evidence.some(e => e.label === 'Perkiraan lunas'));
});
test('income: a bonus month is not "usual"; a real drop is reported; irregular income from the profile', () => {
  assert.ok(!sig(run('income-bonus').report, 'income:last-cycle'));
  const drop = sig(run('income-drop').report, 'income:last-cycle');
  assert.equal(drop.type, 'income_down');
  const { report } = run('stable', { profile: { income: 'variable' }, income: ci => [9e6, 5e6, 12e6, 7e6, 10e6, 6e6, 9e6][ci] });
  assert.ok(sig(report, 'income:volatility'));
});
test('goals: combined demand vs usual surplus, trade-offs listed, no goal chosen for the user', () => {
  const g = sig(run('goals-pressure').report, 'goals:pressure');
  assert.ok(g.evidence.some(e => e.label === 'DP rumah') && g.evidence.some(e => e.label === 'Liburan Jepang'));
  assert.ok(g.caveats.some(c => /tidak memilihkan/.test(c)));
});
test('recurring: a price change is information, with the yearly effect', () => {
  const r = sig(run('recurring-drift').report, 'recurring:drift:r:r-netflix');
  assert.equal(r.tone, 'neutral');
  assert.match(r.summary, /Rp54\.000 menjadi Rp65\.000/);
  assert.ok(r.evidence.some(e => e.label === 'Efek per tahun' && e.value === '+Rp132.000'));
});
test('anomaly: "Tidak biasa" for an unplanned big purchase, never for a planned one', () => {
  const big = sig(run('unusual-purchase').report, 'behavior:unusual:big1');
  assert.match(big.title, /^Tidak biasa/);
  const planned = run('planned-purchase').report;
  assert.ok(!sig(planned, 'behavior:unusual:big2'));
  const shop = sig(planned, 'spending:category:shop');
  assert.ok(!shop || (shop.tone === 'neutral' && !shop.material && shop.caveats.some(c => /direncanakan/.test(c))));
});
test('prices: same shop + same size only, paid price per unit, at least 3 purchases, run lazily', () => {
  const { report } = run('item-price');
  assert.ok(!report.signals.some(s => s.domain === 'prices' && s.signature.startsWith('prices:item')), 'not computed by default');
  const prices = analyzePrices(report);
  const rice = prices.find(s => s.signature === 'prices:item:sku:8991001|indomaret');
  assert.match(rice.summary, /Rp76\.000 per item/);
  assert.ok(!prices.some(s => /8991009|8991002/.test(s.signature)), 'a 1L bottle never compares with a 2L one');
  assert.deepEqual(itemIdentity('Minyak Goreng Bimoli 2L'), { base: 'minyak goreng bimoli', size: '2000ml' });
  assert.notDeepEqual(itemIdentity('Minyak Goreng Bimoli 1L'), itemIdentity('Minyak Goreng Bimoli 2L'));
  // The crossed-out marketplace price is never used.
  const { input } = scenario('item-price');
  for (const t of input.history) for (const it of t.receipt?.items || []) it.originalPrice = it.price * 3;
  assert.match(analyzePrices(analyzeInsight(input)).find(s => s.signature === rice.signature).summary, /Rp76\.000 per item/);
});

// ——— Stories, ranking, brief ———
test('clustering: category, subcategory, merchant and budget pressure are one story; impact counted once', () => {
  const { report } = run('budget-pressure');
  const story = report.stories.find(s => s.signature === 'spending:category:food');
  const members = story.members.map(m => m.signature);
  assert.ok(members.includes('budget:pressure:b-food') && members.includes('spending:subcategory:food-delivery') && members.includes('merchant:grabfood'));
  assert.equal(story.impact, story.root.impact);
  assert.equal(report.changed.filter(s => s.signature === 'spending:category:food').length, 1);
  assert.ok(!report.changed.some(s => s.signature === 'merchant:grabfood'));
});
test('what changed: at most 4, good news included, quiet when nothing changed', () => {
  assert.equal(run('stable').report.changed.length, 0);
  const down = run('delivery-down').report;
  assert.ok(down.changed.some(s => s.tone === 'positive' && s.signature === 'spending:category:food'));
  assert.ok(down.progress.stories.some(s => s.signature === 'spending:category:food'));
  for (const c of cases) assert.ok(run(c.id).report.changed.length <= 4, c.id);
});
test('brief: 2–4 sentences, each backed by a signal, numbers taken from it', () => {
  for (const id of ['budget-pressure', 'delivery-down', 'claims-aging', 'new-user', 'debt-paydown']) {
    const { report } = run(id);
    assert.ok(report.brief.length >= 1 && report.brief.length <= 4, id);
    for (const b of report.brief) {
      if (b.signature === 'health:score') { assert.ok(b.text.includes(String(report.hero.score))); continue; }
      if (b.signature === 'learning') continue;
      const story = report.stories.find(s => s.signature === b.signature) || report.progress.resolved.find(r => r.signature === b.signature);
      assert.ok(story, `${id}: ${b.text}`);
      const source = story.root ? `${story.root.headline} ${story.root.title}` : story.title;
      for (const money of b.text.match(/Rp[\d.,]+(?: (?:rb|jt))?/g) || []) assert.ok(source.includes(money), `${id}: ${money} not in ${source}`);
    }
  }
});
test('priority: profile changes order, never facts', () => {
  const debtFirst = run('debt-paydown', { profile: { priority: 'debt', personalized: true } }).report, plain = run('debt-paydown').report;
  const a = sig(debtFirst, 'debt:trajectory'), b = sig(plain, 'debt:trajectory');
  assert.equal(a.summary, b.summary);
  assert.ok(debtFirst.stories.find(s => s.signature === 'debt:trajectory').priority > plain.stories.find(s => s.signature === 'debt:trajectory').priority);
});

// ——— Lifecycle, fatigue, resurfacing, timeline ———
const day = (input, n) => ({ ...input, today: addDays(input.today, n) });
test('lifecycle: NEW for 3 days, then ACTIVE; running twice changes nothing (idempotent)', () => {
  const { input } = scenario('budget-pressure');
  const first = analyzeInsight(input);
  assert.equal(sig(first, 'spending:category:food').lifecycleState, 'NEW');
  assert.equal(first.memoryChanged, true);
  const again = analyzeInsight(input, { memory: first.memory });
  assert.equal(again.memoryChanged, false);
  const aged = JSON.parse(JSON.stringify(first.memory));
  for (const rec of Object.values(aged.s)) { rec.f = addDays(input.today, -3); rec.sd = addDays(input.today, -1); }
  const later = analyzeInsight(input, { memory: aged });
  assert.equal(sig(later, 'spending:category:food').lifecycleState, 'ACTIVE');
});
test('lifecycle: worsening and improving against the reference, resolved when it goes away, timeline keeps only material moves', () => {
  const s = (delta, tone = 'watch') => ({ signature: 'x:1', id: 'x:1', domain: 'claims', type: 't', title: 'Klaim lama', summary: '', headline: 'Klaim lama', tone, severity: .4, confidence: confidence({ direct: true }), novelty: 1, unit: 'money', evidence: [], drivers: [], lifecycleState: 'NEW', generatedAt: '', impact: 0, urgency: 0, actionable: true, material: true, caveats: [], deepDive: 'duty', delta });
  const ev = new Set(['claims']);
  let m = applyLifecycle([s(100)], emptyMemory(), '2026-10-01', '2026-09-25', ev).memory;
  let r = applyLifecycle([s(130)], m, '2026-10-05', '2026-09-25', ev);
  assert.equal(r.signals[0].lifecycleState, 'WORSENING');
  r = applyLifecycle([s(100)], r.memory, '2026-10-10', '2026-09-25', ev);
  assert.equal(r.signals[0].lifecycleState, 'IMPROVING');
  r = applyLifecycle([], r.memory, '2026-10-12', '2026-09-25', ev);
  assert.deepEqual(r.resolved.map(x => x.signature), ['x:1']);
  assert.deepEqual(r.memory.tl.map(e => e.e), ['new', 'worse', 'better', 'resolved']);
  // A small move is not a transition.
  m = applyLifecycle([s(100)], emptyMemory(), '2026-10-01', '2026-09-25', ev).memory;
  assert.equal(applyLifecycle([s(108)], m, '2026-10-06', '2026-09-25', ev).memory.tl.length, 1);
});
test('lifecycle: a domain not checked this run is not "resolved"; a cycle-bound signal ends quietly with its cycle', () => {
  const s = { signature: 'spending:category:food', domain: 'spending', title: 'Makan naik', tone: 'watch', severity: .5, delta: 300_000, material: true, actionable: true };
  const m = applyLifecycle([s], emptyMemory(), '2026-10-01', '2026-09-25', new Set(['spending'])).memory;
  assert.equal(applyLifecycle([], m, '2026-10-02', '2026-09-25', new Set()).resolved.length, 0);
  const next = applyLifecycle([], m, '2026-10-27', '2026-10-25', new Set(['spending']));
  assert.equal(next.resolved.length, 0);
  assert.equal(next.memory.s['spending:category:food'], undefined);
});
test('dismiss is not resolve: hidden until it worsens materially, then it resurfaces; snooze hides until a date', () => {
  const { input } = scenario('budget-pressure');
  const first = analyzeInsight(input);
  const food = sig(first, 'spending:category:food');
  const hidden = analyzeInsight(day(input, 1), { memory: dismiss(first.memory, food, input.today) });
  assert.equal(sig(hidden, 'spending:category:food').lifecycleState, 'DISMISSED');
  assert.ok(!hidden.changed.some(s => s.signature === 'spending:category:food'));
  assert.ok(!hidden.priority.some(s => s.signature === 'spending:category:food'));
  assert.ok(!hidden.progress.resolved.some(r => r.signature === 'spending:category:food'), 'dismissed is not resolved');
  // Worse by more than 25%: back as WORSENING.
  const memory = dismiss(first.memory, food, input.today);
  memory.s['spending:category:food'].dv = Math.abs(food.delta) / 2;
  const back = analyzeInsight(input, { memory });
  assert.equal(sig(back, 'spending:category:food').lifecycleState, 'WORSENING');
  const snoozed = analyzeInsight(day(input, 1), { memory: snooze(first.memory, food, addDays(input.today, 7), input.today) });
  assert.equal(sig(snoozed, 'spending:category:food').lifecycleState, 'SNOOZED');
  const woke = analyzeInsight(day(input, 8), { memory: snooze(first.memory, food, addDays(input.today, 7), input.today) });
  assert.notEqual(sig(woke, 'spending:category:food')?.lifecycleState, 'SNOOZED');
  const restored = analyzeInsight(day(input, 1), { memory: restoreAll(dismiss(first.memory, food, input.today)) });
  assert.notEqual(sig(restored, 'spending:category:food').lifecycleState, 'DISMISSED');
});
test('fatigue: an ACTIVE signal fades a little every day it is shown again', () => {
  const { input } = scenario('budget-pressure');
  let memory = analyzeInsight(input).memory, novelty = [];
  // A new day with the same data: age the memory by one day each time.
  for (let d = 0; d < 4; d++) { for (const rec of Object.values(memory.s)) { rec.f = addDays(input.today, -10); rec.sd = addDays(input.today, -1); } const r = analyzeInsight(input, { memory }); memory = r.memory; novelty.push(sig(r, 'spending:category:food').novelty); }
  assert.ok(novelty.every((v, i) => i === 0 || v < novelty[i - 1]), novelty.join(','));
});
test('hidden Advisor cards (old per-device list) stay hidden in V2.5 too', () => {
  const { input } = scenario('budget-pressure');
  const r = analyzeInsight(input, { hiddenFindings: ['emergency'] });
  assert.ok(!r.priority.some(s => s.root.finding?.id === 'emergency'));
});

// ——— Health score delta ———
test('health: no past score → no delta (nothing invented); with a snapshot the reasons add up to the change', () => {
  const { input } = scenario('budget-pressure');
  const r = analyzeInsight(input);
  assert.equal(r.hero.delta, null);
  const old = { ...r.memory, h: [{ d: addDays(input.today, -8), c: '2026-09-25', s: r.hero.score - 6, p: Object.fromEntries(r.advice.parts.map(p => [p.key, p.key === 'savings' ? p.score - 24 : p.score])) }] };
  const later = analyzeInsight(input, { memory: old });
  assert.equal(later.hero.delta.delta, 6);
  assert.equal(later.hero.delta.rows.reduce((n, x) => n + x.change, 0), 6);
  assert.equal(later.hero.delta.rows[0].key, 'savings');
  assert.equal(scoreDelta(r.advice, [], input.today), null);
  const rec = recordScore(emptyMemory(), r.advice, input.today, '2026-09-25');
  assert.equal(recordScore(rec, r.advice, input.today, '2026-09-25'), rec, 'same day, same score: no new write');
});

// ——— Financial safety ———
test('safety: transfers and goal deposits are never spending; Split Bill counts only the own share', () => {
  const { input, report } = run('split-bill');
  const lines = report.context.current.lines;
  assert.ok(!lines.some(l => l.tx.type === 'transfer' && !l.tx.transferFee || l.tx.type === 'fund_contribution'));
  const sb = input.history.find(t => t.id === 'sb1');
  assert.equal(transactionExpense(sb), 25_000);
  assert.equal(lines.filter(l => l.tx.id === 'sb1').reduce((n, l) => n + l.amount, 0), 25_000);
  assert.ok(!report.signals.some(s => /^spending:|^merchant:/.test(s.signature)));
});
test('safety: Insight never changes data — the input ledger is untouched after a run', () => {
  const { input } = scenario('budget-pressure');
  const before = JSON.stringify(input.data);
  const r = analyzeInsight(input); analyzePrices(r);
  assert.equal(JSON.stringify(input.data), before);
});
test('safety: claims and receivables are never counted as available money', () => {
  const { input, report } = run('claims-aging');
  const all = sig(report, 'claims:outstanding');
  const available = all.evidence.find(e => e.label === 'Uang tersedia sekarang');
  assert.equal(available.value, `Rp${Math.round(Math.round((input.stat.free - input.committed) / 1000) * 1000).toLocaleString('id-ID')}`);
});

// ——— Performance ———
test('performance: a full Insight run on ~450 transactions stays well under 200 ms', () => {
  const { input } = scenario('budget-pressure');
  analyzeInsight(input);
  const t = performance.now(); for (let i = 0; i < 5; i++) analyzeInsight(input);
  assert.ok((performance.now() - t) / 5 < 200);
});

test('safety: debt payments without a category are never suggested as something to cut (fix in 4.4)', () => {
  const { report } = run('debt-paydown');
  const all = [...report.advice.actions, ...report.advice.reduce];
  assert.ok(!all.some(f => f.id === 'cut-debt-payment'), all.map(f => f.id).join(','));
  assert.ok(!report.brief.some(b => /Kurangi Bayar utang/.test(b.text)));
});
