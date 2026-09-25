/**
 * Kantong: a named group of wallets for one purpose, such as Dana darurat (Mandiri + BRI) or
 * Tabungan kuliah. A kantong is a Tujuan dana with `walletIds`; its amount is always the sum of
 * those wallets' balances, so money moved into them counts automatically. A wallet belongs to at
 * most one kantong. Tujuan dana without wallets keep their own recorded amount as before.
 */
import type { Fund, Wallet } from './types';

export const isEmergencyFund = (fund: Pick<Fund, 'kind' | 'name'>) => fund.kind ? fund.kind === 'emergency' : /darurat|emergency/i.test(fund.name);
export const pocketEmoji = (fund: Pick<Fund, 'icon' | 'kind' | 'name'>) => fund.icon || (isEmergencyFund(fund) ? '🛟' : /kuliah|sekolah|pendidikan/i.test(fund.name) ? '🎓' : /liburan|travel|trip/i.test(fund.name) ? '✈️' : /rumah|dp/i.test(fund.name) ? '🏠' : /nikah|wedding/i.test(fund.name) ? '💍' : '🎯');
export const pocketIcons = ['🛟', '🎓', '✈️', '🏠', '💍', '🚗', '👶', '🎁', '🏥', '💻', '📱', '🎯', '💰', '🕌', '🎉'];

export const isKantong = (fund: Pick<Fund, 'walletIds'>) => Array.isArray(fund.walletIds) && fund.walletIds.length > 0;
type Bal = Pick<Wallet, 'id' | 'cachedBalance' | 'isArchived'>;
export const kantongWallets = <W extends Bal>(fund: Pick<Fund, 'walletIds'>, wallets: W[]) => (fund.walletIds || []).map(id => wallets.find(w => w.id === id && !w.isArchived)).filter((w): w is W => Boolean(w));
export const kantongAmount = (fund: Pick<Fund, 'walletIds'>, wallets: Bal[]) => kantongWallets(fund, wallets).reduce((n, w) => n + Math.max(0, w.cachedBalance), 0);

/** Funds as the app shows them: a kantong's amount comes from its wallets. Safe to call twice. */
export function resolveFunds(funds: Fund[], wallets: Bal[]): Fund[] {
  return funds.map(f => isKantong(f) ? { ...f, currentAmount: kantongAmount(f, wallets), linkedWalletId: f.linkedWalletId && f.walletIds!.includes(f.linkedWalletId) ? f.linkedWalletId : f.walletIds![0] } : f);
}
/** Wallet ids that sit in an active kantong. */
export const kantongWalletIds = (funds: Fund[]) => new Set(funds.filter(f => !f.isArchived && isKantong(f)).flatMap(f => f.walletIds || []));
export const kantongOf = (walletId: string, funds: Fund[]) => funds.find(f => !f.isArchived && isKantong(f) && f.walletIds!.includes(walletId));

/** Emergency funds (kantong first); `null` when the user has none (Insight then uses the old estimate). */
export function emergencyPockets(funds: Fund[]) {
  const all = funds.filter(f => !f.isArchived && isEmergencyFund(f));
  // Once there is an emergency kantong, older emergency Tujuan dana are not counted again.
  const list = all.some(isKantong) ? all.filter(isKantong) : all;
  return list.length ? { list, total: list.reduce((n, f) => n + Math.max(0, f.currentAmount || 0), 0), target: list.reduce((n, f) => n + Math.max(0, f.targetAmount || 0), 0) } : null;
}
