/**
 * Chat history and settings, kept on this device only (localStorage, per account): nothing is uploaded. Messages older
 * than the chosen time (7 days by default, or 14 days / 1 month) are dropped whenever the chat is read or written.
 */
import type { ChatMemory, ChatReply } from './engine.ts';
import type { Voice } from './voice.ts';

export type ChatStatus = 'pending' | 'saved' | 'dismissed' | 'replaced' | 'form';
export type ChatMessage = {
  id: string; at: number; role: 'user' | 'bot'; text: string;
  /** Bot: what was answered. A `plan` reply is read again by Catat otomatis while it is still pending. */
  reply?: ChatReply; status?: ChatStatus;
  /** Bot: what was saved from this reply ("Pengeluaran Rp45.000 tersimpan."). */
  summary?: string;
  /** Bot: an answer to a question (nothing to save or drop). */
  asked?: boolean;
};
export type ChatStyle = 'lembar' | 'penuh' | 'jendela' | 'samping' | 'kaca';
export type KeepDays = 7 | 14 | 30;
export type ChatSettings = {
  keepDays: KeepDays; style: ChatStyle; /** The style was picked by the person (the first opening asks). */ picked: boolean;
  /** How the assistant talks. */ voice: Voice;
  /** Phrases learned from this person (what they wrote → the message that meant it), at most 60. */ learned: Record<string, string>;
  /** The suggestion strip above the message box is open (it can be minimized). */ tray: boolean;
  /** The chat was opened once (the button stops glowing). */ seen: boolean;
};

export const CHAT_STYLES: { key: ChatStyle; name: string; note: string }[] = [
  { key: 'lembar', name: 'Lembar bawah', note: 'Naik dari bawah, layar di belakang tetap terlihat' },
  { key: 'penuh', name: 'Layar penuh', note: 'Seperti aplikasi chat, paling lega' },
  { key: 'jendela', name: 'Jendela mengambang', note: 'Kotak kecil di atas tombol chat' },
  { key: 'samping', name: 'Panel samping', note: 'Muncul dari kanan, setinggi layar' },
  { key: 'kaca', name: 'Kaca ringkas', note: 'Transparan dan ringan, gelembung membulat' },
];
export const KEEP_OPTIONS: { days: KeepDays; label: string }[] = [{ days: 7, label: '7 hari' }, { days: 14, label: '14 hari' }, { days: 30, label: '1 bulan' }];
/** Messages shown at once; "Muat lebih banyak" adds this many again. */
export const PAGE = 10;
const MAX = 400, DAY = 86_400_000;
export const DEFAULT_SETTINGS: ChatSettings = { keepDays: 7, style: 'lembar', picked: false, voice: 'santai', learned: {}, tray: true, seen: false };
const VOICES = ['santai', 'sopan', 'singkat', 'gaul'];
/** A phrase learned, keeping only the latest 60. */
export function learnPhrase(learned: Record<string, string>, phrase: string, as: string) {
  const next = { ...learned }; delete next[phrase]; next[phrase] = as;
  const keys = Object.keys(next); for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete next[k];
  return next;
}

const key = (uid: string, part: string) => `dompet-ajaib:chat:${part}:${uid}`;

/** Only what is younger than the chosen time, at most the last 400. */
export function prune(messages: ChatMessage[], keepDays: KeepDays, now = Date.now()): ChatMessage[] {
  return messages.filter(m => now - m.at <= keepDays * DAY).slice(-MAX);
}
/** The last `shown` messages, and whether older ones are left. */
export function page(messages: ChatMessage[], shown: number) {
  return { visible: messages.slice(-shown), more: messages.length > shown, hidden: Math.max(0, messages.length - shown) };
}

export function loadSettings(uid: string): ChatSettings {
  try { const s = JSON.parse(localStorage.getItem(key(uid, 'settings')) || 'null'); if (s && typeof s === 'object') return { ...DEFAULT_SETTINGS, ...s, keepDays: [7, 14, 30].includes(s.keepDays) ? s.keepDays : 7, style: CHAT_STYLES.some(x => x.key === s.style) ? s.style : 'lembar', voice: VOICES.includes(s.voice) ? s.voice : 'santai', learned: s.learned && typeof s.learned === 'object' ? s.learned : {} }; } catch { /* private window */ }
  return DEFAULT_SETTINGS;
}
export function saveSettings(uid: string, settings: ChatSettings) { try { localStorage.setItem(key(uid, 'settings'), JSON.stringify(settings)); } catch { /* storage full or blocked */ } }

export function loadChat(uid: string, keepDays: KeepDays): { messages: ChatMessage[]; memory: ChatMemory } {
  try {
    const s = JSON.parse(localStorage.getItem(key(uid, 'history')) || 'null');
    if (s && Array.isArray(s.messages)) { const messages = prune(s.messages, keepDays); return { messages, memory: messages.length ? s.memory || {} : {} }; }
  } catch { /* private window */ }
  return { messages: [], memory: {} };
}
export function saveChat(uid: string, messages: ChatMessage[], memory: ChatMemory, keepDays: KeepDays) {
  try { localStorage.setItem(key(uid, 'history'), JSON.stringify({ messages: prune(messages, keepDays), memory })); } catch { /* storage full or blocked */ }
}
export function clearChat(uid: string) { try { localStorage.removeItem(key(uid, 'history')); } catch { /* blocked */ } }
