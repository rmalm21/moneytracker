/**
 * Insight V3 — new signals on top of V2.5: liquidity timing (lowest point, bills close together, claim arrives vs
 * delayed), behavior sequences across cycles, exposure (concentration), wallet yield. Neutral wording, no shaming;
 * a pattern needs repeated cycles before it is mentioned.
 */
import { sum } from '../insight-v25/baseline.ts';
import { confidence } from '../insight-v25/confidence.ts';
import { merchantKey, type InsightContext } from '../insight-v25/context.ts';
import { dateText, pct, rp, short, signal } from '../insight-v25/signals/common.ts';
import type { InsightSignal } from '../insight-v25/types.ts';
import { obligationClusters, type ScenarioResult } from './scenario.ts';
import type { FinancialWorld } from './world.ts';

export function liquiditySignals(world: FinancialWorld, base: ScenarioResult, arrives: ScenarioResult, delayed: ScenarioResult, hasOpenClaims: boolean): InsightSignal[] {
  const out: InsightSignal[] = [];
  const pace = Math.max(1, world.liquidity.dailyPace), low = base.lowest;
  if (low.balance < pace * 7) {
    const why = low.events.length ? `${low.events.length} pengeluaran terjadwal berdekatan sebelum tanggal itu` : 'laju belanja harian sampai tanggal itu';
    out.push(signal({
      signature: 'liquidity:lowest', domain: 'cashflow', type: 'liquidity_low_point',
      title: low.balance < 0 ? `Uang bisa minus sekitar ${dateText(low.date)}` : `Titik tersempit sekitar ${dateText(low.date)}`,
      summary: `Bila pola belanja sama dan tagihan terjadwal dibayar, uang bebas paling rendah ±${rp(low.balance)} pada ${dateText(low.date)} (${why}).${hasOpenClaims && arrives.lowest.balance !== delayed.lowest.balance ? ` Bila klaim cair sesuai riwayat: ±${rp(arrives.lowest.balance)}; bila tertunda: ±${rp(delayed.lowest.balance)}.` : ''}`,
      headline: `Titik tersempit ±${short(low.balance)} sekitar ${dateText(low.date)}`,
      tone: low.balance < 0 ? 'important' : 'watch', severity: low.balance < 0 ? .75 : .5, deepDive: 'cashflow', unit: 'money',
      confidence: confidence({ progress: world.currentCycle.elapsed / world.currentCycle.total }), current: low.balance, impact: Math.max(0, -low.balance), urgency: .8, actionable: true, material: true,
      evidence: [{ label: 'Uang bebas sekarang (− cadangan)', value: rp(world.liquidity.free - world.liquidity.buffer) }, { label: 'Laju belanja per hari', value: rp(pace), note: 'tanpa tagihan & rencana (dihitung terpisah)' }, ...low.events.map(e => ({ label: `${dateText(e.date)} · ${e.label}`, value: rp(e.amount) })), { label: 'Sebelum gajian', value: rp(base.beforePayday) }],
      caveats: ['SIMULASI dari pola belanja dan jadwal yang tercatat, bukan kepastian.'],
      action: { label: 'Lihat proyeksi', target: { view: 'forecast' } },
    }, world.asOf));
  }
  for (const c of obligationClusters(world)) out.push(signal({
    signature: `liquidity:cluster:${c.from}`, domain: 'cashflow', type: 'obligation_cluster',
    title: `${c.items.length} tagihan ${short(c.total)} dalam ${Math.max(1, Number(c.to.slice(8)) - Number(c.from.slice(8)) + 1)} hari`,
    summary: `Antara ${dateText(c.from)} dan ${dateText(c.to)}: ${c.items.map(i => i.title).join(', ')}.`,
    headline: `${c.items.length} tagihan berdekatan mulai ${dateText(c.from)}`,
    tone: 'neutral', severity: .3, deepDive: 'cashflow', confidence: confidence({ direct: true }), current: c.total, urgency: .6, material: false,
    evidence: c.items.map(i => ({ label: `${dateText(i.date)} · ${i.title}`, value: rp(-i.amount) })),
    action: { label: 'Lihat jadwal', target: { view: 'upcoming' } },
  }, world.asOf));
  return out;
}

