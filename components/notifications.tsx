'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { EmojiText } from './emoji';
import { AlertTriangle, Bell, BellRing, CheckCircle2, CloudOff, Download, Info, Loader2, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { applyUpdate, promptInstall, usePwa } from '@/lib/pwa';
import { budgetCurrent, rupiah } from '@/lib/accounting';
import { upcomingEvents } from '@/lib/finance-control';
import { dateInTimeZone, formatDate, nextDate, todayInTimeZone } from '@/lib/period';
import { defaultReminders } from '@/lib/reminders';

export type NoteKind = 'success' | 'error' | 'info' | 'warning' | 'progress';
type Action = { label: string; run: () => void };
/** `app`: a reminder from Dompet Ajaib itself, shown as a floating banner with the app logo (like a phone notification). */
export type Note = { id: string; title: string; body?: string; kind: NoteKind; time: number; read?: boolean; action?: Action; app?: boolean };
type PushInput = { id?: string; title: string; body?: string; kind?: NoteKind; action?: Action; history?: boolean; app?: boolean };
/**
 * `quiet`: small changes (reorder, toggles, pause) save without any card unless they fail.
 * `detail`: a second line such as the category and wallet. `log`: keep it in Riwayat (every save that shows a card does).
 */
type TrackLabels = { pending: string; success: string; failure: string; detail?: string; retry?: Action; after?: () => void; quiet?: boolean; log?: boolean };
type Api = { push: (input: PushInput) => string; dismiss: (id: string) => void; track: (task: Promise<unknown>, labels: TrackLabels) => void; notify: (message: string) => void };

const Context = createContext<Api | null>(null);
export function useNotify() { const api = useContext(Context); if (!api) throw Error('NotificationProvider missing'); return api; }

const storageKey = (uid: string) => `dompet-ajaib:notifications:${uid}`;
const readHistory = (uid: string): Note[] => { try { return JSON.parse(localStorage.getItem(storageKey(uid)) || '[]'); } catch { return []; } };
const failure = /gagal|tidak bisa|belum bisa|belum tersimpan|tidak valid|ditolak sistem|error|salah|tidak cocok|periksa/i;
/** Guess the tone of a plain message from the older `notify(text)` calls. */
function kindOf(message: string): NoteKind { return failure.test(message) ? 'error' : /sementara|offline|menunggu/i.test(message) ? 'warning' : 'success'; }
const lifetime: Record<NoteKind, number> = { success: 2600, info: 5200, warning: 7000, error: 9000, progress: 0 };

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
    const note: Note = { id, title: input.title, body: input.body, kind: input.kind || 'success', time: Date.now(), action: input.action, app: input.app };
    setFloating(list => [note, ...list.filter(item => item.id !== id)].slice(0, 4));
    if (input.history !== false && note.kind !== 'progress') setHistory(list => [note, ...list.filter(item => item.id !== id)].slice(0, 60));
    const old = timers.current.get(id); if (old) clearTimeout(old);
    const life = note.app ? 9000 : lifetime[note.kind] * (note.title.length > 70 ? 2 : 1);
    if (life) timers.current.set(id, setTimeout(() => dismiss(id), life));
    return id;
  }, [dismiss]);
  // Finished actions go into Riwayat too, so the bell shows what was just saved.
  const notify = useCallback((message: string) => { if (!message) return; push({ title: message, kind: kindOf(message) }); }, [push]);
  const remember = useCallback((note: Pick<Note, 'title' | 'body' | 'kind'>) => setHistory(list => [{ ...note, id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, time: Date.now() }, ...list].slice(0, 60)), []);
  const track = useCallback((task: Promise<unknown>, labels: TrackLabels) => {
    busy.current++;
    // The "saving…" card only appears if the save is actually slow, so quick saves don't flash two cards.
    let id: string | undefined, settled = false;
    const slow = setTimeout(() => { if (!settled && !labels.quiet) id = push({ title: labels.pending, body: navigator.onLine ? 'Menyinkronkan ke cloud…' : 'Offline · tersimpan di perangkat, dikirim saat online', kind: 'progress', history: false }); }, 900);
    const done = () => { settled = true; clearTimeout(slow); };
    task.finally(() => { setTimeout(() => { busy.current = Math.max(0, busy.current - 1); }, 1500); }).catch(() => {});
    task.then(() => {
      done();
      const body = [labels.detail, navigator.onLine ? '' : 'Tersimpan di perangkat · dikirim otomatis saat online'].filter(Boolean).join(' · ') || undefined;
      const log = labels.log ?? !labels.quiet;
      if (labels.quiet) { if (id) dismiss(id); if (log) remember({ title: labels.success, body, kind: 'success' }); } else push({ id, title: labels.success, body, kind: 'success', history: log });
      labels.after?.();
    }).catch(error => {
      done();
      const committed = (error as { committed?: boolean }).committed;
      if (committed) { push({ id, title: labels.success, body: (error as Error).message, kind: 'warning' }); labels.after?.(); return; }
      push({ id, title: labels.failure, body: (error as Error).message || 'Coba lagi.', kind: 'error', action: labels.retry });
    });
  }, [push, dismiss, remember]);

  // A write that waits for the server shows a progress card until the data is synced.
  const lastSync = useRef(sync), started = useRef(false), wasOffline = useRef(false);
  useEffect(() => {
    const previous = lastSync.current; lastSync.current = sync;
    if (!started.current) { if (sync === 'synced') started.current = true; return; }
    // Routine syncing stays silent; only going offline, coming back, and failures are worth a card.
    if (sync === 'offline') wasOffline.current = true;
    if (sync === 'synced' && wasOffline.current) { wasOffline.current = false; push({ id: 'sync', title: 'Kembali online', body: 'Perubahan yang tertunda sudah dikirim', kind: 'success', history: false }); }
    if (sync === 'offline' && previous !== 'offline') push({ id: 'sync', title: 'Sedang offline', body: 'Perubahan disimpan di perangkat dan dikirim saat online', kind: 'warning', history: false });
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
  const banners = notes.filter(note => note.app), toasts = notes.filter(note => !note.app);
  return <>
    {banners.length > 0 && <div className="heads-up-stack" role="region" aria-label="Pemberitahuan Dompet Ajaib">{banners.map(note => <HeadsUp key={note.id} note={note} onDismiss={() => onDismiss(note.id)}/>)}</div>}
    {toasts.length > 0 && <div className="toast-stack" role="region" aria-label="Notifikasi">{toasts.map(note => <Toast key={note.id} note={note} onDismiss={() => onDismiss(note.id)}/>)}</div>}
  </>;
}

/** Floating banner that looks like a phone notification: app logo, name, time; swipe up or sideways to dismiss, tap to open. */
function HeadsUp({ note, onDismiss }: { note: Note; onDismiss: () => void }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 }), [leaving, setLeaving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null), moved = useRef(false);
  useEffect(() => { try { navigator.vibrate?.([60, 40, 60]); } catch { /* optional */ } }, []);
  function down(event: ReactPointerEvent<HTMLDivElement>) { if ((event.target as Element).closest('button')) return; start.current = { x: event.clientX, y: event.clientY }; moved.current = false; event.currentTarget.setPointerCapture(event.pointerId); }
  function move(event: ReactPointerEvent<HTMLDivElement>) { if (!start.current) return; const x = event.clientX - start.current.x, y = Math.min(0, event.clientY - start.current.y); if (Math.abs(x) > 6 || y < -6) moved.current = true; setOffset({ x, y }); }
  function up() {
    if (!start.current) return; start.current = null;
    if (offset.y < -40 || Math.abs(offset.x) > 80) { setLeaving(true); setOffset(offset.y < -40 ? { x: 0, y: -160 } : { x: offset.x > 0 ? 480 : -480, y: 0 }); setTimeout(onDismiss, 180); return; }
    setOffset({ x: 0, y: 0 });
    if (!moved.current && note.action) { note.action.run(); onDismiss(); }
  }
  const drag = offset.x || offset.y;
  return <div className={`heads-up is-${note.kind} ${leaving ? 'is-leaving' : ''}`} role={note.kind === 'error' ? 'alert' : 'status'} style={{ transform: drag ? `translate(${offset.x}px, ${offset.y}px)` : undefined, opacity: drag ? Math.max(.2, 1 - (Math.abs(offset.x) + Math.abs(offset.y) * 2) / 300) : undefined, transition: start.current ? 'none' : undefined }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <img className="heads-up-logo" src="/icons/icon-192.png" alt="" draggable={false}/>
    <div className="heads-up-text">
      <span className="heads-up-app">Dompet Ajaib <i aria-hidden="true">·</i> sekarang</span>
      <strong><EmojiText text={note.title}/></strong>
      {note.body && <small><EmojiText text={note.body}/></small>}
      {note.action && <button type="button" className="heads-up-action" onClick={() => { note.action?.run(); onDismiss(); }}>{note.action.label}</button>}
    </div>
    <button type="button" className="heads-up-close" aria-label="Tutup pemberitahuan" onClick={onDismiss}><X size={15}/></button>
    <span className="heads-up-grip" aria-hidden="true"/>
  </div>;
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
    <div className="toast-text"><strong><EmojiText text={note.title}/></strong>{note.body && <small><EmojiText text={note.body}/></small>}{note.action && <button type="button" className="toast-action" onClick={() => { note.action?.run(); onDismiss(); }}>{note.action.label}</button>}</div>
    <button type="button" className="toast-close" aria-label="Tutup notifikasi" onClick={onDismiss}><X size={16}/></button>
    {(note.kind === 'progress' || note.kind === 'success') && <span className={`toast-progress ${note.kind === 'progress' ? 'is-running' : 'is-done'}`} aria-hidden="true"><i/></span>}
  </div>;
}

