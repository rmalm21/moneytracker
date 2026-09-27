/**
 * The receipt photo as numbers: finding the paper, its four corners, straightening it (a true perspective warp, not
 * only a rotation), evening out the light, and judging the photo's quality. Pure functions on plain arrays (no
 * canvas, no browser), so they run in a Web Worker, on the main thread, or in tests alike. lib/receipt-prep.ts does
 * the canvas part (decoding the photo) and calls these.
 *
 * Coordinates: the "photo" is the upright photo (EXIF orientation and any quarter turn applied) at full size. The
 * warp keeps a matrix from the straightened working image back to the photo, so any word the reader finds can be
 * shown on the original photo (lib/receipt-intel.ts evidence).
 */

export type Grey = { data: Float32Array; width: number; height: number };
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Point = { x: number; y: number };
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];
export type Matrix = [number, number, number, number, number, number, number, number, number];

/* ------------------------------------------------------------------ Basics */

/** Mean over a (2r+1)² box for every pixel, with a summed-area table. */
export function boxBlur({ data, width, height }: { data: ArrayLike<number>; width: number; height: number }, r: number): Float32Array {
  const w1 = width + 1, table = new Float64Array(w1 * (height + 1)), out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) { let row = 0; for (let x = 0; x < width; x++) { row += data[y * width + x]; table[(y + 1) * w1 + x + 1] = table[y * w1 + x + 1] + row; } }
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - r), y2 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - r), x2 = Math.min(width - 1, x + r);
      out[y * width + x] = (table[(y2 + 1) * w1 + x2 + 1] - table[y1 * w1 + x2 + 1] - table[(y2 + 1) * w1 + x1] + table[y1 * w1 + x1]) / ((x2 - x1 + 1) * (y2 - y1 + 1));
    }
  }
  return out;
}
export function otsu(values: ArrayLike<number>) {
  const hist = new Float64Array(256); for (let i = 0; i < values.length; i++) hist[Math.max(0, Math.min(255, values[i] | 0))]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let back = 0, weight = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    weight += hist[t]; if (!weight) continue; const fore = values.length - weight; if (!fore) break;
    back += t * hist[t]; const mb = back / weight, mf = (sum - back) / fore, between = weight * fore * (mb - mf) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}
/** Luminance from RGBA. */
export function greyFromRgba(rgba: ArrayLike<number>, width: number, height: number): Grey {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  return { data, width, height };
}
function percentile(values: ArrayLike<number>, p: number, mask?: (i: number) => boolean) {
  const hist = new Uint32Array(256); let n = 0;
  for (let i = 0; i < values.length; i++) if (!mask || mask(i)) { hist[Math.max(0, Math.min(255, values[i] | 0))]++; n++; }
  let seen = 0; for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= n * p) return v; }
  return 255;
}

/* ------------------------------------------------------------------ Finding the receipt */

export type Paper = { x0: number; y0: number; x1: number; y1: number; score: number; mask: Uint8Array; fill: number; area: number; edges: { top: boolean; right: boolean; bottom: boolean; left: boolean } };
/**
 * The receipt: a large, solid, bright region, with its pixels (a mask); null when there is none (or it fills the
 * photo anyway). Three brightness levels are tried (paper against a dark table, a light table, a white one); the most
 * paper-like region wins: solid, bright, and not running off more than one edge of the photo.
 */
