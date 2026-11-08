// Spike: nearest labeled examples. Examples are the words the rules already know (places.ts and categorize.ts), each labeled
// through the person's own category names (categoryByNames), so it works with renamed categories too.
// node knncat.mjs <model> <set...>  env: MODE=emb|fallback, K, MIN (min top score), MARGIN, SHOW
import fs from 'node:fs'; import path from 'node:path';
import { pipeline, env } from '@huggingface/transformers';
env.cacheDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'models');
const ROOT = process.env.ROOT || '/home/user/moneytracker';
const [model, ...sets] = process.argv.slice(2); const e5 = /e5/.test(model);
const { planImport } = await import(path.join(ROOT, 'lib/import/statement.ts'));
const { categoryByNames } = await import(path.join(ROOT, 'lib/import/places.ts'));
const { categoryTemplates, planTemplateSeed } = await import(path.join(ROOT, 'lib/category-templates.ts'));
const categories = planTemplateSeed([], categoryTemplates.map(t => t.key)).map(r => ({ id: r.id, ...r.data, isArchived: false }));
const byId = new Map(categories.map(c => [c.id, c]));
const label = id => { const c = byId.get(id); if (!c) return null; const p = c.parentId ? byId.get(c.parentId) : null; return p ? `${p.name}/${c.name}` : c.name; };
const examples = [];
const add = (text, type, names) => { const hit = categoryByNames(names, type, categories); if (hit && text.length >= 3) examples.push({ text, type, id: hit.subcategoryId || hit.categoryId }); };
const placesSrc = fs.readFileSync(path.join(ROOT, 'lib/import/places.ts'), 'utf8');
for (const m of placesSrc.matchAll(/P\('(expense|income)', \/(.+?)\/i, '([^']+)'\)/g)) {
  const alts = [...m[2].matchAll(/\(\?:([^()]*)\)/g)].flatMap(g => g[1].split('|'));
  for (let a of alts) { a = a.replace(/\\b/g, '').replace(/ \?/g, ' ').replace(/\\s\+?|\\s\*/g, ' ').replace(/\\/g, ''); if (/^[\p{L}\p{N} &'.-]+$/u.test(a)) add(a.trim(), m[1], m[3].split('|')); }
}
const catSrc = fs.readFileSync(path.join(ROOT, 'lib/categorize.ts'), 'utf8');
for (const m of catSrc.matchAll(/C\('[^']+', '(expense|income)', '[^']*', '([^']+)', '([^']*)'/g)) for (const w of m[3].split('|')) add(w.replace(/^~/, ''), m[1], [m[2], ...m[3].split('|')]);
const seen = new Set(); const ex = examples.filter(x => { const k = x.type + x.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
const fe = await pipeline('feature-extraction', model, { dtype: 'q8' });
const embed = async texts => { const out = []; for (let i = 0; i < texts.length; i += 64) out.push(...(await fe(texts.slice(i, i + 64), { pooling: 'mean', normalize: true })).tolist()); return out; };
const t0 = Date.now(); const exVec = await embed(ex.map(x => (e5 ? 'passage: ' : '') + x.text));
console.log(`examples ${ex.length} (embedded in ${Date.now() - t0} ms)`);
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const MODE = process.env.MODE || 'emb', K = Number(process.env.K || 5), MIN = Number(process.env.MIN || 0), MARGIN = Number(process.env.MARGIN || 0);
for (const set of sets) {
  const dir = set === 'heldout3' ? path.join(ROOT, 'bench/v89') : path.join(ROOT, 'bench/v88');
  const items = JSON.parse(fs.readFileSync(path.join(dir, `import-cat-${set}.json`), 'utf8')).items.filter(x => x[3] !== null);
  let exact = 0, parent = 0, wrong = 0, none = 0, used = 0; const misses = [];
  for (const [d, type, amount, expect] of items) {
    let got = null, how = 'rules';
    if (MODE === 'fallback') {
      const read = { rows: [{ line: 1, date: '2026-10-05', description: d, amount, type }], columns: { date: 'Tanggal', description: ['Keterangan'] }, skipped: 0, unsure: 0 };
      const [x] = planImport(read, { walletId: 'bank', wallets: [{ id: 'bank', name: 'Bank', type: 'bank' }], categories, transactions: [], drafts: [] });
      got = label(x.subcategoryId || x.categoryId);
    }
    if (!got) {
      how = 'model';
      const [q] = await embed([(e5 ? 'query: ' : '') + d]);
      const near = ex.map((x, i) => ({ x, s: dot(q, exVec[i]) })).filter(n => n.x.type === type).sort((a, b) => b.s - a.s).slice(0, K);
      const vote = new Map(); for (const n of near) { const top = byId.get(n.x.id).parentId || n.x.id; const v = vote.get(top) || { s: 0, best: n }; v.s += n.s; vote.set(top, v); }
      const ranked = [...vote.values()].sort((a, b) => b.s - a.s);
      const ok = near[0].s >= MIN && (ranked[0].s - (ranked[1]?.s || 0)) / K >= MARGIN;
      if (ok) { got = label(ranked[0].best.x.id); used++; }
      if (process.env.SHOW) misses.push(`    [${d}] near: ${near.slice(0, 3).map(n => `${n.x.text}=${n.s.toFixed(2)}`).join(', ')}`);
    }
    const wants = expect.split(' | ').map(e => { const at = e.indexOf('/'); return at < 0 ? [e.trim()] : [e.slice(0, at).trim(), e.slice(at + 1).trim()]; });
    const gp = got?.split('/')[0];
    if (!got) { none++; misses.push(`  NONE  ${d} → want ${expect}`); }
    else if (wants.some(([ep, ...es]) => got === [ep, ...es].join('/') || (!es.length && gp === ep))) exact++;
    else if (wants.some(([ep]) => gp === ep)) { parent++; misses.push(`  PART  ${d} → ${got} (want ${expect}) [${how}]`); }
    else { wrong++; misses.push(`  WRONG ${d} → ${got} (want ${expect}) [${how}]`); }
  }
  const n = items.length, pct = v => `${(100 * v / n).toFixed(1)}%`;
  console.log(`${set} [${model.split('/')[1]} knn k${K} ${MODE} min${MIN} m${MARGIN}]: ${n} | right ${exact} (${pct(exact)}) | main ok ${parent} | wrong ${wrong} (${pct(wrong)}) | none ${none} | model used ${used}`);
  if (process.env.SHOW) console.log(misses.join('\n'));
}
