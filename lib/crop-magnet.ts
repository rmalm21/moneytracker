/**
 * "Magnet" for setting the receipt's corners by hand: the photo's edges pull a dragged corner onto a real corner of
 * the paper, and a dragged side onto the paper's border line. Pure functions on a small grey copy of the photo; all
 * positions are 0..1 of the photo. Nothing is guessed: with no clear edge nearby, the point stays where it was put.
 */
import type { Point, Quad } from './receipt-image';

export type EdgeField = { width: number; height: number; gx: Float32Array; gy: Float32Array; mag: Float32Array; /** A typical strong edge, for thresholds. */ strong: number };

/** Sobel gradients of an RGBA image (scaled down to at most `max` px on the long side first by the caller or here). */
export function edgeField(rgba: ArrayLike<number>, width: number, height: number, max = 360): EdgeField {
  const scale = Math.min(1, max / Math.max(width, height)), w = Math.max(3, Math.round(width * scale)), h = Math.max(3, Math.round(height * scale));
  const grey = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(width - 1, Math.floor((x + .5) / scale)), sy = Math.min(height - 1, Math.floor((y + .5) / scale)), i = (sy * width + sx) * 4;
    grey[y * w + x] = .299 * rgba[i] + .587 * rgba[i + 1] + .114 * rgba[i + 2];
  }
  // A light blur so paper texture and print do not count as edges.
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += grey[yy * w + xx]; n++; } }
    soft[y * w + x] = s / n;
  }
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  const at = (x: number, y: number) => soft[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const all: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const Y = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    const i = y * w + x; gx[i] = X; gy[i] = Y; mag[i] = Math.hypot(X, Y);
    if ((x + y) % 3 === 0) all.push(mag[i]);
  }
  all.sort((a, b) => a - b);
  return { width: w, height: h, gx, gy, mag, strong: Math.max(20, all[Math.floor(all.length * .97)] || 0) };
}

/** Strong corners in the photo (Harris), strongest first, 0..1. The paper's corners are among them when visible. */
export function cornerCandidates(field: EdgeField, max = 40): Point[] {
  const { width: w, height: h, gx, gy } = field, R = new Float32Array(w * h), r = 2;
  let top = 0;
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    let a = 0, b = 0, c = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = (y + dy) * w + x + dx; a += gx[i] * gx[i]; b += gy[i] * gy[i]; c += gx[i] * gy[i]; }
    const v = a * b - c * c - .05 * (a + b) * (a + b); R[y * w + x] = v; if (v > top) top = v;
  }
  if (top <= 0) return [];
  const found: { x: number; y: number; v: number }[] = [], n = 4;
  for (let y = n; y < h - n; y++) for (let x = n; x < w - n; x++) {
    const v = R[y * w + x]; if (v < top * .02) continue;
    let peak = true;
    for (let dy = -n; dy <= n && peak; dy++) for (let dx = -n; dx <= n; dx++) if ((dx || dy) && R[(y + dy) * w + x + dx] > v) { peak = false; break; }
    if (peak) found.push({ x, y, v });
  }
  return found.sort((p, q) => q.v - p.v).slice(0, max).map(p => ({ x: (p.x + .5) / w, y: (p.y + .5) / h }));
}

/**
 * Where a dragged corner should land: the nearest of the detected outline's corners or the photo's strong corners
 * within `radius` (0..1 of the photo's long side), or `null` to leave it where the finger is.
 */
export function snapCorner(p: Point, aspect: number, targets: Point[], radius = .045): Point | null {
  // Distances in a square space, so the radius is the same across and along a tall photo.
  const sx = aspect >= 1 ? 1 : aspect, sy = aspect >= 1 ? 1 / aspect : 1;
  let best: Point | null = null, bestD = radius;
  for (const t of targets) { const d = Math.hypot((t.x - p.x) * sx, (t.y - p.y) * sy); if (d < bestD) { best = t; bestD = d; } }
  return best;
}

