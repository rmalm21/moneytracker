'use client';
import { useEffect, useState } from 'react';
import { readReceiptPhoto } from '@/lib/receipt-ocr';

/**
 * Development-only page for the receipt benchmark (bench/receipts/run.mjs). It exposes window.__readReceipt so the
 * runner can read a photo with the same code the app uses, with a chosen engine. In a production build it shows nothing.
 */
type Options = { engine?: 'tesseract' | 'paddle-tiny' | 'paddle-small' | 'paddle-first' | 'tesseract-first' };
export default function OcrBench() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as Record<string, unknown>;
    w.__readReceipt = async (url: string, options: Options = {}) => {
      const blob = await (await fetch(url)).blob();
      const { paddleEngine } = await import('@/lib/ocr-paddle');
      const engine = options.engine === 'paddle-tiny' ? paddleEngine('tiny') : options.engine === 'paddle-small' ? paddleEngine('small') : undefined;
      const result = await readReceiptPhoto(blob, undefined, { ...(engine ? { engine } : {}), ...(options.engine === 'paddle-first' || options.engine === 'tesseract-first' || options.engine === 'tesseract' ? { routing: options.engine } : {}) } as never) as unknown as Record<string, unknown>;
      // The working images are large; only the reading goes back to the runner.
      const { prepared: _prepared, passList, ...rest } = result as { prepared?: unknown; passList?: { id: string; text: string; confidence: number }[] } & Record<string, unknown>;
      return JSON.parse(JSON.stringify({ ...rest, passList: (passList || []).map(p => ({ id: p.id, text: p.text, confidence: p.confidence })) }));
    };
    // The raw text of one engine on one image (for engine comparisons), with its time.
    w.__rawRead = async (url: string, tier: 'tiny' | 'small') => {
      const blob = await (await fetch(url)).blob();
      const { paddleEngine } = await import('@/lib/ocr-paddle');
      const started = performance.now(), r = await paddleEngine(tier).recognize(blob, { psm: '6' });
      return { ms: Math.round(performance.now() - started), text: r.rows.map(l => l.text).join('\n'), segments: r.native.length, confidence: r.confidence, native: r.native };
    };
    // Engine speed probe: one image, one model size, one detection size and thread count; the SDK's own timings.
    w.__paddleProbe = async (url: string, tier: 'tiny' | 'small', side: number, threads = 1) => {
      const blob = await (await fetch(url)).blob(), base = `${window.location.origin}/ocr`;
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      const t0 = performance.now();
      const ocr = await PaddleOCR.create({ textDetectionModelName: `PP-OCRv6_${tier}_det`, textDetectionModelAsset: { url: `${base}/paddle/v6-${tier}/det.tar` }, textRecognitionModelName: `PP-OCRv6_${tier}_rec`, textRecognitionModelAsset: { url: `${base}/paddle/v6-${tier}/rec.tar` }, ortOptions: { backend: 'wasm', wasmPaths: `${base}/ort/`, numThreads: threads, simd: true } }) as unknown as { predict(b: Blob, p: Record<string, unknown>): Promise<{ items: { text: string }[]; metrics: Record<string, number> }[]>; dispose(): void };
      const load = performance.now() - t0, out = [];
      for (let i = 0; i < 2; i++) { const t = performance.now(); const [r] = await ocr.predict(blob, { textDetLimitSideLen: side, textDetLimitType: 'max' }); out.push({ ms: Math.round(performance.now() - t), ...r.metrics, text: r.items.map(x => x.text).join(' | ') }); }
      ocr.dispose();
      return { load: Math.round(load), runs: out, isolated: crossOriginIsolated, cores: navigator.hardwareConcurrency };
    };
    setReady(true);
  }, []);
  return <main style={{ padding: 24 }}>{ready ? <p id="bench-ready">Siap</p> : <p>Halaman ini hanya untuk pengembangan.</p>}</main>;
}
