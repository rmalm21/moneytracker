/**
 * 10.4 The trained chat intent model alone (no rules), on the `maksud` family of bench/v104/gen.mjs: 10.3.3's model
 * (bench/v104/baseline-v1033) vs now. A guess counts when its intent is the case's `label` with score ≥ 0.6, the score
 * the chat needs before it acts on the model (lib/chat/engine.ts).
 *   SET=dev|heldout node bench/v104/run-model.mjs [--fails]
 */
import { build } from './gen.mjs';
const SET = process.env.SET || 'dev';
const cases = build(SET === 'heldout' ? 'heldout' : 'dev').filter(c => c.fam === 'maksud');
const models = { '10.3.3': (await import('./baseline-v1033/lib/chat/model.ts')).classifyChat, sekarang: (await import('../../lib/chat/model.ts')).classifyChat };
const res = {};
for (const [k, classify] of Object.entries(models)) {
  res[k] = [];
  for (const c of cases) { const say = c.turns[0].say, g = await classify(say); res[k].push({ c, say, g, ok: !!g && g.score >= 0.6 && g.intent === c.label }); }
}
const pct = (n, d) => `${n}/${d} (${Math.round(100 * n / d)}%)`;
console.log(`## Model chat saja — ${SET} (${cases.length} kalimat, yakin ≥ 0,6)\n\n| | ${Object.keys(res).join(' | ')} |\n|---|${Object.keys(res).map(() => '---|').join('')}`);
console.log(`| **Benar** | ${Object.values(res).map(r => pct(r.filter(x => x.ok).length, r.length)).join(' | ')} |`);
console.log(`| Ragu (< 0,6) | ${Object.values(res).map(r => r.filter(x => !x.g || x.g.score < 0.6).length).join(' | ')} |`);
console.log(`| Yakin tapi salah | ${Object.values(res).map(r => r.filter(x => x.g && x.g.score >= 0.6 && x.g.intent !== x.c.label).length).join(' | ')} |`);
const labels = [...new Set(cases.map(c => c.label))];
for (const l of labels) console.log(`| · ${l} | ${Object.values(res).map(r => { const s = r.filter(x => x.c.label === l); return `${s.filter(x => x.ok).length}/${s.length}`; }).join(' | ')} |`);
if (process.argv.includes('--fails')) for (const [k, r] of Object.entries(res)) { console.log(`\n### Salah — ${k}`); for (const x of r.filter(x => !x.ok)) console.log(`- “${x.say}” (${x.c.label}): ${x.g ? `${x.g.intent} ${x.g.score.toFixed(2)}` : '-'}`); }
