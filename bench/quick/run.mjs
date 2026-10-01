/**
 * Runs the Catat otomatis benchmark.
 *   node bench/quick/run.mjs v2                         the current engine (lib/quick-plan.ts)
 *   node bench/quick/run.mjs v1 path/to/quick-entry.ts  the first engine (parseQuickBatch / parseQuickText, as its preview used them)
 *   node bench/quick/run.mjs --compare v1 v2            side by side, plus the cases whose result changed
 * Results are written to bench/quick/out/<label>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// SET=v25 runs fixtures-v25.mjs (results out/v25-<label>.json); without it, the original set.
const SET = process.env.SET || '';
const { cases, ctx } = await import(SET ? `./fixtures-${SET}.mjs` : './fixtures.mjs');
import { scoreCase, summarize } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out');
const [label, impl] = process.argv.slice(2).filter(a => a !== '--fails');

const linkOf = r => r.preset.debtId || r.preset.receivableId || r.preset.claimId || r.preset.fundId || r.wishId || undefined;
const categoryOf = r => r.budget ? r.budget.subcategoryIds[0] || r.budget.categoryId : r.preset.subcategoryId || r.preset.categoryId || undefined;

/** The first engine, read the way its preview showed it: what it filled silently counts as filled. */
function v1Actions(mod, text, c) {
  const batch = mod.parseQuickBatch(text, c);
  const list = batch ? batch.map(b => b.result) : [mod.parseQuickText(text, c)].filter(Boolean);
  return list.map(r => {
    const flagged = new Set();
    // Its preview asked only for these; a transfer without a source wallet took the default wallet silently.
    if (r.kind === 'expense' && !r.preset.categoryId) flagged.add('category');
    if (r.kind === 'transfer' && (!r.preset.destinationWalletId || r.preset.destinationWalletId === r.preset.walletId)) flagged.add('to');
    if (['debt_payment', 'receivable_payment', 'claim_payment', 'target', 'wish'].includes(r.kind) && !linkOf(r)) flagged.add('link');
    if (r.kind === 'receivable_new' && !r.person) flagged.add('person');
    if (r.kind === 'balance' && !r.preset.walletId) flagged.add('wallet');
    if (r.kind === 'budget' && !r.budget?.categoryId) flagged.add('category');
    if ((r.kind === 'plan_new' || r.kind === 'recurring_new') && !r.amount) flagged.add('amount');
    const wallet = r.preset.walletId || (r.kind === 'transfer' ? 'DEFAULT' : undefined);
    return { kind: r.kind, amount: r.amount || undefined, date: r.preset.date || r.date, wallet, to: r.preset.destinationWalletId, link: linkOf(r), category: categoryOf(r), person: r.person, flagged, confident: flagged.size === 0 };
  });
}

/** The current engine: its action plan, with the fields it marks "Perlu dicek" or "Belum terbaca". */
function v2Actions(mod, text, c) {
  const plan = mod.parseQuickPlan(text, c);
  return plan.actions.map(action => {
    const r = action.result, flagged = new Set(Object.entries(action.fields).filter(([, f]) => f.status === 'check' || f.status === 'missing').map(([k]) => k));
    return { kind: r.kind, amount: r.amount || undefined, date: r.preset.date || r.date, wallet: r.preset.walletId, to: r.preset.destinationWalletId, link: linkOf(r), category: categoryOf(r), person: r.person, flagged, confident: !action.review, ask: action.ask?.field };
  });
}

function table(summaries) {
  const labels = Object.keys(summaries), keys = Object.keys(summaries[labels[0]]);
  const rows = [['Ukuran', ...labels], ['---', ...labels.map(() => '---:')], ...keys.map(k => [k, ...labels.map(l => String(summaries[l][k]))])];
  return rows.map(r => `| ${r.join(' | ')} |`).join('\n');
}

