/**
 * Catat otomatis 6.0 — Tanya benchmark: questions about one's own money, answered locally from the ledger.
 *   SET=v60askdev node bench/quick/run-ask.mjs [--fails]
 *   SET=v60askheldout node bench/quick/run-ask.mjs [--first]   (--first freezes the first run, once)
 * A question is right when its intent is right and every number of the truth matches (total, count, date, period,
 * label). A wrong number shown as an answer is "yakin tapi salah"; "belum bisa menjawab" is not.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuickPlanV3 } from '../../lib/catat/v3.ts';
import { ctx } from './fixtures-v60askstate.mjs';

const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'out');
const SET = process.env.SET ?? 'v60askdev';
const { cases } = await import(`./fixtures-${SET}.mjs`);
const rows = [];
for (const c of cases) {
  const t0 = performance.now();
  const plan = await parseQuickPlanV3(c.text, ctx);
  const ms = performance.now() - t0;
  const entries = plan.actions.filter(a => a.result.kind !== 'query');
  const query = plan.actions.find(a => a.result.kind === 'query')?.result.operation?.query;
  const ask = query?.ask, x = c.expect, why = [];
  if (x.entry) { if (entries[0]?.result.kind !== x.entry || query) why.push(`entri ${entries[0]?.result.kind || '–'}${query ? ' + pertanyaan' : ''} ≠ ${x.entry}`); }
  else if (x.none) { if (entries.length || (ask && ask.intent !== 'unknown')) why.push(`seharusnya tidak ada: ${entries.map(a => a.result.kind).join(',')}${ask ? ` jawab ${ask.intent}` : ''}`); }
  else {
    if (entries.length) why.push(`jadi entri ${entries.map(a => a.result.kind).join(',')}`);
    if (!ask) why.push('tidak dijawab');
    else {
      if (ask.intent !== x.intent) why.push(`intent ${ask.intent} ≠ ${x.intent}`);
      for (const k of ['total', 'count', 'date', 'start', 'end', 'compare', 'label']) if (x[k] !== undefined && ask[k] !== x[k]) why.push(`${k} ${ask[k]} ≠ ${x[k]}`);
    }
  }
  const answered = Boolean(ask && ask.intent !== 'unknown');
  rows.push({ id: c.id, text: c.text, ok: !why.length, why, answer: query?.answer || '', confidentWrong: !why.length ? false : answered && !x.entry && !x.none ? true : Boolean(x.none && answered), ms });
}
const n = rows.length, ok = rows.filter(r => r.ok).length, cw = rows.filter(r => r.confidentWrong).length;
const p95 = [...rows.map(r => r.ms)].sort((a, b) => a - b)[Math.floor(n * 0.95)] || 0;
mkdirSync(out, { recursive: true });
const dump = { set: SET, cases: n, ok, confidentWrong: cw, rows };
writeFileSync(resolve(out, `ask-${SET}.json`), JSON.stringify(dump, null, 1));
if (process.argv.includes('--first')) {
  const frozen = resolve(here, 'heldout-first', 'v60-ask-heldout-first.json');
  if (existsSync(frozen)) console.log(`(run pertama sudah dibekukan sebelumnya: ${frozen}, tidak ditimpa)`);
  else { writeFileSync(frozen, JSON.stringify({ ...dump, frozenAt: new Date().toISOString() }, null, 1)); console.log(`(run pertama dibekukan: ${frozen})`); }
}
console.log(`\n## 6.0 Tanya — ${SET} (${n} kalimat)\n\n| | 6.0 |\n|---|---|\n| Benar | ${ok}/${n} (${Math.round(ok / n * 100)}%) |\n| **Yakin tapi salah** | ${cw} |\n| P95 (ms) | ${p95.toFixed(1)} |\n`);
for (const r of rows) if (!r.ok && (process.argv.includes('--fails') || process.argv.includes('--all'))) console.log(`✗ ${r.id} “${r.text}”\n   ${r.why.join('; ')}${r.answer ? `\n   jawaban: ${r.answer}` : ''}`);
if (process.argv.includes('--all')) for (const r of rows) if (r.ok) console.log(`✓ ${r.id} “${r.text}” → ${r.answer}`);
