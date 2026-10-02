/**
 * Reading a receipt photo on the device (browser only). Receipt Intelligence 2.0.
 *
 * The OCR engine (Tesseract, WebAssembly, Indonesian + English) is served from this app's own /ocr folder (copied by
 * scripts/copy-ocr.mjs): the photo never leaves the phone and nothing is paid for. The first scan downloads ~5 MB
 * once; the browser keeps it afterwards. The engine sits behind a small interface (OcrEngine) so another local engine
 * could be added later without touching the rest.
 *
 * The photo is prepared first (lib/receipt-prep.ts: receipt found, perspective straightened, light evened out), in a
 * Web Worker when possible. Then reading is adaptive instead of a fixed series:
 *  1. one strong pass over the whole receipt; if the receipt then adds up (items, charges and total agree), stop;
 *  2. otherwise targeted passes: another image variant, and only the part that is unclear read again, enlarged
 *     (the totals at the bottom, the item table, the header);
 *  3. every pass keeps its words with position and confidence, and the passes are fused value by value
 *     (lib/receipt-intel.ts): agreement raises confidence, disagreement is kept as alternatives, arithmetic decides
 *     only when exactly one combination adds up.
 * One field can also be read again on its own (rereadField): only its region, enlarged, digits only for amounts.
 * A sideways or upside-down photo is turned automatically when the first reading finds little.
 */
import { healReaderCacheOnce } from './ocr-cache.ts';
import type { Worker as TesseractWorker } from 'tesseract.js';
import { checkReceipt, readReceiptText, receiptScore, type ReceiptCheck, type ReceiptRead } from './receipt.ts';
import { linesFromWords, slopeOf, unionBox, type Box, type OcrLine, type OcrWord } from './receipt-rows.ts';
import { cropRegion, toBmp, type Quad, type Quality } from './receipt-image.ts';
import { addsUp, fuseReadings, readRegionValue, RECEIPT_ENGINE_VERSION, regionFor, type FieldVotes, type OcrPass, type RegionPlan } from './receipt-intel.ts';
import { preparePhoto, type Prepared, type PrepareOptions } from './receipt-prep.ts';

export type OcrStage = 'prepare' | 'straighten' | 'load' | 'read' | 'second' | 'parse' | 'check' | 'done';
export type OcrProgress = { stage: OcrStage; progress: number; label: string };
export type OcrResult = {
  engineVersion: typeof RECEIPT_ENGINE_VERSION;
  text: string; confidence: number; read: ReceiptRead; check: ReceiptCheck; passes: number; ms: number; cropped: boolean; skew: number;
  /** Every pass (for fusion evidence, the debug view and the benchmark). */
  passList: OcrPass[]; votes: FieldVotes;
  /** Where each field was read, in working-image pixels. */
  fieldBoxes: Record<string, Box | null>; itemBoxes: (Box | null)[];
  quality: Quality; method: Prepared['method']; cornerConfidence: Prepared['cornerConfidence'];
  /** Developer trace: every step of the reading ladder, why it ran (or was skipped) and what it changed. */
  trace: TraceStep[];
  /** Typical letter height in the working image (px), measured on the first pass; drives how much regions are enlarged. */
  textHeight: number;
  /** Where the reading still fails, in plain words, when it does not add up (empty when it does). */
  failure: string[];
  /** The straightened working images and the mapping back to the photo; kept only while the review is open. */
  prepared: Prepared;
};

export type TraceStep = { step: string; reason: string; ms: number; outcome: 'settled' | 'better' | 'same' | 'worse' | 'skipped' };
export const ocrAvailable = () => typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && typeof document !== 'undefined';

/* ------------------------------------------------------------------ The OCR engine */

export type RecognizeOptions = { psm: '6' | '7' | '11'; whitelist?: string; rotate?: boolean; /** The image's size, to map word boxes back when the engine turned the image a little. */ size?: { width: number; height: number } };
export type Recognized = { native: OcrLine[]; rows: OcrLine[]; confidence: number; /** Native lines are loose text segments (a name and its price apart): on a tie the rebuilt rows win. */ segments?: boolean };
export interface OcrEngine {
  recognize(image: Blob, options: RecognizeOptions): Promise<Recognized>;
  /** Stops the current reading and frees the engine. */
  cancel(): void;
}

