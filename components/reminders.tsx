'use client';
import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, Plus, Send, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Field } from './fields';
import { AppTimePicker } from './ui/date-time-picker';
import { saveProfile } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { upcomingEvents } from '@/lib/finance-control';
import { formatDate, nextDate, todayInTimeZone } from '@/lib/period';
import { defaultReminders, dueReminders, presetTimes, validTime, type ReminderConfig } from '@/lib/reminders';

const STATE_CACHE = 'dompet-ajaib-state';
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const localTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Fired reminders live in Cache Storage so the page and the service worker never both show the same one. */
async function readJson<T>(key: string): Promise<T | null> { try { const cache = await caches.open(STATE_CACHE); const hit = await cache.match(key); return hit ? await hit.json() as T : null; } catch { return null; } }
async function writeJson(key: string, value: unknown) { try { const cache = await caches.open(STATE_CACHE); await cache.put(key, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })); } catch { /* Cache Storage is optional. */ } }

async function showSystemNotification(title: string, body: string, url: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/maskable-192.png', data: { url } } as NotificationOptions;
  try { const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined; if (registration) { await registration.showNotification(title, options); return true; } new Notification(title, options); return true; } catch { return false; }
}

/** One check at a time across the whole app, so a reminder can never be shown twice. */
let queue: Promise<void> = Promise.resolve();

export function reminderConfig(profile: { reminders?: Partial<ReminderConfig> } | null | undefined): ReminderConfig { return { ...defaultReminders, ...(profile?.reminders || {}) }; }

/** Runs while the app is open (and in the background where the browser allows): shows reminders at the chosen times. */
export function useReminderEngine(navigate: (view: string) => void) {
  const { data, profile, user } = useApp();
  const { push } = useNotify();
  const config = reminderConfig(profile);
  const latest = useRef({ data, profile, config, navigate });
  latest.current = { data, profile, config, navigate };

  // Share the schedule (and the next week's bills) with the service worker for background checks.
  useEffect(() => {
    if (!user || !profile) return;
    const today = todayInTimeZone(profile.timeZone); let end = today; for (let i = 0; i < 8; i++) end = nextDate(end);
    const bills = upcomingEvents(data, profile, { start: today, end }).filter(e => e.kind !== 'note' && e.amount < 0).map(e => ({ date: e.date, title: e.title, amount: Math.abs(e.amount) }));
    void writeJson('/__reminders.json', { ...config, bills });
    if (!config.balanceEnabled && !config.billsEnabled) return;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker?.ready;
        const sync = (registration as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> } })?.periodicSync;
        if (!sync) return;
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
        if (status.state === 'granted') await sync.register('dompet-reminders', { minInterval: 60 * 60 * 1000 });
      } catch { /* Background checks are a bonus where supported. */ }
    })();
  }, [user?.uid, JSON.stringify(config), data.recurring, data.plannedTransactions, data.debts, data.claims, data.receivables, profile?.timeZone]);

  useEffect(() => {
    if (!user) return;
    async function run() {
      {
        const { config, data, profile, navigate } = latest.current;
        if (!config.balanceEnabled && !config.billsEnabled) return;
        const day = localDay(), state = await readJson<{ date: string; fired: string[] }>('/__reminders-fired.json');
        const fired = state?.date === day ? state.fired : [];
        const { fire, consumed } = dueReminders(config, localTime(), fired);
        if (!consumed.length) return;
        await writeJson('/__reminders-fired.json', { date: day, fired: [...fired, ...consumed] });
        for (const kind of fire) {
          if (kind === 'balance') {
            const title = 'Waktunya cek saldo 💰', body = `Cocokkan saldo ${data.wallets.filter(w => !w.isArchived).length} dompetmu dan catat transaksi yang terlewat hari ini.`;
            const shown = document.visibilityState === 'hidden' && await showSystemNotification(title, body, '/?view=wallets', 'balance');
            push({ title, body, kind: 'info', action: { label: 'Buka dompet', run: () => navigate('wallets') }, history: !shown });
          } else if (profile) {
            const today = todayInTimeZone(profile.timeZone); let end = today; for (let i = 0; i <= config.billDaysBefore; i++) end = nextDate(end);
            const due = upcomingEvents(data, profile, { start: today, end }).filter(e => e.kind !== 'note' && e.amount < 0);
            if (!due.length) continue;
            const title = due.length === 1 ? `Tagihan: ${due[0].title}` : `${due.length} tagihan segera jatuh tempo`;
            const body = due.slice(0, 3).map(e => `${e.title} ${rupiah(Math.abs(e.amount))} · ${e.date === today ? 'hari ini' : formatDate(e.date, false)}`).join('\n');
            const shown = document.visibilityState === 'hidden' && await showSystemNotification(title, body, '/?view=upcoming', 'bills');
            push({ title, body, kind: 'warning', action: { label: 'Lihat jadwal', run: () => navigate('upcoming') }, history: !shown });
          }
        }
      }
    }
    const check = () => { queue = queue.then(run).catch(() => {}); return queue; };
    void check();
    const timer = setInterval(() => void check(), 30000);
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [user?.uid, push]);
}

