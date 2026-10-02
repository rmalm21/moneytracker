/**
 * Insight V2.5 — prices of items from scanned receipts (initial, not an inflation index).
 *
 * Items match by SKU at the same shop, otherwise by normalized name + size + variant at the same shop. Different
 * sizes never match ("Minyak 1L" vs "Minyak 2L"). The price is what was really paid per unit (line total ÷ qty,
 * after the line discount); a crossed-out marketplace price (originalPrice) is never used. A change is reported only
 * with at least 3 purchases, 2 of them before the latest. Run lazily: only when the "Harga" section is opened.
 */
import { quantile } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import { merchantKey, type InsightContext } from '../context.ts';
import type { InsightSignal } from '../types.ts';
import { dateText, pct, rp, signal } from './common.ts';

const SIZE = /(\d+(?:[.,]\d+)?)\s?(kg|kilo|gr|gram|g|ml|liter|ltr|lt|l|pcs|pc|sachet|btl|s)\b/i;
/** "Minyak Goreng Bimoli 2L" → { base: "minyak goreng bimoli", size: "2000ml" }. */
export function itemIdentity(name: string) {
  const lower = name.toLocaleLowerCase('id-ID'), m = SIZE.exec(lower);
  let size = '';
  if (m) {
    const value = Number(m[1].replace(',', '.')), unit = m[2].toLowerCase();
    size = /^(kg|kilo)$/.test(unit) ? `${value * 1000}g` : /^(gr|gram|g)$/.test(unit) ? `${value}g` : /^(liter|ltr|lt|l)$/.test(unit) ? `${value * 1000}ml` : unit === 'ml' ? `${value}ml` : `${value}pcs`;
  }
  const base = (m ? lower.replace(m[0], ' ') : lower).replace(/[^a-z0-9]+/g, ' ').trim();
  return { base, size };
}

export type PricePoint = { date: string; price: number; qty: number; txId: string; merchant: string };
export function itemPriceHistory(ctx: InsightContext) {
  const rows = new Map<string, { name: string; merchant: string; size: string; points: PricePoint[] }>();
  for (const tx of ctx.input.history) {
    const receipt = tx.receipt; if (!receipt?.items?.length || tx.type !== 'expense') continue;
    const shop = merchantKey(receipt.merchant || tx.merchant || '');
    if (!shop) continue;
    for (const item of receipt.items) {
      const qty = item.qty > 0 ? item.qty : 1, paid = item.total > 0 ? item.total : item.price * qty;
      if (!(paid > 0)) continue;
      const id = itemIdentity(item.name);
      const key = item.sku ? `sku:${item.sku}|${shop}` : `name:${id.base}|${id.size}|${(item.variant || '').toLowerCase()}|${shop}`;
      const row = rows.get(key) || { name: item.name, merchant: receipt.merchant || tx.merchant, size: id.size, points: [] };
      // A SKU that comes back with another size is not the same product.
      if (item.sku && row.points.length && row.size !== id.size) continue;
      row.points.push({ date: receipt.date || tx.date, price: Math.round(paid / qty), qty, txId: tx.id, merchant: row.merchant });
      rows.set(key, row);
    }
  }
  return rows;
}

export function priceSignals(ctx: InsightContext): InsightSignal[] {
  const out: InsightSignal[] = [];
  for (const [key, row] of itemPriceHistory(ctx)) {
    const points = row.points.sort((a, b) => a.date.localeCompare(b.date));
    if (points.length < 3) continue;
    const last = points[points.length - 1], before = points.filter(p => p.date < last.date);
    if (before.length < 2) continue;
    const usual = quantile(before.map(p => p.price), .5), diff = last.price - usual;
    if (Math.abs(diff) < Math.max(200, usual * .05)) continue;
    const qtyUsual = quantile(before.map(p => p.qty), .5), up = diff > 0;
    out.push(signal({
      signature: `prices:item:${key.replace(/[^a-z0-9:|]+/gi, '-')}`, domain: 'prices', type: up ? 'item_price_up' : 'item_price_down',
      title: `${row.name} ${up ? 'naik' : 'turun'} ${pct(Math.abs(diff) / usual)}`,
      summary: `Di ${row.merchant}: ${rp(last.price)} per item pada ${dateText(last.date)}, biasanya ${rp(usual)} (${before.length} pembelian sebelumnya).`,
      headline: `${row.name} di ${row.merchant} kini ${rp(last.price)}`,
      tone: up ? 'neutral' : 'positive', severity: .15, deepDive: 'prices', unit: 'money',
      confidence: confidence({ samples: points.length, direct: false }), current: last.price, baseline: usual, delta: diff, impact: 0, material: false,
      evidence: [...points.slice(-5).map(p => ({ label: dateText(p.date), value: rp(p.price), note: p.qty !== 1 ? `${p.qty} item` : undefined, txIds: [p.txId] })), ...(last.qty !== qtyUsual ? [{ label: 'Jumlah beli', value: `${last.qty} item`, note: `biasanya ${qtyUsual}; harga per item tetap dibandingkan` }] : [])],
      caveats: ['Dibandingkan per item di toko yang sama dan ukuran yang sama; harga coret di aplikasi belanja tidak dipakai.'],
    }, ctx.today));
  }
  return out.sort((a, b) => Math.abs((b.delta || 0) / (b.baseline || 1)) - Math.abs((a.delta || 0) / (a.baseline || 1)));
}
