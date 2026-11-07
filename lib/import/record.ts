/**
 * 8.7 Saving imported statement rows: recorded now (a transaction, or a new receivable or debt with its opening move), or
 * kept as drafts in Perlu dikonfirmasi. Each save is returned so the person can delete it again from the result list.
 */
import { addImportedDrafts, createDebt, createReceivable, deleteOpeningRecord, deleteTransaction, dismissDraft, newTx, upsertTransaction } from '../firestore';
import { txTypeOf, type FinalRow } from './edit';
export { fromDraft } from './edit';

export type Saved = { kind: 'tx' | 'receivables' | 'debts' | 'draft'; id: string; name: string; amount: number; date: string; direction: 'in' | 'out' };

/** Records one complete row now (its wallet balance changes). With a draft id, that waiting draft is used up by it. */
export async function recordRow(uid: string, r: FinalRow, draftId?: string): Promise<Saved> {
  const base = { name: r.name, amount: r.amount, date: r.date, direction: r.direction };
  if (r.purpose === 'receivable_issue' || r.purpose === 'borrowing') {
    const id = r.purpose === 'receivable_issue'
      ? await createReceivable(uid, { person: r.person || r.name, description: r.name, originalAmount: r.amount, sourceWalletId: r.walletId, date: r.date, dueDate: '', status: 'open' })
      : await createDebt(uid, { name: r.person || r.name, provider: r.person || r.name, originalAmount: r.amount, dueDate: '', interestRate: 0, installmentAmount: 0, notes: `Dari mutasi: ${r.description}`.slice(0, 300) }, r.walletId, r.date);
    if (draftId) await dismissDraft(uid, draftId);
    return { kind: r.purpose === 'receivable_issue' ? 'receivables' : 'debts', id, ...base };
  }
  const id = await upsertTransaction(uid, newTx({ type: txTypeOf(r), amount: r.amount, walletId: r.walletId, destinationWalletId: r.destinationWalletId, categoryId: r.categoryId, subcategoryId: r.subcategoryId, date: r.date, description: r.name, notes: r.description ? `Mutasi: ${r.description}`.slice(0, 300) : '', debtId: r.debtId, receivableId: r.receivableId, draftId: draftId || null }));
  return { kind: 'tx', id, ...base };
}

/** Rows kept as drafts in Perlu dikonfirmasi, with what was chosen so far (purpose, person, debt or receivable). */
export async function draftRows(uid: string, rows: FinalRow[], likeText: (r: FinalRow) => string | undefined): Promise<Saved[]> {
  await addImportedDrafts(uid, rows.map(r => ({
    id: r.id, date: r.date, flow: txTypeOf(r), amount: r.amount, walletId: r.walletId, destinationWalletId: r.destinationWalletId, categoryId: r.categoryId, subcategoryId: r.subcategoryId, name: r.name, description: r.description,
    ...(r.maybe && !r.notDouble ? { maybeDuplicate: likeText(r) } : {}), ...(r.purpose ? { purpose: r.purpose } : {}), ...(r.person ? { person: r.person } : {}),
    ...(r.debtId ? { debtId: r.debtId } : {}), ...(r.receivableId ? { receivableId: r.receivableId } : {}),
  })));
  return rows.map(r => ({ kind: 'draft', id: r.id, name: r.name, amount: r.amount, date: r.date, direction: r.direction }));
}

/** Takes a save back: the transaction, the receivable or debt (with its opening move), or the waiting draft. */
export async function undoSaved(uid: string, s: Saved) {
  if (s.kind === 'tx') return deleteTransaction(uid, s.id);
  if (s.kind === 'draft') return dismissDraft(uid, s.id);
  return deleteOpeningRecord(uid, s.kind, s.id);
}
