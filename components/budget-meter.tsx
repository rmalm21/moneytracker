'use client';
import { useMemo, type CSSProperties } from 'react';
import { useApp } from './app-provider';
import { budgetCurrent, countedBudgets } from '@/lib/accounting';
import { budgetCommitted } from '@/lib/finance-control';
import { dateInTimeZone } from '@/lib/period';

/**
 * Colour of what is left, on one continuous scale: plenty left is green, thinning turns yellow, nearly gone or over is
 * red. Hue 0 (red) … 140 (green) for the remaining share (0–1).
 */
export function meterHue(remaining: number) {
  const r = Math.max(0, Math.min(1, remaining));
  if (r <= 0.1) return 0;
  if (r <= 0.4) return Math.round((r - 0.1) / 0.3 * 48);
  if (r <= 0.7) return Math.round(48 + (r - 0.4) / 0.3 * 92);
  return 140;
}

/** What is left of all active spending budgets this period (planned spending counted as used), or null with none. */
export function useBudgetRemaining() {
  const { data, profile } = useApp();
  const today = dateInTimeZone(new Date(), profile?.timeZone), salaryDay = profile?.salaryCycleStartDay || 24;
  return useMemo(() => {
    const spending = countedBudgets(data.budgets.filter(b => b.active && b.classification !== 'savings' && b.classification !== 'sinking'));
    if (!spending.length) return null;
    let limit = 0, used = 0;
    for (const b of spending) {
      const s = budgetCurrent(b, data.transactions, data.categories, today, salaryDay);
      limit += Math.max(0, s.available); used += s.spent + budgetCommitted(b, data, today, salaryDay);
    }
    if (limit <= 0) return null;
    return { remaining: (limit - used) / limit, over: used > limit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.budgets, data.transactions, data.categories, data.plannedTransactions, data.recurring, data.drafts, today.toDateString(), salaryDay]);
}

/** The badge on the Anggaran button in the menu: the share left, coloured green → yellow → red as a gradient. */
export function BudgetMeterBadge() {
  const m = useBudgetRemaining();
  if (!m) return null;
  const pct = Math.max(0, Math.round(m.remaining * 100)), h = meterHue(m.remaining);
  const label = m.over ? 'Lewat' : `${pct}%`;
  return <span className={`budget-meter${m.over ? ' is-over' : ''}`} style={{ '--meter-h': h, '--meter-ink': h > 26 && h < 96 ? '#3a2600' : '#fff' } as CSSProperties}
    title={m.over ? 'Anggaran bulan ini sudah terlampaui' : `Sisa anggaran ${pct}%`} aria-label={m.over ? 'Anggaran terlampaui' : `Sisa anggaran ${pct} persen`}>{label}</span>;
}
