/**
 * 8.3 chat v3 — the big test. 8.2 (bench/v83/baseline-v82, from `sh bench/v83/make-baseline.sh`) vs now.
 *   SET=dev|heldout|hand node bench/v83/run.mjs [--first] [--fails] [--only=8.2|sekarang] [--fam=nabung]
 * --first writes FROZEN-<set>-first.md once (the held-out sets are run that way, a single time, at the end).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { v3Ctx } from './state.mjs';
import { build, familyTitles } from './cases.mjs';
const SET = process.env.SET || 'dev', arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const cases = (SET === 'hand' ? (await import('./fixtures-hand.mjs')).cases : build(SET)).filter(c => !arg('fam') || c.fam === arg('fam'));
const all = { '8.2': './baseline-v82/lib/chat/engine.ts', sekarang: '../../lib/chat/engine.ts' };
const engines = {}; for (const [k, path] of Object.entries(all)) if (!arg('only') || arg('only') === k) engines[k] = await import(path);
const { parseQuickPlan } = await import('../../lib/quick-plan.ts');
const text = r => r.kind === 'say' ? [r.title, r.text, r.hero && `${r.hero.label} ${r.hero.value} ${r.hero.note || ''}`, ...(r.stats || []).map(s => `${s.label} ${s.value}`), ...(r.steps || []), ...(r.lines || []).map(l => `${l.label} ${l.value}`), ...(r.bars || []).map(b => `${b.label} ${b.value} ${b.note || ''}`), r.note].filter(Boolean).join(' · ') : `${r.intro || ''} ${r.text}`;
async function run(eng, c) {
  let memory = {}, said = '', reply, intent;
  const ctx = { ...v3Ctx, voice: c.voice };
  for (const turn of c.turns) {
    const r = await eng.chatReply(turn.say, memory, ctx); memory = r.memory; reply = r.reply; intent = r.intent;
    said = text(reply);
    // A question handed to Catat otomatis: its answer is what the person reads.
    if (reply.kind === 'plan' && ctx.inspect(reply.text).reading === 'question') said += ' ' + (parseQuickPlan(reply.text, ctx.quick).actions[0]?.result.operation?.query?.answer || '');
  }
  const check = c.turns.at(-1).check, errs = [];
  const record = reply.kind === 'plan' && ctx.inspect(reply.text).reading === 'record';
  if (check.record && !record) errs.push(`bukan kartu catatan (${intent})`);
  if (check.notRecord && record) errs.push('malah jadi catatan');
  if (check.notUnknown && intent === 'unknown') errs.push('tidak paham');
  if (check.intent && intent !== check.intent) errs.push(`maksud ${intent} ≠ ${check.intent}`);
  if (check.any && !check.any.some(re => new RegExp(re, 'i').test(said))) errs.push(`tanpa ${check.any.join(' / ').slice(0, 90)}`);
  for (const re of check.all || []) if (!new RegExp(re, 'i').test(said)) errs.push(`tanpa ${re.slice(0, 60)}`);
  return errs.length ? `${errs.join('; ')} — “${said.replace(/\s+/g, ' ').slice(0, 150)}”` : '';
}
const out = [], log = l => { out.push(l); console.log(l); };
const res = {}, started = Date.now();
for (const [k, eng] of Object.entries(engines)) { res[k] = []; for (const c of cases) res[k].push({ c, err: await run(eng, c).catch(e => `error: ${e.message}`) }); }
const pct = (a, b) => b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–';
const names = Object.keys(res);
log(`## Chat v3 — ${SET} (${cases.length} kasus)\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
log(`| **Semua kasus** | ${names.map(k => pct(res[k].filter(y => !y.err).length, res[k].length)).join(' | ')} |`);
const fams = [...new Set(cases.map(c => c.fam))];
log(`| **Rata-rata per keluarga** | ${names.map(k => `${Math.round(fams.reduce((n, f) => { const h = res[k].filter(y => y.c.fam === f); return n + h.filter(y => !y.err).length / h.length; }, 0) / fams.length * 100)}%`).join(' | ')} |`);
for (const f of fams) log(`| · ${familyTitles[f] || f} | ${names.map(k => { const h = res[k].filter(y => y.c.fam === f); return pct(h.filter(y => !y.err).length, h.length); }).join(' | ')} |`);
console.log(`(${((Date.now() - started) / 1000).toFixed(0)} dtk)`);
const now = res.sekarang || res[names[0]];
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n\nYang gagal:\n' + now.filter(y => y.err).map(y => `· ${y.c.id} ${y.c.turns.map(t => t.say).join(' / ')}: ${y.err}`).join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const y of now.filter(y => y.err)) console.log(`· ${y.c.id} (${y.c.voice}) ${y.c.turns.map(t => t.say).join(' / ')}: ${y.err}`);
