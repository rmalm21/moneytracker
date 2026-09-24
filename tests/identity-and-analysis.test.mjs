import test from 'node:test';
import assert from 'node:assert/strict';
import { walletActions, walletAllows, validateWalletUse } from '../lib/wallet-capabilities.ts';
import { categoryBreakdown, transactionsForCategory } from '../lib/category-analytics.ts';
import { summarizeTransactions } from '../lib/period.ts';

const wallet={id:'school',name:'Dana Kuliah',isArchived:false,isSpendable:false,canPay:false,canReceive:true,canTransferOut:true,canTransferIn:true};
test('non-payment wallet cannot make a new expense, but can receive an owned transfer',()=>{
 assert.equal(walletAllows(wallet,'pay'),false);assert.equal(walletAllows(wallet,'transferIn'),true);
 assert.equal(walletActions({type:'expense',adjustmentDirection:'in'}).source,'pay');
 assert.throws(()=>validateWalletUse(wallet,'pay'),/tidak bisa dipakai/);
 const old={type:'expense',walletId:'school',adjustmentDirection:'in'};
 assert.doesNotThrow(()=>validateWalletUse(wallet,'pay',old,{...old,walletId:'school'}));
 assert.throws(()=>validateWalletUse(wallet,'pay',old,{...old,walletId:'other'}));
});
test('older wallets without the new capability fields retain safe defaults',()=>{
 const legacy={...wallet,isSpendable:true,canPay:undefined,canReceive:undefined,canTransferIn:undefined};
 assert.equal(walletAllows(legacy,'pay'),true);assert.equal(walletAllows(legacy,'transferIn'),true);
});
test('category drilldown counts only the allocated share of a split payment',()=>{
 const categories=[{id:'food',name:'Makan',parentId:null},{id:'groceries',name:'Bahan',parentId:'food'},{id:'shop',name:'Belanja',parentId:null}];
 const payment={id:'a',type:'expense',amount:120000,walletId:'jago',date:'2026-09-24',splits:[{categoryId:'food',subcategoryId:'groceries',amount:45000},{categoryId:'shop',subcategoryId:null,amount:75000}]};
 const full=categoryBreakdown([payment],categories);assert.equal(full.reduce((sum,row)=>sum+row.amount,0),120000);assert.equal(full.find(x=>x.id==='food').subcategories[0].amount,45000);
 const portion=transactionsForCategory([payment],categories,'food');assert.equal(portion.length,1);assert.equal(portion[0].amount,45000);assert.equal(summarizeTransactions(portion).expense,45000);
 assert.equal(payment.amount,120000);assert.equal(payment.splits.length,2);
});
