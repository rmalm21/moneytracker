/**
 * Insight V2.5 — bridge to the current Advisor (lib/advisor.ts), which stays the source of its cards.
 *
 * A V2.5 signal about the same subject reuses the Advisor card ("cut-food" ↔ "spending:category:food"): its apply
 * button, target and calculation stay as they were. Advisor action cards with no V2.5 counterpart (emergency fund,
 * idle money, saving rate, debt load…) become signals as they are, so nothing the Advisor ranked is lost.
 */
import type { Advice, Finding, Tone } from '../advisor.ts';
import { confidence } from './confidence.ts';
import type { DeepDive, Domain, InsightSignal, Status } from './types.ts';

const toneMap: Record<Tone, Status> = { bad: 'important', warn: 'watch', good: 'positive', info: 'neutral' };
const severityMap: Record<Tone, number> = { bad: .7, warn: .5, good: .25, info: .2 };

/** The V2.5 signatures an Advisor card may speak about. */
export function linkedSignatures(id: string): string[] {
  const m = /^(cut|leak|new|room)-(.+)$/.exec(id);
  if (m) return [`spending:category:${m[2]}`, `spending:subcategory:${m[2]}`];
  const b = /^(tight|shrink)-(.+)$/.exec(id); if (b) return [`budget:pressure:${b[2]}`];
  const o = /^odd-(.+)$/.exec(id); if (o) return [`behavior:unusual:${o[1]}`];
  if (id === 'receivable' || id === 'split-owed') return ['receivable:outstanding'];
  if (id === 'uncategorized') return ['data:uncategorized'];
  return [];
}
function placeOf(id: string): { domain: Domain; deepDive: DeepDive } {
  if (/^(emergency|fund-)/.test(id)) return { domain: 'goals', deepDive: 'goals' };
  if (/^(idle|invest|dormant|debt-first|emergency-yield)/.test(id)) return { domain: 'wealth', deepDive: 'wealth' };
  if (/^(saving-rate|runway|split)$/.test(id)) return { domain: 'cashflow', deepDive: 'cashflow' };
  if (/^(debt|split-payable)$/.test(id)) return { domain: 'debt', deepDive: 'duty' };
  if (/^(receivable|split-owed)$/.test(id)) return { domain: 'receivable', deepDive: 'duty' };
  if (/^(weekend|night|payday|odd-|repeat-|fixed)/.test(id)) return { domain: 'behavior', deepDive: 'habits' };
  if (/^(tight|shrink)-/.test(id)) return { domain: 'budget', deepDive: 'spending' };
  if (id === 'uncategorized') return { domain: 'data', deepDive: 'spending' };
  return { domain: 'spending', deepDive: 'spending' };
}
export function findingToSignal(f: Finding, advice: Pick<Advice, 'cyclesUsed' | 'enoughHistory'>, today: string): InsightSignal {
  const { domain, deepDive } = placeOf(f.id);
  const plain = f.detail.replace(/\*\*|==/g, '');
  return {
    id: `advisor:${f.id}`, signature: `advisor:${f.id}`, domain, type: 'advisor_card', title: f.title, summary: plain, headline: f.title,
    tone: toneMap[f.tone], severity: severityMap[f.tone] + (f.id === 'runway' && f.tone === 'bad' ? .2 : 0),
    confidence: confidence(/^(cut|leak|new|room|tight|shrink|saving-rate|split)/.test(f.id) ? { cycles: advice.cyclesUsed } : { direct: true }),
    novelty: 1, unit: 'money', evidence: f.stat ? [{ label: f.stat.label, value: f.stat.value, note: f.stat.note }] : [], drivers: [], lifecycleState: 'NEW',
    action: f.apply || f.target ? { label: f.apply ? 'Terapkan' : 'Lihat', target: f.target, apply: f.apply } : undefined,
    generatedAt: today, impact: f.saving || 0, urgency: f.id === 'runway' ? (f.tone === 'bad' ? .9 : .6) : f.tone === 'bad' ? .5 : .2,
    actionable: Boolean(f.apply || f.target || f.saving), material: f.tone === 'bad' || f.tone === 'warn', caveats: [], deepDive, finding: f,
    calc: f.calc, series: f.series && f.seriesLabels ? { labels: f.seriesLabels, values: f.series } : undefined,
  };
}

/** Attach Advisor cards to V2.5 signals; return Advisor action cards that had no counterpart, as signals. */
export function bridgeAdvisor(advice: Advice, signals: InsightSignal[], today: string) {
  const bySig = new Map(signals.map(s => [s.signature, s]));
  const all = [...advice.actions, ...advice.reduce, ...advice.loose, ...advice.budgetTips, ...advice.habits, ...advice.recurring, ...advice.obligations, ...advice.alerts, ...advice.wealth];
  const linked = new Set<string>();
  for (const f of all) {
    const target = linkedSignatures(f.id).map(sig => bySig.get(sig)).find(Boolean);
    if (!target) continue;
    linked.add(f.id);
    if (!target.finding || (f.apply && !target.finding.apply)) target.finding = f;
    if (f.apply) target.action = { label: target.action?.label || 'Lihat', target: target.action?.target || f.target, apply: f.apply };
    if (f.saving && target.tone !== 'positive') target.evidence = [...target.evidence, { label: 'Saran Insight', value: f.title, note: `hemat ±Rp${f.saving.toLocaleString('id-ID')}/bln` }];
  }
  const seen = new Set<string>();
  const adapted = advice.actions.filter(f => !linked.has(f.id) && !seen.has(f.id) && seen.add(f.id)).map(f => findingToSignal(f, advice, today));
  return { adapted, linked };
}
