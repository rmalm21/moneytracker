import type { Wallet } from './types';

/** Wallets are shown in three groups. Older wallets without a group get one from their type and settings. */
export type WalletGroup = 'operational' | 'savings' | 'investment';
export const walletGroups: { key: WalletGroup; label: string; hint: string }[] = [
  { key: 'operational', label: 'Operasional', hint: 'Untuk kebutuhan dan belanja sehari-hari' },
  { key: 'savings', label: 'Tabungan', hint: 'Disisihkan dan disimpan' },
  { key: 'investment', label: 'Investasi', hint: 'Reksa dana, saham, emas, dan lainnya' },
];
export function walletGroup(wallet: Pick<Wallet, 'type' | 'isReserved'> & { group?: WalletGroup }): WalletGroup {
  if (wallet.group) return wallet.group;
  if (wallet.type === 'investment') return 'investment';
  if (wallet.type === 'savings' || wallet.isReserved) return 'savings';
  return 'operational';
}
/** Sensible starting settings when a group is picked for a new wallet (still editable). */
export const groupDefaults: Record<WalletGroup, { isReserved: boolean; isSpendable: boolean }> = {
  operational: { isReserved: false, isSpendable: true },
  savings: { isReserved: true, isSpendable: false },
  investment: { isReserved: true, isSpendable: false },
};
