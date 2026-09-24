import type { Budget, Category, Data, LedgerTx, Wallet } from './types';
export function rupiah(value: number) { return 'Rp' + Math.round(value || 0).toLocaleString('id-ID'); }
export function readMoney(value: string) { const n = Number(value.replace(/\D/g, '')); return Number.isSafeInteger(n) ? n : 0; }
export function validAmount(n: number) { return Number.isSafeInteger(n) && n > 0; }
export function effects(tx: LedgerTx): Record<string, number> {
  const delta: Record<string, number> = {};
  const add = (id: string|null, amount: number) => { if (id) delta[id] = (delta[id] || 0) + amount; };
  if (['expense','debt_payment','claim_advance','receivable_issue'].includes(tx.type)) add(tx.walletId, -tx.amount);
  else if (['income','borrowing','claim_payment','receivable_payment'].includes(tx.type)) add(tx.walletId, tx.amount);
  else if (tx.type === 'adjustment') add(tx.walletId, tx.adjustmentDirection === 'in' ? tx.amount : -tx.amount);
  else if (tx.type === 'transfer' || tx.type === 'fund_contribution') { add(tx.walletId, -tx.amount-(tx.type==='transfer'?(tx.transferFee||0):0)); add(tx.destinationWalletId, tx.amount); }
  return delta;
}
export function expenseAllocations(tx:LedgerTx){
  if(tx.type==='transfer')return tx.transferFee ? [{categoryId:tx.transferFeeCategoryId||null,subcategoryId:null,amount:tx.transferFee}] : [];
  if(tx.type==='claim_writeoff')return [{categoryId:null,subcategoryId:null,amount:tx.amount}];
  if(tx.type!=='expense')return [];
  return tx.splits?.length?tx.splits.map(line=>({categoryId:line.categoryId,subcategoryId:line.subcategoryId,amount:line.amount})):[{categoryId:tx.categoryId,subcategoryId:tx.subcategoryId,amount:tx.amount}];
}
export const transactionExpense=(tx:LedgerTx)=>expenseAllocations(tx).reduce((total,line)=>total+line.amount,0);
export function walletBalance(wallet: Wallet, txs: LedgerTx[]) { return wallet.openingBalance + txs.reduce((sum, tx) => sum + (effects(tx)[wallet.id] || 0), 0); }
export function salaryCycle(date: Date, day: number) {
  const d = Math.min(31, Math.max(1, day || 24));
  const anchor=(year:number,month:number)=>new Date(year,month,Math.min(d,new Date(year,month+1,0).getDate()));
  const current=anchor(date.getFullYear(),date.getMonth());
  const start=date<current?anchor(date.getFullYear(),date.getMonth()-1):current;
  const end=anchor(start.getFullYear(),start.getMonth()+1);
  const local=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  return { start:local(start),end:local(end),daysRemaining:Math.max(1,Math.ceil((end.getTime()-date.getTime())/86400000)),daysTotal:Math.round((end.getTime()-start.getTime())/86400000) };
}
export function calendarCycle(date:Date){const start=new Date(date.getFullYear(),date.getMonth(),1),end=new Date(date.getFullYear(),date.getMonth()+1,1);const fmt=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {start:fmt(start),end:fmt(end),daysRemaining:Math.max(1,Math.ceil((end.getTime()-date.getTime())/86400000)),daysTotal:Math.round((end.getTime()-start.getTime())/86400000)};}
export function budgetWindow(budget:Budget,date:Date,salaryDay:number){return budget.cycleType==='calendar'?calendarCycle(date):salaryCycle(date,budget.cycleType==='custom'?budget.cycleStartDay||salaryDay:salaryDay)}
export function budgetCurrent(budget:Budget,txs:LedgerTx[],cats:Category[],date:Date,salaryDay:number){const window=budgetWindow(budget,date,salaryDay);const spent=budgetSpent(budget,txs.filter(t=>t.date>=window.start&&t.date<window.end),cats);const available=budget.amount+(budget.rolloverEnabled?(budget.rolloverCarry||0):0);return {...window,spent,available,remaining:available-spent};}
export function budgetSpent(budget: Budget, txs: LedgerTx[], cats: Category[]) {
  const ids = new Set<string>([budget.categoryId]);
  if (!budget.subcategoryId) cats.filter(c => c.parentId === budget.categoryId).forEach(c => ids.add(c.id));
  const matches=(categoryId:string|null,subcategoryId:string|null)=>budget.subcategoryId?subcategoryId===budget.subcategoryId:ids.has(categoryId||'')||ids.has(subcategoryId||'');
  return txs.reduce((total,tx)=>total+expenseAllocations(tx).filter(line=>matches(line.categoryId,line.subcategoryId)).reduce((sum,line)=>sum+line.amount,0)+(['savings','sinking'].includes(budget.classification)&&tx.type==='fund_contribution'&&matches(tx.categoryId,tx.subcategoryId)?tx.amount:0),0);
}
export function metrics(data: Data, start: string, end: string, salaryDay=24, asOf = new Date()) {
  const active = data.wallets.filter(w => !w.isArchived);
  const owned = active.filter(w => w.includeInNetWorth !== false);
  const liquid = active.filter(w => w.isSpendable !== false);
  const assets = owned.reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  const signedAssets = owned.reduce((n,w)=>n+w.cachedBalance,0);
  const liabilities = data.debts.reduce((n,d)=>n+Math.max(0,d.outstandingAmount),0);
  const receivables = data.claims.filter(c=>c.status!=='rejected').reduce((n,c)=>n+Math.max(0,c.remainingAmount),0)+data.receivables.reduce((n,r)=>n+Math.max(0,r.remainingAmount),0);
  const reserved = owned.filter(w=>w.isReserved).reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  const unlinkedFunds = data.funds.filter(f=>!active.find(w=>w.id===f.linkedWalletId)?.isReserved).reduce((n,f)=>n+Math.max(0,f.currentAmount),0);
  const free = liquid.filter(w=>!w.isReserved).reduce((n,w)=>n+Math.max(0,w.cachedBalance),0)-unlinkedFunds;
  const cycle = data.transactions.filter(t=>t.date>=start&&t.date<end);
  const income = cycle.filter(t=>t.type==='income').reduce((n,t)=>n+t.amount,0);
  const expenses = cycle.reduce((n,t)=>n+transactionExpense(t),0);
  const activeBudgets=data.budgets.filter(b=>b.active);
  const nonOverlapping=activeBudgets.filter(b=>!b.subcategoryId||!activeBudgets.some(parent=>parent.categoryId===b.categoryId&&!parent.subcategoryId));
  const totalBudget=nonOverlapping.reduce((n,b)=>n+b.amount+(b.rolloverEnabled?(b.rolloverCarry||0):0),0);
  const budgetRemaining=nonOverlapping.reduce((n,b)=>n+budgetCurrent(b,data.transactions,data.categories,asOf,salaryDay).remaining,0);
  const discretionaryRemaining=nonOverlapping.filter(b=>b.classification==='living').reduce((n,b)=>n+budgetCurrent(b,data.transactions,data.categories,asOf,salaryDay).remaining,0);
  return {assets,liabilities,receivables,netWorth:signedAssets+receivables-liabilities,reserved:reserved+unlinkedFunds,free:Math.max(0,free),income,expenses,totalBudget,budgetRemaining,discretionaryRemaining,cycle};
}
