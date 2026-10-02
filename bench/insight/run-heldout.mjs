/**
 * Insight V2.5 held-out run. `--freeze` writes the first result to heldout-first.json (only if it does not exist).
 *   node bench/insight/run-heldout.mjs [--freeze]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { analyzeInsight } from '../../lib/insight-v25/index.ts';
import { mainDriver } from '../../lib/insight-v25/signals/spending.ts';
import { analyzeFinances } from './baseline-v43/advisor.ts';
import { heldout } from './cases-heldout.mjs';
import { makeUser } from './scenarios.mjs';

const results = heldout.map(c => {
  const { input } = makeUser(c.options);
  const r = analyzeInsight(input), advice = analyzeFinances(input);
  const signals = r.signals.filter(s => s.lifecycleState !== 'DISMISSED' && s.lifecycleState !== 'SNOOZED'), has = sig => signals.find(s => s.signature === sig);
  const checks = {};
  if (c.expect) checks.found = c.expect.every(has);
  const hit = c.expectAny ? c.expectAny.map(has).find(Boolean) : c.expect?.[0] && has(c.expect[0]);
  if (c.expectAny) checks.found = Boolean(hit);
  if (c.forbid) checks.quiet = !c.forbid.some(re => signals.some(s => re.test(s.signature)));
  if (c.mech && hit) { const story = r.stories.find(st => st.signature === hit.signature || st.members.some(m => m.signature === hit.signature)); const path = mainDriver((story?.root || hit).drivers[0]); const last = path[path.length - 1] || (story?.root || hit).drivers[0]; checks.mech = c.mech === 'frequency' ? Math.abs(last.frequencyEffect) > Math.abs(last.ticketEffect) : Math.abs(last.ticketEffect) > Math.abs(last.frequencyEffect); }
  else if (c.mech) checks.mech = false;
  if (c.positive) checks.positive = Boolean(hit && hit.tone === 'positive');
  if (c.type) checks.type = Boolean(hit && hit.type === c.type);
  if (c.tone) checks.tone = Boolean(hit && hit.tone === c.tone);
  if (c.caveat) checks.caveat = Boolean(hit && hit.caveats.some(t => c.caveat.test(t)));
  if (c.notHigh) checks.notHigh = Boolean(hit && hit.confidence.level !== 'high');
  return { id: c.id, tags: c.tags, checks, pass: Object.values(checks).every(Boolean), found: hit?.signature || null, advisorCards: [...advice.actions, ...advice.reduce, ...advice.alerts, ...advice.obligations, ...advice.recurring].map(f => f.id), changed: r.changed.map(s => s.signature) };
});
const pass = results.filter(r => r.pass).length;
console.log(`Held-out V2.5: ${pass}/${results.length}`);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.id.padEnd(24)} ${Object.entries(r.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'GAGAL'}`).join(' ')} | ${r.found || '–'} | Advisor: ${r.advisorCards.join(', ') || '–'}`);
const file = new URL('./heldout-first.json', import.meta.url);
if (process.argv.includes('--freeze') && !existsSync(file)) { writeFileSync(file, `${JSON.stringify({ frozenAt: new Date().toISOString(), pass, total: results.length, results }, null, 1)}\n`); console.log('Hasil pertama dibekukan di heldout-first.json'); }
