/**
 * Preparing a receipt photo for reading, the way a scanner would (browser; runs in a Web Worker when the browser has
 * OffscreenCanvas, otherwise on the page). The original photo is never changed: everything here is a working copy
 * that is thrown away after reading.
 *
 *  1. The photo is decoded upright (EXIF orientation, plus any quarter turn the user asked for).
 *  2. On a small copy the receipt is found and its four corners measured (lib/receipt-image.ts).
 *  3. Perspective: the four corners are pulled to a rectangle (a true perspective warp), then any tilt left in the
 *     text rows is measured and taken out. When the outline is not clear (a shadow across the edge, a crumpled
 *     receipt), the older safe way is used: a rotation and a generous crop. The user can also set the corners by hand.
 *  4. Reading variants are made: clean grey, light evened out, and black-and-white.
 *  5. The photo's quality is judged (blur, light, glare, size…) in plain words.
 */
import { looksLikeScreenshot } from './receipt-digital.ts';
import { assessQuality, findPaper, findSkew, greyFromRgba, homography, inkAtEdges, mapPoint, multiply, paperCorners, quadSize, rotation, variants, warp, type Corners, type Grey, type Matrix, type Point, type Quad, type Quality } from './receipt-image.ts';

export type PrepareOptions = { turn?: number; /** Corners set by hand, 0..1 of the upright photo (top-left, top-right, bottom-right, bottom-left). */ corners?: Quad };
export type Prepared = {
  width: number; height: number;
  clean: Uint8ClampedArray; even: Uint8ClampedArray; bw: Uint8ClampedArray;
  /** Working image pixel → upright photo pixel. */
  toPhoto: Matrix; photoWidth: number; photoHeight: number;
  /** The receipt's corners, 0..1 of the upright photo. */
  corners: Quad; cornerConfidence: Corners['confidence'] | 'manual' | 'none';
  /** How the receipt was straightened. */
  method: 'perspective' | 'rotate' | 'manual' | 'none';
  skew: number; landscape: boolean; cropped: boolean; quality: Quality; ms: number;
  /** A phone screenshot (read as it is), not a photo of paper. */
  digital?: boolean;
  /**
   * 7.4: where the paper itself is, 0..1 of the upright photo, for the corner editor's starting outline: the found
   * corners even when not sure enough to straighten by, else the paper's box turned by the tilt. Absent: no paper.
   */
  outline?: Quad;
};

type Canvas2D = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D };
function makeCanvas(width: number, height: number): Canvas2D {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw Error('Foto belum bisa diproses di perangkat ini.');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}
/** Frees a canvas's memory right away (phones keep them alive otherwise). */
const release = (c: Canvas2D) => { c.canvas.width = 1; c.canvas.height = 1; };
async function loadBitmap(photo: Blob) {
  try { return await createImageBitmap(photo, { imageOrientation: 'from-image' }); }
  catch { return await createImageBitmap(photo); }
}
const scaleQuad = (q: Quad, sx: number, sy = sx): Quad => q.map(p => ({ x: p.x * sx, y: p.y * sy })) as Quad;
const rectQuad = (w: number, h: number): Quad => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

