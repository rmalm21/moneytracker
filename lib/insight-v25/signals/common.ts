/** Insight V2.5 — small shared helpers for signal modules (wording, numbers, defaults). */
import { confidence } from '../confidence.ts';
import type { InsightSignal } from '../types.ts';

export const rp = (value: number) => `${value < 0 ? '-' : ''}Rp${Math.round(Math.abs(value) >= 10_000 ? Math.round(Math.abs(value) / 1000) * 1000 : Math.abs(value)).toLocaleString('id-ID')}`;
/** "Rp1,2 jt", "Rp870 rb" for tight places. */
export const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e9 ? `${sign}Rp${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : `${sign}Rp${Math.round(n)}`; };
export const pct = (value: number) => `${Math.round(value * 100)}%`;
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const plural = (count: number, word: string) => `${count} ${word}`;
export const dateText = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

/** A signal with safe defaults; modules fill what they know. */
export function signal(base: Pick<InsightSignal, 'signature' | 'domain' | 'type' | 'title' | 'summary' | 'tone' | 'deepDive'> & Partial<InsightSignal>, today: string): InsightSignal {
  return {
    id: base.signature, severity: .3, confidence: confidence({ direct: true }), novelty: 1, unit: 'money', evidence: [], drivers: [], lifecycleState: 'NEW',
    generatedAt: today, impact: 0, urgency: 0, actionable: false, material: false, caveats: [], ...base,
  };
}
