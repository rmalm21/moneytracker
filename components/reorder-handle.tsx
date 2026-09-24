'use client';
import { useRef, type DragEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

type DragState = { x: number; y: number; pointer: number; source: HTMLElement | null; ghost: HTMLElement | null; offsetX: number; offsetY: number };

/**
 * Use on a row inside an element with data-sort-id. Works for mouse and touch:
 * after a short move the row lifts into a floating copy that follows the pointer,
 * and dropping it on another row moves it there.
 */
export function ReorderHandle({id,onMove}:{id:string;onMove:(from:string,to:string)=>void}){
 const drag=useRef<DragState|null>(null);
 function clear(){document.querySelectorAll('.sort-target').forEach(el=>el.classList.remove('sort-target'))}
 function targetAt(x:number,y:number){return document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-sort-id]')||null}
 function lift(state:DragState){
  const source=state.source;if(!source)return;
  const rect=source.getBoundingClientRect();
  const ghost=source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-sort-id');ghost.querySelectorAll('[data-sort-id]').forEach(el=>el.removeAttribute('data-sort-id'));
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style,{width:`${rect.width}px`,height:`${rect.height}px`,left:`${rect.left}px`,top:`${rect.top}px`});
  document.body.appendChild(ghost);
  state.offsetX=state.x-rect.left;state.offsetY=state.y-rect.top;state.ghost=ghost;
  source.classList.add('drag-source');document.body.classList.add('is-dragging');
 }
 function end(event:PointerEvent<HTMLButtonElement>,cancelled=false){
  const state=drag.current;if(!state)return;drag.current=null;
  try{event.currentTarget.releasePointerCapture(state.pointer)}catch{/* Capture may already be released. */}
  state.ghost?.remove();state.source?.classList.remove('drag-source');document.body.classList.remove('is-dragging');
  const target=state.ghost&&!cancelled?targetAt(event.clientX,event.clientY)?.dataset.sortId:undefined;
  clear();if(target&&target!==id)onMove(id,target);
 }
 return <button type="button" aria-label="Tekan lalu geser untuk mengurutkan" title="Tekan lalu geser untuk mengurutkan" className="sort-handle"
  onDragStart={(event:DragEvent<HTMLButtonElement>)=>event.preventDefault()}
  onPointerDown={event=>{if(event.button!==0)return;drag.current={x:event.clientX,y:event.clientY,pointer:event.pointerId,source:event.currentTarget.closest<HTMLElement>('[data-sort-id]'),ghost:null,offsetX:0,offsetY:0};event.currentTarget.setPointerCapture(event.pointerId)}}
  onPointerMove={event=>{const state=drag.current;if(!state)return;if(!state.ghost){if(Math.hypot(event.clientX-state.x,event.clientY-state.y)<6)return;lift(state)}
   if(state.ghost)state.ghost.style.transform=`translate(${event.clientX-state.offsetX-parseFloat(state.ghost.style.left)}px,${event.clientY-state.offsetY-parseFloat(state.ghost.style.top)}px) rotate(1.2deg) scale(1.03)`;
   clear();const target=targetAt(event.clientX,event.clientY);if(target&&target.dataset.sortId!==id)target.classList.add('sort-target');
   // Keep the page moving when dragging near the top or bottom edge.
   if(event.clientY<70)window.scrollBy(0,-12);else if(event.clientY>window.innerHeight-90)window.scrollBy(0,12)}}
  onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} onLostPointerCapture={event=>{if(drag.current)end(event,true)}}><GripVertical size={19}/></button>;
}
export function reorder<T extends {id:string}>(items:T[],from:string,to:string){const copy=[...items],a=copy.findIndex(x=>x.id===from),b=copy.findIndex(x=>x.id===to);if(a<0||b<0||a===b)return copy;copy.splice(b,0,copy.splice(a,1)[0]);return copy;}
export function dropRow(event:DragEvent<HTMLElement>,id:string,onMove:(from:string,to:string)=>void){event.preventDefault();event.currentTarget.classList.remove('sort-target');const source=event.dataTransfer.getData('text/plain');if(source&&source!==id)onMove(source,id)}
