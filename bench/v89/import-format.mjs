// 8.9 Large-scale format test: every labeled line of the import benchmarks, wrapped the way banks and e-wallets print
// them (QRIS, TRSF E-BANKING, debit card, reference numbers, upper/lower case, ...). The category must not change because
// of the wrapping, and a shop line must not turn into a transfer.
// Usage: node bench/v89/import-format.mjs [pool|heldout5] [root]   (SHOW=1 lists lines that change)
import fs from 'node:fs';
import path from 'node:path';
const which = process.argv[2] || 'pool', here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(process.argv[3] || path.join(here, '../..'));
const { planImport } = await import(path.join(root, 'lib/import/statement.ts'));
const { categoryTemplates, planTemplateSeed } = await import(path.join(root, 'lib/category-templates.ts'));
const categories = planTemplateSeed([], categoryTemplates.map(t => t.key)).map(r => ({ id: r.id, ...r.data }));
const byId = new Map(categories.map(c => [c.id, c]));
const label = id => { const c = byId.get(id); if (!c) return null; const p = c.parentId ? byId.get(c.parentId) : null; return p ? `${p.name}/${c.name}` : c.name; };
const load = (dir, set) => JSON.parse(fs.readFileSync(path.join(here, '..', dir, `import-cat-${set}.json`), 'utf8')).items.filter(x => x[3] !== null);
const items = which === 'heldout5' ? load('v89', 'heldout5') : [...load('v88', 'dev'), ...load('v88', 'dev2'), ...load('v88', 'heldout'), ...load('v88', 'heldout2'), ...load('v89', 'heldout3'), ...load('v89', 'heldout4')];
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const ref = () => `${['TRX', 'REF', 'ID'][rnd(3)]}${String(1e9 + rnd(9e8))}`;
const city = () => ['JAKARTA', 'BANDUNG', 'SURABAYA', 'TANGERANG', 'BEKASI'][rnd(5)];
const OUT = [
  ['QRIS', d => `QRIS ${d.toUpperCase()}`],
  ['TRSF DB', (d, a) => `TRSF E-BANKING DB 0510/FTSCY/WS9503${rnd(10)} ${a}.00 ${d}`],
  ['DEBIT CARD', d => `DEBIT CARD PURCHASE ${d.toUpperCase()} ${city()} ID`],
  ['PEMBAYARAN QRIS', d => `PEMBAYARAN QRIS ${d} ${ref()}`],
  ['lower', d => d.toLowerCase()],
  ['ref after', d => `${d} - ${ref()}`],
  ['Pembelian', d => `Pembelian ${d}`],
  ['UPPER', d => d.toUpperCase()],
  ['KARTU DEBIT', d => `KARTU DEBIT ${d.toUpperCase()} ${city()}`],
  ['via GoPay', d => `Pembayaran ${d} via GoPay`],
];
const IN = [
  ['TRSF CR', (d, a) => `TRSF E-BANKING CR 0510/FTSCY/WS9503${rnd(10)} ${a}.00 ${d}`],
  ['BI-FAST CR', d => `BI-FAST CR ${d} ${ref()}`],
  ['UPPER', d => d.toUpperCase()],
  ['lower', d => d.toLowerCase()],
  ['Penerimaan', d => `Penerimaan ${d}`],
  ['ref after', d => `${d} ${ref()}`],
];
const plan = (description, type, amount) => {
  const read = { rows: [{ line: 1, date: '2026-10-05', description, amount, type }], columns: { date: 'Tanggal', description: ['Keterangan'] }, skipped: 0, unsure: 0 };
  return planImport(read, { walletId: 'bank', wallets: [{ id: 'bank', name: 'Bank', type: 'bank' }, { id: 'cash', name: 'Tunai', type: 'cash' }], categories, transactions: [], drafts: [] })[0];
};
const grade = (x, expect) => {
  if (x.flow === 'transfer' || x.person) return 'transfer';
  const got = label(x.subcategoryId || x.categoryId); if (!got) return 'none';
  const wants = expect.split(' | ').map(e => { const at = e.indexOf('/'); return at < 0 ? [e.trim()] : [e.slice(0, at).trim(), e.slice(at + 1).trim()]; });
  const gp = got.split('/')[0];
  if (wants.some(([ep, ...es]) => got === [ep, ...es].join('/') || (!es.length && gp === ep))) return 'right';
  return wants.some(([ep]) => gp === ep) ? 'part' : 'wrong';
};
const tally = () => ({ right: 0, part: 0, wrong: 0, none: 0, transfer: 0, n: 0, same: 0 });
const total = tally(), per = new Map(), changes = [];
for (const [d, type, amount, expect] of items) {
  const clean = plan(d, type, amount), cg = grade(clean, expect), cl = label(clean.subcategoryId || clean.categoryId);
  for (const [name, wrap] of type === 'income' ? IN : OUT) {
    const text = wrap(d, amount), x = plan(text, type, amount), g = grade(x, expect), l = label(x.subcategoryId || x.categoryId);
    const t = per.get(name) || tally(); per.set(name, t);
    for (const s of [total, t]) { s[g]++; s.n++; if (g === cg && l === cl) s.same++; }
    if (g !== cg || l !== cl) changes.push(`  [${name}] ${text}  → ${g === 'transfer' ? 'TRANSFER' : l} (clean: ${cl}, ${cg}; want ${expect})`);
  }
}
const pct = (v, n) => `${(100 * v / n).toFixed(1)}%`;
console.log(`${which}: ${items.length} lines × formats = ${total.n} lines | right ${total.right} (${pct(total.right, total.n)}) | wrong ${total.wrong + total.part} (${pct(total.wrong + total.part, total.n)}) | no guess ${total.none} (${pct(total.none, total.n)}) | read as transfer ${total.transfer} (${pct(total.transfer, total.n)}) | same as the plain line ${pct(total.same, total.n)}`);
for (const [name, t] of per) console.log(`  ${name.padEnd(16)} right ${pct(t.right, t.n).padStart(6)} | wrong ${pct(t.wrong + t.part, t.n).padStart(6)} | none ${pct(t.none, t.n).padStart(6)} | transfer ${pct(t.transfer, t.n).padStart(6)} | same ${pct(t.same, t.n).padStart(6)}`);
if (process.env.SHOW) console.log(changes.join('\n'));
