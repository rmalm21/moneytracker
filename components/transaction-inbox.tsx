'use client';
import { emojiOrFallback } from './visual-identity';
import { Summary } from './summary';
import { Inbox as SumInbox, TrendingDown as SumTrendingDown, TrendingUp as SumTrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Empty } from './fields';
import { Confirm } from './ui/alert-dialog';
import { dismissDraft } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { formatDate } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

export function TransactionInbox({openTx,notify}:{openTx:(preset?:Partial<LedgerTx>)=>void;notify:(message:string)=>void}){
 const {data,user}=useApp();const [error,setError]=useState('');const pending=data.drafts.filter(row=>row.status==='pending').sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate));
 async function skip(id:string){if(!user)return;try{setError('');await dismissDraft(user.uid,id);notify('Transaksi dilewati. Saldo tidak berubah.')}catch(e){setError((e as Error).message)}}
 return <><div className="page-heading"><div><h1>Perlu Dikonfirmasi</h1><p>Jadwal rutin di sini belum mengubah saldo. Tinjau sebelum mencatatnya.</p></div></div><Summary items={[{label:'Menunggu konfirmasi',value:`${pending.length} transaksi`,icon:SumInbox,tone:'warn'},{label:'Total keluar',value:rupiah(pending.filter(i=>i.type!=='income').reduce((n,i)=>n+i.amount,0)),icon:SumTrendingDown,tone:'out'},{label:'Total masuk',value:rupiah(pending.filter(i=>i.type==='income').reduce((n,i)=>n+i.amount,0)),icon:SumTrendingUp,tone:'in'}]}/><p className="muted page-note">Konfirmasi membuat satu transaksi aktual dan menghapus komitmen yang menunggu.</p><div className="fin-list" style={{marginTop:16}}>{pending.length?pending.map(item=><div className="data-row" key={item.id}><div className="data-row-main" data-avatar={emojiOrFallback(data.categories.find(c=>c.id===item.categoryId)?.icon,item.type==='income'?'💰':'📥')}><strong>{item.name}</strong><small className="entry-meta"><span className="tag warn">Menunggu konfirmasi</span><span>{formatDate(item.plannedDate)}</span><span>· {data.wallets.find(w=>w.id===item.walletId)?.name||'Dompet'}</span></small></div><div className="data-row-side"><strong className={item.type==='income'?'amount-positive':''}>{item.type==='income'?'+':''}{rupiah(item.amount)}</strong><div className="toolbar-row"><Button className="small" onClick={()=>openTx({type:item.type,amount:item.amount,date:item.plannedDate,walletId:item.walletId,destinationWalletId:item.destinationWalletId,categoryId:item.categoryId,description:item.name,draftId:item.id,recurringTransactionId:item.recurringId})}>Periksa & konfirmasi</Button><Confirm title="Lewati transaksi ini?" description="Transaksi ini tidak akan dicatat ke saldo. Jadwal rutin berikutnya tetap ada." onConfirm={()=>skip(item.id)}><button type="button" className="link-button">Lewati</button></Confirm></div></div></div>):<Empty message="Tidak ada transaksi yang menunggu konfirmasi."/>}</div>{error&&<p role="alert" className="form-error">{error}</p>}</>
}
