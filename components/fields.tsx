'use client';
import { readMoney, rupiah } from '@/lib/accounting';
import type { InputHTMLAttributes } from 'react';
import { AppSelect } from './ui/app-select';
import { AppDatePicker, AppTimePicker } from './ui/date-time-picker';
import { emojiOrFallback } from './visual-identity';
import { categoryTree } from '@/lib/category-analytics';
import type { Category } from '@/lib/types';
export function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function Input(props:InputHTMLAttributes<HTMLInputElement>){if(props.type==='date')return <AppDatePicker {...props}/>;if(props.type==='time')return <AppTimePicker {...props}/>;return <input className={`input ${props.className||''}`} {...props}/>}
export const Select = AppSelect;
export function Money({value,onChange,required=false,placeholder='Rp0'}:{value:number;onChange:(value:number)=>void;required?:boolean;placeholder?:string}){return <input className="input" inputMode="numeric" value={value?rupiah(value):''} placeholder={placeholder} required={required} onChange={e=>onChange(readMoney(e.target.value))}/>}
/** <option> list of categories as parent → subcategory, for filters. */
export function categoryOptions(categories:Category[],types?:Category['type'][]){return categoryTree(categories,types).map(({category,depth})=><option key={category.id} value={category.id}>{depth?`\u2003↳ ${category.name}`:`${emojiOrFallback(category.icon)} ${category.name}`}</option>)}
export function Empty({message,action}:{message:string;action?:React.ReactNode}){return <div className="empty"><p>{message}</p>{action}</div>}
export function FormActions({saving,label='Simpan',onCancel,disabled=false}:{saving:boolean;label?:string;onCancel?:()=>void;disabled?:boolean}){return <div className="modal-actions">{onCancel&&<button className="btn btn-secondary" type="button" onClick={onCancel}>Batal</button>}<button className="btn btn-primary" type="submit" disabled={saving||disabled}>{saving?'Menyimpan…':label}</button></div>}
