/**
 * Insight V2.5 — one story per root cause.
 *
 * Signals point at the signal they help explain (merchant → subcategory → category; a budget → its category).
 * "Makan & Minum naik", "Pesan Antar naik", "GrabFood naik" and "Anggaran Makan hampir habis" become one story whose
 * root is the highest one present; the others are its "why". The story's money impact is the root's only, so the
 * same rupiah is never counted twice.
 */
import type { InsightSignal, Story } from './types.ts';

export function buildStories(signals: InsightSignal[]): Story[] {
  const bySig = new Map(signals.map(s => [s.signature, s]));
  const rootOf = (s: InsightSignal) => { let cur = s; const seen = new Set<string>(); while (cur.parent && bySig.has(cur.parent) && !seen.has(cur.parent)) { seen.add(cur.signature); cur = bySig.get(cur.parent)!; } return cur; };
  const groups = new Map<string, InsightSignal[]>();
  for (const s of signals) { const r = rootOf(s).signature; groups.set(r, [...(groups.get(r) || []), s]); }
  const depth = (s: InsightSignal) => { let d = 0, cur = s; while (cur.parent && bySig.has(cur.parent) && d < 6) { d++; cur = bySig.get(cur.parent)!; } return d; };
  return [...groups.entries()].map(([sig, list]) => {
    const root = bySig.get(sig)!, members = list.filter(s => s !== root).sort((a, b) => depth(a) - depth(b) || Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
    const why = [...root.evidence.filter(e => e.label === 'Penyebab utama').map(e => `${e.value} (${e.note})`), ...members.map(m => m.headline || m.title)];
    return {
      id: `story:${sig}`, signature: sig, root, members, title: root.title, what: root.summary, why,
      evidence: root.evidence, impact: root.impact, action: root.action, tone: root.tone, state: root.lifecycleState, priority: 0, confidence: root.confidence, deepDive: root.deepDive,
    };
  });
}
