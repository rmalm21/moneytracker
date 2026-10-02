import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metrics, transactionExpense } from '../lib/accounting.ts';
import { availableMoney, safeDaily, upcomingEvents } from '../lib/finance-control.ts';
import { savingsPlan } from '../lib/savings.ts';
import { analyzeInsight } from '../lib/insight-v25/index.ts';
import { scoreDelta } from '../lib/insight-v25/health.ts';
import { analyzeInsightV3, horizonOf } from '../lib/insight-v3/index.ts';
import { ask, classify, suggestedQuestions } from '../lib/insight-v3/ask.ts';
import { noContradiction } from '../lib/insight-v3/brief.ts';
import { outcomes, recordDecision } from '../lib/insight-v3/decisions.ts';
import { conflicts, auditStory } from '../lib/insight-v3/guard.ts';
import { itemIdentity } from '../lib/insight-v25/signals/prices.ts';
import { cases } from '../bench/insight/cases.mjs';
import { addDays, makeUser, parse } from '../bench/insight/scenarios.mjs';

const scenario = (id, extra = {}) => makeUser({ ...cases.find(c => c.id === id).options, ...extra });
const v3 = (input, options = {}) => analyzeInsightV3(input, options);
const claim = (id, name, amount, d, extra = {}) => ({ id, name, amount, remainingAmount: amount, sourceWalletId: 'bca', submissionDate: d, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '', ...extra });
const paidClaims = (today, n = 4, days = 10) => Array.from({ length: n }, (_, i) => claim(`p${i}`, `Lama ${i}`, 300_000, addDays(today, -150 + i * 20), { status: 'paid', remainingAmount: 0, paidDate: addDays(today, -150 + i * 20 + days) }));

// ——— World model ———
test('world: every number comes from the canonical engines', () => {
  const { input } = scenario('goals-pressure');
  const r = v3(input), w = r.world, cur = r.v25.context.current;
  const stat = metrics(input.data, cur.start, cur.end, input.salaryDay, parse(input.today));
  assert.equal(w.liquidity.free, stat.free);
  assert.equal(w.liquidity.available, availableMoney(stat.free, input.committed, { freeMoneyBuffer: input.safetyBuffer }));
  assert.equal(w.liquidity.safeDaily, safeDaily(stat.discretionaryRemaining, cur.daysLeft));
  assert.equal(w.obligations.debtOutstanding, stat.liabilities);
  assert.equal(w.wealth.netWorth, stat.netWorth);
  for (const t of w.targets) { const f = input.data.funds.find(x => x.id === t.id); if (f.walletIds?.length) continue; assert.equal(t.perMonth, savingsPlan(f, input.today).perMonth || f.monthlyContribution || 0); }
  assert.equal(w.obligations.upcoming.length, upcomingEvents(input.data, w.profile, { start: input.today, end: addDays(cur.end, 1) }).length);
});
test('world: transfers and goal deposits are not spending; claims and receivables are not available money', () => {
  const { input } = scenario('stable');
  const before = v3(input).world;
  input.data.claims.push(claim('cx', 'Dinas', 2_000_000, addDays(input.today, -3)));
  input.data.receivables.push({ id: 'rx', person: 'Dodi', description: '', originalAmount: 900_000, remainingAmount: 900_000, sourceWalletId: 'bca', date: addDays(input.today, -2), dueDate: '', status: 'open' });
  const after = v3(input).world;
  assert.equal(after.liquidity.available, before.liquidity.available);
  assert.equal(after.obligations.claimsOutstanding, 2_000_000);
  const spent = input.history.filter(t => t.date >= after.currentCycle.start && t.date <= input.today).reduce((n, t) => n + transactionExpense(t), 0);
  assert.equal(after.currentCycle.expense, spent);
});

