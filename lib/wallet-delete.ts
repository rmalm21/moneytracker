/**
 * Hapus dompet without losing history. Every transaction of the wallet stays exactly as it is (in Transaksi, reports and
 * linked records); only the wallet leaves the app: lists, totals, choices and the archive. Its record is kept, marked
 * deleted, so old transactions can still name it ("SeaBank (dihapus)"). A wallet that was never used is removed whole.
 *
 * Refused only while an active schedule (Jadwal rutin) would keep posting to it. Planned transactions lose the wallet
 * (they allow none), Tujuan dana and kantong forget it, pending drafts of it go.
 */
import type { Data, LedgerTx, Wallet } from './types.ts';

export type WalletDeletePlan = {
  /** Transactions that keep pointing at the wallet (kept, untouched). */
  kept: number;
  /** Nothing uses the wallet: its record can be removed whole. */
  unused: boolean;
  blockers: string[];
  plans: string[]; funds: string[]; drafts: string[];
};

export function walletDeletePlan(wallet: Pick<Wallet, 'id'>, data: Pick<Data, 'recurring' | 'plannedTransactions' | 'funds' | 'drafts' | 'claims' | 'receivables'>, txs: Pick<LedgerTx, 'walletId' | 'destinationWalletId'>[]): WalletDeletePlan {
  const id = wallet.id;
  const kept = txs.filter(tx => tx.walletId === id || tx.destinationWalletId === id).length;
  const schedules = data.recurring.filter(r => r.active !== false && (r.walletId === id || r.destinationWalletId === id));
  const blockers = schedules.length ? [`${schedules.length} jadwal rutin aktif (${schedules.slice(0, 3).map(r => r.name).join(', ')})`] : [];
  const plans = data.plannedTransactions.filter(p => p.walletId === id && p.status === 'planned').map(p => p.id);
  const funds = data.funds.filter(f => f.linkedWalletId === id || f.walletIds?.includes(id)).map(f => f.id);
  const drafts = data.drafts.filter(d => d.status === 'pending' && (d.walletId === id || d.destinationWalletId === id)).map(d => d.id);
  const referenced = data.recurring.some(r => r.walletId === id || r.destinationWalletId === id) || data.plannedTransactions.some(p => p.walletId === id)
    || data.claims.some(c => c.sourceWalletId === id) || data.receivables.some(r => r.sourceWalletId === id) || funds.length > 0;
  return { kept, unused: kept === 0 && !referenced, blockers, plans, funds, drafts };
}

/** The name of a wallet for old transactions: deleted ones say so. */
export const walletLabel = (wallet?: Pick<Wallet, 'name' | 'isDeleted'> | null) => wallet ? (wallet.isDeleted ? `${wallet.name} (dihapus)` : wallet.name) : 'Dompet terhapus';
