'use client';
/**
 * 8.8 Row actions on long lists (Perlu dikonfirmasi, the import list): a long press (or a right click) on a row opens
 * a small menu of what can be done with it, and rows can be ticked to act on many at once.
 */
import { useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Dialog, DialogContent } from './ui/dialog';

/** Long press (about half a second without moving) or right click calls `onLong`; the tap that ends a long press is swallowed. */
export function useLongPress(onLong: (id: string) => void) {
  const hold = useRef<{ x: number; y: number; t: number } | null>(null), swallow = useRef(0);
  return (id: string) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 || (e.target as HTMLElement).closest('input, textarea, select, [data-no-hold]')) return;
      const x = e.clientX, y = e.clientY;
      swallow.current = 0;
      hold.current = { x, y, t: window.setTimeout(() => { hold.current = null; swallow.current = Date.now(); navigator.vibrate?.(12); onLong(id); }, 480) };
    },
    onPointerMove: (e: PointerEvent) => { const h = hold.current; if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { window.clearTimeout(h.t); hold.current = null; } },
    onPointerUp: () => { if (hold.current) { window.clearTimeout(hold.current.t); hold.current = null; } },
    onPointerCancel: () => { if (hold.current) { window.clearTimeout(hold.current.t); hold.current = null; } },
    onContextMenu: (e: MouseEvent) => { if ((e.target as HTMLElement).closest('input, textarea, select')) return; e.preventDefault(); onLong(id); },
    // Only the tap that ends the long press itself is swallowed (it can land on the menu instead, so it is not waited for).
    onClickCapture: (e: MouseEvent) => { const at = swallow.current; swallow.current = 0; if (at && Date.now() - at < 900) { e.preventDefault(); e.stopPropagation(); } },
  });
}

export type RowAction = { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; hint?: string; onSelect: () => void };
/** The menu for one row: its name and amount on top, then its actions as big, easy-to-tap buttons. */
export function RowMenu({ open, onOpenChange, title, subtitle, actions, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; subtitle?: ReactNode; actions: RowAction[]; children?: ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={title} className="mobile-sheet row-menu">
    {subtitle && <p className="row-menu-sub">{subtitle}</p>}
    {children}
    <div className="row-menu-actions">{actions.map(a => <button key={a.label} type="button" className={`row-menu-btn ${a.danger ? 'is-danger' : ''}`} disabled={a.disabled} onClick={() => { onOpenChange(false); a.onSelect(); }}>
      {a.icon && <span className="row-menu-icon" aria-hidden="true">{a.icon}</span>}<span className="row-menu-text"><strong>{a.label}</strong>{a.hint && <small>{a.hint}</small>}</span>
    </button>)}</div>
  </DialogContent></Dialog>;
}

/** A tick box for one row, big enough to hit, that does not open the row. */
export function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className="row-check" data-no-hold onClick={e => e.stopPropagation()}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} /><span aria-hidden="true" /></label>;
}
