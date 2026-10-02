/**
 * Catat otomatis V3 benchmark: the V2.5 measures plus entities (description, merchant, person, boundaries) and the
 * engine modes of the V3 report.
 *
 *   SET=v30dev node bench/quick/run-v30.mjs v25 [--fails]   V2.5 as frozen in bench/quick/baseline-v25 (mode A)
 *   SET=v30dev node bench/quick/run-v30.mjs grammar          V3 Financial Grammar only, synchronous (mode B)
 *   SET=v30dev node bench/quick/run-v30.mjs nlp              NLP.js evidence alone: intent and entity quality (mode C)
 *   SET=v30dev node bench/quick/run-v30.mjs v3               V3 combined: grammar + NLP.js + consensus + Bug Catcher (mode D)
 *   SET=v30dev node bench/quick/run-v30.mjs --compare v25 v3
 * SET picks fixtures-<SET>.mjs (v30dev, v30heldout); also works on the older sets (v25, holdout25, '' = original).
 * Results: bench/quick/out/v30-<SET>-<label>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SET = process.env.SET ?? 'v30dev';
const { cases, ctx } = await import(SET ? `./fixtures-${SET}.mjs` : './fixtures.mjs');
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out'), root = resolve(here, '../..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [label] = args;
// v30 = Catat otomatis V3.0 as frozen in bench/quick/baseline-v30 (for the V3.1 comparison).
const file = l => resolve(out, `v30-${SET || 'orig'}-${l}.json`);

export const FIELDS = ['kind', 'amount', 'date', 'time', 'wallet', 'to', 'link', 'category', 'person', 'description', 'merchant', 'purpose', 'subject'];
const ENTITY = new Set(['person', 'description', 'merchant', 'purpose']);
const LOAN = new Set(['debt_new', 'receivable_new', 'debt_payment', 'receivable_payment']);
const side = k => k?.startsWith('debt') ? 'debt' : k?.startsWith('receivable') ? 'receivable' : '';
/** V3.2: debtor and creditor from the user's side ('user' or the other person). */
const roles = x => side(x.kind) === 'debt' ? [ 'user', norm(x.person) ] : [ norm(x.person), 'user' ];
const empty = v => v === undefined || v === null || v === '';
const norm = v => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const same = (f, t, g) => t === null ? empty(g) : ['person', 'description', 'merchant', 'purpose', 'subject'].includes(f) ? norm(t) === norm(g) : g === t;

function align(truth, pred) {
  const used = new Set(), pairs = [];
  const pick = test => { const i = pred.findIndex((p, j) => !used.has(j) && test(p, j)); if (i >= 0) used.add(i); return i; };
  truth.forEach((t, i) => {
    let j = pick(p => p.kind === t.kind && (t.amount === undefined || p.amount === t.amount));
    if (j < 0) j = pick(p => p.kind === t.kind);
    if (j < 0) j = pick((_, k) => k === i);
    pairs.push([t, j >= 0 ? pred[j] : null]);
  });
  return { pairs, extra: pred.filter((_, j) => !used.has(j)) };
}

