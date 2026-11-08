'use client';
import { useEffect, useState, memo } from 'react';
import { walletLabel } from '@/lib/wallet-delete';
import { useUndoDelete } from './undo-delete';
import { useTxActions } from './tx-actions';
import { SwipeUnder, useSwipe } from './swipe';
import { Emoji, EmojiText, emojiAvatar } from './emoji';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { useApp } from './app-provider';
import { IdentityBadge, categoryColor, emojiOrFallback, identityStyle } from './visual-identity';
import { Empty } from './fields';
import { moneyIn, moneyOut, rupiah, transactionExpense } from '@/lib/accounting';
import { todayInTimeZone } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

export const typeLabels:Record<string,string>={expense:'Pengeluaran',income:'Pemasukan',transfer:'Transfer',adjustment:'Koreksi',borrowing:'Pinjaman',debt_payment:'Bayar utang',claim_advance:'Talangan kantor',claim_payment:'Klaim cair',claim_writeoff:'Klaim ditolak',receivable_issue:'Talangan personal',receivable_payment:'Piutang dibayar',fund_contribution:'Isi tujuan dana'};
const moves=new Set(['transfer','fund_contribution']);
// 8.6 Date formatters made once (toLocaleDateString makes a new one on every call), and categories looked up by id.
const fmt=(o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('id-ID',o);
const F={dayMonth:fmt({day:'numeric',month:'short'}),dayMonthYear:fmt({day:'numeric',month:'short',year:'numeric'}),longDay:fmt({weekday:'long',day:'numeric',month:'long'}),longDayYear:fmt({weekday:'long',day:'numeric',month:'long',year:'numeric'}),weekday:fmt({weekday:'long'}),month:fmt({month:'long'}),monthYear:fmt({month:'long',year:'numeric'})};
const thisYear=()=>new Date().getFullYear();
const byIdCache=new WeakMap<object,Map<string,import('@/lib/types').Category>>();
const categoryIndex=(categories:import('@/lib/types').Category[])=>{let m=byIdCache.get(categories);if(!m){m=new Map(categories.map(c=>[c.id,c]));byIdCache.set(categories,m)}return m};
const listDate=(date:string)=>{const day=new Date(`${date}T12:00:00`);return (day.getFullYear()===thisYear()?F.dayMonth:F.dayMonthYear).format(day);};
const dayLabel=(date:string)=>{const d=new Date(`${date}T12:00:00`);return (d.getFullYear()===thisYear()?F.longDay:F.longDayYear).format(d)};
function TxRow({t,onEdit,groupByDate,expanded,setExpanded}:{t:LedgerTx;onEdit?:(tx:LedgerTx)=>void;groupByDate:boolean;expanded:string[];setExpanded:React.Dispatch<React.SetStateAction<string[]>>}){
 const {data}=useApp(),actions=useTxActions();
 const editRow=onEdit||actions.edit,canDelete=Boolean(actions.remove)&&!openingTypes.has(t.type)&&!(t.splitBillId&&t.type==='expense');
 const swipe=useSwipe({onLeft:canDelete?()=>actions.remove!(t):undefined,onRight:editRow?()=>editRow(t):undefined});
 const index=categoryIndex(data.categories),cat=(t.subcategoryId?index.get(t.subcategoryId):undefined)||(t.categoryId?index.get(t.categoryId):undefined);const catColor=cat&&!/^#[0-9a-f]{3,8}$/i.test(cat.color||'')&&cat.parentId?categoryColor([index.get(cat.parentId)!].filter(Boolean),cat):categoryColor(data.categories,cat);const pos=['income','claim_payment','receivable_payment','borrowing'].includes(t.type)||t.type==='adjustment'&&t.adjustmentDirection==='in';const move=moves.has(t.type);const splits=t.splits||[];const destination=move?(t.destinationWalletId?walletLabel(data.wallets.find(w=>w.id===t.destinationWalletId)):undefined):'';const open=onEdit?()=>onEdit(t):undefined;const title=t.description||t.merchant||cat?.name||typeLabels[t.type];
 // A Split Bill share paid by someone else names who paid and whether it is paid back; paying it back is not new spending (8.3.3).
 const splitBack=Boolean(t.splitBillId)&&(t.type==='debt_payment'||t.type==='receivable_payment'),shareDebt=!t.walletId&&t.splitBillId?data.debts.find(d=>d.splitBillId===t.splitBillId&&d.sourceType==='split_bill'):undefined;
 return <div className={`transaction-row ${onEdit?'is-clickable':''} ${swipe.side?'is-swiping':''} ${swipe.leaving?'is-leaving':''}`} {...swipe.handlers} style={identityStyle(catColor)} role={onEdit?'button':undefined} tabIndex={onEdit?0:undefined} aria-label={onEdit?`Lihat detail ${title} ${rupiah(t.amount)}`:undefined} onClick={open} onKeyDown={onEdit?event=>{if((event.key==='Enter'||event.key===' ')&&event.target===event.currentTarget){event.preventDefault();onEdit(t)}}:undefined}><SwipeUnder side={swipe.side} armed={swipe.armed}/><div className="swipe-content" style={swipe.dx?{transform:`translateX(${swipe.dx}px)`,transition:swipe.dragging?'none':undefined}:undefined}><div className="data-row"><div className="row-left"><span className={`row-icon ${pos?'in':move?'':'out'}`} aria-hidden="true">{cat?.icon&&!move?<span className="row-emoji"><Emoji e={emojiOrFallback(cat.icon)}/></span>:pos?<ArrowDownLeft size={17}/>:move?<ArrowLeftRight size={17}/>:<ArrowUpRight size={17}/>}</span><div className="data-row-main"><strong><span className="tx-title">{title}</span></strong><small className="tx-meta">{groupByDate?'':<span className="tx-date">{listDate(t.date)}</span>}{splits.length?<span className="tx-cat">{splits.length} kategori</span>:cat&&(t.type==='expense'||t.type==='income')?<span className="tx-cat">{cat.name}</span>:<span className="tx-type">{splitBack?'Pelunasan Split Bill':typeLabels[t.type]}</span>}<span>{!t.walletId&&t.memberFlow?`Uang pribadi ${t.memberFlow.name}`:!t.walletId&&t.splitBillId?(shareDebt?(shareDebt.outstandingAmount>0?`Split Bill · dibayar ${shareDebt.name} · belum kamu ganti`:`Split Bill · lunas ke ${shareDebt.name}`):'Split Bill · dibayar orang lain'):(t.walletId?walletLabel(data.wallets.find(w=>w.id===t.walletId)):'')||'Dompet'}{destination?` → ${destination}`:''}</span>{t.reconciliationReason&&<span className="tx-recon">Penyesuaian saldo</span>}{t.createdByName&&<span className="tx-by">oleh {t.createdByName}</span>}</small></div></div><div className="data-row-side"><strong className={pos?'amount-positive':move||splitBack&&!pos?'':'amount-negative'}>{pos?'+':move?'':'−'}{rupiah(t.amount)}</strong>{t.splitBillId&&t.type==='expense'&&t.walletId&&<small className="tx-own">Bagianmu {rupiah(transactionExpense(t))}</small>}{t.interest?<span className={`tx-auto ${t.interest.confirmed?'':'is-unchecked'}`}>{t.interest.confirmed?'Otomatis':'Belum dicek'}</span>:<>{t.time&&<small className="tx-time">{t.time}</small>}{!groupByDate&&<small className="tx-side-date">{listDate(t.date)}</small>}</>}{t.type==='transfer'&&Boolean(t.transferFee)&&<small>Biaya admin {rupiah(t.transferFee||0)}</small>}{splits.length>0&&<div className="toolbar-row"><button type="button" className="link-button" aria-expanded={expanded.includes(t.id)} onClick={event=>{event.stopPropagation();setExpanded(rows=>rows.includes(t.id)?rows.filter(id=>id!==t.id):[...rows,t.id])}}>{expanded.includes(t.id)?'Tutup pembagian':'Lihat pembagian'}</button></div>}</div></div>{expanded.includes(t.id)&&<div className="split-details">{splits.map((line,i)=><div key={i}><span>{data.categories.find(c=>c.id===line.categoryId)?.name||'Kategori'}{line.subcategoryId?` → ${data.categories.find(c=>c.id===line.subcategoryId)?.name||'Subkategori'}`:''}</span><strong>{rupiah(line.amount)}</strong></div>)}</div>}</div></div>;
}
/** 8.6 A row draws again only when its transaction, its open state or the list's layout changes (not when the list
 * around it grows, e.g. the rest of the page drawn after the first screen). The edit action is the same each time. */
const TxRowMemo=memo(TxRow,(a,b)=>a.t===b.t&&a.groupByDate===b.groupByDate&&Boolean(a.onEdit)===Boolean(b.onEdit)&&a.expanded.includes(a.t.id)===b.expanded.includes(b.t.id)&&a.setExpanded===b.setExpanded);
/** "24 · Kamis, September" with "Hari ini" / "Kemarin" for the last two days. */
// 6.6: "Hari ini" follows the profile's time zone like the rest of the app, not the phone's clock.
function DayTitle({date}:{date:string}){const {profile}=useApp();const d=new Date(`${date}T12:00:00`),today=new Date(`${todayInTimeZone(profile?.timeZone)}T12:00:00`);const days=Math.round((today.getTime()-d.getTime())/864e5);const weekday=F.weekday.format(d),month=(d.getFullYear()===today.getFullYear()?F.month:F.monthYear).format(d);return <span className="tx-day-title" aria-label={dayLabel(date)}><b>{d.getDate()}</b><span><strong>{days===0?'Hari ini':days===1?'Kemarin':weekday}</strong><small>{days<=1&&days>=0?`${weekday}, ${month}`:month}</small></span></span>;}
const openingTypes=new Set(['claim_advance','receivable_issue','borrowing']);
const FOLDED_KEY='dompet-ajaib:tx-folded-days';
function readFolded():string[]{try{const v=JSON.parse(localStorage.getItem(FOLDED_KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(-120):[]}catch{return []}}
export function TxList({items,onEdit,groupByDate=false}:{items:LedgerTx[];onEdit?:(tx:LedgerTx)=>void;groupByDate?:boolean}){
 const [expanded,setExpanded]=useState<string[]>([]),{hidden}=useUndoDelete();
 // Days folded by the person (remembered on this device).
 const [folded,setFolded]=useState<string[]>([]);
 useEffect(()=>{setFolded(readFolded())},[]);
 const fold=(date:string)=>setFolded(list=>{const next=list.includes(date)?list.filter(d=>d!==date):[...list,date];try{localStorage.setItem(FOLDED_KEY,JSON.stringify(next.slice(-120)))}catch{/* optional */}return next;});
 const visible=items.filter(t=>!hidden.has(t.id));
 if(!visible.length)return <Empty message="Belum ada transaksi pada periode ini."/>;
 const row=(t:LedgerTx)=><TxRowMemo key={t.id} t={t} onEdit={onEdit} groupByDate={groupByDate} expanded={expanded} setExpanded={setExpanded}/>;
 if(!groupByDate)return <div className="tx-list">{visible.map(row)}</div>;
 const days:{date:string;items:LedgerTx[]}[]=[];for(const t of visible){const last=days[days.length-1];if(last&&last.date===t.date)last.items.push(t);else days.push({date:t.date,items:[t]})}
 return <div className="tx-days">{days.map(day=>{const out=day.items.reduce((n,x)=>n+moneyOut(x),0),income=day.items.reduce((n,x)=>n+moneyIn(x),0),closed=folded.includes(day.date);return <section key={day.date} className={`tx-day-group ${closed?'is-folded':''}`}><header className="tx-day"><button type="button" className="tx-day-toggle" aria-expanded={!closed} onClick={()=>fold(day.date)}><DayTitle date={day.date}/><span className="tx-day-side"><span className="tx-day-sum">{income>0&&<b className="amount-positive">+{rupiah(income)}</b>}{out>0&&<b className="amount-negative">−{rupiah(out)}</b>}{closed&&<small>{day.items.length} transaksi</small>}</span><ChevronDown size={16} className="tx-day-chev" aria-hidden="true"/></span></button></header>{!closed&&<div className="tx-list">{day.items.map(row)}</div>}</section>})}</div>;
}
