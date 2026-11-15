/**
 * 10.3.2 The links into Transaksi ("Lihat transaksi", "Rapikan", an Insight card, a chat answer…) carry a focus like
 * `category:food@2026-11-12..2026-12-12`: a filter, then the period that was on screen. One reading of it, shared by the
 * Transaksi page and the list that opens in place over any page, so both always show the same transactions.
 *   category:<id>   a category with its subcategories ("uncategorized": spending without one)
 *   nosub:<id>      in that category without a subcategory (10.3.1 "Rapikan")
 *   type:<type>     Keluar / Masuk / Transfer by how money moves, or one exact kind
 *   wallet:<id>     money out of or into that wallet
 *   tx:<id>,<id>    exactly these transactions (what a card was built from)
 *   search:<text>   the search box
 */
import { moneyGroup, transactionExpense } from './accounting.ts';
import { lacksSub } from './subcategory-hint.ts';
import { walletLabel } from './wallet-delete.ts';
import type { Category, LedgerTx, Wallet } from './types';

export type TxFocus = { type: string; walletId: string; categoryId: string; noSub: string; txIds: string[]; search: string; range?: { start: string; end: string } };

/** The filter a focus asks for (everything else open), and the period it came from when it has one. */
export function readFocus(raw: string | undefined, categories: Pick<Category, 'id' | 'type' | 'parentId'>[]): TxFocus {
  const [focus = '', period = ''] = (raw || '').split('@'), [start, end] = period.split('..');
  const value = (prefix: string) => focus.startsWith(prefix) ? focus.slice(prefix.length) : '';
  // A category (or its missing subcategories) opens on its own side: income for income categories, spending otherwise.
  const catId = value('category:') || value('nosub:');
  const main = (() => { const c = categories.find(x => x.id === catId); return c?.parentId ? categories.find(x => x.id === c.parentId) || c : c; })();
  return {
    type: value('type:') || (catId ? main?.type === 'income' ? 'income' : 'expense' : 'all'),
    walletId: value('wallet:'), categoryId: value('category:'), noSub: value('nosub:'),
    txIds: value('tx:').split(',').filter(Boolean), search: value('search:'),
    ...(start && end && start < end ? { range: { start, end } } : {}),
  };
}

/** Does this transaction pass the filter? `query` is the lowercased search text. */
export function matchesFocus(t: LedgerTx, f: Omit<TxFocus, 'search' | 'range'> & { query: string }, categories: Pick<Category, 'id' | 'name' | 'parentId'>[], wallets: Pick<Wallet, 'id' | 'name' | 'isDeleted'>[]): boolean {
  // Keluar / Masuk / Transfer follow the money (bayar utang is money out, piutang kembali and uang pinjaman are money in); other kinds match exactly.
  if (f.type !== 'all' && (f.type === 'expense' ? moneyGroup(t.type) !== 'out' : f.type === 'income' ? moneyGroup(t.type) !== 'in' : f.type === 'transfer' ? moneyGroup(t.type) !== 'move' : t.type !== f.type)) return false;
  // `tx:` links (from Insight) show exactly the transactions a card was built from.
  if (f.txIds.length && !f.txIds.includes(t.id)) return false;
  if (f.walletId && t.walletId !== f.walletId && t.destinationWalletId !== f.walletId) return false;
  if (f.noSub && !lacksSub(t, f.noSub)) return false;
  const ids = [t.categoryId, t.subcategoryId, t.transferFeeCategoryId, ...(t.splits || []).flatMap(line => [line.categoryId, line.subcategoryId])];
  if (f.categoryId === 'uncategorized' ? transactionExpense(t) <= 0 || Boolean(t.categoryId) || (t.splits || []).some(line => line.categoryId)
    : f.categoryId && !ids.some(id => id === f.categoryId || categories.find(c => c.id === id)?.parentId === f.categoryId)) return false;
  if (!f.query) return true;
  const names = ids.map(id => categories.find(c => c.id === id)?.name || '');
  const wallet = (id: string | null | undefined) => id ? walletLabel(wallets.find(w => w.id === id)) : '';
  const text = [t.description, t.merchant, t.notes, t.amount, t.tags?.join(' ') || '', wallet(t.walletId), t.destinationWalletId ? wallet(t.destinationWalletId) : undefined, ...names].join(' ').toLocaleLowerCase('id-ID');
  return text.includes(f.query);
}

/** A short title for what a focus shows ("Tagihan · tanpa subkategori", "Makan & Minum", "3 transaksi pilihan"). */
export function focusTitle(f: TxFocus, categories: Pick<Category, 'id' | 'name'>[], wallets: Pick<Wallet, 'id' | 'name'>[], typeLabel: (type: string) => string): string {
  const cat = (id: string) => categories.find(c => c.id === id)?.name;
  if (f.noSub) return `${cat(f.noSub) || 'Kategori'} · tanpa subkategori`;
  if (f.categoryId) return f.categoryId === 'uncategorized' ? 'Tanpa kategori' : cat(f.categoryId) || 'Kategori';
  if (f.txIds.length) return f.txIds.length === 1 ? 'Transaksinya' : `${f.txIds.length} transaksi pilihan`;
  if (f.walletId) return wallets.find(w => w.id === f.walletId)?.name || 'Dompet';
  if (f.search) return `“${f.search}”`;
  if (f.type !== 'all') return typeLabel(f.type);
  return 'Transaksi';
}
