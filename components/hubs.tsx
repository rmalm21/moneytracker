'use client';
import { useEffect, useRef } from 'react';
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
  const bar = useRef<HTMLDivElement>(null);
  // Keep the active tab visible (e.g. after swiping to it). Only the tab strip scrolls sideways; the page stays where it is.
  useEffect(() => {
    const strip = bar.current, tab = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
    const outer = strip.getBoundingClientRect(), inner = tab.getBoundingClientRect();
    strip.scrollBy({ left: inner.left + inner.width / 2 - (outer.left + outer.width / 2), behavior: 'smooth' });
  }, [view]);
  if (!hub) return null;
  return <div className="hub-tabs" role="tablist" aria-label={hub.label} ref={bar}>{hub.tabs.map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => onSelect(key)}>{label}</button>)}</div>;
}
