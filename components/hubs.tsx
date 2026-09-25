'use client';
import { BookOpenText, CalendarClock, HandCoins, type LucideIcon } from 'lucide-react';

/** Related pages grouped under one menu entry and switched with tabs. Page keys stay the same for links. */
export type Hub = { key: string; label: string; icon: LucideIcon; tabs: [string, string][] };
export const hubs: Hub[] = [
  { key: 'owed', label: 'Utang & Piutang', icon: HandCoins, tabs: [['debts', 'Utang'], ['receivables', 'Piutang'], ['claims', 'Klaim kantor']] },
  { key: 'schedule', label: 'Jadwal', icon: CalendarClock, tabs: [['upcoming', 'Arus kas'], ['calendar', 'Kalender'], ['recurring', 'Rutin'], ['inbox', 'Konfirmasi']] },
  { key: 'reports', label: 'Laporan', icon: BookOpenText, tabs: [['report', 'Laporan'], ['analytics', 'Analisis'], ['forecast', 'Proyeksi'], ['cycles', 'Riwayat siklus']] },
];
/** Pages that live inside another menu entry without a tab of their own. */
const parents: Record<string, string> = { health: 'settings' };

export const hubOf = (view: string) => hubs.find(hub => hub.tabs.some(([key]) => key === view));
export const hubByKey = (key: string) => hubs.find(hub => hub.key === key);
/** The menu entry that should look active for a page. */
export const menuKeyOf = (view: string) => hubOf(view)?.key || parents[view] || view;

export function HubTabs({ view, onSelect }: { view: string; onSelect: (key: string) => void }) {
  const hub = hubOf(view);
  if (!hub) return null;
  return <div className="hub-tabs" role="tablist" aria-label={hub.label}>{hub.tabs.map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => onSelect(key)}>{label}</button>)}</div>;
}
