'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import * as Alert from '@radix-ui/react-alert-dialog';
import { Button } from './ui/button';
import { useNotify } from './notifications';

/**
 * Deleting asks once ("Hapus …?"), then deletes right away: the item disappears and a progress card shows until it is
 * gone from the cloud (or, offline, gone from the device and sent when online). No undo window to wait for.
 */
type Ask = { id: string; label: string; detail?: string; run: () => Promise<unknown>; onUndo?: () => void };
type Api = { hidden: ReadonlySet<string>; remove: (id: string, label: string, commit: () => Promise<unknown>, detail?: string, onUndo?: () => void) => void };
const UndoContext = createContext<Api>({ hidden: new Set(), remove: (_id, _label, commit) => { void commit(); } });

export function UndoDeleteProvider({ children }: { children: ReactNode }) {
  const { track } = useNotify();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [ask, setAsk] = useState<Ask | null>(null);
  const show = useCallback((id: string, on: boolean) => setHidden(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; }), []);

  /** Confirmed: hidden at once and deleted right away, with a progress card until it is done. */
  const commit = useCallback((item: Ask) => {
    show(item.id, true);
    const task = item.run();
    // Bring the row back only if the delete fails, so nothing silently vanishes; a deleted row stays hidden even if
    // a screen still holds its old copy for a moment.
    task.catch(error => { if (!(error as { committed?: boolean }).committed) show(item.id, false); });
    // Said plainly where it stands: gone from the cloud, or gone here and sent as soon as the phone is online.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    track(task, { pending: `Menghapus ${item.label.toLowerCase()}…`, success: offline ? `${item.label} terhapus di perangkat` : `${item.label} terhapus dari cloud.`, detail: item.detail, offlineNote: 'Dihapus dari cloud otomatis saat online, walau aplikasi ditutup', failure: `${item.label} belum terhapus`, log: true, immediate: true });
  }, [show, track]);

  const remove = useCallback((id: string, label: string, run: () => Promise<unknown>, detail?: string, onUndo?: () => void) => {
    setAsk({ id, label, detail, run, onUndo });
  }, []);

  const value = useMemo(() => ({ hidden, remove }), [hidden, remove]);
  return <UndoContext.Provider value={value}>{children}
    <Alert.Root open={Boolean(ask)} onOpenChange={open => { if (!open && ask) { ask.onUndo?.(); setAsk(null); } }}>
      <Alert.Portal><Alert.Overlay className="modal-overlay"/><Alert.Content className="modal-content confirm delete-confirm">
        <Alert.Title>Hapus {ask?.label.toLowerCase()}?</Alert.Title>
        <Alert.Description>{ask?.detail ? <><strong>{ask.detail}</strong><br/></> : null}Data ini akan dihapus permanen dan tidak bisa dikembalikan.</Alert.Description>
        <div className="modal-actions">
          <Alert.Cancel asChild><Button variant="secondary">Batal</Button></Alert.Cancel>
          <Alert.Action asChild><Button variant="danger" onClick={() => { const item = ask; setAsk(null); if (item) commit(item); }}>Hapus</Button></Alert.Action>
        </div>
      </Alert.Content></Alert.Portal>
    </Alert.Root>
  </UndoContext.Provider>;
}

export const useUndoDelete = () => useContext(UndoContext);
