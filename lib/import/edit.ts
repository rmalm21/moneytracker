/**
 * 8.7 Imported statement rows as the person edits them before saving.
 *
 * Each row can be renamed, given another amount or date, a category, or a purpose: money out paid for something, lent
 * to someone (a new receivable), paid back on a debt, or moved to another of the person's wallets; money in as income,
 * a receivable paid back, a loan received (a new debt), or a move from another wallet. A transfer to or from a person
 * has no purpose until the person picks one. A row is recorded now only when nothing is missing; otherwise it waits in
 * Perlu dikonfirmasi as a draft. Nothing here saves anything.
 */
import type { Debt, Draft, Receivable, TxType } from '../types';
import type { ImportItem } from './statement.ts';

export type Purpose = 'expense' | 'income' | 'transfer' | 'receivable_issue' | 'borrowing' | 'debt_payment' | 'receivable_payment';
export const PURPOSES: Record<'out' | 'in', { key: Purpose; label: string }[]> = {
  out: [{ key: 'expense', label: 'Bayar sesuatu' }, { key: 'receivable_issue', label: 'Pinjamkan (piutang)' }, { key: 'debt_payment', label: 'Bayar utang' }, { key: 'transfer', label: 'Ke dompet sendiri' }],
  in: [{ key: 'income', label: 'Pemasukan' }, { key: 'receivable_payment', label: 'Pelunasan piutang' }, { key: 'borrowing', label: 'Pinjam (utang)' }, { key: 'transfer', label: 'Dari dompet sendiri' }],
};
export const purposeLabel = (p: Purpose, direction: 'in' | 'out') => PURPOSES[direction].find(x => x.key === p)?.label || '';

export type RowEdit = {
  name?: string; amount?: number; date?: string; purpose?: Purpose;
  categoryId?: string | null; subcategoryId?: string | null;
  /** The other wallet of a move (where it went, or where it came from). */
  otherWalletId?: string;
  debtId?: string; receivableId?: string; person?: string;
  /** Not a double after all (the person checked). */
  notDouble?: boolean;
};

export type FinalRow = {
  id: string; date: string; amount: number; name: string; description: string;
  direction: 'in' | 'out'; purpose: Purpose | null;
  walletId: string; destinationWalletId: string | null;
  categoryId: string | null; subcategoryId: string | null;
  debtId: string | null; receivableId: string | null; person: string | null;
  maybe?: ImportItem['maybe']; notDouble?: boolean;
};

/** The row as it will be saved: the reading of the file with the person's changes on top. */
export function finalize(item: ImportItem, edit: RowEdit = {}, walletId: string): FinalRow {
  const direction = item.type === 'income' ? 'in' : 'out';
  // A transfer with a person waits for its purpose; anything else keeps what the reader chose.
  const purpose: Purpose | null = edit.purpose ?? (item.person ? null : item.flow as Purpose);
  const other = edit.otherWalletId ?? (direction === 'out' ? item.destinationWalletId : item.walletId !== walletId ? item.walletId : '') ?? '';
  const move = purpose === 'transfer';
  return {
    id: item.id, date: edit.date || item.date, amount: edit.amount && edit.amount > 0 ? Math.round(edit.amount) : item.amount,
    name: (edit.name ?? item.name).trim() || item.name, description: item.description, direction, purpose,
    walletId: move && direction === 'in' ? other || '' : walletId,
    destinationWalletId: move ? (direction === 'out' ? other || null : walletId) : null,
    categoryId: purpose === 'expense' || purpose === 'income' ? (edit.categoryId !== undefined ? edit.categoryId : item.categoryId) : null,
    subcategoryId: purpose === 'expense' || purpose === 'income' ? (edit.categoryId !== undefined ? edit.subcategoryId ?? null : item.subcategoryId) : null,
    debtId: purpose === 'debt_payment' ? edit.debtId || null : null,
    receivableId: purpose === 'receivable_payment' ? edit.receivableId || null : null,
    person: (edit.person ?? item.person ?? '').trim() || null,
    ...(item.maybe ? { maybe: item.maybe } : {}), ...(edit.notDouble ? { notDouble: true } : {}),
  };
}

