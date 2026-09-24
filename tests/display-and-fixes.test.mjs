import test from 'node:test';
import assert from 'node:assert/strict';
import { newestFirst, rupiah } from '../lib/accounting.ts';
import { calculateCycleSnapshot } from '../lib/finance-control.ts';
import { transactionsForCategory } from '../lib/category-analytics.ts';
import { formatDate, summarizeTransactions } from '../lib/period.ts';

const tx=(id,type,amount,extra={})=>({id,type,amount,date:'2026-09-10',walletId:'bca',destinationWalletId:null,categoryId:null,subcategoryId:null,adjustmentDirection:'in',...extra});

test('negative amounts put the minus sign before the currency',()=>{
 assert.equal(rupiah(-12500000),'-Rp12.500.000');
 assert.equal(rupiah(875000),'Rp875.000');
 assert.equal(rupiah(-0.4),'Rp0');
});

test('same-day transactions list the latest time, then the latest recorded, first',()=>{
 const rows=[
  tx('morning','expense',1,{time:'07:15',createdAt:{seconds:10}}),
  tx('older-day','expense',1,{date:'2026-09-09',time:'23:00',createdAt:{seconds:99}}),
  tx('no-time-early','expense',1,{time:'',createdAt:{seconds:5}}),
  tx('evening','expense',1,{time:'19:30',createdAt:{seconds:1}}),
  tx('no-time-late','expense',1,{time:'',createdAt:{seconds:50}}),
  tx('unsaved','expense',1,{time:'',createdAt:null}),
 ];
 assert.deepEqual([...rows].sort(newestFirst).map(row=>row.id),['evening','morning','unsaved','no-time-late','no-time-early','older-day']);
});

test('dates in lists are readable and invalid values are left untouched',()=>{
 assert.match(formatDate('2026-09-24'),/24 Sep 2026/);
 assert.match(formatDate('2026-09-24',false),/^24 Sep$/);
 assert.equal(formatDate(''),'');
 assert.equal(formatDate('bukan tanggal'),'bukan tanggal');
});

test('a report filtered by category only counts that share of a split payment',()=>{
 const categories=[{id:'belanja',name:'Belanja',type:'expense',parentId:null},{id:'makan',name:'Makan',type:'expense',parentId:null}];
 const split=tx('split','expense',450000,{splits:[{categoryId:'belanja',subcategoryId:null,amount:300000},{categoryId:'makan',subcategoryId:null,amount:150000}]});
 const whole=summarizeTransactions([split]);
 const filtered=summarizeTransactions(transactionsForCategory([split],categories,'makan'));
 assert.equal(whole.expense,450000);
 assert.equal(filtered.expense,150000);
});

test('cycle snapshots count older wallets that have no includeInNetWorth field',()=>{
 const legacy={id:'bca',name:'BCA',openingBalance:1000000,cachedBalance:1200000,isArchived:false,isReserved:false,isSpendable:true};
 const data={wallets:[legacy],categories:[],budgets:[],transactions:[],claims:[],receivables:[],debts:[],funds:[],recurring:[],drafts:[],plannedTransactions:[],categorizationRules:[],financialNotes:[],cycleSnapshots:[]};
 const income=tx('gaji','income',200000,{date:'2026-09-10'});
 const snapshot=calculateCycleSnapshot(data,[income],{start:'2026-09-01',end:'2026-10-01'});
 assert.equal(snapshot.openingAssets,1000000);
 assert.equal(snapshot.closingAssets,1200000);
 assert.equal(snapshot.closingNetWorth,1200000);
});
