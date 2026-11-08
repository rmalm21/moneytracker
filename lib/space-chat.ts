/**
 * 9.2 Chat grup in a Ruang Bersama: text, a shared transaction card, or the assistant's answer to "@asisten …"
 * (worked out on the asking member's phone from the space's records and posted for everyone). Kept 90 days in
 * spaces/{id}/messages; only members read and write it (firestore.rules). Nothing is uploaded but the text.
 */
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, where, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import type { LedgerTx } from './types';

export const GROUP_KEEP_DAYS = 90, GROUP_MAX = 2000;
export type GroupLine = { label: string; value: string };
export type GroupMessage = {
  id: string; by: string; byName: string; at?: Timestamp; kind: 'text' | 'tx' | 'bot'; text: string;
  tx?: { id: string; title: string; amount: number; type: string; date: string; category?: string };
  /** An assistant answer: who asked, and the figures it showed. */
  bot?: { askedBy: string; question: string; title?: string; hero?: { label: string; value: string }; lines?: GroupLine[] };
  /** 9.3 The message this one answers (a short quote of it), and the members tagged with "@". */
  replyTo?: GroupReply; mentions?: string[];
};
export type GroupReply = { id: string; by: string; byName: string; text: string; kind: GroupMessage['kind'] };
/** A short quote of a message, for a reply. */
export function quoteOf(m: GroupMessage): GroupReply {
  const text = m.kind === 'tx' && m.tx ? `${m.tx.title}${m.text ? ` · ${m.text}` : ''}` : m.text;
  return { id: m.id, by: m.by, byName: m.kind === 'bot' ? 'Asisten' : m.byName, text: text.replace(/\s+/g, ' ').slice(0, 160), kind: m.kind };
}

function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
const messages = (spaceId: string) => collection(database(), 'spaces', spaceId, 'messages');

/** The last 90 days (at most 300 messages), oldest first; a message still being sent has no time yet and shows last. */
export function subscribeGroup(spaceId: string, onValue: (list: GroupMessage[]) => void): Unsubscribe {
  const since = Timestamp.fromMillis(Date.now() - GROUP_KEEP_DAYS * 864e5);
  return onSnapshot(query(messages(spaceId), where('at', '>=', since), orderBy('at', 'desc'), limit(300)), { includeMetadataChanges: false },
    snap => onValue(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as GroupMessage).reverse()), () => onValue([]));
}
/** The newest few, for the bell and the unread dot. */
export function subscribeLatestGroup(spaceId: string, onValue: (list: GroupMessage[]) => void): Unsubscribe {
  return onSnapshot(query(messages(spaceId), orderBy('at', 'desc'), limit(10)), snap => onValue(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as GroupMessage)), () => {});
}

type Me = { uid: string; name: string };
const clip = (text: string) => text.trim().slice(0, GROUP_MAX);
export async function sendText(spaceId: string, me: Me, text: string, extra: { replyTo?: GroupReply | null; mentions?: string[] } = {}) {
  const t = clip(text); if (!t) return;
  await addDoc(messages(spaceId), {
    by: me.uid, byName: me.name, at: serverTimestamp(), kind: 'text', text: t,
    ...(extra.replyTo ? { replyTo: extra.replyTo } : {}), ...(extra.mentions?.length ? { mentions: extra.mentions.slice(0, 5) } : {}),
  });
}
export async function shareTx(spaceId: string, me: Me, t: LedgerTx, category?: string, note = '') {
  await addDoc(messages(spaceId), {
    by: me.uid, byName: me.name, at: serverTimestamp(), kind: 'tx', text: clip(note),
    tx: { id: t.id, title: (t.description || t.merchant || category || 'Transaksi').slice(0, 80), amount: t.amount, type: t.type, date: t.date, ...(category ? { category } : {}) },
  });
}
export async function postAnswer(spaceId: string, me: Me, question: string, answer: { text: string; title?: string; hero?: { label: string; value: string }; lines?: GroupLine[] }) {
  await addDoc(messages(spaceId), {
    by: me.uid, byName: 'Asisten', at: serverTimestamp(), kind: 'bot', text: clip(answer.text),
    bot: { askedBy: me.name, question: question.slice(0, 200), ...(answer.title ? { title: answer.title.slice(0, 80) } : {}), ...(answer.hero ? { hero: answer.hero } : {}), ...(answer.lines?.length ? { lines: answer.lines.slice(0, 6) } : {}) },
  });
}
export async function deleteMessage(spaceId: string, id: string) { await deleteDoc(doc(database(), 'spaces', spaceId, 'messages', id)); }
/** Messages older than 90 days go (by whichever member opens the group). */
export async function tidyGroup(spaceId: string) {
  const old = await getDocs(query(messages(spaceId), where('at', '<', Timestamp.fromMillis(Date.now() - GROUP_KEEP_DAYS * 864e5)), limit(100))).catch(() => null);
  for (const d of old?.docs || []) await deleteDoc(d.ref).catch(() => {});
}

export { askedAssistant, unreadCount, mentionsIn, mentionQuery, splitMentions, readersOf, suggestionFits } from './space-math';

/** Read up to here (per person, per space, on this device): for the unread dot. */
const readKey = (uid: string, spaceId: string) => `dompet-ajaib:group-read:${uid}:${spaceId}`;
export function lastRead(uid: string, spaceId: string) { try { return Number(localStorage.getItem(readKey(uid, spaceId)) || 0); } catch { return 0; } }
export function markRead(uid: string, spaceId: string, at = Date.now()) { try { localStorage.setItem(readKey(uid, spaceId), String(at)); } catch { /* only a convenience */ } }
/** Whether the group of a space is on screen now (then the bell does not repeat its messages). */
let viewing = '';
export function setViewingGroup(spaceId: string) { viewing = spaceId; }
export const viewingGroup = () => viewing;

/** 9.3 Up to where each member has read the group (uid → time), for "dibaca". */
export function subscribeReads(spaceId: string, onValue: (reads: Record<string, number>) => void): Unsubscribe {
  return onSnapshot(collection(database(), 'spaces', spaceId, 'reads'),
    snap => onValue(Object.fromEntries(snap.docs.map(d => [d.id, (d.data({ serverTimestamps: 'estimate' }).at as Timestamp | undefined)?.toMillis?.() || 0]))), () => onValue({}));
}
export async function markReadForAll(spaceId: string, me: Me) {
  await setDoc(doc(database(), 'spaces', spaceId, 'reads', me.uid), { at: serverTimestamp(), name: me.name });
}

/** Opens the chat on a space's group (from the bell). */
export const OPEN_GROUP = 'dompet-ajaib:open-group';
/** Opens the group (from the bell), optionally with a message ready to send (9.4: "Colek"); the person sends it. */
export function openGroup(draft = '') { try { window.dispatchEvent(new CustomEvent(OPEN_GROUP, { detail: { draft } })); } catch { /* not in a browser */ } }
