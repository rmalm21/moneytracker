'use client';
import { categoryTemplates, normalizeCategoryName, presetHex, similarCategory } from '@/lib/category-templates';
import type { Category } from '@/lib/types';

/** Checklist of starter categories grouped by type; categories the user already has are marked. */
export function TemplateChecklist({selected,onChange,existing=[]}:{selected:string[];onChange:(keys:string[])=>void;existing?:Category[]}){
 const toggle=(key:string)=>onChange(selected.includes(key)?selected.filter(item=>item!==key):[...selected,key]);
 return <div className="template-list">{(['expense','income'] as const).map(type=>{const list=categoryTemplates.filter(item=>item.type===type);const all=list.every(item=>selected.includes(item.key));return <section key={type}>
  <div className="template-list-head"><h4>{type==='expense'?'Pengeluaran':'Pemasukan'}</h4><button type="button" className="link-button" onClick={()=>onChange(all?selected.filter(key=>!list.some(item=>item.key===key)):[...new Set([...selected,...list.map(item=>item.key)])])}>{all?'Kosongkan':'Pilih semua'}</button></div>
  {list.map(item=>{const similar=similarCategory(existing,item);return <label key={item.key} className={`template-option ${selected.includes(item.key)?'is-selected':''}`}>
   <input type="checkbox" checked={selected.includes(item.key)} onChange={()=>toggle(item.key)}/>
   <span className="template-icon" style={{background:`color-mix(in srgb, ${presetHex(item.color)} 16%, var(--paper))`}} aria-hidden="true">{item.icon}</span>
   <span className="template-text"><strong>{item.name}</strong><small>{item.subcategories.slice(0,4).map(sub=>`${sub.icon} ${sub.name}`).join(' · ')}{item.subcategories.length>4?` · +${item.subcategories.length-4}`:''}</small></span>
   {similar&&(()=>{const have=new Set(existing.filter(c=>c.parentId===similar.id).map(c=>normalizeCategoryName(c.name)));const missing=item.subcategories.filter(sub=>!have.has(normalizeCategoryName(sub.name))).length;return <span className={`tag ${missing?'warn':'muted'}`}>{missing?`Sudah ada · +${missing} sub`:'Sudah lengkap'}</span>})()}
  </label>})}
 </section>})}</div>;
}
