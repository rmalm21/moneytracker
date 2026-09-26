'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, type PointerEvent } from 'react';
import { X } from 'lucide-react';
export const Dialog=DialogPrimitive.Root;
export const DialogTrigger=DialogPrimitive.Trigger;

/**
 * On phones every dialog is a bottom sheet: dragging its top bar (the grey handle and the
 * title row) downwards closes it, like native sheets. A short or slow drag snaps back.
 */
function useSheetDrag(){
 const content=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
 const drag=useRef<{id:number;startY:number;lastY:number;lastT:number;speed:number;dy:number}|null>(null);
 const set=(value:string,animate:boolean)=>{const el=content.current;if(!el)return;el.style.transition=animate?'translate .2s cubic-bezier(.2,.8,.2,1)':'none';el.style.translate=value;};
 function onPointerDown(event:PointerEvent<HTMLDivElement>){
  if(event.button!==0||!window.matchMedia('(max-width: 760px)').matches||(event.target as Element).closest('button, a, input, select, textarea'))return;
  drag.current={id:event.pointerId,startY:event.clientY,lastY:event.clientY,lastT:event.timeStamp,speed:0,dy:0};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function onPointerMove(event:PointerEvent<HTMLDivElement>){
  const d=drag.current;if(!d||d.id!==event.pointerId)return;
  const raw=event.clientY-d.startY;d.dy=raw>0?raw:raw*.2;
  const dt=Math.max(1,event.timeStamp-d.lastT);d.speed=(event.clientY-d.lastY)/dt;d.lastY=event.clientY;d.lastT=event.timeStamp;
  set(`0 ${d.dy}px`,false);
 }
 function onPointerUp(event:PointerEvent<HTMLDivElement>){
  const d=drag.current;if(!d||d.id!==event.pointerId)return;drag.current=null;
  const height=content.current?.offsetHeight||400;
  if(d.dy>Math.min(140,height*.3)||d.dy>30&&d.speed>.6){set('0 100%',true);window.setTimeout(()=>close.current?.click(),180);}
  else set('0 0',true);
 }
 return {content,close,handlers:{onPointerDown,onPointerMove,onPointerUp,onPointerCancel:onPointerUp}};
}

/**
 * Phones: the on-screen keyboard covers the bottom of the page without moving fixed elements, which would hide
 * a bottom sheet's inputs and results. Lift the sheet to sit on top of the keyboard and fit the space left.
 */
function useKeyboardLift(content:React.RefObject<HTMLDivElement|null>){
 useEffect(()=>{
  const vv=typeof window!=='undefined'?window.visualViewport:null;if(!vv)return;
  let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const el=content.current;if(!el)return;const keyboard=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));el.style.setProperty('--kb',`${keyboard}px`);el.style.setProperty('--vvh',`${Math.round(vv.height)}px`);el.classList.toggle('keyboard-open',keyboard>80);});};
  update();vv.addEventListener('resize',update);vv.addEventListener('scroll',update);
  return ()=>{cancelAnimationFrame(frame);vv.removeEventListener('resize',update);vv.removeEventListener('scroll',update);};
 },[content]);
}

export function DialogContent({title,children,className='',onCloseAutoFocus}:{title:string;children:React.ReactNode;className?:string;onCloseAutoFocus?:(event:Event)=>void}){
 const sheet=useSheetDrag();
 useKeyboardLift(sheet.content);
 return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="modal-overlay"/><DialogPrimitive.Content ref={sheet.content} className={`modal-content app-dialog ${className}`} onCloseAutoFocus={onCloseAutoFocus}><div className="modal-heading sheet-drag" {...sheet.handlers}><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Close ref={sheet.close} aria-label="Tutup" className="icon-btn"><X size={19}/></DialogPrimitive.Close></div><div className="modal-body">{children}</div></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
