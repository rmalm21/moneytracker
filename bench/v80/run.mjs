/**
 * 8.0 — the chat's humour (swearing in each style, laughing, riddles both ways, the person's jokes, roasting) and its
 * link to every menu. 7.8 (bench/v79/baseline-v78) vs now.
 *   SET=heldout node bench/v80/run.mjs [--first] [--fails]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { fullCtx, borosCtx } from './state.mjs';
const SET = process.env.SET || 'heldout';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const engines = { '7.8': await import('../v79/baseline-v78/lib/chat/engine.ts'), sekarang: await import('../../lib/chat/engine.ts') };
const text = r => r.kind === 'say' ? [r.title, r.text, ...(r.lines || []).map(l => `${l.label} ${l.value}`), ...(r.bars || []).map(b => `${b.label} ${b.value}`), r.note].filter(Boolean).join(' · ') : `${r.intro || ''} ${r.text}`;
async function run(eng, c) {
  let memory = {}; const errs = [];
  const ctx = { ...(c.ctx === 'boros' ? borosCtx : fullCtx), voice: c.voice };
  for (const [i, turn] of c.turns.entries()) {
    const r = await eng.chatReply(turn.say, memory, ctx); memory = r.memory;
    const said = text(r.reply), at = `#${i + 1} `;
    if (turn.intent && r.intent !== turn.intent) errs.push(`${at}maksud ${r.intent} ≠ ${turn.intent}`);
    if (turn.notIntent && r.intent === turn.notIntent) errs.push(`${at}maksud tidak boleh ${turn.notIntent}`);
    if (turn.match && !turn.match.test(said)) errs.push(`${at}jawaban tanpa ${turn.match}: “${said.slice(0, 120)}”`);
    if (turn.notMatch && turn.notMatch.test(said)) errs.push(`${at}jawaban berisi ${turn.notMatch}: “${said.slice(0, 120)}”`);
    if (turn.open && r.reply.open?.view !== turn.open) errs.push(`${at}tombol ${r.reply.open?.view || '-'} ≠ ${turn.open}`);
    if (turn.record && !(r.reply.kind === 'plan' && ctx.inspect(r.reply.text).reading === 'record')) errs.push(`${at}tidak jadi kartu catatan`);
  }
  return errs;
}
const out = [], log = l => { out.push(l); console.log(l); };
const res = {};
for (const [k, eng] of Object.entries(engines)) { res[k] = []; for (const c of cases) res[k].push({ c, errs: await run(eng, c).catch(e => [`error: ${e.message}`]) }); }
const pct = (a, b) => `${a}/${b} (${Math.round(a / b * 100)}%)`;
const groups = { s: 'kata kasar', v: 'kata jorok', w: 'kasar + ada maksud', l: 'ketawa', r: 'tebak-tebakan & jokes orang', o: 'roasting', m: 'semua menu' };
log(`## Chat 8.0 — ${SET} (${cases.length} kasus)\n\n| | 7.8 | sekarang |\n|---|---|---|`);
log(`| Kasus benar | ${Object.values(res).map(x => pct(x.filter(y => !y.errs.length).length, x.length)).join(' | ')} |`);
for (const [g, name] of Object.entries(groups)) log(`| · ${name} | ${Object.values(res).map(x => { const h = x.filter(y => y.c.id.replace(/\d+$/, '') === g); return pct(h.filter(y => !y.errs.length).length, h.length); }).join(' | ')} |`);
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n' + res.sekarang.filter(y => y.errs.length).map(y => `· ${y.c.id}: ${y.errs.join('; ')}`).join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const y of res.sekarang.filter(y => y.errs.length)) console.log(`· ${y.c.id} (${y.c.voice}): ${y.errs.join('; ')}`);
