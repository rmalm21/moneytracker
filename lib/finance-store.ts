import { doc, getDoc, getDocs, increment, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { coll, loadAllTransactions, newTx, ref, upsertTransaction } from './firestore';
import { effects, walletBalance } from './accounting';
import { calculateCycleSnapshot, cycleId, type HealthIssue } from './finance-control';
import { emptyData, type CycleSnapshot, type Data, type FinancialNote, type LedgerTx, type PlannedTransaction, type Wallet } from './types';
import type { DateRange } from './period';

function database(){if(!db)throw Error('Database belum tersedia.');return db;}
const hydrate=<T>(row:{id:string;data:()=>unknown})=>({id:row.id,...row.data() as object}) as T;

export async function walletBalancePreview(uid:string,id:string){
  const walletSnap=await getDoc(ref(uid,'wallets',id));if(!walletSnap.exists())throw Error('Dompet tidak ditemukan.');
  const wallet=hydrate<Wallet>(walletSnap);
  const [sources,destinations]=await Promise.all([getDocs(query(coll(uid,'transactions'),where('walletId','==',id))),getDocs(query(coll(uid,'transactions'),where('destinationWalletId','==',id)))]);
  const ledger=new Map<string,LedgerTx>();for(const row of [...sources.docs,...destinations.docs])ledger.set(row.id,hydrate<LedgerTx>(row));
  const calculated=walletBalance(wallet,[...ledger.values()]);
  return {wallet,calculated,cached:wallet.cachedBalance,difference:calculated-wallet.cachedBalance,transactions:ledger.size};
}
export async function repairWalletCache(uid:string,id:string,expected:number){
  const preview=await walletBalancePreview(uid,id);
  if(preview.cached!==expected)throw Error('Saldo berubah. Periksa ulang sebelum menyamakan saldo.');
  await runTransaction(database(),async trx=>{const r=ref(uid,'wallets',id),snap=await trx.get(r);if(!snap.exists()||snap.data().cachedBalance!==expected)throw Error('Saldo berubah. Periksa ulang dahulu.');trx.update(r,{cachedBalance:preview.calculated,updatedAt:serverTimestamp()});});
  try{await refreshCycleSnapshots(uid,'0000-01-01');return {balance:preview.calculated,warning:''}}catch(error){console.error(error);return {balance:preview.calculated,warning:'Saldo sudah disamakan, tetapi ringkasan siklus belum dapat diperbarui. Buka Riwayat Siklus → Perbarui laporan.'}}
}
export async function reconcileWallet(uid:string,id:string,expectedCached:number,actual:number,notes:string,date?:string){
  if(!Number.isSafeInteger(actual)||actual<0)throw Error('Saldo aktual harus berupa Rupiah yang valid.');
  const preview=await walletBalancePreview(uid,id);
  if(preview.cached!==preview.calculated)throw Error('Saldo tersimpan berbeda dari catatan transaksi. Jalankan Hitung ulang saldo dahulu.');
  if(preview.cached!==expectedCached)throw Error('Saldo berubah. Periksa ulang sebelum menyesuaikan.');
  const delta=actual-preview.cached;if(!delta)throw Error('Saldo sudah cocok; tidak diperlukan penyesuaian.');
  const record=newTx({type:'adjustment',walletId:id,amount:Math.abs(delta),adjustmentDirection:delta>0?'in':'out',reconciliationReason:'Balance Reconciliation',description:'Cocokkan saldo',notes,date});
  const r=doc(coll(uid,'transactions'));
  await runTransaction(database(),async trx=>{const walletRef=ref(uid,'wallets',id),snap=await trx.get(walletRef);if(!snap.exists()||snap.data().cachedBalance!==expectedCached)throw Error('Saldo berubah. Periksa ulang dahulu.');const {id:_id,...fields}=record;trx.set(r,{...fields,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});trx.update(walletRef,{cachedBalance:increment(delta),updatedAt:serverTimestamp()});});
  try{await refreshCycleSnapshots(uid,record.date);return {id:r.id,warning:''}}catch(error){console.error(error);return {id:r.id,warning:'Penyesuaian sudah dicatat, tetapi laporan siklus belum dapat diperbarui. Buka Riwayat Siklus → Perbarui laporan.'}}
}

async function fullSnapshotData(uid:string):Promise<{data:Data;ledger:LedgerTx[]}>{
  const keys=['wallets','categories','budgets','claims','receivables','debts','funds','financialNotes'] as const;
  const [ledger,...snapshots]=await Promise.all([loadAllTransactions(uid),...keys.map(key=>getDocs(coll(uid,key)))]);
  const data={...emptyData,transactions:ledger};
  snapshots.forEach((snapshot,index)=>{(data as unknown as Record<string,unknown>)[keys[index]]=snapshot.docs.map(row=>({id:row.id,...row.data()}));});
  return {data,ledger};
}
function verifyBalances(data:Data,ledger:LedgerTx[]){for(const wallet of data.wallets){if(walletBalance(wallet,ledger)!==wallet.cachedBalance)throw Error(`Saldo tersimpan ${wallet.name} berbeda dari transaksi. Buka Dompet → Hitung ulang saldo sebelum memperbarui laporan siklus.`)}}
export async function closeCycle(uid:string,range:DateRange,today:string){
  if(!range.start||range.start>=range.end||range.end>today)throw Error('Siklus baru bisa ditutup setelah tanggal akhirnya lewat.');
  const {data,ledger}=await fullSnapshotData(uid);
  verifyBalances(data,ledger);
  const values=calculateCycleSnapshot(data,ledger,range),id=cycleId(range),r=ref(uid,'cycleSnapshots',id);
  await runTransaction(database(),async trx=>{const existing=await trx.get(r);if(existing.exists())throw Error('Siklus ini sudah ditutup.');trx.set(r,{...values,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});});
  return id;
}
export async function refreshCycleSnapshots(uid:string,affectedDate:string){
  const history=await getDocs(coll(uid,'cycleSnapshots'));
  const affected=history.docs.filter(row=>row.data().endDate>affectedDate);
  if(!affected.length)return 0;
  const {data,ledger}=await fullSnapshotData(uid);
  verifyBalances(data,ledger);
  for(let index=0;index<affected.length;index+=250){const batch=writeBatch(database());for(const snap of affected.slice(index,index+250)){const previous=hydrate<CycleSnapshot>(snap);const range={start:previous.startDate,end:previous.endDate};batch.update(snap.ref,{...calculateCycleSnapshot(data,ledger,range,previous),updatedAt:serverTimestamp()});}await batch.commit();}
  return affected.length;
}
export function subscribeCycleSnapshots(uid:string,onValue:(items:CycleSnapshot[])=>void,onError:(error:Error)=>void){return onSnapshot(coll(uid,'cycleSnapshots'),snap=>onValue(snap.docs.map(row=>hydrate<CycleSnapshot>(row)).sort((a,b)=>b.startDate.localeCompare(a.startDate))),onError);}

export async function savePlan(uid:string,plan:Omit<PlannedTransaction,'id'|'createdAt'|'updatedAt'>,id?:string){
  if(!plan.title.trim()||!Number.isSafeInteger(plan.amount)||plan.amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(plan.date))throw Error('Lengkapi nama, nominal, dan tanggal rencana.');
  if(id){await runTransaction(database(),async trx=>{const r=ref(uid,'plannedTransactions',id),existing=await trx.get(r);if(!existing.exists()||existing.data().status!=='planned')throw Error('Rencana yang sudah diproses tidak dapat diubah.');trx.update(r,{...plan,status:'planned',updatedAt:serverTimestamp()})});return id;}
  const r=doc(coll(uid,'plannedTransactions'));await setDoc(r,{...plan,status:'planned',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});return r.id;
}
export async function cancelPlan(uid:string,id:string){await runTransaction(database(),async trx=>{const r=ref(uid,'plannedTransactions',id),snap=await trx.get(r);if(!snap.exists()||snap.data().status!=='planned')throw Error('Rencana sudah diproses.');trx.update(r,{status:'cancelled',updatedAt:serverTimestamp()});});}
export async function saveFinancialNote(uid:string,note:Omit<FinancialNote,'id'|'createdAt'|'updatedAt'>,id?:string){if(!note.title.trim()||!note.date)throw Error('Isi judul dan tanggal catatan.');const r=id?ref(uid,'financialNotes',id):doc(coll(uid,'financialNotes'));if(id)await updateDoc(r,{...note,updatedAt:serverTimestamp()});else await setDoc(r,{...note,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});return r.id;}
export async function deleteFinancialNote(uid:string,id:string){const {deleteDoc}=await import('firebase/firestore');await deleteDoc(ref(uid,'financialNotes',id));}