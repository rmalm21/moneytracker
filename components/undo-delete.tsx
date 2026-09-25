'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNotify } from './notifications';

/**
 * Delete now, undo within a few seconds: the item disappears at once and a toast offers
 * "Batalkan". The real delete only runs when the toast expires (or the app is hidden),
 * so undoing never has to rebuild balances or linked records.
 */
const WAIT = 5000;
type Pending = { label: string; commit: () => Promise<unknown>; timer: ReturnType<typeof setTimeout> };
type Api = { hidden: ReadonlySet<string>; remove: (id: string, label: string, commit: () => Promise<unknown>) => void };
const UndoContext = createContext<Api>({ hidden: new Set(), remove: (_id, _label, commit) => { void commit(); } });

export function UndoDeleteProvider({ children }: { children: ReactNode }) {
  const { push, dismiss, track } = useNotify();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, Pending>());
  const show = useCallback((id: string, on: boolean) => setHidden(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; }), []);

  const commit = useCallback((id: string) => {
    const item = pending.current.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current.delete(id);
    dismiss(`undo-${id}`);
    const task = item.commit();
    // Bring the row back if the delete fails, so nothing silently vanishes.
    task.catch(() => show(id, false));
    track(task, { pending: `Menghapus ${item.label.toLowerCase()}…`, success: `${item.label} dihapus.`, failure: `${item.label} belum terhapus`, after: () => show(id, false), quiet: true });
  }, [dismiss, show, track]);

  const remove = useCallback((id: string, label: string, run: () => Promise<unknown>) => {
    if (pending.current.has(id)) return;
    show(id, true);
    const timer = setTimeout(() => commit(id), WAIT);
    pending.current.set(id, { label, commit: run, timer });
    push({
      id: `undo-${id}`, title: `${label} dihapus`, kind: 'info', history: false,
      action: { label: 'Batalkan', run: () => { const item = pending.current.get(id); if (!item) return; clearTimeout(item.timer); pending.current.delete(id); show(id, false); push({ title: 'Penghapusan dibatalkan.', kind: 'success', history: false }); } },
    });
  }, [commit, push, show]);

  // Leaving the app finishes any delete that is still waiting.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') [...pending.current.keys()].forEach(commit); };
    const leave = () => [...pending.current.keys()].forEach(commit);
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', leave); };
  }, [commit]);

  const value = useMemo(() => ({ hidden, remove }), [hidden, remove]);
  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export const useUndoDelete = () => useContext(UndoContext);
