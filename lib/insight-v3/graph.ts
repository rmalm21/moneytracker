/**
 * Insight V3 — Financial Impact Graph.
 *
 * Nodes are V2.5 signals plus a few financial states (a budget, Uang tersedia, surplus siklus, ruang untuk target).
 * Edges say how one thing touches another, and on what basis:
 *   direct     — arithmetic in the ledger: GrabFood is part of Pesan Antar (driver tree), spending counts against its
 *                budget and leaves the wallet, an unpaid claim is money advanced and not in a wallet;
 *   estimated  — only under "if the pattern continues" (a smaller surplus leaves less room for goals);
 *   associated — moved together, no cause claimed (a habit and a category rising in the same cycle).
 * Correlation is never written as a direct edge.
 */
import type { InsightSignal, Story } from '../insight-v25/types.ts';
import type { FinancialWorld } from './world.ts';
import type { GraphEdge, GraphNode, ImpactGraph } from './types.ts';

export const STATE = { available: 'state:available', surplus: 'state:surplus', goals: 'state:goals', netWorth: 'state:networth' } as const;

export function buildGraph(signals: InsightSignal[], stories: Story[], world: FinancialWorld): ImpactGraph {
  const visible = signals.filter(s => s.lifecycleState !== 'DISMISSED' && s.lifecycleState !== 'SNOOZED');
  const bySig = new Map(visible.map(s => [s.signature, s]));
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const node = (n: GraphNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return n.id; };
  const sig = (s: InsightSignal) => node({ id: s.signature, label: s.title, kind: 'signal', status: s.tone, value: s.delta });
  const state = (id: string, label: string, value?: number) => node({ id, label, kind: 'state', value });
  const goalsWithPlan = world.targets.some(t => t.perMonth > 0 && t.status !== 'reached');
  for (const s of visible) {
    // Driver arithmetic: a part explains its whole.
    if (s.parent && bySig.has(s.parent) && (s.domain === 'spending' || s.domain === 'merchant')) edges.push({ from: sig(s), to: sig(bySig.get(s.parent)!), kind: 'explains', basis: 'direct', amount: s.delta, note: 'bagian dari kenaikan/penurunan induknya (pohon penyebab)' });
    if (s.type === 'budget_over' || s.type === 'budget_heading_over') {
      const parent = s.parent && bySig.get(s.parent);
      if (parent) edges.push({ from: sig(parent), to: sig(s), kind: 'increases', basis: 'direct', amount: parent.delta, note: 'pengeluaran kategori ini dihitung ke anggarannya' });
    }
    const isRoot = !s.parent || !bySig.has(s.parent);
    if ((s.domain === 'spending' || s.domain === 'merchant') && isRoot && s.delta && s.type !== 'advisor_card') {
      const up = s.delta > 0;
      edges.push({ from: sig(s), to: state(STATE.available, 'Uang tersedia', world.liquidity.available), kind: up ? 'reduces' : 'increases', basis: 'direct', amount: Math.abs(s.delta), note: up ? 'uang yang sudah dibelanjakan keluar dari dompet' : 'lebih sedikit uang keluar dibanding biasanya' });
      edges.push({ from: sig(s), to: state(STATE.surplus, 'Sisa siklus', undefined), kind: up ? 'reduces' : 'increases', basis: 'direct', amount: Math.abs(s.delta), note: 'pengeluaran langsung mengurangi sisa siklus' });
      if (up && goalsWithPlan) edges.push({ from: STATE.surplus, to: state(STATE.goals, 'Ruang untuk target dana'), kind: 'estimated_to_affect', basis: 'estimated', amount: Math.abs(s.impact), note: 'bila pola ini berlanjut sampai gajian (perkiraan)' });
    }
    if (s.signature === 'claims:outstanding' || s.signature === 'receivable:outstanding') edges.push({ from: sig(s), to: state(STATE.available, 'Uang tersedia', world.liquidity.available), kind: 'reduces', basis: 'direct', amount: s.current, note: 'uang ini sudah keluar dan belum kembali, jadi tidak ada di dompet' });
    if (s.signature === 'debt:trajectory' && s.delta) edges.push({ from: sig(s), to: state(STATE.netWorth, 'Aset bersih'), kind: s.delta < 0 ? 'increases' : 'reduces', basis: 'direct', amount: Math.abs(s.delta), note: 'utang berkurang/bertambah langsung mengubah aset bersih' });
    if (s.signature === 'income:last-cycle' && s.delta) edges.push({ from: sig(s), to: state(STATE.surplus, 'Sisa siklus'), kind: s.delta > 0 ? 'increases' : 'reduces', basis: 'direct', amount: Math.abs(s.delta), note: 'pemasukan langsung mengubah sisa siklus' });
    if (s.domain === 'recurring' && s.delta && s.type !== 'recurring_planned_change') edges.push({ from: sig(s), to: state(STATE.surplus, 'Sisa siklus'), kind: s.delta > 0 ? 'reduces' : 'increases', basis: 'direct', amount: Math.abs(s.delta), note: 'tagihan rutin dibayar tiap siklus' });
    if (s.signature === 'goals:pressure') edges.push({ from: state(STATE.surplus, 'Sisa siklus'), to: sig(s), kind: 'funds', basis: 'direct', amount: s.baseline, note: 'target dana diisi dari sisa siklus' });
  }
  // Habits rising in the same cycle as a category: shown together, never as cause.
  const habits = visible.filter(s => /^advisor:(weekend|night|payday)$/.test(s.signature));
  const roots = stories.filter(st => st.root.domain === 'spending' && (st.root.delta || 0) > 0 && !HIDDEN.has(st.state)).map(st => st.root);
  for (const h of habits) for (const r of roots.slice(0, 2)) edges.push({ from: sig(h), to: sig(r), kind: 'associated_with', basis: 'associated', note: 'terjadi bersamaan; tidak berarti yang satu menyebabkan yang lain' });
  return { nodes: [...nodes.values()], edges };
}
const HIDDEN = new Set(['DISMISSED', 'SNOOZED']);

/** The chain downstream of a story's root, for "Dampaknya": root → … → states, direct first. */
export function chainFrom(graph: ImpactGraph, signature: string, depth = 3) {
  const out: GraphEdge[] = [];
  const seen = new Set<string>([signature]);
  let frontier = [signature];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const from of frontier) for (const e of graph.edges.filter(x => x.from === from && x.kind !== 'explains')) { out.push(e); if (!seen.has(e.to)) { seen.add(e.to); next.push(e.to); } }
    frontier = next;
  }
  return out.sort((a, b) => (a.basis === 'direct' ? 0 : a.basis === 'estimated' ? 1 : 2) - (b.basis === 'direct' ? 0 : b.basis === 'estimated' ? 1 : 2));
}
