'use client';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { rupiah } from '@/lib/accounting';

/** Small expense trend line for the Beranda widget (loaded on demand with the chart library). */
export default function TrendMiniChart({ data }: { data: { label: string; expense: number }[] }) {
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }}/><Tooltip formatter={v => rupiah(Number(v))}/><Line dataKey="expense" name="Pengeluaran" stroke="var(--accent)" strokeWidth={3}/></LineChart></ResponsiveContainer>;
}
