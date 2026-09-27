/**
 * Reading a receipt photo on the device (browser only). Tesseract (WebAssembly) with Indonesian + English is served
 * from this app's own /ocr folder (copied by scripts/copy-ocr.mjs), so the photo never leaves the phone and nothing
 * is paid for. The first scan downloads ~5 MB once; the browser keeps it afterwards.
 *
 * Before reading, the photo is prepared the way a scanner would:
 *  1. the receipt is found (the large bright paper against the table) and cropped, so the background is not read;
 *  2. the tilt is measured and taken out;
 *  3. shadows and uneven light are evened out, contrast stretched and the text slightly sharpened;
 *  4. it is sized so the letters are the height Tesseract reads best.
 * Then several readings are tried until one adds up: the clean grey image, a black-and-white version, and a "loose
 * text" reading. For each, rows are also rebuilt from the word positions (lib/receipt-rows.ts). A sideways photo is
 * turned automatically. The best reading (receiptScore) is kept and always shown to the user to check.
 */
import type { Worker } from 'tesseract.js';
import { checkReceipt, readReceiptText, receiptScore, type ReceiptCheck, type ReceiptRead } from './receipt.ts';
import { rowsFromWords, slopeOf, type OcrWord } from './receipt-rows.ts';

export type OcrStage = 'prepare' | 'load' | 'read' | 'second' | 'done';
export type OcrProgress = { stage: OcrStage; progress: number; label: string };
export type OcrResult = { text: string; confidence: number; read: ReceiptRead; check: ReceiptCheck; passes: number; ms: number; cropped: boolean; skew: number };

export const ocrAvailable = () => typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && typeof document !== 'undefined';

