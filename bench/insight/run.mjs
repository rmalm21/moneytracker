/**
 * Insight V2.5 benchmark runner: current Advisor (frozen copy, baseline-v43/) vs Insight V2.5 on the same synthetic
 * users. Scores scenario behaviour, not an "accuracy %": does it notice the planted change, name the right cause and
 * mechanism, stay quiet when nothing changed, protect thin / early / incomplete data, keep the money rules.
 *   node bench/insight/run.mjs [--write]
 */
import { writeFileSync } from 'node:fs';
import { transactionExpense } from '../../lib/accounting.ts';
import { analyzeInsight, analyzePrices } from '../../lib/insight-v25/index.ts';
import { mainDriver } from '../../lib/insight-v25/signals/spending.ts';
import { analyzeFinances } from './baseline-v43/advisor.ts';
import { cases } from './cases.mjs';
import { makeUser } from './scenarios.mjs';

const findingsOf = a => [...a.actions, ...a.reduce, ...a.loose, ...a.budgetTips, ...a.habits, ...a.recurring, ...a.obligations, ...a.alerts, ...a.wealth];
const time = (fn, n = 5) => { fn(); const t = performance.now(); let out; for (let i = 0; i < n; i++) out = fn(); return { out, ms: (performance.now() - t) / n }; };
function reconciles(d) { if (!d.children?.length) return true; const total = d.children.reduce((n, c) => n + c.delta, 0); return Math.abs(total - d.delta) < 1e-6 && Math.abs((d.frequencyEffect ?? 0) + (d.ticketEffect ?? 0) - d.delta) < 1e-6 && d.children.every(reconciles); }

const seedArg = process.argv.indexOf('--seeds'), seeds = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 0;
const rows = [];
let reconcileChecks = 0, reconcileFails = 0;
const runs = seeds ? cases.flatMap(c => Array.from({ length: seeds }, (_, i) => ({ ...c, options: { ...c.options, seed: 100 + i }, seed: 100 + i }))) : cases;
for (const c of runs) {
  const { input } = makeUser(c.options);
  const base = time(() => analyzeFinances(input));
  const v25 = time(() => analyzeInsight(input));
  const r = v25.out;
  const signals = [...r.signals, ...(c.prices ? analyzePrices(r) : [])].filter(s => s.lifecycleState !== 'DISMISSED' && s.lifecycleState !== 'SNOOZED');
  const sigs = new Set(signals.map(s => s.signature));
  const checks = {};
  checks.found = c.expect.every(e => sigs.has(e));
  if (c.changed) checks.changed = c.changed.every(e => r.changed.some(s => s.signature === e || s.members.some(m => m.signature === e)));
  checks.quiet = !(c.forbid || []).some(re => signals.some(s => re.test(s.signature)));
  if (c.driver) { const root = signals.find(s => s.signature === c.expect[0]); const path = root ? mainDriver(root.drivers[0]) : []; checks.driver = path.some(d => d.label === c.driver); if (c.mech) { const last = path[path.length - 1]; checks.mech = Boolean(last) && (c.mech === 'frequency' ? Math.abs(last.frequencyEffect) > Math.abs(last.ticketEffect) : Math.abs(last.ticketEffect) > Math.abs(last.frequencyEffect)); } }
  if (c.positive) checks.positive = signals.some(s => s.signature === c.expect[0] && s.tone === 'positive');
  if (c.learning) checks.learning = r.learning.active && r.learning.cycles === (c.options.cycles ?? 6) && !r.changed.length;
  if (c.caveat) checks.caveat = signals.some(s => s.caveats.some(t => c.caveat.test(t)) || c.caveat.test(s.title));
  if (c.cluster) checks.cluster = r.stories.some(st => c.cluster.every(sig => st.signature === sig || st.members.some(m => m.signature === sig)));
  if (c.eta) checks.eta = signals.some(s => s.evidence.some(e => e.label === 'Perkiraan lunas'));
  if (c.safety?.ownShare) { const tx = input.history.find(t => t.id === c.safety.ownShare.tx); checks.safety = transactionExpense(tx) === c.safety.ownShare.amount && r.context.current.lines.filter(l => l.tx.id === tx.id).reduce((n, l) => n + l.amount, 0) === c.safety.ownShare.amount; }
  for (const s of signals) for (const d of s.drivers) if (d.children?.length && s.domain !== 'cashflow') { reconcileChecks++; if (!reconciles(d)) reconcileFails++; }
  const ids = findingsOf(base.out).map(f => f.id);
  const advisor = c.advisor ? (ids.some(id => c.advisor.test(id)) ? 'ya' : 'tidak') : c.advisorCovers === false ? 'tidak dianalisis' : '–';
  const advisorQuiet = c.advisorForbid ? !ids.some(id => c.advisorForbid.test(id)) : null;
  rows.push({ id: c.id, tags: c.tags.join(','), checks, pass: Object.values(checks).every(Boolean), advisor, advisorQuiet, advisorExplains: c.driver ? 'tidak (tanpa penyebab)' : '', msBase: base.ms, msV25: v25.ms, changed: r.changed.map(s => s.signature), top: r.priority.slice(0, 3).map(s => s.signature) });
}

