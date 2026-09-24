'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AlertTriangle, Bell, CheckCircle2, CloudOff, Download, Info, Loader2, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { applyUpdate, promptInstall, usePwa } from '@/lib/pwa';
import { budgetCurrent, rupiah } from '@/lib/accounting';
import { upcomingEvents } from '@/lib/finance-control';
import { dateInTimeZone, formatDate, nextDate, todayInTimeZone } from '@/lib/period';

export type NoteKind = 'success' | 'error' | 'info' | 'warning' | 'progress';
type Action = { label: string; run: () => void };
export type Note = { id: string; title: string; body?: string; kind: NoteKind; time: number; read?: boolean; action?: Action };
type PushInput = { id?: string; title: string; body?: string; kind?: NoteKind; action?: Action; history?: boolean };
type TrackLabels = { pending: string; success: string; failure: string; retry?: Action; after?: () => void };
type Api = { push: (input: PushInput) => string; dismiss: (id: string) => void; track: (task: Promise<unknown>, labels: TrackLabels) => void; notify: (message: string) => void };

const Context = createContext<Api | null>(null);
export function useNotify() { const api = useContext(Context); if (!api) throw Error('NotificationProvider missing'); return api; }

const storageKey = (uid: string) => `dompet-ajaib:notifications:${uid}`;
const readHistory = (uid: string): Note[] => { try { return JSON.parse(localStorage.getItem(storageKey(uid)) || '[]'); } catch { return []; } };
const failure = /gagal|tidak bisa|belum bisa|belum tersimpan|tidak valid|ditolak sistem|error|salah|tidak cocok|periksa/i;
/** Guess the tone of a plain message from the older `notify(text)` calls. */
function kindOf(message: string): NoteKind { return failure.test(message) ? 'error' : /sementara|offline|menunggu/i.test(message) ? 'warning' : 'success'; }
const lifetime: Record<NoteKind, number> = { success: 4200, info: 5200, warning: 7000, error: 9000, progress: 0 };

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, sync } = useApp();
  const uid = user?.uid || '';
  const [history, setHistory] = useState<Note[]>([]);
  const [floating, setFloating] = useState<Note[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const busy = useRef(0);

  useEffect(() => { setHistory(uid ? readHistory(uid) : []); setFloating([]); }, [uid]);
  useEffect(() => { if (!uid) return; try { localStorage.setItem(storageKey(uid), JSON.stringify(history.slice(0, 60).map(({ action: _action, ...note }) => note))); } catch { /* History is a convenience. */ } }, [history, uid]);

  const dismiss = useCallback((id: string) => { setFloating(list => list.filter(note => note.id !== id)); const timer = timers.current.get(id); if (timer) clearTimeout(timer); timers.current.delete(id); }, []);
  const push = useCallback((input: PushInput) => {
    const id = input.id || `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const note: Note = { id, title: input.title, body: input.body, kind: input.kind || 'success', time: Date.now(), action: input.action };
    setFloating(list => [note, ...list.filter(item => item.id !== id)].slice(0, 4));
    if (input.history !== false && note.kind !== 'progress') setHistory(list => [note, ...list.filter(item => item.id !== id)].slice(0, 60));
    const old = timers.current.get(id); if (old) clearTimeout(old);
    const life = lifetime[note.kind] * (note.title.length > 70 ? 2 : 1);
    if (life) timers.current.set(id, setTimeout(() => dismiss(id), life));
    return id;
  }, [dismiss]);
  const notify = useCallback((message: string) => { if (message) push({ title: message, kind: kindOf(message) }); }, [push]);
  const track = useCallback((task: Promise<unknown>, labels: TrackLabels) => {
    busy.current++;
    const id = push({ title: labels.pending, body: navigator.onLine ? 'Menyinkronkan ke cloud…' : 'Offline · tersimpan di perangkat, dikirim saat online', kind: 'progress', history: false });
    task.finally(() => { setTimeout(() => { busy.current = Math.max(0, busy.current - 1); }, 1500); }).catch(() => {});
    task.then(() => { push({ id, title: labels.success, body: 'Data sudah sinkron', kind: 'success' }); labels.after?.(); })
      .catch(error => {
        const committed = (error as { committed?: boolean }).committed;
        if (committed) { push({ id, title: labels.success, body: (error as Error).message, kind: 'warning' }); labels.after?.(); return; }
        push({ id, title: labels.failure, body: (error as Error).message || 'Coba lagi.', kind: 'error', action: labels.retry });
      });
  }, [push]);

  // A write that waits for the server shows a progress card until the data is synced.
  const lastSync = useRef(sync), started = useRef(false);
  useEffect(() => {
    const previous = lastSync.current; lastSync.current = sync;
    if (sync === 'synced') { if (started.current && previous !== 'synced' && !busy.current) push({ id: 'sync', title: 'Data sudah sinkron', kind: 'success', history: false }); started.current = true; return; }
    if (!started.current || busy.current) return;
    if (sync === 'syncing') push({ id: 'sync', title: 'Menyinkronkan data…', body: 'Perubahan sedang dikirim ke cloud', kind: 'progress', history: false });
    if (sync === 'offline') push({ id: 'sync', title: 'Sedang offline', body: 'Perubahan disimpan di perangkat dan dikirim saat online', kind: 'warning', history: false });
    if (sync === 'error') push({ id: 'sync', title: 'Sinkronisasi gagal', body: 'Periksa koneksi, lalu buka ulang aplikasi', kind: 'error' });
  }, [sync, push]);

  const api = useMemo(() => ({ push, dismiss, track, notify }), [push, dismiss, track, notify]);
  const center = useMemo(() => ({ history, setHistory }), [history]);
  return <Context.Provider value={api}><HistoryContext.Provider value={center}>{children}</HistoryContext.Provider><ToastStack notes={floating} onDismiss={dismiss}/></Context.Provider>;
}

const HistoryContext = createContext<{ history: Note[]; setHistory: React.Dispatch<React.SetStateAction<Note[]>> } | null>(null);
const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle, progress: Loader2 };

function ToastStack({ notes, onDismiss }: { notes: Note[]; onDismiss: (id: string) => void }) {
  if (!notes.length) return null;
  return <div className="toast-stack" role="region" aria-label="Notifikasi">{notes.map(note => <Toast key={note.id} note={note} onDismiss={() => onDismiss(note.id)}/>)}</div>;
}

/** A floating card: close with ×, or swipe it sideways. */
function Toast({ note, onDismiss }: { note: Note; onDismiss: () => void }) {
  const [dx, setDx] = useState(0), [leaving, setLeaving] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const Icon = icons[note.kind];
  function down(event: ReactPointerEvent<HTMLDivElement>) { if ((event.target as Element).closest('button')) return; start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event: ReactPointerEvent<HTMLDivElement>) { if (!start.current) return; setDx(event.clientX - start.current.x); }
  function up() { if (!start.current) return; start.current = null; if (Math.abs(dx) > 70) { setLeaving(true); setDx(dx > 0 ? 480 : -480); setTimeout(onDismiss, 160); } else setDx(0); }
  return <div className={`toast-card is-${note.kind} ${leaving ? 'is-leaving' : ''}`} role={note.kind === 'error' ? 'alert' : 'status'} style={{ transform: dx ? `translateX(${dx}px)` : undefined, opacity: dx ? Math.max(.2, 1 - Math.abs(dx) / 260) : undefined, transition: start.current ? 'none' : undefined }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <span className="toast-icon" aria-hidden="true"><Icon size={19}/></span>
    <div className="toast-text"><strong>{note.title}</strong>{note.body && <small>{note.body}</small>}{note.action && <button type="button" className="toast-action" onClick={() => { note.action?.run(); onDismiss(); }}>{note.action.label}</button>}</div>
    <button type="button" className="toast-close" aria-label="Tutup notifikasi" onClick={onDismiss}><X size={16}/></button>
    {(note.kind === 'progress' || note.kind === 'success') && <span className={`toast-progress ${note.kind === 'progress' ? 'is-running' : 'is-done'}`} aria-hidden="true"><i/></span>}
  </div>;
}

const ago = (time: number) => { const minutes = Math.round((Date.now() - time) / 60000); if (minutes < 1) return 'baru saja'; if (minutes < 60) return `${minutes} mnt lalu`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours} jam lalu`; return new Date(time).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
type Attention = { id: string; title: string; body: string; kind: NoteKind; action?: Action };

/** Bell in the top bar with the notification centre. */
export function NotificationBell({ navigate }: { navigate: (view: string) => void }) {
  const { data, profile, sync } = useApp();
  const center = useContext(HistoryContext)!;
  const pwa = usePwa();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const uid = profile?.uid || '';
  useEffect(() => { try { setSeen(JSON.parse(localStorage.getItem(`dompet-ajaib:seen:${uid}`) || '[]')); } catch { setSeen([]); } }, [uid]);

  const attention = useMemo<Attention[]>(() => {
    if (!profile) return [];
    const list: Attention[] = [];
    const go = (view: string) => ({ label: 'Buka', run: () => { setOpen(false); navigate(view); } });
    if (pwa.updateReady) list.push({ id: 'update', title: 'Versi baru tersedia', body: 'Muat ulang untuk memakai versi terbaru.', kind: 'info', action: { label: 'Muat ulang', run: applyUpdate } });
    if (pwa.canInstall) list.push({ id: 'install', title: 'Pasang Dompet Ajaib', body: 'Buka lebih cepat dari layar utama, bisa dipakai offline.', kind: 'info', action: { label: 'Pasang', run: () => void promptInstall() } });
    if (sync === 'offline') list.push({ id: 'offline', title: 'Sedang offline', body: 'Perubahan akan dikirim saat koneksi kembali.', kind: 'warning' });
    const pending = data.drafts.filter(d => d.status === 'pending');
    if (pending.length) list.push({ id: `inbox-${pending.length}`, title: `${pending.length} transaksi perlu dikonfirmasi`, body: `Total ${rupiah(pending.reduce((n, d) => n + d.amount, 0))}`, kind: 'warning', action: go('inbox') });
    const day = dateInTimeZone(new Date(), profile.timeZone), warn = (profile.budgetWarningPercent || 80) / 100;
    for (const budget of data.budgets.filter(b => b.active)) {
      const row = budgetCurrent(budget, data.transactions, data.categories, day, profile.salaryCycleStartDay || 24);
      if (row.available <= 0 || row.spent / row.available < warn) continue;
      const pct = Math.round(row.spent / row.available * 100);
      list.push({ id: `budget-${budget.id}-${row.start}-${pct >= 100 ? 'over' : 'warn'}`, title: pct >= 100 ? `Anggaran ${budget.name} terlewati` : `Anggaran ${budget.name} terpakai ${pct}%`, body: pct >= 100 ? `Lebih ${rupiah(row.spent - row.available)}` : `Sisa ${rupiah(row.remaining)}`, kind: pct >= 100 ? 'error' : 'warning', action: go('budgets') });
    }
    const today = todayInTimeZone(profile.timeZone); let end = today; for (let i = 0; i < 3; i++) end = nextDate(end);
    for (const event of upcomingEvents(data, profile, { start: today, end }).filter(e => e.kind !== 'note' && e.amount < 0).slice(0, 5)) list.push({ id: `due-${event.id}-${event.date}`, title: `${event.title} · ${rupiah(Math.abs(event.amount))}`, body: event.date === today ? 'Jatuh tempo hari ini' : `Jatuh tempo ${formatDate(event.date, false)}`, kind: 'info', action: go('upcoming') });
    return list;
  }, [data, profile, pwa.updateReady, pwa.canInstall, sync, navigate]);

  const unread = center.history.filter(note => !note.read).length + attention.filter(item => !seen.includes(item.id)).length;
  function show(next: boolean) {
    setOpen(next);
    if (!next) return;
    const ids = attention.map(item => item.id);
    setSeen(ids); try { localStorage.setItem(`dompet-ajaib:seen:${uid}`, JSON.stringify(ids)); } catch { /* optional */ }
    center.setHistory(list => list.map(note => ({ ...note, read: true })));
  }
  return <>
    <button type="button" className="bell-button" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'} title="Notifikasi" onClick={() => show(true)}><Bell size={19}/>{unread > 0 && <b className="bell-count">{unread > 9 ? '9+' : unread}</b>}</button>
    <Dialog open={open} onOpenChange={show}><DialogContent title="Notifikasi" className="notification-dialog">
      {attention.length > 0 && <section className="notif-section"><h3>Perlu perhatian</h3>{attention.map(item => { const Icon = item.id === 'offline' ? CloudOff : item.id === 'install' ? Download : item.id === 'update' ? RefreshCw : icons[item.kind]; return <div key={item.id} className={`notif-item is-${item.kind}`}><span className="notif-icon"><Icon size={17}/></span><div><strong>{item.title}</strong><small>{item.body}</small></div>{item.action && <button type="button" className="link-button" onClick={item.action.run}>{item.action.label}</button>}</div>; })}</section>}
      <section className="notif-section"><div className="notif-head"><h3>Riwayat</h3>{center.history.length > 0 && <button type="button" className="link-button" onClick={() => center.setHistory([])}><Trash2 size={14}/> Hapus semua</button>}</div>
        {center.history.length ? center.history.map(note => { const Icon = icons[note.kind]; return <SwipeRow key={note.id} onRemove={() => center.setHistory(list => list.filter(item => item.id !== note.id))}><div className={`notif-item is-${note.kind}`}><span className="notif-icon"><Icon size={17}/></span><div><strong>{note.title}</strong><small>{note.body ? `${note.body} · ` : ''}{ago(note.time)}</small></div><button type="button" className="icon-btn" aria-label="Hapus notifikasi" onClick={() => center.setHistory(list => list.filter(item => item.id !== note.id))}><X size={15}/></button></div></SwipeRow>; }) : <p className="muted notif-empty">Belum ada notifikasi. Aktivitas seperti menyimpan transaksi akan muncul di sini.</p>}
      </section>
    </DialogContent></Dialog>
  </>;
}

function SwipeRow({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  const [dx, setDx] = useState(0); const start = useRef<number | null>(null);
  return <div className="swipe-row" style={{ transform: dx ? `translateX(${dx}px)` : undefined, opacity: dx ? Math.max(.2, 1 - Math.abs(dx) / 240) : undefined }} onPointerDown={event => { if ((event.target as Element).closest('button')) return; start.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (start.current !== null) setDx(event.clientX - start.current); }} onPointerUp={() => { start.current = null; if (Math.abs(dx) > 80) onRemove(); else setDx(0); }} onPointerCancel={() => { start.current = null; setDx(0); }}>{children}</div>;
}
