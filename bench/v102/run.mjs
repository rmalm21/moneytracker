/**
 * 10.2 Asisten chat 3.5 — 10.1 (bench/v102/baseline-v101, from `sh bench/v102/make-baseline.sh`) vs now.
 *   SET=dev|heldout node bench/v102/run.mjs [--first] [--fails] [--only=10.1|sekarang] [--fam=susulan] [--id=s3] [--rules]
 * --first writes FROZEN-<set>-first.md once (the held-out set is run that way, a single time, at the end).
 *
 * Every case runs on both accounts of bench/v102/state.mjs (template-key ids and the app's own ids) and counts only
 * when it passes on both. A `save` turn is the person tapping Simpan on the card just shown: its records go into the
 * ledger (saveInto), the chat marks it saved, and 10.1+ say their remark after it as the app does.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { accounts, saveInto, categoryNames } from './state.mjs';
const SET = process.env.SET || 'dev', arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
// As in the app, each version's own trained model reads what its rules do not catch (--rules: the rules alone).
const RULES = process.argv.includes('--rules');
const FILES = { dev: './cases-dev.mjs', heldout: './cases-heldout.mjs' };
const cases = (await import(FILES[SET] || FILES.dev)).cases.filter(c => (!arg('fam') || c.fam === arg('fam')) && (!arg('id') || c.id === arg('id')));
const all = { '10.1': './baseline-v101/lib', sekarang: '../../lib' };
const engines = {};
for (const [k, dir] of Object.entries(all)) if (!arg('only') || arg('only') === k) engines[k] = { classify: RULES ? undefined : (await import(`${dir}/chat/model.ts`)).classifyChat, chat: await import(`${dir}/chat/engine.ts`), inspect: (await import(`${dir}/chat/inspect.ts`)).inspect, parse: (await import(`${dir}/quick-plan.ts`)).parseQuickPlan };
const shown = r => !r ? '' : r.kind === 'say'
  ? [r.title, r.text, r.hero && `${r.hero.label} ${r.hero.value} ${r.hero.note || ''}`, ...(r.stats || []).map(s => `${s.label} ${s.value}`), ...(r.steps || []), ...(r.lines || []).map(l => `${l.label} ${l.value}`), ...(r.bars || []).map(b => `${b.label} ${b.value}`), r.daily].filter(Boolean).join(' ')
  : [r.intro, `«${r.text}»`].filter(Boolean).join(' ');
const re = x => x instanceof RegExp ? x : new RegExp(x, 'i');
const low = s => String(s || '').toLowerCase();

function judge(eng, acc, check, reply, intent, said, savedIds) {
  const lastSaved = savedIds.at(-1), want1 = t => t === 'saved1' ? savedIds[0] : lastSaved;
  const errs = [], plan = reply?.kind === 'plan' ? eng.parse(reply.text, acc.quick) : null, a = plan?.actions[0], r = a?.result;
  const ins = reply?.kind === 'plan' ? eng.inspect(reply.text, acc.quick) : null, record = ins?.reading === 'record';
  const walletName = id => acc.data.wallets.find(w => w.id === id)?.name || '';
  if (check.rec) {
    const want = check.rec;
    if (!record || ['tx_update', 'tx_delete'].includes(ins.kind)) errs.push(`bukan kartu catatan baru (${intent}${ins ? ` ${ins.reading}/${ins.kind}` : ''})`);
    else {
      if (want.kind && ins.kind !== want.kind) errs.push(`jenis ${ins.kind} ≠ ${want.kind}`);
      if (want.total && ins.total !== want.total) errs.push(`nominal ${ins.total} ≠ ${want.total}`);
      if (want.cat) { const names = categoryNames(acc, r?.preset?.categoryId, r?.preset?.subcategoryId).map(low); if (!names.includes(low(want.cat))) errs.push(`kategori ${names.join('/') || '-'} ≠ ${want.cat}`); }
      if (want.noCat && (r?.preset?.categoryId)) errs.push(`berkategori ${categoryNames(acc, r.preset.categoryId, r.preset.subcategoryId).join('/')}`);
      if (want.wallet && low(walletName(r?.preset?.walletId)) !== low(want.wallet)) errs.push(`dompet ${walletName(r?.preset?.walletId) || '-'} ≠ ${want.wallet}`);
      if (want.to && low(walletName(r?.preset?.destinationWalletId)) !== low(want.to)) errs.push(`tujuan ${walletName(r?.preset?.destinationWalletId) || '-'} ≠ ${want.to}`);
      if (want.date && (r?.preset?.date || acc.today) !== want.date) errs.push(`tanggal ${r?.preset?.date || acc.today} ≠ ${want.date}`);
      if (want.count && plan.actions.length !== want.count) errs.push(`${plan.actions.length} catatan ≠ ${want.count}`);
      for (const w of want.has || []) if (!low(reply.text).includes(low(w))) errs.push(`kalimat tanpa “${w}”`);
    }
  }
  if (check.upd) {
    const want = check.upd, changes = r?.operation?.changes || [];
    if (r?.kind !== 'tx_update') errs.push(`bukan kartu ubah transaksi (${intent}${ins ? ` ${ins.reading}/${ins.kind}` : ''})`);
    else {
      if (want.target && r.operation?.target?.id !== want1(want.target)) errs.push(`yang diubah ${r.operation?.target?.label || '-'} bukan catatan barusan`);
      if (want.cat) { const c = changes.find(x => x.field === 'category' || x.field === 'type'); const names = c ? categoryNames(acc, c.categoryId, c.subcategoryId).map(low) : []; if (!names.includes(low(want.cat))) errs.push(`kategori baru ${names.join('/') || '-'} ≠ ${want.cat}`); }
      if (want.type && !changes.some(x => x.field === 'type' && x.after === want.type)) errs.push(`jenis tidak jadi ${want.type}`);
      if (want.total && !changes.some(x => x.field === 'amount' && Number(x.after) === want.total)) errs.push(`nominal tidak jadi ${want.total}`);
      if (want.wallet && !changes.some(x => x.field === 'walletId' && low(walletName(x.after)) === low(want.wallet))) errs.push(`dompet tidak jadi ${want.wallet}`);
      if (want.date && !changes.some(x => x.field === 'date' && x.after === want.date)) errs.push(`tanggal tidak jadi ${want.date}`);
    }
  }
  if (check.del) {
    if (r?.kind !== 'tx_delete') errs.push(`bukan kartu hapus (${intent})`);
    else if (typeof check.del === 'string' && r.operation?.target?.id !== want1(check.del)) errs.push(`yang dihapus ${r.operation?.target?.label || '-'} bukan catatan barusan`);
  }
  if (check.notRecord && record && !['tx_delete'].includes(ins.kind)) errs.push(`malah jadi kartu ${ins.kind}`);
  if (check.notUnknown && intent === 'unknown') errs.push('tidak paham');
  if (check.any && !check.any.some(x => re(x).test(said))) errs.push(`tanpa ${check.any.map(String).join(' / ').slice(0, 90)}`);
  for (const x of check.all || []) if (!re(x).test(said)) errs.push(`tanpa ${String(x).slice(0, 60)}`);
  for (const x of check.none || []) if (re(x).test(said)) errs.push(`ada ${String(x).slice(0, 60)}`);
  if (check.ask && !/\?/.test(reply?.kind === 'say' ? [reply.title, reply.text].join(' ') : reply?.intro || '')) errs.push('tidak bertanya balik');
  const chips = reply?.chips || [];
  if (check.chipsAny && !check.chipsAny.some(x => chips.some(ch => re(x).test(ch)))) errs.push(`pilihan tanpa ${check.chipsAny.map(String).join(' / ')}`);
  if (check.open && reply?.open?.view !== check.open) errs.push(`tombol ${reply?.open?.view || '-'} ≠ ${check.open}`);
  return errs;
}

async function run(eng, c, base) {
  let acc = base, memory = {}, reply = null, intent = '', said = '';
  const savedIds = [];
  const at = () => ({ ...acc, voice: c.voice, inspect: t => eng.inspect(t, acc.quick), ...(eng.classify ? { classify: eng.classify } : {}) });
  const errs = [];
  for (const [i, turn] of c.turns.entries()) {
    if (turn.save) {
      if (!reply || reply.kind !== 'plan') return [`giliran ${i + 1}: tidak ada kartu untuk disimpan (${intent}: “${said.slice(0, 80)}”)`];
      const planText = reply.text;
      const before = new Set(acc.data.transactions.map(t => t.id));
      acc = saveInto(acc, planText);
      const made = acc.data.transactions.find(t => !before.has(t.id))?.id; if (made) savedIds.push(made);
      memory = { ...memory, plan: { text: planText, status: 'saved' }, saves: [...(memory.saves || []), planText].slice(-5) };
      // What the app says after Simpan (10.0+): the remark, then the note on the day's share.
      const ctx = at();
      const remark = eng.chat.commentOnSaved ? eng.chat.commentOnSaved(planText, memory, ctx, { comments: true }) : null;
      if (remark) memory = remark.memory;
      reply = remark ? remark.reply : { kind: 'say', text: '' }; intent = 'saved'; said = shown(reply);
      continue;
    }
    const r = await eng.chat.chatReply(turn.say, memory, at()); memory = r.memory; reply = r.reply; intent = r.intent;
    said = shown(reply);
    if (reply.kind === 'plan' && eng.inspect(reply.text, acc.quick).reading === 'question') { const q = eng.parse(reply.text, acc.quick).actions[0]?.result.operation?.query; if (q) said += ' ' + [q.answer, ...(q.lines || []).map(l => `${l.label} Rp${Number(l.amount).toLocaleString('id-ID')}`)].join(' '); }
    if (turn.check) {
      const e = judge(eng, acc, turn.check, reply, intent, said, savedIds);
      if (e.length) errs.push(`${c.turns.length > 1 ? `giliran ${i + 1} “${turn.say}”: ` : ''}${e.join('; ')} — ${reply?.kind === 'plan' ? `«${reply.text}» ${reply.intro || ''}` : `“${said.replace(/\s+/g, ' ').slice(0, 170)}”`}${reply?.chips?.length ? ` [${reply.chips.join(' | ').slice(0, 80)}]` : ''}`);
    }
  }
  return errs;
}

const FAM = { susulan: '1 · Jawaban susulan', koreksi: '2 · Koreksi kartu', simpan: '3 · Ubah setelah Simpan', konteks: '4 · Konteks panjang', catat: '5 · Fitur: mencatat', tanya: '6 · Fitur: bertanya', menu: '7 · Fitur: menu & cara' };
const out = [], log = l => { out.push(l); console.log(l); };
const res = {}, started = Date.now();
for (const [k, eng] of Object.entries(engines)) {
  res[k] = [];
  for (const c of cases) {
    const errs = [];
    for (const acc of accounts) { const e = await run(eng, c, acc).catch(x => [`error: ${x.message.split('\n')[0]}`]); if (e.length) errs.push(`[${acc.account}] ${e.join(' | ')}`); }
    res[k].push({ c, err: errs.join('  ') });
  }
}
const pct = (a, b) => b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–';
const names = Object.keys(engines);
log(`## Asisten chat 3.5 — ${SET} (${cases.length} kasus × 2 akun${RULES ? ', aturan saja' : ', aturan + model terlatih masing-masing'})\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
log(`| **Semua kasus** | ${names.map(k => pct(res[k].filter(x => !x.err).length, cases.length)).join(' | ')} |`);
for (const [f, label] of Object.entries(FAM)) { const n = cases.filter(c => c.fam === f).length; if (n) log(`| · ${label} | ${names.map(k => pct(res[k].filter(x => x.c.fam === f && !x.err).length, n)).join(' | ')} |`); }
log(`\n(${Math.round((Date.now() - started) / 1000)} dtk)`);
if (process.argv.includes('--fails')) for (const k of names) { const f = res[k].filter(x => x.err); if (!f.length) continue; log(`\n### Gagal — ${k} (${f.length})`); for (const x of f) log(`- ${x.c.id} [${x.c.fam}] ${x.c.turns.map(t => t.save ? '[Simpan]' : `“${t.say}”`).join(' → ')}: ${x.err}`); }
if (process.argv.includes('--first')) {
  const file = new URL(`./FROZEN-${SET}-first.md`, import.meta.url);
  if (existsSync(file)) console.log(`\n${file.pathname} sudah ada: hasil percobaan pertama tidak ditimpa.`);
  else { writeFileSync(file, `# Percobaan pertama, dibekukan (${new Date().toISOString().slice(0, 10)})\n\n${out.join('\n')}\n`); console.log(`\nDibekukan: ${file.pathname}`); }
}