if (seeds) {
  const by = new Map(); for (const r of rows) { const x = by.get(r.id) || { pass: 0, n: 0, advisorHit: 0, advisorQuiet: 0, fails: {}, kind: r.advisor, quietKind: r.advisorQuiet !== null }; x.n++; if (r.pass) x.pass++; if (r.advisor === 'ya') x.advisorHit++; if (r.advisorQuiet) x.advisorQuiet++; for (const [k, v] of Object.entries(r.checks)) if (!v) x.fails[k] = (x.fails[k] || 0) + 1; by.set(r.id, x); }
  const hit = x => x.kind === '–' || x.kind === 'tidak dianalisis' ? x.kind : `${x.advisorHit}/${x.n}`, quiet = x => x.quietKind ? `${x.advisorQuiet}/${x.n}` : '–';
  console.log(`Ketahanan ${seeds} seed per skenario:`);
  for (const [id, x] of by) console.log(`  ${id.padEnd(20)} V2.5 ${x.pass}/${x.n}${Object.keys(x.fails).length ? ` (gagal: ${Object.entries(x.fails).map(([k, v]) => `${k}×${v}`).join(', ')})` : ''} | Advisor menangkap ${hit(x)} · tenang ${quiet(x)}`);
  if (process.argv.includes('--write')) writeFileSync(new URL('./RESULTS-seeds.md', import.meta.url), ['# Insight V2.5 — ketahanan seed', '', `${seeds} seed per skenario (seed 100–${99 + seeds}), dijalankan: node bench/insight/run.mjs --seeds ${seeds} --write`, '', '| Skenario | V2.5 lulus | Cek yang gagal | Advisor 4.3 menangkap | Advisor 4.3 tenang |', '|---|---|---|---|---|', ...[...by].map(([id, x]) => `| ${id} | ${x.pass}/${x.n} | ${Object.entries(x.fails).map(([k, v]) => `${k}×${v}`).join(', ') || '–'} | ${hit(x)} | ${quiet(x)} |`)].join('\n') + '\n');
  process.exit(0);
}
const pass = rows.filter(r => r.pass).length;
console.log(`Insight V2.5: ${pass}/${rows.length} skenario lulus · rekonsiliasi driver ${reconcileChecks - reconcileFails}/${reconcileChecks}`);
for (const r of rows) console.log(`${r.pass ? '✓' : '✗'} ${r.id.padEnd(20)} ${Object.entries(r.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'GAGAL'}`).join(' ')} | Advisor: ${r.advisor}${r.advisorQuiet === null ? '' : ` tenang:${r.advisorQuiet ? 'ya' : 'tidak'}`} | ${r.msBase.toFixed(1)}ms → ${r.msV25.toFixed(1)}ms | berubah: ${r.changed.join(', ') || '–'}`);
if (process.argv.includes('--write')) {
  const lines = ['# Insight V2.5 benchmark — hasil', '', `Dijalankan: node bench/insight/run.mjs --write · ${pass}/${rows.length} skenario lulus · rekonsiliasi driver ${reconcileChecks - reconcileFails}/${reconcileChecks}`, '',
    '| Skenario | Jenis | Cek V2.5 | V2.5 | Advisor 4.3 menangkap? | Advisor tenang? | Advisor ms | V2.5 ms |', '|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.tags} | ${Object.entries(r.checks).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(', ')} | ${r.pass ? 'lulus' : 'gagal'} | ${r.advisor} | ${r.advisorQuiet === null ? '–' : r.advisorQuiet ? 'ya' : 'tidak'} | ${r.msBase.toFixed(1)} | ${r.msV25.toFixed(1)} |`)];
  writeFileSync(new URL('./RESULTS.md', import.meta.url), `${lines.join('\n')}\n`);
}
