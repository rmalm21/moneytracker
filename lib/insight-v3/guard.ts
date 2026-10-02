/**
 * Insight V3 — recommendation conflicts and the self-auditing advisor.
 *
 * Conflicts: recommendations are checked against each other and the money situation before they are shown:
 *   - no "invest / move idle money" while the path to payday is tight (liquidity under watch or pressure);
 *   - no budget suggestion below the recurring bills already scheduled for that category;
 *   - no "invest" while expensive debt should go first (the Advisor's own debt-first card).
 * Self-audit: every story that would reach the top is asked: enough sample? stable baseline? healthy data? redundant?
 * root cause? material? already seen (fatigue)? actionable? in conflict? Weak ones step back. Silence is allowed.
 */
import { sum } from '../insight-v25/baseline.ts';
import type { InsightSignal, Story } from '../insight-v25/types.ts';
import type { Pressure } from './types.ts';
import type { FinancialWorld } from './world.ts';

export type Suppressed = { signature: string; reason: string };
const INVEST = /^advisor:(invest|invest-monthly|idle-operational|idle-savings|dormant)$/;

export function conflicts(signals: InsightSignal[], pressures: Pressure[], world: FinancialWorld): Suppressed[] {
  const out: Suppressed[] = [];
  const liquidity = pressures.find(p => p.domain === 'liquidity');
  const tight = liquidity && (liquidity.level === 'watch' || liquidity.level === 'pressure');
  const debtFirst = signals.some(s => s.signature === 'advisor:debt-first');
  for (const s of signals) {
    if (INVEST.test(s.signature) && tight) out.push({ signature: s.signature, reason: 'Ditahan: uang sampai gajian sedang tipis, jadi saran investasi/memindahkan uang menunggu.' });
    else if (/^advisor:invest/.test(s.signature) && debtFirst) out.push({ signature: s.signature, reason: 'Ditahan: utang berbunga tinggi didahulukan.' });
    const apply = s.action?.apply || s.finding?.apply;
    if (apply && apply.kind === 'set-budget') {
      const budget = world.obligations.upcoming;
      const catId = s.finding?.target?.focus?.match(/^category:([^@]+)/)?.[1];
      const recurring = catId ? -sum(budget.filter(e => e.id.startsWith('recurring:') && e.categoryId === catId && e.amount < 0).map(e => e.amount)) : 0;
      if (recurring > 0 && apply.amount < recurring) out.push({ signature: s.signature, reason: `Ditahan: anggaran ${apply.amount.toLocaleString('id-ID')} di bawah tagihan rutin yang sudah terjadwal (${recurring.toLocaleString('id-ID')}).` });
    }
  }
  return out;
}

export type AuditCheck = { key: string; label: string; ok: boolean };
export type Audit = { signature: string; checks: AuditCheck[]; pass: boolean };
export function auditStory(story: Story, all: Story[], suppressed: Set<string>): Audit {
  const s = story.root;
  const direct = s.confidence.reasons.includes('Dibaca langsung dari catatanmu');
  const checks: AuditCheck[] = [
    { key: 'sample', label: 'Data cukup', ok: direct || s.confidence.level !== 'low' },
    { key: 'baseline', label: 'Pembanding stabil', ok: direct || !s.confidence.reasons.includes('Nilainya biasa naik-turun cukup besar') || s.confidence.level === 'high' },
    { key: 'data', label: 'Data sehat', ok: !s.confidence.reasons.some(r => /belum memiliki kategori/.test(r)) || s.confidence.level !== 'low' },
    { key: 'redundant', label: 'Tidak dobel', ok: !all.some(o => o !== story && o.members.some(m => m.signature === s.signature)) },
    { key: 'root', label: 'Akar masalah', ok: !s.parent || !all.some(o => o.root.signature === s.parent) },
    { key: 'material', label: 'Cukup berarti', ok: s.material || s.tone === 'important' },
    { key: 'seen', label: 'Belum jenuh', ok: s.novelty > .2 || s.tone === 'important' || s.lifecycleState === 'WORSENING' },
    { key: 'actionable', label: 'Bisa ditindak', ok: s.actionable || s.tone === 'positive' || s.tone === 'neutral' },
    { key: 'conflict', label: 'Tidak bertentangan', ok: !suppressed.has(s.signature) },
  ];
  const critical = ['sample', 'redundant', 'material', 'conflict'];
  return { signature: story.signature, checks, pass: checks.filter(c => critical.includes(c.key)).every(c => c.ok) };
}