export function findPaper(grey: Grey): Paper | null {
  const { width, height } = grey, smooth = boxBlur(grey, 2), whole = width * height;
  const above = (t: number) => smooth.filter(v => v > t);
  const t1 = otsu(smooth), u1 = above(t1), t2 = u1.length > whole * .03 ? otsu(u1) : t1, u2 = above(t2), t3 = u2.length > whole * .03 ? otsu(u2) : t2;
  // And one level below: shadowed paper that is darker than the lit paper but still lighter than the table.
  const d1 = smooth.filter(v => v <= t1), t0 = d1.length > whole * .03 ? otsu(d1) : t1;
  let best: Paper | null = null;
  const found: Paper[] = [];
  for (const threshold of new Set([t0, t1, t2, t3])) {
    const seen = new Int32Array(whole), queue = new Int32Array(whole);
    let label = 0;
    for (let start = 0; start < whole; start++) {
      if (seen[start] || smooth[start] <= threshold) continue;
      label++;
      let head = 0, tail = 0, area = 0, sum = 0, x0 = width, y0 = height, x1 = 0, y1 = 0;
      queue[tail++] = start; seen[start] = label;
      while (head < tail) {
        const p = queue[head++], x = p % width, y = (p - x) / width; area++; sum += smooth[p];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !seen[p - 1] && smooth[p - 1] > threshold) { seen[p - 1] = label; queue[tail++] = p - 1; }
        if (x < width - 1 && !seen[p + 1] && smooth[p + 1] > threshold) { seen[p + 1] = label; queue[tail++] = p + 1; }
        if (y > 0 && !seen[p - width] && smooth[p - width] > threshold) { seen[p - width] = label; queue[tail++] = p - width; }
        if (y < height - 1 && !seen[p + width] && smooth[p + width] > threshold) { seen[p + width] = label; queue[tail++] = p + width; }
      }
      const boxArea = (x1 - x0 + 1) * (y1 - y0 + 1);
      if (area < whole * .03 || boxArea > whole * .9) continue;
      // A tilted rectangle fills about half to all of its box (text holes filled in); the table's streaks much less.
      let solid = 0;
      for (let y = y0; y <= y1; y++) { let first = -1, last = -1; for (let x = x0; x <= x1; x++) if (seen[y * width + x] === label) { if (first < 0) first = x; last = x; } if (first >= 0) solid += last - first + 1; }
      const fill = solid / boxArea, edges = { top: y0 === 0, right: x1 === width - 1, bottom: y1 === height - 1, left: x0 === 0 };
      const touching = +edges.top + +edges.right + +edges.bottom + +edges.left;
      if (fill < .45 || touching > 1) continue;
      const bright = sum / area / 255, score = area * fill * bright * bright * (touching ? .5 : 1);
      if (found.length >= 12 && score <= Math.min(...found.map(f => f.score))) continue;
      // Its pixels, with the holes (the printed text) filled row by row.
      const mask = new Uint8Array(whole);
      for (let y = y0; y <= y1; y++) { let first = -1, last = -1; for (let x = x0; x <= x1; x++) if (seen[y * width + x] === label) { if (first < 0) first = x; last = x; } for (let x = first; x >= 0 && x <= last; x++) mask[y * width + x] = 1; }
      const paper = { x0, y0, x1, y1, score, mask, fill, area: solid, edges };
      found.push(paper);
      if (!best || score > best.score) best = paper;
    }
  }
  // A shadow across the receipt: the brightest region is only the lit part of the paper. At a lower brightness level
  // the whole sheet (lit and shadowed) is one solid region around it; that one is the receipt.
  if (best) {
    const b = best, cx = Math.round((b.x0 + b.x1) / 2), cy = Math.round((b.y0 + b.y1) / 2);
    const touches = (p: Paper) => +p.edges.top + +p.edges.right + +p.edges.bottom + +p.edges.left;
    const wider = found.filter(p => p !== b && p.mask[cy * width + cx] && p.area > b.area * 1.08 && p.area < b.area * 2.4 && p.fill >= .6 && touches(p) <= touches(b) && p.x0 <= b.x0 + 2 && p.x1 >= b.x1 - 2 && p.y0 <= b.y0 + 2 && p.y1 >= b.y1 - 2);
    if (wider.length) best = wider.sort((p, q) => q.area - p.area)[0];
  }
  return best;
}

/**
 * Tilt in degrees: the angle at which the rows of printed text line up best (the sharpest horizontal profile).
 * Only dark marks on the paper count (darker than their surroundings), not the table or the paper's edge.
 */
