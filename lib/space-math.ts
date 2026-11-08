/** 9.0 Ruang Bersama arithmetic with no Firebase in it (tested in tests/spaces.test.mjs). */
import type { LedgerTx } from './types';
import type { Space } from './space-profile';

/** Equal shares that add up exactly (the remainder goes to the first people). */
export function equalShares(total: number, people: string[]) {
  const base = Math.floor(total / people.length), extra = total - base * people.length;
  return Object.fromEntries(people.map((uid, i) => [uid, base + (i < extra ? 1 : 0)]));
}

/** Who owes whom, after netting both ways (largest first). */
export function balances(space: Space): { from: string; to: string; amount: number }[] {
  const owed = (space as Space & { owed?: Record<string, Record<string, number>> }).owed || {};
  const ids = [...new Set([...Object.keys(owed), ...Object.values(owed).flatMap(o => Object.keys(o || {}))])].sort();
  const out: { from: string; to: string; amount: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], net = (owed[a]?.[b] || 0) - (owed[b]?.[a] || 0);
    if (net > 0) out.push({ from: a, to: b, amount: net }); else if (net < 0) out.push({ from: b, to: a, amount: -net });
  }
  return out.sort((x, y) => y.amount - x.amount);
}

/** The deleted transaction as it can be saved again (a new one: links to a schedule's draft or a plan are not reused). */
export function restorable(before: Partial<LedgerTx>): LedgerTx {
  const { id: _id, draftId: _d, plannedId: _p, createdBy: _cb, createdByName: _cn, updatedBy: _ub, updatedByName: _un, ...rest } = before;
  return { ...rest, id: '', draftId: null, plannedId: null } as LedgerTx;
}

/**
 * 9.2/9.3 "@asisten uang bersama berapa?" → the question for the assistant (any case, also "@bot" and "@dompet"),
 * anywhere in the message ("@Dina @asisten sisa kas berapa?"). Other @names are left out of the question.
 */
export function askedAssistant(text: string): string | null {
  if (!/(?:^|\s)@(?:asisten|bot|dompet)(?![\p{L}\p{N}])/iu.test(text)) return null;
  return text.replace(/(?:^|\s)@[\p{L}\p{N}_.-]+/gu, ' ').replace(/^[\s,:]+/, '').replace(/\s+/g, ' ').trim();
}

type Member = { uid: string; name: string };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The ways a member can be tagged: "@Bejo Santoso" or "@Bejo" (longest first). */
const tagsOf = (m: Member) => [...new Set([m.name.trim(), m.name.trim().split(/\s+/)[0]].filter(Boolean))];
/** 9.3 Members tagged in a message ("@bejo ntar transfer ya" → Bejo), any case. */
export function mentionsIn(text: string, members: Member[]): string[] {
  return members.filter(m => tagsOf(m).some(t => new RegExp(`(?:^|\\s)@${esc(t)}(?![\\p{L}\\p{N}])`, 'iu').test(text))).map(m => m.uid);
}
/** 9.3 The "@…" being typed where the cursor is, for the suggestions: its start and what follows the @. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = text.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u);
  return m ? { start: caret - m[1].length - 1, query: m[1].toLocaleLowerCase('id-ID') } : null;
}
/**
 * 9.3 Whether what was typed after "@" fits a suggestion: the start of one of its words, or its letters in order from
 * the first ("ass" and "asis" → asisten, "bjo" → Bejo).
 */
export function suggestionFits(query: string, words: string[]) {
  const q = query.toLocaleLowerCase('id-ID');
  if (!q) return true;
  return words.map(w => w.toLocaleLowerCase('id-ID')).some(w => w.startsWith(q) || w.split(/\s+/).some(part => part.startsWith(q)) || (w[0] === q[0] && [...q].every((c => (ch: string) => (c = w.indexOf(ch, c) + 1) > 0)(0))));
}
/** 9.3 Pieces of a message with the tags marked (for showing "@Bejo" in colour). */
export function splitMentions(text: string, names: string[]): { text: string; tag: boolean }[] {
  const all = [...new Set(['asisten', 'bot', 'dompet', ...names.flatMap(n => tagsOf({ uid: '', name: n }))])].sort((x, y) => y.length - x.length);
  const re = new RegExp(`(^|\\s)(@(?:${all.map(esc).join('|')}))(?![\\p{L}\\p{N}])`, 'giu');
  const out: { text: string; tag: boolean }[] = []; let last = 0;
  for (const m of text.matchAll(re)) {
    const at = (m.index || 0) + m[1].length;
    if (at > last) out.push({ text: text.slice(last, at), tag: false });
    out.push({ text: m[2], tag: true }); last = at + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), tag: false });
  return out;
}
/** 9.3 Who (other than the writer) has read up to a message, from each member's last read time. */
export const readersOf = (at: number, by: string, memberIds: string[], reads: Record<string, number>) =>
  memberIds.filter(id => id !== by && (reads[id] || 0) >= at);
/** 9.2 Group messages from others that came after the last read. */
export const unreadCount = (list: { by: string; at?: { toMillis?: () => number } }[], uid: string, since: number) =>
  list.filter(m => m.by !== uid && (m.at?.toMillis?.() || 0) > since).length;