/**
 * Pulls the side a→b onto the strongest straight border nearby. Each end may move along the side's normal by at most
 * `reach` (0..1), so a tilted side can also turn onto the border. Only edges that run along the side count, and only
 * when clearly stronger than where the side is now.
 */
export function snapEdge(a: Point, b: Point, field: EdgeField, reach = .05): [Point, Point] | null {
  const { width: w, height: h, gx, gy } = field;
  const ax = a.x * w, ay = a.y * h, bx = b.x * w, by = b.y * h, len = Math.hypot(bx - ax, by - ay);
  if (len < 8) return null;
  const nx = -(by - ay) / len, ny = (bx - ax) / len, steps = Math.max(8, Math.min(60, Math.round(len / 3))), maxShift = Math.max(2, Math.round(reach * Math.max(w, h)));
  const score = (sa: number, sb: number) => {
    // The side between the two shifted ends; its own normal decides which gradients count.
    const x0 = ax + nx * sa, y0 = ay + ny * sa, x1 = bx + nx * sb, y1 = by + ny * sb, l = Math.hypot(x1 - x0, y1 - y0) || 1, mx = -(y1 - y0) / l, my = (x1 - x0) / l;
    let s = 0, n = 0;
    for (let k = 1; k < steps; k++) {
      const t = k / steps, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x; n++;
      s += Math.abs(gx[i] * mx + gy[i] * my);
    }
    return n ? s / n : 0;
  };
  const here = score(0, 0), stride = maxShift > 12 ? 2 : 1;
  let bestA = 0, bestB = 0, bestScore = here;
  for (let sa = -maxShift; sa <= maxShift; sa += stride) for (let sb = -maxShift; sb <= maxShift; sb += stride) {
    if (!sa && !sb) continue;
    const v = score(sa, sb) - (Math.abs(sa) + Math.abs(sb)) * .1;
    if (v > bestScore) { bestScore = v; bestA = sa; bestB = sb; }
  }
  // A finer look around the best coarse spot.
  if (stride > 1) for (let sa = bestA - 1; sa <= bestA + 1; sa++) for (let sb = bestB - 1; sb <= bestB + 1; sb++) { const v = score(sa, sb) - (Math.abs(sa) + Math.abs(sb)) * .1; if (v > bestScore) { bestScore = v; bestA = sa; bestB = sb; } }
  if ((!bestA && !bestB) || bestScore < field.strong * .35 || bestScore < here * 1.25) return null;
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return [{ x: c(a.x + nx * bestA / w), y: c(a.y + ny * bestA / h) }, { x: c(b.x + nx * bestB / w), y: c(b.y + ny * bestB / h) }];
}

/** Tidies a whole outline: every side pulled onto its border line, corners where neighbouring sides meet. */
export function snapQuad(q: Quad, field: EdgeField, reach = .04): Quad {
  const lines = [0, 1, 2, 3].map(i => snapEdge(q[i], q[(i + 1) % 4], field, reach) || [q[i], q[(i + 1) % 4]] as [Point, Point]);
  const meet = (l1: [Point, Point], l2: [Point, Point], fallback: Point): Point => {
    const [p, p2] = l1, [r, r2] = l2, d1 = { x: p2.x - p.x, y: p2.y - p.y }, d2 = { x: r2.x - r.x, y: r2.y - r.y }, den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9) return fallback;
    const t = ((r.x - p.x) * d2.y - (r.y - p.y) * d2.x) / den, x = p.x + d1.x * t, y = p.y + d1.y * t;
    return Math.hypot(x - fallback.x, y - fallback.y) > reach * 2 || x < 0 || y < 0 || x > 1 || y > 1 ? fallback : { x, y };
  };
  return [meet(lines[3], lines[0], q[0]), meet(lines[0], lines[1], q[1]), meet(lines[1], lines[2], q[2]), meet(lines[2], lines[3], q[3])];
}