/** Payday sequence: a large share of daily spending in the first 3 days after payday, in most cycles. */
export function behaviorSignals(ctx: InsightContext, world: FinancialWorld): InsightSignal[] {
  const out: InsightSignal[] = [];
  if (ctx.baseline.length < 3) return out;
  const rows = ctx.baseline.map(c => {
    const daily = c.lines.filter(l => l.tx.type === 'expense' && !l.tx.recurringTransactionId && !l.tx.plannedId && !l.tx.draftId);
    const total = sum(daily.map(l => l.amount));
    const big = daily.filter(l => l.amount > total * .25);
    const kept = daily.filter(l => !big.includes(l)), keptTotal = sum(kept.map(l => l.amount));
    const days = Math.max(1, Math.round((new Date(`${c.end}T12:00:00`).getTime() - new Date(`${c.start}T12:00:00`).getTime()) / 86400000));
    const first = sum(kept.filter(l => l.date < addDay(c.start, 3)).map(l => l.amount)), last = sum(kept.filter(l => l.date >= addDay(c.end, -7)).map(l => l.amount));
    return { label: c.label, first: keptTotal ? first / keptTotal : 0, last: keptTotal ? last / keptTotal : 0, expectFirst: 3 / days, expectLast: 7 / days };
  });
  const front = rows.filter(r => r.first >= r.expectFirst * 2);
  if (front.length >= Math.ceil(rows.length * .6)) {
    const avg = sum(rows.map(r => r.first)) / rows.length, slow = rows.filter(r => r.last <= r.expectLast * .7).length >= Math.ceil(rows.length * .6);
    out.push(signal({
      signature: 'behavior:payday-sequence', domain: 'behavior', type: 'payday_sequence',
      title: 'Pola setelah gajian', summary: `Di ${front.length} dari ${rows.length} siklus, ±${pct(avg)} belanja harian terjadi dalam 3 hari pertama setelah gajian${slow ? ', lalu melambat di minggu terakhir' : ''}. Ini pola, bukan penilaian.`,
      headline: `±${pct(avg)} belanja harian terjadi 3 hari pertama setelah gajian`,
      tone: 'neutral', severity: .2, deepDive: 'habits', unit: 'percent', confidence: confidence({ cycles: rows.length }), current: avg, material: false,
      evidence: rows.map(r => ({ label: `Siklus ${r.label}`, value: `${pct(r.first)} di 3 hari pertama`, note: `${pct(r.last)} di 7 hari terakhir` })),
      caveats: ['Tagihan rutin, rencana, dan transaksi besar sekali jalan tidak dihitung.'],
    }, world.asOf));
  }
  // Exposure: one merchant holding a large share of everyday spending across cycles.
  const all = ctx.baseline.flatMap(c => c.lines.filter(l => l.tx.type === 'expense' && l.merchant && !l.tx.recurringTransactionId));
  const total = sum(all.map(l => l.amount)), byShop = new Map<string, { name: string; amount: number }>();
  for (const l of all) { const k = merchantKey(l.merchant), row = byShop.get(k) || { name: l.merchant, amount: 0 }; row.amount += l.amount; byShop.set(k, row); }
  const top = [...byShop.values()].sort((a, b) => b.amount - a.amount)[0];
  if (top && total && top.amount / total >= .3) out.push(signal({
    signature: 'exposure:merchant', domain: 'behavior', type: 'merchant_concentration',
    title: `${pct(top.amount / total)} belanja bermerchant ada di ${top.name}`, summary: `Dalam ${ctx.baseline.length} siklus, ${rp(top.amount)} dari ${rp(total)} belanja yang punya nama tempat terjadi di ${top.name}. Perubahan harga atau kebiasaan di sana paling terasa.`,
    tone: 'neutral', severity: .15, deepDive: 'habits', unit: 'percent', confidence: confidence({ cycles: ctx.baseline.length }), current: top.amount / total, material: false, evidence: [{ label: top.name, value: rp(top.amount) }, { label: 'Semua belanja bermerchant', value: rp(total) }],
  }, world.asOf));
  return out;
}

export function yieldSignals(world: FinancialWorld): InsightSignal[] {
  const i = world.wealth.interest;
  if (!(i.net > 0)) return [];
  return [signal({
    signature: 'wealth:interest', domain: 'wealth', type: 'wallet_interest',
    title: `Bunga dompet ${rp(i.net)} dalam 30 hari`, summary: `Bruto ${rp(i.gross)}, pajak ${rp(i.tax)}, bersih ${rp(i.net)} (dari bunga saldo otomatis yang tercatat).`,
    tone: 'positive', severity: .1, deepDive: 'wealth', confidence: confidence({ direct: true }), current: i.net, material: false,
    evidence: [{ label: 'Bruto', value: rp(i.gross) }, { label: 'Pajak', value: rp(i.tax) }, { label: 'Bersih', value: rp(i.net) }],
    series: { labels: [...i.trend.map((_, k) => k === i.trend.length - 1 ? 'Kini' : `S${k + 1}`)], values: i.trend },
  }, world.asOf)];
}
const addDay = (date: string, n: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
