/**
 * Chat intents on a held-out set: the frozen previous release (bench/chat/baseline-v76 or baseline-v77, rules + its
 * model) vs now (rules alone, and rules with the trained model).
 *   SET=heldout|heldout2|heldout3 [BASE=v76|v77] node bench/chat/run.mjs [--fails] [--first]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { chatReply } from '../../lib/chat/engine.ts';
import { classifyChat } from '../../lib/chat/model.ts';
import { chatCtx } from './state.mjs';
const SET = process.env.SET || 'heldout', BASE = process.env.BASE || (SET === 'heldout3' ? 'v77' : 'v76');
const old = await import(`./baseline-${BASE}/engine.ts`), oldModel = await import(`./baseline-${BASE}/model.ts`);
const label = BASE.replace(/^v(\d)(\d)$/, '$1.$2');
const { cases } = await import(`./fixtures-${SET}.mjs`);

const runs = {};
for (const [name, reply, ctx] of [[label, old.chatReply, { ...chatCtx, classify: oldModel.classifyChat }], ['aturan', chatReply, chatCtx], ['aturan + model', chatReply, { ...chatCtx, classify: classifyChat }]]) {
  const rows = [];
  for (const c of cases) { const r = await reply(c.text, {}, ctx); rows.push({ ...c, got: r.intent, by: r.by }); }
  runs[name] = rows;
}
const names = Object.keys(runs), n = cases.length;
const out = [];
const log = l => { out.push(l); console.log(l); };
log(`## Asisten chat — maksud pesan, ${SET} (${n} pesan)\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
log(`| Benar | ${names.map(k => { const ok = runs[k].filter(r => r.got === r.intent).length; return `${ok}/${n} (${Math.round(ok / n * 100)}%)`; }).join(' | ')} |`);
const groups = [...new Set(cases.map(c => c.intent))];
for (const g of groups) log(`| · ${g} | ${names.map(k => { const l = runs[k].filter(r => r.intent === g); return `${l.filter(r => r.got === g).length}/${l.length}`; }).join(' | ')} |`);
const now = runs[names[2]];
log(`\nDiputuskan model: ${now.filter(r => r.by === 'model').length} pesan; salah karena model: ${now.filter(r => r.by === 'model' && r.got !== r.intent).length}`);
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const k of names) for (const r of runs[k].filter(r => r.got !== r.intent)) console.log(`· [${k}] ${r.id} “${r.text}” → ${r.got} (harusnya ${r.intent})`);