export function findSkew(grey: Grey, paper: { x0: number; y0: number; x1: number; y1: number; mask?: Uint8Array } | null, limit = 15) {
  const { data, width, height } = grey, local = boxBlur(grey, 8), box = paper || { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  const inPaper = (x: number, y: number) => !paper?.mask || (paper.mask[y * width + Math.max(0, x - 8)] && paper.mask[y * width + Math.min(width - 1, x + 8)] && paper.mask[Math.max(0, y - 8) * width + x] && paper.mask[Math.min(height - 1, y + 8) * width + x]);
  const points: number[] = [];
  const step = Math.max(1, Math.round(Math.sqrt((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1) / 150000)));
  for (let y = box.y0; y <= box.y1; y += step) for (let x = box.x0; x <= box.x1; x += step) { const p = y * width + x; if (data[p] < local[p] * .78 && inPaper(x, y)) points.push(x, y); }
  if (points.length < 300) return 0;
  const score = (deg: number) => {
    const a = deg * Math.PI / 180, sin = Math.sin(a), cos = Math.cos(a), bins = new Map<number, number>();
    for (let i = 0; i < points.length; i += 2) { const bin = Math.round(points[i + 1] * cos - points[i] * sin); bins.set(bin, (bins.get(bin) || 0) + 1); }
    let total = 0; for (const count of bins.values()) total += count * count; return total;
  };
  let best = 0, bestScore = -1;
  for (let deg = -limit; deg <= limit; deg += .5) { const value = score(deg); if (value > bestScore) { bestScore = value; best = deg; } }
  for (let deg = best - .4; deg <= best + .4; deg += .1) { const value = score(deg); if (value > bestScore) { bestScore = value; best = deg; } }
  return Math.abs(best) < .3 ? 0 : Math.round(best * 10) / 10;
}

/* ------------------------------------------------------------------ The four corners */

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function cross(o: Point, a: Point, b: Point) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
export function quadArea(q: Quad) { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
/** Interior angles in degrees, and whether the quad is convex. */
function angles(q: Quad) {
  const out: number[] = []; let sign = 0, convex = true;
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4], c = q[i], n = q[(i + 1) % 4];
    const a1 = Math.atan2(p.y - c.y, p.x - c.x), a2 = Math.atan2(n.y - c.y, n.x - c.x);
    let d = Math.abs(a1 - a2) * 180 / Math.PI; if (d > 180) d = 360 - d; out.push(d);
    const s = Math.sign(cross(p, c, n)); if (s && sign && s !== sign) convex = false; if (s) sign = s;
  }
  return { list: out, convex };
}
/** Total-least-squares line through points: a point on it and its direction. */
function fitLine(points: Point[]) {
  const n = points.length; let mx = 0, my = 0; for (const p of points) { mx += p.x; my += p.y; } mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0; for (const p of points) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); }
  const theta = .5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(theta), dy = Math.sin(theta);
  let residual = 0; for (const p of points) residual += Math.abs((p.x - mx) * dy - (p.y - my) * dx); residual /= n;
  return { x: mx, y: my, dx, dy, residual };
}
function intersect(a: { x: number; y: number; dx: number; dy: number }, b: { x: number; y: number; dx: number; dy: number }): Point | null {
  const det = a.dx * b.dy - a.dy * b.dx; if (Math.abs(det) < 1e-6) return null;
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
  return { x: a.x + a.dx * t, y: a.y + a.dy * t };
}
export type Corners = { quad: Quad; confidence: 'high' | 'medium' | 'low'; /** 0..1, how well the four straight sides fit the paper. */ score: number };
/**
 * The receipt's four corners from its mask: first the extreme points (top-left has the smallest x + y, and so on),
 * then a straight line fitted to each side's edge points (a torn or bent corner does not pull the corner away), and
 * the corners are where the sides meet. Confidence is how well the quad covers the paper, with sane angles.
 */
