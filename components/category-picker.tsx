'use client';
import { useMemo, useState } from 'react';
import { Emoji, EmojiText, emojiAvatar } from './emoji';
import { ChevronLeft, ChevronRight, Search, Tags } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { categoryColor, emojiOrFallback, identityStyle } from './visual-identity';
import type { Category } from '@/lib/types';

type Choice = { categoryId: string; subcategoryId: string };
const byOrder = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);

/**
 * Hierarchical category selector: main categories first, subcategories after choosing one.
 * "Sering dipakai" only offers shortcuts from the user's own history; nothing is chosen automatically.
 */
export function CategoryPicker({type,categoryId,subcategoryId,onChange,required=false}:{type:'expense'|'income';categoryId:string;subcategoryId:string;onChange:(value:Choice)=>void;required?:boolean}){
 const {data}=useApp();
 const [open,setOpen]=useState(false),[parentView,setParentView]=useState<string|null>(null),[query,setQuery]=useState(''),[invalid,setInvalid]=useState(false);
 const all=useMemo(()=>data.categories.filter(c=>!c.isArchived&&c.type===type),[data.categories,type]);
 const parents=useMemo(()=>all.filter(c=>!c.parentId||!all.some(p=>p.id===c.parentId)).sort(byOrder),[all]);
 const childrenOf=(id:string)=>all.filter(c=>c.parentId===id).sort(byOrder);
 const frequent=useMemo(()=>{const counts=new Map<string,number>();for(const tx of data.transactions){if(tx.type!==type)continue;const id=tx.subcategoryId||tx.categoryId;if(id&&all.some(c=>c.id===id))counts.set(id,(counts.get(id)||0)+1)}return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>all.find(c=>c.id===id)!)},[data.transactions,all,type]);
 const selectedParent=all.find(c=>c.id===categoryId),selectedChild=all.find(c=>c.id===subcategoryId);
 function pick(category:Category){const parent=category.parentId?all.find(c=>c.id===category.parentId):undefined;onChange(parent?{categoryId:parent.id,subcategoryId:category.id}:{categoryId:category.id,subcategoryId:''});setInvalid(false);setOpen(false)}
 function show(){setQuery('');setParentView(null);setOpen(true)}
 const search=query.trim().toLowerCase();
 const results=search?all.filter(c=>c.name.toLowerCase().includes(search)).sort(byOrder):[];
 const pathOf=(c:Category)=>{const parent=c.parentId?all.find(p=>p.id===c.parentId):undefined;return parent?`${parent.name} ›`:''};
 const item=(c:Category,extra?:React.ReactNode,onClick?:()=>void,more=false)=><button type="button" key={c.id} className={`picker-item ${c.id===subcategoryId||(!subcategoryId&&c.id===categoryId)?'is-selected':''}`} onClick={onClick||(()=>pick(c))}><span className="category-emoji" style={identityStyle(categoryColor(data.categories,c))} aria-hidden="true"><Emoji e={emojiOrFallback(c.icon)}/></span><span className="picker-item-text"><strong>{c.name}</strong>{extra}</span>{more&&<ChevronRight size={18} className="picker-more" aria-hidden="true"/>}</button>;
 const viewing=parentView?all.find(c=>c.id===parentView):undefined;
 return <span className="datetime-control">
  <button type="button" className={`input datetime-trigger ${invalid?'is-invalid':''}`} onClick={show} aria-haspopup="dialog">
   <span className={selectedParent?'':'muted'}>{selectedParent?<><Emoji e={emojiOrFallback(selectedParent.icon)}/> {selectedParent.name}{selectedChild&&<> › <Emoji e={emojiOrFallback(selectedChild.icon)}/> {selectedChild.name}</>}</>:'Pilih kategori'}</span><Tags size={17} aria-hidden="true"/>
  </button>
  <input type="text" value={categoryId} readOnly required={required} tabIndex={-1} aria-hidden="true" className="app-select-validation" onInvalid={event=>{event.preventDefault();setInvalid(true);(event.currentTarget.previousElementSibling as HTMLButtonElement)?.focus()}}/>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Pilih Kategori" className="mobile-sheet category-picker-dialog">
   <label className="emoji-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Cari kategori" aria-label="Cari kategori"/></label>
   {search?<div className="picker-list">{results.length?results.map(c=>item(c,pathOf(c)?<small>{pathOf(c)}</small>:null)):<p className="muted">Kategori tidak ditemukan.</p>}</div>
   :viewing?<>
     <button type="button" className="picker-back" onClick={()=>setParentView(null)}><ChevronLeft size={18}/> <Emoji e={emojiOrFallback(viewing.icon)}/> {viewing.name}</button>
     <div className="picker-list">{item(viewing,<small>Tanpa subkategori</small>,()=>pick(viewing))}{childrenOf(viewing.id).map(c=>item(c))}</div>
   </>:<>
     {frequent.length>0&&<><h5 className="picker-heading-label">Sering dipakai</h5><div className="picker-chips">{frequent.map(c=><button type="button" key={c.id} className="quick-action" onClick={()=>pick(c)}><span aria-hidden="true"><Emoji e={emojiOrFallback(c.icon)}/></span><span>{c.name}</span></button>)}</div></>}
     <h5 className="picker-heading-label">Semua kategori</h5>
     <div className="picker-list">{parents.map(c=>{const kids=childrenOf(c.id);return item(c,kids.length?<small>{kids.length} subkategori</small>:null,kids.length?()=>setParentView(c.id):undefined,kids.length>0)})}{!parents.length&&<p className="muted">Belum ada kategori {type==='income'?'pemasukan':'pengeluaran'}. Tambahkan di menu Kategori.</p>}</div>
   </>}
  </DialogContent></Dialog>
 </span>;
}
