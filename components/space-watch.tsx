'use client';
/**
 * 9.1 The bell for Ruang Bersama: what other members added, changed or deleted, who asked to join, and money paid
 * back to this person, in every space they are in (while the app is open; there is no server to send pushes).
 * Only what happened after the last look is shown, never the whole history at once.
 */
import { useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { rupiah } from '@/lib/accounting';
import { subscribeLatestActivity } from '@/lib/space-activity';
import { subscribeRequests } from '@/lib/spaces';

const verbs: Record<string, string> = { add: 'mencatat', edit: 'mengubah', delete: 'menghapus', restore: 'mengembalikan' };
const seenKey = (uid: string) => `dompet-ajaib:space-seen:${uid}`;
function readSeen(uid: string): Record<string, number> { try { return JSON.parse(localStorage.getItem(seenKey(uid)) || '{}'); } catch { return {}; } }
function writeSeen(uid: string, seen: Record<string, number>) { try { localStorage.setItem(seenKey(uid), JSON.stringify(seen)); } catch { /* only a convenience */ } }
const millis = (t: unknown) => (t as { toMillis?: () => number })?.toMillis?.() || 0;

export function SpaceWatch({ navigate }: { navigate: (view: string, focus?: string) => void }) {
  const { account, spaces, data, switchTo } = useApp();
  const { push } = useNotify();
  const nav = useRef(navigate); nav.current = navigate;
  const cats = useRef(data.categories); cats.current = data.categories;
  const ids = spaces.map(s => `${s.id}:${s.name}`).join('|');
  useEffect(() => {
    if (!account || !db || !spaces.length) return;
    const uid = account.uid, stops: Unsubscribe[] = [], seen = readSeen(uid), now = Date.now();
    const fresh = (key: string, at: number) => { const last = seen[key] ?? (seen[key] = now, writeSeen(uid, seen), now); if (at <= last) return false; seen[key] = at; writeSeen(uid, seen); return true; };
    for (const space of spaces) {
      const open = (view: string, focus?: string) => () => { switchTo(space.id); nav.current(view, focus); };
      stops.push(subscribeLatestActivity(space.id, list => {
        for (const a of [...list].reverse()) {
          const at = millis(a.at);
          if (!at || a.by === uid || !fresh(`a:${space.id}`, at)) continue;
          const what = a.title || cats.current.find(c => c.id === a.categoryId)?.name || 'transaksi';
          push({ title: `${a.byName} ${verbs[a.kind] || a.kind} ${what} · ${rupiah(a.amount)}`, body: `di ${space.name}`, kind: 'info', history: true, open: open('transactions') });
        }
      }));
      stops.push(subscribeRequests(space.id, list => {
        for (const r of list) { const at = millis(r.at); if (at && fresh(`r:${space.id}:${r.uid}`, at)) push({ title: `${r.name} minta bergabung ke ${space.name}`, body: 'Terima atau tolak di Pengaturan → Dompet Bersama.', kind: 'info', history: true, open: open('settings', 'shared') }); }
      }));
      stops.push(onSnapshot(query(collection(db, 'spaces', space.id, 'settlements'), where('to', '==', uid)), snap => {
        for (const d of [...snap.docs].sort((x, y) => millis(x.data().at) - millis(y.data().at))) {
          const s = d.data(), at = millis(s.at);
          if (s.received || !at || !fresh(`s:${space.id}`, at)) continue;
          push({ title: `${s.fromName} sudah bayar ${rupiah(s.amount)} ke kamu`, body: `Tekan Terima di Beranda ${space.name} untuk memilih dompetnya.`, kind: 'success', history: true, open: open('dashboard') });
        }
      }, () => {}));
    }
    return () => stops.forEach(stop => stop());
  }, [account?.uid, ids]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
