/**
 * Catat otomatis V4 — math, sharing with people, one purchase for several purposes: 7.4 (frozen in
 * bench/quick/baseline-v74) vs now, cold (no Kamus Pribadi), on the real default taxonomy (fixtures-v68state.mjs).
 *
 *   SET=v4dev node bench/quick/run-v4.mjs [--fails]        A development set (used while building V4)
 *   SET=v4heldout node bench/quick/run-v4.mjs [--first]    B held-out, written before the engine changed (--first freezes the first run, once)
 *   node bench/quick/run-v4.mjs --shadow                   every sentence of every older fixture: what changed vs 7.4
 *
 * "Yakin tapi salah": a wrong field on an action the preview did not mark for review.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out'), root = resolve(here, '../..');
const { ctx } = await import('./fixtures-v68state.mjs');
const before = await import(pathToFileURL(resolve(here, 'baseline-v74/catat/v3.ts')).href);
const after = await import(pathToFileURL(resolve(root, 'lib/catat/v3.ts')).href);
const SET = process.env.SET ?? 'v4dev';

if (process.argv.includes('--shadow')) {
  // Older sets on their own state (V3.5 state before 6.8), meaning and structure of every action.
  const v35 = (await import('./fixtures-v35state.mjs')).ctx, v68 = ctx;
  const files = readdirSync(here).filter(f => /^fixtures-.*\.mjs$/.test(f) && !/state/.test(f) && !/^fixtures-v4/.test(f) && !/^fixtures-v78/.test(f));
  const show = a => { const r = a.result, p = r.preset; return [r.kind, r.amount || 0, p.walletId || '∅', p.destinationWalletId || '∅', r.date, String(r.person || '').toLowerCase() || '∅', p.subcategoryId || p.categoryId || '∅', String(p.description || '').toLowerCase(), r.split?.strong ? `split:${r.split.participants.length}` : '', (p.splits || []).length ? `lines:${p.splits.length}` : ''].join(' · '); };
  const money = a => { const r = a.result, p = r.preset; return [r.kind, r.amount || 0, p.walletId || '', p.destinationWalletId || '', r.date, String(r.person || '').toLowerCase(), Boolean(r.split?.strong), (p.splits || []).length].join('|'); };
  const seen = new Set(), changes = [];
  let total = 0;
  for (const f of files) {
    const mod = await import(`./${f}`), local = /^fixtures-v6[89]|^fixtures-v610/.test(f) ? v68 : v35;
    for (const c of mod.cases || mod.default || []) {
      const text = c.text || c.input; if (!text || seen.has(text)) continue; seen.add(text); total++;
      const b = await before.parseQuickPlanV3(text, local), a = await after.parseQuickPlanV3(text, local);
      const mb = b.actions.map(money).join(' || '), ma = a.actions.map(money).join(' || ');
      const sb = b.actions.map(show).join(' || '), sa = a.actions.map(show).join(' || ');
      if (mb !== ma || sb !== sa) changes.push({ file: f, id: c.id, text, meaning: mb !== ma, before: sb, after: sa });
    }
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'v4-shadow.json'), JSON.stringify({ total, changes }, null, 1));
  console.log(`\n## Shadow 7.4 vs V4 — ${total} kalimat unik dari ${files.length} fixture\n\nBerubah: ${changes.length} · arti keuangan berubah: ${changes.filter(c => c.meaning).length}\n`);
  for (const c of changes) console.log(`${c.meaning ? '‼' : '·'} ${c.file.replace(/^fixtures-|\.mjs$/g, '')}/${c.id} “${c.text}”\n    7.4: ${c.before}\n    V4:  ${c.after}`);
  process.exit(0);
}
const { cases } = await import(`./fixtures-${SET}.mjs`);
const low = s => String(s ?? '').toLocaleLowerCase('id-ID').trim();
const parentOf = id => ctx.categories.find(c => c.id === id)?.parentId;
const catOk = (got, want) => got === want || parentOf(got) === want;

const fieldOf = (a, k) => {
  const r = a.result, p = r.preset, sp = r.split?.strong ? r.split : null;
  switch (k) {
    case 'kind': return r.kind; case 'amount': return r.amount || null; case 'to': return p.destinationWalletId || '';
    case 'date': return r.date; case 'cat': return p.subcategoryId || p.categoryId || '';
    case 'split': return Boolean(sp);
    case 'share': return sp ? sp.shares[sp.participants.find(x => x.isMe)?.id] ?? null : null;
    case 'people': return sp ? sp.participants.filter(x => !x.isMe).map(x => low(x.name)).join(' | ') : '';
    case 'payer': return sp ? low(sp.participants.find(x => x.id === sp.payerId)?.name || (sp.payerId && sp.payerId !== 'me' ? sp.payerId : '')) : '';
    case 'lines': return (p.splits || []).map(l => [l.subcategoryId || l.categoryId, l.amount]);
  }
};
const FIELDS = ['kind', 'amount', 'cat', 'to', 'date', 'split', 'share', 'people', 'payer', 'lines'];

function judge(plan, exp) {
  const errs = [], fields = {}, acts = plan.actions;
  let confidentWrong = false;
  const check = (a, e, label = '') => {
    if (!a) { errs.push(`${label}aksi tidak ada`); return; }
    let wrong = false;
    const ex = { kind: 'expense', ...e };
    for (const [k, v] of Object.entries(ex)) {
      if (k === 'actions') continue;
      const got = fieldOf(a, k);
      let ok;
      if (k === 'cat') ok = catOk(got, v);
      else if (k === 'people') ok = got === v.map(low).join(' | ');
      else if (k === 'lines') ok = got.length === v.length && v.every(([c, n], i) => catOk(got[i][0], c) && got[i][1] === n);
      else ok = got === v;
      fields[k] = [...(fields[k] || []), ok];
      if (!ok) { errs.push(`${label}${k}: ${JSON.stringify(got) || '∅'} ≠ ${JSON.stringify(v)}`); wrong = true; }
    }
    if (wrong && !a.review) confidentWrong = true;
  };
  const n = exp.actions ? exp.actions.length : 1;
  const segOk = acts.length === n;
  if (!segOk) errs.push(`aksi ${acts.length} ≠ ${n}`);
  if (exp.actions) exp.actions.forEach((e, i) => check(acts[i], e, `#${i + 1} `)); else check(acts[0], exp);
  return { errs, fields, segOk, confidentWrong };
}

async function run(engine) {
  const rows = [];
  for (const c of cases) {
    const t0 = performance.now();
    const plan = await engine.parseQuickPlanV3(c.text, ctx);
    const ms = performance.now() - t0;
    rows.push({ ...c, ...judge(plan, c.expect), ms });
  }
  return rows;
}
const pct = (a, b) => b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–';
function summary(rows) {
  const s = { ok: rows.filter(r => !r.errs.length).length, n: rows.length, seg: rows.filter(r => r.segOk).length, cw: rows.filter(r => r.confidentWrong).length, fields: {}, groups: {} };
  for (const k of FIELDS) { const all = rows.flatMap(r => r.fields[k] || []); s.fields[k] = [all.filter(Boolean).length, all.length]; }
  for (const r of rows) { const g = s.groups[r.group] ||= [0, 0]; g[1]++; if (!r.errs.length) g[0]++; }
  const ms = rows.map(r => r.ms).sort((a, b) => a - b); s.p95 = ms[Math.floor(ms.length * .95)] || 0; s.avg = ms.reduce((n, v) => n + v, 0) / (ms.length || 1);
  return s;
}

const A = await run(before), B = await run(after), sa = summary(A), sb = summary(B);
const lines = [`## Catat otomatis V4 — ${SET} (${cases.length} kalimat)`, '', '| | 7.4 | V4 |', '|---|---|---|',
  `| Benar seluruhnya | ${pct(sa.ok, sa.n)} | ${pct(sb.ok, sb.n)} |`, `| Jumlah aksi | ${pct(sa.seg, sa.n)} | ${pct(sb.seg, sb.n)} |`,
  ...Object.keys(sa.groups).map(g => `| · ${g} | ${pct(...sa.groups[g])} | ${pct(...sb.groups[g])} |`),
  ...FIELDS.filter(k => sa.fields[k][1]).map(k => `| · ${k} | ${pct(...sa.fields[k])} | ${pct(...sb.fields[k])} |`),
  `| **Yakin tapi salah** | ${sa.cw} | ${sb.cw} |`, `| Rata-rata / P95 (ms) | ${sa.avg.toFixed(1)} / ${sa.p95.toFixed(1)} | ${sb.avg.toFixed(1)} / ${sb.p95.toFixed(1)} |`];
const regress = B.filter((r, i) => r.errs.length && !A[i].errs.length).map(r => r.id);
lines.push('', `Regresi vs 7.4: ${regress.length} (${regress.join(', ') || '–'})`, `Diperbaiki: ${B.filter((r, i) => !r.errs.length && A[i].errs.length).length}`);
console.log(lines.join('\n'));
if (process.argv.includes('--fails')) for (const r of B.filter(r => r.errs.length)) console.log(`· ${r.id} “${r.text}”\n    ${r.errs.join('\n    ')}${r.confidentWrong ? '  [yakin]' : ''}`);
if (process.argv.includes('--first')) {
  mkdirSync(out, { recursive: true });
  const file = resolve(here, `FROZEN-${SET}-first.json`);
  if (existsSync(file)) console.log(`\n${file} sudah ada: hasil pertama tidak ditimpa.`);
  else { writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), summary7_4: sa, summaryV4: sb, rows: B.map(({ id, errs, confidentWrong }) => ({ id, errs, confidentWrong })) }, null, 1)); console.log(`\nDibekukan: ${file}`); }
}