export function paperCorners(paper: Paper, width: number, height: number): Corners {
  const edge: Point[] = [];
  for (let y = paper.y0; y <= paper.y1; y++) { let first = -1, last = -1; for (let x = paper.x0; x <= paper.x1; x++) if (paper.mask[y * width + x]) { if (first < 0) first = x; last = x; } if (first >= 0) { edge.push({ x: first, y }, { x: last, y }); } }
  for (let x = paper.x0; x <= paper.x1; x++) { let first = -1, last = -1; for (let y = paper.y0; y <= paper.y1; y++) if (paper.mask[y * width + x]) { if (first < 0) first = y; last = y; } if (first >= 0) edge.push({ x, y: first }, { x, y: last }); }
  let tl = edge[0], tr = edge[0], br = edge[0], bl = edge[0];
  for (const p of edge) { if (p.x + p.y < tl.x + tl.y) tl = p; if (p.x + p.y > br.x + br.y) br = p; if (p.x - p.y > tr.x - tr.y) tr = p; if (p.x - p.y < bl.x - bl.y) bl = p; }
  let quad: Quad = [tl, tr, br, bl];
  // Refine: points near each side (not near its ends) → a fitted line; the corners are the lines' crossings.
  const sides = [0, 1, 2, 3].map(i => ({ a: quad[i], b: quad[(i + 1) % 4], pts: [] as Point[] }));
  for (const p of edge) {
    let bestSide = -1, bestD = Infinity;
    sides.forEach((s, i) => { const len = dist(s.a, s.b) || 1, t = ((p.x - s.a.x) * (s.b.x - s.a.x) + (p.y - s.a.y) * (s.b.y - s.a.y)) / len / len; if (t < .12 || t > .88) return; const d = Math.abs(cross(s.a, s.b, p)) / len; if (d < bestD) { bestD = d; bestSide = i; } });
    if (bestSide >= 0 && bestD < Math.max(4, Math.min(width, height) * .03)) sides[bestSide].pts.push(p);
  }
  const lines = sides.map(s => s.pts.length >= 8 ? fitLine(s.pts) : null);
  if (lines.every(Boolean)) {
    const refined = [0, 1, 2, 3].map(i => intersect(lines[(i + 3) % 4]!, lines[i]!)) as (Point | null)[];
    const inside = (p: Point | null) => p && p.x > -width * .1 && p.x < width * 1.1 && p.y > -height * .1 && p.y < height * 1.1;
    if (refined.every(inside) && refined.every((p, i) => dist(p!, quad[i]) < Math.max(width, height) * .08)) quad = refined as Quad;
  }
  const { list, convex } = angles(quad), area = quadArea(quad);
  const cover = area ? Math.min(paper.area, area) / Math.max(paper.area, area) : 0;
  const saneAngles = list.every(a => a > 55 && a < 125), touching = paper.edges.top || paper.edges.right || paper.edges.bottom || paper.edges.left;
  const curved = Math.max(...lines.map(l => l?.residual || 0)) > Math.max(2, Math.min(width, height) * .012);
  const score = convex && saneAngles ? cover : cover * .5;
  const confidence = convex && saneAngles && cover >= .93 && !touching && !curved ? 'high' : convex && saneAngles && cover >= .85 ? 'medium' : 'low';
  return { quad, confidence, score };
}

/* ------------------------------------------------------------------ Perspective */

/** Solves A·x = b (n×n) by Gaussian elimination with pivoting. */
function solveLinear(A: number[][], b: number[]) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    if (Math.abs(M[pivot][c]) < 1e-12) return null;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
/** The projective matrix that maps each `from` point onto the matching `to` point. */
export function homography(from: Quad, to: Quad): Matrix | null {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solveLinear(A, b);
  return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
}
export function mapPoint(m: Matrix, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}
export function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array(9).fill(0) as Matrix;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}
/** Rotation by `deg` around (cx, cy). */
export function rotation(deg: number, cx: number, cy: number): Matrix {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy, 0, 0, 1];
}
/** The straightened size of a quad: the longer of each pair of opposite sides. */
export function quadSize(q: Quad) { return { width: Math.max(dist(q[0], q[1]), dist(q[3], q[2])), height: Math.max(dist(q[0], q[3]), dist(q[1], q[2])) }; }
/**
 * Straightens: every pixel of the output (outW × outH) is looked up in the source through `toSource` (output →
 * source coordinates), with bilinear sampling. Outside the source, or outside `keep` (a mask on the source grid,
 * scaled by keepScale), the paper is white.
 */
export function warp(source: { data: ArrayLike<number>; width: number; height: number }, toSource: Matrix, outW: number, outH: number, keep?: { mask: Uint8Array; width: number; height: number; scale: number }): Uint8ClampedArray {
  const { data, width, height } = source, out = new Uint8ClampedArray(outW * outH);
  const [a, b, c, d, e, f, g, h, i] = toSource;
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const w = g * u + h * v + i, x = (a * u + b * v + c) / w, y = (d * u + e * v + f) / w;
      const o = v * outW + u;
      if (!(x >= 0 && y >= 0 && x <= width - 1 && y <= height - 1)) { out[o] = 255; continue; }
      if (keep) { const kx = Math.round(x * keep.scale), ky = Math.round(y * keep.scale); if (kx < 0 || ky < 0 || kx >= keep.width || ky >= keep.height || !keep.mask[ky * keep.width + kx]) { out[o] = 255; continue; } }
      const x0 = x | 0, y0 = y | 0, x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1), fx = x - x0, fy = y - y0;
      const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx, bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
      out[o] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/**
 * Text running into the edge of a straightened receipt: the crop probably cut the receipt (a shadow over one side
 * made the paper look smaller than it is). Receipts have a blank margin, so ink right at the edge is a warning sign.
 */
