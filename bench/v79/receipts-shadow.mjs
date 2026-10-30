/**
 * 7.9 receipts shadow: 7.8 (bench/v79/baseline-v78) vs now on every made-up receipt text the older benches have
 * (bench/receipts fixtures, bench/minimarket sets), read as clean text. Prints each receipt whose reading changed.
 *   node bench/v79/receipts-shadow.mjs
 */
import { makeSet } from '../minimarket/receipts.mjs';
const old = await import('./baseline-v78/lib/receipt.ts'), now = await import('../../lib/receipt.ts');
const texts = [];
for (const file of ['fixtures', 'fixtures-v25', 'fixtures-holdout']) {
  const { receipts } = await import(`../receipts/${file}.mjs`);
  for (const r of receipts) if (r.rows) texts.push({ id: `${file}/${r.id}`, text: r.rows.map(row => row[0] === '-' ? '-'.repeat(32) : row[0] === 'r' || row[0] === 'b' ? `${row[1]}   ${row[2]}` : row[1]).join('\n') });
}
for (const [name, seed, split] of [['mini-dev', 101, 'dev'], ['mini-hold', 202, 'hold'], ['mini-dev2', 505, 'dev'], ['mini-hold2', 606, 'hold2']])
  for (const r of makeSet(name, seed, 60, split)) texts.push({ id: `${name}/${r.id}`, text: r.lines.map(l => l.text).join('\n') });
const view = (eng, text) => { const r = eng.readReceiptText(text), c = eng.checkReceipt(r); return { merchant: r.merchant, date: r.date, time: r.time, total: c.total, subtotal: r.subtotal, paid: r.paid, change: r.change, payment: r.payment, discount: r.discount, sure: c.confidence, items: r.items.map(i => `${i.name}|${i.qty}|${i.total}|${i.discount || 0}`) }; };
let changed = 0;
for (const { id, text } of texts) {
  const a = view(old, text), b = view(now, text), diff = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (!diff.length) continue;
  changed++;
  console.log(`· ${id}`);
  for (const k of diff) console.log(`    ${k}: ${JSON.stringify(a[k])}\n    ${' '.repeat(k.length)}→ ${JSON.stringify(b[k])}`);
}
console.log(`\n${texts.length} struk, ${changed} berubah`);