export async function preparePhoto(photo: Blob, options: PrepareOptions = {}): Promise<Prepared> {
  const started = Date.now(), bitmap = await loadBitmap(photo);
  try {
    const quarter = (((options.turn || 0) % 4) + 4) % 4, sideways = quarter % 2 === 1;
    const W = sideways ? bitmap.height : bitmap.width, H = sideways ? bitmap.width : bitmap.height;
    /** Draws the upright photo, region (x, y, w, h) of it, at `scale`. */
    const draw = (target: Canvas2D, scale: number, rx = 0, ry = 0) => {
      const { ctx } = target; ctx.save(); ctx.scale(scale, scale); ctx.translate(-rx, -ry); ctx.translate(W / 2, H / 2); ctx.rotate(quarter * Math.PI / 2);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2); ctx.restore();
    };
    // 2. The receipt and its corners, on a small copy.
    const small = Math.min(1, 960 / Math.max(W, H)), preview = makeCanvas(W * small, H * small); draw(preview, small);
    const lowGrey: Grey = greyFromRgba(preview.ctx.getImageData(0, 0, preview.canvas.width, preview.canvas.height).data, preview.canvas.width, preview.canvas.height);
    release(preview);
    // A screenshot (an order screen, an e-receipt) is read as it is: no paper to find, nothing to straighten.
    const digital = !options.corners && looksLikeScreenshot(lowGrey.data, lowGrey.width, lowGrey.height);
    const paper = digital ? null : findPaper(lowGrey), found = paper ? paperCorners(paper, lowGrey.width, lowGrey.height) : null;
    let cutFound = false;
    // 3. The shape to straighten (in upright-photo pixels).
    const sure = Boolean(paper && paper.fill >= .72);
    const shape = (loose: boolean): { method: Prepared['method']; quad: Quad; skew: number; keepMask: boolean } => {
      if (options.corners) return { method: 'manual', quad: scaleQuad(options.corners, W, H), skew: 0, keepMask: false };
      if (!loose && paper && found && found.confidence !== 'low') return { method: 'perspective', quad: scaleQuad(found.quad, 1 / small), skew: 0, keepMask: false };
      // The older safe way: measure the tilt, and crop around the paper (generously when its outline is unclear).
      const tight = sure && !loose;
      const area = paper && (tight ? paper : { ...paper, mask: undefined, x0: Math.max(0, Math.round(paper.x0 - (paper.x1 - paper.x0) * .35)), x1: Math.min(lowGrey.width - 1, Math.round(paper.x1 + (paper.x1 - paper.x0) * .35)), y0: Math.max(0, Math.round(paper.y0 - (paper.y1 - paper.y0) * .2)), y1: Math.min(lowGrey.height - 1, Math.round(paper.y1 + (paper.y1 - paper.y0) * .2)) });
      const box = area || { x0: 0, y0: 0, x1: lowGrey.width - 1, y1: lowGrey.height - 1 };
      const skew = digital ? 0 : findSkew(lowGrey, area || null);
      const margin = .025, pw = (box.x1 - box.x0 + 1) / small, ph = (box.y1 - box.y0 + 1) / small;
      const cx = (box.x0 + box.x1 + 1) / 2 / small, cy = (box.y0 + box.y1 + 1) / 2 / small, rad = skew * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
      const cw = Math.min(W * 1.2, (pw * cos + ph * sin) * (1 + margin * 2)), ch = Math.min(H * 1.2, (pw * sin + ph * cos) * (1 + margin * 2));
      const corner = (dx: number, dy: number): Point => ({ x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) });
      return { method: paper ? 'rotate' : 'none', quad: [corner(-cw / 2, -ch / 2), corner(cw / 2, -ch / 2), corner(cw / 2, ch / 2), corner(-cw / 2, ch / 2)], skew, keepMask: tight };
    };
    /** Straightens `quad` into the working image (and takes out tilt left after a perspective warp). */
    const straighten = (geometry: ReturnType<typeof shape>) => {
      const { quad } = geometry;
      // Output size: the receipt ~1300 px wide (≈ 30 px letters on a 40-character receipt), within a pixel budget.
      const size = quadSize(quad);
      let scale = Math.max(.5, Math.min(3, 1300 / Math.max(1, size.width)));
      scale = Math.min(scale, Math.sqrt(9_000_000 / Math.max(1, size.width * size.height)));
      const outW = Math.max(1, Math.round(size.width * scale)), outH = Math.max(1, Math.round(size.height * scale));
      let toPhoto = homography(rectQuad(outW, outH), quad) as Matrix;
      if (!toPhoto) throw Error('Foto belum bisa diluruskan.');
      // The part of the photo needed, drawn once at about the output's resolution.
      const xs = quad.map(p => p.x), ys = quad.map(p => p.y);
      const rx = Math.max(0, Math.floor(Math.min(...xs)) - 2), ry = Math.max(0, Math.floor(Math.min(...ys)) - 2), rw = Math.min(W, Math.ceil(Math.max(...xs)) + 2) - rx, rh = Math.min(H, Math.ceil(Math.max(...ys)) + 2) - ry;
      const s1 = Math.min(1, scale * 1.05), region = makeCanvas(Math.max(1, rw * s1), Math.max(1, rh * s1)); draw(region, s1, rx, ry);
      const source = greyFromRgba(region.ctx.getImageData(0, 0, region.canvas.width, region.canvas.height).data, region.canvas.width, region.canvas.height);
      release(region);
      const photoToSource: Matrix = [s1, 0, -rx * s1, 0, s1, -ry * s1, 0, 0, 1];
      let grey = warp(source, multiply(photoToSource, toPhoto), outW, outH), skew = geometry.skew;
      // Tilt left after the perspective warp (a corner found a little off): measured on the straightened text, and
      // taken out only when it is clear and small.
      if (geometry.method === 'perspective' || geometry.method === 'manual') {
        const residual = findSkew({ data: Float32Array.from(grey), width: outW, height: outH }, null, 6);
        if (Math.abs(residual) >= .4 && Math.abs(residual) <= 5) {
          skew = residual;
          toPhoto = multiply(toPhoto, rotation(residual, outW / 2, outH / 2));
          grey = warp(source, multiply(photoToSource, toPhoto), outW, outH);
        }
      }
      return { grey, outW, outH, toPhoto, skew, size };
    };
    let geometry = shape(false), out = straighten(geometry);
    // Text running into the crop's edge: the receipt was cut (often a shadow over one side). Read it with a generous crop.
    if (!options.corners && geometry.method !== 'none' && inkAtEdges(out.grey, out.outW, out.outH).cut.some(side => side === 'left' || side === 'right')) {
      const wider = shape(true);
      geometry = { ...wider, method: wider.method };
      out = straighten(geometry);
      cutFound = true;
    }
    const { grey, outW, outH, toPhoto, size } = out, method = geometry.method, skew = out.skew, keepMask = geometry.keepMask;
    // Outside a clearly found receipt (the table) is white, so it is not read as text.
    let outside: Uint8Array | undefined;
    if (keepMask && paper) {
      outside = new Uint8Array(outW * outH);
      for (let v = 0; v < outH; v++) for (let u = 0; u < outW; u++) { const p = mapPoint(toPhoto, u, v), kx = Math.round(p.x * small), ky = Math.round(p.y * small); if (kx < 0 || ky < 0 || kx >= lowGrey.width || ky >= lowGrey.height || !paper.mask[ky * lowGrey.width + kx]) outside[v * outW + u] = 1; }
    }
    const judged = assessQuality({ preview: lowGrey, paper, corners: found, skew, photoWidth: W, photoHeight: H, receiptWidthInPhoto: size.width, working: { data: grey, width: outW, height: outH } });
    // A screenshot has no paper, light, glare or angle: only a small resolution is worth saying.
    const quality = digital ? { ...judged, warnings: judged.warnings.filter(w => /^Resolusi/.test(w)), retake: false } : judged;
    const { clean, even, bw } = variants(grey, outW, outH, outside);
    // The paper for the editor: found corners (any confidence), else its box turned by the tilt, in 0..1.
    const lw = lowGrey.width, lh = lowGrey.height;
    const outline: Quad | undefined = options.corners ? options.corners : found ? scaleQuad(found.quad, 1 / lw, 1 / lh) : paper ? (() => {
      const rad = (geometry.method === 'rotate' ? skew : 0) * Math.PI / 180, cx = (paper.x0 + paper.x1 + 1) / 2, cy = (paper.y0 + paper.y1 + 1) / 2, hw = (paper.x1 - paper.x0 + 1) / 2, hh = (paper.y1 - paper.y0 + 1) / 2;
      const c = Math.cos(rad), sn = Math.sin(rad), at = (dx: number, dy: number) => ({ x: (cx + dx * c - dy * sn) / lw, y: (cy + dx * sn + dy * c) / lh });
      return [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)] as Quad;
    })() : undefined;
    return {
      width: outW, height: outH, clean, even, bw, toPhoto, photoWidth: W, photoHeight: H, ...(outline ? { outline } : {}),
      corners: scaleQuad(geometry.quad, 1 / W, 1 / H), cornerConfidence: method === 'manual' ? 'manual' : cutFound ? 'low' : found ? found.confidence : 'none', method,
      skew, landscape: size.width > size.height * 1.25, cropped: Boolean(paper) || method === 'manual', quality, ms: Date.now() - started, ...(digital ? { digital } : {}),
    };
  } finally { bitmap.close(); }
}

