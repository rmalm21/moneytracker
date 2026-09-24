'use client';
import { useRef, type DragEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

/** Use on a row inside an element with data-sort-id. Works for mouse and touch. */
export function ReorderHandle({id,onMove}:{id:string;onMove:(from:string,to:string)=>void}){
 const start=useRef<{x:number;y:number}|null>(null);
 function clear(){document.querySelectorAll('.sort-target').forEach(el=>el.classList.remove('sort-target'))}
 function finish(event:PointerEvent<HTMLButtonElement>){if(!start.current)return;const distance=Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y);start.current=null;event.currentTarget.releasePointerCapture(event.pointerId);const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-sort-id]')?.dataset.sortId;clear();if(distance>=8&&target&&target!==id)onMove(id,target);}
 function drag(event:DragEvent<HTMLButtonElement>){event.dataTransfer.setData('text/plain',id);event.dataTransfer.effectAllowed='move'}
 return <button type="button" draggable aria-label="Geser untuk mengurutkan" title="Geser untuk mengurutkan" className="sort-handle" onDragStart={drag} onPointerDown={event=>{if(event.pointerType==='mouse')return;start.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={event=>{if(!start.current||Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y)<8)return;clear();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-sort-id]');if(target&&target.dataset.sortId!==id)target.classList.add('sort-target')}} onPointerUp={finish} onPointerCancel={()=>{start.current=null;clear()}}><GripVertical size={19}/></button>;
}
export function reorder<T extends {id:string}>(items:T[],from:string,to:string){const copy=[...items],a=copy.findIndex(x=>x.id===from),b=copy.findIndex(x=>x.id===to);if(a<0||b<0||a===b)return copy;copy.splice(b,0,copy.splice(a,1)[0]);return copy;}
export function dropRow(event:DragEvent<HTMLElement>,id:string,onMove:(from:string,to:string)=>void){event.preventDefault();event.currentTarget.classList.remove('sort-target');const source=event.dataTransfer.getData('text/plain');if(source&&source!==id)onMove(source,id)}