export function inkAtEdges(grey: ArrayLike<number>, width: number, height: number) {
  const local = boxBlur({ data: grey, width, height }, Math.max(6, Math.round(width / 90)));
  const bandX = Math.max(4, Math.round(width * .018)), bandY = Math.max(4, Math.round(height * .012));
  const frac = (x0: number, x1: number, y0: number, y1: number) => { let ink = 0, all = 0; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = y * width + x; all++; if (grey[i] < local[i] * .72 && grey[i] < 170) ink++; } return all ? ink / all : 0; };
  const center = frac(Math.round(width * .2), Math.round(width * .8), Math.round(height * .2), Math.round(height * .8));
  const sides = { left: frac(0, bandX, 0, height), right: frac(width - bandX, width, 0, height), top: frac(0, width, 0, bandY), bottom: frac(0, width, height - bandY, height) };
  const limit = Math.max(.012, center * .3);
  return { ...sides, center, cut: (Object.keys(sides) as (keyof typeof sides)[]).filter(k => sides[k] > limit) };
}

/* ------------------------------------------------------------------ Light and contrast */

export type Variants = {
  /** A: the straightened grey, grain removed, nothing else (for a receipt that is already clean). */
  clean: Uint8ClampedArray;
  /** B/D/E: light evened out (shadows removed), contrast stretched, slightly sharpened. */
  even: Uint8ClampedArray;
  /** C: black and white by the local average (Bradley), for faded thermal print. */
  bw: Uint8ClampedArray;
};
/**
 * The reading variants of a straightened receipt. `outside` marks pixels that are not paper (kept white).
 * Shadow and uneven light: each pixel is divided by its neighbourhood's brightness (the paper around it), so dark
 * text stays dark and the paper becomes evenly white wherever the light falls.
 */
export function variants(grey: Uint8ClampedArray, width: number, height: number, outside?: Uint8Array): Variants {
  const n = width * height;
  const denoised = boxBlur({ data: grey, width, height }, 1);
  const clean = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) clean[i] = denoised[i];
  const background = boxBlur({ data: denoised, width, height }, Math.max(12, Math.round(width / 22)));
  const flat = new Float32Array(n);
  for (let i = 0; i < n; i++) flat[i] = Math.min(255, denoised[i] / Math.max(1, background[i]) * 235);
  const low = percentile(flat, .005), high = 255 - percentile(flat.map(v => 255 - v), .02);
  const span = Math.max(20, high - low);
  for (let i = 0; i < n; i++) flat[i] = Math.max(0, Math.min(255, (flat[i] - low) * 255 / span));
  const soft = boxBlur({ data: flat, width, height }, 1);
  const even = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) even[i] = flat[i] + .8 * (flat[i] - soft[i]);
  const local = boxBlur({ data: flat, width, height }, Math.max(8, Math.round(width / 28)));
  const bw = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) bw[i] = flat[i] < local[i] * .86 ? 0 : 255;
  if (outside) for (let i = 0; i < n; i++) if (outside[i]) { clean[i] = 255; even[i] = 255; bw[i] = 255; }
  return { clean, even, bw };
}

/* ------------------------------------------------------------------ Quality */

export type Level = 'good' | 'warning' | 'poor';
export type Quality = {
  blur: Level; exposure: Level; glare: Level; contrast: Level; shadow: Level; documentCoverage: Level; edges: Level; resolution: Level; perspective: Level; skew: Level;
  /** Friendly, in Indonesian, most important first. */
  warnings: string[];
  /** True when reading is unlikely to work; the user is offered to retake it. */
  retake: boolean;
  /** Raw numbers for the debug view only. */
  numbers: Record<string, number>;
};
/**
 * Sharpness of text: the average strength of the steepest edges, relative to the text's contrast. A sharp photo has
 * letter edges that go from paper to ink within a pixel or two; a blurred one spreads them out.
 */