function scoreCase(c, pred) {
  const { pairs, extra } = align(c.actions, pred);
  const fields = {}, review = { need: 0, flagged: 0 };
  const rel = { n: 0, debtor: 0, creditor: 0, direction: 0, repayN: 0, repay: 0, exact: 0, wrong: 0, multiN: 0, dateOk: 0, personN: 0, personOk: 0 };
  let wrongTime = 0, wrongDate = 0, wrongAction = 0, wrongEntity = 0, wrongRelation = 0, exact = pred.length === c.actions.length, unneeded = 0, askOk = 0, askNeed = 0;
  for (const [t, p] of pairs) {
    if (!p) { exact = false; continue; }
    let wrong = false, entity = false, relation = false, wTime = false, wDate = false;
    for (const f of FIELDS) {
      if (!(f in t)) continue;
      const ok = same(f, t[f], p[f]);
      (fields[f] ||= { ok: 0, n: 0 }).n++; if (ok) fields[f].ok++;
      if (!ok) {
        exact = false;
        const flagged = p.flagged.has(f) || (f === 'description' || f === 'merchant') && p.flagged.has('name');
        if (f !== 'category' && !flagged) { if (f === 'time') wTime = true; if (f === 'date') wDate = true; if (ENTITY.has(f)) entity = true; else if (f !== 'time') wrong = true; if (['to', 'link', 'person', 'wallet'].includes(f)) relation = true; }
      }
    }
    for (const f of t.review || []) { review.need++; if (p.flagged.has(f)) review.flagged++; else exact = false; }
    for (const f of p.flagged) if (f !== 'category' && !(t.review || []).includes(f) && f in t && same(f, t[f], p[f]) && t[f] !== null) unneeded++;
    if (t.ask) { askNeed++; if (p.ask === t.ask) askOk++; else exact = false; }
    if (LOAN.has(t.kind)) {
      const [td, tc] = roles(t), [pd, pc] = LOAN.has(p.kind) ? roles(p) : ['?', '?'], personKnown = 'person' in t;
      rel.n++; if (!personKnown || td === pd) rel.debtor++; if (!personKnown || tc === pc) rel.creditor++;
      const dirOk = side(t.kind) === side(p.kind); if (dirOk) rel.direction++;
      if (t.kind.endsWith('_payment')) { rel.repayN++; if (p.kind === t.kind) rel.repay++; }
      const ok = p.kind === t.kind && (!personKnown || same('person', t.person, p.person)) && (!('purpose' in t) || same('purpose', t.purpose, p.purpose));
      if (ok) rel.exact++;
      if (!ok && p.confident && !(p.kind === t.kind && p.flagged.has('person'))) rel.wrong++;
    }
    if (c.actions.length > 1) { rel.multiN++; if (!('date' in t) || same('date', t.date, p.date)) rel.dateOk++; if ('person' in t) { rel.personN++; if (same('person', t.person, p.person)) rel.personOk++; } }
    if (wTime && !p.flagged.has('time')) wrongTime++; if (wDate && !p.flagged.has('date')) wrongDate++;
    if (p.confident) { if (wrong) wrongAction++; if (entity) wrongEntity++; if (relation) wrongRelation++; }
  }
  wrongAction += extra.filter(p => p.confident).length;
  const dupMoney = pred.filter((p, i) => p.amount && pred.findIndex(q => q.amount === p.amount) !== i).length - c.actions.filter((t, i) => t.amount && c.actions.findIndex(q => q.amount === t.amount) !== i).length;
  const segWrong = pred.length !== c.actions.length && pred.length > 0 && pred.every(p => p.confident) ? 1 : 0;
  rel.missedLoan = c.actions.filter(t => LOAN.has(t.kind)).length && !pred.length ? 1 : 0;
  return { id: c.id, tags: c.tags, rel, segWrong, count: pred.length === c.actions.length, exact, fields, review, extra: extra.length, missed: pairs.filter(([, p]) => !p).length, wrongTime, wrongDate, wrongAction, wrongEntity, wrongRelation, unneeded, askOk, askNeed, dupMoney: Math.max(0, dupMoney) };
}

