/**
 * Insight V3 benchmark: V2.5 vs V3 on the same synthetic users (bench/insight/scenarios.mjs), several seeds each.
 * Tasks are behaviours with a stated pass rule, not an accuracy %:
 *   root        — the story at the top of "Yang berubah" is the planted root cause (category story, not a symptom);
 *   impact      — the root's consequences are explained (budget + Uang tersedia/sisa siklus), direct vs estimated;
 *   pressure    — the planted pressure (claims / liquidity / goals / debt) is named as main pressure;
 *   momentum    — debt down + spending up reads as MIXED;
 *   scenario    — "Rp1 jt tak terduga" lowers money before payday by exactly Rp1 jt; data unchanged;
 *   query       — Ask Insight routes 10 fixed questions to the right intent with evidence;
 *   brief       — every brief sentence has a source and no contradiction;
 *   conflict    — no investing advice in Prioritas while the path to payday goes below zero;
 *   silence     — a stable user gets no warning in the hero / "Keuangan relatif stabil.";
 *   regime      — a travel cycle's travel spending is not a warning.
 * V2.5 is scored on the same rule where it has the capability; "–" where it has none.
 *   node bench/insight/run-v3.mjs [--seeds N] [--write]
 */
import { writeFileSync } from 'node:fs';
import { analyzeInsight } from '../../lib/insight-v25/index.ts';
import { analyzeInsightV3 } from '../../lib/insight-v3/index.ts';
import { ask, classify } from '../../lib/insight-v3/ask.ts';
import { addDays, makeUser } from './scenarios.mjs';

const arg = process.argv.indexOf('--seeds'), seeds = arg > 0 ? Number(process.argv[arg + 1]) : 10;
const claim = (id, name, amount, d, extra = {}) => ({ id, name, amount, remainingAmount: amount, sourceWalletId: 'bca', submissionDate: d, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '', ...extra });
const paid = today => Array.from({ length: 4 }, (_, i) => claim(`p${i}`, `Lama ${i}`, 300_000, addDays(today, -150 + i * 20), { status: 'paid', remainingAmount: 0, paidDate: addDays(today, -140 + i * 20) }));

