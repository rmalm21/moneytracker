/**
 * 7.9 receipts: the reader (lib/receipt.ts) on receipts written as the OCR reads them. 7.8 (bench/v79/baseline-v78) vs now.
 *   SET=user node bench/v79/receipts-run.mjs [--fails]     the five receipts the person sent (dev)
 *   SET=gen-dev|gen-hold node bench/v79/receipts-run.mjs    receipts made in the same five layouts (bench/v79/receipts-gen.mjs)
 */
import { existsSync, writeFileSync } from 'node:fs';
const SET = process.env.SET || 'user';
const list = SET === 'user' ? (await import('./receipts-user.mjs')).receipts : (await import('./receipts-gen.mjs')).makeSet(SET);
const engines = { '7.8': await import('./baseline-v78/lib/receipt.ts'), sekarang: await import('../../lib/receipt.ts') };
const FIELDS = ['merchant', 'date', 'time', 'total', 'subtotal', 'paid', 'change', 'payment', 'items', 'sure'];
function judge(eng, r) {
  const read = eng.readReceiptText(r.text), check = eng.checkReceipt(read), t = r.truth, errs = [];
  const ok = {};
  if (t.merchant) ok.merchant = t.merchant.test(read.merchant || '');
  if (t.date) ok.date = read.date === t.date;
  if (t.time) ok.time = (read.time || '').slice(0, 5) === t.time;
  ok.total = check.total === t.total;
  if (t.subtotal !== undefined) ok.subtotal = read.subtotal === t.subtotal;
  if (t.paid !== undefined) ok.paid = read.paid === t.paid;
  if (t.change !== undefined) ok.change = read.change === t.change;
  if (t.payment) ok.payment = read.payment === t.payment;
  // What each line cost after its own discount (a hypermarket prints both).
  const items = read.items.map(i => [i.name, i.total - (i.discount || 0)]);
  ok.items = items.length === t.items.length && t.items.every(([n, v], i) => items[i] && items[i][1] === v && items[i][0].toLowerCase().startsWith(n.toLowerCase().slice(0, 4)));
  // "Sure" only when right; a receipt that does not add up is never sure.
  ok.sure = t.notSure ? check.confidence !== 'tinggi' : !(check.confidence === 'tinggi' && check.total !== t.total);
  for (const [k, v] of Object.entries(ok)) if (!v) errs.push(k === 'items' ? `items: ${JSON.stringify(items)}` : k === 'sure' ? `yakin: ${check.confidence} (total ${check.total})` : `${k}: ${JSON.stringify(k === 'total' ? check.total : read[k])} ≠ ${JSON.stringify(t[k] instanceof RegExp ? String(t[k]) : t[k])}`);
  return { ok, errs };
}
const out = [], log = l => { out.push(l); console.log(l); };
const res = Object.fromEntries(Object.entries(engines).map(([k, e]) => [k, list.map(r => ({ r, ...judge(e, r) }))]));
const pct = (a, b) => b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–';
log(`## Struk 7.9 — ${SET} (${list.length} struk)\n\n| | 7.8 | sekarang |\n|---|---|---|`);
log(`| Struk benar seluruhnya | ${Object.values(res).map(x => pct(x.filter(y => !y.errs.length).length, x.length)).join(' | ')} |`);
for (const f of FIELDS) { const vals = Object.values(res).map(x => { const h = x.filter(y => f in y.ok); return h.length ? pct(h.filter(y => y.ok[f]).length, h.length) : '–'; }); log(`| · ${f} | ${vals.join(' | ')} |`); }
if (process.argv.includes('--first')) { const f = new URL(`./FROZEN-receipts-${SET}-first.md`, import.meta.url); if (existsSync(f)) console.log('(hasil pertama sudah dibekukan)'); else { writeFileSync(f, out.join('\n') + '\n'); console.log('(dibekukan)'); } }
if (process.argv.includes('--fails')) for (const x of res.sekarang.filter(y => y.errs.length)) console.log(`· ${x.r.id}\n    ${x.errs.join('\n    ')}`);