const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '–';
function summarize(rows) {
  const s = { exact: 0, count: 0, extra: 0, missed: 0, wrongTime: 0, wrongDate: 0, wrongAction: 0, wrongEntity: 0, wrongRelation: 0, unneeded: 0, askOk: 0, askNeed: 0, dupMoney: 0, review: { need: 0, flagged: 0 }, fields: {} };
  for (const r of rows) {
    if (r.exact) s.exact++; if (r.count) s.count++;
    for (const k of ['extra', 'missed', 'wrongTime', 'wrongDate', 'wrongAction', 'wrongEntity', 'wrongRelation', 'unneeded', 'askOk', 'askNeed', 'dupMoney']) s[k] += r[k] || 0;
    s.review.need += r.review.need; s.review.flagged += r.review.flagged;
    for (const [f, v] of Object.entries(r.fields)) { const x = (s.fields[f] ||= { ok: 0, n: 0 }); x.ok += v.ok; x.n += v.n; }
  }
  const R = { n: 0, debtor: 0, creditor: 0, direction: 0, repayN: 0, repay: 0, exact: 0, wrong: 0, multiN: 0, dateOk: 0, personN: 0, personOk: 0 }; let segWrong = 0;
  for (const r of rows) { for (const k of Object.keys(R)) R[k] += r.rel?.[k] || 0; segWrong += r.segWrong || 0; }
  const tag = t => rows.filter(r => r.tags.includes(t)), exactOf = list => pct(list.filter(r => r.exact).length, list.length);
  return {
    'Kalimat benar seluruhnya': pct(s.exact, rows.length),
    'Jumlah aksi benar': pct(s.count, rows.length),
    ...Object.fromEntries(FIELDS.filter(f => s.fields[f]).map(f => [`Tepat: ${f}`, `${pct(s.fields[f].ok, s.fields[f].n)} (${s.fields[f].ok}/${s.fields[f].n})`])),
    'Batas entitas tepat (kalimat bertanda boundary)': exactOf(tag('boundary')),
    'To/from tepat (kalimat bertanda to/from)': exactOf(rows.filter(r => r.tags.includes('to') || r.tags.includes('from'))),
    'Koreksi tepat': exactOf(tag('correction')),
    'Rujukan tepat': exactOf(tag('coref')),
    'Pemisahan tepat': pct(tag('segmentation').filter(r => r.count).length, tag('segmentation').length),
    'Aksi palsu / terlewat': `${s.extra} / ${s.missed}`,
    'Keraguan ditandai': pct(s.review.flagged, s.review.need),
    'Aksi salah tapi yakin': s.wrongAction,
    'Entitas salah tapi yakin': s.wrongEntity,
    'Relasi salah tapi yakin': s.wrongRelation,
    'Jam salah tapi yakin': s.wrongTime,
    'Tanggal salah tapi yakin': s.wrongDate,
    ...Object.fromEntries(['ampm', 'half', 'lewat', 'daypart', 'format', 'words', 'date', 'absolute', 'money', 'future', 'midnight', 'context'].filter(t => tag(t).length).map(t => [`Tepat [${t}]`, exactOf(tag(t))])),
    ...(R.n ? {
      'Debitur (yang berutang) tepat': pct(R.debtor, R.n), 'Kreditur (pemberi pinjaman) tepat': pct(R.creditor, R.n),
      'Arah dari sudut pandang kamu tepat': pct(R.direction, R.n), 'Arah pembayaran utang/piutang tepat': pct(R.repay, R.repayN),
      'Relasi tepat (jenis + orang + keperluan)': pct(R.exact, R.n), 'Relasi utang/piutang salah tapi yakin': R.wrong,
    } : {}),
    ...(tag('segmentation').length ? {
      'Batas aksi tepat (bertanda segmentation)': exactOf(tag('segmentation')), 'Jumlah aksi tanpa kata sambung tepat': pct(tag('implicit').filter(r => r.count).length, tag('implicit').length),
      'Tanggal per aksi tepat': pct(R.dateOk, R.multiN), 'Orang per aksi tepat': pct(R.personOk, R.personN), 'Segmentasi salah tapi yakin': segWrong,
    } : {}),
    ...Object.fromEntries(['relation', 'purpose', 'repayment', 'possession', 'third', 'pronoun', 'negation'].filter(t => tag(t).length).map(t => [`Tepat [${t}]`, exactOf(tag(t))])),
    'Pertanyaan tepat': pct(s.askOk, s.askNeed),
    'Tanya yang tidak perlu': s.unneeded,
    'Uang tercatat dobel': s.dupMoney,
  };
}

const linkOf = r => r.preset.debtId || r.preset.receivableId || r.preset.claimId || r.preset.fundId || r.wishId || undefined;
const categoryOf = r => r.budget ? r.budget.subcategoryIds[0] || r.budget.categoryId : r.preset.subcategoryId || r.preset.categoryId || undefined;
const toActions = plan => plan.actions.map(action => {
  const r = action.result, flagged = new Set(Object.entries(action.fields).filter(([, f]) => f.status === 'check' || f.status === 'missing').map(([k]) => k));
  return { kind: r.kind, amount: r.amount || undefined, date: r.preset.date || r.date, wallet: r.preset.walletId, to: r.preset.destinationWalletId, link: linkOf(r), category: categoryOf(r), time: r.preset.time || undefined, person: r.person || r.preset.counterparty || undefined, description: r.preset.description, merchant: r.preset.merchant, purpose: r.purpose, subject: action.relation ? (action.relation.subject.party === 'user' ? 'user' : action.relation.subject.party) : undefined, flagged, confident: !action.review, ask: action.ask?.field };
});

