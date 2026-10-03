/**
 * Catat otomatis V3.5 — Compositional Language Intelligence benchmark: 4.10 (frozen in bench/quick/baseline-v410) vs
 * now, cold, per field, with "confident wrong" (a wrong field on an entry that did not ask for review).
 *
 *   SET=v35dev node bench/quick/run-v35.mjs [--fails]        A development composition set
 *   SET=v35heldout node bench/quick/run-v35.mjs [--first]    B fresh held-out (--first freezes the first run, once)
 *   SET=v35adv node bench/quick/run-v35.mjs                  C adversarial collision set
 *   node bench/quick/run-v35.mjs --shadow                    D every sentence of every fixture: what changed vs 4.10
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out'), root = resolve(here, '../..');
const { ctx } = await import('./fixtures-v35state.mjs');
const before = await import(pathToFileURL(resolve(here, 'baseline-v410/catat/v3.ts')).href);
const after = await import(pathToFileURL(resolve(root, 'lib/catat/v3.ts')).href);
const low = s => String(s ?? '').toLocaleLowerCase('id-ID').trim();
const parentOf = id => ctx.categories.find(c => c.id === id)?.parentId;

const fieldOf = (a, k) => {
  const r = a.result, p = r.preset;
  switch (k) {
    case 'kind': return r.kind; case 'amount': return r.amount || null; case 'description': return low(p.description);
    case 'merchant': return low(p.merchant); case 'wallet': return p.walletId || ''; case 'to': return p.destinationWalletId || '';
    case 'person': return low(r.person); case 'date': return r.date; case 'cat': return p.subcategoryId || p.categoryId || '';
    case 'details': return (r.details || []).map(i => low(i.name)).join(' | ');
    case 'purpose': return low(r.purpose);
    case 'people': return low((p.notes || '').match(/Bersama: ([^·]+)/)?.[1]);
    case 'explicit': return a.fields.category?.status === 'verified' && /^disebut/.test(a.fields.category.note || '') ? (p.subcategoryId || p.categoryId) : '';
  }
};
const want = (k, v) => k === 'details' || k === 'people' ? v.map(low).join(' | ') : ['description', 'merchant', 'purpose', 'person'].includes(k) ? low(v) : v;
const FIELDS = ['kind', 'amount', 'wallet', 'to', 'date', 'description', 'cat', 'explicit', 'merchant', 'details', 'purpose', 'people', 'person'];

function judge(plan, exp) {
  const errs = [], fields = {}, acts = plan.actions;
  let confidentWrong = false;
  const check = (a, e, label = '') => {
    if (!a) { errs.push(`${label}aksi tidak ada`); return; }
    let wrong = false;
    for (const [k, v] of Object.entries(e)) {
      if (k === 'actions') continue;
      if (k === 'noDetails') { const ok = !fieldOf(a, 'details'); fields.details = [...(fields.details || []), ok]; if (!ok) { errs.push(`${label}rincian palsu: ${fieldOf(a, 'details')}`); wrong = true; } continue; }
      if (k === 'noMerchant') { const ok = !fieldOf(a, 'merchant'); fields.merchant = [...(fields.merchant || []), ok]; if (!ok) { errs.push(`${label}tempat palsu: ${fieldOf(a, 'merchant')}`); wrong = true; } continue; }
      if (k.startsWith('not')) { const f = k[3].toLowerCase() + k.slice(4); if (fieldOf(a, f) === v) { errs.push(`${label}${f} tidak boleh ${v}`); wrong = true; } continue; }
      const got = fieldOf(a, k), w = want(k, v);
      const ok = k === 'cat' || k === 'explicit' ? got === w || parentOf(got) === w : got === w;
      fields[k] = [...(fields[k] || []), ok];
      if (!ok) { errs.push(`${label}${k}: ${got || '∅'} ≠ ${w}`); wrong = true; }
    }
    if (wrong && !a.review) confidentWrong = true;
  };
  const n = exp.actions ? exp.actions.length : 1;
  const segOk = acts.length === n;
  if (!segOk) errs.push(`aksi ${acts.length} ≠ ${n}`);
  if (exp.actions) exp.actions.forEach((e, i) => check(acts[i], e, `#${i + 1} `)); else check(acts[0], exp);
  return { errs, fields, segOk, confidentWrong };
}

const MEANING = ['kind', 'amount', 'wallet', 'to', 'date', 'person'];
const STRUCT = ['description', 'merchant', 'cat', 'details', 'purpose', 'people', 'explicit'];
const show = (a, keys) => keys.map(k => fieldOf(a, k)).map(v => v === '' || v == null ? '∅' : v).join(' · ');

if (process.argv.includes('--shadow')) {
  const files = readdirSync(here).filter(f => /^fixtures-.*\.mjs$/.test(f) && !/state/.test(f));
  const seen = new Set(), changes = [];
  let total = 0;
  for (const f of files) {
    const mod = await import(`./${f}`);
    for (const c of mod.cases || mod.default || []) {
      const text = c.text || c.input; if (!text || seen.has(text)) continue; seen.add(text); total++;
      const b = await before.parseQuickPlanV3(text, ctx), a = await after.parseQuickPlanV3(text, ctx);
      const mb = JSON.stringify(b.actions.map(x => MEANING.map(k => fieldOf(x, k)))), ma = JSON.stringify(a.actions.map(x => MEANING.map(k => fieldOf(x, k))));
      const sb = JSON.stringify(b.actions.map(x => STRUCT.map(k => fieldOf(x, k)))), sa = JSON.stringify(a.actions.map(x => STRUCT.map(k => fieldOf(x, k))));
      if (mb !== ma || sb !== sa) changes.push({ file: f, id: c.id, text, meaning: mb !== ma, before: b.actions.map(x => `${show(x, MEANING)} | ${show(x, STRUCT)}`), after: a.actions.map(x => `${show(x, MEANING)} | ${show(x, STRUCT)}`) });
    }
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'v35-shadow.json'), JSON.stringify({ total, changes }, null, 1));
  console.log(`\n## Shadow 4.10 vs V3.5 — ${total} kalimat unik dari ${files.length} fixture\n\nBerubah: ${changes.length} · arti keuangan berubah: ${changes.filter(c => c.meaning).length}\n`);
  for (const c of changes) console.log(`${c.meaning ? '‼' : '·'} ${c.file.replace(/^fixtures-|\.mjs$/g, '')}/${c.id} “${c.text}”\n    4.10: ${c.before.join(' || ')}\n    V3.5: ${c.after.join(' || ')}`);
  process.exit(0);
}

const SET = process.env.SET ?? 'v35dev';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const rows = [], ms = { before: [], after: [] };
for (const c of cases) {
  let t = performance.now(); const b = await before.parseQuickPlanV3(c.text, ctx); ms.before.push(performance.now() - t);
  t = performance.now(); const a = await after.parseQuickPlanV3(c.text, ctx); ms.after.push(performance.now() - t);
  const jb = judge(b, c.expect), ja = judge(a, c.expect);
  const meaningMoved = JSON.stringify(b.actions.map(x => MEANING.map(k => fieldOf(x, k)))) !== JSON.stringify(a.actions.map(x => MEANING.map(k => fieldOf(x, k))));
  rows.push({ id: c.id, group: c.group || '', text: c.text, before: !jb.errs.length, after: !ja.errs.length, jb, ja, meaningMoved, trace: a.trace.filter(l => /V3\.5/.test(l)) });
}
const n = rows.length, count = f => rows.filter(f).length, pct = (x, y = n) => y ? `${Math.round(x / y * 100)}%` : '–';
const fieldRate = (side, k) => { const l = rows.flatMap(r => r[side].fields[k] || []); return l.length ? `${l.filter(Boolean).length}/${l.length}` : '–'; };
const avg = l => l.reduce((s, x) => s + x, 0) / (l.length || 1), p95 = l => [...l].sort((x, y) => x - y)[Math.floor(l.length * 0.95)] || 0;
const summary = {
  set: SET, cases: n,
  exact: { before: count(r => r.before), after: count(r => r.after) },
  segmentation: { before: count(r => r.jb.segOk), after: count(r => r.ja.segOk) },
  fields: Object.fromEntries(FIELDS.map(k => [k, { before: fieldRate('jb', k), after: fieldRate('ja', k) }]).filter(([, v]) => v.after !== '–')),
  confidentWrong: { before: count(r => r.jb.confidentWrong), after: count(r => r.ja.confidentWrong) },
  regressions: rows.filter(r => r.before && !r.after).map(r => r.id),
  rescues: rows.filter(r => !r.before && r.after).map(r => r.id),
  latencyMs: { before: { avg: +avg(ms.before).toFixed(1), p95: +p95(ms.before).toFixed(1) }, after: { avg: +avg(ms.after).toFixed(1), p95: +p95(ms.after).toFixed(1) } },
};
mkdirSync(out, { recursive: true });
const dump = { summary, rows: rows.map(({ jb, ja, ...r }) => ({ ...r, errors: { before: jb.errs, after: ja.errs } })) };
writeFileSync(resolve(out, `v35-${SET}.json`), JSON.stringify(dump, null, 1));
if (process.argv.includes('--first')) {
  const first = resolve(here, 'heldout-first', `v35-heldout-first.json`);
  if (existsSync(first)) console.log('(run pertama sudah dibekukan; tidak ditimpa)');
  else { mkdirSync(dirname(first), { recursive: true }); writeFileSync(first, JSON.stringify(dump, null, 1)); console.log(`(run pertama dibekukan: ${first})`); }
}
console.log(`\n## V3.5 — ${SET} (${n} kalimat, tanpa Kamus Pribadi)\n\n| | 4.10 | V3.5 |\n|---|---|---|`);
console.log(`| Benar seluruhnya | ${summary.exact.before}/${n} (${pct(summary.exact.before)}) | ${summary.exact.after}/${n} (${pct(summary.exact.after)}) |`);
console.log(`| Pemisahan entri benar | ${summary.segmentation.before}/${n} | ${summary.segmentation.after}/${n} |`);
for (const [k, v] of Object.entries(summary.fields)) console.log(`| · ${k} | ${v.before} | ${v.after} |`);
console.log(`| **Yakin tapi salah** | ${summary.confidentWrong.before} | ${summary.confidentWrong.after} |`);
console.log(`| Rata-rata / P95 (ms) | ${summary.latencyMs.before.avg} / ${summary.latencyMs.before.p95} | ${summary.latencyMs.after.avg} / ${summary.latencyMs.after.p95} |`);
console.log(`\nRegresi vs 4.10: ${summary.regressions.length} (${summary.regressions.join(', ') || '–'})`);
console.log(`Diperbaiki: ${summary.rescues.length} (${summary.rescues.join(', ') || '–'})`);
console.log(`Arti keuangan berubah vs 4.10: ${count(r => r.meaningMoved)} (${rows.filter(r => r.meaningMoved).map(r => r.id).join(', ') || '–'})`);
if (process.argv.includes('--fails')) for (const r of rows.filter(r => !r.after)) console.log(`\n✗ ${r.id} “${r.text}”\n   ${r.ja.errs.join('; ')}\n   ${r.trace.join(' | ')}`);
