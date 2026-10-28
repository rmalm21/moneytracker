// Training pairs for the row-link model, from CORD's true word boxes (words merged into OCR-like segments) and, when
// available, from real PP-OCRv6 segments of the same images labelled by the true rows they cover.
import fs from 'node:fs';
const S = (process.env.CORD_WORK || '/tmp/cord-work');
const { linkFeatures, tiltOf, candidates } = await import(new URL('../../lib/receipt-rowlink.ts', import.meta.url).href);
const [set = 'cord-train'] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(`${process.env.CORD_DIR || '/tmp/cord'}/${set}-lines.json`));
const rawFile = `${S}/raw-${set}-1280.json`, raw = fs.existsSync(rawFile) ? JSON.parse(fs.readFileSync(rawFile)) : {};
const median = v => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 0; };
const X = [], y = [], g = [], src = [];
let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const add = (segs, rows, receipt, kind, shear = 0) => {
  const keep = segs.map((s, i) => [s, rows[i]]).filter(([, r]) => r !== undefined && r !== null);
  if (keep.length < 2) return;
  let ss = keep.map(k => k[0]); const rr = keep.map(k => k[1]);
  const base = tiltOf(ss, median(ss.map(s => s.y1 - s.y0)));
  // A photo held at an angle: every box sheared, and its axis-aligned box grows with its width (as the OCR's do).
  if (shear) ss = ss.map(s => ({ x0: s.x0, x1: s.x1, y0: s.y0 + Math.min(shear * s.x0, shear * s.x1), y1: s.y1 + Math.max(shear * s.x0, shear * s.x1) }));
  const h = median(ss.map(s => s.y1 - s.y0)), tilt = shear ? base + shear : base;
  for (const [i, j] of candidates(ss, h)) { X.push(linkFeatures(ss[i], ss[j], h, tilt).map(v => +v.toFixed(4))); y.push(rr[i] === rr[j] ? 1 : 0); g.push(receipt); src.push(kind); }
};
let r = 0;
for (const [id, rec] of Object.entries(data)) {
  r++;
  const words = rec.lines.flatMap(l => l.words).filter(w => w.text.trim()).map(w => ({ x0: w.box[0], y0: w.box[1], x1: w.box[2], y1: w.box[3], row: w.row }));
  if (words.length < 2) continue;
  // Words as segments.
  add(words, words.map(w => w.row), r, 'word');
  // Words merged into segments the way OCR returns phrases: same row, small gap.
  const h = median(words.map(w => w.y1 - w.y0)), byRow = new Map();
  for (const w of words) (byRow.get(w.row) || byRow.set(w.row, []).get(w.row)).push(w);
  const merged = [];
  for (const [row, list] of byRow) { list.sort((a, b) => a.x0 - b.x0); let cur = null; for (const w of list) { if (cur && w.x0 - cur.x1 < h * .9) { cur.x1 = Math.max(cur.x1, w.x1); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1); } else { cur && merged.push(cur); cur = { ...w }; } } cur && merged.push(cur); }
  add(merged, merged.map(m => m.row), r, 'merged');
  if (set === 'cord-train') for (let k = 0; k < 2; k++) add(merged, merged.map(m => m.row), r, 'shear', (rand() - .5) * .2);
  // Real OCR segments: each labelled by the true row of the words it covers (unlabelled text, e.g. the shop's header, is left out).
  const items = raw[id];
  if (items) {
    const segs = items.map(it => { const p = (it.poly || []).map(q => Array.isArray(q) ? { x: q[0], y: q[1] } : q); return p.length ? { x0: Math.min(...p.map(q => q.x)), y0: Math.min(...p.map(q => q.y)), x1: Math.max(...p.map(q => q.x)), y1: Math.max(...p.map(q => q.y)) } : null; }).filter(Boolean);
    const rows = segs.map(s => { const votes = new Map(); for (const w of words) { const ix = Math.min(s.x1, w.x1) - Math.max(s.x0, w.x0), iy = Math.min(s.y1, w.y1) - Math.max(s.y0, w.y0); if (ix > 0 && iy > 0 && ix * iy > .5 * (w.x1 - w.x0) * (w.y1 - w.y0)) votes.set(w.row, (votes.get(w.row) || 0) + 1); } if (votes.size !== 1) return null; return [...votes.keys()][0]; });
    add(segs, rows, r, 'ocr');
  }
}
fs.writeFileSync(`${S}/rowlink-${set}.json`, JSON.stringify({ X, y, g, src }));
const by = k => src.filter(s => s === k).length;
console.log(`${set}: ${X.length} pairs (word ${by('word')}, merged ${by('merged')}, ocr ${by('ocr')}), positive ${y.filter(Boolean).length}`);
