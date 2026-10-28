// End-to-end rows on real PP-OCRv6 segments of CORD images: V3's rule vs the V4 model (labels from the true rows).
import fs from 'node:fs';
const S = (process.env.CORD_WORK || '/tmp/cord-work');
const { groupRows } = await import(new URL('../../lib/receipt-rowlink.ts', import.meta.url).href);
const { rowsOfSegments, segmentWords, rowsByModel } = await import(new URL('../../lib/ocr-paddle.ts', import.meta.url).href);
const { slopeOf } = await import(new URL('../../lib/receipt-rows.ts', import.meta.url).href);
const [set = 'cord-dev'] = process.argv.slice(2);
const model = JSON.parse(fs.readFileSync(`${S}/rowlink-model.json`));
const data = JSON.parse(fs.readFileSync(`${process.env.CORD_DIR || '/tmp/cord'}/${set}-lines.json`)), raw = JSON.parse(fs.readFileSync(`${S}/raw-${set}-1280.json`));
const pts = poly => (poly || []).map(q => Array.isArray(q) ? { x: q[0], y: q[1] } : q);
// A rebuilt row's token → its segment: same text and left edge, and the word's middle inside the row's height.
const segOf = (segWords, t) => { const hits = segWords.map((ws, i) => ws.some(w => Math.abs(w.x0 - t.box.x) < .5 && w.text === t.text && (w.y0 + w.y1) / 2 >= t.box.y - 1 && (w.y0 + w.y1) / 2 <= t.box.y + t.box.height + 1) ? i : -1).filter(i => i >= 0); return hits.length === 1 ? hits[0] : -1; };
const tally = () => ({ tp: 0, fp: 0, fn: 0, perfect: 0, n: 0 });
const v3 = tally(), v4 = tally(), v4g = tally();
function judge(t, rowsOfSeg, label) {
  let ok = true;
  for (let i = 0; i < label.length; i++) for (let j = i + 1; j < label.length; j++) {
    if (label[i] == null || label[j] == null) continue;
    const same = label[i] === label[j], said = rowsOfSeg[i] >= 0 && rowsOfSeg[i] === rowsOfSeg[j];
    if (same && said) t.tp++; else if (said) { t.fp++; ok = false; } else if (same) { t.fn++; ok = false; }
  }
  t.n++; t.perfect += ok;
}
for (const [id, rec] of Object.entries(data)) {
  const items = raw[id]; if (!items?.length) continue;
  const words = rec.lines.flatMap(l => l.words).filter(w => w.text.trim()).map(w => ({ x0: w.box[0], y0: w.box[1], x1: w.box[2], y1: w.box[3], row: w.row }));
  const segs = items.map(it => { const p = pts(it.poly); return { x0: Math.min(...p.map(q => q.x)), y0: Math.min(...p.map(q => q.y)), x1: Math.max(...p.map(q => q.x)), y1: Math.max(...p.map(q => q.y)), text: it.text, poly: it.poly, score: it.score }; });
  const label = segs.map(s => { const votes = new Map(); for (const w of words) { const ix = Math.min(s.x1, w.x1) - Math.max(s.x0, w.x0), iy = Math.min(s.y1, w.y1) - Math.max(s.y0, w.y0); if (ix > 0 && iy > 0 && ix * iy > .5 * (w.x1 - w.x0) * (w.y1 - w.y0)) votes.set(w.row, 1); } return votes.size === 1 ? [...votes.keys()][0] : null; });
  if (label.filter(l => l != null).length < 2) continue;
  // V3: the app's own rule, with the tilt from the segments' polygons.
  const segWords = segs.map((s, i) => segmentWords(s.text, s.poly, s.score).map(w => ({ ...w, seg: i })));
  const baselines = items.map(it => pts(it.poly)).filter(p => p.length >= 2).map(p => ({ x0: p[0].x, y0: p[0].y, x1: p[1].x, y1: p[1].y }));
  const rows3 = rowsOfSegments(segWords.filter(w => w.length), slopeOf(baselines));
  const rowOf3 = new Array(segs.length).fill(-1);
  rows3.forEach((row, ri) => row.tokens.forEach(t => { const i = segOf(segWords, t); if (i >= 0) rowOf3[i] = ri; }));
  judge(v3, rowOf3, label);
  // V4: the model.
  const rows4 = rowsByModel(segWords.filter(w => w.length), slopeOf(baselines)), rowOf4 = new Array(segs.length).fill(-1);
  rows4.forEach((row, ri) => row.tokens.forEach(t => { const i = segOf(segWords, t); if (i >= 0) rowOf4[i] = ri; }));
  judge(v4, rowOf4, label);
  const g = groupRows(segs, model, slopeOf(baselines) || undefined), rowOfG = new Array(segs.length).fill(-1); g.forEach((row, ri) => row.forEach(i => { rowOfG[i] = ri; })); judge(v4g, rowOfG, label);
  if ((v4.perfect !== v4g.perfect) && !globalThis.shown) { globalThis.shown = 1; console.log('differs at', id, rowOf4.join(','), '|', rowOfG.join(',')); }
}
const line = (name, t) => `${name}: same-row pairs precision ${(t.tp / (t.tp + t.fp) * 100).toFixed(1)}% recall ${(t.tp / (t.tp + t.fn) * 100).toFixed(1)}%; receipts with every row right ${t.perfect}/${t.n}`;
console.log(line('V3 rule ', v3)); console.log(line('V4 model', v4)); console.log(line('V4 group', v4g));
