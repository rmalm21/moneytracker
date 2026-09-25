'use client';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { rupiah } from '@/lib/accounting';
import { ChartTooltip } from './chart-tooltip';

/** Small expense trend for the Beranda widget (loaded on demand with the chart library). */
export default function TrendMiniChart({ data }: { data: { label: string; expense: number }[] }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
    <defs><linearGradient id="trend-mini" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.32}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12}/>
    <Tooltip formatter={v => [rupiah(Number(v)), 'Pengeluaran']} content={<ChartTooltip/>} cursor={{ stroke: 'var(--accent)', strokeOpacity: .25 }}/>
    <Area type="monotone" dataKey="expense" name="Pengeluaran" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" fill="url(#trend-mini)" dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: 'var(--paper)', fill: 'var(--accent)' }} animationDuration={700}/>
  </AreaChart></ResponsiveContainer>;
}
