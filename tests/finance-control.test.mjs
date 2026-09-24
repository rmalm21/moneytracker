import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetSpent, effects, metrics, walletBalance } from '../lib/accounting.ts';
import { calculateCycleSnapshot, budgetCommitted, scanData, upcomingEvents } from '../lib/finance-control.ts';
import { summarizeTransactions } from '../lib/period.ts';

const wallet=(id,balance,opening=balance)=>({id,name:id,openingBalance:opening,cachedBalance:balance,isArchived:false,isReserved:false,isSpendable:true,includeInNetWorth:true});
const tx=(id,type,amount,extra={})=>({id,type,amount,date:'2026-09-25',walletId:'jago',destinationWalletId:null,categoryId:null,subcategoryId:null,adjustmentDirection:'in',...extra});
const base=()=>({wallets:[wallet('jago',1000000)],categories:[{id:'makan',name:'Makan',type:'expense',parentId:null},{id:'belanja',name:'Belanja',type:'expense',parentId:null},{id:'biaya',name:'Biaya Admin',type:'expense',parentId:null}],budgets:[],transactions:[],claims:[],receivables:[],debts:[],funds:[],recurring:[],drafts:[],plannedTransactions:[],categorizationRules:[],financialNotes:[],cycleSnapshots:[]});

test('transfer fee debits source once and only fee reaches expense reports and budget',()=>{
 const move=tx('transfer','transfer',300000,{destinationWalletId:'bri',transferFee:2500,transferFeeCategoryId:'biaya'});
 const data=base();data.wallets=[wallet('jago',697500,1000000),wallet('bri',300000,0)];data.transactions=[move];
 assert.equal(effects(move).jago,-302500);assert.equal(effects(move).bri,300000);
 assert.equal(walletBalance(data.wallets[0],[move]),697500);
 assert.equal(metrics(data,'2026-09-24','2026-10-24').income,0);
 assert.equal(summarizeTransactions(data.transactions).expense,2500);
 assert.equal(budgetSpent({categoryId:'biaya',subcategoryId:null,classification:'fixed'},data.transactions,data.categories),2500);
});

test('split allocates categories without charging the wallet more than parent total',()=>{
 const purchase=tx('split','expense',120000,{splits:[{categoryId:'makan',subcategoryId:null,amount:45000},{categoryId:'belanja',subcategoryId:null,amount:50000},{categoryId:'makan',subcategoryId:null,amount:25000}]});const data=base();data.wallets=[wallet('jago',880000,1000000)];data.transactions=[purchase];
 assert.equal(effects(purchase).jago,-120000);assert.equal(budgetSpent({categoryId:'makan',subcategoryId:null,classification:'living'},[purchase],data.categories),70000);assert.equal(budgetSpent({categoryId:'belanja',subcategoryId:null,classification:'living'},[purchase],data.categories),50000);assert.equal(metrics(data,'2026-09-24','2026-10-24').expenses,120000);
});

test('inbox commitment moves from committed to spent only when posted',()=>{
 const data=base();const budget={categoryId:'makan',subcategoryId:null,classification:'fixed',cycleType:'salary',amount:30000,rolloverEnabled:false};data.budgets=[budget];data.drafts=[{id:'d',status:'pending',type:'expense',amount:30000,categoryId:'makan',walletId:'jago',plannedDate:'2026-09-26',name:'Spotify'}];
 assert.equal(budgetCommitted(budget,data,new Date(2026,8,26,12),24),30000);assert.equal(metrics(data,'2026-09-24','2026-10-24').expenses,0);assert.equal(data.wallets[0].cachedBalance,1000000);
 data.drafts[0].status='posted';data.transactions=[tx('spotify','expense',30000,{categoryId:'makan'})];data.wallets=[wallet('jago',970000,1000000)];assert.equal(budgetCommitted(budget,data,new Date(2026,8,26,12),24),0);assert.equal(budgetSpent(budget,data.transactions,data.categories),30000);assert.equal(data.wallets[0].cachedBalance,970000);
});

test('closed-cycle snapshot and later cycle update when historical expense changes',()=>{
 const data=base();const cycle={start:'2026-09-24',end:'2026-10-24'};let history=[tx('a','expense',10000,{categoryId:'makan'})];data.wallets=[wallet('jago',990000,1000000)];data.budgets=[{categoryId:'makan',subcategoryId:null,amount:50000,classification:'living',active:true}];
 let snap=calculateCycleSnapshot(data,history,cycle);assert.equal(snap.openingAssets,1000000);assert.equal(snap.closingAssets,990000);assert.equal(snap.expense,10000);assert.equal(snap.budgetRemaining,40000);
 history=[tx('a','expense',15000,{categoryId:'makan'})];data.wallets=[wallet('jago',985000,1000000)];snap=calculateCycleSnapshot(data,history,cycle,{...snap,budgetTotal:50000});assert.equal(snap.openingAssets,1000000);assert.equal(snap.closingAssets,985000);assert.equal(snap.expense,15000);assert.equal(snap.budgetRemaining,35000);
});

test('plan never enters actual expenses',()=>{
 const data=base();
 data.plannedTransactions=[{id:'p',title:'Spotify',type:'expense',amount:30000,date:'2026-09-26',walletId:'jago',categoryId:'makan',subcategoryId:null,notes:'',committed:true,status:'planned'}];assert.equal(metrics(data,'2026-09-24','2026-10-24').expenses,0);assert.equal(data.wallets[0].cachedBalance,1000000);assert.equal(upcomingEvents(data,{monthlySalary:0}, {start:'2026-09-24',end:'2026-10-01'}).find(e=>e.id==='plan:p')?.amount,-30000);
});

test('data health reports mismatch and invalid split without rewriting records',()=>{
 const data=base();const purchase=tx('split','expense',120000,{walletId:'jago',splits:[{categoryId:'makan',subcategoryId:null,amount:115000}]});data.transactions=[purchase];const before=structuredClone(data);const issues=scanData(data,[purchase],{salaryCycleStartDay:24});assert(issues.some(x=>x.id==='balance:jago'));assert(issues.some(x=>x.id==='split:split'));assert.deepEqual(data,before);
});
