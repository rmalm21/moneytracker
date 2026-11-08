'use client';
import { forgetGreetingName } from './loading-screen';
import { installFormMessages } from '@/lib/form-messages';
import { checkAccess, markSeen, SEEN_EVERY, watchOwnGrant, watchRequests, type AccessState, knownAccess } from '@/lib/access';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveFunds } from '@/lib/pockets';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, configured } from '@/lib/firebase';
import { emptyData, type Data, type Profile } from '@/lib/types';
import { checkDeletedTransactions, tidyCloud, initProfile, subscribeData, subscribeProfile, settleBudgets, createDueDrafts, postAutoDrafts, saveProfile } from '@/lib/firestore';
import { noteDeleteMarks, startSync } from '@/lib/sync';
import { salaryCycle, calendarCycle } from '@/lib/accounting';
import { applyAppearance, cacheAppearance, readCachedAppearance } from '@/lib/appearance';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';
import { subscribeMySpaces, spaceProfile, type Space } from '@/lib/spaces';
import { setActor, spaceKey } from '@/lib/space-key';

type AppContextValue={user:User|null;profile:Profile|null;data:Data;loading:boolean;error:string;cycle:{start:string;end:string;daysRemaining:number;daysTotal:number};sync:'syncing'|'synced'|'offline'|'error';ready:boolean;/** 6.1 Kode akses: whether this account may use the app, and whether it is the owner. */access:AccessState;admin:boolean;/** After a code was redeemed: check again and open the app. */refreshAccess:()=>void;/** Owner: how many people are waiting for access (live). */accessRequests:number;/** This account had access and the owner took it back. */revoked:boolean;
  /** 9.0 The signed-in person (their own uid), whatever records are on screen. `user.uid` is the records' key: their own, or "space:{id}" in a Ruang Bersama. */account:User|null;
  /** The person's own profile (in a space, `profile` carries the space's record settings). */personalProfile:Profile|null;
  /** Ruang Bersama on screen (null: Pribadi), the spaces this person is in, and the switch. */space:Space|null;spaces:Space[];spacesReady:boolean;switchTo:(spaceId:string|null)=>void};
