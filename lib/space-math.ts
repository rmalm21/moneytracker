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

/** 9.2 "@asisten uang bersama berapa?" → the question for the assistant (any case, also "@bot", "@dompet" and "@asisten,"). */
export function askedAssistant(text: string): string | null {
  const m = text.trim().match(/^@(asisten|bot|dompet)\b[\s,:]*(.*)$/is);
  return m ? m[2].trim() : null;
}
/** 9.2 Group messages from others that came after the last read. */
export const unreadCount = (list: { by: string; at?: { toMillis?: () => number } }[], uid: string, since: number) =>
  list.filter(m => m.by !== uid && (m.at?.toMillis?.() || 0) > since).length;