// ——— Impact graph ———
test('graph: direct edges are arithmetic; correlation never becomes a direct edge', () => {
  const { input } = scenario('budget-pressure');
  const r = v3(input);
  const food = r.v25.signals.find(s => s.signature === 'spending:category:food');
  const toAvailable = r.graph.edges.find(e => e.from === food.signature && e.to === 'state:available');
  assert.equal(toAvailable.basis, 'direct'); assert.equal(toAvailable.amount, Math.abs(food.delta));
  for (const e of r.graph.edges.filter(e => e.kind === 'explains')) { const child = r.v25.signals.find(s => s.signature === e.from); assert.equal(e.amount, child.delta); assert.equal(e.basis, 'direct'); }
  for (const e of r.graph.edges) {
    if (e.kind === 'associated_with') assert.equal(e.basis, 'associated');
    if (e.kind === 'estimated_to_affect') assert.equal(e.basis, 'estimated');
  }
  const chain = r.chain('spending:category:food');
  assert.ok(chain.some(e => e.to === 'budget:pressure:b-food') && chain.some(e => e.to === 'state:available'));
  assert.ok(chain.findIndex(e => e.basis !== 'direct') === -1 || chain.slice(chain.findIndex(e => e.basis !== 'direct')).every(e => e.basis !== 'direct'), 'direct first');
});

// ——— Pressure, momentum, regime ———
test('pressure: temporary claim pressure shows, but the Health score does not move', () => {
  const { input } = scenario('stable');
  const plain = v3(input);
  input.data.claims.push(claim('c1', 'Dinas', 4_000_000, addDays(input.today, -35)), ...paidClaims(input.today));
  const heavy = v3(input);
  assert.equal(heavy.hero.score, plain.hero.score);
  const p = heavy.pressures.find(x => x.domain === 'claim');
  assert.ok(p && (p.level === 'watch' || p.level === 'pressure'), JSON.stringify(p));
  assert.ok(heavy.mainPressure.some(x => x.domain === 'claim'));
});
test('momentum: debt down while spending rises is MIXED; parts are named, no mystery number', () => {
  const { input } = scenario('debt-paydown', { change: (h, ci) => ci >= 5 && (h.key === 'grabfood' || h.key === 'online') ? { perCycle: 2.2 } : {} });
  const m = v3(input).momentum;
  assert.equal(m.state, 'MIXED', JSON.stringify(m.parts));
  assert.ok(m.parts.some(p => p.key === 'debt' && p.good) && m.parts.some(p => p.key === 'spending' && p.good === false));
  assert.equal(typeof m.label, 'string');
});
test('regime: a travel-heavy cycle is context — travel spending is reported but not as a warning', () => {
  const { input } = makeUser({ build: ({ data, today, tx }) => { data.transactions.push(tx('expense', 1_900_000, addDays(today, -5), { categoryId: 'travel', subcategoryId: 'travel-ticket', merchant: 'Traveloka', description: 'Tiket pesawat Bali', id: 'tr1' }), tx('expense', 1_200_000, addDays(today, -4), { categoryId: 'travel', subcategoryId: 'travel-hotel', merchant: 'Traveloka', description: 'Hotel Bali', id: 'tr2' })); } });
  const r = v3(input);
  assert.ok(r.regimes.some(x => x.key === 'TRAVEL_HEAVY'));
  for (const s of r.v25.signals.filter(s => /Liburan|Traveloka|Tiket|Hotel/.test(s.title))) { assert.notEqual(s.tone, 'important'); assert.notEqual(s.tone, 'watch'); }
});

