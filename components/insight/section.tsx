'use client';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, CircleHelp, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';

/**
 * Insight building blocks: a collapsible section with a clear header, small help sheets, an overflow menu for rare
 * actions, and a local error boundary so one module failing never takes the whole Insight page down.
 */

/** Which sections the user minimized (per device, per user). */
export function useCollapsed(uid?: string) {
  const key = uid ? `dompet-ajaib:insight-collapsed:${uid}` : '';
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => { if (!key) return; try { setState(JSON.parse(localStorage.getItem(key) || '{}')); } catch { /* per-device */ } }, [key]);
  const isOpen = useCallback((id: string, fallback = true) => state[id] ?? fallback, [state]);
  const toggle = useCallback((id: string, fallback = true) => setState(cur => { const next = { ...cur, [id]: !(cur[id] ?? fallback) }; try { if (key) localStorage.setItem(key, JSON.stringify(next)); } catch { /* per-device */ } return next; }), [key]);
  return { isOpen, toggle };
}

export function InsightSection({ id, title, subtitle, icon: Icon, open, onToggle, right, children, quiet }: { id: string; title: string; subtitle?: string; icon?: LucideIcon; open: boolean; onToggle: () => void; right?: ReactNode; children: ReactNode; quiet?: boolean }) {
  const bodyId = `ix-body-${id}`;
  return <section className={`ix-section ${open ? 'is-open' : 'is-closed'} ${quiet ? 'is-quiet' : ''}`} aria-labelledby={`ix-h-${id}`}>
    <header className="ix-section-head">
      <button type="button" className="ix-section-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        {Icon && <span className="ix-section-icon" aria-hidden="true"><Icon size={16}/></span>}
        <span className="ix-section-text"><h2 id={`ix-h-${id}`}>{title}</h2>{subtitle && <small>{subtitle}</small>}</span>
        <ChevronDown size={18} className="ix-chevron" aria-hidden="true"/>
        <span className="sr-only">{open ? 'Ciutkan' : 'Buka'}</span>
      </button>
      {right && <span className="ix-section-right">{right}</span>}
    </header>
    {open && <div className="ix-section-body" id={bodyId}>{children}</div>}
  </section>;
}

/** "?" that opens one short explanation. */
export function HelpButton({ title, text, label }: { title: string; text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="ix-help" aria-label={`Apa itu ${label || title}?`} onClick={e => { e.stopPropagation(); setOpen(true); }}><CircleHelp size={15}/></button>
    {open && <Dialog open onOpenChange={setOpen}><DialogContent title={title} className="ix-help-sheet"><p>{text}</p></DialogContent></Dialog>}
  </>;
}

/** Rare actions (pin, hide, remind later) behind "⋯", never next to the main action. */
export function OverflowMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!items.length) return null;
  return <div className="ix-menu" ref={ref}>
    <button type="button" className="ix-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Pilihan lain untuk ${label}`} onClick={() => setOpen(v => !v)}><MoreHorizontal size={18}/></button>
    {open && <ul role="menu" className="ix-menu-list">{items.map(i => <li key={i.label} role="none"><button type="button" role="menuitem" onClick={() => { setOpen(false); i.onSelect(); }}>{i.label}</button></li>)}</ul>}
  </div>;
}

/** A module that fails shows a small note; the rest of Insight keeps working. */
export class ModuleBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn(`Insight: ${this.props.name} gagal dimuat`, error); }
  render() { return this.state.failed ? <p className="ix-module-error" role="status">{this.props.name} belum bisa ditampilkan. Bagian lain Insight tetap bisa dipakai.</p> : this.props.children; }
}

/** Long lists show the first few; the rest is one tap away. */
export function Capped({ children, limit = 2, className, label = 'saran' }: { children: ReactNode[]; limit?: number; className?: string; label?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? children : children.slice(0, limit);
  return <>
    <div className={className}>{shown}</div>
    {children.length > limit && <button type="button" className="ix-more" aria-expanded={all} onClick={() => setAll(v => !v)}>{all ? 'Ringkas' : `Lihat ${children.length - limit} ${label} lainnya`}</button>}
  </>;
}
