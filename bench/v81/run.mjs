/**
 * 8.1 — the bigger library of language and the new functions. 8.0 (bench/v81/baseline-v80) vs now.
 *   sh bench/v81/make-baseline.sh   (once)
 *   SET=heldout node bench/v81/run.mjs [--first] [--fails]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { fullCtx, borosCtx, statsCtx } from './state.mjs';
const SET = process.env.SET || 'heldout';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const engines = { '8.0': await import('./baseline-v80/lib/chat/engine.ts'), sekarang: await import('../../lib/chat/engine.ts') };
const text = r => r.kind === 'say' ? [r.title, r.text, r.hero && `${r.hero.label} ${r.hero.value}`, ...(r.stats || []).map(s => `${s.label} ${s.value}`), ...(r.steps || []), ...(r.lines || []).map(l => `${l.label} ${l.value}`), ...(r.bars || []).map(b => `${b.label} ${b.value}`), r.note].filter(Boolean).join(' · ') : `${r.intro || ''} ${r.text}`;
async function run(eng, c) {
  let memory = {}; const errs = [];
  const ctx = { ...(c.ctx === 'boros' ? borosCtx : c.ctx === 'stats' ? statsCtx : fullCtx), voice: c.voice };
  for (const [i, turn] of c.turns.entries()) {
    const r = await eng.chatReply(turn.say, memory, ctx); memory = r.memory;
    let said = text(r.reply);
    // A question handed to Catat otomatis: its answer is what the person reads.
    if (r.reply.kind === 'plan' && ctx.inspect(r.reply.text).reading === 'question') { const { parseQuickPlan } = await import('../../lib/quick-plan.ts'); said += ' ' + (parseQuickPlan(r.reply.text, ctx.quick).actions[0]?.result.operation?.query?.answer || ''); }
    const at = `#${i + 1} `;
    if (turn.intent && r.intent !== turn.intent) errs.push(`${at}maksud ${r.intent} ≠ ${turn.intent}`);
    if (turn.notIntent && r.intent === turn.notIntent) errs.push(`${at}maksud tidak boleh ${turn.notIntent}`);
    if (turn.match && !turn.match.test(said)) errs.push(`${at}jawaban tanpa ${turn.match}: “${said.slice(0, 140)}”`);
    if (turn.notMatch && turn.notMatch.test(said)) errs.push(`${at}jawaban berisi ${turn.notMatch}: “${said.slice(0, 140)}”`);
    if (turn.open && r.reply.open?.view !== turn.open) errs.push(`${at}tombol ${r.reply.open?.view || '-'} ≠ ${turn.open}`);
    if (turn.record && !(r.reply.kind === 'plan' && ctx.inspect(r.reply.text).reading === 'record')) errs.push(`${at}tidak jadi kartu catatan`);
    if (turn.recordText && !(r.reply.kind === 'plan' && turn.recordText.test(r.reply.text))) errs.push(`${at}kalimat ke Catat “${r.reply.text}” tanpa ${turn.recordText}`);
    if (turn.setVoice && r.setVoice !== turn.setVoice) errs.push(`${at}gaya ${r.setVoice || '-'} ≠ ${turn.setVoice}`);
  }
  return errs;
}
const out = [], log = l => { out.push(l); console.log(l); };
const res = {};
for (const [k, eng] of Object.entries(engines)) { res[k] = []; for (const c of cases) res[k].push({ c, errs: await run(eng, c).catch(e => [`error: ${e.message}`]) }); }
const pct = (a, b) => `${a}/${b} (${Math.round(a / b * 100)}%)`;
const groups = { k: 'kata kasar (semua cara tulis)', j: 'kata jorok', x: 'nama hewan sungguhan', b: 'obrolan baik', s: 'seru: motivasi, fakta, permainan', q: 'pertanyaan data baru', f: 'cara pakai fitur', v: 'gaya Bar-bar', w: 'ketawa sambil mencatat' };
log(`## Chat 8.1 — ${SET} (${cases.length} kasus)\n\n| | 8.0 | sekarang |\n|---|---|---|`);
log(`| Kasus benar | ${Object.values(res).map(x => pct(x.filter(y => !y.errs.length).length, x.length)).join(' | ')} |`);
for (const [g, name] of Object.entries(groups)) log(`| · ${name} | ${Object.values(res).map(x => { const h = x.filter(y => y.c.id.replace(/\d+$/, '') === g); return pct(h.filter(y => !y.errs.length).length, h.length); }).join(' | ')} |`);
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n\n' + res.sekarang.filter(y => y.errs.length).map(y => `· ${y.c.id}: ${y.errs.join('; ')}`).join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const y of res.sekarang.filter(y => y.errs.length)) console.log(`· ${y.c.id} (${y.c.voice}): ${y.errs.join('; ')}`);
