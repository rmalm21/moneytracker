/**
 * Chat intents on the held-out set: the rules alone vs the rules with the trained model (lib/chat/model.ts).
 *   node bench/chat/run.mjs [--fails]
 */
import { chatReply } from '../../lib/chat/engine.ts';
import { classifyChat } from '../../lib/chat/model.ts';
import { chatCtx } from './state.mjs';
import { cases } from './fixtures-heldout.mjs';

const runs = {};
for (const [name, ctx] of [['aturan', chatCtx], ['aturan + model', { ...chatCtx, classify: classifyChat }]]) {
  const rows = [];
  for (const c of cases) { const r = await chatReply(c.text, {}, ctx); rows.push({ ...c, got: r.intent, by: r.by }); }
  runs[name] = rows;
}
const names = Object.keys(runs), n = cases.length;
console.log(`## Asisten chat — maksud pesan, set uji terpisah (${n} pesan)\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
console.log(`| Benar | ${names.map(k => { const ok = runs[k].filter(r => r.got === r.intent).length; return `${ok}/${n} (${Math.round(ok / n * 100)}%)`; }).join(' | ')} |`);
const groups = [...new Set(cases.map(c => c.intent))];
for (const g of groups) console.log(`| · ${g} | ${names.map(k => { const l = runs[k].filter(r => r.intent === g); return `${l.filter(r => r.got === g).length}/${l.length}`; }).join(' | ')} |`);
console.log(`\nDiputuskan model: ${runs[names[1]].filter(r => r.by === 'model').length} pesan; salah karena model: ${runs[names[1]].filter(r => r.by === 'model' && r.got !== r.intent).length}`);
if (process.argv.includes('--fails')) for (const k of names) for (const r of runs[k].filter(r => r.got !== r.intent)) console.log(`· [${k}] ${r.id} “${r.text}” → ${r.got} (harusnya ${r.intent})`);
