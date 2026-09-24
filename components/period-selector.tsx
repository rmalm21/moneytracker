'use client';
import { useEffect, useState } from 'react';
import { useApp } from './app-provider';
import { Field, Input, Select } from './fields';
import { subscribePeriodTransactions } from '@/lib/firestore';
import { dateInTimeZone, nextDate, periodLabel, periodOptions, previousDate, resolvePeriodRange, type DateRange, type PeriodPreset } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

export function PeriodSelector({ value, onChange, custom, onCustomChange, label = 'Periode analisis' }: { value: PeriodPreset; onChange: (value: PeriodPreset) => void; custom?: DateRange; onCustomChange?: (value: DateRange) => void; label?: string }) {
  const { profile } = useApp();
  const range = resolvePeriodRange(value, profile?.salaryCycleStartDay || 24, dateInTimeZone(new Date(),profile?.timeZone), custom);
  function change(next: PeriodPreset) { if (next === 'custom' && !custom && onCustomChange) onCustomChange(resolvePeriodRange('last_30_days', profile?.salaryCycleStartDay || 24, dateInTimeZone(new Date(),profile?.timeZone))); onChange(next); }
  return <div className="period-control"><Field label={label}><Select value={value} onChange={event => change(event.target.value as PeriodPreset)}>{periodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field><small>{periodLabel(range)}</small>{value === 'custom' && onCustomChange && <div className="period-dates"><Field label="Dari"><Input type="date" required value={custom?.start || range.start} onChange={event => {const start=event.target.value;onCustomChange({ start, end: (custom?.end || range.end) <= start ? nextDate(start) : custom?.end || range.end });}}/></Field><Field label="Sampai"><Input type="date" required value={previousDate(custom?.end || range.end)} onChange={event => {const end=nextDate(event.target.value);onCustomChange({ start: (custom?.start || range.start) >= end ? event.target.value : custom?.start || range.start, end });}}/></Field></div>}</div>;
}

export function usePeriodTransactions(range: DateRange) {
  const { user } = useApp();
  const key = `${user?.uid || ''}:${range.start}:${range.end}`;
  const [state, setState] = useState<{ key: string; items: LedgerTx[]; error: string }>({ key: '', items: [], error: '' });
  useEffect(() => {
    if (!user || !range.start || !range.end || range.start >= range.end) return;
    const requested = `${user.uid}:${range.start}:${range.end}`;
    return subscribePeriodTransactions(user.uid, range.start, range.end, items => setState({ key: requested, items, error: '' }), error => setState({ key: requested, items: [], error: error.message || 'Riwayat belum bisa dimuat.' }));
  }, [user?.uid, range.start, range.end]);
  return { items: state.key === key ? state.items : [], loading: Boolean(user) && state.key !== key, error: state.key === key ? state.error : '' };
}
