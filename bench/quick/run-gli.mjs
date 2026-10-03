/**
 * General Language Intelligence v1.0 benchmark: 4.9 (frozen in bench/quick/baseline-v34) vs now, cold (no Kamus
 * Pribadi), on the A canonical / B variants / C adversarial sets.
 *
 *   SET=glidev node bench/quick/run-gli.mjs [--fails]
 *   SET=gliheldout node bench/quick/run-gli.mjs
 *   node bench/quick/run-gli.mjs --scale        language pack size vs compile time and lookup latency
 *
 * FALSE NORMALIZATION (the most important number): a word listed in `keep` was rewritten, a productive shorthand
 * reading fired on a canonical sentence, or the financial meaning (kind, amount, wallet, destination, date, person)
 * of a canonical sentence changed against 4.9.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out'), root = resolve(here, '../..');
const L = await import(pathToFileURL(resolve(root, 'lib/catat/language.ts')).href);

if (process.argv.includes('--scale')) {
  const { conceptWords } = await import(pathToFileURL(resolve(root, 'lib/categorize.ts')).href);
  const big = [...new Set([...L.CANONICAL, ...[...conceptWords()].filter(w => /^\p{L}{4,}$/u.test(w))])];
  console.log(`\n## Ukuran kosakata vs waktu (bahasa umum v${L.GENERAL_LANGUAGE_VERSION})\n\n| Kata kanonik | Varian | Ambigu | Kompilasi (ms) | Normalisasi / kalimat (ms) |\n|---|---|---|---|---|`);
  for (const n of [10, 100, 500, 1000, big.length]) {
    const vocab = big.slice(0, Math.min(n, big.length));
    const t0 = performance.now(); const p = L.compileLanguagePack(vocab); const compile = performance.now() - t0;
    const words = 'kmrn srapn 22rb trus prkr 5k pake jago'.split(' ');
    const t1 = performance.now(); for (let i = 0; i < 2000; i++) for (const w of words) p.variants.get(w); const per = (performance.now() - t1) / 2000;
    console.log(`| ${vocab.length} | ${p.variants.size} | ${p.ambiguous.size} | ${compile.toFixed(1)} | ${per.toFixed(4)} |`);
    if (n >= big.length) break;
  }
  const t2 = performance.now(); for (let i = 0; i < 500; i++) L.normalizeGeneral('kmrn srapn 22rb wkwk trus prkr5k pake jago', { wallets: [], categories: [], history: [] });
  console.log(`\nnormalizeGeneral (kalimat lengkap, pack terpasang): ${((performance.now() - t2) / 500).toFixed(3)} ms`);
  process.exit(0);
}

const SET = process.env.SET ?? 'glidev';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const { ctx } = await import('./fixtures-v33state.mjs');
const before = await import(pathToFileURL(resolve(here, 'baseline-v34/catat/v3.ts')).href);
const after = await import(pathToFileURL(resolve(root, 'lib/catat/v3.ts')).href);
const showFails = process.argv.includes('--fails');

const fieldOf = (a, k) => {
  const r = a.result, p = r.preset;
  return { kind: r.kind, amount: r.amount || null, description: p.description || '', merchant: p.merchant || '', person: r.person || '', wallet: p.walletId || '', to: p.destinationWalletId || '', date: r.date, cat: p.subcategoryId || p.categoryId || '' }[k];
};
function judge(plan, exp) {
  const errs = [], acts = plan.actions;
  const check = (a, e, label = '') => {
    if (!a) { errs.push(`${label}aksi tidak ada`); return; }
    for (const [k, v] of Object.entries(e)) {
      if (k === 'actions') continue;
      if (k.startsWith('not')) { const f = k[3].toLowerCase() + k.slice(4); if (fieldOf(a, f) === v) errs.push(`${label}${f} tidak boleh ${v}`); continue; }
      const got = fieldOf(a, k);
      if (k === 'cat' ? !(got === v || ctx.categories.find(c => c.id === got)?.parentId === v) : got !== v) errs.push(`${label}${k}: ${got || '∅'} ≠ ${v}`);
    }
  };
  if (exp.actions) { if (acts.length !== exp.actions.length) errs.push(`aksi ${acts.length} ≠ ${exp.actions.length}`); exp.actions.forEach((e, i) => check(acts[i], e, `#${i + 1} `)); }
  else { if (acts.length !== 1) errs.push(`aksi ${acts.length} ≠ 1`); check(acts[0], exp); }
  return errs;
}
const MEANING = ['kind', 'amount', 'wallet', 'to', 'date', 'person'];
const meaningOf = plan => JSON.stringify(plan.actions.map(a => MEANING.map(k => fieldOf(a, k))));

const rows = [], ms = { before: [], after: [] };
for (const c of cases) {
  let t = performance.now(); const b = await before.parseQuickPlanV3(c.text, ctx); ms.before.push(performance.now() - t);
  t = performance.now(); const a = await after.parseQuickPlanV3(c.text, ctx); ms.after.push(performance.now() - t);
  const notes = a.language?.notes || [];
  const falseNorm = [
    ...notes.filter(n => (c.keep || []).includes(n.raw.toLocaleLowerCase('id-ID'))).map(n => `${n.raw} → ${n.normalized} (dilindungi)`),
    ...(c.group === 'A' ? notes.filter(n => n.type === 'PRODUCTIVE_SHORTHAND').map(n => `${n.raw} → ${n.normalized} (kalimat kanonik)`) : []),
    ...(c.group === 'A' && meaningOf(a) !== meaningOf(b) ? [`arti berubah: ${meaningOf(b)} → ${meaningOf(a)}`] : []),
  ];
  const eb = judge(b, c.expect), ea = judge(a, c.expect);
  const descWanted = c.expect.description || c.expect.actions?.some(x => x.description);
  rows.push({ id: c.id, group: c.group, text: c.text, before: !eb.length, after: !ea.length, falseNorm, notes: notes.map(n => `${n.raw}→${n.normalized || '∅'}:${n.type}`), desc: descWanted ? { before: !eb.some(e => /description/.test(e)), after: !ea.some(e => /description/.test(e)) } : null, errors: { before: eb, after: ea } });
}
const n = rows.length, count = f => rows.filter(f).length, pct = (x, y = n) => y ? `${Math.round(x / y * 100)}%` : '–';
const groups = ['A', 'B', 'C'].filter(g => rows.some(r => r.group === g));
const p95 = l => [...l].sort((x, y) => x - y)[Math.floor(l.length * 0.95)] || 0, avg = l => l.reduce((s, x) => s + x, 0) / (l.length || 1);
const descRows = rows.filter(r => r.desc);
const summary = {
  set: SET, cases: n, languageVersion: L.GENERAL_LANGUAGE_VERSION,
  exact: { before: count(r => r.before), after: count(r => r.after) },
  byGroup: Object.fromEntries(groups.map(g => [g, { n: count(r => r.group === g), before: count(r => r.group === g && r.before), after: count(r => r.group === g && r.after) }])),
  falseNormalization: rows.filter(r => r.falseNorm.length).map(r => `${r.id}: ${r.falseNorm.join('; ')}`),
  regressions: rows.filter(r => r.before && !r.after).map(r => r.id),
  rescues: rows.filter(r => !r.before && r.after).map(r => r.id),
  descriptionRetention: { n: descRows.length, before: descRows.filter(r => r.desc.before).length, after: descRows.filter(r => r.desc.after).length },
  latencyMs: { before: { avg: +avg(ms.before).toFixed(1), p95: +p95(ms.before).toFixed(1) }, after: { avg: +avg(ms.after).toFixed(1), p95: +p95(ms.after).toFixed(1) } },
};
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `gli-${SET}.json`), JSON.stringify({ summary, rows }, null, 1));
const names = { A: 'A kanonik', B: 'B varian', C: 'C adversarial' };
console.log(`\n## Bahasa umum v${L.GENERAL_LANGUAGE_VERSION} — ${SET} (${n} kalimat, tanpa Kamus Pribadi)\n`);
console.log('| | 4.9 | Sekarang |\n|---|---|---|');
console.log(`| Benar seluruhnya | ${summary.exact.before}/${n} (${pct(summary.exact.before)}) | ${summary.exact.after}/${n} (${pct(summary.exact.after)}) |`);
for (const g of groups) { const x = summary.byGroup[g]; console.log(`| · ${names[g]} | ${x.before}/${x.n} | ${x.after}/${x.n} |`); }
console.log(`| Keterangan tetap ada | ${summary.descriptionRetention.before}/${summary.descriptionRetention.n} | ${summary.descriptionRetention.after}/${summary.descriptionRetention.n} |`);
console.log(`| Rata-rata / P95 (ms) | ${summary.latencyMs.before.avg} / ${summary.latencyMs.before.p95} | ${summary.latencyMs.after.avg} / ${summary.latencyMs.after.p95} |`);
console.log(`\nNormalisasi salah (FALSE NORMALIZATION): ${summary.falseNormalization.length}${summary.falseNormalization.length ? '\n  ' + summary.falseNormalization.join('\n  ') : ''}`);
console.log(`Regresi vs 4.9: ${summary.regressions.length} (${summary.regressions.join(', ') || '–'})`);
console.log(`Diselamatkan: ${summary.rescues.length} (${summary.rescues.join(', ') || '–'})`);
if (showFails) for (const r of rows.filter(r => !r.after)) console.log(`\n✗ ${r.id} “${r.text}”\n   ${r.errors.after.join('; ')}\n   bahasa: ${r.notes.join(', ') || '–'}`);
