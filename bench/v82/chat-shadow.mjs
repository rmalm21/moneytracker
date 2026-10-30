/**
 * 8.2 chat shadow: every sentence the older benches have (Catat otomatis sets, chat sets, dialog turns, the 7.9 and 8.0
 * sets), each sent alone to the chat of 8.0 (bench/v81/baseline-v80) and of now. Lists every sentence whose meaning
 * (intent) or record changed, so a new piece of 8.1 that catches an ordinary sentence shows up.
 *   node bench/v82/chat-shadow.mjs [--all]
 */
import { readdirSync } from 'node:fs';
import { chatCtx } from '../chat/state.mjs';
const before = await import('../v81/baseline-v80/lib/chat/engine.ts'), after = await import('../../lib/chat/engine.ts');
const texts = new Map();
const add = (t, from) => { if (typeof t === 'string' && t.trim() && !texts.has(t)) texts.set(t, from); };
const quick = new URL('../quick/', import.meta.url);
for (const f of readdirSync(quick).filter(f => /^fixtures-.*\.mjs$/.test(f) && !/state/.test(f))) { const m = await import(new URL(f, quick).href); for (const c of m.cases || m.default || []) add(c.text || c.input, `quick/${f}`); }
for (const f of ['fixtures-heldout', 'fixtures-heldout2', 'fixtures-heldout3']) { const m = await import(`../chat/${f}.mjs`); for (const c of m.cases) add(c.text, `chat/${f}`); }
for (const f of ['dialogs-dev', 'dialogs-heldout']) { const m = await import(`../chat/${f}.mjs`); for (const d of m.dialogs || m.cases || []) for (const turn of d.turns || []) add(turn.text || turn.say || turn[0], `chat/${f}`); }
for (const f of ['fixtures-dev', 'fixtures-heldout']) { const m = await import(`../v79/${f}.mjs`); for (const c of m.cases) { if (c.catat) add(c.catat, `v79/${f}`); for (const turn of c.turns || []) add(turn.say || turn.text, `v79/${f}`); } }
const view = r => `${r.intent}|${r.reply.kind === 'plan' ? `plan:${r.reply.text}` : 'say'}`;
const NEW = new Set(['swear', 'fun', 'game', 'howto']);
let changed = 0; const rows = [];
for (const [t, from] of texts) {
  const a = await before.chatReply(t, {}, chatCtx).catch(e => ({ intent: 'error', reply: { kind: 'say', text: e.message } }));
  const b = await after.chatReply(t, {}, chatCtx).catch(e => ({ intent: 'error', reply: { kind: 'say', text: e.message } }));
  if (view(a) === view(b)) continue;
  changed++; rows.push({ t, from, a: view(a), b: view(b), text: b.reply.kind === 'say' ? b.reply.text.slice(0, 90) : b.reply.intro?.slice(0, 90) || '' });
}
console.log(`Chat shadow 8.0 → sekarang: ${texts.size} kalimat · berubah ${changed}`);
const order = r => NEW.has(r.b.split('|')[0]) ? 0 : 1;
for (const r of rows.sort((x, y) => order(x) - order(y))) console.log(`· [${r.from}] “${r.t}”\n    8.0: ${r.a}\n    now: ${r.b}  — ${r.text}`);
