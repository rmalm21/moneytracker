'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BrainCircuit, Gauge, HandCoins, HeartPulse, Lightbulb, PinOff, RotateCcw, Sprout, UserRound, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';

/** Sections of the Insight page that can be reordered or hidden (the score card always stays on top). */
export const defaultSections: { key: string; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'profile', label: 'Profil Insight', hint: 'Profil risiko, target, prioritas', icon: UserRound },
  { key: 'health', label: 'Indikator kesehatan', hint: '6 indikator: menabung, dana darurat, cicilan…', icon: HeartPulse },
  { key: 'actions', label: 'Rencana aksi', hint: 'Langkah paling berdampak + yang kamu sematkan', icon: Lightbulb },
  { key: 'wealth', label: 'Uang menganggur & investasi', hint: 'Dana idle, urutan penyaluran, rencana investasi', icon: Sprout },
  { key: 'paycheck', label: 'Rencana gajian berikutnya', hint: 'Pembagian gaji per pos', icon: HandCoins },
  { key: 'charts', label: 'Grafik siklus & porsi', hint: 'Pola per siklus dan porsi kebutuhan/keinginan', icon: Gauge },
  { key: 'details', label: 'Rincian analisis', hint: 'Tab Penting, Investasi, Anggaran, dll.', icon: BrainCircuit },
];

/** Sheet to reorder and show/hide Insight sections. */
export function InsightLayoutSheet({ open, onOpenChange, order, hidden, pinnedCount, onSave, onClearPins }: { open: boolean; onOpenChange: (open: boolean) => void; order: string[]; hidden: string[]; pinnedCount: number; onSave: (order: string[], hidden: string[]) => void; onClearPins: () => void }) {
  const [list, setList] = useState(order), [off, setOff] = useState(hidden);
  useEffect(() => { if (open) { setList(order); setOff(hidden); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (index: number, by: number) => setList(current => { const next = [...current]; const [item] = next.splice(index, 1); next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item); return next; });
  const toggle = (key: string) => setOff(current => current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Atur tampilan Insight" className="insight-layout-dialog">
    <p className="ip-intro">Urutkan bagian dengan panah, dan matikan yang tidak perlu. Kartu saran bisa disematkan ke atas lewat ikon pin di tiap kartu.</p>
    <ol className="il-list">{list.map((key, index) => { const section = defaultSections.find(d => d.key === key)!; const shown = !off.includes(key); return <li key={key} className={shown ? '' : 'is-off'}>
      <span className="il-icon" aria-hidden="true"><section.icon size={17}/></span>
      <span className="il-text"><strong>{section.label}</strong><small>{section.hint}</small></span>
      <span className="il-moves"><button type="button" className="icon-btn" disabled={index === 0} aria-label={`Naikkan ${section.label}`} onClick={() => move(index, -1)}><ArrowUp size={16}/></button><button type="button" className="icon-btn" disabled={index === list.length - 1} aria-label={`Turunkan ${section.label}`} onClick={() => move(index, 1)}><ArrowDown size={16}/></button></span>
      <button type="button" role="switch" aria-checked={shown} aria-label={`Tampilkan ${section.label}`} className={`il-switch ${shown ? 'on' : ''}`} onClick={() => toggle(key)}><i/></button>
    </li>; })}</ol>
    <div className="il-extra">
      <button type="button" className="link-button" onClick={() => { setList(defaultSections.map(d => d.key)); setOff([]); }}><RotateCcw size={14}/> Kembalikan bawaan</button>
      {pinnedCount > 0 && <button type="button" className="link-button" onClick={onClearPins}><PinOff size={14}/> Lepas {pinnedCount} sematan</button>}
    </div>
    <div className="modal-actions"><Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Batal</Button><Button type="button" onClick={() => onSave(list, off)}>Simpan tampilan</Button></div>
  </DialogContent></Dialog>;
}