let worker: Promise<TesseractWorker> | null = null, idle: ReturnType<typeof setTimeout> | undefined;
let report: ((message: { status: string; progress: number }) => void) | null = null;

function getWorker() {
  clearTimeout(idle);
  if (!worker) {
    worker = (async () => {
      await healReaderCacheOnce();
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
function releaseLater() { clearTimeout(idle); idle = setTimeout(() => { const current = worker; worker = null; void current?.then(w => w.terminate()).catch(() => undefined); if (!pendingPrep.size) { prepWorker?.terminate(); prepWorker = null; } }, 3 * 60_000); }

type Block = { paragraphs?: { lines?: { baseline?: { x0: number; y0: number; x1: number; y1: number }; words?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] };
export const tesseractEngine: OcrEngine = {
  async recognize(image, { psm, whitelist = '', rotate = psm !== '7', size }) {
    const tesseract = await getWorker();
    await tesseract.setParameters({ tessedit_pageseg_mode: psm as never, tessedit_char_whitelist: whitelist });
    const result = await tesseract.recognize(image, { rotateAuto: rotate }, { text: true, blocks: true });
    const lines = ((result.data.blocks || []) as Block[]).flatMap(block => block.paragraphs || []).flatMap(p => p.lines || []);
    // With rotateAuto, Tesseract straightens the image a little (rotateRadians, around its centre) and reports word boxes
    // in that turned image; they are turned back so every box points at the right place on the photo.
    const angle = -(result.data as { rotateRadians?: number }).rotateRadians! || 0, cos = Math.cos(angle), sin = Math.sin(angle);
    const turn = (px: number, py: number) => { if (!angle || !size) return { x: px, y: py }; const cx = size.width / 2, cy = size.height / 2, mx = px - cx, my = py - cy; return { x: cx + mx * cos - my * sin, y: cy + mx * sin + my * cos }; };
    const back = (b: { x0: number; y0: number; x1: number; y1: number }) => {
      const c = turn((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), hw = (b.x1 - b.x0) / 2, hh = (b.y1 - b.y0) / 2;
      return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
    };
    const baseline = (b: { x0: number; y0: number; x1: number; y1: number }) => { const a = turn(b.x0, b.y0), z = turn(b.x1, b.y1); return { x0: a.x, y0: a.y, x1: z.x, y1: z.y }; };
    const words = (list: NonNullable<(typeof lines)[number]['words']>): OcrWord[] => list.map(w => ({ text: w.text, confidence: w.confidence, ...back(w.bbox) }));
    const native = lines.map(line => { const ws = words(line.words || []).filter(w => w.text.trim()); return ws.length ? linesFromWords(ws, 0).reduce<OcrLine | null>((joined, part) => joined ? { text: `${joined.text} ${part.text}`, tokens: [...joined.tokens, ...part.tokens], box: unionBox([joined.box, part.box])!, confidence: (joined.confidence + part.confidence) / 2 } : part, null) : null; }).filter((l): l is OcrLine => Boolean(l));
    const rows = linesFromWords(lines.flatMap(line => words(line.words || [])), slopeOf(lines.map(line => line.baseline).filter((b): b is NonNullable<typeof b> => Boolean(b)).map(baseline)));
    if (whitelist) await tesseract.setParameters({ tessedit_char_whitelist: '' });
    return { native, rows, confidence: result.data.confidence || 0 };
  },
  cancel() { const current = worker; worker = null; clearTimeout(idle); void current?.then(w => w.terminate()).catch(() => undefined); },
};

/* ------------------------------------------------------------------ Preparing (in a worker when possible) */

let prepWorker: Worker | null = null, prepId = 0;
const pendingPrep = new Map<number, { resolve: (p: Prepared) => void; reject: (e: Error) => void }>();
function prepareOffPage(photo: Blob, options: PrepareOptions): Promise<Prepared> {
  if (typeof OffscreenCanvas === 'undefined') return preparePhoto(photo, options);
  try {
    if (!prepWorker) {
      prepWorker = new Worker(new URL('./receipt-prep.worker.ts', import.meta.url), { type: 'module' });
      prepWorker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; prepared?: Prepared; error?: string }>) => { const job = pendingPrep.get(event.data.id); if (!job) return; pendingPrep.delete(event.data.id); if (event.data.ok && event.data.prepared) job.resolve(event.data.prepared); else job.reject(Error(event.data.error || 'Foto belum bisa diproses.')); };
      prepWorker.onerror = () => { const jobs = [...pendingPrep.values()]; pendingPrep.clear(); prepWorker?.terminate(); prepWorker = null; jobs.forEach(job => job.reject(Error('worker'))); };
    }
    const id = ++prepId, current = prepWorker;
    return new Promise<Prepared>((resolve, reject) => { pendingPrep.set(id, { resolve, reject }); current.postMessage({ id, photo, options }); })
      // A worker that cannot run here (old browser, blocked): the same work on the page.
      .catch(error => (error as Error).message === 'worker' ? preparePhoto(photo, options) : Promise.reject(error));
  } catch { return preparePhoto(photo, options); }
}

/* ------------------------------------------------------------------ Passes */

const bmpBlob = (values: Uint8ClampedArray, width: number, height: number) => new Blob([toBmp(values, width, height) as BlobPart], { type: 'image/bmp' });
/** Shifts lines read from an enlarged crop back to working-image pixels. */
function toPage(lines: OcrLine[], rect: Box, scale: number, pad: number): OcrLine[] {
  const move = (b: Box): Box => ({ x: rect.x + (b.x - pad) / scale, y: rect.y + (b.y - pad) / scale, width: b.width / scale, height: b.height / scale });
  return lines.map(line => ({ ...line, box: move(line.box), tokens: line.tokens.map(t => ({ ...t, box: move(t.box) })) }));
}
type Variant = 'clean' | 'even' | 'bw';
/** One OCR pass: the page or a region of it, in one variant. The native lines and the rebuilt rows are both parsed; the better is kept. */
async function runPass(engine: OcrEngine, page: Prepared, variant: Variant, psm: '6' | '11', id: string, region?: { rect: Box; scale: number; /** The whole page enlarged: counts as a whole-receipt reading. */ page?: boolean }): Promise<OcrPass> {
  const values = page[variant], pad = 12;
  let image: Blob, recognized: Recognized, size = { width: page.width, height: page.height };
  if (region) { const crop = cropRegion(values, page.width, page.height, region.rect, region.scale, pad); image = bmpBlob(crop.data, crop.width, crop.height); size = { width: crop.width, height: crop.height }; }
  else image = bmpBlob(values, page.width, page.height);
  recognized = await engine.recognize(image, { psm, size });
  if (region) recognized = { ...recognized, native: toPage(recognized.native, region.rect, region.scale, pad), rows: toPage(recognized.rows, region.rect, region.scale, pad) };
  const options = (recognized.segments ? [recognized.rows, recognized.native] : [recognized.native, recognized.rows]).filter(lines => lines.length).map(lines => { const text = lines.map(l => l.text).join('\n'); const read = readReceiptText(text); return { lines, text, read, score: receiptScore(read) }; });
  const best = options.sort((a, b) => b.score - a.score)[0] || { lines: [], text: '', read: readReceiptText('') };
  return { id, variant, psm, lines: best.lines, confidence: recognized.confidence, text: best.text, read: best.read, ...(region && !region.page ? { region: region.rect } : {}) };
}
/** The part of the page a zone covers (full width), from a pass's layout; null when the zone was not seen. */
function zoneRect(pass: OcrPass, zones: string[], page: Prepared, extraLines = 1): Box | null {
  const boxes = (pass.read.layout || []).filter(l => zones.includes(l.zone)).map(l => pass.lines[l.line]?.box).filter((b): b is Box => Boolean(b));
  const box = unionBox(boxes); if (!box) return null;
  const lineH = boxes.reduce((n, b) => n + b.height, 0) / boxes.length, y = Math.max(0, box.y - lineH * extraLines * 1.4);
  return { x: 0, y, width: page.width, height: Math.min(page.height - y, box.height + lineH * extraLines * 2.8) };
}
/** The recovery ladder's budget: at most this many passes, and no new step after this long once a total was read. */
const MAX_PASSES = 7, LADDER_BUDGET_MS = 25_000;
const settled = (read: ReceiptRead) => read.items.length > 0 && read.total > 0 && addsUp(read);
/** Median height of the text lines a pass found (px of the working image); 0 when it found none. */
export function textHeightOf(lines: OcrLine[]) {
  const heights = lines.filter(l => l.text.replace(/\s/g, '').length >= 3 && l.box.height > 2).map(l => l.box.height).sort((a, b) => a - b);
  return heights.length ? heights[Math.floor(heights.length / 2)] : 0;
}
/**
 * How much to enlarge a region so its letters are about 32 px tall (where the engine reads best): at least the
 * step's usual enlargement, at most 3×, and the enlarged crop stays within ~10 megapixels.
 */
export function regionScale(textHeight: number, rect: Box, usual: number) {
  const want = textHeight > 0 ? 32 / textHeight : usual;
  const room = Math.sqrt(10_000_000 / Math.max(1, rect.width * rect.height));
  return Math.round(Math.max(1, Math.min(room, Math.max(usual, Math.min(3, want)))) * 100) / 100;
}
/** Where a reading that does not add up still fails, for the trace and the benchmark. */
export function failureOf(read: ReceiptRead): string[] {
  if (settled(read)) return [];
  const out: string[] = [];
  if (!read.total) out.push('total tidak terbaca');
  if (!read.items.length) out.push('tidak ada item');
  if (read.total && read.items.length) {
    const check = checkReceipt(read);
    if (!check.matches) out.push(`item + biaya ${check.computed} ≠ total ${read.total}`);
  }
  if (!read.merchant) out.push('nama toko tidak terbaca');
  if (!read.date) out.push('tanggal tidak terbaca');
  return out;
}

/**
 * Which readers to use. 'tesseract' or 'paddle' alone; 'paddle-first' = PP-OCRv6 reads the page, Tesseract only when the
 * receipt does not add up yet (and for the closer looks at regions); 'tesseract-first' = the other way round.
 */
export type Routing = 'tesseract' | 'paddle' | 'paddle-first' | 'tesseract-first';
export type ReadOptions = { turn?: number; corners?: Quad; signal?: AbortSignal; engine?: OcrEngine; routing?: Routing; /** PP-OCRv6 size; by default chosen from the device's memory. */ paddleTier?: 'tiny' | 'small'; /** Already prepared (by analyzeReceiptPhoto, for the same photo and turn). */ prepared?: Prepared };
/**
 * Reads a receipt photo. Throws with a friendly message when the reader cannot start (old browser, first download
 * failed offline) or when it was cancelled.
 */
export async function readReceiptPhoto(photo: Blob, onProgress?: (progress: OcrProgress) => void, turnOrOptions: number | ReadOptions = 0): Promise<OcrResult> {
  if (!ocrAvailable()) throw Error('Perangkat ini belum bisa membaca foto. Ketik isi struknya saja.');
  const options: ReadOptions = typeof turnOrOptions === 'number' ? { turn: turnOrOptions } : turnOrOptions;
  const engine = options.engine || tesseractEngine, turn = options.turn || 0, started = Date.now();
  const say = (stage: OcrStage, progress: number, label: string) => onProgress?.({ stage, progress: Math.max(0, Math.min(1, progress)), label });
  const stop = () => { if (options.signal?.aborted) throw Error('Pembacaan dibatalkan.'); };
  say('prepare', .02, 'Menyiapkan foto…');
  // The engine loads while the photo is being prepared.
  const warm = engine === tesseractEngine ? getWorker().catch(() => null) : Promise.resolve(null);
  say('straighten', .06, 'Meluruskan struk…');
  let page = options.prepared || await prepareOffPage(photo, { turn, corners: options.corners });
  stop();
  let slice: [number, number] = [.18, .55], label = 'Membaca tulisan…', stage: OcrStage = 'load';
  report = message => {
    if (message.status === 'recognizing text') say(stage === 'load' ? 'read' : stage, slice[0] + message.progress * (slice[1] - slice[0]), label);
    else if (stage === 'load') say('load', .1 + message.progress * .08, /download/i.test(message.status) ? 'Mengunduh pembaca struk (sekali saja)…' : 'Menyiapkan pembaca struk…');
  };
  // Tesseract is the second opinion (and the reader when PP-OCRv6 is not used): when it cannot start, PP-OCRv6 still
  // reads; the reading only fails when neither can.
  let tesseractReady = engine !== tesseractEngine || Boolean(await warm);
  if (!tesseractReady) { report = null; tesseractReady = await getWorker().then(() => true, () => false); }
  const unavailable = () => Error('Pembaca struk belum bisa dimuat. Periksa internet untuk pemakaian pertama, atau ketik isi struknya.');
  if (!tesseractReady && (options.engine || options.routing === 'tesseract')) throw unavailable();
  try {
    stage = 'read';
    const trace: TraceStep[] = [], t0 = Date.now();
    // The engines for this reading: the first reads the whole page; the other one is the second opinion.
    // PP-OCRv6 first: on the real receipts measured (bench/realworld) it read totals, items and the shop better than
    // Tesseract alone, with no fake items; Tesseract is the second opinion and the fallback.
    const routing = options.engine ? 'tesseract' : options.routing || 'paddle-first';
    const paddleModule = routing === 'tesseract' ? null : await import('./ocr-paddle.ts').catch(() => null);
    const paddleTier = paddleModule && (options.paddleTier || paddleModule.paddleTierFor());
    const paddle = paddleModule && paddleTier ? paddleModule.paddleEngine(paddleTier) : null;
    const paddleState = paddleModule && paddleTier ? await paddleModule.paddleState(paddleTier) : 'ready';
    let firstEngine = (routing === 'paddle' || routing === 'paddle-first') && paddle ? paddle : engine;
    let second = routing === 'paddle-first' && paddle ? (tesseractReady ? engine : null) : routing === 'tesseract-first' ? paddle : null;
    let opening: OcrPass;
    if (firstEngine === engine && !tesseractReady) throw unavailable();
    if (firstEngine === engine) opening = await runPass(engine, page, 'even', '6', 'even-6');
    else {
      // PP-OCRv6 could not start (models not cached yet and offline, too little memory): Tesseract reads instead.
      // Only a real first download says so; models already saved on the phone just load (a second or two), and models
      // still in memory from the last photo need nothing at all.
      if (paddleState === 'download') { say('load', .12, 'Mengunduh pembaca struk (sekali saja)…'); void navigator.storage?.persist?.().catch(() => undefined); }
      else if (paddleState === 'cached') say('load', .12, 'Menyiapkan pembaca struk…');
      try { opening = await runPass(firstEngine, page, 'clean', '6', 'paddle'); }
      catch (error) { if (options.signal?.aborted) throw error; if (!tesseractReady) throw unavailable(); firstEngine = engine; second = null; opening = await runPass(engine, page, 'even', '6', 'even-6'); }
    }
    const passes: OcrPass[] = [opening];
    stop();
    let fused = fuseReadings(passes);
    trace.push({ step: opening.id, reason: opening.id === 'paddle' ? 'bacaan pertama seluruh struk (PP-OCRv6)' : 'bacaan pertama seluruh struk', ms: Date.now() - t0, outcome: settled(fused.read) ? 'settled' : 'better' });
    // A photo taken sideways or upside down: turned when the first reading found little.
    const first = passes[0], weak = receiptScore(first.read) < 6;
    const turns = weak && !options.corners ? [...(page.landscape ? [1, 3] : []), ...(receiptScore(first.read) < 3 && first.confidence < 45 ? [2] : [])] : [];
    for (const quarter of turns) {
      stage = 'second'; label = quarter === 2 ? 'Membalik foto…' : `Memutar foto ${quarter === 1 ? 'ke kanan' : 'ke kiri'}…`; say('second', .56, label);
      const turned = await prepareOffPage(photo, { turn: (turn + quarter) % 4 }); stop();
      const pass = firstEngine === engine ? await runPass(engine, turned, 'even', '6', `turn${quarter}-even-6`) : await runPass(firstEngine, turned, 'clean', '6', `turn${quarter}-paddle`); stop();
      const better = receiptScore(pass.read) > receiptScore(passes[0].read) + 2;
      trace.push({ step: `turn${quarter}`, reason: 'bacaan pertama lemah; foto mungkin miring/terbalik', ms: 0, outcome: better ? 'better' : 'same' });
      if (better) { page = turned; passes.splice(0, passes.length, pass); fused = fuseReadings(passes); break; }
    }
    // The paper's outline was unsure (a patterned table, a hand, the edge of the photo): the cut may have dropped part of
    // the receipt (its header with the shop's name and date). PP-OCRv6 finds text in a cluttered photo by itself, so it
    // also reads the whole upright photo, and the better reading is kept.
    // Only when the first reading is not complete yet (it does not add up, or the shop or date is missing): a complete
    // reading of the cut is kept as it is, which saves a whole second reading.
    const complete = settled(fused.read) && Boolean(fused.read.merchant) && Boolean(fused.read.date);
    if (firstEngine !== engine && !complete && !options.corners && !page.digital && (page.cornerConfidence === 'low' || page.cornerConfidence === 'none')) {
      const t1 = Date.now(), whole = await prepareOffPage(photo, { turn, corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }); stop();
      const pass = await runPass(firstEngine, whole, 'clean', '6', 'paddle-whole'); stop();
      const better = receiptScore(pass.read) > receiptScore(passes[0].read) || pass.read.merchant && !passes[0].read.merchant || pass.read.date && !passes[0].read.date && receiptScore(pass.read) >= receiptScore(passes[0].read);
      trace.push({ step: 'paddle-whole', reason: 'potongan kertas kurang yakin; seluruh foto dibaca', ms: Date.now() - t1, outcome: better ? 'better' : 'same' });
      if (better) { page = whole; passes.splice(0, passes.length, pass); fused = fuseReadings(passes); }
    }
    // Letter height decides how much the closer looks enlarge (small print on a far-away receipt gets more).
    const textHeight = textHeightOf(passes[0].lines), full: Box = { x: 0, y: 0, width: page.width, height: page.height };
    // Targeted passes until the receipt adds up, within a time budget (phones are slower; a photo that still reads
    // badly after ~25 s will not get better).
    // The recovery ladder: each step only when the receipt does not add up yet, cheapest and most likely first, and
    // each aimed at what is still missing. It stops as soon as the receipt adds up (early exit) or the budget is spent.
    const planned: { id: string; label: string; why: () => string | null; run: () => Promise<OcrPass> }[] = [
      { id: 'second-engine', label: 'Membaca ulang dengan pembaca kedua…', why: () => second ? 'belum cocok; pembaca kedua membaca seluruh struk' : null,
        run: () => second === engine ? runPass(engine, page, 'even', '6', 'even-6') : runPass(second!, page, 'clean', '6', 'paddle').catch(() => runPass(engine, page, 'bw', '6', 'bw-6')) },
      { id: 'zoom-even-6', label: 'Memperbesar tulisan kecil…', why: () => textHeight > 0 && textHeight < 20 && regionScale(textHeight, full, 1) >= 1.3 ? `huruf kecil (${textHeight} px) → diperbesar ${regionScale(textHeight, full, 1)}×` : null,
        run: () => runPass(engine, page, 'even', '6', 'zoom-even-6', { rect: full, scale: regionScale(textHeight, full, 1), page: true }) },
      { id: 'bw-6', label: 'Membaca ulang dengan kontras tinggi…', why: () => 'belum cocok; varian hitam-putih', run: () => runPass(engine, page, 'bw', '6', 'bw-6') },
      { id: 'total-region', label: 'Membaca ulang bagian total…', why: () => (zoneRect(fused.base, ['summary', 'payment'], page) || !fused.read.total) ? (fused.read.total ? 'ringkasan dibaca lebih dekat' : 'total belum terbaca') : null,
        run: () => { const rect = zoneRect(fused.base, ['summary', 'payment'], page) || { x: 0, y: page.height * .55, width: page.width, height: page.height * .45 }; return runPass(engine, page, 'bw', '6', 'total-region', { rect, scale: regionScale(textHeight, rect, 1.5) }); } },
      { id: 'items-region', label: 'Membaca ulang daftar item…', why: () => zoneRect(fused.base, ['items'], page) ? 'item belum cocok dengan total' : null,
        run: () => { const rect = zoneRect(fused.base, ['items'], page)!; return runPass(engine, page, 'clean', '6', 'items-region', { rect, scale: regionScale(textHeight, rect, 1.3) }); } },
      { id: 'header-region', label: 'Membaca ulang nama toko…', why: () => fused.read.merchant ? null : 'nama toko belum terbaca',
        run: () => { const rect = zoneRect(fused.base, ['header'], page, 0) || { x: 0, y: 0, width: page.width, height: page.height * .22 }; return runPass(engine, page, 'clean', '6', 'header-region', { rect, scale: regionScale(textHeight, rect, 1.3) }); } },
      { id: 'even-11', label: 'Membaca per kata…', why: () => 'kolom mungkin terpisah; baca per kata', run: () => runPass(engine, page, 'even', '11', 'even-11') },
    ];
    for (let i = 0; i < planned.length; i++) {
      const step = planned[i];
      if (settled(fused.read)) { trace.push({ step: step.id, reason: 'struk sudah cocok', ms: 0, outcome: 'skipped' }); continue; }
      if (passes.length >= MAX_PASSES || (Date.now() - started >= LADDER_BUDGET_MS && fused.read.total)) { trace.push({ step: step.id, reason: 'batas waktu/pass habis', ms: 0, outcome: 'skipped' }); continue; }
      const reason = step.why();
      if (!reason) { trace.push({ step: step.id, reason: 'tidak perlu', ms: 0, outcome: 'skipped' }); continue; }
      stage = 'second'; label = step.label; slice = [.55 + i * (.35 / planned.length), .55 + (i + 1) * (.35 / planned.length)];
      say('second', slice[0], label);
      const before = receiptScore(fused.read), t1 = Date.now();
      // A step whose reader cannot run (e.g. Tesseract did not start) is skipped; the reading so far still stands.
      try { passes.push(await step.run()); } catch (error) { if (options.signal?.aborted) throw error; trace.push({ step: step.id, reason: 'pembaca tidak tersedia', ms: Date.now() - t1, outcome: 'skipped' }); continue; }
      stop();
      fused = fuseReadings(passes);
      const after = receiptScore(fused.read);
      trace.push({ step: step.id, reason, ms: Date.now() - t1, outcome: settled(fused.read) ? 'settled' : after > before ? 'better' : after < before ? 'worse' : 'same' });
    }
    // Still not adding up with a total read: the total's number alone, enlarged, digits only. Its value is taken only
    // when it is the one reading that makes the receipt add up; otherwise it is kept as an alternative to choose from.
    let totalAgain: { value: number; fits: boolean }[] = [];
    if (!settled(fused.read) && fused.read.total && Date.now() - started < 30_000) {
      const box = fused.boxes('total'), line = fused.base.lines[fused.read.sources?.total?.[0] ?? -1] || null, plan = regionFor('total', box, line, page);
      if (plan) {
        stage = 'second'; label = 'Membaca ulang angka total…'; say('second', .9, label);
        const t2 = Date.now(), found = await rereadField(page, plan, engine); stop();
        trace.push({ step: 'total-digits', reason: 'total dibaca ulang, angka saja', ms: Date.now() - t2, outcome: 'same' });
        totalAgain = found.values.filter((v): v is number => typeof v === 'number' && v !== fused.read.total).map(value => ({ value, fits: addsUp({ ...fused.read, total: value, totals: [value] }) }));
        const fits = totalAgain.filter(t => t.fits);
        const current = fused.votes.numbers.total || { value: fused.read.total, status: 'single' as const, support: 1, alternatives: [], passIds: [fused.base.id] };
        if (fits.length === 1) {
          fused.votes.numbers.total = { ...current, value: fits[0].value, alternatives: [...new Set([fused.read.total, ...current.alternatives].filter(v => v !== fits[0].value))] };
          fused.read.total = fits[0].value; fused.read.totals = [fits[0].value, ...(fused.read.totals || []).filter(v => v !== fits[0].value)];
          fused.votes.resolved.push('total');
          trace[trace.length - 1].outcome = 'settled';
        } else if (totalAgain.length) fused.votes.numbers.total = { ...current, value: fused.read.total, status: 'conflict', alternatives: [...new Set([current.value ?? 0, ...current.alternatives, ...totalAgain.map(t => t.value)])].filter(v => v && v !== fused.read.total) };
      }
    }
    say('parse', .93, 'Mengenali rincian…');
    say('check', .97, 'Memeriksa total…');
    const read = fused.read, check = checkReceipt(read);
    const fields = ['merchant', 'date', 'time', 'subtotal', 'total', 'tax', 'service', 'discount', 'delivery', 'fee', 'rounding', 'paid', 'change', 'payment', 'cashback'] as const;
    const fieldBoxes = Object.fromEntries(fields.map(f => [f, fused.boxes(f)])) as Record<string, Box | null>;
    say('done', 1, 'Selesai');
    return {
      engineVersion: RECEIPT_ENGINE_VERSION, text: fused.base.text, confidence: fused.base.confidence, read, check, passes: passes.length, ms: Date.now() - started, cropped: page.cropped, skew: page.skew,
      trace, textHeight, failure: failureOf(read),
      passList: passes, votes: fused.votes, fieldBoxes, itemBoxes: read.items.map((_, i) => fused.itemBox(i)), quality: page.quality, method: page.method, cornerConfidence: page.cornerConfidence, prepared: page,
    };
  } finally { report = null; releaseLater(); }
}

/** Prepares a photo without reading it: its quality and corners (to warn before reading, or to set corners by hand). */
export function analyzeReceiptPhoto(photo: Blob, turn = 0) { return prepareOffPage(photo, { turn }); }

/**
 * Reads one field again: only its region, enlarged, in two variants; amounts with digits only. Returns the distinct
 * values found (most readings first). The rest of the receipt is not read again.
 */
export async function rereadField(page: Prepared, plan: RegionPlan, engine: OcrEngine = tesseractEngine): Promise<{ values: (number | string)[]; texts: string[] }> {
  const counts = new Map<string, { value: number | string; n: number }>(), texts: string[] = [];
  try {
    for (const variant of ['even', 'bw'] as const) {
      const crop = cropRegion(page[variant], page.width, page.height, plan.rect, plan.scale, 14);
      const result = await engine.recognize(bmpBlob(crop.data, crop.width, crop.height), { psm: plan.psm, whitelist: plan.whitelist, rotate: false, size: { width: crop.width, height: crop.height } });
      for (const lines of [result.native, result.rows]) {
        const text = lines.map(l => l.text).join(' ').trim(); if (!text) continue; texts.push(text);
        const value = readRegionValue(plan.mode, text); if (value === null) continue;
        const key = String(value), entry = counts.get(key); if (entry) entry.n++; else counts.set(key, { value, n: 1 });
      }
    }
  } finally { releaseLater(); }
  return { values: [...counts.values()].sort((a, b) => b.n - a.n).map(e => e.value), texts: [...new Set(texts)] };
}

/** Stops a reading in progress and frees the reader (the next scan starts it again). */
export function cancelReceiptRead() {
  tesseractEngine.cancel();
  const jobs = [...pendingPrep.values()]; pendingPrep.clear(); prepWorker?.terminate(); prepWorker = null;
  jobs.forEach(job => job.reject(Error('Pembacaan dibatalkan.')));
}
export { checkReceipt };
