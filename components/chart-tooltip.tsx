'use client';
import type { ReactNode } from 'react';
import { rupiah } from '@/lib/accounting';

type Item = { value?: number | string | null; name?: string; color?: string; stroke?: string; fill?: string; payload?: Record<string, unknown> };
type Props = { active?: boolean; payload?: Item[]; label?: ReactNode; formatter?: (value: unknown, name: unknown, item: Item, index: number, payload: Item[]) => unknown; labelFormatter?: (label: ReactNode, payload: Item[]) => ReactNode };

/** A plain colour, or the first colour of a gradient fill (`url(#id)`), so every series keeps its own dot colour. */
const solid = (value?: string) => {
  if (!value) return undefined;
  const id = value.match(/^url\(#(.+)\)$/)?.[1];
  if (!id) return value;
  if (typeof document === 'undefined') return undefined;
  return document.getElementById(id)?.querySelector('stop')?.getAttribute('stop-color') || undefined;
};

/** One tooltip look for every chart: a small card with a title, coloured dots and Rupiah values. Keeps each chart's own formatter. */
export function ChartTooltip({ active, payload, label, formatter, labelFormatter }: Props) {
  if (!active || !payload?.length) return null;
  const title = labelFormatter ? labelFormatter(label, payload) : label;
  const rows = payload.filter(item => item.value !== undefined && item.value !== null);
  if (!rows.length) return null;
  return <div className="chart-tip">
    {title ? <strong>{title}</strong> : null}
    <ul>{rows.map((item, index) => {
      const out = formatter ? formatter(item.value, item.name, item, index, payload) : [rupiah(Number(item.value)), item.name];
      const [value, name] = Array.isArray(out) ? out : [out, item.name];
      const dot = solid(item.color) || solid(item.stroke) || solid(item.fill) || solid(item.payload?.fill as string) || 'var(--accent)';
      return <li key={index}><i style={{ background: dot }}/>{name ? <span>{String(name)}</span> : null}<b>{String(value)}</b></li>;
    })}</ul>
  </div>;
}
