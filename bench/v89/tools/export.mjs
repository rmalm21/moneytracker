// Exports the kNN examples (words the rules know, labeled through category names) and each benchmark line with the rules'
// guess, so the Python harness scores models exactly like the app would.
import fs from 'node:fs'; import path from 'node:path';
const ROOT = '/home/user/moneytracker';
const { planImport } = await import(path.join(ROOT, 'lib/import/statement.ts'));
const { categoryByNames } = await import(path.join(ROOT, 'lib/import/places.ts'));
const { categoryTemplates, planTemplateSeed } = await import(path.join(ROOT, 'lib/category-templates.ts'));
const categories = planTemplateSeed([], categoryTemplates.map(t => t.key)).map(r => ({ id: r.id, ...r.data, isArchived: false }));
const byId = new Map(categories.map(c => [c.id, c]));
const label = id => { const c = byId.get(id); if (!c) return null; const p = c.parentId ? byId.get(c.parentId) : null; return p ? `${p.name}/${c.name}` : c.name; };
const examples = [];
const add = (text, type, names, src) => { const hit = categoryByNames(names, type, categories); if (hit && text.length >= 3) examples.push({ text, type, label: label(hit.subcategoryId || hit.categoryId), src }); };
for (const m of fs.readFileSync(path.join(ROOT, 'lib/import/places.ts'), 'utf8').matchAll(/P\('(expense|income)', \/(.+?)\/i, '([^']+)'\)/g)) {
  for (let a of [...m[2].matchAll(/\(\?:([^()]*)\)/g)].flatMap(g => g[1].split('|'))) { a = a.replace(/\\b/g, '').replace(/ \?/g, ' ').replace(/\\s\+?|\\s\*/g, ' ').replace(/\\/g, ''); if (/^[\p{L}\p{N} &'.-]+$/u.test(a)) add(a.trim(), m[1], m[3].split('|'), 'places'); }
}
for (const m of fs.readFileSync(path.join(ROOT, 'lib/categorize.ts'), 'utf8').matchAll(/C\('[^']+', '(expense|income)', '[^']*', '([^']+)', '([^']*)'/g)) for (const w of m[3].split('|')) add(w.replace(/^~/, ''), m[1], [m[2], ...m[3].split('|')], 'concepts');
const seen = new Set(); const ex = examples.filter(x => { const k = x.type + x.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
const sets = {};
for (const [set, dir] of [['dev', 'v88'], ['dev2', 'v88'], ['heldout', 'v88'], ['heldout2', 'v88'], ['heldout3', 'v89'], ['heldout4', 'v89']]) {
  sets[set] = JSON.parse(fs.readFileSync(path.join(ROOT, `bench/${dir}/import-cat-${set}.json`), 'utf8')).items.filter(x => x[3] !== null).map(([d, type, amount, expect]) => {
    const read = { rows: [{ line: 1, date: '2026-10-05', description: d, amount, type }], columns: { date: 'Tanggal', description: ['Keterangan'] }, skipped: 0, unsure: 0 };
    const [x] = planImport(read, { walletId: 'bank', wallets: [{ id: 'bank', name: 'Bank', type: 'bank' }], categories, transactions: [], drafts: [] });
    return { text: d, type, expect, rules: label(x.subcategoryId || x.categoryId) };
  });
}
fs.writeFileSync(process.argv[2], JSON.stringify({ examples: ex, sets }));
console.log('examples', ex.length, Object.entries(sets).map(([k, v]) => `${k}:${v.length}`).join(' '));