/** What is still needed before the row can be recorded now (it can always wait as a draft). */
export function missing(r: FinalRow): string | null {
  if (!r.purpose) return 'Pilih untuk apa';
  if ((r.purpose === 'expense' || r.purpose === 'income') && !r.categoryId) return 'Pilih kategori';
  if (r.purpose === 'transfer' && (!r.walletId || !r.destinationWalletId || r.walletId === r.destinationWalletId)) return r.direction === 'out' ? 'Pilih dompet tujuan' : 'Pilih dompet asal';
  if (r.purpose === 'debt_payment' && !r.debtId) return 'Pilih utangnya';
  if (r.purpose === 'receivable_payment' && !r.receivableId) return 'Pilih piutangnya';
  if ((r.purpose === 'receivable_issue' || r.purpose === 'borrowing') && !r.person) return 'Isi nama orangnya';
  if (r.maybe && !r.notDouble) return 'Mungkin dobel';
  return null;
}

/** The transaction type a row is recorded or drafted as (a new loan either way stays money out or in until recorded). */
export function txTypeOf(r: FinalRow): TxType {
  if (r.purpose === 'transfer' || r.purpose === 'debt_payment' || r.purpose === 'receivable_payment') return r.purpose;
  if (r.purpose === 'income' || r.purpose === 'borrowing') return 'income';
  if (r.purpose === 'expense' || r.purpose === 'receivable_issue') return 'expense';
  return r.direction === 'in' ? 'income' : 'expense';
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 3 && !/^(?:pak|bu|bapak|ibu|mas|mbak|kak|bang|om|tante)$/.test(w));
const samePerson = (a: string, b: string) => { const x = words(a), y = new Set(words(b)); return x.length > 0 && x.some(w => y.has(w)); };
/** An open debt or receivable with this person, to suggest "Bayar utang ke Andi" or "Andi melunasi piutang". */
export function suggestFor(person: string | null | undefined, direction: 'in' | 'out', debts: Pick<Debt, 'id' | 'name' | 'provider' | 'status' | 'outstandingAmount'>[], receivables: Pick<Receivable, 'id' | 'person' | 'status' | 'remainingAmount'>[]) {
  if (!person) return {};
  const debt = direction === 'out' ? debts.find(d => d.status !== 'paid' && d.outstandingAmount > 0 && (samePerson(person, d.name) || samePerson(person, d.provider))) : undefined;
  const receivable = direction === 'in' ? receivables.find(r => r.status !== 'paid' && r.remainingAmount > 0 && samePerson(person, r.person)) : undefined;
  return { ...(debt ? { debtId: debt.id, purpose: 'debt_payment' as const } : {}), ...(receivable ? { receivableId: receivable.id, purpose: 'receivable_payment' as const } : {}) };
}

/** A waiting imported draft as a row to record (8.5/8.6 drafts have no purpose: their type says it). */
export function fromDraft(d: Draft): FinalRow {
  const purpose = (d.purpose ?? (d.person ? null : d.type)) as Purpose | null;
  const direction = d.type === 'income' || d.type === 'receivable_payment' || d.purpose === 'borrowing' || d.purpose === 'income' ? 'in' : 'out';
  return {
    id: d.id, date: d.plannedDate, amount: d.amount, name: d.name, description: d.note || '', direction, purpose,
    walletId: d.walletId, destinationWalletId: d.destinationWalletId, categoryId: d.categoryId, subcategoryId: d.subcategoryId || null,
    debtId: d.debtId || null, receivableId: d.receivableId || null, person: d.person || null,
    ...(d.maybeDuplicate ? { maybe: { name: d.maybeDuplicate, date: d.plannedDate, amount: d.amount, walletId: d.walletId, why: 'date' as const } } : {}),
  };
}
