// Where V3 fails on CORD: reading (the text never came out of the OCR) vs understanding (it did, but was misread).
import fs from 'node:fs';
const [label, set = 'cord-dev'] = process.argv.slice(2);
const S = (process.env.CORD_WORK || '/tmp/cord-work');
const truth = JSON.parse(fs.readFileSync(`${process.env.CORD_DIR || '/tmp/cord'}/${set}.json`, 'utf8'));
const res = JSON.parse(fs.readFileSync(`${S}/bench/result-${label}.json`, 'utf8'));
const { score } = await import(new URL('../../bench/receipts/score.mjs', import.meta.url).href);
const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const digits = n => String(n);
const inText = (text, n) => { const t = text.replace(/[.,\s]/g, ''); return t.includes(digits(n)); };
const counts = { images: 0, totalOk: 0, totalInOcr: 0, totalMissOcr: 0, totalMissParse: 0, items: 0, itemFound: 0, nameInOcr: 0, priceInOcr: 0, missOcr: 0, missParse: 0, fake: 0, ms: 0 };
const fails = [];
for (const [id, t] of Object.entries(truth)) {
  const r = res[id]; if (!r) continue; counts.images++;
  const text = (r.passList || []).map(p => p.text).join('\n'), s = score(t, r);
  counts.ms += r.ms || 0; counts.fake += s.falseItems;
  if (t.total) { const ok = s.total === 1; counts.totalOk += ok; const seen = inText(text, t.total); counts.totalInOcr += seen; if (!ok) { if (seen) counts.totalMissParse++; else counts.totalMissOcr++; } }
  const readItems = r.read?.items || [];
  for (const [name, qty, total] of t.items) {
    counts.items++;
    const found = readItems.some(i => i.total === total && (squash(i.name).includes(squash(name).slice(0, 5)) || squash(name).includes(squash(i.name).slice(0, 5))));
    const nameSeen = squash(text).includes(squash(name).slice(0, 8)), priceSeen = inText(text, total);
    counts.itemFound += found; counts.nameInOcr += nameSeen; counts.priceInOcr += priceSeen;
    if (!found) { if (nameSeen && priceSeen) counts.missParse++; else counts.missOcr++; }
  }
  if (s.total !== 1 || s.itemRecall < 1) fails.push({ id, total: t.total, read: r.read?.total, recall: s.itemRecall, why: r.failure || r.error });
}
const pct = (a, b) => `${a}/${b} (${Math.round(a / b * 100)}%)`;
console.log(`${label} on ${set}: ${counts.images} images, avg ${(counts.ms / counts.images / 1000).toFixed(1)} s`);
console.log(`total right ${pct(counts.totalOk, counts.images)}; wrong because OCR never read it ${counts.totalMissOcr}, read but misunderstood ${counts.totalMissParse}`);
console.log(`items found ${pct(counts.itemFound, counts.items)}; missed: OCR lacks name/price ${counts.missOcr}, OCR has both ${counts.missParse}; fake items ${counts.fake}`);
console.log(`OCR text contains: item names ${pct(counts.nameInOcr, counts.items)}, item prices ${pct(counts.priceInOcr, counts.items)}, totals ${pct(counts.totalInOcr, counts.images)}`);
if (process.argv.includes('--fails')) for (const f of fails) console.log(JSON.stringify(f));