export function sharpness(grey: { data: ArrayLike<number>; width: number; height: number }) {
  const { data, width, height } = grey, grads: number[] = [];
  const step = Math.max(1, Math.round(Math.sqrt(width * height / 400000)));
  for (let y = 1; y < height - 1; y += step) for (let x = 1; x < width - 1; x += step) {
    const p = y * width + x, gx = data[p + 1] - data[p - 1], gy = data[p + width] - data[p - width];
    const g = Math.abs(gx) + Math.abs(gy); if (g > 12) grads.push(g);
  }
  if (grads.length < 200) return 0;
  grads.sort((a, b) => b - a);
  const top = grads.slice(0, Math.max(50, Math.round(grads.length * .1)));
  const strength = top.reduce((s, v) => s + v, 0) / top.length;
  const contrast = Math.max(40, percentile(data, .98) - percentile(data, .02));
  return strength / contrast;
}
/**
 * How good the photo is for reading, from the small preview (whole photo) and the straightened working image.
 * `letter` is the text height in the working image (px), when known.
 */
export function assessQuality(input: { preview: Grey; paper: Paper | null; corners: Corners | null; skew: number; photoWidth: number; photoHeight: number; receiptWidthInPhoto: number; working: { data: ArrayLike<number>; width: number; height: number } | null }): Quality {
  const { preview, paper, corners } = input, numbers: Record<string, number> = {};
  const inside = (i: number) => !paper || paper.mask[i] === 1;
  const w = preview.width, h = preview.height;
  const bright = percentile(preview.data, .5, inside), clipped = (() => { let n = 0, all = 0; for (let i = 0; i < preview.data.length; i++) if (inside(i)) { all++; if (preview.data[i] >= 250) n++; } return all ? n / all : 0; })();
  const spread = percentile(preview.data, .95, inside) - percentile(preview.data, .05, inside);
  numbers.brightness = bright; numbers.clipped = clipped; numbers.spread = spread;
  // Glare: a bright, saturated spot on the paper; which third of the receipt it is in.
  let glareWhere = '';
  if (paper) {
    const rows = [0, 0, 0], counts = [0, 0, 0], ph = paper.y1 - paper.y0 + 1;
    for (let y = paper.y0; y <= paper.y1; y++) for (let x = paper.x0; x <= paper.x1; x++) { const i = y * w + x; if (!paper.mask[i]) continue; const third = Math.min(2, Math.floor((y - paper.y0) / ph * 3)); counts[third]++; if (preview.data[i] >= 252) rows[third]++; }
    const worst = [0, 1, 2].sort((a, b) => rows[b] / (counts[b] || 1) - rows[a] / (counts[a] || 1))[0];
    numbers.glareSpot = rows[worst] / (counts[worst] || 1);
    glareWhere = ['atas', 'tengah', 'bawah'][worst];
  }
  // Shadow: how much the paper's own brightness changes across it (text removed by a wide blur).
  let shadowRange = 0;
  if (paper) { const bg = boxBlur(preview, Math.max(6, Math.round(Math.min(w, h) / 30))); shadowRange = (percentile(bg, .95, inside) - percentile(bg, .05, inside)) / Math.max(1, percentile(bg, .95, inside)); }
  numbers.shadow = shadowRange;
  const coverage = paper ? paper.area / (w * h) : 1;
  numbers.coverage = coverage;
  const sharp = input.working ? sharpness(input.working) : 0;
  numbers.sharpness = sharp;
  let perspectiveRatio = 1;
  if (corners) { const q = corners.quad; perspectiveRatio = Math.max(dist(q[0], q[1]) / Math.max(1, dist(q[3], q[2])), dist(q[3], q[2]) / Math.max(1, dist(q[0], q[1])), dist(q[0], q[3]) / Math.max(1, dist(q[1], q[2])), dist(q[1], q[2]) / Math.max(1, dist(q[0], q[3]))); }
  numbers.perspective = perspectiveRatio; numbers.receiptWidth = input.receiptWidthInPhoto;
  const level = (poor: boolean, warn: boolean): Level => poor ? 'poor' : warn ? 'warning' : 'good';
  const cut = paper ? (paper.edges.bottom ? 'bawah' : paper.edges.top ? 'atas' : paper.edges.left ? 'kiri' : paper.edges.right ? 'kanan' : '') : '';
  const q: Quality = {
    blur: input.working ? level(sharp > 0 && sharp < .28, sharp < .42) : 'good',
    exposure: level(bright < 70 || clipped > .6, bright < 115 || clipped > .35),
    glare: level(false, (numbers.glareSpot || 0) > .12),
    contrast: level(spread < 35, spread < 70),
    shadow: level(false, shadowRange > .35),
    documentCoverage: level(Boolean(paper) && coverage < .05, Boolean(paper) && coverage < .12),
    edges: level(false, Boolean(cut)),
    resolution: level(input.receiptWidthInPhoto > 0 && input.receiptWidthInPhoto < 380, input.receiptWidthInPhoto > 0 && input.receiptWidthInPhoto < 620),
    perspective: level(perspectiveRatio > 1.6, perspectiveRatio > 1.15),
    skew: level(false, Math.abs(input.skew) > 10),
    warnings: [], retake: false, numbers,
  };
  if (q.blur !== 'good') q.warnings.push(q.blur === 'poor' ? 'Foto terlalu buram untuk dibaca dengan baik.' : 'Foto agak buram.');
  if (q.exposure !== 'good') q.warnings.push(bright < 115 ? 'Foto terlalu gelap.' : 'Foto terlalu terang.');
  if (q.glare !== 'good') q.warnings.push(`Bagian ${glareWhere} terkena pantulan cahaya.`);
  if (q.edges !== 'good') q.warnings.push(`Ujung ${cut} struk terpotong.`);
  if (q.documentCoverage !== 'good') q.warnings.push('Struk terlalu kecil di dalam foto. Dekatkan kamera.');
  if (q.resolution !== 'good' && q.documentCoverage === 'good') q.warnings.push('Resolusi foto kecil; tulisan bisa sulit terbaca.');
  if (q.contrast !== 'good') q.warnings.push('Tulisan kurang kontras (mungkin sudah pudar).');
  if (q.shadow !== 'good') q.warnings.push('Ada bayangan di atas struk.');
  if (q.perspective === 'poor') q.warnings.push('Foto diambil terlalu miring.');
  q.retake = [q.blur, q.exposure, q.documentCoverage, q.resolution, q.contrast].includes('poor');
  return q;
}

