/**
 * Insight V2.5 — health score movement and "Kenapa naik 6?".
 *
 * The score itself is the Advisor's (lib/advisor.ts: six parts, weights 25/20/15/15/15/10) and is not changed.
 * Its movement is measured only against a score Insight really showed before (a snapshot in memory): no past score
 * is ever rebuilt or guessed. The comparison point is the latest snapshot at least 7 days old, else the latest one
 * from an earlier day. The explanation splits the change by part exactly as the formula weighs them
 * (Δpart × weight ÷ total weight), rounded so the rows add up to the shown change.
 */
import type { Advice } from '../advisor.ts';
import { daysBetween } from './context.ts';
import { roundToTotal } from './drivers.ts';
import type { InsightMemory, ScoreSnapshot } from './lifecycle.ts';

export type ScoreDelta = { previous: ScoreSnapshot; delta: number; days: number; rows: { key: string; label: string; change: number; from: number; to: number }[] };

export function scoreDelta(advice: Pick<Advice, 'score' | 'parts'>, history: ScoreSnapshot[], today: string): ScoreDelta | null {
  const earlier = history.filter(h => h.d < today).sort((a, b) => a.d.localeCompare(b.d));
  const previous = [...earlier].reverse().find(h => daysBetween(h.d, today) >= 7) || earlier[earlier.length - 1];
  if (!previous) return null;
  const total = advice.parts.reduce((n, p) => n + p.weight, 0) || 1;
  const raw = advice.parts.map(p => (p.score - (previous.p[p.key] ?? p.score)) * p.weight / total);
  const delta = advice.score - previous.s;
  const rounded = roundToTotal(raw, delta);
  const rows = advice.parts.map((p, i) => ({ key: p.key, label: p.label, change: rounded[i], from: Math.round(previous.p[p.key] ?? p.score), to: Math.round(p.score) })).filter(r => r.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return { previous, delta, days: daysBetween(previous.d, today), rows };
}

/** Today's snapshot (replaces an earlier one from today). Keeps the last 14 days daily, then one per cycle. */
export function recordScore(memory: InsightMemory, advice: Pick<Advice, 'score' | 'parts'>, today: string, cycleStart: string): InsightMemory {
  const snap: ScoreSnapshot = { d: today, c: cycleStart, s: advice.score, p: Object.fromEntries(advice.parts.map(p => [p.key, Math.round(p.score * 10) / 10])) };
  const list = [...memory.h.filter(h => h.d !== today), snap].sort((a, b) => a.d.localeCompare(b.d));
  const kept = list.filter((h, i) => daysBetween(h.d, today) <= 14 || !list.slice(i + 1).some(o => o.c === h.c && daysBetween(o.d, today) > 14));
  const same = memory.h.find(h => h.d === today);
  if (same && JSON.stringify(same) === JSON.stringify(snap) && kept.length === memory.h.length) return memory;
  return { ...memory, h: kept.slice(-24) };
}