/** Settings panel: how many balance reminders a day and at what times, plus bill reminders. */
export function ReminderSettings() {
  const { user, profile } = useApp();
  const { notify } = useNotify();
  const saved = reminderConfig(profile);
  const [draft, setDraft] = useState<ReminderConfig>(saved);
  const [permission, setPermission] = useState<string>('default');
  useEffect(() => { setDraft(reminderConfig(profile)); }, [JSON.stringify(profile?.reminders)]);
  useEffect(() => { setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (changes: Partial<ReminderConfig>) => setDraft(current => ({ ...current, ...changes }));
  async function allow() { if (typeof Notification === 'undefined') return; const result = await Notification.requestPermission(); setPermission(result); if (result === 'granted') await showSystemNotification('Notifikasi aktif ✅', 'Pengingat Dompet Ajaib akan muncul di sini.', '/', 'test'); }
  async function save() {
    if (!user) return;
    const times = [...new Set(draft.times.filter(validTime))].sort();
    if (draft.balanceEnabled && !times.length) { notify('Pilih minimal satu jam pengingat.'); return; }
    if ((draft.balanceEnabled || draft.billsEnabled) && permission === 'default') await allow();
    try { await saveProfile(user.uid, { reminders: { ...draft, times } }); notify('Pengingat disimpan.'); } catch (e) { notify((e as Error).message || 'Pengingat belum tersimpan.'); }
  }
  return <div className="panel reminder-settings">
    <h3><BellRing size={18}/> Pengingat</h3>
    {permission !== 'granted' && <div className={`notice ${permission === 'default' ? 'notice-action' : ''}`}>{permission === 'unsupported' ? 'Browser ini belum mendukung notifikasi. Pengingat tetap muncul di dalam aplikasi.' : permission === 'denied' ? 'Notifikasi diblokir. Izinkan lewat pengaturan situs di browser agar pengingat muncul di HP.' : <><span>Izinkan notifikasi agar pengingat muncul di HP.</span><Button type="button" className="small" onClick={() => void allow()}>Izinkan</Button></>}</div>}

    <label className="switch-row"><input type="checkbox" checked={draft.balanceEnabled} onChange={e => set({ balanceEnabled: e.target.checked })}/><span><strong>Ingatkan cek saldo</strong><small>Untuk mencocokkan saldo dan mencatat transaksi yang terlewat.</small></span></label>
    {draft.balanceEnabled && <div className="reminder-block">
      <span className="field-caption">Berapa kali sehari</span>
      <div className="segment size-segment">{[1, 2, 3, 4].map(n => <button type="button" key={n} className={draft.times.length === n ? 'active' : ''} onClick={() => set({ times: presetTimes[n] })}><span>{n}×</span><small>{n === 1 ? 'sekali' : `${n} kali`}</small></button>)}</div>
      <div className="reminder-times">{draft.times.map((time, index) => <div key={index} className="reminder-time"><Field label={`Pengingat ${index + 1}`}><AppTimePicker value={time} onChange={e => set({ times: draft.times.map((t, i) => i === index ? e.target.value : t) })} required/></Field>{draft.times.length > 1 && <button type="button" className="icon-btn" aria-label={`Hapus pengingat ${index + 1}`} onClick={() => set({ times: draft.times.filter((_, i) => i !== index) })}><Trash2 size={16}/></button>}</div>)}</div>
      {draft.times.length < 6 && <button type="button" className="link-button" onClick={() => set({ times: [...draft.times, '21:00'] })}><Plus size={14}/> Tambah jam</button>}
    </div>}

    <label className="switch-row"><input type="checkbox" checked={draft.billsEnabled} onChange={e => set({ billsEnabled: e.target.checked })}/><span><strong>Ingatkan tagihan & jadwal</strong><small>Dari transaksi rutin, rencana, utang, klaim, dan piutang yang jatuh tempo.</small></span></label>
    {draft.billsEnabled && <div className="reminder-block form-grid">
      <Field label="Ingatkan sejak"><div className="segment">{[[0, 'Hari H'], [1, 'H-1'], [3, 'H-3']].map(([value, label]) => <button type="button" key={value} className={draft.billDaysBefore === value ? 'active' : ''} onClick={() => set({ billDaysBefore: value as number })}>{label}</button>)}</div></Field>
      <Field label="Jam pengingat tagihan"><AppTimePicker value={draft.billTime} onChange={e => set({ billTime: e.target.value })} required/></Field>
    </div>}

    <div className="settings-actions start"><Button type="button" disabled={!dirty} onClick={() => void save()}><Check size={16}/> Simpan pengingat</Button>{permission === 'granted' && <Button type="button" variant="secondary" onClick={() => void showSystemNotification('Contoh pengingat 💰', 'Waktunya cek saldo dompetmu.', '/?view=wallets', 'test')}><Send size={15}/> Coba kirim</Button>}</div>
    <small className="muted">Pengingat dikirim oleh aplikasi di perangkat ini. Agar tepat waktu, pasang Dompet Ajaib ke layar utama dan jangan tutup paksa. Jika aplikasi baru dibuka setelah jamnya lewat (maks. 3 jam), pengingat muncul saat dibuka. Di iPhone perlu iOS 16.4+ dengan aplikasi terpasang.</small>
  </div>;
}