function table(summaries) {
  const labels = Object.keys(summaries), keys = [...new Set(labels.flatMap(l => Object.keys(summaries[l])))];
  return [['Ukuran', ...labels], ['---', ...labels.map(() => '---:')], ...keys.map(k => [k, ...labels.map(l => String(summaries[l][k] ?? '–'))])].map(r => `| ${r.join(' | ')} |`).join('\n');
}

if (label === '--compare' || process.argv.includes('--compare')) {
  const [a, b] = args, A = JSON.parse(readFileSync(file(a), 'utf8')), B = JSON.parse(readFileSync(file(b), 'utf8'));
  console.log(table({ [a]: A.summary, [b]: B.summary }));
  console.log(`\nWaktu per kalimat: ${a} ${A.ms} ms (P95 ${A.p95}) · ${b} ${B.ms} ms (P95 ${B.p95})\n`);
  for (const r of B.rows) { const o = A.rows.find(x => x.id === r.id); if (o && o.exact !== r.exact) console.log(`${r.exact ? '✓ fixed ' : '✗ broke '} ${r.id}  ${cases.find(c => c.id === r.id).text}`); }
  process.exit(0);
}

let run;
if (label === 'v25') { const mod = await import(pathToFileURL(resolve(here, 'baseline-v25/quick-plan.ts')).href); run = (t, c) => toActions(mod.parseQuickPlan(t, c)); }
else if (label === 'grammar') { const mod = await import(pathToFileURL(resolve(root, 'lib/quick-plan.ts')).href); run = (t, c) => toActions(mod.parseQuickPlan(t, c)); }
else if (label === 'v31') { const mod = await import(pathToFileURL(resolve(here, 'baseline-v31/catat/v3.ts')).href); run = async (t, c) => toActions(await mod.parseQuickPlanV3(t, c)); }
else if (label === 'v30') { const mod = await import(pathToFileURL(resolve(here, 'baseline-v30/catat/v3.ts')).href); run = async (t, c) => toActions(await mod.parseQuickPlanV3(t, c)); }
else if (label === 'v3') { const mod = await import(pathToFileURL(resolve(root, 'lib/catat/v3.ts')).href); run = async (t, c) => toActions(await mod.parseQuickPlanV3(t, c)); }
else if (label === 'nlp') { const mod = await import(pathToFileURL(resolve(root, 'lib/catat/nlp-engine.ts')).href); run = async (t, c) => mod.nlpOnlyActions(t, c); }
else { console.error('label: v25 | grammar | nlp | v3'); process.exit(1); }

const rows = [], detail = [], times = [];
for (const c of cases) {
  const context = { ...ctx, ...(c.ctx || {}) };
  if (label === 'v3' || label === 'v30' || label === 'nlp') await run(c.text, context); // warm the model once per case shape
  const t0 = performance.now(), pred = await run(c.text, context), ms1 = performance.now() - t0;
  times.push(ms1);
  const row = scoreCase(c, pred);
  rows.push(row);
  detail.push({ id: c.id, text: c.text, exact: row.exact, got: pred.map(p => ({ ...p, flagged: [...(p.flagged || [])] })), want: c.actions, ms: Number(ms1.toFixed(2)) });
}
const sorted = [...times].sort((x, y) => x - y), ms = Number((times.reduce((x, y) => x + y, 0) / times.length).toFixed(2)), p95 = Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2));
const summary = summarize(rows);
mkdirSync(out, { recursive: true });
writeFileSync(file(label), JSON.stringify({ summary, ms, p95, rows, detail }, null, 1));
console.log(table({ [label]: summary }));
console.log(`\n${cases.length} kalimat · ${ms} ms per kalimat · P95 ${p95} ms`);
if (process.argv.includes('--fails')) for (const d of detail.filter(d => !d.exact)) console.log(`\n✗ ${d.id} ${JSON.stringify(d.text)}\n  got  ${JSON.stringify(d.got.map(({ kind, amount, date, wallet, to, link, category, person, description, merchant, flagged, confident, ask }) => ({ kind, amount, date, wallet, to, link, category, person, description, merchant, flagged, confident, ask })))}\n  want ${JSON.stringify(d.want)}`);
