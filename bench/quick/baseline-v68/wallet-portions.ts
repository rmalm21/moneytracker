/**
 * Isi dompet: one account, its money told apart. A wallet can hold parts that are not free to spend:
 *
 *   titipan     money of someone else passing through (dana bisnis, uang arisan, transfer titipan). Not yours: left out
 *               of Uang Bebas and of Aset bersih.
 *   disisihkan  yours, set aside inside the same account (dana darurat, bayar kos). Counted in Aset bersih, not in Uang Bebas.
 *
 * The rest of the balance is "Uangku". The wallet's balance itself never changes: it stays what the bank shows.
 *
 * A part's amount is its base (what was set when it was made or last adjusted) plus every transaction tagged to it:
 * `portionFrom` names the part of `walletId` the money leaves (spending, transfer out) or enters (income), and
 * `portionTo` the part of `destinationWalletId` a transfer enters. It is derived, so editing or deleting a transaction
 * moves the part with it.
 */
import { effects } from './accounting.ts';
import type { LedgerTx, Wallet, WalletPortion } from './types.ts';

export const PORTION_KINDS: Record<WalletPortion['kind'], { label: string; hint: string }> = {
  titipan: { label: 'Titipan / dana transit', hint: 'Bukan uangmu, hanya lewat. Tidak dihitung sebagai uang bebas maupun aset bersih.' },
  disisihkan: { label: 'Disisihkan', hint: 'Uangmu, tapi jangan dipakai. Tetap masuk aset bersih, tidak masuk uang bebas.' },
};

type Tagged = Pick<LedgerTx, 'type' | 'amount' | 'walletId' | 'destinationWalletId' | 'transferFee' | 'adjustmentDirection' | 'portionFrom' | 'portionTo'>;

/** How much of a transaction moves one part of one wallet. */
export function portionDelta(tx: Tagged, walletId: string, portionId: string) {
  let n = 0;
  if (tx.walletId === walletId && tx.portionFrom === portionId) n += effects(tx as LedgerTx)[walletId] || 0;
  if (tx.destinationWalletId === walletId && tx.portionTo === portionId) n += tx.amount;
  return n;
}

export type PortionView = WalletPortion & { amount: number };
export type WalletSplit = { total: number; own: number; parts: PortionView[]; titipan: number; kept: number; short: boolean };

/** Sum of the tagged transactions of one part (to set a new amount: base = wanted − this). */
export const portionMoved = (walletId: string, portionId: string, txs: Tagged[]) => txs.reduce((n, tx) => n + portionDelta(tx, walletId, portionId), 0);

/** The wallet's balance told apart: each part with its current amount, and what is left as Uangku. */
export function walletSplit(wallet: Pick<Wallet, 'id' | 'cachedBalance' | 'portions'>, txs: Tagged[]): WalletSplit {
  const parts = (wallet.portions || []).map(p => ({ ...p, amount: p.base + portionMoved(wallet.id, p.id, txs) }));
  const titipan = parts.filter(p => p.kind === 'titipan').reduce((n, p) => n + Math.max(0, p.amount), 0);
  const kept = parts.filter(p => p.kind === 'disisihkan').reduce((n, p) => n + Math.max(0, p.amount), 0);
  const own = wallet.cachedBalance - titipan - kept;
  return { total: wallet.cachedBalance, own, parts, titipan, kept, short: own < 0 };
}

/** Wallets as the person owns them: balances without titipan (for Aset bersih and Insight); parts set aside stay in. */
export function ownedWallets<T extends Pick<Wallet, 'id' | 'cachedBalance' | 'portions'>>(wallets: T[], txs: Tagged[]): T[] {
  return wallets.map(w => w.portions?.length ? { ...w, cachedBalance: w.cachedBalance - walletSplit(w, txs).titipan } : w);
}