const Context=createContext<AppContextValue|null>(null);
function dataError(error:unknown) {
  const code=(error as {code?:string})?.code||'';
  if(code==='permission-denied')return 'Akses data ditolak. Periksa aturan akses cloud untuk akun yang sedang masuk.';
  if(code==='unavailable')return 'Koneksi ke database terputus. Periksa internet lalu coba lagi.';
  return 'Data belum bisa dimuat. Coba lagi beberapa saat.';
}
export function AppProvider({children}:{children:React.ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[access,setAccess]=useState<AccessState>('checking'),[admin,setAdmin]=useState(false),[accessRequests,setAccessRequests]=useState(0),[revoked,setRevoked]=useState(false),[profile,setProfile]=useState<Profile|null>(null),[data,setData]=useState<Data>(emptyData),[loading,setLoading]=useState(true),[error,setError]=useState(''),[sync,setSync]=useState<'syncing'|'synced'|'offline'|'error'>('syncing');
  const [spaces,setSpaces]=useState<Space[]>([]),[spacesReady,setSpacesReady]=useState(false),[mode,setMode]=useState('');
  // 9.0 Pribadi or a Ruang Bersama: the records on screen. Everything below that reads or writes records uses `root`.
  const space=useMemo(()=>spaces.find(s=>s.id===mode)||null,[spaces,mode]);
  // A device last used in a space waits for the list of spaces (from the device copy, at once) instead of loading Pribadi first.
  const root=user?(mode&&!spacesReady?'':space?spaceKey(space.id):user.uid):'';
  const shown=useMemo(()=>profile&&space?spaceProfile(profile,space):profile,[profile,space]);
  const dataUser=useMemo(()=>user&&space?Object.create(user,{uid:{value:spaceKey(space.id),enumerable:true}}) as User:user,[user,space]);
  const cycle=useMemo(()=>salaryCycle(dateInTimeZone(new Date(),shown?.timeZone),shown?.salaryCycleStartDay||24),[shown?.salaryCycleStartDay,shown?.timeZone]);
  useEffect(()=>{if(!auth){setLoading(false);return;}return onAuthStateChanged(auth,u=>{void import('@/lib/catat/session').then(m=>m.clearSession());if(!u){try{localStorage.removeItem('dompet-ajaib:appearance:last')}catch{}forgetGreetingName();applyAppearance(null)}else applyAppearance(readCachedAppearance(u.uid));setUser(u);setProfile(null);setData(emptyData);setError('');setSync('syncing');setLoading(Boolean(u));if(u){/* 8.6 A device that was let in before opens at once; the check runs alongside and closes the app if access was taken back. */const known=knownAccess(u.uid);const openProfile=()=>initProfile(u).catch(e=>{setError(dataError(e));setSync('error');setLoading(false);});if(known.granted){setAdmin(known.admin);setAccess('granted');void openProfile();}else setAccess('checking');void checkAccess(u).then(r=>{if(auth?.currentUser?.uid!==u.uid)return;setAdmin(r.admin);setRevoked(r.revoked);if(known.granted){if(r.state!=='granted'){setAccess(r.state);setLoading(false);}return;}setAccess(r.state);if(r.state==='granted')void openProfile();else setLoading(false);});}else{setAccess('checking');setAdmin(false);}},()=>{applyAppearance(null);setError('Sesi gagal dibaca.');setLoading(false);});},[]);
  // Keeps the device copy current (only changed documents are downloaded); the screens read that copy.
  useEffect(()=>{if(!root||access!=='granted')return;return startSync(root);},[root,access]);
  // Leftovers of the withdrawn 5.0 "Adaptive Simplicity" build (menu usage per account): removed, never read.
  useEffect(()=>{try{for(const k of Object.keys(localStorage))if(k.startsWith('dompet-ajaib:usage:'))localStorage.removeItem(k);}catch{}},[]);
  // 6.6: the browser's own form warnings in Indonesian, everywhere (login included).
  useEffect(()=>installFormMessages(),[]);
  // Transactions this device deleted: confirmed with the server once per opening (lib/tombstones.ts).
  useEffect(()=>{if(!root||access!=='granted')return;const uid=root,run=()=>{void checkDeletedTransactions(uid).then(()=>tidyCloud(uid)).catch(()=>undefined)},timer=setTimeout(run,4000);window.addEventListener('online',run);return()=>{clearTimeout(timer);window.removeEventListener('online',run)};},[root,access]);
  useEffect(()=>{if(root&&shown)noteDeleteMarks(root,shown.syncMarks);},[root,shown?.syncMarks]);
  useEffect(()=>{if(!user||access!=='granted')return;return subscribeProfile(user.uid,p=>{if(p){applyAppearance(p);cacheAppearance(p)}setProfile(p);if(p){setError('');setLoading(false);}},e=>{setError(dataError(e));setSync('error');setLoading(false);});},[user,access]);
  useEffect(()=>{if(!profile)return;applyAppearance(profile);const media=window.matchMedia('(prefers-color-scheme: dark)');const refresh=()=>applyAppearance(profile);media.addEventListener('change',refresh);return()=>media.removeEventListener('change',refresh);},[profile?.uid,profile?.theme,profile?.themePreset,profile?.colorMode,profile?.accentColor,profile?.density,profile?.fontSize]);
  useEffect(()=>{if(!root||!shown)return;const uid=root;setData(emptyData);return subscribeData(uid,cycle.start,cycle.end,(key,value)=>setData(previous=>({...previous,[key]:value} as Data)),e=>{setError(dataError(e));setSync('error');},setSync,dateInTimeZone(new Date(),shown.timeZone),shown.salaryCycleStartDay);},[root,Boolean(shown),shown?.uid,shown?.timeZone,shown?.salaryCycleStartDay,cycle.start,cycle.end]);
  // v62: text size S is the new default. Accounts still on the old default (M, or never chosen) move to S once; any choice after that stays.
  useEffect(()=>{if(!user||!profile||(profile.appearanceDefaults||0)>=2)return;void saveProfile(user.uid,{appearanceDefaults:2,...(!profile.fontSize||profile.fontSize==='m'?{fontSize:'s' as const}:{})}).catch(()=>{});},[user,profile?.uid,profile?.appearanceDefaults]);
  useEffect(()=>{if(root&&shown&&data.budgets.some(b=>b.rolloverEnabled))void settleBudgets(root,data.budgets,shown.salaryCycleStartDay,dateInTimeZone(new Date(),shown.timeZone)).catch(e=>setError(e.message));},[root,shown?.uid,shown?.salaryCycleStartDay,shown?.timeZone,data.budgets]);
  useEffect(()=>{if(root&&data.recurring.length&&typeof navigator!=='undefined'&&navigator.onLine)void createDueDrafts(root,data.recurring,todayInTimeZone(profile?.timeZone)).catch(e=>setError(e.message));},[root,profile?.timeZone,data.recurring]);
  // Bunga saldo otomatis: completed days are credited lazily when the app is open (lib/interest-store.ts). Runs again
  // after transactions change, so a backdated edit recalculates the affected days; writes are idempotent per day.
  const txKey=`${data.transactions.length}:${data.transactions.reduce((n,t)=>n+t.amount+t.date.length,0)}`;
  const interestKey=data.wallets.filter(w=>(w.interest?.enabled||w.interest?.endDate)&&!w.isArchived).map(w=>`${w.id}:${JSON.stringify(w.interest)}`).join('|');
  useEffect(()=>{if(!root||!interestKey||typeof navigator==='undefined'||!navigator.onLine)return;const timer=setTimeout(()=>{void import('@/lib/interest-store').then(m=>m.accrueInterest(root,data.wallets,data.categories,todayInTimeZone(profile?.timeZone))).catch(e=>console.error('Bunga saldo:',e));},2500);return()=>clearTimeout(timer);},[root,interestKey,profile?.timeZone,txKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(root&&data.drafts.some(d=>d.status==='pending'&&d.mode==='auto')&&typeof navigator!=='undefined'&&navigator.onLine)void postAutoDrafts(root,data.drafts);},[root,data.drafts]);
  // 9.0 The spaces this person is in (live), and the mode this device used last.
  useEffect(()=>{setSpaces([]);setSpacesReady(false);if(!user)return;try{setMode(localStorage.getItem(`dompet-ajaib:mode:${user.uid}`)||'')}catch{setMode('')}if(access!=='granted')return;return subscribeMySpaces(user.uid,list=>{setSpaces(list);setSpacesReady(true);},()=>setSpacesReady(true));},[user?.uid,access]);
  // Left or removed from the space on screen: back to Pribadi.
  useEffect(()=>{if(spacesReady&&mode&&!spaces.some(s=>s.id===mode))switchTo(null);},[spacesReady,spaces,mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{setActor(user?{uid:user.uid,name:profile?.displayName||user.displayName||(user.email||'').split('@')[0]}:null);},[user?.uid,profile?.displayName]);
  function switchTo(spaceId:string|null){const next=spaceId||'';if(user)try{localStorage.setItem(`dompet-ajaib:mode:${user.uid}`,next)}catch{/* this device opens in Pribadi */}setMode(next);}
  const view=useMemo(()=>({...data,funds:resolveFunds(data.funds,data.wallets)}),[data]);
  const refreshAccess=()=>{const u=auth?.currentUser;if(!u)return;setLoading(true);void checkAccess(u).then(r=>{setAdmin(r.admin);setRevoked(r.revoked);setAccess(r.state);if(r.state==='granted')initProfile(u).catch(e=>{setError(dataError(e));setSync('error');setLoading(false);});else setLoading(false);});};
  // Last active, for the owner's list (at most every 6 hours).
  // 6.6: the owner sees who is active right now: a beat on open, on coming back to the app, and every 5 minutes while it is on screen.
  useEffect(()=>{if(!user||access!=='granted')return;const uid=user.uid,beat=()=>{if(document.visibilityState==='visible')void markSeen(uid);};beat();const timer=setInterval(beat,SEEN_EVERY);document.addEventListener('visibilitychange',beat);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',beat);};},[user?.uid,access]);
  // The owner takes access back while the app is open: the access screen shows at once, saying so.
  useEffect(()=>{if(!user||admin||access!=='granted')return;return watchOwnGrant(user.uid,()=>{setRevoked(true);setAccess('needs-code');});},[user?.uid,admin,access]);
  useEffect(()=>{if(!admin||access!=='granted'){setAccessRequests(0);return;}return watchRequests(list=>setAccessRequests(list.length));},[admin,access]);
  const value={user:dataUser,profile:shown,data:view,loading,error,cycle,sync,ready:configured,access,admin,refreshAccess,accessRequests,revoked,account:user,personalProfile:profile,space,spaces,spacesReady,switchTo};return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp(){const context=useContext(Context);if(!context)throw Error('AppProvider missing');return context;}
