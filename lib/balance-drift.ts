import { effects } from './accounting.ts';
import type { LedgerTx, Wallet } from './types';

/**
 * 10.7 A wallet's stored balance should always be its opening balance plus every transaction that touches it. A save
 * that reached the cloud twice (before 10.7's guard in firestore.rules) or an interrupted change can leave them apart;
 * "Hitung ulang saldo" lines them up again. This finds the wallets to point the person to (nothing is changed here).
 */
export type Drift = { walletId: string; name: string; stored: number; calculated: number; difference: number };

export function balanceDrifts(wallets: Wallet[], ledger: LedgerTx[]): Drift[] {
  const sums = new Map<string, number>();
  for (const tx of ledger) for (const [id, delta] of Object.entries(effects(tx))) sums.set(id, (sums.get(id) || 0) + delta);
  return wallets
    .filter(w => !w.isDeleted && Number.isFinite(w.cachedBalance))
    .map(w => { const calculated = (Number(w.openingBalance) || 0) + (sums.get(w.id) || 0); return { walletId: w.id, name: w.name, stored: w.cachedBalance, calculated, difference: w.cachedBalance - calculated }; })
    .filter(d => d.difference !== 0);
}

/** The same drifts seen twice (a moment apart) are real; one seen once may be a change still arriving from another device. */
export function steadyDrifts(first: Drift[], second: Drift[]): Drift[] {
  return second.filter(d => first.some(e => e.walletId === d.walletId && e.difference === d.difference));
}
