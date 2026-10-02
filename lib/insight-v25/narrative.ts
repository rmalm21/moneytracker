/**
 * Insight V2.5 — words from signals, never beyond them.
 *
 * The Financial Brief is 2–4 sentences, each built from one signal's own numbers (its signature is kept beside the
 * sentence so the UI can open it). No sentence says anything a signal does not hold. Templates only, no AI.
 */
import type { ScoreDelta } from './health.ts';
import type { ResolvedItem } from './lifecycle.ts';
import { dateText } from './signals/common.ts';
import type { Story } from './types.ts';

export type BriefSentence = { text: string; signature: string };

export function heroStatement(score: number, delta: ScoreDelta | null, top: Story | undefined, learning: boolean) {
  if (top && top.tone === 'important') return top.root.headline || top.title;
  if (learning) return 'Insight masih mempelajari pola normalmu.';
  if (delta && delta.delta >= 3) return `Skormu naik ${delta.delta} poin sejak ${dateText(delta.previous.d)}.`;
  if (delta && delta.delta <= -3) return `Skormu turun ${-delta.delta} poin sejak ${dateText(delta.previous.d)}.`;
  return score >= 75 ? 'Keuanganmu berjalan sehat sesuai polanya.' : score >= 55 ? 'Cukup baik, ada beberapa hal yang bisa dirapikan.' : 'Ada beberapa hal yang perlu perhatian.';
}

export function financialBrief(input: { score: number; delta: ScoreDelta | null; changed: Story[]; priority: Story[]; progress: Story[]; resolved: ResolvedItem[]; learning: { active: boolean; cycles: number } }): BriefSentence[] {
  const out: BriefSentence[] = [];
  const { score, delta, changed, priority, progress, resolved, learning } = input;
  const end = (text: string) => /[.!?]$/.test(text) ? text : `${text}.`;
  out.push({ signature: 'health:score', text: delta && delta.delta !== 0 ? `Skor kesehatan keuanganmu ${score}, ${delta.delta > 0 ? 'naik' : 'turun'} ${Math.abs(delta.delta)} poin dari ${dateText(delta.previous.d)}.` : `Skor kesehatan keuanganmu ${score} dari 100.` });
  if (learning.active) out.push({ signature: 'learning', text: `Insight masih mempelajari pola normalmu: baru ${learning.cycles} siklus lengkap, perbandingan muncul setelah 2 siklus.` });
  const change = changed.find(s => s.tone !== 'positive') || changed[0];
  if (change) out.push({ signature: change.signature, text: end(change.root.headline || change.title) });
  const first = priority.find(s => s !== change);
  if (first && out.length < 4) out.push({ signature: first.signature, text: end(`Perlu diperhatikan: ${first.root.headline || first.title}`) });
  const good = progress.find(s => s !== change);
  if (out.length < 4 && good) out.push({ signature: good.signature, text: end(`Kabar baik: ${good.root.headline || good.title}`) });
  else if (out.length < 4 && resolved[0]) out.push({ signature: resolved[0].signature, text: `Sudah teratasi: ${resolved[0].title}.` });
  return out.slice(0, 4);
}
