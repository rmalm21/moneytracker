'use client';
import { useEffect, useRef, type DragEvent, type PointerEvent } from 'react';
import { GripVertical } from 'lucide-react';

type DragState = { x: number; y: number; pointer: number; source: HTMLElement | null; ghost: HTMLElement | null; offsetX: number; offsetY: number; touch: boolean; armed: boolean; timer: number };

/** How long a finger must rest on the handle before the row lifts (so scrolling past it never drags). */
export const HOLD_MS = 2000;

/**
 * Use on a row inside an element with data-sort-id. Mouse: drag after a short move.
 * Touch: hold the handle for 2 seconds (a ring fills up) until the row floats, then move it;
 * moving earlier simply scrolls the page. Dropping it on another row moves it there.
 */
export function ReorderHandle({id,onMove}:{id:string;onMove:(from:string,to:string)=>void}){
 const drag=useRef<DragState|null>(null),button=useRef<HTMLButtonElement>(null);
 // A non-passive listener on the handle itself, present before the touch starts, so the browser
 // waits for it: once the row is lifted the page must not scroll under the finger.
 useEffect(()=>{const el=button.current;if(!el)return;const block=(event:TouchEvent)=>{if(drag.current?.armed&&event.cancelable)event.preventDefault()};el.addEventListener('touchmove',block,{passive:false});return()=>el.removeEventListener('touchmove',block)},[]);
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
 function place(state:DragState,x:number,y:number){
  if(!state.ghost)return;
  state.ghost.style.transform=`translate(${x-state.offsetX-parseFloat(state.ghost.style.left)}px,${y-state.offsetY-parseFloat(state.ghost.style.top)}px) rotate(1.2deg) scale(1.03)`;
  clear();const target=targetAt(x,y);if(target&&target.dataset.sortId!==id)target.classList.add('sort-target');
  // Keep the page moving when dragging near the top or bottom edge.
  if(y<70)window.scrollBy(0,-12);else if(y>window.innerHeight-90)window.scrollBy(0,12);
 }
 function stopHold(button:HTMLElement,state:DragState){window.clearTimeout(state.timer);button.classList.remove('is-holding')}
 function end(event:PointerEvent<HTMLButtonElement>,cancelled=false){
  const state=drag.current;if(!state)return;drag.current=null;
  stopHold(event.currentTarget,state);
  try{event.currentTarget.releasePointerCapture(state.pointer)}catch{/* Capture may already be released. */}
  state.ghost?.remove();state.source?.classList.remove('drag-source');document.body.classList.remove('is-dragging');
  const target=state.ghost&&!cancelled?targetAt(event.clientX,event.clientY)?.dataset.sortId:undefined;
  clear();if(target&&target!==id)onMove(id,target);
 }
 return <button ref={button} type="button" aria-label="Tahan lalu geser untuk mengurutkan" title="Tahan lalu geser untuk mengurutkan" className="sort-handle"
  onDragStart={(event:DragEvent<HTMLButtonElement>)=>event.preventDefault()}
  onContextMenu={event=>event.preventDefault()}
  onPointerDown={event=>{
   if(event.button!==0)return;
   const target=event.currentTarget,touch=event.pointerType!=='mouse';
   const state:DragState={x:event.clientX,y:event.clientY,pointer:event.pointerId,source:target.closest<HTMLElement>('[data-sort-id]'),ghost:null,offsetX:0,offsetY:0,touch,armed:!touch,timer:0};
   drag.current=state;
   if(touch){
    // Until the hold completes the page may scroll; scrolling is only blocked once the row floats.
    target.classList.add('is-holding');
    state.timer=window.setTimeout(()=>{if(drag.current!==state)return;state.armed=true;target.classList.remove('is-holding');lift(state);try{navigator.vibrate?.(25)}catch{/* optional */}},HOLD_MS);
   }
   try{target.setPointerCapture(event.pointerId)}catch{/* not capturable */}
  }}
  onPointerMove={event=>{
   const state=drag.current;if(!state)return;
   if(state.touch&&!state.armed){if(Math.hypot(event.clientX-state.x,event.clientY-state.y)>10){stopHold(event.currentTarget,state);drag.current=null;try{event.currentTarget.releasePointerCapture(state.pointer)}catch{/* released */}}return}
   if(!state.ghost){if(Math.hypot(event.clientX-state.x,event.clientY-state.y)<6)return;lift(state)}
   place(state,event.clientX,event.clientY);
  }}
  onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)} onLostPointerCapture={event=>{if(drag.current)end(event,true)}}><GripVertical size={19}/></button>;
}
export function reorder<T extends {id:string}>(items:T[],from:string,to:string){const copy=[...items],a=copy.findIndex(x=>x.id===from),b=copy.findIndex(x=>x.id===to);if(a<0||b<0||a===b)return copy;copy.splice(b,0,copy.splice(a,1)[0]);return copy;}
export function dropRow(event:DragEvent<HTMLElement>,id:string,onMove:(from:string,to:string)=>void){event.preventDefault();event.currentTarget.classList.remove('sort-target');const source=event.dataTransfer.getData('text/plain');if(source&&source!==id)onMove(source,id)}
