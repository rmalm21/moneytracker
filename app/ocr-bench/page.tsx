'use client';
import { useEffect, useState } from 'react';
import { readReceiptPhoto } from '@/lib/receipt-ocr';

/**
 * Development-only page for the receipt benchmark (bench/receipts/run.mjs). It exposes window.__readReceipt so the
 * runner can read a photo with the same code the app uses. In a production build it shows nothing.
 */
export default function OcrBench() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __readReceipt: (url: string) => Promise<unknown> }).__readReceipt = async (url: string) => {
      const blob = await (await fetch(url)).blob();
      const result = await readReceiptPhoto(blob) as unknown as Record<string, unknown>;
      // The working images are large; only the reading goes back to the runner.
      const { prepared: _prepared, passList, ...rest } = result as { prepared?: unknown; passList?: { id: string; text: string; confidence: number }[] } & Record<string, unknown>;
      return JSON.parse(JSON.stringify({ ...rest, passList: (passList || []).map(p => ({ id: p.id, text: p.text, confidence: p.confidence })) }));
    };
    setReady(true);
  }, []);
  return <main style={{ padding: 24 }}>{ready ? <p id="bench-ready">Siap</p> : <p>Halaman ini hanya untuk pengembangan.</p>}</main>;
}
