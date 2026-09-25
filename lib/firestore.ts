import { collection, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch, type DocumentData, type DocumentReference, type QueryDocumentSnapshot, type Unsubscribe } from 'firebase/firestore';
import { runTx, settle, isOffline, whenOnline } from './offline';
import { walletGroup } from './wallet-groups';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { effects, validAmount, walletBalance, budgetWindow, budgetSpent, calendarCycle, newestFirst } from './accounting';
import type { WishItem, Budget, Category, Claim, Data, Debt, Fund, LedgerTx, ManualPayment, Profile, Receivable, Recurring, Wallet, Draft, TxType } from './types';
import { validateWalletUse, walletActions } from './wallet-capabilities';
import { advanceSchedule, scheduleDay } from './recurring';

export const names = ['wallets','categories','budgets','transactions','claims','receivables','debts','funds','recurring','drafts','plannedTransactions','categorizationRules','financialNotes','cycleSnapshots','wishlist'] as const;
type Name = typeof names[number];
function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
export function userRef(uid:string) { return doc(database(),'users',uid); }
export function coll(uid:string,name:Name) { return collection(database(),'users',uid,name); }
export function ref(uid:string,name:Name,id:string) { return doc(database(),'users',uid,name,id); }
const hydrate = <T>(d:{id:string;data:()=>DocumentData}) => ({ id:d.id, ...d.data() }) as T;
export async function initProfile(user:User) {
  const r=userRef(user.uid); const snapshot=await getDoc(r);
  if (!snapshot.exists()) await settle(setDoc(r,{uid:user.uid,email:user.email||'',username:(user.email||'').split('@')[0],displayName:user.displayName||'',currency:'IDR',salaryCycleStartDay:24,monthlySalary:0,onboardingDone:false,hideReserved:true,theme:'light',dashboardWidgets:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastLoginAt:serverTimestamp()}));
  else await settle(updateDoc(r,{lastLoginAt:serverTimestamp()}));
}
export function subscribeProfile(uid:string,onValue:(value:Profile|null)=>void,onError:(e:Error)=>void):Unsubscribe { return onSnapshot(userRef(uid),s=>onValue(s.exists()?s.data() as Profile:null),onError); }
export function subscribePeriodTransactions(uid:string,start:string,end:string,onValue:(items:LedgerTx[])=>void,onError:(error:Error)=>void):Unsubscribe {
  return onSnapshot(query(coll(uid,'transactions'),where('date','>=',start),where('date','<',end)),snapshot=>onValue(snapshot.docs.map(row=>hydrate<LedgerTx>(row)).sort(newestFirst)),onError);
}
export function subscribeRelatedTransactions(uid:string,field:'receivableId'|'claimId'|'debtId'|'fundId',id:string,onValue:(items:LedgerTx[])=>void,onError:(error:Error)=>void):Unsubscribe {
 return onSnapshot(query(coll(uid,'transactions'),where(field,'==',id)),snapshot=>onValue(snapshot.docs.map(row=>hydrate<LedgerTx>(row)).sort(newestFirst)),onError);
}
export function subscribeData(uid:string,start:string,end:string,onPart:(key:Name,value:unknown[])=>void,onError:(e:Error)=>void,onSync?:(state:'syncing'|'synced'|'offline')=>void,asOf=new Date(),salaryDay=24):Unsubscribe {
  const all:Unsubscribe[]=[];
  const month=calendarCycle(asOf);
  const baseline=start<month.start?start:month.start;
  const baselineEnd=end>month.end?end:month.end;
  const union=new Map<string,LedgerTx>();let recent:LedgerTx[]=[];let cycle:LedgerTx[]=[];let calendar:LedgerTx[]=[];let custom:LedgerTx[]=[];
  let customRange='',customStop:Unsubscribe|undefined;
  const emit=()=>{ union.clear(); for(const t of [...recent,...cycle,...calendar,...custom]) union.set(t.id,t); onPart('transactions',[...union.values()].sort(newestFirst)); };
  for(const name of names) {
    if(name==='transactions'||name==='categorizationRules') continue;
    all.push(onSnapshot(coll(uid,name),s=>{
      const value=s.docs.map(d=>hydrate(d));onPart(name,value);
      if(name!=='budgets')return;
      const windows=(value as Budget[]).map(budget=>budgetWindow(budget,asOf,salaryDay));
      const earliest=windows.reduce((date,window)=>window.start<date?window.start:date,baseline);
      const latest=windows.reduce((date,window)=>window.end>date?window.end:date,baselineEnd);
      const key=`${earliest}:${latest}`;if(key===customRange)return;
      customStop?.();custom=[];customRange=key;emit();
      if(earliest<baseline||latest>baselineEnd)customStop=onSnapshot(query(coll(uid,'transactions'),where('date','>=',earliest),where('date','<',latest)),history=>{custom=history.docs.map(d=>hydrate<LedgerTx>(d));emit();},onError);
    },onError));
  }
  all.push(onSnapshot(query(coll(uid,'transactions'),orderBy('date','desc'),limit(60)),{includeMetadataChanges:true},s=>{recent=s.docs.map(d=>hydrate<LedgerTx>(d));emit();onSync?.(s.metadata.hasPendingWrites?(isOffline()?'offline':'syncing'):s.metadata.fromCache?(isOffline()?'offline':'syncing'):'synced');},onError));
  all.push(onSnapshot(query(coll(uid,'transactions'),where('date','>=',start),where('date','<',end)),s=>{cycle=s.docs.map(d=>hydrate<LedgerTx>(d));emit();},onError));
  if(month.start!==start||month.end!==end)all.push(onSnapshot(query(coll(uid,'transactions'),where('date','>=',month.start),where('date','<',month.end)),s=>{calendar=s.docs.map(d=>hydrate<LedgerTx>(d));emit();},onError));
  return ()=>{all.forEach(stop=>stop());customStop?.();};
}
export async function saveProfile(uid:string,changes:Partial<Profile>) { await settle(updateDoc(userRef(uid),{...changes,updatedAt:serverTimestamp()})); }
export async function saveWallet(uid:string,input:Partial<Wallet>&{name:string;openingBalance:number},id?:string) {
  if(!Number.isSafeInteger(input.openingBalance)) throw Error('Saldo awal harus berupa angka Rupiah yang valid.');
  if(input.color&&!/^#[0-9a-fA-F]{6}$/.test(input.color))throw Error('Warna dompet tidak valid.');
  const r=id?ref(uid,'wallets',id):doc(coll(uid,'wallets'));
  if(!id) {await settle(setDoc(r,{name:input.name.trim(),type:input.type||'bank',openingBalance:input.openingBalance,cachedBalance:input.openingBalance,purpose:input.purpose||'',isReserved:input.isReserved||false,isSpendable:input.isSpendable??true,canPay:input.canPay??true,canReceive:input.canReceive??true,canTransferOut:input.canTransferOut??true,canTransferIn:input.canTransferIn??true,includeInNetWorth:input.includeInNetWorth??true,isArchived:false,group:input.group||walletGroup({type:input.type||'bank',isReserved:input.isReserved||false}),icon:input.icon||'💳',color:input.color||'#267e73',cardStyle:input.cardStyle||'soft',displayOrder:input.displayOrder??0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));return r.id;}
  await runTx(database(),async trx=>{ const old=await trx.get(r);if(!old.exists()) throw Error('Dompet tidak ditemukan.'); const before=old.data() as Wallet;trx.update(r,{name:input.name.trim(),type:input.type||before.type,group:input.group||walletGroup(before),purpose:input.purpose??before.purpose,isReserved:input.isReserved??before.isReserved,isSpendable:input.isSpendable??before.isSpendable,canPay:input.canPay??before.canPay??true,canReceive:input.canReceive??before.canReceive??true,canTransferOut:input.canTransferOut??before.canTransferOut??true,canTransferIn:input.canTransferIn??before.canTransferIn??true,includeInNetWorth:input.includeInNetWorth??before.includeInNetWorth,isArchived:input.isArchived??before.isArchived,icon:input.icon??before.icon??'💳',color:input.color??before.color??'#267e73',cardStyle:input.cardStyle??before.cardStyle??'soft',displayOrder:input.displayOrder??before.displayOrder??0,openingBalance:input.openingBalance,cachedBalance:increment(input.openingBalance-before.openingBalance),updatedAt:serverTimestamp()}); });await syncSnapshot(uid,'0000-01-01');return r.id;
}
export async function archiveOrDelete(uid:string,name:Name,id:string,data:Data) {
  if(name==='wallets') {const fields=['walletId','destinationWalletId'] as const;const used=(await Promise.all(fields.map(field=>getDocs(query(coll(uid,'transactions'),where(field,'==',id),limit(1)))))).some(snapshot=>!snapshot.empty)||data.funds.some(f=>f.linkedWalletId===id)||data.recurring.some(r=>r.walletId===id)||data.plannedTransactions.some(p=>p.walletId===id)||data.claims.some(c=>c.sourceWalletId===id)||data.receivables.some(c=>c.sourceWalletId===id);if(used){await settle(updateDoc(ref(uid,name,id),{isArchived:true,updatedAt:serverTimestamp()}));return 'archived';}}
  if(name==='categories') {const fieldHits=await Promise.all((['categoryId','subcategoryId','transferFeeCategoryId'] as const).map(field=>getDocs(query(coll(uid,'transactions'),where(field,'==',id),limit(1)))));const nested=(await loadAllTransactions(uid)).some(t=>t.splits?.some(line=>line.categoryId===id||line.subcategoryId===id));const used=fieldHits.some(snapshot=>!snapshot.empty)||nested||data.budgets.some(b=>b.categoryId===id||b.subcategoryId===id)||data.categories.some(c=>c.parentId===id)||data.recurring.some(r=>r.categoryId===id)||data.plannedTransactions.some(p=>p.categoryId===id||p.subcategoryId===id);if(used){await settle(updateDoc(ref(uid,name,id),{isArchived:true,updatedAt:serverTimestamp()}));return 'archived';}}
  if(name==='budgets'||name==='funds'||name==='recurring'||name==='wallets'||name==='categories') {if(name==='funds' && !(await getDocs(query(coll(uid,'transactions'),where('fundId','==',id),limit(1)))).empty){await settle(updateDoc(ref(uid,name,id),{isArchived:true,updatedAt:serverTimestamp()}));return 'archived';}const b=writeBatch(database());b.delete(ref(uid,name,id));await settle(b.commit());return 'deleted';}
  throw Error('Catatan ini hanya bisa diubah lewat transaksinya.');
}
export async function saveRecord<T extends Category|Budget|Fund|Recurring>(uid:string,name:'categories'|'budgets'|'funds'|'recurring',record:Partial<T>,id?:string) { const r=id?ref(uid,name,id):doc(coll(uid,name)); const {id:_ignored,createdAt:_created,updatedAt:_updated,...fields}=record; if(id) await settle(updateDoc(r,{...fields,updatedAt:serverTimestamp()}));else await settle(setDoc(r,{...fields,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));return r.id; }
export async function saveDisplayOrder(uid:string,name:'categories'|'wallets'|'budgets'|'wishlist',ids:string[]){
 if(ids.length>400||new Set(ids).size!==ids.length)throw Error('Urutan tidak valid.');
 const batch=writeBatch(database());ids.forEach((id,index)=>batch.update(ref(uid,name,id),{[name==='wallets'?'displayOrder':'sortOrder']:index,updatedAt:serverTimestamp()}));await settle(batch.commit());
}
export async function changeContextNote(uid:string,collectionName:'receivables'|'claims'|'debts'|'funds'|'wallets',documentId:string,change:{kind:'add';text:string}|{kind:'edit';id:string;text:string}|{kind:'pin'|'delete';id:string}){
 const r=ref(uid,collectionName,documentId);await runTx(database(),async trx=>{const snap=await trx.get(r);if(!snap.exists())throw Error('Catatan terkait tidak ditemukan.');const entries=(snap.data().contextNotes||[]) as import('./types').ContextNote[];const now=new Date().toISOString();let next:typeof entries;
 if(change.kind==='add'){if(!change.text.trim())throw Error('Tulis isi catatan.');next=[...entries,{id:crypto.randomUUID(),text:change.text.trim(),createdAt:now}];}
 else{if(!entries.some(entry=>entry.id===change.id))throw Error('Catatan tidak ditemukan.');if(change.kind==='edit'){if(!change.text.trim())throw Error('Tulis isi catatan.');next=entries.map(entry=>entry.id===change.id?{...entry,text:change.text.trim(),updatedAt:now}:entry)}else if(change.kind==='pin')next=entries.map(entry=>entry.id===change.id?{...entry,pinned:!entry.pinned}:entry);else next=entries.filter(entry=>entry.id!==change.id);}
 trx.update(r,{contextNotes:next,updatedAt:serverTimestamp()});});
}
export function newTx(input:Partial<LedgerTx>&Pick<LedgerTx,'type'|'amount'|'walletId'>):LedgerTx {return {id:input.id||'',type:input.type,amount:input.amount,date:input.date||new Date().toLocaleDateString('en-CA'),time:input.time||'',walletId:input.walletId,destinationWalletId:input.destinationWalletId||null,categoryId:input.categoryId||null,subcategoryId:input.subcategoryId||null,merchant:input.merchant||'',description:input.description||'',notes:input.notes||'',tags:input.tags||[],claimId:input.claimId||null,debtId:input.debtId||null,receivableId:input.receivableId||null,fundId:input.fundId||null,recurringTransactionId:input.recurringTransactionId||null,draftId:input.draftId||null,adjustmentDirection:input.adjustmentDirection||'in',splits:input.splits||[],transferFee:input.transferFee||0,transferFeeCategoryId:input.transferFeeCategoryId||null,reconciliationReason:input.reconciliationReason||'',plannedId:input.plannedId||null};}
export class SnapshotRefreshError extends Error {committed=true;constructor(){super('Transaksi sudah tercatat, tetapi laporan siklus belum berhasil diperbarui. Buka Riwayat Siklus lalu pilih Perbarui laporan. Jangan catat transaksi ini lagi.')}}
async function syncSnapshot(uid:string,date:string){if(isOffline()){whenOnline(`snapshot:${uid}:${date}`,()=>syncSnapshot(uid,date));return}try{await (await import('./finance-store')).refreshCycleSnapshots(uid,date)}catch(error){console.error(error);throw new SnapshotRefreshError()}}
export function validateTx(tx:LedgerTx) {if(!validAmount(tx.amount))throw Error('Nominal harus lebih dari nol.');if(!tx.walletId)throw Error('Pilih dompet.');if((tx.type==='transfer'||tx.type==='fund_contribution')&&(!tx.destinationWalletId||tx.walletId===tx.destinationWalletId))throw Error('Pilih dua dompet yang berbeda.');if(tx.type==='expense'&&!tx.categoryId&&!tx.splits?.length)throw Error('Pilih kategori pengeluaran.');if(tx.splits?.length){if(tx.type!=='expense')throw Error('Pembagian hanya untuk pengeluaran.');if(tx.splits.some(line=>!line.categoryId||!validAmount(line.amount)))throw Error('Setiap pembagian membutuhkan kategori dan nominal positif.');const sum=tx.splits.reduce((n,line)=>n+line.amount,0);if(sum!==tx.amount)throw Error(sum<tx.amount?`Pembagian masih kurang Rp${(tx.amount-sum).toLocaleString('id-ID')}.`:`Pembagian melebihi total transaksi Rp${(sum-tx.amount).toLocaleString('id-ID')}.`);}if(tx.transferFee&&tx.type!=='transfer'||tx.transferFee!==undefined&&(!Number.isSafeInteger(tx.transferFee)||tx.transferFee<0))throw Error('Biaya admin tidak valid.');if(tx.type==='transfer'&&tx.transferFee&&!tx.transferFeeCategoryId)throw Error('Pilih kategori biaya admin.');if((tx.type==='claim_payment'&&!tx.claimId)||(tx.type==='debt_payment'&&!tx.debtId)||(tx.type==='receivable_payment'&&!tx.receivableId)||(tx.type==='fund_contribution'&&!tx.fundId))throw Error('Pilih catatan terkait.');}
function relation(tx:LedgerTx,sign:number) { const side: {kind:'claims'|'receivables'|'debts'|'funds';id:string;delta:number}|null =
 (tx.type==='claim_payment'||tx.type==='claim_writeoff')&&tx.claimId?{kind:'claims',id:tx.claimId,delta:-tx.amount*sign}:
 tx.type==='receivable_payment'&&tx.receivableId?{kind:'receivables',id:tx.receivableId,delta:-tx.amount*sign}:
 tx.type==='debt_payment'&&tx.debtId?{kind:'debts',id:tx.debtId,delta:-tx.amount*sign}:
 tx.type==='fund_contribution'&&tx.fundId?{kind:'funds',id:tx.fundId,delta:tx.amount*sign}:null;
 return side;
}
export async function upsertTransaction(uid:string,input:LedgerTx,editId?:string) {
  validateTx(input);const r=editId?ref(uid,'transactions',editId):doc(coll(uid,'transactions'));
  let previousDate=input.date;
  // Standalone additions use an offline-capable atomic batch. Edits and linked repayments use transactions for consistency checks.
  const linked=Boolean(relation(input,1)||input.draftId||input.plannedId);
  if(!editId&&!linked) {const actions=walletActions(input);const source=await getDoc(ref(uid,'wallets',input.walletId));if(!source.exists())throw Error('Dompet asal tidak ditemukan.');validateWalletUse(hydrate<Wallet>(source),actions.source);if(actions.destination&&input.destinationWalletId){const destination=await getDoc(ref(uid,'wallets',input.destinationWalletId));if(!destination.exists())throw Error('Dompet tujuan tidak ditemukan.');validateWalletUse(hydrate<Wallet>(destination),actions.destination);}const batch=writeBatch(database());const {id:_batchId,...payload}=input;batch.set(r,{...payload,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});for(const [wallet,delta] of Object.entries(effects(input))) batch.update(ref(uid,'wallets',wallet),{cachedBalance:increment(delta),updatedAt:serverTimestamp()});const pending=batch.commit();if(typeof navigator!=='undefined'&&!navigator.onLine){void pending.catch(console.error);return r.id;}await pending;await syncSnapshot(uid,input.date);return r.id;}
  await runTx(database(),async trx=>{
    const oldSnap=editId?await trx.get(r):null; if(editId&&!oldSnap?.exists())throw Error('Transaksi tidak ditemukan.');
    const old=oldSnap?.exists()?hydrate<LedgerTx>(oldSnap):null;previousDate=old?.date||input.date;
    const actions=walletActions(input);const walletSnap=await trx.get(ref(uid,'wallets',input.walletId));if(!walletSnap.exists())throw Error('Dompet asal tidak ditemukan.');validateWalletUse(hydrate<Wallet>(walletSnap),actions.source,old,input);
    if(actions.destination&&input.destinationWalletId){const target=await trx.get(ref(uid,'wallets',input.destinationWalletId));if(!target.exists())throw Error('Dompet tujuan tidak ditemukan.');if(!(old?.destinationWalletId===input.destinationWalletId&&walletActions(old).destination===actions.destination))validateWalletUse(hydrate<Wallet>(target),actions.destination);}
    if(old?.type==='claim_writeoff')throw Error('Hapus transaksi penolakan lalu catat ulang bila perlu mengoreksi nominal.');if(old&&(['claim_advance','receivable_issue','borrowing'].includes(old.type)||['claim_advance','receivable_issue','borrowing'].includes(input.type))) throw Error('Transaksi pembuka dicatat melalui menu terkait; ubah melalui catatannya.');
    const delta:Record<string,number>={};for(const [w,n] of Object.entries(effects(input))) delta[w]=(delta[w]||0)+n; if(old)for(const [w,n] of Object.entries(effects(old)))delta[w]=(delta[w]||0)-n;
    const relations=[...(old?[relation(old,-1)]:[]),relation(input,1)].filter((v):v is NonNullable<typeof v>=>!!v);
    const related=new Map<string,{r:DocumentReference;kind:string;value:DocumentData;delta:number}>();
    for(const rel of relations){const key=rel.kind+'/'+rel.id;if(!related.has(key)){const rr=ref(uid,rel.kind,rel.id);const snap=await trx.get(rr);if(!snap.exists())throw Error('Catatan terkait tidak ditemukan.');related.set(key,{r:rr,kind:rel.kind,value:snap.data(),delta:0});}related.get(key)!.delta+=rel.delta;}
    const draftRef=input.draftId?ref(uid,'drafts',input.draftId):null;
    const draftSnap=draftRef?await trx.get(draftRef):null;
    if(draftRef&&(!draftSnap?.exists()||!old&&draftSnap.data().status!=='pending'))throw Error('Transaksi ini sudah diproses atau tidak tersedia di daftar konfirmasi.');
    const plannedRef=input.plannedId?ref(uid,'plannedTransactions',input.plannedId):null;
    const plannedSnap=plannedRef?await trx.get(plannedRef):null;
    if(plannedRef&&(!plannedSnap?.exists()||!old&&plannedSnap.data().status!=='planned'))throw Error('Rencana sudah diproses atau tidak tersedia.');
    for(const [w,n] of Object.entries(delta))if(n)trx.update(ref(uid,'wallets',w),{cachedBalance:increment(n),updatedAt:serverTimestamp()});
    for(const item of related.values()) {const key=item.kind==='claims'||item.kind==='receivables'?'remainingAmount':item.kind==='debts'?'outstandingAmount':'currentAmount';const next=Number(item.value[key]||0)+item.delta;const cap=Number(item.value.amount??item.value.originalAmount??item.value.targetAmount??Infinity);if(next<0||next>cap&&item.kind!=='funds')throw Error('Pembayaran melebihi sisa tagihan.');const changes:Record<string,unknown>={[key]:next,updatedAt:serverTimestamp()};if(item.kind==='debts')changes.status=next===0?'paid':'open';if(item.kind==='receivables')changes.status=next===0?'paid':next<Number(item.value.originalAmount)?'partial':'open';if(item.kind==='claims')changes.status=input.type==='claim_writeoff'?'rejected':next===0?'paid':item.value.status==='paid'?'waiting':item.value.status;trx.update(item.r,changes);}
    const {id:_id,createdAt:_c,updatedAt:_u,...fields}=input;
    if(old?.draftId&&old.draftId!==input.draftId)trx.update(ref(uid,'drafts',old.draftId),{status:'pending',updatedAt:serverTimestamp()});if(draftRef&&(!old||old.draftId!==input.draftId))trx.update(draftRef,{status:'posted',updatedAt:serverTimestamp()});
    if(old?.plannedId&&old.plannedId!==input.plannedId)trx.update(ref(uid,'plannedTransactions',old.plannedId),{status:'planned',postedTransactionId:null,updatedAt:serverTimestamp()});if(plannedRef)trx.update(plannedRef,{status:'posted',postedTransactionId:r.id,updatedAt:serverTimestamp()});
    if(old)trx.update(r,{...fields,updatedAt:serverTimestamp()});else trx.set(r,{...fields,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  });await syncSnapshot(uid,previousDate<input.date?previousDate:input.date);return r.id;
}
export async function deleteTransaction(uid:string,id:string) {
  const r=ref(uid,'transactions',id);let removedDate='';await runTx(database(),async trx=>{const snap=await trx.get(r);if(!snap.exists())return;const old=hydrate<LedgerTx>(snap);removedDate=old.date;
    if(['claim_advance','receivable_issue','borrowing'].includes(old.type))throw Error('Transaksi ini dibuat otomatis dari catatan utang, klaim, atau piutang. Ubah atau hapus lewat catatan tersebut.');
    const side=relation(old,-1);const rr=side?ref(uid,side.kind,side.id):null;const sideSnap=rr?await trx.get(rr):null;
    for(const [wallet,delta] of Object.entries(effects(old)))trx.update(ref(uid,'wallets',wallet),{cachedBalance:increment(-delta),updatedAt:serverTimestamp()});
    if(side&&rr&&sideSnap?.exists()){const obj=sideSnap.data();const key=side.kind==='claims'||side.kind==='receivables'?'remainingAmount':side.kind==='debts'?'outstandingAmount':'currentAmount';const next=Number(obj[key])+side.delta;trx.update(rr,{[key]:next,...(side.kind==='claims'?{status:next===0?'paid':['paid','rejected'].includes(obj.status)?'waiting':obj.status}:{}),...(side.kind==='debts'?{status:next===0?'paid':'open'}:{}),...(side.kind==='receivables'?{status:next===0?'paid':next<Number(obj.originalAmount)?'partial':'open'}:{}),updatedAt:serverTimestamp()});}
    if(old.draftId)trx.update(ref(uid,'drafts',old.draftId),{status:'pending',updatedAt:serverTimestamp()});if(old.plannedId)trx.update(ref(uid,'plannedTransactions',old.plannedId),{status:'planned',postedTransactionId:null,updatedAt:serverTimestamp()});trx.delete(r);
  });if(removedDate)await syncSnapshot(uid,removedDate);
}
export async function createClaim(uid:string,claim:Omit<Claim,'id'|'remainingAmount'|'createdAt'|'updatedAt'>) {if(!validAmount(claim.amount))throw Error('Nominal tidak valid.');const r=doc(coll(uid,'claims'));const t=doc(coll(uid,'transactions'));const batch=writeBatch(database());batch.set(r,{...claim,remainingAmount:claim.amount,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});const {id:_c,...claimTx}=newTx({type:'claim_advance',amount:claim.amount,walletId:claim.sourceWalletId,claimId:r.id,date:claim.submissionDate,description:claim.name});batch.set(t,{...claimTx,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.update(ref(uid,'wallets',claim.sourceWalletId),{cachedBalance:increment(-claim.amount),updatedAt:serverTimestamp()});await settle(batch.commit());await syncSnapshot(uid,claim.submissionDate);return r.id;}
export async function createReceivable(uid:string,item:Omit<Receivable,'id'|'remainingAmount'|'createdAt'|'updatedAt'>) {if(!validAmount(item.originalAmount))throw Error('Nominal tidak valid.');const r=doc(coll(uid,'receivables'));if(!item.sourceWalletId){await settle(setDoc(r,{...item,sourceWalletId:'',remainingAmount:item.originalAmount,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));return r.id;}const t=doc(coll(uid,'transactions'));const batch=writeBatch(database());batch.set(r,{...item,remainingAmount:item.originalAmount,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});const {id:_r,...receivableTx}=newTx({type:'receivable_issue',amount:item.originalAmount,walletId:item.sourceWalletId,receivableId:r.id,date:item.date,description:item.person});batch.set(t,{...receivableTx,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.update(ref(uid,'wallets',item.sourceWalletId),{cachedBalance:increment(-item.originalAmount),updatedAt:serverTimestamp()});await settle(batch.commit());await syncSnapshot(uid,item.date);return r.id;}
export async function createDebt(uid:string,item:Omit<Debt,'id'|'outstandingAmount'|'status'|'createdAt'|'updatedAt'>,creditWallet?:string) {if(!validAmount(item.originalAmount))throw Error('Nominal tidak valid.');const r=doc(coll(uid,'debts'));const batch=writeBatch(database());batch.set(r,{...item,outstandingAmount:item.originalAmount,status:'open',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});let borrowedOn='';if(creditWallet){const t=doc(coll(uid,'transactions'));const {id:_d,...debtTx}=newTx({type:'borrowing',amount:item.originalAmount,walletId:creditWallet,debtId:r.id,description:item.name});batch.set(t,{...debtTx,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});borrowedOn=debtTx.date;batch.update(ref(uid,'wallets',creditWallet),{cachedBalance:increment(item.originalAmount),updatedAt:serverTimestamp()});}await settle(batch.commit());if(borrowedOn)await syncSnapshot(uid,borrowedOn);return r.id;}
export async function updateLinked(uid:string,name:'claims'|'debts'|'receivables',id:string,changes:Record<string,unknown>) {await settle(updateDoc(ref(uid,name,id),{...changes,updatedAt:serverTimestamp()}));await syncSnapshot(uid,'0000-01-01');}
export async function recalculateBalance(uid:string,wallet:Wallet) {const [a,b]=await Promise.all([getDocs(query(coll(uid,'transactions'),where('walletId','==',wallet.id))),getDocs(query(coll(uid,'transactions'),where('destinationWalletId','==',wallet.id)))]);const all=new Map<string,LedgerTx>();for(const snap of [...a.docs,...b.docs])all.set(snap.id,hydrate<LedgerTx>(snap));const n=walletBalance(wallet,[...all.values()]);await settle(updateDoc(ref(uid,'wallets',wallet.id),{cachedBalance:n,updatedAt:serverTimestamp()}));return n;}
export async function exportData(uid:string) {const all:Record<string,unknown[]>={};for(const name of names){all[name]=[];let cursor:QueryDocumentSnapshot|undefined;while(true){const base=query(coll(uid,name),orderBy('__name__'),...(cursor?[startAfter(cursor)]:[]),limit(400));const snap=await getDocs(base);all[name].push(...snap.docs.map(d=>({id:d.id,...d.data()})));if(snap.size<400)break;cursor=snap.docs[snap.docs.length-1];}}return {format:'dompet-ajaib-v1',ownerUid:uid,exportedAt:new Date().toISOString(),data:all};}
export function validateBackup(backup:unknown) {const b=backup as {format?:string;data?:Record<string,unknown>};if(!b||b.format!=='dompet-ajaib-v1'||!b.data)throw Error('Format file cadangan tidak dikenali.');const counts:Record<string,number>={};const extra=new Set<Name>(['plannedTransactions','categorizationRules','financialNotes','cycleSnapshots','wishlist']);const normalized={...b.data};for(const name of names){if(extra.has(name)&&normalized[name]===undefined)normalized[name]=[];if(!Array.isArray(normalized[name]))throw Error(`Data ${name} tidak valid.`);for(const item of normalized[name] as unknown[]){if(!item||typeof item!=='object'||typeof (item as {id?:unknown}).id!=='string'||!/^[\w-]{1,100}$/.test((item as {id:string}).id))throw Error(`ID data ${name} tidak valid.`);}counts[name]=(normalized[name] as unknown[]).length;}return {counts,data:normalized as Record<Name,Array<{id:string;[key:string]:unknown}>>};}
export async function importData(uid:string,backup:unknown,mode:'merge'|'replace',allowCrossAccount=false) {const {data}=validateBackup(backup);const owner=(backup as {ownerUid?:string}).ownerUid;if(owner&&owner!==uid&&!allowCrossAccount)throw Error('File cadangan ini berasal dari akun lain. Centang persetujuan jika tetap ingin mengimpornya.');if(mode==='replace'){for(const name of names){const snap=await getDocs(coll(uid,name));for(let i=0;i<snap.docs.length;i+=400){const batch=writeBatch(database());for(const d of snap.docs.slice(i,i+400))batch.delete(d.ref);await settle(batch.commit());}}}
  for(const name of names){const arr=data[name];for(let i=0;i<arr.length;i+=350){const batch=writeBatch(database());for(const row of arr.slice(i,i+350)){const {id,createdAt,updatedAt,...fields}=row;batch.set(ref(uid,name,id),{...fields,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}await settle(batch.commit());}}const wallets=await getDocs(coll(uid,'wallets'));for(const snap of wallets.docs)await recalculateBalance(uid,hydrate<Wallet>(snap));
}

export async function settleBudgets(uid:string,budgets:Budget[],salaryDay:number,now=new Date()) {
  for(const budget of budgets.filter(b=>b.rolloverEnabled)) {
    const current=budgetWindow(budget,now,salaryDay);
    if(!budget.lastSettledStart){await settle(updateDoc(ref(uid,'budgets',budget.id),{lastSettledStart:current.start,rolloverCarry:0,updatedAt:serverTimestamp()}));continue;}
    if(budget.lastSettledStart>=current.start)continue;
    let cursor=budget.lastSettledStart,carry=budget.rolloverCarry||0,steps=0;
    const categories=(await getDocs(coll(uid,'categories'))).docs.map(x=>hydrate<Category>(x));
    while(cursor<current.start&&steps++<(budget.cycleType==='weekly'?160:36)){const next=budgetWindow(budget,new Date(cursor+'T12:00:00'),salaryDay).end;if(next<=cursor)throw Error('Periode sisa anggaran tidak dapat dihitung.');const snap=await getDocs(query(coll(uid,'transactions'),where('date','>=',cursor),where('date','<',next)));const tx=snap.docs.map(x=>hydrate<LedgerTx>(x));carry+=budget.amount-budgetSpent(budget,tx,categories);cursor=next;}
    if(cursor<current.start)throw Error('Riwayat anggaran terlalu panjang untuk dihitung sekaligus.');
    await runTx(database(),async trx=>{const r=ref(uid,'budgets',budget.id),snap=await trx.get(r);if(!snap.exists()||snap.data().lastSettledStart!==budget.lastSettledStart)return;trx.update(r,{rolloverCarry:carry,lastSettledStart:current.start,updatedAt:serverTimestamp()});});
  }
}
export async function editOpeningRecord(uid:string,kind:'claims'|'receivables'|'debts',id:string,changes:Record<string,unknown>,newAmount:number){
  if(!validAmount(newAmount))throw Error('Nominal harus lebih dari nol.');
  const relationKey=kind==='claims'?'claimId':kind==='receivables'?'receivableId':'debtId';
  const openingType=kind==='claims'?'claim_advance':kind==='receivables'?'receivable_issue':'borrowing';
  const found=await getDocs(query(coll(uid,'transactions'),where(relationKey,'==',id)));const first=found.docs.find(s=>s.data().type===openingType);
  await runTx(database(),async trx=>{const rr=ref(uid,kind,id),snapshot=await trx.get(rr);if(!snapshot.exists())throw Error('Catatan tidak ditemukan.');const old=snapshot.data();const txSnap=first?await trx.get(first.ref):null;
    const key=kind==='claims'?'amount':'originalAmount',oldAmount=Number(old[key]),delta=newAmount-oldAmount,remainingKey=kind==='debts'?'outstandingAmount':'remainingAmount';
    const nextRemaining=Number(old[remainingKey])+delta;if(nextRemaining<0)throw Error('Nominal baru lebih kecil daripada pembayaran yang sudah diterima.');
    if(first&&!txSnap?.exists())throw Error('Transaksi pembuka tidak ditemukan. Coba lagi.');
    if(first&&txSnap){const t=txSnap.data() as LedgerTx;const walletDelta=kind==='debts'?delta:-delta;trx.update(ref(uid,'wallets',t.walletId),{cachedBalance:increment(walletDelta),updatedAt:serverTimestamp()});trx.update(first.ref,{amount:newAmount,updatedAt:serverTimestamp()});}
    trx.update(rr,{...changes,[key]:newAmount,[remainingKey]:nextRemaining,updatedAt:serverTimestamp()});
  });await syncSnapshot(uid,first?.data().date||'0000-01-01');
}
export async function deleteOpeningRecord(uid:string,kind:'claims'|'receivables'|'debts',id:string){
  const relationKey=kind==='claims'?'claimId':kind==='receivables'?'receivableId':'debtId',openingType=kind==='claims'?'claim_advance':kind==='receivables'?'receivable_issue':'borrowing';
  const found=await getDocs(query(coll(uid,'transactions'),where(relationKey,'==',id)));const opening=found.docs.find(s=>s.data().type===openingType);
  await runTx(database(),async trx=>{const rr=ref(uid,kind,id),snap=await trx.get(rr);if(!snap.exists())return;const row=snap.data(),initial=Number(kind==='claims'?row.amount:row.originalAmount),remaining=Number(kind==='debts'?row.outstandingAmount:row.remainingAmount);if(remaining!==initial)throw Error('Catatan yang sudah memiliki pembayaran tidak dapat dihapus. Koreksi transaksi pembayarannya terlebih dahulu.');const t=opening?await trx.get(opening.ref):null;if(opening&&!t?.exists())throw Error('Transaksi pembuka tidak tersedia.');if(t?.exists()){const tx=hydrate<LedgerTx>(t);for(const [wallet,delta] of Object.entries(effects(tx)))trx.update(ref(uid,'wallets',wallet),{cachedBalance:increment(-delta),updatedAt:serverTimestamp()});trx.delete(t.ref);}trx.delete(rr);});await syncSnapshot(uid,opening?.data().date||'0000-01-01');
}
export async function attachClaimReceipt(uid:string,id:string,file:File){
  if(file.size>10*1024*1024)throw Error('Ukuran file maksimal 10 MB.');
  if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Gunakan PDF, PNG, JPG, atau WebP.');
  const {storage}=await import('./firebase');if(!storage)throw Error('Firebase Storage belum tersedia.');
  const {ref:storageRef,uploadBytes}=await import('firebase/storage');
  const path=`users/${uid}/claims/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  await uploadBytes(storageRef(storage,path),file,{contentType:file.type});
  await settle(updateDoc(ref(uid,'claims',id),{attachmentPath:path,updatedAt:serverTimestamp()}));
}
export async function claimReceiptUrl(path:string){const {storage}=await import('./firebase');if(!storage)throw Error('Firebase Storage belum tersedia.');const {ref:storageRef,getDownloadURL}=await import('firebase/storage');return getDownloadURL(storageRef(storage,path));}
export async function loadAllTransactions(uid:string){const result:LedgerTx[]=[];let cursor:QueryDocumentSnapshot|undefined;while(true){const q=query(coll(uid,'transactions'),orderBy('date','desc'),...(cursor?[startAfter(cursor)]:[]),limit(300));const snap=await getDocs(q);result.push(...snap.docs.map(d=>hydrate<LedgerTx>(d)));if(snap.size<300)break;cursor=snap.docs[snap.docs.length-1];}return result;}
export async function mergeCategory(uid:string,from:Category,to:Category){if(from.id===to.id||from.type!==to.type||Boolean(from.parentId)!==Boolean(to.parentId))throw Error('Pilih kategori tujuan dengan jenis dan tingkat yang sama.');
  const affected:{r:DocumentReference;field:'categoryId'|'subcategoryId'|'parentId'}[]=[];
  for(const name of ['transactions','budgets','categories'] as const)for(const field of (name==='categories'?['parentId']:['categoryId','subcategoryId']) as ('categoryId'|'subcategoryId'|'parentId')[]){const snaps=await getDocs(query(coll(uid,name),where(field,'==',from.id)));for(const row of snaps.docs)affected.push({r:row.ref,field});}
  for(let i=0;i<affected.length;i+=300){const batch=writeBatch(database());for(const item of affected.slice(i,i+300))batch.update(item.r,{[item.field]:to.id,updatedAt:serverTimestamp()});await settle(batch.commit());}
  const nested=(await loadAllTransactions(uid)).filter(tx=>tx.transferFeeCategoryId===from.id||tx.splits?.some(line=>line.categoryId===from.id||line.subcategoryId===from.id));
  for(let i=0;i<nested.length;i+=300){const batch=writeBatch(database());for(const tx of nested.slice(i,i+300))batch.update(ref(uid,'transactions',tx.id),{transferFeeCategoryId:tx.transferFeeCategoryId===from.id?to.id:tx.transferFeeCategoryId||null,splits:(tx.splits||[]).map(line=>({...line,categoryId:line.categoryId===from.id?to.id:line.categoryId,subcategoryId:line.subcategoryId===from.id?to.id:line.subcategoryId})),updatedAt:serverTimestamp()});await settle(batch.commit());}
  for(const name of ['plannedTransactions','recurring','drafts','financialNotes'] as const)for(const field of name==='plannedTransactions'?['categoryId','subcategoryId']:['categoryId']){const snaps=await getDocs(query(coll(uid,name),where(field,'==',from.id)));for(let i=0;i<snaps.docs.length;i+=300){const batch=writeBatch(database());for(const row of snaps.docs.slice(i,i+300))batch.update(row.ref,{[field]:to.id,updatedAt:serverTimestamp()});await settle(batch.commit());}}
  const history=await getDocs(coll(uid,'cycleSnapshots'));for(const snap of history.docs){const budgets=snap.data().budgetDefinitions as Budget[]|undefined;if(budgets?.some(b=>b.categoryId===from.id||b.subcategoryId===from.id))await settle(updateDoc(snap.ref,{budgetDefinitions:budgets.map(b=>({...b,categoryId:b.categoryId===from.id?to.id:b.categoryId,subcategoryId:b.subcategoryId===from.id?to.id:b.subcategoryId})),updatedAt:serverTimestamp()}));}
  await settle(updateDoc(ref(uid,'categories',from.id),{isArchived:true,updatedAt:serverTimestamp()}));await syncSnapshot(uid,'0000-01-01');return affected.length+nested.length;
}

export async function createDueDrafts(uid:string,recurring:Recurring[],today=new Date().toLocaleDateString('en-CA')){for(const schedule of recurring.filter(r=>r.active&&r.nextDate&&r.nextDate<=today)){let count=0;while(count++<12){const sr=ref(uid,'recurring',schedule.id);const current=await getDoc(sr);if(!current.exists())break;const due=current.data().nextDate as string;if(due>today)break;const next=advanceSchedule(due,schedule.frequency,scheduleDay({nextDate:due,anchorDay:current.data().anchorDay}));const mode=(current.data().mode||'reminder') as Recurring['mode'];const draftId=`${schedule.id}_${due}`;const dr=ref(uid,'drafts',draftId);await runTx(database(),async trx=>{const [actual,existing]=await Promise.all([trx.get(sr),trx.get(dr)]);if(!actual.exists()||actual.data().nextDate!==due)return;if(mode!=='reminder'&&!existing.exists())trx.set(dr,{recurringId:schedule.id,plannedDate:due,type:schedule.type,amount:schedule.amount,walletId:schedule.walletId,destinationWalletId:schedule.destinationWalletId||null,categoryId:schedule.categoryId||null,name:schedule.name,status:'pending',mode,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});trx.update(sr,{nextDate:next,updatedAt:serverTimestamp()});});}}}
export async function postAutoDrafts(uid:string,drafts:Draft[]){for(const draft of drafts.filter(d=>d.status==='pending'&&d.mode==='auto')){try{await upsertTransaction(uid,newTx({type:draft.type,amount:draft.amount,date:draft.plannedDate,walletId:draft.walletId,destinationWalletId:draft.destinationWalletId,categoryId:draft.categoryId,description:draft.name,draftId:draft.id,recurringTransactionId:draft.recurringId}));}catch(error){console.error('Transaksi otomatis perlu ditinjau:',error);}}}
export async function dismissDraft(uid:string,id:string){await runTx(database(),async trx=>{const r=ref(uid,'drafts',id),draft=await trx.get(r);if(!draft.exists()||draft.data().status!=='pending')throw Error('Transaksi ini sudah diproses.');trx.update(r,{status:'dismissed',updatedAt:serverTimestamp()})});}

export async function rejectClaim(uid:string,id:string){const r=ref(uid,'claims',id),t=doc(coll(uid,'transactions'));await runTx(database(),async trx=>{const snap=await trx.get(r);if(!snap.exists())throw Error('Klaim tidak ditemukan.');const c=snap.data() as Claim;if(c.remainingAmount<=0)throw Error('Klaim sudah selesai.');const {id:_ignored,...event}=newTx({type:'claim_writeoff',amount:c.remainingAmount,walletId:c.sourceWalletId,claimId:id,description:`Klaim ditolak: ${c.name}`});trx.set(t,{...event,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});trx.update(r,{remainingAmount:0,status:'rejected',updatedAt:serverTimestamp()});});await syncSnapshot(uid,new Date().toLocaleDateString('en-CA'));}

/**
 * Adds starter categories as normal user-owned records. Ids are deterministic and every id
 * is read first, so running this twice (or on two devices at once) never creates duplicates
 * and never overwrites a category the user already has.
 */
export async function seedCategoryTemplates(uid:string,records:import('./category-templates').SeedRecord[]){
  if(!records.length)return 0;
  const version=(await import('./category-templates')).CATEGORY_TEMPLATE_VERSION;
  return runTx(database(),async trx=>{
    const refs=records.map(record=>ref(uid,'categories',record.id));
    const existing=await Promise.all(refs.map(r=>trx.get(r)));
    let created=0;
    records.forEach((record,index)=>{if(existing[index].exists())return;trx.set(refs[index],{...record.data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});created++;});
    trx.set(userRef(uid),{defaultCategoryTemplateVersion:version,updatedAt:serverTimestamp()},{merge:true});
    return created;
  });
}

/** Settle part of a receivable or debt without moving money in any wallet (e.g. it was paid in cash that was never recorded). */
export async function settleWithoutWallet(uid:string,kind:'receivables'|'debts',id:string,amount:number,date:string,note=''){
  if(!validAmount(amount))throw Error('Nominal harus lebih dari nol.');
  await runTx(database(),async trx=>{const rr=ref(uid,kind,id),snap=await trx.get(rr);if(!snap.exists())throw Error('Catatan tidak ditemukan.');const row=snap.data();
    const key=kind==='debts'?'outstandingAmount':'remainingAmount',remaining=Number(row[key]);if(amount>remaining)throw Error(`Nominal melebihi sisa ${kind==='debts'?'utang':'piutang'} (Rp${remaining.toLocaleString('id-ID')}).`);
    const next=remaining-amount,original=Number(row.originalAmount);const payments=[...((row.manualPayments||[]) as ManualPayment[]),{id:crypto.randomUUID(),amount,date,...(note?{note}:{})}];
    trx.update(rr,{[key]:next,status:kind==='debts'?(next===0?'paid':'open'):(next===0?'paid':next<original?'partial':'open'),manualPayments:payments,updatedAt:serverTimestamp()});});
  await syncSnapshot(uid,date);
}
/** Undo a settlement made without a wallet. */
export async function undoManualPayment(uid:string,kind:'receivables'|'debts',id:string,paymentId:string){
  let date='0000-01-01';
  await runTx(database(),async trx=>{const rr=ref(uid,kind,id),snap=await trx.get(rr);if(!snap.exists())throw Error('Catatan tidak ditemukan.');const row=snap.data();const list=(row.manualPayments||[]) as ManualPayment[];const payment=list.find(p=>p.id===paymentId);if(!payment)return;date=payment.date;
    const key=kind==='debts'?'outstandingAmount':'remainingAmount',next=Number(row[key])+payment.amount,original=Number(row.originalAmount);
    trx.update(rr,{[key]:next,status:kind==='debts'?(next===0?'paid':'open'):(next===0?'paid':next<original?'partial':'open'),manualPayments:list.filter(p=>p.id!==paymentId),updatedAt:serverTimestamp()});});
  await syncSnapshot(uid,date);
}
/** Wish list: create or update one item (money set aside is an earmark, no wallet changes). */
export async function saveWish(uid:string,record:Partial<WishItem>,id?:string){ const r=id?ref(uid,'wishlist',id):doc(coll(uid,'wishlist')); const {id:_i,createdAt:_c,updatedAt:_u,...fields}=record; if(id) await settle(updateDoc(r,{...fields,updatedAt:serverTimestamp()})); else await settle(setDoc(r,{...fields,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})); return r.id; }
export async function deleteWish(uid:string,id:string){ const b=writeBatch(database()); b.delete(ref(uid,'wishlist',id)); await settle(b.commit()); }
/** Quick switches for how a wallet counts (Uang bebas / Aset bersih) without opening the wallet form. */
export async function updateWalletFlags(uid:string,id:string,changes:Partial<Pick<Wallet,'isReserved'|'isSpendable'|'includeInNetWorth'>>){await settle(updateDoc(ref(uid,'wallets',id),{...changes,updatedAt:serverTimestamp()}));}
