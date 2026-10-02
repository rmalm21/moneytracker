/**
 * How much the second engine (NLP.js) adds, over every V3 benchmark set: consensus outcomes per role, sentences the
 * grammar got wrong that V3 got right (rescued by NLP.js), sentences V3 broke (regressions), and both failing.
 *   node bench/quick/nlp-value.mjs   (run run-v30.mjs grammar and v3 on the sets first)
 */
import { readFileSync, existsSync } from 'node:fs';
import { parseQuickPlanV3 } from '../../lib/catat/v3.ts';
const sets = ['', 'v25', 'holdout25', 'v30dev', 'v30heldout'];
const roles = {}, totals = { rescued: [], regressions: [], bothFail: [], agreeIntent: 0, intentSeen: 0 };
for (const set of sets) {
  const { cases, ctx } = await import(set ? `./fixtures-${set}.mjs` : './fixtures.mjs');
  for (const c of cases) {
    const plan = await parseQuickPlanV3(c.text, { ...ctx, ...(c.ctx || {}) });
    for (const a of plan.actions) for (const n of a.consensus || []) { const r = (roles[n.role] ||= {}); r[n.outcome] = (r[n.outcome] || 0) + 1; if (n.role === 'intent') { totals.intentSeen++; if (n.outcome === 'agree') totals.agreeIntent++; } }
  }
  const file = l => `bench/quick/out/v30-${set || 'orig'}-${l}.json`;
  if (existsSync(file('grammar')) && existsSync(file('v3'))) {
    const g = JSON.parse(readFileSync(file('grammar'), 'utf8')), v = JSON.parse(readFileSync(file('v3'), 'utf8'));
    for (const r of v.rows) { const o = g.rows.find(x => x.id === r.id); if (r.exact && !o.exact) totals.rescued.push(`${set || 'orig'}:${r.id}`); if (!r.exact && o.exact) totals.regressions.push(`${set || 'orig'}:${r.id}`); if (!r.exact && !o.exact) totals.bothFail.push(`${set || 'orig'}:${r.id}`); }
  }
}
console.log(JSON.stringify({ roles, ...totals, intentAgreement: `${totals.agreeIntent}/${totals.intentSeen}` }, null, 1));
