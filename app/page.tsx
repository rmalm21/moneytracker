'use client';
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { TxActionsContext } from '@/components/tx-actions';
import { UndoDeleteProvider, useUndoDelete } from '@/components/undo-delete';
import { HubTabs, hubByKey, hubOf, hubs } from '@/components/hubs';
import { useHubSwipe } from '@/components/hub-swipe';
import { useBackGuard } from '@/components/back-guard';
import { useRouter } from 'next/navigation';
import { BarChart3, BookOpenText, CalendarDays, CalendarClock, ChartNoAxesCombined, CircleHelp, CreditCard, HandCoins, HeartPulse, Gift, Home, Inbox, Layers3, LayoutGrid, Lightbulb, ListFilter, Plus, Repeat, ScrollText, Settings, ShieldCheck, Target, Wallet } from 'lucide-react';
import { useApp } from '@/components/app-provider';
// Every page except Beranda is its own download, fetched when first opened (and warmed up in the background).
const viewLoading = () => <div className="view-skeleton" aria-busy="true" aria-label="Memuat halaman"><span/><span/><span/></div>;
const pages = {
  insights: () => import('@/components/insights'), reports: () => import('@/components/reports'), manage: () => import('@/components/manage-views'),
  receivables: () => import('@/components/receivables-refined'), budgets: () => import('@/components/budgets-refined'), identity: () => import('@/components/identity-views'),
  settings: () => import('@/components/settings'), inbox: () => import('@/components/transaction-inbox'), recurring: () => import('@/components/recurring-control'),
  planning: () => import('@/components/financial-planning'), control: () => import('@/components/financial-control-views'), advisor: () => import('@/components/advisor-view'), wishlist: () => import('@/components/wishlist'),
  help: () => import('@/components/help-center'),
};
const preloads: (() => Promise<unknown>)[] = [];
/** A page whose code is already downloaded opens at once; the skeleton only shows while it is still downloading. */
function lazyView<M, C extends ComponentType<never>>(load: () => Promise<M>, pick: (loaded: M) => C): C {
  let ready: ComponentType<object> | undefined;
  const preload = () => load().then(loaded => (ready = pick(loaded) as unknown as ComponentType<object>));
  const Lazy = lazy(() => preload().then(component => ({ default: component })));
  preloads.push(preload);
  function LazyView(props: object) {
    // Picked once per visit, so a page that finishes downloading while open is never swapped out (and reset).
    const [Ready] = useState(() => ready);
    return Ready ? <Ready {...props}/> : <Suspense fallback={viewLoading()}><Lazy {...props}/></Suspense>;
  }
  // Props go straight through, so the wrapper has the same type as the page it opens.
  return LazyView as unknown as C;
}
const HelpView = lazyView(pages.help, m => m.HelpView);
const ForecastView = lazyView(pages.insights, m => m.ForecastView);
const AnalyticsView = lazyView(pages.reports, m => m.AnalyticsView);
const ReportView = lazyView(pages.reports, m => m.ReportView);
const TransactionsView = lazyView(pages.manage, m => m.TransactionsView);
const ClaimsView = lazyView(pages.manage, m => m.ClaimsView);
const DebtsView = lazyView(pages.manage, m => m.DebtsView);
const FundsView = lazyView(pages.manage, m => m.FundsView);
const ReceivablesView = lazyView(pages.receivables, m => m.ReceivablesView);
const BudgetsView = lazyView(pages.budgets, m => m.BudgetsView);
const CategoriesView = lazyView(pages.identity, m => m.CategoriesView);
const WalletsView = lazyView(pages.identity, m => m.WalletsView);
const SettingsView = lazyView(pages.settings, m => m.SettingsView);
const TransactionInbox = lazyView(pages.inbox, m => m.TransactionInbox);
const RecurringControl = lazyView(pages.recurring, m => m.RecurringControl);
const FinancialCalendar = lazyView(pages.planning, m => m.FinancialCalendar);
const UpcomingView = lazyView(pages.planning, m => m.UpcomingView);
const CycleHistory = lazyView(pages.control, m => m.CycleHistory);
const DataHealth = lazyView(pages.control, m => m.DataHealth);
const AdvisorView = lazyView(pages.advisor, m => m.AdvisorView);
const WishlistView = lazyView(pages.wishlist, m => m.WishlistView);
import { Dashboard } from '@/components/dashboard-home';
import { LoadingScreen } from '@/components/loading-screen';
import { useMenuPlacement } from '@/components/menu-placement';
import { Sidebar } from '@/components/sidebar';
import { MobileNavigation } from '@/components/mobile-navigation';
import { TransactionForm } from '@/components/transaction-form';
import { isCycleClosed } from '@/lib/finance-control';
import { rupiah } from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Confirm } from '@/components/ui/alert-dialog';
import { deleteTransaction } from '@/lib/firestore';
import { Onboarding } from '@/components/onboarding';
import { NotificationBell, NotificationProvider, useNotify } from '@/components/notifications';
import { AmountToggle } from '@/components/hide-amounts';
import { PinLockScreen, useAppLock } from '@/components/pin-lock';
import { useReminderEngine } from '@/components/reminders';
import type { LedgerTx } from '@/lib/types';
const nav=[{key:'dashboard',label:'Beranda',icon:Home},{key:'transactions',label:'Transaksi',icon:ListFilter},{key:'inbox',label:'Perlu Dikonfirmasi',icon:Inbox},{key:'budgets',label:'Anggaran',icon:LayoutGrid},{key:'advisor',label:'Insight',icon:Lightbulb},{key:'wallets',label:'Dompet',icon:Wallet},{key:'claims',label:'Klaim kantor',icon:ShieldCheck},{key:'receivables',label:'Piutang',icon:HandCoins},{key:'debts',label:'Utang',icon:CreditCard},{key:'funds',label:'Tujuan dana',icon:Target},{key:'wishlist',label:'Wish list',icon:Gift},{key:'recurring',label:'Rutin',icon:Repeat},{key:'upcoming',label:'Arus Kas Mendatang',icon:CalendarClock},{key:'calendar',label:'Kalender Keuangan',icon:CalendarDays},{key:'categories',label:'Kategori',icon:Layers3},{key:'forecast',label:'Proyeksi',icon:ChartNoAxesCombined},{key:'analytics',label:'Analisis',icon:BarChart3},{key:'report',label:'Laporan',icon:BookOpenText},{key:'cycles',label:'Riwayat Siklus',icon:ScrollText},{key:'health',label:'Periksa Data',icon:HeartPulse},{key:'settings',label:'Pengaturan',icon:Settings},{key:'help',label:'Tanya Jawab',icon:CircleHelp}];
/** What the sidebar and the phone menu show: related pages are grouped into hubs with tabs. */
const menu=[...['dashboard','transactions','budgets','advisor'].map(key=>({...nav.find(item=>item.key===key)!})),{...nav.find(item=>item.key==='wallets')!,section:'KEUANGAN'},{...nav.find(item=>item.key==='funds')!},{...nav.find(item=>item.key==='wishlist')!},...hubs.filter(hub=>hub.key!=='reports').map(hub=>({key:hub.key,label:hub.label,icon:hub.icon})),{key:'reports',label:'Laporan',icon:BookOpenText,section:'LAPORAN'},{...nav.find(item=>item.key==='categories')!,section:'LAINNYA'},{...nav.find(item=>item.key==='settings')!},{...nav.find(item=>item.key==='help')!}];
/** Holds the open page. Its entrance animation is fixed when the page opens, so later updates never replay it. */
function ViewEnter({ from, children }: { from: string; children: ReactNode }) {
  const [className] = useState(() => `view-enter${from ? ` from-${from}` : ''}`);
  return <div className={className}>{children}</div>;
}
export default function Page(){return <NotificationProvider><UndoDeleteProvider><AppPage/></UndoDeleteProvider></NotificationProvider>}
function AppPage(){const {user,profile,data,loading,error,ready,sync}=useApp();const {notify:setToast,track,push}=useNotify();const undo=useUndoDelete();const appLock=useAppLock();useMenuPlacement();const router=useRouter(),[view,setView]=useState('dashboard'),[txOpen,setTxOpen]=useState(false),[preset,setPreset]=useState<Partial<LedgerTx>|undefined>(),[editing,setEditing]=useState<LedgerTx|undefined>(),[focus,setFocus]=useState<string|undefined>(),[revision,setRevision]=useState(0),[online,setOnline]=useState(true);
 const trail=useRef<string[]>([]),viewRef=useRef(view),lastTab=useRef<Record<string,string>>({});viewRef.current=view;
 // Back button: previous page first, then Beranda, then "press again to exit".
 useBackGuard(()=>{const previous=trail.current.pop();if(previous!==undefined){setFocus(undefined);setView(previous);return true}if(viewRef.current!=='dashboard'){setFocus(undefined);setView('dashboard');return true}return false},()=>push({title:'Tekan kembali sekali lagi untuk keluar',kind:'info',history:false}));
 useEffect(()=>{if(!loading&&!user&&ready)router.replace('/login/');},[loading,user,ready,router]);
 useEffect(()=>{if(!user)return;const warm=()=>preloads.forEach(load=>void load().catch(()=>{}));const idle=(window as Window&{requestIdleCallback?:(cb:()=>void)=>number}).requestIdleCallback;const id=idle?idle(warm):window.setTimeout(warm,2500);return()=>{if(!idle)clearTimeout(id)}},[user?.uid]);
 useEffect(()=>{if(!profile?.onboardingDone)return;const params=new URLSearchParams(window.location.search),action=params.get('action'),target=params.get('view');if(!action&&!target)return;if(target&&nav.some(item=>item.key===target))setView(target);if(action==='expense'||action==='income'||action==='transfer')openTx({type:action});window.history.replaceState(window.history.state,'',window.location.pathname)},[profile?.onboardingDone]);useEffect(()=>{setOnline(navigator.onLine);const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[]);useEffect(()=>{const close=(event:Event)=>{const target=event.target instanceof Element?event.target:null;document.querySelectorAll<HTMLDetailsElement>('details.more-actions[open]').forEach(menu=>{if(!target||!menu.contains(target)||target.closest('.more-menu button'))menu.open=false})};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')document.querySelectorAll<HTMLDetailsElement>('details.more-actions[open]').forEach(menu=>{menu.open=false})};document.addEventListener('click',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',escape)}},[]);
 function openTx(p?:Partial<LedgerTx>,e?:LedgerTx){setPreset(p);setEditing(e);setTxOpen(true)}
 /** Deletes with a few seconds to undo; opening records of debts/claims/receivables are changed through their record instead. */
 const txActions={remove:(tx:LedgerTx)=>removeTx(tx),edit:(tx:LedgerTx)=>openTx(undefined,tx)};
 function removeTx(tx:LedgerTx){if(!user)return;if(['claim_advance','receivable_issue','borrowing'].includes(tx.type)){openTx(undefined,tx);return}const uid=user.uid;undo.remove(tx.id,'Transaksi',()=>deleteTransaction(uid,tx.id).then(()=>setRevision(n=>n+1)),[tx.description||tx.merchant,rupiah(tx.amount)].filter(Boolean).join(' · '))}
 /** Saves in the background: the form closes at once and a card shows the sync progress. */
 function saveInBackground(run:()=>Promise<unknown>,info:{message:string;detail?:string;retry:{preset?:Partial<LedgerTx>;editing?:LedgerTx}}){setTxOpen(false);track(run(),{pending:info.retry.editing?'Memperbarui transaksi…':'Menyimpan transaksi…',success:info.message,detail:info.detail,failure:'Transaksi belum tersimpan',retry:{label:'Buka lagi',run:()=>openTx(info.retry.preset,info.retry.editing)},after:()=>setRevision(n=>n+1)})}const go=(requested:string,target?:string)=>{const hub=hubByKey(requested),key=hub?(lastTab.current[hub.key]||hub.tabs[0][0]):requested;if(key==='dashboard')trail.current=[];else if(key!==view){trail.current.push(view);if(trail.current.length>30)trail.current.shift()}setFocus(target);setView(key);const inHub=hubOf(key);if(inHub)lastTab.current[inHub.key]=key;window.scrollTo({top:0,behavior:'smooth'})};const selectTab=(key:string)=>{const inHub=hubOf(key);if(inHub)lastTab.current[inHub.key]=key;setFocus(undefined);setView(key)};const props={notify:setToast,openTx,revision};
 useReminderEngine(go);
 const hubSwipe=useHubSwipe(view,selectTab);
 if(!ready)return <main className="loading-screen"><div className="panel"><h2>Dompet Ajaib belum terhubung</h2><p className="muted" style={{marginTop:8}}>Isi konfigurasi Firebase pada berkas .env.local sesuai panduan proyek, lalu jalankan ulang aplikasi.</p></div></main>;
 if(!loading&&user&&!profile&&error)return <main className="loading-screen"><div className="panel"><h2>Catatan keuangan belum bisa dibuka</h2><p className="form-error" style={{marginTop:12}}>{error}</p><p className="muted" style={{marginTop:12}}>Jika baru membuat link percobaan, buka Firebase Console → Firestore Database → Rules dan pastikan akunmu diberi akses ke datanya sendiri.</p><Button style={{marginTop:16}} onClick={()=>window.location.reload()}>Coba lagi</Button></div></main>;
 if(loading||!user||!profile)return <LoadingScreen stage={!user?0:!profile?1:2} error={error}/>;
 if(!profile.onboardingDone)return <Onboarding notify={setToast}/>;
 if(appLock.locked)return <PinLockScreen onUnlock={appLock.unlock}/>;
 const views:Record<string,React.ReactNode>={dashboard:<Dashboard openTx={openTx} navigate={go} notify={setToast}/>,transactions:<TransactionsView {...props} focus={focus}/>,inbox:<TransactionInbox openTx={openTx} notify={setToast}/>,budgets:<BudgetsView {...props} navigate={go}/>,wallets:<WalletsView {...props} focus={focus} navigate={go}/>,claims:<ClaimsView {...props}/>,receivables:<ReceivablesView {...props}/>,debts:<DebtsView {...props}/>,funds:<FundsView {...props}/>,recurring:<RecurringControl notify={setToast} navigateInbox={()=>go('inbox')}/>,upcoming:<UpcomingView openTx={openTx} notify={setToast}/>,calendar:<FinancialCalendar notify={setToast}/>,categories:<CategoriesView {...props}/>,forecast:<ForecastView/>,analytics:<AnalyticsView navigate={go}/>,report:<ReportView navigate={go}/>,cycles:<CycleHistory notify={setToast}/>,health:<DataHealth notify={setToast}/>,advisor:<AdvisorView navigate={go}/>,wishlist:<WishlistView openTx={openTx}/>,settings:<SettingsView notify={setToast} navigate={go} focus={focus} onLockNow={appLock.enabled?appLock.lock:undefined}/>,help:<HelpView navigate={go} focus={focus}/>};
 return <div className="app-layout"><Sidebar items={menu} view={view} onNavigate={go}/><div className="main-area"><header className="topbar"><div className="topbar-title">{hubOf(view)?.label||nav.find(item=>item.key===view)?.label||'Dompet Ajaib'}</div><div className="topbar-actions"><AmountToggle/><NotificationBell navigate={go}/><span className={`status-pill ${online&&sync!=='offline'&&sync!=='error'?'':'offline'}`}><i/>{online?(sync==='syncing'?'Menyinkron…':sync==='error'?'Gagal sinkron':sync==='offline'?'Data tersimpan lokal':'Tersinkron'):'Offline'}</span><Button className="small" aria-label="Catat transaksi" title="Catat transaksi" onClick={()=>openTx()}><Plus size={16}/><span className="btn-label">Catat transaksi</span></Button></div></header><TxActionsContext.Provider value={txActions}><main className="content" {...hubSwipe.handlers}>{error&&<div className="notice error">Koneksi data bermasalah: {error}</div>}<HubTabs view={view} onSelect={selectTab}/><ViewEnter key={`${view}:${focus||''}`} from={hubSwipe.direction}>{views[view]}</ViewEnter></main></TxActionsContext.Provider></div><MobileNavigation view={view} items={menu} onNavigate={go} openTx={openTx}/><Dialog open={txOpen} onOpenChange={setTxOpen}><DialogContent title={editing?'Ubah transaksi':'Catat transaksi'}>{editing&&!['claim_advance','receivable_issue','borrowing'].includes(editing.type)&&<Button variant="danger" className="full" style={{marginBottom:15}} onClick={()=>{setTxOpen(false);removeTx(editing)}}>Hapus transaksi</Button>}{editing&&isCycleClosed(editing.date,data.cycleSnapshots||[])&&<div className="notice">Transaksi ini berada dalam siklus yang sudah ditutup. Penghapusan akan menghitung ulang laporan siklus.</div>}{editing&&['claim_advance','receivable_issue','borrowing','claim_writeoff'].includes(editing.type)&&<div className="notice">Transaksi ini dibuat otomatis dari catatan utang, klaim, atau piutang, jadi ubah lewat catatan tersebut. Untuk klaim yang ditolak, hapus transaksi penolakannya lalu catat ulang.</div>}<TransactionForm key={editing?.id||JSON.stringify(preset)||'new'} preset={preset} editing={editing} background={saveInBackground} onDone={m=>{setTxOpen(false);setRevision(n=>n+1);setToast(m)}} onCancel={()=>setTxOpen(false)}/></DialogContent></Dialog></div>;
}
