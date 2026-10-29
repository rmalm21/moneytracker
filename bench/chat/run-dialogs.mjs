/**
 * Chatbot v2 conversations: every turn read with what came before (memory and learned phrases, as the app keeps them).
 * 7.7 (frozen in bench/chat/baseline-v77, rules + its model) vs now (rules + model).
 *   DIALOGS=dev|heldout node bench/chat/run-dialogs.mjs [--fails] [--first]
 * A turn is right when its meaning is right and its check (if any) holds; a conversation is right when every turn is.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { chatReply } from '../../lib/chat/engine.ts';
import { classifyChat } from '../../lib/chat/model.ts';
import * as old from './baseline-v77/engine.ts';
import * as oldModel from './baseline-v77/model.ts';
import { chatCtx } from './state.mjs';
const NAME = process.env.DIALOGS || 'dev';
const { dialogs } = await import(`./dialogs-${NAME}.mjs`);

async function play(reply, classify) {
  const rows = [];
  for (const d of dialogs) {
    let memory = {}, learned = {}, previous = '';
    const turns = [];
    for (const t of d.turns) {
      if (t.text === '#save') { memory = { ...memory, plan: memory.plan ? { ...memory.plan, status: 'saved' } : memory.plan }; continue; }
      const r = await reply(t.text, memory, { ...chatCtx, classify, learned });
      const text = r.reply.kind === 'say' ? r.reply.text : `${r.reply.intro || ''}|${r.reply.text}`;
      let ok = r.intent === t.intent;
      if (ok && t.check === 'differs') ok = text !== previous;
      if (ok && t.check === 'teach') ok = (r.reply.chips || []).some(c => /^ajari/i.test(c));
      turns.push({ text: t.text, want: t.intent, got: r.intent, ok, check: t.check, said: text.slice(0, 90) });
      memory = r.memory; previous = text;
      if (r.learn) learned = { ...learned, [r.learn.phrase]: r.learn.as };
    }
    rows.push({ id: d.id, ok: turns.every(x => x.ok), turns });
  }
  return rows;
}
const runs = { '7.7': await play(old.chatReply, oldModel.classifyChat), 'sekarang': await play(chatReply, classifyChat) };
const out = [], log = l => { out.push(l); console.log(l); };
const nT = dialogs.reduce((n, d) => n + d.turns.filter(t => t.text !== '#save').length, 0);
log(`## Asisten chat — percakapan berlanjut, ${NAME} (${dialogs.length} percakapan, ${nT} giliran)\n\n| | 7.7 | sekarang |\n|---|---|---|`);
const pct = (a, b) => `${a}/${b} (${Math.round(a / b * 100)}%)`;
log(`| Percakapan benar seluruhnya | ${Object.values(runs).map(r => pct(r.filter(x => x.ok).length, r.length)).join(' | ')} |`);
log(`| Giliran benar | ${Object.values(runs).map(r => pct(r.flatMap(x => x.turns).filter(t => t.ok).length, nT)).join(' | ')} |`);
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-dialogs-${NAME}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const [k, rows] of Object.entries(runs)) for (const d of rows.filter(x => !x.ok)) console.log(`· [${k}] ${d.id}: ${d.turns.map(t => `${t.ok ? '✓' : '✗'} “${t.text}” → ${t.got}${t.ok ? '' : ` (harusnya ${t.want}${t.check ? `, ${t.check}` : ''})`}`).join(' / ')}`);