/* ------------------------------------------------------------------ Encoding and regions */

/** An 8-bit grey BMP (Tesseract reads it directly; much faster to make than a PNG). */
export function toBmp(values: ArrayLike<number>, width: number, height: number): Uint8Array {
  const row = (width + 3) & ~3, size = 54 + 1024 + row * height, out = new Uint8Array(size), view = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d; view.setUint32(2, size, true); view.setUint32(10, 54 + 1024, true);
  view.setUint32(14, 40, true); view.setInt32(18, width, true); view.setInt32(22, height, true); view.setUint16(26, 1, true); view.setUint16(28, 8, true);
  view.setUint32(34, row * height, true); view.setInt32(38, 11811, true); view.setInt32(42, 11811, true); view.setUint32(46, 256, true);
  for (let i = 0; i < 256; i++) { out[54 + i * 4] = i; out[54 + i * 4 + 1] = i; out[54 + i * 4 + 2] = i; }
  for (let y = 0; y < height; y++) { const dst = 54 + 1024 + (height - 1 - y) * row; for (let x = 0; x < width; x++) out[dst + x] = values[y * width + x]; }
  return out;
}
export type Rect = { x: number; y: number; width: number; height: number };
/** A piece of an image, enlarged `scale` times (bilinear), with a white border of `pad` px (Tesseract likes margins). */
export function cropRegion(values: ArrayLike<number>, width: number, height: number, rect: Rect, scale = 1, pad = 12): Pixels {
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y)), x1 = Math.min(width, Math.ceil(rect.x + rect.width)), y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  const w = Math.max(1, Math.round((x1 - x0) * scale)), h = Math.max(1, Math.round((y1 - y0) * scale)), W = w + pad * 2, H = h + pad * 2;
  const data = new Uint8ClampedArray(W * H).fill(255);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const x = Math.min(x1 - 1, x0 + u / scale), y = Math.min(y1 - 1, y0 + v / scale), xa = x | 0, ya = y | 0, xb = Math.min(width - 1, xa + 1), yb = Math.min(height - 1, ya + 1), fx = x - xa, fy = y - ya;
    data[(v + pad) * W + u + pad] = (values[ya * width + xa] * (1 - fx) + values[ya * width + xb] * fx) * (1 - fy) + (values[yb * width + xa] * (1 - fx) + values[yb * width + xb] * fx) * fy;
  }
  return { data, width: W, height: H };
}