const ago = (time: number) => { const minutes = Math.round((Date.now() - time) / 60000); if (minutes < 1) return 'baru saja'; if (minutes < 60) return `${minutes} mnt lalu`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours} jam lalu`; return new Date(time).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
type Attention = { id: string; title: string; body: string; kind: NoteKind; action?: Action };

/** Bell in the top bar with the notification centre. */
export function NotificationBell({ navigate }: { navigate: (view: string, focus?: string) => void }) {
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
  // Reminders are off until chosen, and phone notifications need the device's permission: point to where both are set.
  const reminders = { ...defaultReminders, ...(profile?.reminders || {}) };
  const permission = open && typeof Notification !== 'undefined' ? Notification.permission : 'granted';
  const tip = !reminders.balanceEnabled && !reminders.billsEnabled ? 'Pengingat tagihan dan perbarui saldo belum aktif. Nyalakan agar muncul sebagai notifikasi di HP.' : permission !== 'granted' ? 'Pengingat sudah aktif, tetapi perangkat ini belum mengizinkan notifikasi. Izinkan agar pengingat muncul walau aplikasi tertutup.' : '';
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
      {attention.length > 0 && <section className="notif-section"><h3>Perlu perhatian</h3>{attention.map(item => { const Icon = item.id === 'offline' ? CloudOff : item.id === 'install' ? Download : item.id === 'update' ? RefreshCw : icons[item.kind]; return <div key={item.id} className={`notif-item is-${item.kind}`}><span className="notif-icon"><Icon size={17}/></span><div><strong><EmojiText text={item.title}/></strong><small><EmojiText text={item.body}/></small></div>{item.action && <button type="button" className="link-button" onClick={item.action.run}>{item.action.label}</button>}</div>; })}</section>}
      <section className="notif-section"><div className="notif-head"><h3>Riwayat</h3>{center.history.length > 0 && <button type="button" className="link-button" onClick={() => center.setHistory([])}><Trash2 size={14}/> Hapus semua</button>}</div>
        {center.history.length ? center.history.map(note => { const Icon = icons[note.kind]; return <SwipeRow key={note.id} onRemove={() => center.setHistory(list => list.filter(item => item.id !== note.id))}><div className={`notif-item is-${note.kind}`}><span className="notif-icon"><Icon size={17}/></span><div><strong><EmojiText text={note.title}/></strong><small>{note.body ? `${note.body} · ` : ''}{ago(note.time)}</small></div><button type="button" className="icon-btn" aria-label="Hapus notifikasi" onClick={() => center.setHistory(list => list.filter(item => item.id !== note.id))}><X size={15}/></button></div></SwipeRow>; }) : <p className="muted notif-empty">Belum ada notifikasi. Aktivitas seperti menyimpan transaksi akan muncul di sini.</p>}
      </section>
      {tip && <div className="notif-tip"><span className="notif-tip-icon" aria-hidden="true"><BellRing size={16}/></span><p>{tip}</p><button type="button" className="link-button" onClick={() => { setOpen(false); navigate('settings', 'reminders'); }}>Atur pengingat</button></div>}
    </DialogContent></Dialog>
  </>;
}

function SwipeRow({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  const [dx, setDx] = useState(0); const start = useRef<number | null>(null);
  return <div className="swipe-row" style={{ transform: dx ? `translateX(${dx}px)` : undefined, opacity: dx ? Math.max(.2, 1 - Math.abs(dx) / 240) : undefined }} onPointerDown={event => { if ((event.target as Element).closest('button')) return; start.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (start.current !== null) setDx(event.clientX - start.current); }} onPointerUp={() => { start.current = null; if (Math.abs(dx) > 80) onRemove(); else setDx(0); }} onPointerCancel={() => { start.current = null; setDx(0); }}>{children}</div>;
}
