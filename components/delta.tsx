'use client';
import { rupiah } from '@/lib/accounting';
import { percentChange } from '@/lib/period';

/** Small "▲ 7% vs PP" line: change against the previous period. `good` says which direction is good news. */
export function Delta({ current, previous, good = 'up', basis = 'Periode lalu', compact = false, format = 'money' }: { current: number; previous: number; good?: 'up' | 'down' | 'none'; basis?: string; compact?: boolean; /** 10.7 How the previous value reads: a count ("11 transaksi") is not Rupiah. */ format?: 'money' | 'count' | 'percent' }) {
  const pct = percentChange(current, previous);
  if (pct === 0 && !current && !previous) return null;
  const up = current > previous, flat = pct === 0;
  const tone = flat || good === 'none' ? 'flat' : (up === (good === 'up')) ? 'good' : 'bad';
  const text = pct === null ? 'baru' : `${Math.abs(pct) > 999 ? '>999' : Math.abs(pct)}%`;
  const before = format === 'count' ? previous.toLocaleString('id-ID') : format === 'percent' ? `${previous}%` : rupiah(previous);
  return <span className={`delta is-${tone}`} title={`${basis}: ${before}`}>
    <i aria-hidden="true">{flat ? '=' : up ? '▲' : '▼'}</i>{flat ? '0%' : text}{!compact && <em> vs PP</em>}
    <span className="sr-only">{flat ? ' sama dengan' : up ? ' naik dibanding' : ' turun dibanding'} periode lalu ({before})</span>
  </span>;
}
