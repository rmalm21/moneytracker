/**
 * Savings pockets ("kantong"): a Tabungan wallet is split into named pockets such as Dana darurat,
 * Tabungan kuliah or Liburan. A pocket is a Tujuan dana linked to that wallet; its current amount
 * is the part of the wallet balance set aside for it. Money not in any pocket is "belum dialokasikan".
 */
import type { Fund, Wallet } from './types';

export const isEmergencyFund = (fund: Pick<Fund, 'kind' | 'name'>) => fund.kind ? fund.kind === 'emergency' : /darurat|emergency/i.test(fund.name);
export const pocketEmoji = (fund: Pick<Fund, 'icon' | 'kind' | 'name'>) => fund.icon || (isEmergencyFund(fund) ? '🛟' : /kuliah|sekolah|pendidikan/i.test(fund.name) ? '🎓' : /liburan|travel|trip/i.test(fund.name) ? '✈️' : /rumah|dp/i.test(fund.name) ? '🏠' : /nikah|wedding/i.test(fund.name) ? '💍' : '🎯');
export const pocketIcons = ['🛟', '🎓', '✈️', '🏠', '💍', '🚗', '👶', '🎁', '🏥', '💻', '📱', '🎯', '💰', '🕌', '🎉'];

export function walletPockets(wallet: Pick<Wallet, 'id' | 'cachedBalance'>, funds: Fund[]) {
  const pockets = funds.filter(f => !f.isArchived && f.linkedWalletId === wallet.id)
    .sort((a, b) => Number(isEmergencyFund(b)) - Number(isEmergencyFund(a)) || a.name.localeCompare(b.name));
  const allocated = pockets.reduce((n, f) => n + Math.max(0, f.currentAmount || 0), 0);
  const balance = Math.max(0, wallet.cachedBalance);
  return { pockets, allocated, unallocated: Math.max(0, balance - allocated), overAllocated: Math.max(0, allocated - balance), balance };
}

/** Emergency pockets across all wallets; `null` when the user has none (Insight then uses the old estimate). */
export function emergencyPockets(funds: Fund[]) {
  const list = funds.filter(f => !f.isArchived && isEmergencyFund(f));
  return list.length ? { list, total: list.reduce((n, f) => n + Math.max(0, f.currentAmount || 0), 0), target: list.reduce((n, f) => n + Math.max(0, f.targetAmount || 0), 0) } : null;
}
