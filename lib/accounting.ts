import type { Budget, Category, Data, LedgerTx, Wallet } from './types';
import { isKantong, kantongWalletIds } from './pockets.ts';
export function rupiah(value: number) { const rounded = Math.round(value || 0); return (rounded < 0 ? '-Rp' : 'Rp') + Math.abs(rounded).toLocaleString('id-ID'); }
export function readMoney(value: string) { const n = Number(value.replace(/\D/g, '')); return Number.isSafeInteger(n) ? n : 0; }
/** Newest first: by date, then time, then when it was recorded (unsaved local writes count as newest). */
export function newestFirst(a: LedgerTx, b: LedgerTx) {
  const recorded = (tx: LedgerTx) => (tx.createdAt as { seconds?: number } | null | undefined)?.seconds ?? Number.MAX_SAFE_INTEGER;
  return b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || recorded(b) - recorded(a);
}
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
  // Paying off a debt is money spent: under the category chosen for it, otherwise in its own "Bayar utang" group.
  if(tx.type==='debt_payment')return [{categoryId:tx.categoryId||null,subcategoryId:tx.subcategoryId||null,amount:tx.amount}];
  if(tx.type!=='expense')return [];
  return tx.splits?.length?tx.splits.map(line=>({categoryId:line.categoryId,subcategoryId:line.subcategoryId,amount:line.amount})):[{categoryId:tx.categoryId,subcategoryId:tx.subcategoryId,amount:tx.amount}];
}
export const transactionExpense=(tx:LedgerTx)=>expenseAllocations(tx).reduce((total,line)=>total+line.amount,0);
/** Money received: income, and a friend paying back a receivable (under its category or "Piutang diterima"). */
export const transactionIncome=(tx:LedgerTx)=>tx.type==='income'||tx.type==='receivable_payment'?tx.amount:0;
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
/** Seven-day window starting on the chosen weekday (1 = Senin … 7 = Minggu). */
export function weeklyCycle(date:Date,weekday=1){const target=((Math.round(weekday)||1)-1+7)%7+1,start=new Date(date.getFullYear(),date.getMonth(),date.getDate()),today=start.getDay()||7;start.setDate(start.getDate()-((today-target+7)%7));const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+7);const fmt=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {start:fmt(start),end:fmt(end),daysRemaining:Math.max(1,Math.ceil((end.getTime()-date.getTime())/86400000)),daysTotal:7};}
export function budgetWindow(budget:Budget,date:Date,salaryDay:number){return budget.cycleType==='weekly'?weeklyCycle(date,budget.cycleStartDay||1):budget.cycleType==='calendar'?calendarCycle(date):salaryCycle(date,budget.cycleType==='custom'?budget.cycleStartDay||salaryDay:salaryDay)}
/** Rough monthly size of a budget, so weekly and monthly budgets can be added up. */
export function budgetMonthly(budget:Pick<Budget,'amount'|'cycleType'>){return budget.cycleType==='weekly'?Math.round(budget.amount*52/12):budget.amount}
export function budgetCurrent(budget:Budget,txs:LedgerTx[],cats:Category[],date:Date,salaryDay:number){const window=budgetWindow(budget,date,salaryDay);const spent=budgetSpent(budget,txs.filter(t=>t.date>=window.start&&t.date<window.end),cats);const available=budget.amount+(budget.rolloverEnabled?(budget.rolloverCarry||0):0);return {...window,spent,available,remaining:available-spent};}
/** The subcategories a budget is limited to; empty means the whole category with all its subcategories. */
export function budgetSubcategories(budget: Pick<Budget, 'subcategoryId' | 'subcategoryIds'>): string[] {
  const list = (budget.subcategoryIds || []).filter(Boolean);
  return list.length ? [...new Set(list)] : budget.subcategoryId ? [budget.subcategoryId] : [];
}
/** Whether a category/subcategory pair counts toward a budget. */
export function budgetMatcher(budget: Pick<Budget, 'categoryId' | 'subcategoryId' | 'subcategoryIds'>, cats: Pick<Category, 'id' | 'parentId'>[]) {
  const subs = budgetSubcategories(budget);
  const ids = new Set<string>(subs.length ? subs : [budget.categoryId, ...cats.filter(c => c.parentId === budget.categoryId).map(c => c.id)]);
  return (categoryId: string | null | undefined, subcategoryId: string | null | undefined) => subs.length ? ids.has(subcategoryId || '') || ids.has(categoryId || '') : ids.has(categoryId || '') || ids.has(subcategoryId || '');
}
/** The category whose icon and name stand for a budget: its only subcategory, otherwise the category itself. */
export function budgetIconCategoryId(budget: Pick<Budget, 'categoryId' | 'subcategoryId' | 'subcategoryIds'>) { const subs = budgetSubcategories(budget); return subs.length === 1 ? subs[0] : budget.categoryId; }
/** Budgets to add up: a budget for part of a category is left out when the whole category has its own budget. */
export function countedBudgets<T extends Pick<Budget, 'categoryId' | 'subcategoryId' | 'subcategoryIds'>>(budgets: T[]): T[] {
  return budgets.filter(b => !budgetSubcategories(b).length || !budgets.some(parent => parent !== b && parent.categoryId === b.categoryId && !budgetSubcategories(parent).length));
}
export function budgetSpent(budget: Budget, txs: LedgerTx[], cats: Category[]) {
  const matches = budgetMatcher(budget, cats);
  return txs.reduce((total,tx)=>total+expenseAllocations(tx).filter(line=>matches(line.categoryId,line.subcategoryId)).reduce((sum,line)=>sum+line.amount,0)+(['savings','sinking'].includes(budget.classification)&&tx.type==='fund_contribution'&&matches(tx.categoryId,tx.subcategoryId)?tx.amount:0),0);
}
/** `includeReceivables`: whether unpaid receivables and office claims count toward Aset bersih (user setting, off by default). */
export function metrics(data: Data, start: string, end: string, salaryDay=24, asOf = new Date(), includeReceivables = false) {
  const active = data.wallets.filter(w => !w.isArchived);
  const owned = active.filter(w => w.includeInNetWorth !== false);
  const liquid = active.filter(w => w.isSpendable !== false);
  const assets = owned.reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  const signedAssets = owned.reduce((n,w)=>n+w.cachedBalance,0);
  const liabilities = data.debts.reduce((n,d)=>n+Math.max(0,d.outstandingAmount),0);
  const receivables = data.claims.filter(c=>c.status!=='rejected').reduce((n,c)=>n+Math.max(0,c.remainingAmount),0)+data.receivables.reduce((n,r)=>n+Math.max(0,r.remainingAmount),0);
  const keptWallets = owned.filter(w=>w.isReserved).reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  // Uang bebas: spendable wallets that are not "Disimpan", minus money that already has a purpose —
  // wallets grouped in a kantong (as a whole) and amounts collected for Tujuan dana kept in those wallets.
  const inKantong = kantongWalletIds(data.funds);
  const usableWallets = liquid.filter(w=>!w.isReserved);
  const usable = usableWallets.reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  const kantongMoney = usableWallets.filter(w=>inKantong.has(w.id)).reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  const kantongElsewhere = owned.filter(w=>!w.isReserved&&w.isSpendable===false&&inKantong.has(w.id)).reduce((n,w)=>n+Math.max(0,w.cachedBalance),0);
  const goalMoney = data.funds.filter(f=>{ if(f.isArchived||isKantong(f))return false; const w=active.find(x=>x.id===f.linkedWalletId); return !w||!w.isReserved&&w.isSpendable!==false&&!inKantong.has(w.id); }).reduce((n,f)=>n+Math.max(0,f.currentAmount),0);
  const free = usable-kantongMoney-goalMoney;
  const reserved = keptWallets+kantongMoney+kantongElsewhere+goalMoney;
  const cycle = data.transactions.filter(t=>t.date>=start&&t.date<end);
  const income = cycle.reduce((n,t)=>n+transactionIncome(t),0);
  const expenses = cycle.reduce((n,t)=>n+transactionExpense(t),0);
  const activeBudgets=data.budgets.filter(b=>b.active);
  const nonOverlapping=countedBudgets(activeBudgets);
  const totalBudget=nonOverlapping.reduce((n,b)=>n+b.amount+(b.rolloverEnabled?(b.rolloverCarry||0):0),0);
  const budgetRemaining=nonOverlapping.reduce((n,b)=>n+budgetCurrent(b,data.transactions,data.categories,asOf,salaryDay).remaining,0);
  const discretionaryRemaining=nonOverlapping.filter(b=>b.classification==='living').reduce((n,b)=>n+budgetCurrent(b,data.transactions,data.categories,asOf,salaryDay).remaining,0);
  return {assets,liabilities,receivables,netWorth:signedAssets+(includeReceivables?receivables:0)-liabilities,reserved,free:Math.max(0,free),freeParts:{usable,usableCount:usableWallets.length,kantongMoney,goalMoney,keptWallets},income,expenses,totalBudget,budgetRemaining,discretionaryRemaining,cycle};
}
