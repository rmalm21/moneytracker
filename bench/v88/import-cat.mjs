// 8.8 Import categorization benchmark: each made-up statement line goes through the import planner with the default
// category templates and no history, and the guessed category is compared with the expected one.
// Usage: node bench/v88/import-cat.mjs dev|heldout [root]  (root: a checkout of another version, for the baseline)
import fs from 'node:fs';
import path from 'node:path';
const set = process.argv[2] || 'dev', root = path.resolve(process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), '../..'));
const { planImport } = await import(path.join(root, 'lib/import/statement.ts'));
const { categoryTemplates, planTemplateSeed } = await import(path.join(root, 'lib/category-templates.ts'));
const items = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), `import-cat-${set}.json`), 'utf8')).items;
const categories = planTemplateSeed([], categoryTemplates.map(t => t.key)).map(r => ({ id: r.id, ...r.data }));
const byId = new Map(categories.map(c => [c.id, c]));
const label = (id) => { const c = byId.get(id); if (!c) return null; const p = c.parentId ? byId.get(c.parentId) : null; return p ? `${p.name}/${c.name}` : c.name; };
let exact = 0, parent = 0, wrong = 0, none = 0, skipped = 0; const misses = [];
for (const [d, type, amount, expect] of items) {
  const read = { rows: [{ line: 1, date: '2026-10-05', description: d, amount, type }], columns: { date: 'Tanggal', description: ['Keterangan'] }, skipped: 0, unsure: 0 };
  const [x] = planImport(read, { walletId: 'bank', wallets: [{ id: 'bank', name: 'Bank', type: 'bank' }, { id: 'cash', name: 'Tunai', type: 'cash' }], categories, transactions: [], drafts: [] });
  if (expect === null) { skipped++; continue; }
  const got = label(x.subcategoryId || x.categoryId), [ep, es] = expect.split('/');
  const gp = got?.split('/')[0];
  if (!got) { none++; misses.push(`  NONE  ${d}  → want ${expect}`); }
  else if (got === expect || (!es && gp === ep)) exact++;
  else if (gp === ep) { parent++; misses.push(`  PART  ${d}  → ${got}  (want ${expect})`); }
  else { wrong++; misses.push(`  WRONG ${d}  → ${got}  (want ${expect})`); }
}
const n = items.length - skipped, pct = v => `${(100 * v / n).toFixed(1)}%`;
console.log(`${set}: ${n} lines | right ${exact} (${pct(exact)}) | right main category, other sub ${parent} (${pct(parent)}) | wrong ${wrong} (${pct(wrong)}) | no guess ${none} (${pct(none)})`);
if (process.env.SHOW) console.log(misses.join('\n'));