// ——— Scenario engine ———
test('scenario: read-only, consistent, reusable', () => {
  const { input } = scenario('budget-pressure');
  const r = v3(input), snapshot = JSON.stringify(input.data);
  const base = r.scenarios.base;
  const bill = r.whatIf({ expenseDelta: 1_000_000 });
  assert.equal(Math.round(base.beforePayday - bill.beforePayday), 1_000_000);
  const low = r.whatIf({ incomeFactor: .8 });
  assert.equal(Math.round(base.afterSalary - low.afterSalary), Math.round(input.monthlySalary * .2));
  const calmer = r.whatIf({ dailyAdjust: -10 });
  assert.ok(calmer.beforePayday > base.beforePayday);
  r.stress(); r.whatIf({ largePurchase: { amount: 5_000_000 } });
  assert.equal(JSON.stringify(input.data), snapshot);
  assert.equal(r.whatIf({}).beforePayday, base.beforePayday);
});
test('scenario: claim arrives vs delayed are shown as two cases, from the usual payout time', () => {
  const { input } = makeUser({ build: ({ data, today }) => { data.claims.push(claim('c9', 'Dinas Surabaya', 1_500_000, addDays(today, -6)), ...paidClaims(today, 4, 9)); } });
  const r = v3(input), { claimArrives: a, claimDelayed: d } = r.scenarios;
  assert.ok(a.points.some(p => p.events.some(e => e.kind === 'claim')));
  assert.ok(!d.points.some(p => p.events.some(e => e.kind === 'claim')));
  assert.ok(a.beforePayday - d.beforePayday === 1_500_000);
  const answer = ask('kalau klaim telat gimana', r);
  assert.equal(answer.intent, 'SCENARIO'); assert.equal(answer.simulation, true); assert.ok(answer.lines.some(l => /simulasi/i.test(l)) || answer.simulation);
});
test('goal trade-offs: options with consequences, no winner chosen', () => {
  const { input } = scenario('goals-pressure');
  const r = v3(input);
  assert.ok(r.goalOptions.length >= 2);
  assert.ok(!JSON.stringify(r.goalOptions).match(/terbaik|paling baik|direkomendasikan/i));
  assert.ok(r.goalOptions.every(o => o.delays.length));
});

// ——— Prices & income ———
test('personal cost index: only compatible repeated items, coverage-aware, size-safe', () => {
  const { input } = makeUser({ itemPrice: (item, ci) => ci >= 5 ? 1.08 : 1 });
  const idx = v3(input).costIndex();
  assert.equal(idx.ok, true, idx.reason);
  assert.ok(Math.abs(idx.change - .08) < .02, String(idx.change));
  assert.ok(idx.coverage >= .3 && idx.items >= 5);
  assert.notEqual(itemIdentity('Susu UHT 250ml').size, itemIdentity('Susu UHT 1L').size);
  const thin = makeUser({ habits: [{ key: 'groc', merchant: 'Indomaret', categoryId: 'shop', subcategoryId: 'shop-groc', perCycle: 1, ticket: 0, wallet: 'bca', receipt: true }], itemExtra: (item, ci) => ({ name: `${item.name} varian ${ci}`, sku: `${item.sku}-${ci}` }) }).input;
  const none = v3(thin).costIndex();
  assert.equal(none.ok, false); assert.ok(none.reason.length > 0);
});
test('income: overtime never becomes guaranteed salary; dependency is reported', () => {
  const { input } = makeUser({ extraIncome: ci => ci % 2 ? 2_500_000 : 1_500_000 });
  const r = v3(input);
  assert.equal(r.world.income.regularTypical, input.monthlySalary);
  assert.ok(r.world.income.floor <= input.monthlySalary);
  assert.ok(r.world.income.irregularShare > .1);
  assert.ok(r.extra.some(s => s.signature === 'income:dependency'));
});

// ——— Decisions & outcomes ———
test('decision memory: an Insight budget action keeps its source; the outcome compares before/after with "setelah"', () => {
  const { input } = makeUser({ change: (h, ci) => h.key === 'grabfood' && ci >= 4 ? { perCycle: .3 } : {} });
  const ctx = analyzeInsight(input).context;
  const decisionDay = addDays(ctx.cycles[3].start, 3);
  const memory = recordDecision({ v: 1, s: {}, h: [], tl: [] }, { d: decisionDay, k: 'budget_set', sig: 'spending:category:food', f: 'tight-b-food', cat: 'food', budgetId: 'b-food', label: 'Anggaran Makan diubah', before: 1_500_000, after: 1_100_000 });
  assert.equal(memory.dec[0].sig, 'spending:category:food'); assert.equal(memory.dec[0].f, 'tight-b-food');
  const [o] = outcomes(memory, ctx);
  assert.equal(o.status, 'improved', o.text);
  assert.match(o.text, /Setelahnya/); assert.doesNotMatch(o.text, /karena/);
  assert.ok(o.after < o.before);
  const r = v3(input, { memory });
  assert.ok(r.memory.tl.some(e => e.e === 'outcome'));
});

