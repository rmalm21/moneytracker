/**
 * 9.0 Laporan bersama: what each member put into a Ruang Bersama in a period. A contribution is money of their own
 * that went to the space: deposits (minus what they took out), shared spending they paid "untuk bersama", and their
 * own share of what was split. Paying a member back (Lunasi) only settles a split, so it is not counted again.
 */
import type { LedgerTx } from './types';

export type MemberLine = { uid: string; name: string; deposited: number; withdrew: number; paidTogether: number; splitPaid: number; splitShare: number; contributed: number; recorded: number };
export function contributions(items: LedgerTx[], names: Record<string, string>) {
  const lines = new Map<string, MemberLine>();
  const line = (uid: string) => { let l = lines.get(uid); if (!l) { l = { uid, name: names[uid] || 'Anggota', deposited: 0, withdrew: 0, paidTogether: 0, splitPaid: 0, splitShare: 0, contributed: 0, recorded: 0 }; lines.set(uid, l); } return l; };
  for (const uid of Object.keys(names)) line(uid);
  let sharedSpend = 0;
  for (const t of items) {
    if (t.createdBy) line(t.createdBy).recorded++;
    const f = t.memberFlow;
    if (t.type === 'expense' && f?.kind !== 'withdrawal') sharedSpend += t.amount;
    if (!f) continue;
    if (f.kind === 'deposit') line(f.uid).deposited += t.amount;
    else if (f.kind === 'withdrawal') line(f.uid).withdrew += t.amount;
    else if (f.kind === 'paid') line(f.uid).paidTogether += t.amount;
    else if (f.kind === 'split') { line(f.uid).splitPaid += t.amount; for (const [uid, share] of Object.entries(f.shares || {})) line(uid).splitShare += share; }
  }
  for (const l of lines.values()) l.contributed = l.deposited - l.withdrew + l.paidTogether + l.splitShare;
  const list = [...lines.values()].sort((a, b) => b.contributed - a.contributed);
  const total = list.reduce((n, l) => n + Math.max(0, l.contributed), 0);
  return { lines: list, total, sharedSpend };
}
