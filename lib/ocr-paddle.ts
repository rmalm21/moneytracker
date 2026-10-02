/**
 * The second on-device reader: PaddleOCR.js (official SDK) with PP-OCRv6 (detection + recognition), on ONNX Runtime
 * Web (WASM). Models and runtime files are served by the app itself (/ocr/paddle, /ocr/ort, see scripts/copy-ocr.mjs):
 * no outside host and no upload. Loaded only when it is needed, and freed again after a few idle minutes.
 *
 * Two sizes: "tiny" (≈6 MB, for phones with little memory) and "small" (≈31 MB, more accurate). The reader is behind
 * the same OcrEngine interface as Tesseract, so the receipt logic never depends on either engine's own output format.
 */
import type { OcrEngine, Recognized, RecognizeOptions } from './receipt-ocr.ts';
import { linesFromWords, slopeOf, unionBox, type OcrLine, type OcrWord } from './receipt-rows.ts';

export type PaddleTier = 'tiny' | 'small';
type Item = { poly: number[][] | { x: number; y: number }[]; text: string; score: number };
type Instance = { predict(image: Blob | ImageBitmap, params?: Record<string, unknown>): Promise<{ items: Item[]; image: { width: number; height: number }; metrics: Record<string, number> }[]>; dispose(): Promise<void> | void };

/**
 * The tier for this device: the small (more accurate) models on any phone with 4 GB or more, and where the browser does
 * not say (iPhone); the tiny ones only on phones with very little memory. Measured on real receipts, tiny misread totals
 * and dates that small read right, and small on 4 threads takes about as long as tiny used to.
 */
export function paddleTierFor(memoryGb = typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory : undefined): PaddleTier {
  return memoryGb !== undefined && memoryGb < 4 ? 'tiny' : 'small';
}

/**
 * Threads for the engine: several only when the page is cross-origin isolated (COOP + COEP headers, see firebase.json),
 * which is what lets WebAssembly share memory between workers; otherwise one (it still works, only slower).
 */
export function paddleThreads(isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated, cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1) {
  return isolated ? Math.max(1, Math.min(4, cores || 1)) : 1;
}

type Loading = { tier: PaddleTier; ready: Promise<Instance>; loaded?: boolean };
let current: Loading | null = null, idle: ReturnType<typeof setTimeout> | undefined;
function instance(tier: PaddleTier) {
  clearTimeout(idle);
  if (current?.tier !== tier) {
    const old = current; current = null;
    void old?.ready.then(o => o.dispose()).catch(() => undefined);
    const base = `${window.location.origin}/ocr`;
    const ready = (async () => {
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      return await PaddleOCR.create({
        textDetectionModelName: `PP-OCRv6_${tier}_det`, textDetectionModelAsset: { url: `${base}/paddle/v6-${tier}/det.tar` },
        textRecognitionModelName: `PP-OCRv6_${tier}_rec`, textRecognitionModelAsset: { url: `${base}/paddle/v6-${tier}/rec.tar` },
        ortOptions: { backend: 'wasm', wasmPaths: `${base}/ort/`, numThreads: paddleThreads(), simd: true },
      }) as unknown as Instance;
    })();
    const entry: Loading = { tier, ready };
    ready.then(() => { entry.loaded = true; }, () => { if (current === entry) current = null; });
    current = entry;
  }
  return current.ready;
}
/**
 * Where the engine is for this device, so the screen says the right thing: already in memory (nothing to wait for),
 * saved on the phone (loaded from the cache in a moment), or still to be downloaded once.
 */
export async function paddleState(tier: PaddleTier = paddleTierFor()): Promise<'ready' | 'cached' | 'download'> {
  if (current?.tier === tier && current.loaded) return 'ready';
  try {
    const base = `${window.location.origin}/ocr`, files = [`${base}/paddle/v6-${tier}/det.tar`, `${base}/paddle/v6-${tier}/rec.tar`, `${base}/ort/ort-wasm-simd-threaded.wasm`];
    const hits = await Promise.all(files.map(url => caches.match(url)));
    return hits.every(Boolean) ? 'cached' : 'download';
  } catch { return 'cached'; }
}
/** Frees the models and their memory after some idle minutes (the next photo loads them again from the cache, not the internet). */
function releaseLater() { clearTimeout(idle); idle = setTimeout(() => { const old = current; current = null; void old?.ready.then(o => o.dispose()).catch(() => undefined); }, 10 * 60_000); }
/** Starts loading the models ahead of a reading (e.g. when Scan struk opens), so the reading itself does not wait. */
export function warmPaddle(tier: PaddleTier = paddleTierFor()) { void instance(tier).then(() => releaseLater(), () => undefined); }
export function releasePaddle() { clearTimeout(idle); const old = current; current = null; void old?.ready.then(o => o.dispose()).catch(() => undefined); }

const points = (poly: Item['poly']) => (poly as (number[] | { x: number; y: number })[]).map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
/**
 * One detected text segment → word boxes: the segment's box split across its words by their share of characters
 * (the engine gives one box per segment, the receipt logic works with words).
 */
