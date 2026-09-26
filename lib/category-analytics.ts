import { budgetMatcher, expenseAllocations, transactionIncome } from './accounting.ts';
import type { Budget, Category, LedgerTx } from './types';

export type CategorySlice={id:string;name:string;amount:number;count:number;color?:string;icon?:string;subcategories:{id:string;name:string;amount:number;color?:string;icon?:string}[]};
/** Debt payments without a category are shown as their own group. */
export const DEBT_GROUP = { id: 'debt-payment', name: 'Bayar utang', icon: '💳', color: '#c0616e' };
export function categoryBreakdown(items:LedgerTx[],categories:Category[]):CategorySlice[]{
 const lookup=new Map(categories.map(c=>[c.id,c]));const result=new Map<string,CategorySlice>();const seen=new Map<string,Set<string>>();
 for(const tx of items)for(const line of expenseAllocations(tx)){
  const child=lookup.get(line.subcategoryId||line.categoryId||'');const selected=lookup.get(line.categoryId||'')||child;const parent=selected?.parentId?lookup.get(selected.parentId)||selected:selected;
  const debt=!parent&&tx.type==='debt_payment';
  const id=parent?.id||(debt?DEBT_GROUP.id:'uncategorized');let row=result.get(id);if(!row){row=debt?{...DEBT_GROUP,amount:0,count:0,subcategories:[]}:{id,name:parent?.name||'Tanpa kategori',amount:0,count:0,color:parent?.color,icon:parent?.icon,subcategories:[]};result.set(id,row)}
  row.amount+=line.amount;const txSet=seen.get(id)||new Set<string>();txSet.add(tx.id);seen.set(id,txSet);row.count=txSet.size;
  const sub=child?.parentId===id?child:selected?.parentId===id?selected:null;if(sub){let subRow=row.subcategories.find(v=>v.id===sub.id);if(!subRow){subRow={id:sub.id,name:sub.name,amount:0,color:sub.color,icon:sub.icon};row.subcategories.push(subRow)}subRow.amount+=line.amount}
 }
 return [...result.values()].map(row=>({...row,subcategories:row.subcategories.sort((a,b)=>b.amount-a.amount)})).sort((a,b)=>b.amount-a.amount);
}
/** Income by main category with its subcategories (same shape as spending, for the income chart). Repaid receivables without a category form their own group. */
export const INCOME_REPAID_GROUP = { id: 'receivable-payment', name: 'Piutang diterima', icon: '🤝', color: '#7b5cff' };
export function incomeCategoryBreakdown(items:LedgerTx[],categories:Category[]):CategorySlice[]{
 const lookup=new Map(categories.map(c=>[c.id,c]));const result=new Map<string,CategorySlice>();
 for(const tx of items){
  const amount=transactionIncome(tx);if(!amount)continue;
  const child=lookup.get(tx.subcategoryId||tx.categoryId||''),selected=lookup.get(tx.categoryId||'')||child,parent=selected?.parentId?lookup.get(selected.parentId)||selected:selected;
  const repaid=!parent&&tx.type==='receivable_payment',id=parent?.id||(repaid?INCOME_REPAID_GROUP.id:'uncategorized');
  let row=result.get(id);if(!row){row=repaid?{...INCOME_REPAID_GROUP,amount:0,count:0,subcategories:[]}:{id,name:parent?.name||'Tanpa kategori',amount:0,count:0,color:parent?.color,icon:parent?.icon,subcategories:[]};result.set(id,row)}
  row.amount+=amount;row.count++;
  const sub=child?.parentId===id?child:null;if(sub){let subRow=row.subcategories.find(v=>v.id===sub.id);if(!subRow){subRow={id:sub.id,name:sub.name,amount:0,color:sub.color,icon:sub.icon};row.subcategories.push(subRow)}subRow.amount+=amount}
 }
 return [...result.values()].map(row=>({...row,subcategories:row.subcategories.sort((a,b)=>b.amount-a.amount)})).sort((a,b)=>b.amount-a.amount);
}
export function transactionsForCategory(items:LedgerTx[],categories:Category[],categoryId:string){
 if(!categoryId)return items;
 const ids=new Set([categoryId,...categories.filter(c=>c.parentId===categoryId).map(c=>c.id)]);
 return transactionsMatching(items,(categoryId,subcategoryId)=>ids.has(categoryId||'')||ids.has(subcategoryId||''));
}
/** The part of each transaction that counts toward a budget (all its chosen subcategories). */
export function transactionsForBudget(items:LedgerTx[],categories:Category[],budget:Pick<Budget,'categoryId'|'subcategoryId'|'subcategoryIds'>){return transactionsMatching(items,budgetMatcher(budget,categories));}
function transactionsMatching(items:LedgerTx[],match:(categoryId:string|null|undefined,subcategoryId:string|null|undefined)=>boolean){
 return items.flatMap(tx=>{
  if(tx.type==='income')return match(tx.categoryId,tx.subcategoryId)?[tx]:[];
  if(tx.type==='transfer'){return tx.transferFee&&match(tx.transferFeeCategoryId,null)?[tx]:[]}
  if(tx.type!=='expense')return [];
  const lines=expenseAllocations(tx).filter(line=>match(line.categoryId,line.subcategoryId));if(!lines.length)return [];
  const amount=lines.reduce((sum,line)=>sum+line.amount,0);
  // Analysis-only copy: the real ledger still has one payment with its full amount.
  return [{...tx,amount,splits:lines.map(line=>({categoryId:line.categoryId||'',subcategoryId:line.subcategoryId,amount:line.amount})),categoryId:null,subcategoryId:null}];
 });
}
/** Categories ordered as a tree (parent, then its subcategories) for dropdowns, optionally limited to some types. */
export function categoryTree(categories:Category[],types?:Category['type'][]){
 const active=categories.filter(c=>!c.isArchived&&(!types||types.includes(c.type)));
 const order=['expense','income','savings','debt','receivable','reimbursement'];
 const sorted=(list:Category[])=>list.sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type)||(a.sortOrder??0)-(b.sortOrder??0)||a.name.localeCompare(b.name));
 const parents=sorted(active.filter(c=>!c.parentId||!active.some(p=>p.id===c.parentId)));
 return parents.flatMap(parent=>[{category:parent,depth:0},...sorted(active.filter(c=>c.parentId===parent.id)).map(category=>({category,depth:1}))]);
}
/** Category types that make sense as a filter for a transaction type ('' = all types). */
export function categoryTypesFor(txType:string):Category['type'][]|undefined{
 if(txType==='expense'||txType==='transfer')return ['expense'];
 if(txType==='income')return ['income'];
 if(txType==='fund_contribution')return ['expense','savings'];
 return undefined;
}
