'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export const Dialog=DialogPrimitive.Root;
export const DialogTrigger=DialogPrimitive.Trigger;
export function DialogContent({title,children,className=''}:{title:string;children:React.ReactNode;className?:string}){return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="modal-overlay"/><DialogPrimitive.Content className={`modal-content app-dialog ${className}`}><div className="modal-heading"><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Close aria-label="Tutup" className="icon-btn"><X size={19}/></DialogPrimitive.Close></div><div className="modal-body">{children}</div></DialogPrimitive.Content></DialogPrimitive.Portal>;}
