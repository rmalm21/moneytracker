/**
 * Catat otomatis V3.4 benchmark: cold V3.3 (frozen), cold V3.4 (no Kamus Pribadi, no session) and warm V3.4.
 *
 *   SET=v34dev node bench/quick/run-v34.mjs [--fails]
 *   SET=v34heldout node bench/quick/run-v34.mjs
 * Results: bench/quick/out/v34-<SET>.json. Each case loads only aliases (and a session), never a sentence → answer.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SET = process.env.SET ?? 'v34dev';
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out'), root = resolve(here, '../..');
const { cases } = await import(`./fixtures-${SET}.mjs`);
const { ctx: state } = await import('./fixtures-v33state.mjs');
const v33 = await import(pathToFileURL(resolve(here, 'baseline-v33/catat/v3.ts')).href);
const v34 = await import(pathToFileURL(resolve(root, 'lib/catat/v3.ts')).href);
const P = await import(pathToFileURL(resolve(root, 'lib/catat/personal.ts')).href);
const showFails = process.argv.includes('--fails');
/** Aliases a set lists that the general language layer already knows ("mkn", "jjn"): not loaded as personal memory. */
const skippedGeneral = [];

function contextOf(c) {
  let ctx = { ...state };
  const x = c.ctx || {};
  if (x.receivables) ctx.receivables = [...state.receivables, ...x.receivables];
  if (x.raRemaining !== undefined) ctx.receivables = ctx.receivables.map(r => r.id === 'ra' ? { ...r, remainingAmount: x.raRemaining } : r);
  if (x.history === 'cotti-jago') ctx.history = [...state.history, ...Array.from({ length: 6 }, (_, i) => ({ type: 'expense', description: 'Kopi', merchant: 'Cotti Coffee', categoryId: 'food', subcategoryId: 'drink', date: `2026-10-0${i + 1}`, walletId: 'jago' }))];
  if (x.wallets) ctx.wallets = x.wallets;
  return ctx;
}
function lexiconOf(c, ctx) {
  let lex = { on: !c.off, aliases: {} };
  for (const [rawWord, label, type, targetId] of c.lex || []) { const r = P.teach({ ...lex, aliases: {} }, rawWord, label, type, targetId, ctx, 0); if (r.problem && /sudah dikenali/.test(r.problem)) { skippedGeneral.push(`${c.id}:${rawWord}`); continue; } if (r.problem) throw Error(`${c.id}: ${rawWord}: ${r.problem}`); lex = P.applyChanges(lex, Object.fromEntries(Object.entries(r.changes).filter(([, a]) => a && a.status !== 'disabled'))); }
  for (const a of c.lexRaw || []) lex.aliases[a.id] = a;
  return lex;
}
const fieldOf = (a, k) => {
  const r = a.result, p = r.preset;
  return { kind: r.kind, amount: r.amount || null, description: p.description || '', merchant: p.merchant || '', person: r.person || '', wallet: p.walletId || '', to: p.destinationWalletId || '', date: r.date, time: p.time || '', link: p.receivableId || p.debtId || p.claimId || r.operation?.target?.id || '', target: r.operation?.target?.id || '' }[k];
};
function judge(plan, exp, cold) {
  const errs = [];
  const acts = plan.actions;
  const check = (a, e, label = '') => {
    if (!a) { errs.push(`${label}aksi tidak ada`); return; }
    for (const [k, v] of Object.entries(e)) {
      if (['same', 'ask', 'actions'].includes(k)) continue;
      if (k.startsWith('not')) { const f = k.slice(3).toLowerCase(); if (fieldOf(a, f) === v) errs.push(`${label}${f} tidak boleh ${v}`); continue; }
      const got = fieldOf(a, k);
      if (v === null ? Boolean(got) : got !== v) errs.push(`${label}${k}: ${got} ≠ ${v}`);
    }
  };
  if (exp.actions) { if (acts.length !== exp.actions.length) errs.push(`aksi ${acts.length} ≠ ${exp.actions.length}`); exp.actions.forEach((e, i) => check(acts[i], e, `#${i + 1} `)); }
  else if (exp.amount === null && !acts.length) { /* nothing created: right */ }
  else { if (acts.length !== 1 && !exp.ask) errs.push(`aksi ${acts.length} ≠ 1`); check(acts[0], exp); }
  if (exp.ask && !(plan.personal?.asks?.length)) errs.push('tidak bertanya');
  if (exp.same && cold) for (const k of exp.same) { const a = acts[0], b = cold.actions[0]; if (a && b && fieldOf(a, k) !== fieldOf(b, k)) errs.push(`${k} berubah dari bacaan umum: ${fieldOf(b, k)} → ${fieldOf(a, k)}`); }
  return errs;
}
const clarifications = plan => (plan.personal?.asks?.length || 0) + plan.actions.reduce((n, a) => n + Object.values(a.fields || {}).filter(f => f.status === 'missing' || f.status === 'check').length, 0);