if (label === '--compare') {
  const [a, b] = process.argv.slice(3), load = l => JSON.parse(readFileSync(resolve(out, `${SET ? `${SET}-` : ''}${l}.json`), 'utf8'));
  const A = load(a), B = load(b);
  console.log('Set utama\n'); console.log(table({ [a]: A.summary, [b]: B.summary }));
  console.log('\nSet uji terpisah (tidak dipakai saat menyetel)\n'); console.log(table({ [a]: A.holdout, [b]: B.holdout }));
  console.log(`\nWaktu per kalimat: ${a} ${A.msPerSentence} ms · ${b} ${B.msPerSentence} ms\n`);
  for (const r of B.rows) { const o = A.rows.find(x => x.id === r.id); if (o && o.exact !== r.exact) console.log(`${r.exact ? '✓ fixed ' : '✗ broke '} ${r.id}  ${cases.find(c => c.id === r.id).text}`); }
  process.exit(0);
}

const mod = await import(pathToFileURL(resolve(impl || (label === 'v1' ? '' : 'lib/quick-plan.ts'))).href);
const adapter = typeof mod.parseQuickPlan === 'function' && label !== 'v1' ? v2Actions : v1Actions;
const rows = [], detail = [];
const started = performance.now();
for (const c of cases) {
  const context = { ...ctx, ...(c.ctx || {}) };
  const t0 = performance.now(), pred = adapter(mod, c.text, context), ms1 = performance.now() - t0;
  const row = scoreCase(c, pred);
  rows.push(row);
  detail.push({ id: c.id, text: c.text, exact: row.exact, got: pred.map(p => ({ ...p, flagged: [...p.flagged] })), want: c.actions, ms: Number(ms1.toFixed(2)) });
}
const ms = (performance.now() - started) / cases.length;
const summary = summarize(rows.filter(r => !r.tags.includes('holdout'))), holdout = summarize(rows.filter(r => r.tags.includes('holdout')));
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `${SET ? `${SET}-` : ''}${label}.json`), JSON.stringify({ summary, holdout, msPerSentence: Number(ms.toFixed(2)), rows, detail }, null, 1));
console.log(table({ [`${label} · set utama`]: summary, [`${label} · set uji terpisah`]: holdout }));
console.log(`\n${cases.length} kalimat · ${ms.toFixed(2)} ms per kalimat`);
/** Where a failed sentence went wrong first (spec: failure localization). */
function failureKind(d) {
  const tags = cases.find(c => c.id === d.id).tags;
  if (d.got.length !== d.want.length) return tags.includes('negation') ? 'NEGATION' : tags.includes('correction') ? 'CORRECTION' : tags.includes('dependency') ? 'RELATION' : 'SEGMENTATION';
  for (let i = 0; i < d.want.length; i++) {
    const w = d.want[i], g = d.got[i] || {};
    if (w.kind !== g.kind) return 'INTENT';
    if ('amount' in w && w.amount !== g.amount) return tags.includes('correction') ? 'CORRECTION' : 'AMOUNT';
    if ('date' in w && w.date !== g.date) return 'DATE';
    if (('wallet' in w && (w.wallet ?? undefined) !== g.wallet) || ('to' in w && (w.to ?? undefined) !== g.to)) return tags.some(t => ['coref', 'override', 'inheritance', 'boundary'].includes(t)) ? 'REFERENCE/CONTEXT' : 'ENTITY MATCH';
    if (('link' in w && (w.link ?? undefined) !== g.link) || ('person' in w && String(w.person).toLowerCase() !== String(g.person || '').toLowerCase())) return 'RELATION';
    if (w.ask && w.ask !== g.ask) return 'VALIDATION';
  }
  return 'VALIDATION';
}
if (process.argv.includes('--fails')) for (const d of detail.filter(d => !d.exact)) console.log(`\n✗ [${failureKind(d)}] ${d.id} ${JSON.stringify(d.text)}\n  got  ${JSON.stringify(d.got.map(({ kind, amount, date, wallet, to, link, category, person, flagged, confident }) => ({ kind, amount, date, wallet, to, link, category, person, flagged, confident })))}\n  want ${JSON.stringify(d.want)}`);
