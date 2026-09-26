'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveFunds } from '@/lib/pockets';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, configured } from '@/lib/firebase';
import { emptyData, type Data, type Profile } from '@/lib/types';
import { initProfile, subscribeData, subscribeProfile, settleBudgets, createDueDrafts, postAutoDrafts, saveProfile } from '@/lib/firestore';
import { noteDeleteMarks, startSync } from '@/lib/sync';
import { salaryCycle, calendarCycle } from '@/lib/accounting';
import { applyAppearance, cacheAppearance, readCachedAppearance } from '@/lib/appearance';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';

type AppContextValue={user:User|null;profile:Profile|null;data:Data;loading:boolean;error:string;cycle:{start:string;end:string;daysRemaining:number;daysTotal:number};sync:'syncing'|'synced'|'offline'|'error';ready:boolean};
const Context=createContext<AppContextValue|null>(null);
function dataError(error:unknown) {
  const code=(error as {code?:string})?.code||'';
  if(code==='permission-denied')return 'Akses data ditolak. Periksa aturan Firestore untuk akun yang sedang masuk.';
  if(code==='unavailable')return 'Koneksi ke database terputus. Periksa internet lalu coba lagi.';
  return 'Data belum bisa dimuat. Coba lagi beberapa saat.';
}
export function AppProvider({children}:{children:React.ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null),[data,setData]=useState<Data>(emptyData),[loading,setLoading]=useState(true),[error,setError]=useState(''),[sync,setSync]=useState<'syncing'|'synced'|'offline'|'error'>('syncing');
  const cycle=useMemo(()=>salaryCycle(dateInTimeZone(new Date(),profile?.timeZone),profile?.salaryCycleStartDay||24),[profile?.salaryCycleStartDay,profile?.timeZone]);
  useEffect(()=>{if(!auth){setLoading(false);return;}return onAuthStateChanged(auth,u=>{if(!u){try{localStorage.removeItem('dompet-ajaib:appearance:last')}catch{}applyAppearance(null)}else applyAppearance(readCachedAppearance(u.uid));setUser(u);setProfile(null);setData(emptyData);setError('');setSync('syncing');setLoading(Boolean(u));if(u)initProfile(u).catch(e=>{setError(dataError(e));setSync('error');setLoading(false);});},()=>{applyAppearance(null);setError('Sesi gagal dibaca.');setLoading(false);});},[]);
  // Keeps the device copy current (only changed documents are downloaded); the screens read that copy.
  useEffect(()=>{if(!user)return;return startSync(user.uid);},[user?.uid]);
  useEffect(()=>{if(user&&profile)noteDeleteMarks(user.uid,profile.syncMarks);},[user?.uid,profile?.syncMarks]);
  useEffect(()=>{if(!user)return;return subscribeProfile(user.uid,p=>{if(p){applyAppearance(p);cacheAppearance(p)}setProfile(p);if(p){setError('');setLoading(false);}},e=>{setError(dataError(e));setSync('error');setLoading(false);});},[user]);
  useEffect(()=>{if(!profile)return;applyAppearance(profile);const media=window.matchMedia('(prefers-color-scheme: dark)');const refresh=()=>applyAppearance(profile);media.addEventListener('change',refresh);return()=>media.removeEventListener('change',refresh);},[profile?.uid,profile?.theme,profile?.themePreset,profile?.colorMode,profile?.accentColor,profile?.density,profile?.fontSize]);
  useEffect(()=>{if(!user||!profile)return;const uid=user.uid;setData(emptyData);return subscribeData(uid,cycle.start,cycle.end,(key,value)=>setData(previous=>({...previous,[key]:value} as Data)),e=>{setError(dataError(e));setSync('error');},setSync,dateInTimeZone(new Date(),profile.timeZone),profile.salaryCycleStartDay);},[user,profile?.uid,profile?.timeZone,profile?.salaryCycleStartDay,cycle.start,cycle.end]);
  // v62: text size S is the new default. Accounts still on the old default (M, or never chosen) move to S once; any choice after that stays.
  useEffect(()=>{if(!user||!profile||(profile.appearanceDefaults||0)>=2)return;void saveProfile(user.uid,{appearanceDefaults:2,...(!profile.fontSize||profile.fontSize==='m'?{fontSize:'s' as const}:{})}).catch(()=>{});},[user,profile?.uid,profile?.appearanceDefaults]);
  useEffect(()=>{if(user&&profile&&data.budgets.some(b=>b.rolloverEnabled))void settleBudgets(user.uid,data.budgets,profile.salaryCycleStartDay,dateInTimeZone(new Date(),profile.timeZone)).catch(e=>setError(e.message));},[user,profile?.uid,profile?.salaryCycleStartDay,profile?.timeZone,data.budgets]);
  useEffect(()=>{if(user&&data.recurring.length&&typeof navigator!=='undefined'&&navigator.onLine)void createDueDrafts(user.uid,data.recurring,todayInTimeZone(profile?.timeZone)).catch(e=>setError(e.message));},[user,profile?.timeZone,data.recurring]);
  useEffect(()=>{if(user&&data.drafts.some(d=>d.status==='pending'&&d.mode==='auto')&&typeof navigator!=='undefined'&&navigator.onLine)void postAutoDrafts(user.uid,data.drafts);},[user,data.drafts]);
  const view=useMemo(()=>({...data,funds:resolveFunds(data.funds,data.wallets)}),[data]);
  const value={user,profile,data:view,loading,error,cycle,sync,ready:configured};return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp(){const context=useContext(Context);if(!context)throw Error('AppProvider missing');return context;}
