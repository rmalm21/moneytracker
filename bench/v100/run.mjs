/**
 * 10.0 Asisten chat 3.0 — 9.10 (bench/v100/baseline-v910, from `sh bench/v100/make-baseline.sh`) vs now.
 *   SET=dev|heldout|gaul-dev|gaul-heldout node bench/v100/run.mjs [--first] [--fails] [--only=9.10|sekarang] [--fam=komentar]
 * --first writes FROZEN-<set>-first.md once (the held-out set is run that way, a single time, at the end).
 *
 * A `save` turn stands for the person tapping Simpan on the card just shown. 3.0 then says a comment
 * (`commentOnSaved` in lib/chat/engine.ts). 9.10 has no such step: the only remark it makes about a record is the tease
 * at the start of the card itself ("Ke-10 kalinya Jajan…"), so that is what is checked for 9.10.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { v3Ctx } from '../v83/state.mjs';
const SET = process.env.SET || 'dev', arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const FILES = { dev: './cases-dev.mjs', heldout: './cases-heldout.mjs', 'gaul-dev': './cases-gaul-dev.mjs', 'gaul-heldout': './cases-gaul-heldout.mjs' };
const cases = (await import(FILES[SET] || FILES.dev)).cases.filter(c => !arg('fam') || c.fam === arg('fam'));
const all = { '9.10': './baseline-v910/lib/chat/engine.ts', sekarang: '../../lib/chat/engine.ts' };
const engines = {}; for (const [k, path] of Object.entries(all)) if (!arg('only') || arg('only') === k) engines[k] = await import(path);
const { parseQuickPlan } = await import('../../lib/quick-plan.ts');
const shown = r => !r ? '' : r.kind === 'say'
  ? [r.title, r.text, r.hero && `${r.hero.label} ${r.hero.value} ${r.hero.note || ''}`, ...(r.stats || []).map(s => `${s.label} ${s.value}`), ...(r.steps || []), ...(r.lines || []).map(l => `${l.label} ${l.value}`), ...(r.bars || []).map(b => `${b.label} ${b.value} ${b.note || ''}`), r.note].filter(Boolean).join(' ')
  : [r.intro, `«${r.text}»`].filter(Boolean).join(' ');
const TEASE = /ke-\d+ kalinya|kalinya|lagi\?|setia banget|wkwk/i;
const re = x => x instanceof RegExp ? x : new RegExp(x, 'i');

async function run(eng, c) {
  let memory = {}, reply = null, intent = '', said = '', comment;
  const ctx = { ...v3Ctx, voice: c.voice };
  for (const turn of c.turns) {
    comment = undefined;
    if (turn.save) {
      // The card shown last is saved: the chat marks it saved, then (3.0) comments on it.
      if (!reply || reply.kind !== 'plan') return `tidak ada kartu untuk disimpan (${intent})`;
      const planText = reply.text, intro = reply.intro || '';
      memory = { ...memory, plan: { text: planText, status: 'saved' } };
      if (eng.commentOnSaved) {
        const r = eng.commentOnSaved(planText, memory, ctx, { comments: !turn.off });
        reply = r ? r.reply : null; if (r) memory = r.memory;
        comment = !r ? 'none' : r.reply.tone === 'good' ? 'good' : r.reply.tone === 'warn' ? 'warn' : 'info';
      } else {
        const tease = !turn.off && TEASE.test(intro) ? intro.split(/(?<=[.!?])\s+/).filter(s => TEASE.test(s)).join(' ') : '';
        reply = tease ? { kind: 'say', text: tease } : null; comment = tease ? 'warn' : 'none';
      }
      intent = 'comment'; said = shown(reply);
      continue;
    }
    const r = await eng.chatReply(turn.say, memory, ctx); memory = r.memory; reply = r.reply; intent = r.intent;
    said = shown(reply);
    // A question handed to Catat otomatis: its answer is what the person reads.
    if (reply.kind === 'plan' && ctx.inspect(reply.text).reading === 'question') said += ' ' + (parseQuickPlan(reply.text, ctx.quick).actions[0]?.result.operation?.query?.answer || '');
  }
  const check = c.turns.at(-1).check, errs = [];
  const ins = reply?.kind === 'plan' ? ctx.inspect(reply.text) : null, record = ins?.reading === 'record';
  if (check.record) {
    const want = check.record;
    if (!record) errs.push(`bukan kartu catatan (${intent})`);
    else {
      if (want.kind && ins.kind !== want.kind) errs.push(`jenis ${ins.kind} ≠ ${want.kind}`);
      if (want.total && ins.total !== want.total) errs.push(`nominal ${ins.total} ≠ ${want.total}`);
      for (const w of want.has || []) if (!reply.text.toLowerCase().includes(w)) errs.push(`kalimat tanpa “${w}”`);
    }
  }
  if (check.notRecord && record && ins.kind !== 'tx_delete') errs.push('malah jadi catatan');
  if (check.notUnknown && intent === 'unknown') errs.push('tidak paham');
  if (check.comment && comment !== check.comment && !(check.comment === 'good' && comment === 'good')) errs.push(`komentar ${comment ?? '-'} ≠ ${check.comment}`);
  if (check.any && !check.any.some(x => re(x).test(said))) errs.push(`tanpa ${check.any.map(String).join(' / ').slice(0, 90)}`);
  for (const x of check.all || []) if (!re(x).test(said)) errs.push(`tanpa ${String(x).slice(0, 60)}`);
  for (const x of check.none || []) if (re(x).test(said)) errs.push(`ada ${String(x).slice(0, 60)}`);
  if (check.ask && !/\?/.test(reply?.kind === 'say' ? [reply.title, reply.text].join(' ') : reply?.intro || '')) errs.push('tidak bertanya balik');
  const chips = reply?.chips || [];
  if (check.chips && chips.length < check.chips) errs.push(`pilihan ${chips.length} < ${check.chips}`);
  if (check.chipsAny && !check.chipsAny.some(x => chips.some(ch => re(x).test(ch)))) errs.push(`pilihan tanpa ${check.chipsAny.map(String).join(' / ')}`);
  if (check.open && reply?.open?.view !== check.open) errs.push(`tombol ${reply?.open?.view || '-'} ≠ ${check.open}`);
  if (check.maxLen && said.length > check.maxLen) errs.push(`terlalu panjang (${said.length})`);
  return errs.length ? `${errs.join('; ')} — ${reply?.kind === 'plan' ? `«${reply.text}» ${reply.intro || ''}` : `“${said.replace(/\s+/g, ' ').slice(0, 170)}”`}${chips.length ? ` [${chips.join(' | ').slice(0, 80)}]` : ''}` : '';
}

const FAM = { paham: '1 · Ngerti banyak teks', tujuan: '2 · Ngerti tujuan', komentar: '3 · Apresiasi & omelan', interaktif: '4 · Interaktif', konteks: '5 · Konteks berkesinambungan', saran: '6 · Saran nyata & fitur' };
const out = [], log = l => { out.push(l); console.log(l); };
const res = {}, started = Date.now();
for (const [k, eng] of Object.entries(engines)) { res[k] = []; for (const c of cases) res[k].push({ c, err: await run(eng, c).catch(e => `error: ${e.message}`) }); }
const pct = (a, b) => b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–';
const names = Object.keys(res);
log(`## Asisten chat 3.0 — ${SET} (${cases.length} kasus)\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
log(`| **Semua kasus** | ${names.map(k => pct(res[k].filter(y => !y.err).length, res[k].length)).join(' | ')} |`);
for (const f of Object.keys(FAM).filter(f => cases.some(c => c.fam === f))) log(`| · ${FAM[f]} | ${names.map(k => { const h = res[k].filter(y => y.c.fam === f); return pct(h.filter(y => !y.err).length, h.length); }).join(' | ')} |`);
console.log(`(${((Date.now() - started) / 1000).toFixed(0)} dtk)`);
const now = res.sekarang || res[names[0]];
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n\nYang gagal (percobaan pertama):\n' + now.filter(y => y.err).map(y => `- ${y.c.id} (${y.c.voice}) ${y.c.turns.map(t => t.say ?? (t.off ? '[simpan, komentar mati]' : '[simpan]')).join(' / ')}: ${y.err}`).join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const y of now.filter(y => y.err)) console.log(`· ${y.c.id} (${y.c.voice}) ${y.c.turns.map(t => t.say ?? '[simpan]').join(' / ')}: ${y.err}`);