// ——— Ask Insight ———
test('Ask Insight: read-only by construction and in behaviour', () => {
  const src = readFileSync(new URL('../lib/insight-v3/ask.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /firestore|saveRecord|saveProfile|upsert|deleteTransaction|writeBatch|setDoc|updateDoc|deleteDoc/);
  const { input } = scenario('claims-aging');
  const r = v3(input), snapshot = JSON.stringify(input.data), mem = JSON.stringify(r.memory);
  for (const q of [...suggestedQuestions, 'kenapa belanja naik', 'berapa harga beras', 'prioritas gue apa', 'ceritakan lelucon']) ask(q, r);
  assert.equal(JSON.stringify(input.data), snapshot); assert.equal(JSON.stringify(r.memory), mem);
});
test('Ask Insight: intents, evidence links, honest fallback', () => {
  const { input } = scenario('budget-pressure');
  input.data.claims.push(claim('c1', 'Dinas', 900_000, addDays(input.today, -20)));
  const r = v3(input);
  assert.equal(classify('Makan naik karena apa?', r).intent, 'CATEGORY_DRIVER');
  assert.equal(classify('Piutang gue berapa?', r).intent, 'RECEIVABLE_STATUS');
  assert.equal(classify('kenapa uang tersedia turun', r).intent, 'LIQUIDITY_EXPLAIN');
  const food = ask('Makan naik karena apa?', r);
  assert.ok(food.evidence.includes('spending:category:food')); assert.ok(food.lines.some(l => /GrabFood|Pesan Antar/.test(l)));
  const claimAnswer = ask('klaim gue gimana', r); assert.ok(claimAnswer.evidence.includes('claims:outstanding'));
  const liq = ask('Kenapa uang tersedia turun?', r);
  assert.ok(liq.lines.some(l => /= uang tersedia/.test(l)));
  const unknown = ask('siapa presiden pertama', r);
  assert.equal(unknown.intent, 'UNKNOWN'); assert.equal(unknown.evidence.length, 0); assert.ok(unknown.lines.length > 1);
});

// ——— Brief, explain, silence, conflicts, audit ———
test('brief: every sentence has a source; contradictions are dropped', () => {
  for (const id of ['budget-pressure', 'debt-paydown', 'claims-aging', 'stable']) { const r = v3(scenario(id).input); assert.ok(r.brief.length >= 1 && r.brief.length <= 5); for (const b of r.brief) assert.ok(b.source && b.text.length > 10, id); }
  const lines = noContradiction([{ text: 'Cashflow membaik', source: 'a', domain: 'cashflow', polarity: 1, horizon: 'CURRENT_CYCLE' }, { text: 'Cashflow memburuk', source: 'b', domain: 'cashflow', polarity: -1, horizon: 'CURRENT_CYCLE' }, { text: 'Cashflow jangka panjang turun', source: 'c', domain: 'cashflow', polarity: -1, horizon: 'MULTI_CYCLE' }]);
  assert.deepEqual(lines.map(l => l.source), ['a', 'c']);
  const explain = v3(scenario('budget-pressure').input).explain();
  assert.deepEqual(explain.map(s => s.title), ['Ringkasan', 'Penyebab utama', 'Kemajuan', 'Tekanan', 'Kewajiban terdekat']);
});
test('silence: stable finances produce no fake warnings', () => {
  const r = v3(scenario('stable').input);
  assert.equal(r.changed.length, 0); assert.equal(r.silent, true);
  assert.equal(r.hero.statement, 'Keuangan relatif stabil.');
  assert.ok(!r.extra.some(s => s.tone === 'important'));
});
test('conflicts: no investing advice while the path to payday is tight; self-audit drops redundant stories', () => {
  const sig = id => ({ signature: id, title: id, tone: 'positive', caveats: [], finding: { id: id.replace('advisor:', ''), tone: 'good', title: '', detail: '' } });
  const tight = [{ domain: 'liquidity', level: 'pressure', label: 'Likuiditas', score: .9, reasons: [] }];
  const out = conflicts([sig('advisor:invest'), sig('advisor:idle-operational'), sig('advisor:emergency')], tight, { obligations: { upcoming: [] } });
  assert.deepEqual(out.map(x => x.signature).sort(), ['advisor:idle-operational', 'advisor:invest']);
  assert.equal(conflicts([sig('advisor:invest')], [{ domain: 'liquidity', level: 'good' }], { obligations: { upcoming: [] } }).length, 0);
  const r = v3(scenario('budget-pressure').input);
  const story = r.v25.stories.find(s => s.signature === 'spending:category:food');
  const fake = { ...story, signature: 'x', root: story.members[0], members: [] };
  assert.equal(auditStory(fake, r.v25.stories, new Set()).checks.find(c => c.key === 'redundant').ok, false);
});

// ——— Lifecycle / memory / health version ———
test('memory: V3 additions (milestones, decisions) stay idempotent and never copy the ledger', () => {
  const { input } = scenario('debt-paydown');
  const first = v3(input);
  const again = v3({ ...input, history: [...input.history] }, { memory: first.memory });
  assert.equal(again.memoryChanged, false);
  const json = JSON.stringify(first.memory);
  assert.ok(!json.includes('"walletId"') && !json.includes('"transactions"'));
  assert.ok(json.length < 20_000);
});
test('milestone: debt falling below a round amount enters the timeline once', () => {
  const { input } = scenario('debt-paydown');
  const first = v3(input);
  const memory = { ...first.memory, mi: { ...first.memory.mi, debt: 9 } };
  const r = v3(input, { memory });
  assert.ok(r.memory.tl.some(e => e.e === 'milestone' && /Utang turun di bawah Rp6 jt/.test(e.t)));
  const r2 = v3(input, { memory: r.memory });
  assert.equal(r2.memory.tl.filter(e => e.e === 'milestone').length, r.memory.tl.filter(e => e.e === 'milestone').length);
});
test('health versioning: scores from another formula version are never compared', () => {
  const advice = { score: 70, parts: [{ key: 'savings', label: 'Rasio', score: 70, weight: 100 }] };
  assert.equal(scoreDelta(advice, [{ d: '2026-09-01', c: '2026-08-25', s: 60, hv: 2, p: { savings: 60 } }], '2026-10-12'), null);
  assert.equal(scoreDelta(advice, [{ d: '2026-09-01', c: '2026-08-25', s: 60, p: { savings: 60 } }], '2026-10-12').delta, 10);
});
test('horizon: every signal has one', () => {
  const r = v3(scenario('claims-aging').input);
  for (const s of [...r.v25.signals, ...r.extra]) assert.ok(['IMMEDIATE', 'CURRENT_CYCLE', 'MULTI_CYCLE', 'LONG_TERM'].includes(horizonOf(s)));
  assert.equal(horizonOf(r.v25.signals.find(s => s.signature === 'claims:aging:c1')), 'IMMEDIATE');
  assert.equal(horizonOf(r.v25.signals.find(s => s.signature === 'claims:outstanding')), 'CURRENT_CYCLE');
});

// ——— V2.5 preserved ———
test('V2.5 is preserved inside V3: same signals, stories and Advisor output', () => {
  const { input } = scenario('budget-pressure');
  const a = analyzeInsight(input), b = v3(input).v25;
  assert.deepEqual(JSON.parse(JSON.stringify(b.advice)), JSON.parse(JSON.stringify(a.advice)));
  for (const s of a.signals) assert.ok(b.signals.some(x => x.signature === s.signature), s.signature);
});

// ——— Performance ———
test('performance: small, medium, large and receipt-heavy histories', () => {
  const sizes = [['small', makeUser({ cycles: 1 }).input, 150], ['medium', makeUser().input, 250], ['large', makeUser({ habits: undefined, change: h => ({ perCycle: 3 }) }).input, 600], ['receipts', makeUser({ change: h => h.receipt ? { perCycle: 6 } : {} }).input, 400]];
  for (const [name, input, limit] of sizes) { v3({ ...input, today: input.today }); const t = performance.now(); v3({ ...input, history: [...input.history] }); const ms = performance.now() - t; assert.ok(ms < limit, `${name}: ${ms.toFixed(0)} ms for ${input.history.length} tx`); }
});
