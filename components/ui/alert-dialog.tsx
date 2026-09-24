'use client';
import * as Alert from '@radix-ui/react-alert-dialog';
import { Button } from './button';
export function Confirm({title,description,onConfirm,children}:{title:string;description:string;onConfirm:()=>void|Promise<void>;children:React.ReactNode}){return <Alert.Root><Alert.Trigger asChild>{children}</Alert.Trigger><Alert.Portal><Alert.Overlay className="modal-overlay"/><Alert.Content className="modal-content confirm"><Alert.Title>{title}</Alert.Title><Alert.Description>{description}</Alert.Description><div className="modal-actions"><Alert.Cancel asChild><Button variant="secondary">Batal</Button></Alert.Cancel><Alert.Action asChild><Button variant="danger" onClick={()=>void onConfirm()}>Lanjutkan</Button></Alert.Action></div></Alert.Content></Alert.Portal></Alert.Root>;}
