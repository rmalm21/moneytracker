'use client';
import type { ReactNode, MouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared pieces of the glass pages: Utang, Piutang, Klaim kantor and Tujuan dana. */
export type GlassTone = 'debt' | 'receivable' | 'claim' | 'fund';

/** Gradient glass summary at the top of a page: one big number, a progress line and a few frosted stats. */
export function GlassHero({ tone, icon: Icon, label, value, detail, progress, progressLabel, stats }: { tone: GlassTone; icon: LucideIcon; label: string; value: string; detail?: ReactNode; progress?: number; progressLabel?: string; stats?: [string, string][] }) {
  const pct = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
  return <section className={`gl-hero tone-${tone}`} aria-label={label}>
    <div className="gl-hero-head"><span className="gl-hero-icon" aria-hidden="true"><Icon size={19}/></span><span>{label}</span></div>
    <strong className="gl-hero-value">{value}</strong>
    {detail && <p className="gl-hero-detail">{detail}</p>}
    {pct !== undefined && <div className="gl-hero-progress"><div className="gl-hero-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={progressLabel || label}><i style={{ width: `${pct}%` }}/></div>{progressLabel && <small>{progressLabel}</small>}</div>}
    {stats && stats.length > 0 && <div className="gl-hero-stats">{stats.map(([name, amount]) => <div key={name}><span>{name}</span><b>{amount}</b></div>)}</div>}
  </section>;
}

/** Circular progress for a savings goal. */
export function GlassRing({ value }: { value: number }) {
  const r = 30, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, value));
  return <span className="gl-ring-wrap" role="img" aria-label={`${Math.round(pct)}% tercapai`}>
    <svg className="gl-ring" viewBox="0 0 72 72" aria-hidden="true"><circle className="gl-ring-track" cx="36" cy="36" r={r}/><circle className="gl-ring-fill" cx="36" cy="36" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}/></svg>
    <b>{Math.round(pct)}%</b>
  </span>;
}

/** "hari ini", "besok", "5 hari lagi", "lewat 3 hari" for a due date. */
export function dueText(date: string, today: string) {
  const days = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 864e5);
  return { days, text: days === 0 ? 'hari ini' : days === 1 ? 'besok' : days > 1 ? `${days} hari lagi` : `lewat ${-days} hari` };
}

/** Closes the "Lainnya" menu an item was picked from. */
export const closeMenu = (event: MouseEvent<HTMLElement>) => { const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; };