const rows = [], ms = { v33: [], cold: [], warm: [] };
for (const c of cases) {
  const ctx = contextOf(c), lex = lexiconOf(c, ctx);
  const choose = c.choose ? Object.fromEntries(Object.entries(c.choose).map(([k, label]) => [k, Object.values(lex.aliases).find(a => a.key === k && a.label === label)?.id || label])) : undefined;
  const personal = { lexicon: lex, ...(c.session ? { session: { people: [], txIds: [], ageMs: 60_000, ...c.session } } : {}), ...(choose ? { choose } : {}) };
  let t = performance.now(); const a = await v33.parseQuickPlanV3(c.text, ctx); ms.v33.push(performance.now() - t);
  t = performance.now(); const b = await v34.parseQuickPlanV3(c.text, ctx); ms.cold.push(performance.now() - t);
  t = performance.now(); const w = await v34.parseQuickPlanV3(c.text, ctx, 'auto', personal); ms.warm.push(performance.now() - t);
  const ea = judge(a, c.expect, b), eb = judge(b, c.expect, b), ew = judge(w, c.expect, b);
  const used = w.personal?.used?.length || 0;
  rows.push({ id: c.id, group: c.group, text: c.text, v33: !ea.length, cold: !eb.length, warm: !ew.length, used, asks: w.personal?.asks?.length || 0, rejected: (w.personal?.rejected || []).map(r => r.code), clar: { v33: clarifications(a), warm: clarifications(w) }, errors: { v33: ea, cold: eb, warm: ew } });
}
const n = rows.length, count = f => rows.filter(f).length, pct = (a, b = n) => b ? `${Math.round(a / b * 100)}%` : '–';
const groups = [...new Set(rows.map(r => r.group))];
const p95 = list => [...list].sort((x, y) => x - y)[Math.floor(list.length * 0.95)] || 0, avg = list => list.reduce((s, x) => s + x, 0) / (list.length || 1);
const summary = {
  set: SET, cases: n,
  exact: { v33: count(r => r.v33), cold: count(r => r.cold), warm: count(r => r.warm) },
  byGroup: Object.fromEntries(groups.map(g => [g, { n: count(r => r.group === g), v33: count(r => r.group === g && r.v33), cold: count(r => r.group === g && r.cold), warm: count(r => r.group === g && r.warm) }])),
  rescues: rows.filter(r => !r.v33 && r.warm).map(r => r.id),
  regressions: rows.filter(r => r.v33 && !r.warm).map(r => r.id),
  coldRegressions: rows.filter(r => r.v33 && !r.cold).map(r => r.id),
  falseAlias: rows.filter(r => ['control'].includes(r.group) && r.used).map(r => r.id),
  confidentWrongPersonal: rows.filter(r => !r.warm && r.used && !r.asks).map(r => r.id),
  generalNotPersonal: skippedGeneral,
  personalRejectedByBugCatcher: rows.filter(r => r.rejected.length).map(r => `${r.id}:${r.rejected.join('+')}`),
  clarifications: { v33: rows.reduce((s, r) => s + r.clar.v33, 0), warm: rows.reduce((s, r) => s + r.clar.warm, 0) },
  latencyMs: { v33: { avg: +avg(ms.v33).toFixed(1), p95: +p95(ms.v33).toFixed(1) }, cold: { avg: +avg(ms.cold).toFixed(1), p95: +p95(ms.cold).toFixed(1) }, warm: { avg: +avg(ms.warm).toFixed(1), p95: +p95(ms.warm).toFixed(1) } },
};
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `v34-${SET}.json`), JSON.stringify({ summary, rows }, null, 1));
console.log(`\n## Catat otomatis V3.4 — ${SET} (${n} kalimat)\n`);
console.log('| | V3.3 cold | V3.4 cold | V3.4 warm |\n|---|---|---|---|');
console.log(`| Benar seluruhnya | ${summary.exact.v33}/${n} (${pct(summary.exact.v33)}) | ${summary.exact.cold}/${n} (${pct(summary.exact.cold)}) | ${summary.exact.warm}/${n} (${pct(summary.exact.warm)}) |`);
for (const g of groups) { const x = summary.byGroup[g]; console.log(`| · ${g} | ${x.v33}/${x.n} | ${x.cold}/${x.n} | ${x.warm}/${x.n} |`); }
console.log(`| Pertanyaan + kolom perlu dicek | ${summary.clarifications.v33} | – | ${summary.clarifications.warm} |`);
console.log(`| Rata-rata / P95 (ms) | ${summary.latencyMs.v33.avg} / ${summary.latencyMs.v33.p95} | ${summary.latencyMs.cold.avg} / ${summary.latencyMs.cold.p95} | ${summary.latencyMs.warm.avg} / ${summary.latencyMs.warm.p95} |`);
console.log(`\nDiselamatkan personalisasi: ${summary.rescues.length} (${summary.rescues.join(', ') || '–'})`);
console.log(`Regresi karena personalisasi: ${summary.regressions.length} (${summary.regressions.join(', ') || '–'})`);
console.log(`Regresi cold V3.4 vs V3.3: ${summary.coldRegressions.length} (${summary.coldRegressions.join(', ') || '–'})`);
console.log(`Alias salah pasang di kalimat kontrol: ${summary.falseAlias.length} · Salah yakin karena memori: ${summary.confidentWrongPersonal.length} (${summary.confidentWrongPersonal.join(', ') || '–'})`);
console.log(`Alias yang sudah dikenali umum (tidak dimuat): ${skippedGeneral.join(', ') || '–'}`);
console.log(`Ditolak Bug Catcher personal: ${summary.personalRejectedByBugCatcher.join(', ') || '–'}`);
if (showFails) for (const r of rows.filter(r => !r.warm)) console.log(`\n✗ ${r.id} “${r.text}”\n   warm: ${r.errors.warm.join('; ')}`);
