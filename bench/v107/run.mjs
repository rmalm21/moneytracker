/**
 * 10.7 Daftar bertanggal — 10.6 (bench/v107/baseline-v106, from `sh bench/v107/make-baseline.sh`) vs now.
 *   SET=dev|heldout node bench/v107/run.mjs [--first] [--fails] [--only=10.6|sekarang] [--id=dev1]
 * --first writes FROZEN-<set>-first.md once (the held-out set is run that way, a single time, at the end).
 *
 * A list passes when it gives exactly its items, in order, each with its kind, amount and date (and category,
 * subcategory and wallets where the case says), on both accounts of bench/v102/state.mjs; it is read by Catat otomatis
 * (parseQuickPlan) and through the chat (chatReply must answer with that card).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { accounts } from '../v102/state.mjs';
import { build, TODAY } from './gen.mjs';
const SET = process.env.SET || 'dev', arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const cases = build(SET).filter(c => !arg('id') || c.id === arg('id'));
const all = { '10.6': './baseline-v106/lib', sekarang: '../../lib' };
const engines = {};
for (const [k, dir] of Object.entries(all)) if ((!arg('only') || arg('only') === k) && (k === 'sekarang' || existsSync(new URL(dir, import.meta.url)))) engines[k] = { parse: (await import(`${dir}/quick-plan.ts`)).parseQuickPlan, chat: await import(`${dir}/chat/engine.ts`), classify: (await import(`${dir}/chat/model.ts`)).classifyChat, inspect: (await import(`${dir}/chat/inspect.ts`)).inspect };
const NOW = Date.parse(`${TODAY}T15:00:00+07:00`);
const onToday = acc => ({ ...acc, today: TODAY, quick: { ...acc.quick, today: TODAY, now: new Date(NOW), nowMs: NOW } });
const low = s => String(s || '').toLowerCase();
const nameOf = (acc, id) => acc.data.categories.find(c => c.id === id)?.name || '';
const walletOf = (acc, id) => acc.data.wallets.find(w => w.id === id)?.name || '';
function judge(acc, plan, items) {
  const errs = [], acts = plan.actions.filter(a => !(plan.cancelled || []).includes(a.id));
  if (acts.length !== items.length) errs.push(`${acts.length} catatan ≠ ${items.length}`);
  items.forEach(([kind, amount, date, cat, sub, extra = {}], i) => {
    const a = acts[i]; if (!a) return;
    const r = a.result, p = r.preset || {}, at = `#${i + 1} “${a.text.slice(0, 40)}”`;
    if (r.kind !== kind) errs.push(`${at}: jenis ${r.kind} ≠ ${kind}`);
    if (r.amount !== amount) errs.push(`${at}: nominal ${r.amount} ≠ ${amount}`);
    const d = p.date || r.date || acc.today; if (d !== date) errs.push(`${at}: tanggal ${d} ≠ ${date}`);
    const parent = nameOf(acc, p.categoryId), child = nameOf(acc, p.subcategoryId);
    if (cat && !cat.split('|').map(low).includes(low(parent))) errs.push(`${at}: kategori ${parent || '-'} ≠ ${cat}`);
    if (sub && !sub.split('|').map(low).includes(low(child))) errs.push(`${at}: subkategori ${child || '-'} ≠ ${sub}`);
    if (extra.wallet && low(walletOf(acc, p.walletId)) !== low(extra.wallet)) errs.push(`${at}: dompet ${walletOf(acc, p.walletId) || '-'} ≠ ${extra.wallet}`);
    if (extra.to && low(walletOf(acc, p.destinationWalletId)) !== low(extra.to)) errs.push(`${at}: tujuan ${walletOf(acc, p.destinationWalletId) || '-'} ≠ ${extra.to}`);
  });
  return errs;
}
const rows = [];
for (const [name, eng] of Object.entries(engines)) {
  let pass = 0, chatPass = 0, items = 0, itemPass = 0;
  const fails = [];
  for (const c of cases) {
    let ok = true, okChat = true;
    for (const base of accounts) {
      const acc = onToday(base);
      const plan = eng.parse(c.text, acc.quick);
      const errs = judge(acc, plan, c.items);
      if (base === accounts[0]) { items += c.items.length; itemPass += c.items.filter((_, i) => !errs.some(e => e.startsWith(`#${i + 1} `))).length - (errs.some(e => /catatan ≠/.test(e)) ? 0 : 0); }
      if (errs.length) { ok = false; if (base === accounts[0]) fails.push(`${c.id} [${c.fam}] ${errs.join('; ')}`); }
      // Through the chat: the answer must be the card with the same reading.
      const ctx = { ...acc, voice: 'santai', inspect: t => eng.inspect(t, acc.quick), classify: eng.classify };
      const r = await eng.chat.chatReply(c.text, {}, ctx);
      if (r.reply.kind !== 'plan' || judge(acc, eng.parse(r.reply.text, acc.quick), c.items).length) okChat = false;
    }
    if (ok) pass++; if (okChat) chatPass++;
  }
  rows.push({ name, pass, chatPass, items, itemPass, fails });
}
const pct = (a, b) => `${a}/${b} (${Math.round(a / Math.max(1, b) * 100)}%)`;
let out = `# Daftar bertanggal — ${SET}\n\n| | ${rows.map(r => r.name).join(' | ')} |\n|---|${rows.map(() => '---').join('|')}|\n`;
out += `| **Daftar benar (Catat otomatis)** | ${rows.map(r => pct(r.pass, cases.length)).join(' | ')} |\n`;
out += `| Daftar benar lewat chat | ${rows.map(r => pct(r.chatPass, cases.length)).join(' | ')} |\n`;
out += `| Baris benar (akun bench) | ${rows.map(r => pct(r.itemPass, r.items)).join(' | ')} |\n`;
if (process.argv.includes('--fails')) for (const r of rows) out += `\n## Gagal — ${r.name}\n${r.fails.map(f => `- ${f}`).join('\n') || '(tidak ada)'}\n`;
console.log(out);
if (process.argv.includes('--first')) {
  const file = new URL(`./FROZEN-${SET}-first.md`, import.meta.url);
  if (existsSync(file)) console.log('(sudah dibekukan, tidak ditulis ulang)'); else writeFileSync(file, `${out}\n_Dijalankan sekali, ${new Date().toISOString()}._\n`);
}