export function segmentWords(text: string, poly: Item['poly'], score: number): OcrWord[] {
  const pts = points(poly); if (!pts.length) return [];
  const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  // On a slanted line the top and bottom edges rise or fall: each word takes its height where it stands.
  const [tl, tr, br, bl] = pts.length >= 4 ? pts : [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const at = (a: { x: number; y: number }, b: { x: number; y: number }, x: number) => b.x === a.x ? a.y : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  const words = text.trim().split(/\s+/).filter(Boolean), total = words.reduce((n, w) => n + w.length, 0) + Math.max(0, words.length - 1);
  let used = 0;
  return words.map(word => {
    const start = x0 + (x1 - x0) * used / total, end = x0 + (x1 - x0) * (used + word.length) / total, mid = (start + end) / 2; used += word.length + 1;
    return { text: word, x0: start, x1: end, y0: Math.min(at(tl, tr, mid), at(bl, br, mid)), y1: Math.max(at(tl, tr, mid), at(bl, br, mid)), confidence: Math.round(score * 100) };
  });
}
/**
 * Segments → rows: a segment joins the row it overlaps most in height (tilt taken out) when they do not overlap side by
 * side; otherwise it starts a new row. Overlap, not the distance between centres: a price printed a little higher than
 * its name still belongs to it, and two close rows are not merged.
 */
export function rowsOfSegments(segments: OcrWord[][], slope = 0): OcrLine[] {
  type Seg = { words: OcrWord[]; top: number; bottom: number; left: number; right: number };
  const list: Seg[] = segments.filter(w => w.length).map(words => {
    const left = Math.min(...words.map(w => w.x0)), right = Math.max(...words.map(w => w.x1)), mid = (left + right) / 2;
    return { words, left, right, top: Math.min(...words.map(w => w.y0)) - slope * mid, bottom: Math.max(...words.map(w => w.y1)) - slope * mid };
  }).sort((a, b) => a.top - b.top);
  const rows: { segs: Seg[]; top: number; bottom: number }[] = [];
  for (const seg of list) {
    let best: (typeof rows)[number] | null = null, bestShare = 0;
    for (const row of rows) {
      if (row.segs.some(o => seg.left < o.right && o.left < seg.right)) continue;
      const share = (Math.min(seg.bottom, row.bottom) - Math.max(seg.top, row.top)) / Math.max(1, Math.min(seg.bottom - seg.top, row.bottom - row.top));
      if (share > bestShare) { bestShare = share; best = row; }
    }
    if (best && bestShare >= .45) { best.segs.push(seg); best.top = Math.min(best.top, seg.top); best.bottom = Math.max(best.bottom, seg.bottom); }
    else rows.push({ segs: [seg], top: seg.top, bottom: seg.bottom });
  }
  return rows.sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom)).map(row => linesFromWords(row.segs.sort((a, b) => a.left - b.left).flatMap(s => s.words).map(w => ({ ...w, y0: row.top, y1: row.bottom })), 0)[0]).filter(Boolean);
}
/** Engine segments → the shared shape: native = one line per segment, rows = segments regrouped by height. */
export function paddleToRecognized(items: Item[]): Recognized {
  const segments = items.filter(i => i.text.trim()).map(i => segmentWords(i.text, i.poly, i.score)).filter(w => w.length);
  const native: OcrLine[] = segments.map(words => { const tokens = words.map(w => ({ text: w.text, confidence: w.confidence ?? 0, box: { x: w.x0, y: w.y0, width: w.x1 - w.x0, height: w.y1 - w.y0 } })); return { text: words.map(w => w.text).join(' '), tokens, box: unionBox(tokens.map(t => t.box))!, confidence: tokens[0]?.confidence ?? 0 }; })
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  // The tilt of the text from the segments' own polygons (top edge), so rows of a slanted receipt are not merged.
  const baselines = items.map(i => points(i.poly)).filter(p => p.length >= 2).map(p => ({ x0: p[0].x, y0: p[0].y, x1: p[1].x, y1: p[1].y }));
  const rows = rowsOfSegments(segments, slopeOf(baselines));
  const confidence = items.length ? items.reduce((n, i) => n + i.score, 0) / items.length * 100 : 0;
  return { native, rows, confidence, segments: true };
}

export function paddleEngine(tier: PaddleTier = paddleTierFor()): OcrEngine & { id: string; tier: PaddleTier } {
  let cancelled = false;
  return {
    id: `paddle-v6-${tier}`, tier,
    async recognize(image: Blob, _options: RecognizeOptions) {
      cancelled = false;
      const ocr = await instance(tier);
      try {
        const [result] = await ocr.predict(image, { textDetLimitSideLen: 1280, textDetLimitType: 'max' });
        if (cancelled) throw Error('Pembacaan dibatalkan.');
        return paddleToRecognized(result?.items || []);
      } finally { releaseLater(); }
    },
    cancel() { cancelled = true; releasePaddle(); },
  };
}
