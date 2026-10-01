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
    return {
      width: outW, height: outH, clean, even, bw, toPhoto, photoWidth: W, photoHeight: H,
      corners: scaleQuad(geometry.quad, 1 / W, 1 / H), cornerConfidence: method === 'manual' ? 'manual' : cutFound ? 'low' : found ? found.confidence : 'none', method,
      skew, landscape: size.width > size.height * 1.25, cropped: Boolean(paper) || method === 'manual', quality, ms: Date.now() - started, ...(digital ? { digital } : {}),
    };
  } finally { bitmap.close(); }
}

/** A small upright copy of the photo (for the corner editor and "where was this read"), as an object URL. */
/**
 * The receipt as it was read: the upright photo cut to the chosen area and straightened (what the reading used), as a
 * small JPEG. `target` maps the straightened image (width × height) onto the photo (photoWidth × photoHeight), like
 * a prepared photo does; `quadTarget` builds one from four corners (0..1 of the photo) before anything is read.
 */
export type Straightened = { url: string; blob: Blob; width: number; height: number };
export function quadTarget(corners: Quad, photoWidth: number, photoHeight: number) {
  const q = corners.map(p => ({ x: p.x * photoWidth, y: p.y * photoHeight })) as Quad, size = quadSize(q);
  const width = Math.max(1, Math.round(size.width)), height = Math.max(1, Math.round(size.height));
  const toPhoto = homography(rectQuad(width, height), q);
  return toPhoto ? { toPhoto, photoWidth, photoHeight, width, height } : null;
}
export async function straightenedPreview(uprightUrl: string, target: { toPhoto: Matrix; photoWidth: number; photoHeight: number; width: number; height: number }, longSide = 1000): Promise<Straightened> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('Foto belum bisa ditampilkan.')); img.src = uprightUrl; });
  const iw = image.naturalWidth, ih = image.naturalHeight;
  const src = document.createElement('canvas'); src.width = iw; src.height = ih;
  const sctx = src.getContext('2d', { willReadFrequently: true }); if (!sctx) throw Error('Foto belum bisa ditampilkan.');
  sctx.drawImage(image, 0, 0); const pixels = sctx.getImageData(0, 0, iw, ih).data; src.width = 1; src.height = 1;
  // As large as the photo holds (no blow-up), long side at most `longSide`.
  const detail = Math.min(iw / target.photoWidth, ih / target.photoHeight);
  const scale = Math.min(longSide / Math.max(target.width, target.height), detail);
  const w = Math.max(1, Math.round(target.width * scale)), h = Math.max(1, Math.round(target.height * scale));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'); if (!ctx) throw Error('Foto belum bisa ditampilkan.');
  const data = ctx.createImageData(w, h), sx = iw / target.photoWidth, sy = ih / target.photoHeight;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = mapPoint(target.toPhoto, (x + .5) / scale, (y + .5) / scale), px = Math.min(iw - 1, Math.max(0, Math.round(p.x * sx))), py = Math.min(ih - 1, Math.max(0, Math.round(p.y * sy)));
    const from = (py * iw + px) * 4, to = (y * w + x) * 4;
    data.data[to] = pixels[from]; data.data[to + 1] = pixels[from + 1]; data.data[to + 2] = pixels[from + 2]; data.data[to + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(Error('Foto belum bisa ditampilkan.')), 'image/jpeg', .88));
  out.width = 1; out.height = 1;
  return { url: URL.createObjectURL(blob), blob, width: w, height: h };
}
export async function uprightPreview(photo: Blob, turn = 0, longSide = 1100): Promise<{ url: string; width: number; height: number }> {
  const bitmap = await loadBitmap(photo);
  try {
    const quarter = ((turn % 4) + 4) % 4, sideways = quarter % 2 === 1;
    const W = sideways ? bitmap.height : bitmap.width, H = sideways ? bitmap.width : bitmap.height, scale = Math.min(1, longSide / Math.max(W, H));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Foto belum bisa ditampilkan.');
    ctx.scale(scale, scale); ctx.translate(W / 2, H / 2); ctx.rotate(quarter * Math.PI / 2); ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Foto belum bisa ditampilkan.')), 'image/jpeg', .85));
    canvas.width = 1; canvas.height = 1;
    return { url: URL.createObjectURL(blob), width: W, height: H };
  } finally { bitmap.close(); }
}