/**
 * The receipt as it was read: the photo cut to the chosen area and straightened (what the reading used), as a JPEG.
 * `target` maps the straightened image (width × height) onto the upright photo (photoWidth × photoHeight), like a
 * prepared photo does; `quadTarget` builds one from four corners (0..1 of the photo) before anything is read.
 * 7.4: cut from the original photo (not the small upright copy), with bilinear sampling, up to `longSide` pixels and
 * never larger than the photo holds, so the cut keeps the photo's own sharpness.
 */
export type Straightened = { url: string; blob: Blob; width: number; height: number };
export function quadTarget(corners: Quad, photoWidth: number, photoHeight: number) {
  const q = corners.map(p => ({ x: p.x * photoWidth, y: p.y * photoHeight })) as Quad, size = quadSize(q);
  const width = Math.max(1, Math.round(size.width)), height = Math.max(1, Math.round(size.height));
  const toPhoto = homography(rectQuad(width, height), q);
  return toPhoto ? { toPhoto, photoWidth, photoHeight, width, height } : null;
}
/** The upright photo's pixels: the original turned a quarter at a time, at most `cap` pixels on its long side. */
async function uprightPixels(source: string | { photo: Blob; turn: number }, cap: number) {
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, W: number, H: number, close = () => {};
  if (typeof source === 'string') {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('Foto belum bisa ditampilkan.')); img.src = source; });
    W = image.naturalWidth; H = image.naturalHeight; draw = (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h);
  } else {
    const bitmap = await loadBitmap(source.photo), quarter = ((source.turn % 4) + 4) % 4, sideways = quarter % 2 === 1;
    W = sideways ? bitmap.height : bitmap.width; H = sideways ? bitmap.width : bitmap.height; close = () => bitmap.close();
    draw = (ctx, w, h) => { ctx.scale(w / W, h / H); ctx.translate(W / 2, H / 2); ctx.rotate(quarter * Math.PI / 2); ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2); };
  }
  try {
    const scale = Math.min(1, cap / Math.max(W, H)), iw = Math.max(1, Math.round(W * scale)), ih = Math.max(1, Math.round(H * scale));
    const canvas = document.createElement('canvas'); canvas.width = iw; canvas.height = ih;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Foto belum bisa ditampilkan.');
    ctx.imageSmoothingQuality = 'high'; draw(ctx, iw, ih);
    const pixels = ctx.getImageData(0, 0, iw, ih).data; canvas.width = 1; canvas.height = 1;
    return { pixels, iw, ih };
  } finally { close(); }
}
export async function straightenedPreview(source: string | { photo: Blob; turn: number }, target: { toPhoto: Matrix; photoWidth: number; photoHeight: number; width: number; height: number }, longSide = 2400): Promise<Straightened> {
  const { pixels, iw, ih } = await uprightPixels(source, 3200);
  // As large as the photo holds (no blow-up), long side at most `longSide`.
  const detail = Math.min(iw / target.photoWidth, ih / target.photoHeight);
  const scale = Math.min(longSide / Math.max(target.width, target.height), detail);
  const w = Math.max(1, Math.round(target.width * scale)), h = Math.max(1, Math.round(target.height * scale));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'); if (!ctx) throw Error('Foto belum bisa ditampilkan.');
  const data = ctx.createImageData(w, h), sx = iw / target.photoWidth, sy = ih / target.photoHeight, m = target.toPhoto;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Bilinear: the four photo pixels around the point, weighted by distance (smooth letters instead of jagged ones).
    const u = (x + .5) / scale, v = (y + .5) / scale, d = m[6] * u + m[7] * v + m[8];
    const px = Math.min(iw - 1.001, Math.max(0, ((m[0] * u + m[1] * v + m[2]) / d) * sx - .5)), py = Math.min(ih - 1.001, Math.max(0, ((m[3] * u + m[4] * v + m[5]) / d) * sy - .5));
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0, a = (y0 * iw + x0) * 4, b = a + 4, c = a + iw * 4, e = c + 4, to = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) data.data[to + k] = (pixels[a + k] * (1 - fx) + pixels[b + k] * fx) * (1 - fy) + (pixels[c + k] * (1 - fx) + pixels[e + k] * fx) * fy;
    data.data[to + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(Error('Foto belum bisa ditampilkan.')), 'image/jpeg', .92));
  out.width = 1; out.height = 1;
  return { url: URL.createObjectURL(blob), blob, width: w, height: h };
}
/**
 * 7.4: the outline the corner editor starts with. The paper's own outline when it is a plausible receipt shape (near
 * right angles, opposite sides alike, not tiny); otherwise the reading's crop (which can be generous, up to the whole
 * photo). A shadow across the paper cuts the found shape at a slant, and that is not offered as the receipt.
 */
