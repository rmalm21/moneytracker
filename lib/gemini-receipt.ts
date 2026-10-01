/**
 * Gemini helps read a receipt: the cut, straightened receipt image (never the whole photo) goes to Google's Gemini API
 * and comes back as structured fields. Only when the person has it on (Scan struk), is online, and a key is set in
 * NEXT_PUBLIC_GEMINI_API_KEY. Nothing is stored anywhere; the on-device reader still runs and fills whatever Gemini
 * leaves empty, and is the only reader when Gemini is off, offline or unavailable.
 */
import type { PaymentMethod, ReceiptLine, ReceiptRead } from './receipt';

const KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
/** The model asked for first; when it is busy (503/429) the next one is tried. */
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;
const PREF = 'dompet-ajaib:gemini-receipt';

export const geminiConfigured = () => Boolean(KEY);
/** On unless the person switched it off on this device. */
export function geminiWanted() { try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; } }
export function setGeminiWanted(on: boolean) { try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* default */ } }
export const geminiReady = () => geminiConfigured() && geminiWanted() && (typeof navigator === 'undefined' || navigator.onLine !== false);

export type GeminiReceipt = {
  merchant?: string | null; date?: string | null; time?: string | null;
  items?: { name: string; qty: number; unitPrice?: number | null; total: number; discount?: number | null }[];
  subtotal?: number | null; discount?: number | null; tax?: number | null; service?: number | null; delivery?: number | null; fee?: number | null; rounding?: number | null; total?: number | null;
  payment?: string | null;
};

const money = { type: 'INTEGER', nullable: true };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true }, date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD' }, time: { type: 'STRING', nullable: true, description: 'HH:MM, 24 jam' },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, qty: { type: 'INTEGER' }, unitPrice: money, total: { type: 'INTEGER' }, discount: money }, required: ['name', 'qty', 'total'] } },
    subtotal: money, discount: money, tax: money, service: money, delivery: money, fee: money, rounding: money, total: money,
    payment: { type: 'STRING', nullable: true, description: 'cash, qris, debit, credit, transfer, gopay, ovo, dana, shopeepay, linkaja' },
  },
  required: ['items'],
};
const PROMPT = [
  'Baca struk belanja Indonesia pada gambar ini.',
  'Salin hanya yang benar-benar tertulis di struk; jangan menebak atau mengarang. Yang tidak ada: null.',
  'Nominal dalam Rupiah sebagai bilangan bulat tanpa titik atau koma (Rp 12.500 → 12500).',
  'items: setiap barang/menu yang dibeli; total = harga baris sebelum diskon item; qty minimal 1.',
  'Baris catatan tanpa harga (mis. "NO ICE", "LESS SUGAR") bukan item.',
  'discount = total diskon/voucher di bagian ringkasan (angka positif). tax = PB1/PPN/pajak. service = service charge.',
  'fee = biaya lain (admin, kemasan, aplikasi). rounding = pembulatan (boleh negatif). total = jumlah akhir yang dibayar.',
].join('\n');

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Asks Gemini to read the receipt image. Returns null when it is off, offline, busy or the answer is unusable. */
export async function readWithGemini(image: Blob, signal?: AbortSignal): Promise<GeminiReceipt | null> {
  if (!geminiReady()) return null;
  const data = await toBase64(image);
  const body = JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: image.type || 'image/jpeg', data } }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 } });
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) return null;
      const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 25000), stop = () => timeout.abort();
      signal?.addEventListener('abort', stop);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body, signal: timeout.signal });
        if (response.status === 503 || response.status === 429 || response.status >= 500) { if (attempt === 0) { await new Promise(r => setTimeout(r, 1200)); continue; } break; }
        if (!response.ok) return null;
        const json = await response.json();
        const text = json?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
        return parseGemini(text);
      } catch { if (signal?.aborted) return null; break; }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
    }
  }
  return null;
}

const int = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : null;
/** Gemini's JSON → checked values; anything malformed is dropped rather than guessed. */
export function parseGemini(text: string): GeminiReceipt | null {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const str = (value: unknown, max = 80) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
  const pos = (value: unknown) => { const n = int(value); return n !== null && n >= 0 && n < 1e11 ? n : null; };
  const items = Array.isArray(raw.items) ? raw.items.flatMap(row => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>, name = str(r.name, 60), total = pos(r.total), qty = Math.max(1, Math.min(999, int(r.qty) || 1));
    if (!name || total === null) return [];
    return [{ name, qty, total, unitPrice: pos(r.unitPrice), discount: pos(r.discount) }];
  }) : [];
  const date = str(raw.date), time = str(raw.time);
  const rounding = int(raw.rounding);
  return {
    merchant: str(raw.merchant), date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, time: time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : null,
    items, subtotal: pos(raw.subtotal), discount: pos(raw.discount), tax: pos(raw.tax), service: pos(raw.service), delivery: pos(raw.delivery), fee: pos(raw.fee),
    rounding: rounding !== null && Math.abs(rounding) < 1e6 ? rounding : null, total: pos(raw.total), payment: str(raw.payment, 20),
  };
}

const PAYMENTS: Record<string, PaymentMethod> = { cash: 'cash', tunai: 'cash', qris: 'qris', debit: 'debit', credit: 'credit', kredit: 'credit', transfer: 'transfer', gopay: 'gopay', ovo: 'ovo', dana: 'dana', shopeepay: 'shopeepay', linkaja: 'linkaja' };
/**
 * The on-device reading with Gemini's values laid over it: what Gemini read wins, what it left empty keeps the local
 * value. Replaced items lose their line links (Gemini gives no position); the local layout stays for the rest.
 */
export function mergeGemini(local: ReceiptRead, g: GeminiReceipt | null): ReceiptRead {
  if (!g) return local;
  const pick = (value: number | null | undefined, fallback: number) => value === null || value === undefined ? fallback : value;
  const items: ReceiptLine[] = g.items?.length ? g.items.map(item => {
    const price = item.unitPrice ?? Math.round(item.total / item.qty);
    return { name: item.name, qty: item.qty, price, total: item.total, ...(item.discount ? { discount: item.discount } : {}), unitPrinted: item.unitPrice !== null && item.unitPrice !== undefined };
  }) : local.items;
  const payment = g.payment ? PAYMENTS[g.payment.toLowerCase().replace(/[^a-z]/g, '')] ?? local.payment : local.payment;
  const moneyChanged = ['subtotal', 'discount', 'tax', 'service', 'delivery', 'fee', 'rounding', 'total'].some(key => (g as Record<string, unknown>)[key] !== null && (g as Record<string, unknown>)[key] !== undefined);
  return {
    ...local,
    merchant: g.merchant || local.merchant, date: g.date || local.date, time: g.time || local.time, items, payment,
    subtotal: pick(g.subtotal, local.subtotal), discount: pick(g.discount, local.discount), tax: pick(g.tax, local.tax), service: pick(g.service, local.service),
    delivery: pick(g.delivery, local.delivery), fee: pick(g.fee, local.fee || 0), rounding: pick(g.rounding, local.rounding), total: pick(g.total, local.total),
    // The printed charge lines were the local reading's; with Gemini's amounts they could disagree, so they go.
    ...(moneyChanged ? { charges: undefined, totals: g.total ? [g.total] : local.totals, fixes: [] } : {}),
    ...(g.items?.length ? { itemGaps: 0 } : {}),
  };
}