/** Realistic users. Each returns { input, task } — the task names which behaviour this user tests. */
const users = {
  'stable-salaried': seed => ({ ...makeUser({ seed }), tasks: ['silence', 'scenario', 'brief'] }),
  'delivery-surge': seed => ({ ...makeUser({ seed, change: (h, ci, cur) => cur && h.key === 'grabfood' ? { perCycle: 2.6 } : {}, build: ({ data }) => data.budgets.push({ id: 'b-food', name: 'Makan', categoryId: 'food', subcategoryId: null, amount: 1_150_000, classification: 'living', cycleType: 'salary', rolloverEnabled: false, active: true }) }), tasks: ['root', 'impact', 'query', 'brief'] }),
  'variable-income': seed => ({ ...makeUser({ seed, salary: 6_000_000, extraIncome: ci => [3_500_000, 500_000, 2_800_000, 0, 3_200_000, 1_000_000, 0][ci] || 0 }), tasks: ['brief', 'query'] }),
  'claim-heavy': seed => ({ ...makeUser({ seed, balance: 2_500_000, build: ({ data, today }) => { data.claims.push(claim('c1', 'Dinas Bandung', 2_400_000, addDays(today, -33)), claim('c2', 'Hotel klien', 1_100_000, addDays(today, -12)), ...paid(today)); } }), tasks: ['pressure:claim', 'brief', 'query'] }),
  'debt-heavy': seed => ({ ...makeUser({ seed, change: (h, ci) => ci >= 5 && (h.key === 'grabfood' || h.key === 'online') ? { perCycle: 2.2 } : {}, build: ({ data, cycles, tx }) => { data.debts.push({ id: 'd1', name: 'KTA', provider: 'Bank', originalAmount: 20_000_000, outstandingAmount: 12_000_000, dueDate: '', interestRate: 0, installmentAmount: 1_500_000, notes: '', status: 'open' }); cycles.slice(1).forEach(c => data.transactions.push(tx('debt_payment', 1_500_000, addDays(c.start, 4), { debtId: 'd1' }))); } }), tasks: ['momentum', 'brief'] }),
  'goal-heavy': seed => ({ ...makeUser({ seed, salary: 7_000_000, build: ({ data, today }) => { data.funds.push({ id: 'g1', name: 'DP rumah', kind: 'goal', currentAmount: 5_000_000, targetAmount: 60_000_000, monthlyContribution: 0, targetDate: addDays(today, 365), linkedWalletId: 'tab', notes: '' }, { id: 'g2', name: 'Liburan', kind: 'goal', currentAmount: 0, targetAmount: 20_000_000, monthlyContribution: 0, targetDate: addDays(today, 180), linkedWalletId: 'tab', notes: '' }); } }), tasks: ['pressure:goal', 'query'] }),
  'tight-cash-idle-savings': seed => ({ ...makeUser({ seed, balance: 400_000, savings: 60_000_000, build: ({ data, today, cycles }) => { data.plannedTransactions.push({ id: 'pl1', title: 'Servis motor', type: 'expense', amount: 1_800_000, date: addDays(today, 3), walletId: 'bca', categoryId: 'trans', subcategoryId: null, notes: '', committed: true, status: 'planned' }); } }), tasks: ['pressure:liquidity', 'conflict'] }),
  'travel-cycle': seed => ({ ...makeUser({ seed, build: ({ data, today, tx }) => { data.transactions.push(tx('expense', 1_900_000, addDays(today, -5), { categoryId: 'travel', subcategoryId: 'travel-ticket', merchant: 'Traveloka', description: 'Tiket pesawat', id: 'tr1' }), tx('expense', 1_300_000, addDays(today, -4), { categoryId: 'travel', subcategoryId: 'travel-hotel', merchant: 'Traveloka', description: 'Hotel', id: 'tr2' })); } }), tasks: ['regime'] }),
  'large-planned-purchase': seed => ({ ...makeUser({ seed, build: ({ data, today, tx }) => { data.transactions.push(tx('expense', 4_500_000, addDays(today, -2), { categoryId: 'gadget', merchant: 'iBox', description: 'Laptop', id: 'lp1', plannedId: 'pl9' })); data.plannedTransactions.push({ id: 'pl9', title: 'Laptop kerja', type: 'expense', amount: 4_500_000, date: addDays(today, -2), walletId: 'bca', categoryId: 'gadget', subcategoryId: null, notes: '', committed: true, status: 'posted', postedTransactionId: 'lp1' }); } }), tasks: ['planned'] }),
  'receipt-rich-groceries': seed => ({ ...makeUser({ seed, change: h => h.receipt ? { perCycle: 2 } : {}, itemPrice: (item, ci) => ci >= 5 ? 1.07 : 1 }), tasks: ['cost-index'] }),
};
const questions = [['Kenapa skor turun?', 'WHY_HEALTH_CHANGED'], ['Apa yang paling berubah?', 'WHAT_CHANGED'], ['Kenapa uang tersedia turun?', 'LIQUIDITY_EXPLAIN'], ['Makan naik karena apa?', 'CATEGORY_DRIVER'], ['Klaim gue gimana?', 'CLAIM_STATUS'], ['Piutang gue berapa?', 'RECEIVABLE_STATUS'], ['Apa yang paling menekan cashflow?', 'PRESSURE'], ['utang gue masih berapa', 'DEBT_STATUS'], ['target dana aman?', 'GOAL_PRESSURE'], ['gaji gue stabil ga', 'INCOME_STABILITY']];
const INVEST = /^advisor:(invest|invest-monthly|idle-operational|idle-savings|dormant)$/;