export function editorStart(prepared: Pick<Prepared, 'corners' | 'outline' | 'photoWidth' | 'photoHeight'>): Quad {
  const o = prepared.outline;
  if (!o) return prepared.corners;
  const q = o.map(p => ({ x: p.x * prepared.photoWidth, y: p.y * prepared.photoHeight }));
  const side = (i: number) => Math.hypot(q[(i + 1) % 4].x - q[i].x, q[(i + 1) % 4].y - q[i].y);
  const angle = (i: number) => { const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4], u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y }; return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) || 1)))) * 180 / Math.PI; };
  const area = Math.abs(q.reduce((n, p, i) => n + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0)) / 2;
  const alike = (a: number, b: number) => Math.min(a, b) / (Math.max(a, b) || 1) >= .75;
  const turns = q.map((p, i) => { const b = q[(i + 1) % 4], c = q[(i + 2) % 4]; return Math.sign((b.x - p.x) * (c.y - b.y) - (b.y - p.y) * (c.x - b.x)); });
  // Top and bottom stay nearly parallel on a photographed receipt (the phone tilts along it, so the sides may meet).
  const heading = (i: number) => Math.atan2(q[(i + 1) % 4].y - q[i].y, q[(i + 1) % 4].x - q[i].x) * 180 / Math.PI;
  const apart = (a: number, b: number) => { const d = Math.abs(((a - b) % 180 + 180) % 180); return Math.min(d, 180 - d); };
  const plausible = [0, 1, 2, 3].every(i => angle(i) >= 72 && angle(i) <= 108) && alike(side(0), side(2)) && alike(side(1), side(3))
    && apart(heading(0), heading(2)) <= 6 && apart(heading(1), heading(3)) <= 14
    // A whole side on the photo's edge: the paper runs off the frame there, so what was found may be only part of it.
    && !o.some((p, i) => { const n = o[(i + 1) % 4]; return (p.x < .02 && n.x < .02) || (p.x > .98 && n.x > .98) || (p.y < .02 && n.y < .02) || (p.y > .98 && n.y > .98); })
    && area >= prepared.photoWidth * prepared.photoHeight * .08 && turns.every(t => t === turns[0]);
  return plausible ? o : prepared.corners;
}
/** A smaller upright copy of the photo (for the corner editor and "where was this read"), as an object URL. */
export async function uprightPreview(photo: Blob, turn = 0, longSide = 1600): Promise<{ url: string; width: number; height: number }> {
  const bitmap = await loadBitmap(photo);
  try {
    const quarter = ((turn % 4) + 4) % 4, sideways = quarter % 2 === 1;
    const W = sideways ? bitmap.height : bitmap.width, H = sideways ? bitmap.width : bitmap.height, scale = Math.min(1, longSide / Math.max(W, H));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Foto belum bisa ditampilkan.');
    ctx.imageSmoothingQuality = 'high'; ctx.scale(scale, scale); ctx.translate(W / 2, H / 2); ctx.rotate(quarter * Math.PI / 2); ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Foto belum bisa ditampilkan.')), 'image/jpeg', .9));
    canvas.width = 1; canvas.height = 1;
    return { url: URL.createObjectURL(blob), width: W, height: H };
  } finally { bitmap.close(); }
}
