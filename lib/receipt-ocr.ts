/**
 * Reading a receipt photo on the device (browser only). Tesseract (WebAssembly) with Indonesian + English is served
 * from this app's own /ocr folder (copied by scripts/copy-ocr.mjs), so the photo never leaves the phone and nothing
 * is paid for. The first scan downloads ~5 MB once; the browser keeps it afterwards.
 *
 * The photo is cleaned first (upright, grey, contrast stretched, sized for ~300 dpi text). A second pass with an
 * adaptive black-and-white version is tried when the first one does not add up, and the better reading is kept
 * (receiptScore). The result is always shown to the user to check; nothing is saved here.
 */
import type { Worker } from 'tesseract.js';
import { checkReceipt, readReceiptText, receiptScore, type ReceiptCheck, type ReceiptRead } from './receipt.ts';

export type OcrStage = 'prepare' | 'load' | 'read' | 'second' | 'done';
export type OcrProgress = { stage: OcrStage; progress: number; label: string };
export type OcrResult = { text: string; confidence: number; read: ReceiptRead; check: ReceiptCheck; passes: number; ms: number };

export const ocrAvailable = () => typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && typeof document !== 'undefined';

let worker: Promise<Worker> | null = null, idle: ReturnType<typeof setTimeout> | undefined;
let report: ((message: { status: string; progress: number }) => void) | null = null;
function getWorker() {
  clearTimeout(idle);
  if (!worker) {
    worker = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const base = `${window.location.origin}/ocr`;
      const created = await createWorker(['ind', 'eng'], 1 /* LSTM only */, {
        workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang`, gzip: true, workerBlobURL: false,
        logger: message => report?.(message),
      });
      await created.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return created;
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}
/** The reader stays ready for a few minutes (for the next photo), then frees its memory. */
function releaseLater() { clearTimeout(idle); idle = setTimeout(() => { const current = worker; worker = null; void current?.then(w => w.terminate()).catch(() => undefined); }, 3 * 60_000); }

/* ------------------------------------------------------------------ Cleaning the photo */

async function loadBitmap(photo: Blob) {
  try { return await createImageBitmap(photo, { imageOrientation: 'from-image' }); }
  catch { return await createImageBitmap(photo); }
}
/** Grey, contrast stretched, and sized so receipt letters are ~30 px tall. `turn` rotates by quarter turns. */
async function prepare(photo: Blob, turn = 0) {
  const bitmap = await loadBitmap(photo);
  try {
    const long = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(2.5, Math.max(1, 1800 / Math.min(bitmap.width, bitmap.height)), 3000 / long);
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const quarter = ((turn % 4) + 4) % 4, sideways = quarter % 2 === 1;
    const canvas = document.createElement('canvas'); canvas.width = sideways ? h : w; canvas.height = sideways ? w : h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw Error('Foto belum bisa diproses di perangkat ini.');
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(quarter * Math.PI / 2); ctx.drawImage(bitmap, -w / 2, -h / 2, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height), px = image.data, n = canvas.width * canvas.height;
    const grey = new Uint8ClampedArray(n), histogram = new Uint32Array(256);
    for (let i = 0; i < n; i++) { const g = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000; grey[i] = g; histogram[grey[i]]++; }
    // Stretch between the 1st and 99th percentile (faded thermal paper, dim photos).
    let low = 0, high = 255, seen = 0;
    for (let v = 0; v < 256; v++) { seen += histogram[v]; if (seen >= n * .01) { low = v; break; } }
    seen = 0; for (let v = 255; v >= 0; v--) { seen += histogram[v]; if (seen >= n * .01) { high = v; break; } }
    const span = Math.max(1, high - low);
    for (let i = 0; i < n; i++) grey[i] = Math.max(0, Math.min(255, (grey[i] - low) * 255 / span));
    return { canvas, ctx, image, grey, width: canvas.width, height: canvas.height };
  } finally { bitmap.close(); }
}
function paint(target: Awaited<ReturnType<typeof prepare>>, values: Uint8ClampedArray) {
  const { image, ctx, canvas } = target, px = image.data;
  for (let i = 0; i < values.length; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = values[i]; px[i * 4 + 3] = 255; }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
/** Black-and-white by the local average (Bradley), which copes with shadows and uneven light across the receipt. */
function adaptive(grey: Uint8ClampedArray, width: number, height: number) {
  const integral = new Float64Array((width + 1) * (height + 1)), out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) { let row = 0; for (let x = 0; x < width; x++) { row += grey[y * width + x]; integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row; } }
  const half = Math.max(8, Math.round(width / 16)), t = .15;
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - half), y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half), x2 = Math.min(width - 1, x + half), count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * (width + 1) + x2 + 1] - integral[y1 * (width + 1) + x2 + 1] - integral[(y2 + 1) * (width + 1) + x1] + integral[y1 * (width + 1) + x1];
      out[y * width + x] = grey[y * width + x] * count <= sum * (1 - t) ? 0 : 255;
    }
  }
  return out;
}
const canvasBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Foto belum bisa diproses.')), 'image/png'));

/* ------------------------------------------------------------------ Reading */

/**
 * Reads a receipt photo. `turn` rotates it by quarter turns first (for a photo taken sideways).
 * Throws with a friendly message when the reader cannot start (old browser, first download failed offline).
 */
export async function readReceiptPhoto(photo: Blob, onProgress?: (progress: OcrProgress) => void, turn = 0): Promise<OcrResult> {
  if (!ocrAvailable()) throw Error('Perangkat ini belum bisa membaca foto. Ketik isi struknya saja.');
  const started = Date.now();
  const say = (stage: OcrStage, progress: number, label: string) => onProgress?.({ stage, progress: Math.max(0, Math.min(1, progress)), label });
  say('prepare', .02, 'Merapikan foto…');
  const page = await prepare(photo, turn);
  const first = await canvasBlob(paint(page, page.grey));
  let stage: OcrStage = 'load';
  report = message => {
    if (message.status === 'recognizing text') say(stage === 'second' ? 'second' : 'read', stage === 'second' ? .62 + message.progress * .33 : .2 + message.progress * (stage === 'read' ? .4 : .75), stage === 'second' ? 'Membaca ulang dengan kontras tinggi…' : 'Membaca tulisan…');
    else if (stage === 'load') say('load', .04 + message.progress * .14, /load|download/i.test(message.status) ? 'Menyiapkan pembaca struk (sekali saja)…' : 'Menyiapkan pembaca struk…');
  };
  let tesseract: Worker;
  try { tesseract = await getWorker(); }
  catch { report = null; throw Error('Pembaca struk belum bisa dimuat. Periksa internet untuk pemakaian pertama, atau ketik isi struknya.'); }
  try {
    stage = 'read';
    const pass = async (image: Blob) => { const result = await tesseract.recognize(image, { rotateAuto: true }); const text = result.data.text || ''; return { text, confidence: result.data.confidence || 0, read: readReceiptText(text) }; };
    let best = await pass(first), passes = 1;
    const good = (r: typeof best) => checkReceipt(r.read).matches && r.read.items.length > 0;
    if (!good(best)) {
      stage = 'second';
      say('second', .62, 'Membaca ulang dengan kontras tinggi…');
      const second = await pass(await canvasBlob(paint(page, adaptive(page.grey, page.width, page.height))));
      passes = 2;
      if (receiptScore(second.read) > receiptScore(best.read)) best = second;
    }
    say('done', 1, 'Selesai');
    return { ...best, check: checkReceipt(best.read), passes, ms: Date.now() - started };
  } finally { report = null; releaseLater(); }
}
