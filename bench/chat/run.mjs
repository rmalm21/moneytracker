/**
 * Chat intents on a held-out set: 7.6 (frozen in bench/chat/baseline-v76, rules + its model) vs now (rules alone, and
 * rules with the trained model).
 *   SET=heldout|heldout2 node bench/chat/run.mjs [--fails] [--first]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { chatReply } from '../../lib/chat/engine.ts';
import { classifyChat } from '../../lib/chat/model.ts';
import * as old from './baseline-v76/engine.ts';
import * as oldModel from './baseline-v76/model.ts';
import { chatCtx } from './state.mjs';
const SET = process.env.SET || 'heldout';
const { cases } = await import(`./fixtures-${SET}.mjs`);

const runs = {};
for (const [name, reply, ctx] of [['7.6', old.chatReply, { ...chatCtx, classify: oldModel.classifyChat }], ['aturan', chatReply, chatCtx], ['aturan + model', chatReply, { ...chatCtx, classify: classifyChat }]]) {
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
