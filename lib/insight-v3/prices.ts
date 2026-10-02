/**
 * Insight V3 — Personal Cost Intelligence.
 *
 * Personal Cost Index: how the prices of the user's own repeated purchases moved — a fixed basket of matched items
 * (V2.5 matching: same SKU at the same shop, or same name + size + variant at the same shop), base quantities from
 * the earlier cycles, prices = what was really paid per unit (median per period). Laspeyres-style:
 *   index = Σ p_recent·q_base / Σ p_base·q_base.
 * It is NOT Indonesia's inflation rate. No index when fewer than 5 items match, coverage is under 30%, or history
 * is shorter than 3 cycles. Spending change on receipt items is split into price, quantity and new/other items.
 * Merchant comparison says only what the user paid in the past ("biasanya lebih murah di sana"), never "cheapest now".
 */
import { quantile, sum } from '../insight-v25/baseline.ts';
import type { InsightContext } from '../insight-v25/context.ts';
import { itemIdentity, itemPriceHistory, type PricePoint } from '../insight-v25/signals/prices.ts';

export type CostIndex = {
  ok: boolean; reason?: string;
  index?: number; change?: number;
  items: number; coverage: number; cycles: number;
  contributors: { name: string; merchant: string; from: number; to: number; share: number }[];
  decomposition?: { total: number; price: number; quantity: number; other: number };
};

export function personalCostIndex(ctx: InsightContext): CostIndex {
  const cycles = ctx.baseline;
  if (cycles.length < 3) return { ok: false, reason: 'Butuh minimal 3 siklus lengkap dengan struk.', items: 0, coverage: 0, cycles: cycles.length, contributors: [] };
  const recent = cycles[cycles.length - 1], base = cycles.slice(0, -1);
  const inBase = (p: PricePoint) => base.some(c => p.date >= c.start && p.date < c.end), inRecent = (p: PricePoint) => p.date >= recent.start && p.date < recent.end;
  const rows = [...itemPriceHistory(ctx).values()];
  const matched = rows.map(r => {
    const b = r.points.filter(inBase), n = r.points.filter(inRecent);
    if (b.length < 2 || !n.length) return null;
    return { name: r.name, merchant: r.merchant, pB: quantile(b.map(p => p.price), .5), pR: quantile(n.map(p => p.price), .5), qB: sum(b.map(p => p.qty)) / base.length, qR: sum(n.map(p => p.qty)) };
  }).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const recentAll = rows.flatMap(r => r.points.filter(inRecent)), recentSpend = sum(recentAll.map(p => p.price * p.qty));
  const matchedSpend = sum(matched.map(m => m.pR * m.qR));
  const coverage = recentSpend ? matchedSpend / recentSpend : 0;
  const result: CostIndex = { ok: false, items: matched.length, coverage, cycles: cycles.length, contributors: [] };
  if (matched.length < 5) return { ...result, reason: `Baru ${matched.length} barang yang dibeli berulang dengan ukuran yang sama (butuh 5).` };
  if (coverage < .3) return { ...result, reason: `Barang yang cocok baru ${Math.round(coverage * 100)}% dari belanja berstruk (butuh 30%).` };
  const baseCost = sum(matched.map(m => m.pB * m.qB)), recentCost = sum(matched.map(m => m.pR * m.qB));
  const index = recentCost / baseCost;
  const contributors = matched.map(m => ({ name: m.name, merchant: m.merchant, from: m.pB, to: m.pR, share: (m.pR - m.pB) * m.qB / baseCost })).filter(c => c.share !== 0).sort((a, b) => Math.abs(b.share) - Math.abs(a.share)).slice(0, 3);
  // Spending on receipt items, recent cycle vs a usual base cycle: price effect + quantity effect + other/new items.
  const baseAll = rows.flatMap(r => r.points.filter(inBase)), baseSpendPerCycle = sum(baseAll.map(p => p.price * p.qty)) / base.length;
  const price = sum(matched.map(m => (m.pR - m.pB) * m.qR)), quantity = sum(matched.map(m => (m.qR - m.qB) * m.pB));
  const total = recentSpend - baseSpendPerCycle;
  return { ok: true, index, change: index - 1, items: matched.length, coverage, cycles: cycles.length, contributors, decomposition: { total, price, quantity, other: total - price - quantity } };
}

/** The same product bought at different shops: the median the user paid at each (history, not today's price). */
export function merchantPrices(ctx: InsightContext) {
  const byProduct = new Map<string, { name: string; shops: Map<string, number[]> }>();
  for (const tx of ctx.input.history) for (const item of tx.receipt?.items || []) {
    const id = itemIdentity(item.name); if (!id.size) continue;
    const key = `${id.base}|${id.size}`, shop = (tx.receipt?.merchant || tx.merchant || '').trim(); if (!shop) continue;
    const row = byProduct.get(key) || { name: item.name, shops: new Map() };
    const unit = (item.total > 0 ? item.total : item.price * (item.qty || 1)) / (item.qty > 0 ? item.qty : 1);
    row.shops.set(shop, [...(row.shops.get(shop) || []), unit]); byProduct.set(key, row);
  }
  return [...byProduct.values()].filter(r => r.shops.size >= 2 && [...r.shops.values()].every(v => v.length >= 2)).map(r => ({ name: r.name, shops: [...r.shops.entries()].map(([shop, v]) => ({ shop, median: quantile(v, .5), count: v.length })).sort((a, b) => a.median - b.median) }));
}
