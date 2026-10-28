/**
 * Receipt Intelligence V4: which text segments sit on the same printed row, decided by a small model trained on real
 * Indonesian receipts (CORD v2, CC BY 4.0; bench/cord). A phone photo of a receipt is tilted, curved and uneven, so a
 * fixed rule ("overlaps in height by 45 %") joins rows that are apart and splits rows that belong together; the model
 * weighs the evidence of each pair of segments (height overlap, vertical offset against the receipt's own tilt, gap,
 * letter size) instead. Pure, no browser; the weights are in receipt-rowlink-model.ts.
 *
 * Every segment links to at most one segment on its right and one on its left (mutual best, probability above ½);
 * the chains are the rows.
 */
export type Seg = { x0: number; y0: number; x1: number; y1: number };
export type LinkModel = { mean: number[]; scale: number[]; layers: { w: number[][]; b: number[] }[] };

const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const cy = (s: Seg) => (s.y0 + s.y1) / 2, cx = (s: Seg) => (s.x0 + s.x1) / 2, ht = (s: Seg) => Math.max(1, s.y1 - s.y0);

/** The receipt's tilt (rise per pixel): from each segment to the nearest one on its right that clearly shares its row. */
export function tiltOf(segs: Seg[], h = median(segs.map(ht))) {
  const slopes: number[] = [];
  for (const a of segs) {
    let best: Seg | null = null;
    for (const b of segs) {
      if (b === a || b.x0 < a.x1 - h * .3) continue;
      const ov = (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) / Math.min(ht(a), ht(b));
      if (ov < .6) continue;
      if (!best || b.x0 < best.x0) best = b;
    }
    if (best && cx(best) - cx(a) > h * 2) slopes.push((cy(best) - cy(a)) / (cx(best) - cx(a)));
  }
  return slopes.length >= 3 ? median(slopes.filter(s => Math.abs(s) < .3)) : 0;
}

/** Evidence that `b` (to the right of `a`) is on the same row: everything measured in the receipt's letter height. */
export function linkFeatures(a: Seg, b: Seg, h: number, tilt: number): number[] {
  const ha = ht(a), hb = ht(b);
  const dy = (cy(b) - cy(a)) / h, expected = tilt * (cx(b) - cx(a)) / h, off = dy - expected;
  const ov = (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) / Math.min(ha, hb);
  // The same overlap after taking the tilt out.
  const shift = tilt * (cx(b) - cx(a));
  const ovTilt = (Math.min(a.y1, b.y1 - shift) - Math.max(a.y0, b.y0 - shift)) / Math.min(ha, hb);
  const gap = (b.x0 - a.x1) / h, hr = Math.log(hb / ha);
  return [off, Math.abs(off), dy, Math.abs(dy), ov, ovTilt, Math.min(gap, 40) / 10, Math.abs(hr), Math.abs((b.y0 - a.y0) / h - expected), Math.abs((b.y1 - a.y1) / h - expected), Math.min(ha, hb) / h, Math.max(ha, hb) / h];
}

export function linkProbability(model: LinkModel, x: number[]) {
  let v = x.map((value, i) => (value - model.mean[i]) / (model.scale[i] || 1));
  model.layers.forEach((layer, li) => {
    const out = layer.b.map((bias, j) => bias + v.reduce((n, value, i) => n + value * layer.w[i][j], 0));
    v = li < model.layers.length - 1 ? out.map(o => Math.max(0, o)) : out;
  });
  return 1 / (1 + Math.exp(-v[0]));
}

/** Candidate pairs: `b` starts to the right of `a` (a little overlap allowed), not too far up or down. */
export function candidates(segs: Seg[], h: number) {
  const out: [number, number][] = [];
  segs.forEach((a, i) => segs.forEach((b, j) => {
    if (i === j || b.x0 < a.x1 - h * .5 || cx(b) <= cx(a)) return;
    if (Math.abs(cy(b) - cy(a)) > h * 3 + Math.abs(cx(b) - cx(a)) * .12) return;
    out.push([i, j]);
  }));
  return out;
}

/** Segments → rows (indices, left to right), top to bottom. */
export function groupRows(segs: Seg[], model: LinkModel, tilt?: number): number[][] {
  if (!segs.length) return [];
  // `tilt`: already known (e.g. taken out of the boxes beforehand: 0); otherwise measured from the layout.
  const h = median(segs.map(ht));
  tilt ??= tiltOf(segs, h);
  const scored = candidates(segs, h).map(([i, j]) => ({ i, j, p: linkProbability(model, linkFeatures(segs[i], segs[j], h, tilt)) })).filter(e => e.p > .5).sort((a, b) => b.p - a.p);
  const next = new Map<number, number>(), prev = new Map<number, number>();
  for (const e of scored) {
    if (next.has(e.i) || prev.has(e.j)) continue;
    // No cycles: following prev from i must not reach j.
    let k: number | undefined = e.i, loop = false; while (k !== undefined) { if (k === e.j) { loop = true; break; } k = prev.get(k); }
    if (loop) continue;
    next.set(e.i, e.j); prev.set(e.j, e.i);
  }
  const rows: number[][] = [];
  segs.forEach((_, i) => { if (prev.has(i)) return; const row = [i]; let k = next.get(i); while (k !== undefined) { row.push(k); k = next.get(k); } rows.push(row); });
  // Top to bottom by where each row would cross the left edge (tilt taken out).
  const level = (row: number[]) => median(row.map(i => cy(segs[i]) - tilt * cx(segs[i])));
  return rows.sort((a, b) => level(a) - level(b));
}
