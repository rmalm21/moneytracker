/**
 * 7.9 — the training document (Training_Chatbot_Dompet_Ajaib.pdf): the chat and Catat otomatis on what the document
 * asks for that 7.8 did not do. 7.8 (bench/v79/baseline-v78, from git: sh bench/v79/make-baseline.sh) vs now.
 *
 *   SET=dev node bench/v79/run.mjs [--fails]        the document's own examples (used while building)
 *   SET=heldout node bench/v79/run.mjs [--first]    other words, written before the engines changed (--first freezes the first run)
 *
 * A case is a conversation (one or more turns) or one Catat otomatis sentence (`catat`). A turn may check the meaning
 * (`intent`, `notIntent`), the answer said (`say`: patterns), that nothing is recorded (`record: false`), the cards made
 * (`plan`: number of entries and each entry's kind, amount, wallet, day, category, note, person, sharing, lines), the
 * sentence said with a card (`intro`), a question's answer (`answer`) and whether the waiting card is dropped (`dismiss`).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { chatCtx } from '../chat/state.mjs';

const SET = process.env.SET || 'dev';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const engines = {
  '7.8': { chat: await import('./baseline-v78/lib/chat/engine.ts'), model: await import('./baseline-v78/lib/chat/model.ts'), v3: await import('./baseline-v78/lib/catat/v3.ts'), inspect: (await import('./baseline-v78/lib/chat/inspect.ts')).inspect },
  'sekarang': { chat: await import('../../lib/chat/engine.ts'), model: await import('../../lib/chat/model.ts'), v3: await import('../../lib/catat/v3.ts'), inspect: (await import('../../lib/chat/inspect.ts')).inspect },
};
const q = chatCtx.quick, low = s => String(s ?? '').toLocaleLowerCase('id-ID').trim();
const parentOf = id => q.categories.find(c => c.id === id)?.parentId;
const catOk = (got, want) => [want].flat().some(w => w === null ? !got : got === w || parentOf(got) === w);
const RECORDLESS = new Set(['query', 'open']);

function allText(r) {
  if (r.kind !== 'say') return `${r.intro || ''} ${r.text}`;
  return [r.title, r.text, r.hero && `${r.hero.label} ${r.hero.value} ${r.hero.note || ''}`, ...(r.stats || []).map(s => `${s.label} ${s.value}`), ...(r.bars || []).map(b => `${b.label} ${b.value} ${b.note || ''}`), ...(r.steps || []), ...(r.lines || []).map(l => `${l.label} ${l.value}`), r.note].filter(Boolean).join(' · ');
}
function checkAct(a, e, errs, label) {
  if (!a) { errs.push(`${label}tidak ada`); return; }
  const r = a.result, p = r.preset, sp = r.split?.strong ? r.split : null;
  const got = {
    kind: r.kind, amount: r.amount || 0, wallet: p.walletId || '', to: p.destinationWalletId || '', date: r.date, cat: p.subcategoryId || p.categoryId || '',
    note: p.notes || '', person: low(r.person), split: Boolean(sp), share: sp ? sp.shares[sp.participants.find(x => x.isMe)?.id] ?? 0 : null,
    people: sp ? sp.participants.filter(x => !x.isMe).map(x => low(x.name)).sort().join('|') : '', lines: (p.splits || []).length,
  };
  for (const [k, v] of Object.entries(e)) {
    let ok;
    if (k === 'cat') ok = catOk(got.cat, v);
    else if (k === 'notCat') ok = !catOk(got.cat, v) || !got.cat;
    else if (k === 'note') ok = v.test(got.note);
    else if (k === 'people') ok = got.people === [...v].map(low).sort().join('|');
    else if (k === 'amount' || k === 'kind') ok = [v].flat().includes(got[k]);
    else ok = got[k] === v;
    if (!ok) errs.push(`${label}${k}: ${JSON.stringify(k === 'notCat' ? got.cat : got[k])} ≠ ${JSON.stringify(v instanceof RegExp ? String(v) : v)}`);
  }
}
async function checkPlan(text, spec, eng, errs) {
  const plan = await eng.v3.parseQuickPlanV3(text, q);
  const acts = plan.actions;
  if (spec.n !== undefined && acts.length !== spec.n) errs.push(`kartu ${acts.length} ≠ ${spec.n}`);
  // Your part (spent by you) and the money out of your wallet, however the cards show it (a shared bill, or your part
  // plus a receivable): "bagi rata berempat" = 1/4 is yours; "gue bayar 600rb buat berempat" = 600rb out, 150rb yours.
  const mine = acts.reduce((n, a) => n + (a.result.kind === 'expense' ? (a.result.split?.strong ? a.result.split.shares[a.result.split.participants.find(x => x.isMe)?.id] ?? 0 : a.result.amount) : 0), 0);
  const out = acts.reduce((n, a) => n + (a.result.kind === 'expense' ? (a.result.split?.strong && a.result.split.payerId && a.result.split.payerId !== 'me' && !a.result.split.participants.find(x => x.id === a.result.split.payerId)?.isMe ? 0 : a.result.amount) : a.result.kind === 'receivable_new' ? a.result.amount : 0), 0);
  if (spec.mine !== undefined && mine !== spec.mine) errs.push(`bagianmu ${mine} ≠ ${spec.mine}`);
  if (spec.out !== undefined && out !== spec.out) errs.push(`uang keluar ${out} ≠ ${spec.out}`);
  (spec.acts || []).forEach((e, i) => checkAct(acts[i], e, errs, `#${i + 1} `));
  return plan;
}

async function play(c, eng) {
  const errs = [], said = [];
  if (c.catat) { await checkPlan(c.text, c.plan, eng, errs); return { ok: !errs.length, errs, turns: 1, right: errs.length ? 0 : 1, said }; }
  const ctx = { ...chatCtx, inspect: text => eng.inspect(text, q), classify: eng.model.classifyChat, learned: {} };
  let memory = {}, right = 0, turns = 0;
  for (const t of c.turns) {
    if (t.text === '#save') { memory = { ...memory, plan: memory.plan ? { ...memory.plan, status: 'saved' } : memory.plan }; continue; }
    turns++;
    const before = errs.length;
    const r = await eng.chat.chatReply(t.text, memory, ctx);
    memory = r.memory;
    const reply = r.reply, text = allText(reply);
    said.push(`“${t.text}” → [${r.intent}] ${reply.kind === 'plan' ? `kartu “${reply.text}”${reply.intro ? ` (${reply.intro.slice(0, 70)})` : ''}` : text.slice(0, 110)}`);
    const L = `“${t.text}”: `;
    if (t.intent && ![t.intent].flat().includes(r.intent)) errs.push(`${L}arti ${r.intent} ≠ ${t.intent}`);
    if (t.notIntent && t.notIntent.includes(r.intent)) errs.push(`${L}arti ${r.intent} tidak boleh`);
    if (t.dismiss !== undefined && Boolean(r.dismiss) !== t.dismiss) errs.push(`${L}kartu ${r.dismiss ? 'dibuang' : 'tidak dibuang'}`);
    if (t.say) { if (reply.kind !== 'say') errs.push(`${L}harusnya jawaban, bukan kartu “${reply.text}”`); else for (const re of [t.say].flat()) if (!re.test(text)) errs.push(`${L}jawaban tidak memuat ${re}: “${text.slice(0, 120)}”`); }
    if (t.intro && !(reply.kind === 'plan' ? t.intro.test(reply.intro || '') : t.intro.test(text))) errs.push(`${L}kalimat tidak memuat ${t.intro}: “${(reply.kind === 'plan' ? reply.intro : text) || ''}”`);
    if (t.record === false && reply.kind === 'plan') {
      const plan = await eng.v3.parseQuickPlanV3(reply.text, q);
      const made = plan.actions.filter(a => !RECORDLESS.has(a.result.kind));
      if (made.length) errs.push(`${L}tidak boleh mencatat, tapi ada kartu ${made.map(a => `${a.result.kind} ${a.result.amount}`).join(', ')}`);
    }
    if (t.plan) { if (reply.kind !== 'plan') errs.push(`${L}harusnya kartu, bukan jawaban “${text.slice(0, 80)}”`); else { const e2 = []; await checkPlan(reply.text, t.plan, eng, e2); errs.push(...e2.map(e => `${L}${e}`)); } }
    if (t.answer) {
      if (reply.kind !== 'plan') { if (!t.answer.test(text)) errs.push(`${L}jawaban tidak memuat ${t.answer}`); }
      else { const plan = await eng.v3.parseQuickPlanV3(reply.text, q); const ans = plan.actions[0]?.result.operation?.query?.answer || ''; if (!t.answer.test(ans)) errs.push(`${L}jawaban Tanya tidak memuat ${t.answer}: “${ans}”`); }
    }
    if (errs.length === before) right++;
  }
  return { ok: !errs.length, errs, turns, right, said };
}

const results = {};
for (const [name, eng] of Object.entries(engines)) { results[name] = []; for (const c of cases) results[name].push({ c, ...(await play(c, eng)) }); }
const out = [], log = l => { out.push(l); console.log(l); };
const pct = (a, b) => b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–';
const groups = [...new Set(cases.map(c => c.group))];
const nTurns = rows => rows.reduce((n, r) => n + r.turns, 0), nRight = rows => rows.reduce((n, r) => n + r.right, 0);
log(`## 7.9 — dokumen training, ${SET} (${cases.length} kasus, ${nTurns(results['7.8'])} giliran)\n\n| | 7.8 | sekarang |\n|---|---|---|`);
log(`| Kasus benar seluruhnya | ${Object.values(results).map(rows => pct(rows.filter(r => r.ok).length, rows.length)).join(' | ')} |`);
log(`| Giliran benar | ${Object.values(results).map(rows => pct(nRight(rows), nTurns(rows))).join(' | ')} |`);
for (const g of groups) log(`| · ${g} | ${Object.values(results).map(rows => { const x = rows.filter(r => r.c.group === g); return pct(x.filter(r => r.ok).length, x.length); }).join(' | ')} |`);
const regress = results['sekarang'].filter((r, i) => !r.ok && results['7.8'][i].ok).map(r => r.c.id);
log(`\nRegresi vs 7.8: ${regress.length} (${regress.join(', ') || '–'})`);
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const r of results['sekarang'].filter(r => !r.ok)) console.log(`· ${r.c.id} [${r.c.group}]\n    ${r.errs.join('\n    ')}${process.argv.includes('--said') ? `\n    ${r.said.join('\n    ')}` : ''}`);