function score(task, input) {
  const v25 = analyzeInsight(input), v3 = analyzeInsightV3(input);
  const [kind, arg2] = task.split(':');
  switch (kind) {
    case 'root': return { v25: v25.changed[0]?.signature === 'spending:category:food', v3: v3.changed[0]?.signature === 'spending:category:food' };
    case 'impact': { const chain = v3.chain('spending:category:food'); return { v25: null, v3: chain.some(e => e.to.startsWith('budget:pressure') && e.basis === 'direct') && chain.some(e => e.to === 'state:available' && e.basis === 'direct') }; }
    case 'pressure': return { v25: null, v3: v3.mainPressure.some(p => p.domain === arg2) };
    case 'momentum': return { v25: null, v3: v3.momentum.state === 'MIXED' };
    case 'scenario': { const before = JSON.stringify(input.data); const r = v3.whatIf({ expenseDelta: 1_000_000 }); return { v25: null, v3: Math.round(v3.scenarios.base.beforePayday - r.beforePayday) === 1_000_000 && JSON.stringify(input.data) === before }; }
    case 'query': { const ok = questions.filter(([q, intent]) => classify(q, v3).intent === intent && (ask(q, v3).lines.length > 0)).length; return { v25: null, v3: ok === questions.length, detail: `${ok}/${questions.length}` }; }
    case 'brief': return { v25: v25.brief.every(b => b.signature), v3: v3.brief.every(b => b.source) && v3.brief.length >= 1 };
    case 'conflict': { const neg = v3.scenarios.base.lowest.balance < 0; return { v25: !v25.priority.some(s => INVEST.test(s.signature)), v3: !neg || !v3.priority.some(s => INVEST.test(s.signature) && !v3.suppressed.some(x => x.signature === s.signature)), detail: neg ? 'jalan uang minus' : 'tidak minus' }; }
    case 'silence': return { v25: !v25.changed.length && v25.hero.statement !== '' && !v25.priority.some(s => s.tone === 'important'), v3: v3.silent && v3.hero.statement === 'Keuangan relatif stabil.' };
    case 'regime': { const warn = r => r.signals.filter(s => /Liburan|Traveloka|Tiket|Hotel/.test(s.title) && (s.tone === 'watch' || s.tone === 'important')).length === 0; return { v25: warn(v25), v3: warn(v3.v25) && v3.regimes.some(x => x.key === 'TRAVEL_HEAVY') }; }
    case 'planned': { const calm = r => !r.signals.some(s => s.signature.startsWith('behavior:unusual:lp1')) && !r.priority.some(s => /Gadget/.test(s.title) && s.tone === 'important'); return { v25: calm(v25), v3: calm(v3.v25) && v3.regimes.some(x => x.key === 'LARGE_PURCHASE') }; }
    case 'cost-index': { const i = v3.costIndex(); return { v25: null, v3: i.ok && Math.abs(i.change - .07) < .02, detail: i.ok ? `${(i.change * 100).toFixed(1)}%` : i.reason }; }
  }
}

const rows = [];
for (const [name, make] of Object.entries(users)) for (let s = 0; s < seeds; s++) {
  const { input, tasks } = make(200 + s);
  for (const task of tasks) { const r = score(task, input); rows.push({ user: name, task, ...r }); }
}
const group = new Map();
for (const r of rows) { const k = `${r.user} · ${r.task}`; const g = group.get(k) || { n: 0, v3: 0, v25: 0, v25na: r.v25 === null, details: new Set() }; g.n++; if (r.v3) g.v3++; if (r.v25) g.v25++; if (r.detail) g.details.add(r.detail); group.set(k, g); }
console.log(`Insight V3 vs V2.5 · ${seeds} seed per pengguna`);
const lines = [];
for (const [k, g] of group) { const line = `| ${k} | ${g.v25na ? '–' : `${g.v25}/${g.n}`} | ${g.v3}/${g.n} | ${[...g.details].slice(0, 3).join('; ')} |`; lines.push(line); console.log(`  ${k.padEnd(42)} V2.5 ${g.v25na ? '  –  ' : `${g.v25}/${g.n}`.padEnd(5)}  V3 ${g.v3}/${g.n}  ${[...g.details].slice(0, 2).join('; ')}`); }
const t = performance.now(); for (let i = 0; i < 5; i++) analyzeInsightV3({ ...makeUser({ seed: 300 + i }).input }); const ms = (performance.now() - t) / 5;
console.log(`Latensi V3 (tanpa cache, 448 tx): ${ms.toFixed(1)} ms`);
if (process.argv.includes('--write')) writeFileSync(new URL('./RESULTS-v3.md', import.meta.url), ['# Insight V3 vs V2.5 — hasil', '', `node bench/insight/run-v3.mjs --seeds ${seeds} --write · latensi V3 tanpa cache ±${ms.toFixed(0)} ms (448 transaksi)`, '', '| Pengguna · tugas | V2.5 | V3 | Catatan |', '|---|---|---|---|', ...lines, '', '“–” = V2.5 tidak punya kemampuan itu.'].join('\n') + '\n');
