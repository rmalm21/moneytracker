import type { LedgerTx, Wallet } from './types.ts';

export type WalletAction='pay'|'receive'|'transferOut'|'transferIn';
export function walletAllows(wallet:Wallet,action:WalletAction){
  if(wallet.isArchived)return false;
  if(action==='pay')return wallet.isSpendable!==false&&wallet.canPay!==false;
  if(action==='receive')return wallet.canReceive!==false;
  if(action==='transferOut')return wallet.canTransferOut!==false;
  return wallet.canTransferIn!==false;
}
export function walletActions(tx:Pick<LedgerTx,'type'|'adjustmentDirection'>):{source:WalletAction;destination?:WalletAction}{
  if(tx.type==='transfer'||tx.type==='fund_contribution')return {source:'transferOut',destination:'transferIn'};
  if(['income','claim_payment','receivable_payment','borrowing'].includes(tx.type)||tx.type==='adjustment'&&tx.adjustmentDirection==='in')return {source:'receive'};
  return {source:'pay'};
}
export function validateWalletUse(wallet:Wallet,action:WalletAction,old?:LedgerTx|null,newTx?:LedgerTx){
  // Existing records retain their wallet even if its capabilities changed afterward.
  if(old&&newTx&&old.walletId===newTx.walletId&&walletActions(old).source===action)return;
  if(!walletAllows(wallet,action))throw Error(action==='pay'?'Dompet ini tidak bisa dipakai untuk membayar. Pilih dompet lain.':`Dompet ${wallet.name} tidak bisa dipakai untuk transaksi ini.`);
}
