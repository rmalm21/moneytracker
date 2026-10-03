/**
 * Catat otomatis V3.3 benchmark: state transitions, not only parser fields.
 *
 * Every case gives a starting financial state (fixtures-v33state.mjs, overridden per case), a sentence and the expected
 * change: wallet movements, remaining balances of receivables / debts / claims (existing ones by id, new ones by
 * person), records created / updated / deleted, plans, schedule changes, warnings and questions. The simulator below
 * applies the predicted actions to the state on its own (it does not use the engine's mutation plan), so V3.2 and V3.3
 * are measured the same way.
 *
 *   SET=v33dev node bench/quick/run-v33.mjs v33 [--fails]   V3.3 (lib/catat/v3.ts)
 *   SET=v33dev node bench/quick/run-v33.mjs v32             V3.2 as frozen in bench/quick/baseline-v32
 *   SET=v33dev node bench/quick/run-v33.mjs --compare v32 v33
 * Results: bench/quick/out/v33-<SET>-<label>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SET = process.env.SET ?? 'v33dev';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const { ctx: base } = await import('./fixtures-v33state.mjs');
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out'), root = resolve(here, '../..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [label] = args;
const file = l => resolve(out, `v33-${SET}-${l}.json`);
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '–';

const PAY = new Set(['receivable_payment', 'debt_payment', 'claim_payment']);
const opOf = a => { const r = a.result; if (r.operation?.type) return r.operation.type; return { transfer: 'TRANSFER', plan_new: 'SCHEDULE', recurring_new: 'RECUR', query: 'QUERY', tx_update: 'UPDATE', tx_delete: 'DELETE', recurring_change: 'RECUR' }[r.kind] || (PAY.has(r.kind) ? 'SETTLE?' : 'CREATE'); };
const opMatch = (want, got) => want === got || want === 'SETTLE?' && /SETTLE/.test(got) || got === 'SETTLE?' && /SETTLE/.test(want) && false;

/** Applies predicted actions to the starting state. */
function simulate(actions, state) {
  const money = {}, rel = {}, created = {}, updates = {}, deletes = [], schedules = [], recurring = {}, plansDone = [];
  let cash = 0, negative = 0;
  const add = (w, d) => { if (!d) return; money[w || ''] = (money[w || ''] || 0) + d; };
  const startOf = (kind, id) => kind === 'receivable' ? state.receivables?.find(x => x.id === id)?.remainingAmount : kind === 'debt' ? state.debts?.find(x => x.id === id)?.outstandingAmount : state.claims?.find(x => x.id === id)?.remainingAmount;
  const made = {};
  for (const a of actions) {
    const r = a.result, w = r.preset.walletId || '', amt = r.amount || 0;
    switch (r.kind) {
      case 'expense':
        add(w, -amt); cash++;
        if (r.split?.strong) for (const p of r.split.participants) if (!p.isMe) created[`receivable:${p.name}`] = (created[`receivable:${p.name}`] || 0) + (r.split.total === amt ? r.split.shares[p.id] : 0);
        if (r.preset.plannedId) plansDone.push(r.preset.plannedId);
        break;
      case 'income': add(w, amt); cash++; if (r.preset.plannedId) plansDone.push(r.preset.plannedId); break;
      case 'transfer': add(w, -(amt + (r.preset.transferFee || 0))); add(r.preset.destinationWalletId || '', amt); cash++; break;
      case 'receivable_new': if (r.preset.walletId) { add(w, -amt); cash++; } created[`receivable:${r.person || '?'}`] = (created[`receivable:${r.person || '?'}`] || 0) + amt; made[a.id] = `receivable:${r.person || '?'}`; break;
      case 'debt_new': if (r.preset.walletId) { add(w, amt); cash++; } created[`debt:${r.person || '?'}`] = (created[`debt:${r.person || '?'}`] || 0) + amt; made[a.id] = `debt:${r.person || '?'}`; break;
      case 'claim_new': add(w, -amt); cash++; created['claim:new'] = (created['claim:new'] || 0) + amt; break;
      case 'receivable_payment': case 'debt_payment': case 'claim_payment': {
        add(w, r.kind === 'debt_payment' ? -amt : amt); cash++;
        const kind = r.kind.split('_')[0], id = r.preset.receivableId || r.preset.debtId || r.preset.claimId;
        if (id) { const before = rel[id] ?? startOf(kind, id); rel[id] = before - amt; if (rel[id] < 0) negative++; }
        else if (r.operation?.linkAction && made[r.operation.linkAction]) { const key = made[r.operation.linkAction]; created[key] -= amt; if (created[key] < 0) negative++; }
        break;
      }
      case 'plan_new': schedules.push({ amount: amt, date: r.date, ...(r.preset.time ? { time: r.preset.time } : {}) }); break;
      case 'recurring_new': recurring.new = { amount: amt, date: r.date, ...(r.preset.time ? { time: r.preset.time } : {}) }; break;
      case 'tx_update': {
        const t = state.recent?.find(x => x.id === r.operation?.target?.id); if (!t) break;
        const ch = {}; for (const c of r.operation.changes || []) ch[c.field === 'walletId' ? 'wallet' : c.field] = c.after;
        updates[t.id] = ch;
        const sign = ['income', 'receivable_payment', 'claim_payment'].includes(t.type) ? 1 : -1;
        if (ch.amount !== undefined) add(t.walletId, sign * (ch.amount - t.amount));
        if (ch.wallet) { add(t.walletId, -sign * t.amount); add(ch.wallet, sign * t.amount); }
        break;
      }
      case 'tx_delete': for (const target of r.operation?.targets?.length ? r.operation.targets : r.operation?.target ? [r.operation.target] : []) deletes.push(target.id); break;
      case 'recurring_change': { const c = r.operation?.recurring; if (c) recurring[c.id] = c.stop ? { stop: true, from: c.from } : { amount: c.amount, from: c.from }; break; }
    }
  }
  for (const k of Object.keys(money)) if (!money[k]) delete money[k];
  return { money, rel, created, updates, deletes: deletes.sort(), schedules, recurring, plansDone, cash, negative };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sub = (want, got) => Object.entries(want).every(([k, v]) => typeof v === 'object' && v !== null && !Array.isArray(v) ? got[k] !== undefined && sub(v, got[k]) : eq(v, got[k]));

function scoreCase(c, plan) {
  const actions = plan.actions, e = c.expect, sim = simulate(actions, c.state);
  const confident = actions.length > 0 && actions.every(a => !a.review);
  const ops = actions.map(opOf);
  const opsOk = ops.length === e.ops.length && e.ops.every((o, i) => opMatch(o, ops[i]));
  const checks = {};
  if (e.money) checks.money = eq(e.money, sim.money);
  if (e.rel) checks.rel = Object.entries(e.rel).every(([id, v]) => (sim.rel[id] ?? c.state.receivables?.find(x => x.id === id)?.remainingAmount ?? c.state.debts?.find(x => x.id === id)?.outstandingAmount ?? c.state.claims?.find(x => x.id === id)?.remainingAmount) === v) && Object.keys(sim.rel).every(id => id in e.rel);
  if (e.created) checks.created = eq(Object.fromEntries(Object.entries(e.created).sort()), Object.fromEntries(Object.entries(sim.created).sort()));
  else checks.created = Object.keys(sim.created).length === 0;
  if (e.updates) checks.updates = sub(e.updates, sim.updates) && Object.keys(sim.updates).length === Object.keys(e.updates).length; else checks.updates = Object.keys(sim.updates).length === 0;
  checks.deletes = eq((e.deletes || []).slice().sort(), sim.deletes);
  if (e.schedules) checks.schedules = sim.schedules.length === e.schedules.length && e.schedules.every((s, i) => sub(s, sim.schedules[i])); else checks.schedules = sim.schedules.length === 0;
  if (e.recurring) checks.recurring = sub(e.recurring, sim.recurring) && Object.keys(sim.recurring).length === Object.keys(e.recurring).length; else checks.recurring = Object.keys(sim.recurring).length === 0;
  if (e.plansDone) checks.plansDone = eq(e.plansDone, sim.plansDone);
  if (e.query) checks.query = actions.length === 1 && actions[0].result.kind === 'query' && actions[0].result.operation?.query?.answer?.includes(e.query);
  const stateOk = Object.values(checks).every(Boolean);
  const target = e.target ? actions.some(a => a.result.operation?.target?.id === e.target || a.result.preset.receivableId === e.target || a.result.preset.debtId === e.target || a.result.preset.claimId === e.target || a.result.preset.plannedId === e.target) : null;
  const codes = actions.flatMap(a => (a.checks || []).map(x => x.code));
  const warnOk = (e.warn || []).every(code => codes.includes(code));
  const askOk = e.ask ? actions.some(a => a.ask?.field === e.ask) : true;
  const reviewOk = e.review === undefined ? true : e.review ? actions.some(a => a.review) : !actions.some(a => a.review);
  const dupWarned = actions.some(a => a.result.duplicateOf);
  const fieldsOk = !e.actions || e.actions.every((want, i) => { const a = actions[i]; if (!a) return false; const r = a.result; const got = { kind: r.kind, amount: r.amount, person: r.person, date: r.date, wallet: r.preset.walletId, purpose: r.purpose }; return Object.entries(want).every(([k, v]) => eq(v, got[k])); });
  const confirmOk = e.confirm === undefined ? true : Boolean(plan.confirm) === e.confirm;
  const exact = opsOk && stateOk && warnOk && askOk && reviewOk && fieldsOk && confirmOk && (target === null || target) && (e.duplicate === undefined || dupWarned === e.duplicate);
  const expectedCount = e.count ?? e.ops.length;
  return { id: c.id, tags: c.tags, exact, opsOk, stateOk, checks, target, warnOk, askOk, reviewOk, fieldsOk, confirmOk, dupWarned, dupExpected: Boolean(e.duplicate),
    wrongMutation: !stateOk && confident ? 1 : 0, wrongTarget: target === false && confident ? 1 : 0,
    dupMoney: e.cash !== undefined ? Math.max(0, sim.cash - e.cash) : 0, negative: confident ? sim.negative : 0,
    phantom: Math.max(0, actions.length - expectedCount), missed: Math.max(0, expectedCount - actions.length), ops, sim };
}

function summarize(rows) {
  const tag = t => rows.filter(r => r.tags.includes(t)), ex = list => pct(list.filter(r => r.exact).length, list.length), sum = k => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const withTarget = rows.filter(r => r.target !== null), dupTP = rows.filter(r => r.dupWarned && r.dupExpected).length, dupFP = rows.filter(r => r.dupWarned && !r.dupExpected).length;
  return {
    'Kalimat benar seluruhnya': pct(rows.filter(r => r.exact).length, rows.length),
    'Jenis operasi tepat': pct(rows.filter(r => r.opsOk).length, rows.length),
    'Perubahan state tepat': pct(rows.filter(r => r.stateOk).length, rows.length),
    'Target historis tepat': pct(withTarget.filter(r => r.target).length, withTarget.length),
    ...Object.fromEntries([['partial', 'Pelunasan sebagian'], ['settle', 'Pelunasan penuh'], ['remaining', 'Sisa saldo'], ['overpay', 'Deteksi bayar lebih'], ['reference', 'Rujukan (dia / dalam pesan)'], ['update', 'Ubah transaksi'], ['delete', 'Hapus / batal'], ['ambiguous', 'Ambigu → tanya'], ['query', 'Pertanyaan (tanpa mutasi)'], ['arithmetic', 'Aritmetika'], ['discount', 'Diskon'], ['fee', 'Biaya / service'], ['cashback', 'Cashback'], ['transfer', 'Transfer + admin'], ['group', 'Grup'], ['split', 'Split Bill'], ['talang', 'Talangan'], ['claim', 'Klaim'], ['plan', 'Rencana'], ['recurring', 'Jadwal rutin'], ['duplicate', 'Peringatan duplikat'], ['unsuffixed', 'Nominal tanpa satuan aman'], ['simple', 'Kalimat sederhana']]
      .filter(([t]) => tag(t).length).map(([t, l]) => [`Tepat: ${l}`, ex(tag(t))])),
    'Presisi peringatan duplikat': pct(dupTP, dupTP + dupFP), 'Peringatan duplikat palsu': dupFP,
    'Mutasi salah tapi yakin': sum('wrongMutation'), 'Target salah tapi yakin': sum('wrongTarget'), 'Uang tercatat dobel': sum('dupMoney'),
    'Saldo relasi negatif': sum('negative'), 'Aksi palsu': sum('phantom'), 'Aksi terlewat': sum('missed'),
  };
}

function table(summaries) {
  const labels = Object.keys(summaries), keys = [...new Set(labels.flatMap(l => Object.keys(summaries[l])))];
  return [['Ukuran', ...labels], ['---', ...labels.map(() => '---:')], ...keys.map(k => [k, ...labels.map(l => String(summaries[l][k] ?? '–'))])].map(r => `| ${r.join(' | ')} |`).join('\n');
}

if (label === '--compare' || process.argv.includes('--compare')) {
  const [a, b] = args, A = JSON.parse(readFileSync(file(a), 'utf8')), B = JSON.parse(readFileSync(file(b), 'utf8'));
  console.log(table({ [a]: A.summary, [b]: B.summary }));
  console.log(`\nWaktu per kalimat: ${a} ${A.ms} ms (P95 ${A.p95}) · ${b} ${B.ms} ms (P95 ${B.p95})`);
  process.exit(0);
}

const engine = label === 'v32' ? resolve(here, 'baseline-v32/catat/v3.ts') : label === 'v33base' ? resolve(here, 'baseline-v33/catat/v3.ts') : resolve(root, 'lib/catat/v3.ts');
const { parseQuickPlanV3 } = await import(pathToFileURL(engine).href);
const rows = [], times = [];
for (const c of cases) {
  c.state = { ...base, ...(c.state || {}) };
  const t0 = performance.now(); const plan = await parseQuickPlanV3(c.text, c.state); times.push(performance.now() - t0);
  rows.push(scoreCase(c, plan));
}
const sorted = [...times].sort((a, b) => a - b), ms = +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2), p95 = +sorted[Math.floor(sorted.length * 0.95)].toFixed(2);
const summary = summarize(rows);
mkdirSync(out, { recursive: true });
writeFileSync(file(label), JSON.stringify({ set: SET, label, ms, p95, summary, rows: rows.map(({ sim, ...r }) => ({ ...r, sim })) }, null, 1));
console.log(table({ [label]: summary }));
console.log(`\n${rows.length} kalimat · ${ms} ms per kalimat · P95 ${p95} ms`);
if (process.argv.includes('--fails')) for (const r of rows.filter(x => !x.exact)) { const c = cases.find(x => x.id === r.id); console.log(`\n✗ ${r.id} "${c.text}"\n  ops ${JSON.stringify(r.ops)} want ${JSON.stringify(c.expect.ops)} · checks ${JSON.stringify(r.checks)} target ${r.target} warn ${r.warnOk} ask ${r.askOk} review ${r.reviewOk} fields ${r.fieldsOk} confirm ${r.confirmOk} dup ${r.dupWarned}\n  sim ${JSON.stringify(r.sim)}`); }