let worker: Promise<Worker> | null = null, idle: ReturnType<typeof setTimeout> | undefined;
let report: ((message: { status: string; progress: number }) => void) | null = null;
function getWorker() {
  clearTimeout(idle);
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = `${window.location.origin}/ocr`;
      const created = await createWorker(['ind', 'eng'], 1 /* LSTM only */, {
        workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang`, gzip: true, workerBlobURL: false,
        logger: message => report?.(message),
      });
      await created.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return created;
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}
/** The reader stays ready for a few minutes (for the next photo), then frees its memory. */
function releaseLater() { clearTimeout(idle); idle = setTimeout(() => { const current = worker; worker = null; void current?.then(w => w.terminate()).catch(() => undefined); }, 3 * 60_000); }

/* ------------------------------------------------------------------ Image helpers (plain arrays, fast on phones) */

type Grey = { data: Float32Array; width: number; height: number };
function greyOf(ctx: CanvasRenderingContext2D, width: number, height: number): Grey {
  const px = ctx.getImageData(0, 0, width, height).data, data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
  return { data, width, height };
}
/** Mean over a (2r+1)² box for every pixel, with a summed-area table. */
function boxBlur({ data, width, height }: Grey, r: number): Float32Array {
  const w1 = width + 1, table = new Float64Array(w1 * (height + 1)), out = new Float32Array(data.length);
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
function otsu(values: Float32Array) {
  const hist = new Float64Array(256); for (const v of values) hist[Math.max(0, Math.min(255, v | 0))]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let back = 0, weight = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    weight += hist[t]; if (!weight) continue; const fore = values.length - weight; if (!fore) break;
    back += t * hist[t]; const mb = back / weight, mf = (sum - back) / fore, between = weight * fore * (mb - mf) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}
/**
 * The receipt: a large, solid, bright region, with its pixels (a mask); null when it fills the photo anyway. Camera
 * noise is smoothed first; three brightness levels are tried (paper against a dark table, a light table, a white
 * one), and the most paper-like region wins: solid, bright, and not running off the edges of the photo.
 */
function findPaper(grey: Grey) {
  const { width, height } = grey, smooth = boxBlur(grey, 2), whole = width * height;
  const above = (t: number) => smooth.filter(v => v > t);
  const t1 = otsu(smooth), u1 = above(t1), t2 = u1.length > whole * .03 ? otsu(u1) : t1, u2 = above(t2), t3 = u2.length > whole * .03 ? otsu(u2) : t2;
  let best: { x0: number; y0: number; x1: number; y1: number; score: number; mask: Uint8Array; fill: number } | null = null;
  for (const threshold of new Set([t1, t2, t3])) {
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
      const fill = solid / boxArea, edges = +(x0 === 0) + +(y0 === 0) + +(x1 === width - 1) + +(y1 === height - 1);
      if (fill < .45 || edges > 1) continue;
      const bright = sum / area / 255, score = area * fill * bright * bright * (edges ? .5 : 1);
      if (best && score <= best.score) continue;
      // Its pixels, with the holes (the printed text) filled row by row.
      const mask = new Uint8Array(whole);
      for (let y = y0; y <= y1; y++) { let first = -1, last = -1; for (let x = x0; x <= x1; x++) if (seen[y * width + x] === label) { if (first < 0) first = x; last = x; } for (let x = first; x >= 0 && x <= last; x++) mask[y * width + x] = 1; }
      best = { x0, y0, x1, y1, score, mask, fill };
    }
  }
  return best;
}
/**
 * Tilt in degrees: the angle at which the rows of printed text line up best (the sharpest horizontal profile).
 * Only dark marks on the paper count (darker than their surroundings), not the table or the paper's edge.
 */
function findSkew(grey: Grey, paper: { x0: number; y0: number; x1: number; y1: number; mask?: Uint8Array } | null) {
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
  for (let deg = -15; deg <= 15; deg += .5) { const value = score(deg); if (value > bestScore) { bestScore = value; best = deg; } }
  for (let deg = best - .4; deg <= best + .4; deg += .1) { const value = score(deg); if (value > bestScore) { bestScore = value; best = deg; } }
  return Math.abs(best) < .3 ? 0 : Math.round(best * 10) / 10;
}
async function loadBitmap(photo: Blob) {
  try { return await createImageBitmap(photo, { imageOrientation: 'from-image' }); }
  catch { return await createImageBitmap(photo); }
}
function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Foto belum bisa diproses di perangkat ini.');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/* ------------------------------------------------------------------ Preparing the photo */

type Prepared = { grey: Uint8ClampedArray; bw: Uint8ClampedArray; width: number; height: number; cropped: boolean; skew: number; landscape: boolean };
async function prepare(photo: Blob, turn = 0): Promise<Prepared> {
  const bitmap = await loadBitmap(photo);
  try {
    const quarter = ((turn % 4) + 4) % 4, sideways = quarter % 2 === 1;
    const W = sideways ? bitmap.height : bitmap.width, H = sideways ? bitmap.width : bitmap.height;
    const draw = (ctx: CanvasRenderingContext2D, scale: number) => { ctx.save(); ctx.translate(W * scale / 2, H * scale / 2); ctx.rotate(quarter * Math.PI / 2); ctx.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale); ctx.restore(); };
    // 1–2. Find the receipt and its tilt on a small copy.
    const small = Math.min(1, 960 / Math.max(W, H)), preview = canvas2d(W * small, H * small); draw(preview.ctx, small);
    const lowGrey = greyOf(preview.ctx, preview.canvas.width, preview.canvas.height);
    const found = findPaper(lowGrey);
    // A clean outline (a solid, nearly rectangular region) is cropped tightly and the table blanked; an uncertain one
    // (a shadow across the paper) is cropped loosely and nothing is blanked, so no text can be cut off.
    const sure = Boolean(found && found.fill >= .72);
    const paper = found && (sure ? found : { ...found, mask: undefined, x0: Math.max(0, Math.round(found.x0 - (found.x1 - found.x0) * .35)), x1: Math.min(lowGrey.width - 1, Math.round(found.x1 + (found.x1 - found.x0) * .35)), y0: Math.max(0, Math.round(found.y0 - (found.y1 - found.y0) * .2)), y1: Math.min(lowGrey.height - 1, Math.round(found.y1 + (found.y1 - found.y0) * .2)) });
    const area = paper || { x0: 0, y0: 0, x1: lowGrey.width - 1, y1: lowGrey.height - 1 };
    const skew = findSkew(lowGrey, paper);
    const margin = .025, pw = (area.x1 - area.x0 + 1) / small, ph = (area.y1 - area.y0 + 1) / small;
    const cx = (area.x0 + area.x1 + 1) / 2 / small, cy = (area.y0 + area.y1 + 1) / 2 / small;
    const rad = -skew * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const cropW = Math.min(W * 1.2, (pw * cos + ph * sin) * (1 + margin * 2)), cropH = Math.min(H * 1.2, (pw * sin + ph * cos) * (1 + margin * 2));
    // 4. Size: the receipt ~1300 px wide (≈ 30 px letters for a 40-character receipt), within a pixel budget.
    let scale = Math.max(.5, Math.min(3, 1300 / Math.min(cropW, pw)));
    scale = Math.min(scale, Math.sqrt(9_000_000 / (cropW * cropH)));
    const full = canvas2d(W * Math.min(1, scale * 1.05) , H * Math.min(1, scale * 1.05));
    const s1 = full.canvas.width / W; draw(full.ctx, s1);
    const out = canvas2d(cropW * scale, cropH * scale);
    out.ctx.fillStyle = '#fff'; out.ctx.fillRect(0, 0, out.canvas.width, out.canvas.height);
    out.ctx.translate(out.canvas.width / 2, out.canvas.height / 2); out.ctx.rotate(rad); out.ctx.scale(scale / s1, scale / s1);
    out.ctx.drawImage(full.canvas, -cx * s1, -cy * s1);
    const width = out.canvas.width, height = out.canvas.height, grey = greyOf(out.ctx, width, height);
    // Outside the receipt (the table) becomes white, so it is not read as text.
    let outside: Uint8Array | null = null;
    if (paper?.mask) {
      const mask = paper.mask;
      const m = canvas2d(lowGrey.width, lowGrey.height), img = m.ctx.createImageData(lowGrey.width, lowGrey.height);
      for (let i = 0; i < mask.length; i++) { const v = mask[i] ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      m.ctx.putImageData(img, 0, 0);
      const warped = canvas2d(width, height);
      warped.ctx.translate(width / 2, height / 2); warped.ctx.rotate(rad); warped.ctx.scale(scale / small, scale / small); warped.ctx.drawImage(m.canvas, -cx * small, -cy * small);
      const md = warped.ctx.getImageData(0, 0, width, height).data;
      outside = new Uint8Array(width * height); for (let i = 0; i < outside.length; i++) outside[i] = md[i * 4] < 128 ? 1 : 0;
    }
    // 3. Even out light: divide by the local background, then stretch and sharpen.
    // Camera grain off first (letters are several pixels thick at this size, so a 3×3 average keeps them).
    grey.data = boxBlur(grey, 1);
    const background = boxBlur(grey, Math.max(12, Math.round(width / 22)));
    const flat = new Float32Array(grey.data.length);
    for (let i = 0; i < flat.length; i++) flat[i] = Math.min(255, grey.data[i] / Math.max(1, background[i]) * 235);
    const hist = new Uint32Array(256); for (const v of flat) hist[v | 0]++;
    let low = 0, high = 255, seen = 0, n = flat.length;
    for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= n * .005) { low = v; break; } }
    seen = 0; for (let v = 255; v >= 0; v--) { seen += hist[v]; if (seen >= n * .02) { high = v; break; } }
    const span = Math.max(20, high - low);
    for (let i = 0; i < n; i++) flat[i] = Math.max(0, Math.min(255, (flat[i] - low) * 255 / span));
    const soft = boxBlur({ data: flat, width, height }, 1);
    const sharp = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) sharp[i] = flat[i] + .8 * (flat[i] - soft[i]);
    // Black-and-white by the local average (Bradley): copes with what is left of shadows and faded thermal print.
    const local = boxBlur({ data: flat, width, height }, Math.max(8, Math.round(width / 28)));
    const bw = new Uint8ClampedArray(n); for (let i = 0; i < n; i++) bw[i] = flat[i] < local[i] * .86 ? 0 : 255;
    if (outside) for (let i = 0; i < n; i++) if (outside[i]) { sharp[i] = 255; bw[i] = 255; }
    return { grey: sharp, bw, width, height, cropped: Boolean(paper), skew, landscape: pw > ph * 1.25 };
  } finally { bitmap.close(); }
}
function toBlob(values: Uint8ClampedArray, width: number, height: number) {
  const { canvas, ctx } = canvas2d(width, height), image = ctx.createImageData(width, height), px = image.data;
  for (let i = 0; i < values.length; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = values[i]; px[i * 4 + 3] = 255; }
  ctx.putImageData(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Foto belum bisa diproses.')), 'image/png'));
}

/* ------------------------------------------------------------------ Reading */

type Block = { paragraphs?: { lines?: { baseline?: { x0: number; y0: number; x1: number; y1: number }; words?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] };
type Reading = { text: string; confidence: number; read: ReceiptRead; score: number };
/** One OCR pass; the plain text and the rows rebuilt from word positions are both parsed and the better one kept. */
async function pass(tesseract: Worker, image: Blob, psm: string): Promise<Reading> {
  await tesseract.setParameters({ tessedit_pageseg_mode: psm as never });
  const result = await tesseract.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
  const blocks = (result.data.blocks || []) as Block[];
  const lines = blocks.flatMap(block => block.paragraphs || []).flatMap(p => p.lines || []);
  const words: OcrWord[] = lines.flatMap(line => line.words || []).map(w => ({ text: w.text, confidence: w.confidence, ...w.bbox }));
  const rows = rowsFromWords(words, slopeOf(lines.map(line => line.baseline).filter((b): b is NonNullable<typeof b> => Boolean(b))));
  const options = [result.data.text || '', rows].filter(text => text.trim()).map(text => { const read = readReceiptText(text); return { text: text.trim(), confidence: result.data.confidence || 0, read, score: receiptScore(read) }; });
  return options.sort((a, b) => b.score - a.score)[0] || { text: '', confidence: 0, read: readReceiptText(''), score: -1 };
}
const settled = (reading: Reading) => { const check = checkReceipt(reading.read); return check.matches && check.confidence === 'tinggi' && reading.read.items.length > 0; };

/**
 * Reads a receipt photo. `turn` rotates it by quarter turns first (for a photo the user turned by hand).
 * Throws with a friendly message when the reader cannot start (old browser, first download failed offline).
 */
export async function readReceiptPhoto(photo: Blob, onProgress?: (progress: OcrProgress) => void, turn = 0): Promise<OcrResult> {
  if (!ocrAvailable()) throw Error('Perangkat ini belum bisa membaca foto. Ketik isi struknya saja.');
  const started = Date.now();
  const say = (stage: OcrStage, progress: number, label: string) => onProgress?.({ stage, progress: Math.max(0, Math.min(1, progress)), label });
  say('prepare', .02, 'Mencari struk di foto dan meluruskannya…');
  let page = await prepare(photo, turn);
  // Progress: each pass fills its own slice of the bar.
  let slice: [number, number] = [.2, .55], label = 'Membaca tulisan…', stage: OcrStage = 'load';
  report = message => {
    if (message.status === 'recognizing text') say(stage === 'load' ? 'read' : stage, slice[0] + message.progress * (slice[1] - slice[0]), label);
    else if (stage === 'load') say('load', .04 + message.progress * .14, /load|download/i.test(message.status) ? 'Menyiapkan pembaca struk (sekali saja)…' : 'Menyiapkan pembaca struk…');
  };
  let tesseract: Worker;
  try { tesseract = await getWorker(); }
  catch { report = null; throw Error('Pembaca struk belum bisa dimuat. Periksa internet untuk pemakaian pertama, atau ketik isi struknya.'); }
  try {
    stage = 'read';
    let best = await pass(tesseract, await toBlob(page.grey, page.width, page.height), '6'), passes = 1;
    const tries: [string, () => Promise<Reading>][] = [
      ['Membaca ulang dengan kontras tinggi…', async () => pass(tesseract, await toBlob(page.bw, page.width, page.height), '6')],
      ['Membaca per kata…', async () => pass(tesseract, await toBlob(page.grey, page.width, page.height), '11')],
    ];
    // A photo taken sideways: try it turned both ways when the first reading found little.
    if (page.landscape && best.score < 6 && !turn) for (const quarter of [1, 3]) tries.unshift([`Memutar foto ${quarter === 1 ? 'ke kanan' : 'ke kiri'}…`, async () => { const turned = await prepare(photo, quarter); const reading = await pass(tesseract, await toBlob(turned.grey, turned.width, turned.height), '6'); if (reading.score > best.score) page = turned; return reading; }]);
    // A time budget: phones are slower, and a photo that still reads badly after ~25 s will not get better.
    for (let i = 0; i < tries.length && !settled(best) && (Date.now() - started < 25_000 || best.score <= 0); i++) {
      stage = 'second'; label = tries[i][0]; slice = [.55 + i * (.4 / tries.length), .55 + (i + 1) * (.4 / tries.length)];
      say('second', slice[0], label);
      const reading = await tries[i][1](); passes++;
      if (reading.score > best.score) best = reading;
    }
    say('done', 1, 'Selesai');
    return { text: best.text, confidence: best.confidence, read: best.read, check: checkReceipt(best.read), passes, ms: Date.now() - started, cropped: page.cropped, skew: page.skew };
  } finally { report = null; releaseLater(); }
}

