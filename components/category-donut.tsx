'use client';
import { useMemo, useState } from 'react';
import { Emoji, EmojiText, emojiAvatar } from './emoji';
import { ArrowRight } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Delta } from './delta';
import { emojiOrFallback } from './visual-identity';
import { rupiah } from '@/lib/accounting';
import type { CategorySlice } from '@/lib/category-analytics';

type Row = CategorySlice & { pct: number; fill: string };
const RAD = Math.PI / 180;
const MIN_LABEL = .05;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Spending by category: donut with labelled slices, a total in the middle, and a clickable legend with the change vs the previous period. */
export function CategoryDonut({ slices, previous, previousReady, navigate, basis, rangeFocus = '' }: { slices: CategorySlice[]; previous: CategorySlice[]; previousReady: boolean; navigate: (view: string, focus?: string) => void; basis: string; rangeFocus?: string }) {
  const [selected, setSelected] = useState<string | null>(null), [touched, setTouched] = useState(false);
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const rows = useMemo<Row[]>(() => {
    const top = slices.slice(0, 6), rest = slices.slice(6);
    const list: CategorySlice[] = rest.length ? [...top, { id: 'other', name: 'Lainnya', amount: rest.reduce((n, s) => n + s.amount, 0), count: rest.reduce((n, s) => n + s.count, 0), icon: '📦', subcategories: rest.map(s => ({ id: s.id, name: s.name, amount: s.amount, icon: s.icon })) }] : top;
    return list.map((slice, index) => ({ ...slice, pct: total ? slice.amount / total : 0, fill: slice.id === 'other' ? 'var(--line-strong)' : slice.color || `var(--chart-${index % 6 + 1})` }));
  }, [slices, total]);
  const previousOf = (row: Row) => row.id === 'other' ? previous.filter(p => !rows.some(r => r.id === p.id)).reduce((n, p) => n + p.amount, 0) : previous.find(p => p.id === row.id)?.amount || 0;
  const active = rows.find(row => row.id === selected);
  const toggle = (id: string) => { setTouched(true); setSelected(current => current === id ? null : id); };

  type SliceProps = { cx?: number; cy?: number; midAngle?: number; outerRadius?: number; index?: number; points?: { x: number; y: number }[] };
  /** Where a slice label goes, or null when there is no room beside the ring (the centre and legend still show it). */
  const place = (props: SliceProps) => {
    const row = rows[props.index ?? 0];
    if (!row || rows.length < 2 || row.pct < MIN_LABEL) return null;
    const cx = props.cx ?? 0, outer = props.outerRadius ?? 0, angle = -(props.midAngle ?? 0) * RAD, cos = Math.cos(angle), right = cos >= 0, edge = 6, charWidth = 6.4;
    const x0 = cx + (outer + 22) * cos, y = (props.cy ?? 0) + (outer + 22) * Math.sin(angle);
    const vertical = Math.abs(Math.sin(angle)) > .8;
    // Room between the card edge and the ring (or the whole side when the label sits above/below the ring).
    const room = vertical ? (right ? cx * 2 - edge - x0 : x0 - edge) : (right ? cx * 2 - edge - (cx + outer * Math.abs(cos) + 4) : (cx - outer * Math.abs(cos) - 4) - edge);
    const fit = Math.floor(room / charWidth);
    if (fit < 4) return null;
    const full = row.name, name = full.length <= Math.min(fit, 13) ? full : `${full.slice(0, Math.min(fit, 13) - 1)}…`;
    const width = Math.max(name.length, 4) * charWidth;
    const x = right ? Math.min(Math.max(x0, vertical ? x0 : cx + outer * Math.abs(cos) + 4), cx * 2 - edge - width) : Math.max(Math.min(x0, vertical ? x0 : cx - outer * Math.abs(cos) - 4), edge + width);
    return { row, x, y, right, name };
  };
  const label = (props: SliceProps) => {
    const spot = place(props);
    if (!spot) return null;
    const faded = selected && selected !== spot.row.id;
    return <g opacity={faded ? .35 : 1}><text x={spot.x} y={spot.y - 3} textAnchor={spot.right ? 'start' : 'end'} className="donut-label-name">{spot.name}</text><text x={spot.x} y={spot.y + 11} textAnchor={spot.right ? 'start' : 'end'} className="donut-label-pct">{percent(spot.row.pct)}</text></g>;
  };
  const line = (props: SliceProps) => {
    const spot = place(props), points = props.points || [];
    if (!spot || points.length < 2) return <g/>;
    const [a, b] = points;
    return <path d={`M${a.x},${a.y}L${b.x},${b.y}`} stroke={spot.row.fill} strokeWidth={1.5} fill="none" opacity={selected && selected !== spot.row.id ? .35 : .9}/>;
  };

  return <div className="donut-layout">
    <div className="donut-chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 22, right: 58, bottom: 22, left: 58 }}>
          <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="60%" outerRadius="80%" paddingAngle={rows.length > 1 ? 2 : 0} cornerRadius={4} stroke="var(--paper)" strokeWidth={2} label={label} labelLine={line} isAnimationActive={!touched} animationDuration={500} onClick={(_, index) => toggle(rows[index].id)}>
            {rows.map(row => <Cell key={row.id} fill={row.fill} opacity={selected && selected !== row.id ? .3 : 1} style={{ cursor: 'pointer', outline: 'none' }}/>)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center" aria-live="polite">
        {active ? <><span className="donut-center-icon" aria-hidden="true"><Emoji e={emojiOrFallback(active.icon)}/></span><small>{active.name}</small><strong>{rupiah(active.amount)}</strong><em>{percent(active.pct)} dari total</em></> : <><small>Total pengeluaran</small><strong>{rupiah(total)}</strong><em>{slices.length} kategori</em></>}
      </div>
    </div>
    <div className="donut-legend">
      {rows.map(row => <div key={row.id} className={`donut-row ${selected === row.id ? 'is-selected' : ''} ${selected && selected !== row.id ? 'is-faded' : ''}`}>
        <button type="button" className="donut-row-main" aria-expanded={selected === row.id} onClick={() => toggle(row.id)}>
          <span className="donut-dot" style={{ background: row.fill }}/>
          <span className="donut-name"><span aria-hidden="true"><Emoji e={emojiOrFallback(row.icon)}/></span> {row.name}</span>
          <span className="donut-amount"><strong>{rupiah(row.amount)}</strong><small>{percent(row.pct)}{previousReady && <> · <Delta current={row.amount} previous={previousOf(row)} good="down" basis={basis} compact/></>}</small></span>
          <span className="donut-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, row.pct * 100)}%`, background: row.fill }}/></span>
        </button>
        {selected === row.id && <div className="donut-detail">
          {row.subcategories.length > 0 ? row.subcategories.slice(0, 6).map(sub => <div key={sub.id} className="budget-line"><span><Emoji e={emojiOrFallback(sub.icon, '•')}/> {sub.name}</span><span><strong>{rupiah(sub.amount)}</strong> <small className="muted">{row.amount ? percent(sub.amount / row.amount) : ''}</small></span></div>) : <small className="muted">{row.count} transaksi, tanpa subkategori.</small>}
          <div className="donut-detail-foot"><small className="muted">{previousReady ? `Periode lalu ${rupiah(previousOf(row))}` : ''}</small>{row.id !== 'other' && <button type="button" className="link-button" onClick={() => navigate('transactions', `category:${row.id}${rangeFocus}`)}>Lihat transaksi <ArrowRight size={14}/></button>}</div>
        </div>}
      </div>)}
    </div>
  </div>;
}
