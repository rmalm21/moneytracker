import { expenseAllocations } from './accounting.ts';
import type { Category, LedgerTx } from './types';

export type CategorySlice={id:string;name:string;amount:number;count:number;color?:string;icon?:string;subcategories:{id:string;name:string;amount:number;color?:string;icon?:string}[]};
export function categoryBreakdown(items:LedgerTx[],categories:Category[]):CategorySlice[]{
 const lookup=new Map(categories.map(c=>[c.id,c]));const result=new Map<string,CategorySlice>();const seen=new Map<string,Set<string>>();
 for(const tx of items)for(const line of expenseAllocations(tx)){
  const child=lookup.get(line.subcategoryId||line.categoryId||'');const selected=lookup.get(line.categoryId||'')||child;const parent=selected?.parentId?lookup.get(selected.parentId)||selected:selected;
  const id=parent?.id||'uncategorized';let row=result.get(id);if(!row){row={id,name:parent?.name||'Tanpa kategori',amount:0,count:0,color:parent?.color,icon:parent?.icon,subcategories:[]};result.set(id,row)}
  row.amount+=line.amount;const txSet=seen.get(id)||new Set<string>();txSet.add(tx.id);seen.set(id,txSet);row.count=txSet.size;
  const sub=child?.parentId===id?child:selected?.parentId===id?selected:null;if(sub){let subRow=row.subcategories.find(v=>v.id===sub.id);if(!subRow){subRow={id:sub.id,name:sub.name,amount:0,color:sub.color,icon:sub.icon};row.subcategories.push(subRow)}subRow.amount+=line.amount}
 }
 return [...result.values()].map(row=>({...row,subcategories:row.subcategories.sort((a,b)=>b.amount-a.amount)})).sort((a,b)=>b.amount-a.amount);
}
export function transactionsForCategory(items:LedgerTx[],categories:Category[],categoryId:string){
 if(!categoryId)return items;
 const ids=new Set([categoryId,...categories.filter(c=>c.parentId===categoryId).map(c=>c.id)]);
 return items.flatMap(tx=>{
  if(tx.type==='income')return ids.has(tx.categoryId||'')||ids.has(tx.subcategoryId||'')?[tx]:[];
  if(tx.type==='transfer'){return tx.transferFee&&ids.has(tx.transferFeeCategoryId||'')?[tx]:[]}
  if(tx.type!=='expense')return [];
  const lines=expenseAllocations(tx).filter(line=>ids.has(line.categoryId||'')||ids.has(line.subcategoryId||''));if(!lines.length)return [];
  const amount=lines.reduce((sum,line)=>sum+line.amount,0);
  // Analysis-only copy: the real ledger still has one payment with its full amount.
  return [{...tx,amount,splits:lines.map(line=>({categoryId:line.categoryId||'',subcategoryId:line.subcategoryId,amount:line.amount})),categoryId:null,subcategoryId:null}];
 });
}
