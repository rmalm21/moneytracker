'use client';
import { useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { Dialog, DialogContent } from './dialog';
import { AppSelect } from './app-select';
import { Button } from './button';
import { useApp } from '../app-provider';
import { dateInTimeZone, timeInTimeZone } from '@/lib/period';

type Props = InputHTMLAttributes<HTMLInputElement>;
const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, month, 1)));
const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateValue = (value: string, fallback = new Date()) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : fallback;
function emit(onChange: Props['onChange'], next: string) { onChange?.({ target: { value: next } } as ChangeEvent<HTMLInputElement>); }

export function AppDatePicker({ value, onChange, required, disabled, min, max, placeholder, className = '', ...rest }: Props) {
  const { profile } = useApp();
  const today = dateInTimeZone(new Date(), profile?.timeZone);
  const current = String(value ?? '');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const [display, setDisplay] = useState(() => dateValue(current, today));
  const [invalid, setInvalid] = useState(false);
  function show() { setDraft(current); setDisplay(dateValue(current, today)); setOpen(true); }
  function monthBy(offset: number) { setDisplay(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1)); }
  function select(next: string) { setDraft(next); setDisplay(dateValue(next, today)); }
  function confirm() { emit(onChange, draft); setInvalid(false); setOpen(false); }
  const first = new Date(display.getFullYear(), display.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index - lead + 1));
  const pretty = current ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateValue(current, today)) : placeholder || 'Pilih tanggal';
  return <span className="datetime-control"><button type="button" disabled={disabled} className={`input datetime-trigger ${invalid ? 'is-invalid' : ''} ${className}`} onClick={show}><span className={!current ? 'muted' : ''}>{pretty}</span><CalendarDays size={17} aria-hidden="true"/></button><input {...rest} type="text" value={current} readOnly required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" className="app-select-validation" onInvalid={event => { event.preventDefault(); setInvalid(true); (event.currentTarget.previousElementSibling as HTMLButtonElement)?.focus(); }}/>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Pilih tanggal" className="mobile-sheet date-time-dialog"><div className="calendar-toolbar"><button type="button" className="icon-btn" aria-label="Bulan sebelumnya" onClick={() => monthBy(-1)}><ChevronLeft size={20}/></button><AppSelect value={String(display.getMonth())} onChange={event => setDisplay(prev => new Date(prev.getFullYear(), Number(event.target.value), 1))}>{months.map((label, month) => <option value={month} key={label}>{label}</option>)}</AppSelect><AppSelect value={String(display.getFullYear())} onChange={event => setDisplay(prev => new Date(Number(event.target.value), prev.getMonth(), 1))}>{Array.from({ length: 81 }, (_, index) => display.getFullYear() - 40 + index).map(year => <option key={year} value={year}>{year}</option>)}</AppSelect><button type="button" className="icon-btn" aria-label="Bulan berikutnya" onClick={() => monthBy(1)}><ChevronRight size={20}/></button></div>
      <div className="calendar-grid">{dayNames.map(name => <strong key={name}>{name}</strong>)}{cells.map(day => { const key = iso(day); const out = day.getMonth() !== display.getMonth(); return <button key={key} type="button" className={`${out ? 'outside' : ''} ${key === draft ? 'selected' : ''} ${key === iso(today) ? 'today' : ''}`} aria-label={new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(day)} aria-pressed={key === draft} disabled={Boolean(min && key < String(min) || max && key > String(max))} onClick={() => select(key)}>{day.getDate()}</button>; })}</div>
      <div className="calendar-shortcuts"><button className="link-button" type="button" onClick={() => select(iso(today))}>Hari ini</button><button className="link-button" type="button" onClick={() => { const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1); select(iso(yesterday)); }}>Kemarin</button>{!required && <button className="link-button" type="button" onClick={() => setDraft('')}>Hapus tanggal</button>}</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button type="button" onClick={confirm} disabled={required && !draft}>Pilih tanggal</Button></div></DialogContent></Dialog>
  </span>;
}

export function AppTimePicker({ value, onChange, required, disabled, placeholder, className = '', ...rest }: Props) {
  const { profile } = useApp();
  const current = String(value ?? '');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current || '12:00');
  const [invalid, setInvalid] = useState(false);
  function now() { setDraft(timeInTimeZone(profile?.timeZone)); }
  function confirm() { emit(onChange, draft); setInvalid(false); setOpen(false); }
  return <span className="datetime-control"><button type="button" disabled={disabled} className={`input datetime-trigger ${invalid ? 'is-invalid' : ''} ${className}`} onClick={() => { setDraft(current || '12:00'); setOpen(true); }}><span className={!current ? 'muted' : ''}>{current || placeholder || 'Pilih waktu'}</span><Clock3 size={17} aria-hidden="true"/></button><input {...rest} type="text" value={current} readOnly required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" className="app-select-validation" onInvalid={event => { event.preventDefault(); setInvalid(true); (event.currentTarget.previousElementSibling as HTMLButtonElement)?.focus(); }}/>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Pilih waktu" className="mobile-sheet date-time-dialog"><div className="time-selectors"><div><label>Jam</label><AppSelect value={draft.slice(0, 2)} onChange={event => setDraft(`${event.target.value}:${draft.slice(3, 5)}`)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={String(hour).padStart(2, '0')}>{String(hour).padStart(2, '0')}</option>)}</AppSelect></div><span>:</span><div><label>Menit</label><AppSelect value={draft.slice(3, 5)} onChange={event => setDraft(`${draft.slice(0, 2)}:${event.target.value}`)}>{Array.from({ length: 60 }, (_, minute) => <option key={minute} value={String(minute).padStart(2, '0')}>{String(minute).padStart(2, '0')}</option>)}</AppSelect></div></div><div className="calendar-shortcuts"><button className="link-button" type="button" onClick={now}>Sekarang</button>{!required && <button className="link-button" type="button" onClick={() => { emit(onChange, ''); setOpen(false); }}>Hapus waktu</button>}</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button type="button" onClick={confirm}>Pilih waktu</Button></div></DialogContent></Dialog>
  </span>;
}
