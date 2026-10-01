/**
 * Reads every benchmark photo with the app's own receipt reader (in Chromium, through the dev-only /ocr-bench page)
 * and scores it against truth.json. Usage:
 *   node bench/receipts/run.mjs <base-url> <label> [filter]    e.g. node bench/receipts/run.mjs http://localhost:3000 v2
 *   node bench/receipts/run.mjs --compare v1 v2                 prints the field-level comparison of two saved runs
 * Results go to bench/receipts/out/result-<label>.json. Needs `npm run dev` (or another dev server) at <base-url>.
 */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname), out = path.join(here, 'out');
// SET=v25 reads truth-v25.json (the V2.5 structure set); without it, the original set.
// SET=realworld-dev / realworld-heldout: genuine images in bench/realworld/<set>/ with hand-written truth <set>.json.
const real = (process.env.SET || '').startsWith('realworld'), realDir = path.join(here, '..', 'realworld');
const truth = JSON.parse(fs.readFileSync(real ? path.join(realDir, `${process.env.SET}.json`) : path.join(out, process.env.SET ? `truth-${process.env.SET}.json` : 'truth.json'), 'utf8'));
const imageDir = real ? path.join(realDir, process.env.SET) : out;

import { METRICS, pct, score, summarize } from './score.mjs';

if (process.argv[2] === '--compare') {
  const [a, b] = process.argv.slice(3), A = JSON.parse(fs.readFileSync(path.join(out, `result-${a}.json`))), B = JSON.parse(fs.readFileSync(path.join(out, `result-${b}.json`)));
  const ids = Object.keys(truth).filter(id => A[id] && B[id]);
  const sa = summarize(ids.map(id => score(truth[id], A[id]))), sb = summarize(ids.map(id => score(truth[id], B[id])));
  console.log(`${ids.length} foto\n${'Ukuran'.padEnd(30)}${a.padStart(8)}${b.padStart(8)}`);
  for (const [k, label] of METRICS) console.log(`${label.padEnd(30)}${pct(sa[k]).padStart(8)}${pct(sb[k]).padStart(8)}`);
  for (const [k, label] of [['falseItems', 'Item palsu (jumlah)'], ['falseTotal', 'Total salah (jumlah)'], ['confidentWrong', 'Total salah tapi yakin'], ['relWrong', 'Relasi salah tanpa tanda']]) console.log(`${label.padEnd(30)}${String(sa[k]).padStart(8)}${String(sb[k]).padStart(8)}`);
  console.log(`${'Pass rata-rata'.padEnd(30)}${(sa.passesAvg || 0).toFixed(1).padStart(8)}${(sb.passesAvg || 0).toFixed(1).padStart(8)}`);
  console.log(`${'Butuh pass tambahan'.padEnd(30)}${pct(sa.escalated).padStart(8)}${pct(sb.escalated).padStart(8)}`);
  console.log(`${'Waktu rata-rata'.padEnd(30)}${`${(sa.msAvg / 1000).toFixed(1)}s`.padStart(8)}${`${(sb.msAvg / 1000).toFixed(1)}s`.padStart(8)}`);
  console.log('\nPer foto (total / item recall):');
  for (const id of ids) { const x = score(truth[id], A[id]), y = score(truth[id], B[id]); console.log(`${id.padEnd(28)}${`${x.total ? 'ok' : 'X'} ${pct(x.itemRecall)}`.padStart(10)}${`${y.total ? 'ok' : 'X'} ${pct(y.itemRecall)}`.padStart(10)}`); }
  process.exit(0);
}

const [base, label, filter] = process.argv.slice(2);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('  [page]', m.text().slice(0, 200)); });
await page.route('**/bench-fixture/**', route => { const name = decodeURIComponent(route.request().url().split('/bench-fixture/')[1]); return route.fulfill({ path: path.join(imageDir, name), contentType: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg' }); });
await page.goto(`${base}/ocr-bench/`); await page.waitForSelector('#bench-ready', { timeout: 180000 });
const file = path.join(out, `result-${label}.json`), results = fs.existsSync(file) && filter ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
for (const id of Object.keys(truth).filter(id => !filter || id.includes(filter))) {
  const started = Date.now();
  // ENGINE=tesseract | paddle-tiny | paddle-small | auto (default: the app's own choice).
  try { results[id] = await page.evaluate(([url, engine]) => window.__readReceipt(url, engine ? { engine } : {}), [`${base}/bench-fixture/${real ? id : `${id}.jpg`}`, process.env.ENGINE || '']); }
  catch (e) { results[id] = { error: String(e).slice(0, 300) }; }
  const s = score(truth[id], results[id]);
  console.log(`${id.padEnd(28)} total ${s.total ? 'ok' : 'X '} items ${pct(s.itemRecall).padStart(4)} amount ${pct(s.itemAmount).padStart(4)} rel ${pct(s.relations)} date ${s.date ?? '-'} pay ${s.payment ?? '-'} passes ${results[id].passes ?? '-'}${results[id].failure?.length ? ` [${results[id].failure.join('; ')}]` : ''} ${((Date.now() - started) / 1000).toFixed(1)}s`);
  fs.writeFileSync(file, JSON.stringify(results));
}
const summary = summarize(Object.keys(results).map(id => score(truth[id], results[id])));
console.log(Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, typeof v === 'number' && v <= 1 && !['falseItems', 'falseTotal', 'confidentWrong', 'relWrong', 'phantomForbidden', 'originalAsPaid', 'passesAvg'].includes(k) ? pct(v) : v])));
await browser.close();
