'use client';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type SummaryItem = { label: string; value: ReactNode; icon: LucideIcon; tone?: 'accent' | 'in' | 'out' | 'warn'; hint?: ReactNode; featured?: boolean };
/** Row of summary cards used at the top of every finance page: title and icon share a row, the value sits below. */
export function Summary({ items, className = '' }: { items: SummaryItem[]; className?: string }) {
  return <div className={`summary-grid ${className}`}>{items.map(({ label, value, icon: Icon, tone = 'accent', hint, featured }) => <div key={label} className={`stat-card summary-card ${featured ? 'featured' : ''}`}>
    <span className="stat-head"><span className="stat-label">{label}</span><span className={`metric-icon is-${tone}`} aria-hidden="true"><Icon size={17}/></span></span>
    <strong className="stat-value">{value}</strong>
    {hint && <small>{hint}</small>}
  </div>)}</div>;
}
