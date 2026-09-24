import { budgetSpent, budgetWindow, effects, expenseAllocations, transactionExpense } from './accounting.ts';
import { nextDate, previousDate, type DateRange } from './period.ts';
import type { Budget, Category, CycleSnapshot, Data, LedgerTx, PlannedTransaction, Profile, Recurring, Wallet } from './types';

export const inRange=(date:string,range:DateRange)=>date>=range.start&&date<range.end;
export const cycleId=(range:DateRange)=>range.start;
export const isCycleClosed=(date:string,snapshots:CycleSnapshot[])=>snapshots.some(row=>date>=row.startDate&&date<row.endDate);

export type Commitment={id:string;title:string;date:string;amount:number;categoryId:string|null;subcategoryId:string|null;walletId:string|null;source:'inbox'|'planned'|'recurring'};
export function commitments(data:Data,range?:DateRange):Commitment[]{
  const items:Commitment[]=[];
  for(const draft of data.drafts)if(draft.status==='pending'&&draft.type==='expense')items.push({id:`draft:${draft.id}`,title:draft.name,date:draft.plannedDate,amount:draft.amount,categoryId:draft.categoryId,subcategoryId:null,walletId:draft.walletId,source:'inbox'});
  for(const plan of data.plannedTransactions)if(plan.status==='planned'&&plan.committed&&plan.type==='expense')items.push({id:`plan:${plan.id}`,title:plan.title,date:plan.date,amount:plan.amount,categoryId:plan.categoryId,subcategoryId:plan.subcategoryId,walletId:plan.walletId,source:'planned'});
  if(range)for(const recurring of data.recurring.filter(row=>row.active&&row.type==='expense'&&row.mode!=='reminder')){
    let day=recurring.nextDate,count=0;
    while(day&&day<range.end&&count++<60){
      if(day>=range.start)items.push({id:`recurring:${recurring.id}:${day}`,title:recurring.name,date:day,amount:recurring.amount,categoryId:recurring.categoryId,subcategoryId:null,walletId:recurring.walletId,source:'recurring'});
      day=advanceRecurring(day,recurring.frequency);
    }
  }
  return items.filter(item=>!range||inRange(item.date,range));
}
export function budgetCommitted(budget:Budget,data:Data,asOf:Date,salaryDay:number){
  const window=budgetWindow(budget,asOf,salaryDay);
  const children=new Set(data.categories.filter(c=>c.parentId===budget.categoryId).map(c=>c.id));
  const pending=[...commitments(data,window),...commitments(data).filter(item=>item.date<window.start)];
  return pending.filter(item=>budget.subcategoryId?item.subcategoryId===budget.subcategoryId:item.categoryId===budget.categoryId||children.has(item.categoryId||'')||children.has(item.subcategoryId||'')).reduce((sum,item)=>sum+item.amount,0);
}
function advanceRecurring(date:string,frequency:Recurring['frequency']){
  if(frequency==='weekly'){let day=date;for(let i=0;i<7;i++)day=nextDate(day);return day;}
  const d=new Date(`${date}T12:00:00`),day=d.getDate();
  if(frequency==='monthly')d.setMonth(d.getMonth()+1,1);else d.setFullYear(d.getFullYear()+1,d.getMonth(),1);
  d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export type UpcomingEvent={id:string;date:string;title:string;amount:number;kind:'income'|'expense'|'debt'|'claim'|'receivable'|'fund'|'note';status:'planned'|'pending'|'actual';categoryId?:string|null;walletId?:string|null};
export function upcomingEvents(data:Data,profile:Profile,range:DateRange):UpcomingEvent[]{
  const events:UpcomingEvent[]=[];
  const add=(event:UpcomingEvent)=>{if(inRange(event.date,range))events.push(event);};
  for(const plan of data.plannedTransactions.filter(x=>x.status==='planned'))add({id:`plan:${plan.id}`,date:plan.date,title:plan.title,amount:plan.type==='income'?plan.amount:-plan.amount,kind:plan.type,status:'planned',categoryId:plan.categoryId,walletId:plan.walletId});
  for(const draft of data.drafts.filter(x=>x.status==='pending'))add({id:`draft:${draft.id}`,date:draft.plannedDate,title:draft.name,amount:draft.type==='income'?draft.amount:-draft.amount,kind:draft.type==='income'?'income':'expense',status:'pending',categoryId:draft.categoryId,walletId:draft.walletId});
  for(const recurring of data.recurring.filter(x=>x.active)){
    let date=recurring.nextDate,count=0;
    while(date&&date<range.end&&count++<60){add({id:`recurring:${recurring.id}:${date}`,date,title:recurring.name,amount:recurring.type==='income'?recurring.amount:-recurring.amount,kind:recurring.type==='income'?'income':'expense',status:'planned',categoryId:recurring.categoryId,walletId:recurring.walletId});date=advanceRecurring(date,recurring.frequency);}
  }
  for(const debt of data.debts.filter(x=>x.outstandingAmount>0&&x.dueDate))add({id:`debt:${debt.id}`,date:debt.dueDate,title:debt.name,amount:-Math.min(debt.installmentAmount||debt.outstandingAmount,debt.outstandingAmount),kind:'debt',status:'planned'});
  for(const claim of data.claims.filter(x=>x.remainingAmount>0&&x.expectedPaymentDate))add({id:`claim:${claim.id}`,date:claim.expectedPaymentDate,title:claim.name,amount:claim.remainingAmount,kind:'claim',status:'planned'});
  for(const receivable of data.receivables.filter(x=>x.remainingAmount>0&&x.dueDate))add({id:`receivable:${receivable.id}`,date:receivable.dueDate,title:receivable.person,amount:receivable.remainingAmount,kind:'receivable',status:'planned'});
  // Target date is a goal, not an authorized monthly payment. A contribution is
  // projected only if the user creates a plan for it.
  if(profile.monthlySalary>0){let date=range.start,count=0;while(date<range.end&&count++<400){if(Number(date.slice(-2))===Math.min(profile.salaryCycleStartDay||24,new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate())&&!events.some(event=>event.date===date&&event.kind==='income'&&/gaji|salary/i.test(event.title))&&!data.transactions.some(tx=>tx.date===date&&tx.type==='income'&&(tx.categoryId===profile.salaryIncomeCategoryId||/gaji|salary/i.test(`${tx.description} ${tx.merchant}`))))add({id:`salary:${date}`,date,title:'Perkiraan gaji',amount:profile.monthlySalary,kind:'income',status:'planned'});date=nextDate(date);}}
  for(const note of data.financialNotes)if(note.date) add({id:`note:${note.id}`,date:note.date,title:note.title,amount:note.amount||0,kind:'note',status:'planned'});
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}

function walletAt(wallet:Wallet,ledger:LedgerTx[],cutoff:string){
  const created=wallet.createdAt as {seconds?:number}|undefined;
  if(created?.seconds&&new Date(created.seconds*1000).toISOString().slice(0,10)>=cutoff)return 0;
  return wallet.cachedBalance-ledger.filter(tx=>tx.date>=cutoff).reduce((sum,tx)=>sum+(effects(tx)[wallet.id]||0),0);
}
function debtAt(data:Data,ledger:LedgerTx[],cutoff:string){return data.debts.reduce((sum,debt)=>{const created=debt.createdAt as {seconds?:number}|undefined;if(created?.seconds&&new Date(created.seconds*1000).toISOString().slice(0,10)>=cutoff)return sum;return sum+Math.max(0,debt.outstandingAmount+ledger.filter(tx=>tx.debtId===debt.id&&tx.type==='debt_payment'&&tx.date>=cutoff).reduce((n,tx)=>n+tx.amount,0));},0);}
function claimsAt(data:Data,ledger:LedgerTx[],cutoff:string){return data.claims.reduce((sum,claim)=>sum+(claim.submissionDate>=cutoff?0:Math.max(0,claim.remainingAmount+ledger.filter(tx=>tx.claimId===claim.id&&['claim_payment','claim_writeoff'].includes(tx.type)&&tx.date>=cutoff).reduce((n,tx)=>n+tx.amount,0))),0);}
function receivablesAt(data:Data,ledger:LedgerTx[],cutoff:string){return data.receivables.reduce((sum,item)=>sum+(item.date>=cutoff?0:Math.max(0,item.remainingAmount+ledger.filter(tx=>tx.receivableId===item.id&&tx.type==='receivable_payment'&&tx.date>=cutoff).reduce((n,tx)=>n+tx.amount,0))),0);}
export function calculateCycleSnapshot(data:Data,ledger:LedgerTx[],range:DateRange,previous?:CycleSnapshot):Omit<CycleSnapshot,'id'|'createdAt'|'updatedAt'>{
  const transactions=ledger.filter(tx=>inRange(tx.date,range));
  const at=(date:string)=>{
    const owned=data.wallets.filter(w=>w.includeInNetWorth!==false);
    const balances=owned.map(w=>({wallet:w,amount:walletAt(w,ledger,date)}));
    const assets=balances.reduce((sum,row)=>sum+Math.max(0,row.amount),0);
    const signed=balances.reduce((sum,row)=>sum+row.amount,0);
    const unlinkedFunds=data.funds.filter(f=>!data.wallets.find(w=>w.id===f.linkedWalletId)?.isReserved).reduce((sum,f)=>sum+Math.max(0,f.currentAmount-ledger.filter(tx=>tx.fundId===f.id&&tx.type==='fund_contribution'&&tx.date>=date).reduce((n,tx)=>n+tx.amount,0)),0);
    return {assets,netWorth:signed+claimsAt(data,ledger,date)+receivablesAt(data,ledger,date)-debtAt(data,ledger,date),reserved:balances.filter(row=>row.wallet.isReserved).reduce((sum,row)=>sum+Math.max(0,row.amount),0)+unlinkedFunds};
  };
  const opening=at(range.start),closing=at(range.end);
  const income=transactions.filter(tx=>tx.type==='income').reduce((sum,tx)=>sum+tx.amount,0);
  const expense=transactions.reduce((sum,tx)=>sum+transactionExpense(tx),0);
  const budgets=previous?.budgetDefinitions||data.budgets.filter(b=>b.active&&(!b.createdDate||b.createdDate<range.end));
  const budgetTotal=previous?.budgetTotal??budgets.reduce((sum,b)=>sum+b.amount,0);
  const budgetUsed=budgets.reduce((sum,b)=>sum+budgetSpent(b,transactions,data.categories),0);
  return {startDate:range.start,endDate:range.end,openingAssets:opening.assets,closingAssets:closing.assets,openingNetWorth:opening.netWorth,closingNetWorth:closing.netWorth,income,expense,cashFlow:income-expense,budgetTotal,budgetSpent:budgetUsed,budgetRemaining:budgetTotal-budgetUsed,budgetDefinitions:budgets,reservedMoney:closing.reserved,debtOutstanding:debtAt(data,ledger,range.end),claimsOutstanding:claimsAt(data,ledger,range.end),savings:transactions.filter(tx=>tx.type==='fund_contribution').reduce((sum,tx)=>sum+tx.amount,0),debtPaid:transactions.filter(tx=>tx.type==='debt_payment').reduce((sum,tx)=>sum+tx.amount,0),claimReceived:transactions.filter(tx=>tx.type==='claim_payment').reduce((sum,tx)=>sum+tx.amount,0),notes:previous?.notes||''};
}

export type HealthIssue={id:string;title:string;impact:string;action:string;walletId?:string};
export function scanData(data:Data,ledger:LedgerTx[],profile:Profile):HealthIssue[]{
  const issues:HealthIssue[]=[];
  const wallets=new Map(data.wallets.map(wallet=>[wallet.id,wallet])),categories=new Map(data.categories.map(category=>[category.id,category]));
  for(const wallet of data.wallets){const calculated=wallet.openingBalance+ledger.reduce((sum,tx)=>sum+(effects(tx)[wallet.id]||0),0);if(calculated!==wallet.cachedBalance)issues.push({id:`balance:${wallet.id}`,title:`Saldo ${wallet.name} berbeda ${Math.abs(calculated-wallet.cachedBalance).toLocaleString('id-ID')}`,impact:'Saldo tersimpan berbeda dari transaksi yang dicatat.',action:'Periksa perhitungan saldo sebelum menyamakan saldo.',walletId:wallet.id});}
  for(const tx of ledger){
    if(!wallets.has(tx.walletId)||tx.destinationWalletId&&!wallets.has(tx.destinationWalletId))issues.push({id:`wallet:${tx.id}`,title:`Transaksi ${tx.description||tx.id} memakai dompet tidak tersedia`,impact:'Saldo transaksi ini mungkin tidak tercermin.',action:'Periksa dompet dan tautan transaksi.'});
    else if(wallets.get(tx.walletId)?.isArchived||tx.destinationWalletId&&wallets.get(tx.destinationWalletId)?.isArchived){const archivedId=wallets.get(tx.walletId)?.isArchived?tx.walletId:tx.destinationWalletId!;if(!issues.some(issue=>issue.id===`archivedWallet:${archivedId}`))issues.push({id:`archivedWallet:${archivedId}`,title:`Dompet ${wallets.get(archivedId)?.name} sudah diarsipkan`,impact:'Riwayat tetap tersimpan dengan dompet arsip.',action:'Tidak perlu tindakan bila arsip ini disengaja.'});}
    if(tx.type==='expense'&&!tx.categoryId&&!tx.splits?.length)issues.push({id:`category:${tx.id}`,title:`Transaksi ${tx.description||tx.id} tanpa kategori`,impact:'Anggaran dan analisis kategori kurang lengkap.',action:'Edit kategori transaksi.'});
    for(const id of [tx.categoryId,tx.subcategoryId,tx.transferFeeCategoryId,...(tx.splits||[]).flatMap(x=>[x.categoryId,x.subcategoryId])])if(id&&(!categories.has(id)||categories.get(id)?.isArchived)&&!issues.some(issue=>issue.id===`reference:${id}`))issues.push({id:`reference:${id}`,title:`Kategori ${id} pada transaksi perlu ditinjau`,impact:'Pengelompokan riwayat bisa tidak lengkap.',action:'Periksa kategori yang diarsipkan atau hilang.'});
    if(tx.splits?.length&&tx.splits.reduce((sum,line)=>sum+line.amount,0)!==tx.amount)issues.push({id:`split:${tx.id}`,title:`Pembagian ${tx.description||tx.id} tidak cocok`,impact:'Anggaran kategori tidak sesuai nominal transaksi.',action:'Perbaiki pembagian transaksi.'});
    if(tx.type==='claim_payment'&&tx.claimId&&!data.claims.some(c=>c.id===tx.claimId)||tx.type==='debt_payment'&&tx.debtId&&!data.debts.some(d=>d.id===tx.debtId)||tx.type==='receivable_payment'&&tx.receivableId&&!data.receivables.some(r=>r.id===tx.receivableId)||tx.fundId&&!data.funds.some(f=>f.id===tx.fundId))issues.push({id:`orphan:${tx.id}`,title:`Catatan terkait ${tx.description||tx.id} tidak ditemukan`,impact:'Saldo dan status catatan terkait dapat berbeda.',action:'Periksa transaksi dan tautan utang, klaim, piutang, atau dana.'});
    if(!Number.isSafeInteger(tx.amount)||tx.amount<=0||tx.transferFee!==undefined&&(!Number.isSafeInteger(tx.transferFee)||tx.transferFee<0))issues.push({id:`amount:${tx.id}`,title:'Nominal transaksi tidak valid',impact:'Ringkasan keuangan dapat keliru.',action:'Periksa transaksi dan perbaiki nominalnya.'});
  }
  const duplicates=new Map<string,number>();for(const row of data.recurring){const key=`${row.name.toLowerCase()}:${row.walletId}:${row.amount}:${row.nextDate}`;duplicates.set(key,(duplicates.get(key)||0)+1);}for(const [key,count] of duplicates)if(count>1)issues.push({id:`duplicate:${key}`,title:'Ada jadwal rutin yang mirip',impact:'Pengingat bisa muncul lebih dari sekali.',action:'Bandingkan jadwal rutin, lalu nonaktifkan duplikat bila perlu.'});
  const posted=new Map<string,number>();for(const tx of ledger)if(tx.recurringTransactionId){const key=`${tx.recurringTransactionId}:${tx.date}`;posted.set(key,(posted.get(key)||0)+1)}for(const [key,count] of posted)if(count>1)issues.push({id:`posted:${key}`,title:'Beberapa transaksi rutin dicatat di hari yang sama',impact:'Pengeluaran mungkin tercatat lebih dari satu kali.',action:'Periksa transaksi terkait sebelum menghapus apa pun.'});
  for(const record of [...data.claims,...data.receivables,...data.debts])if(record.status==='paid'&&(('remainingAmount' in record&&record.remainingAmount>0)||('outstandingAmount' in record&&record.outstandingAmount>0)))issues.push({id:`status:${record.id}`,title:'Status lunas tetapi masih ada sisa',impact:'Laporan kewajiban atau piutang dapat keliru.',action:'Periksa pembayaran dan status catatan.'});
  for(const record of [...data.claims,...data.receivables,...data.debts]){const value='outstandingAmount' in record?record.outstandingAmount:record.remainingAmount;if(!Number.isSafeInteger(value)||value<0)issues.push({id:`negative:${record.id}`,title:'Ada sisa tagihan atau piutang yang tidak valid',impact:'Perhitungan net worth mungkin berbeda.',action:'Periksa catatan dan seluruh pembayarannya.'});}
  for(const snapshot of data.cycleSnapshots)if(!snapshot.startDate||!snapshot.endDate||snapshot.startDate>=snapshot.endDate)issues.push({id:`cycle:${snapshot.id}`,title:'Rentang siklus historis perlu diperiksa',impact:'Laporan periode mungkin tidak berurutan.',action:'Periksa pengaturan siklus dan laporan historis.'});
  if(!profile.salaryCycleStartDay||profile.salaryCycleStartDay<1||profile.salaryCycleStartDay>31)issues.push({id:'salary',title:'Tanggal siklus gaji perlu diperiksa',impact:'Rentang siklus dapat tidak sesuai.',action:'Periksa tanggal di Pengaturan.'});
  return issues;
}
