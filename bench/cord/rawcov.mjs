// OCR coverage of the raw photo (PP-OCRv6 small, no preparation): how many truth prices/totals appear in the text.
import fs from 'node:fs'; import path from 'node:path';
const S = (process.env.CORD_WORK || '/tmp/cord-work');
const [set = 'cord-dev', side = '1280', limit = '100'] = process.argv.slice(2);
const base = set.startsWith('mini') ? (process.env.MINI_DIR || '/tmp/mini') : (process.env.CORD_DIR || '/tmp/cord');
const truth = JSON.parse(fs.readFileSync(`${base}/${set}.json`)), dir = `${base}/${set}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch(); const page = await browser.newPage();
await page.route('**/bench-fixture/**', r => r.fulfill({ path: path.join(dir, decodeURIComponent(r.request().url().split('/bench-fixture/')[1])), contentType: /\.jpe?g$/i.test(r.request().url()) ? 'image/jpeg' : 'image/png' }));
await page.goto(`${process.env.BASE || 'http://localhost:3000'}/ocr-bench/`); await page.waitForSelector('#bench-ready', { timeout: 180000 });
const inText = (t, n) => t.replace(/[.,\s]/g, '').includes(String(n));
let prices = 0, pricesSeen = 0, totals = 0, totalsSeen = 0, ms = 0, n = 0; const out = {};
for (const id of Object.keys(truth).slice(0, +limit)) {
  const t = truth[id];
  const raw = await page.evaluate(([u, s]) => window.__rawSide(u, 'small', s), [`${process.env.BASE || 'http://localhost:3000'}/bench-fixture/${id}`, +side]);
  const r = { ms: raw.ms, text: raw.items.map(i => i.text).join('\n'), items: raw.items };

  n++; ms += r.ms; out[id] = r.items;
  for (const it of t.items) { prices++; pricesSeen += inText(r.text, it[2]); }
  if (t.total) { totals++; totalsSeen += inText(r.text, t.total); }
}
fs.writeFileSync(`${S}/raw-${set}-${side}.json`, JSON.stringify(out));
console.log(`raw ${set} side ${side}: ${n} img, prices ${pricesSeen}/${prices} (${Math.round(pricesSeen / prices * 100)}%), totals ${totalsSeen}/${totals} (${Math.round(totalsSeen / totals * 100)}%), ${(ms / n / 1000).toFixed(1)} s/img`);
await browser.close();
