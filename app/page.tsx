'use client';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { TxActionsContext } from '@/components/tx-actions';
import { UndoDeleteProvider, useUndoDelete } from '@/components/undo-delete';
import { HubTabs, hubByKey, hubOf, hubs } from '@/components/hubs';
import { useHubSwipe } from '@/components/hub-swipe';
import { useBackGuard } from '@/components/back-guard';
import { useRouter } from 'next/navigation';
import { Compass, Search, ScanText, Archive, BarChart3, BookOpenText, CalendarDays, CalendarClock, ChartNoAxesCombined, CircleHelp, CreditCard, HandCoins, HeartPulse, Gift, Home, Inbox, Layers3, LayoutGrid, Lightbulb, ListFilter, Plus, ReceiptText, Repeat, ScrollText, Settings, ShieldCheck, Target, Wallet } from 'lucide-react';
import { useApp } from '@/components/app-provider';
// Every page except Beranda is its own download, fetched when first opened (and warmed up in the background).
const viewLoading = () => <div className="view-skeleton" aria-busy="true" aria-label="Memuat halaman"><span/><span/><span/></div>;
const pages = {
  insights: () => import('@/components/insights'), reports: () => import('@/components/reports'), manage: () => import('@/components/manage-views'),
  receivables: () => import('@/components/receivables-refined'), budgets: () => import('@/components/budgets-refined'), identity: () => import('@/components/identity-views'),
  settings: () => import('@/components/settings'), inbox: () => import('@/components/transaction-inbox'), recurring: () => import('@/components/recurring-control'),
  planning: () => import('@/components/financial-planning'), control: () => import('@/components/financial-control-views'), advisor: () => import('@/components/advisor-view'), wishlist: () => import('@/components/wishlist'),
  help: () => import('@/components/help-center'), split: () => import('@/components/split-bill'), owed: () => import('@/components/owed-tools'),
  explore: () => import('@/components/feature-explorer'),
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
const SplitBillView = lazyView(pages.split, m => m.SplitBillView);
const OwedArchive = lazyView(pages.owed, m => m.OwedArchive);
const FeatureExplorer = lazyView(pages.explore, m => m.FeatureExplorer);
import { Dashboard } from '@/components/dashboard-home';
import { LoadingScreen, rememberGreetingName, rememberSplashStyle } from '@/components/loading-screen';
import { useMenuPlacement } from '@/components/menu-placement';
import { Sidebar } from '@/components/sidebar';
import { MobileNavigation } from '@/components/mobile-navigation';
import { TransactionForm } from '@/components/transaction-form';
import { ReceiptScan } from '@/components/receipt-scan';
import { InterestTxDetail } from '@/components/wallet-interest';
import { isCycleClosed } from '@/lib/finance-control';
import { rupiah } from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Confirm } from '@/components/ui/alert-dialog';
import { deleteTransaction, whenSent } from '@/lib/firestore';
import { OwedReport } from '@/components/owed-report';
import { clearDeletePending, markDeletePending } from '@/lib/tombstones';
import { Onboarding } from '@/components/onboarding';
import { NotificationBell, NotificationProvider, useNotify } from '@/components/notifications';
import { AmountToggle } from '@/components/hide-amounts';
import { PinLockScreen, useAppLock } from '@/components/pin-lock';
import { useReminderEngine } from '@/components/reminders';
import type { LedgerTx } from '@/lib/types';
import { useSearchHotkey } from '@/components/usage-hooks';
// The search sheet carries the whole Tanya Jawab index: downloaded the first time search opens.
const FeatureSearch = lazy(() => import('@/components/feature-search').then(m => ({ default: m.FeatureSearch })));
import { DiscoveryCard, Orientation, PageHelp } from '@/components/adaptive';
import { countVisit, writeUsage } from '@/lib/usage';
import type { FeatureAction } from '@/lib/features';
const nav=[{key:'dashboard',label:'Beranda',icon:Home},{key:'transactions',label:'Transaksi',icon:ListFilter},{key:'inbox',label:'Perlu Dikonfirmasi',icon:Inbox},{key:'budgets',label:'Anggaran',icon:LayoutGrid},{key:'advisor',label:'Insight',icon:Lightbulb},{key:'wallets',label:'Dompet',icon:Wallet},{key:'claims',label:'Klaim kantor',icon:ShieldCheck},{key:'receivables',label:'Piutang',icon:HandCoins},{key:'debts',label:'Utang',icon:CreditCard},{key:'owedReport',label:'Laporan utang & piutang',icon:BookOpenText},{key:'owedArchive',label:'Arsip utang & piutang',icon:Archive},{key:'funds',label:'Tujuan dana',icon:Target},{key:'wishlist',label:'Wish list',icon:Gift},{key:'splitbill',label:'Split Bill',icon:ReceiptText},{key:'recurring',label:'Rutin',icon:Repeat},{key:'upcoming',label:'Arus Kas Mendatang',icon:CalendarClock},{key:'calendar',label:'Kalender Keuangan',icon:CalendarDays},{key:'categories',label:'Kategori',icon:Layers3},{key:'forecast',label:'Proyeksi',icon:ChartNoAxesCombined},{key:'analytics',label:'Analisis',icon:BarChart3},{key:'report',label:'Laporan',icon:BookOpenText},{key:'cycles',label:'Riwayat Siklus',icon:ScrollText},{key:'health',label:'Periksa Data',icon:HeartPulse},{key:'settings',label:'Pengaturan',icon:Settings},{key:'help',label:'Tanya Jawab',icon:CircleHelp},{key:'explore',label:'Jelajahi Dompet Ajaib',icon:Compass}];
/** What the sidebar and the phone menu show, grouped by what people want to do (5.0); related pages stay in hubs with tabs. */
const pick=(key:string)=>({...nav.find(item=>item.key===key)!});
const hubItem=(key:string,section?:string)=>{const hub=hubByKey(key)!;return {key:hub.key,label:hub.label,icon:hub.icon,...(section?{section}:{})}};
const menu=[...['dashboard','transactions','wallets','budgets','advisor'].map(pick),{...pick('funds'),section:'RENCANAKAN'},pick('wishlist'),hubItem('schedule'),hubItem('owed','UTANG, PIUTANG & KLAIM'),pick('splitbill'),{...hubItem('reports','PAHAMI'),label:'Laporan'},{...pick('categories'),section:'LAINNYA'},pick('settings'),pick('help'),pick('explore')];
/** Holds the open page. Its entrance animation is fixed when the page opens, so later updates never replay it. */
function ViewEnter({ from, children }: { from: string; children: ReactNode }) {
  const [className] = useState(() => `view-enter${from ? ` from-${from}` : ''}`);
  return <div className={className}>{children}</div>;
}
/** A Split Bill transaction: what part is the user's own spending, and where the bill is changed. */
function SplitTxNotice({tx,onOpen}:{tx:LedgerTx;onOpen:()=>void}){const own=tx.walletId?Math.max(0,Math.min(tx.amount,tx.ownShare||0)):tx.amount;return <div className="notice sb-tx-notice"><strong>{tx.walletId?'Bagian dari Split Bill.':'Bagianmu di Split Bill yang dibayar orang lain.'}</strong><p>{tx.walletId?`Uang keluar ${rupiah(tx.amount)}, tetapi pengeluaranmu hanya ${rupiah(own)}. Sisanya ${rupiah(tx.amount-own)} ditalangi untuk orang lain dan tercatat sebagai piutang.`:`Pengeluaranmu ${rupiah(own)} tanpa mengubah saldo dompet. Nominal dan pembayarannya diatur lewat Split Bill.`}</p><small className="muted">Untuk menghapusnya, buka Split Bill lalu pilih Batalkan: transaksi ini dan piutangnya ikut terhapus.</small><Button type="button" className="small" onClick={onOpen}><ReceiptText size={15}/> Buka Split Bill</Button></div>}
export default function Page(){return <NotificationProvider><UndoDeleteProvider><AppPage/></UndoDeleteProvider></NotificationProvider>}
function AppPage(){const {user,profile,data,loading,error,ready,sync}=useApp();const {notify:setToast,track,push}=useNotify();const undo=useUndoDelete();const appLock=useAppLock();useMenuPlacement();const router=useRouter(),[view,setView]=useState('dashboard'),[txOpen,setTxOpen]=useState(false),[scan,setScan]=useState<null|'expense'|'income'>(null),[preset,setPreset]=useState<Partial<LedgerTx>|undefined>(),[editing,setEditing]=useState<LedgerTx|undefined>(),[focus,setFocus]=useState<string|undefined>(),[revision,setRevision]=useState(0),[online,setOnline]=useState(true),[searchOpen,setSearchOpenState]=useState(false),[searchUsed,setSearchUsed]=useState(false),[quickStart,setQuickStart]=useState(false);
 const trail=useRef<string[]>([]),viewRef=useRef(view),lastTab=useRef<Record<string,string>>({});viewRef.current=view;
 // Back button: previous page first, then Beranda, then "press again to exit".
 useBackGuard(()=>{const previous=trail.current.pop();if(previous!==undefined){setFocus(undefined);setView(previous);return true}if(viewRef.current!=='dashboard'){setFocus(undefined);setView('dashboard');return true}return false},()=>push({title:'Tekan kembali sekali lagi untuk keluar',kind:'info',history:false}));
 useEffect(()=>{if(!loading&&!user&&ready)router.replace('/login/');},[loading,user,ready,router]);
 useEffect(()=>{if(!user)return;const warm=()=>{preloads.forEach(load=>void load().catch(()=>{}));void import('@/components/feature-search').catch(()=>{})};const idle=(window as Window&{requestIdleCallback?:(cb:()=>void)=>number}).requestIdleCallback;const id=idle?idle(warm):window.setTimeout(warm,2500);return()=>{if(!idle)clearTimeout(id)}},[user?.uid]);
 useEffect(()=>{if(!profile?.onboardingDone)return;const params=new URLSearchParams(window.location.search),action=params.get('action'),target=params.get('view');if(!action&&!target)return;if(target&&nav.some(item=>item.key===target))setView(target);if(action==='expense'||action==='income'||action==='transfer')openTx({type:action});window.history.replaceState(window.history.state,'',window.location.pathname)},[profile?.onboardingDone]);useEffect(()=>{setOnline(navigator.onLine);const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[]);useEffect(()=>{const close=(event:Event)=>{const target=event.target instanceof Element?event.target:null;document.querySelectorAll<HTMLDetailsElement>('details.more-actions[open]').forEach(menu=>{if(!target||!menu.contains(target)||target.closest('.more-menu button'))menu.open=false})};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')document.querySelectorAll<HTMLDetailsElement>('details.more-actions[open]').forEach(menu=>{menu.open=false})};document.addEventListener('click',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',escape)}},[]);
 function setSearchOpen(open:boolean){if(open)setSearchUsed(true);setSearchOpenState(open)}
 function openTx(p?:Partial<LedgerTx>,e?:LedgerTx){setQuickStart(false);setPreset(p);setEditing(e);setTxOpen(true)}
 /** Deletes with a few seconds to undo; opening records of debts/claims/receivables are changed through their record instead. */
 const txActions={remove:(tx:LedgerTx)=>removeTx(tx),edit:(tx:LedgerTx)=>openTx(undefined,tx)};
 function removeTx(tx:LedgerTx){if(!user)return;if(['claim_advance','receivable_issue','borrowing'].includes(tx.type)||tx.splitBillId&&tx.type==='expense'){openTx(undefined,tx);return}const uid=user.uid;undo.remove(tx.id,'Transaksi',()=>{markDeletePending(tx.id);const offline=typeof navigator!=='undefined'&&!navigator.onLine;return (tx.interest?import('@/lib/interest-store').then(m=>m.deleteInterest(uid,tx.id)):deleteTransaction(uid,tx.id)).then(()=>{setRevision(n=>n+1);if(offline)void whenSent().then(()=>push({title:'Transaksi terhapus dari cloud.',body:[tx.description||tx.merchant,rupiah(tx.amount)].filter(Boolean).join(' · '),kind:'success'}))}).finally(()=>clearDeletePending(tx.id))},[tx.description||tx.merchant,rupiah(tx.amount)].filter(Boolean).join(' · '))}
 /** Saves in the background: the form closes at once and a card shows the sync progress. */
 function saveInBackground(run:()=>Promise<unknown>,info:{message:string;detail?:string;retry:{preset?:Partial<LedgerTx>;editing?:LedgerTx}}){setTxOpen(false);track(run(),{pending:info.retry.editing?'Memperbarui transaksi…':'Menyimpan transaksi…',success:info.message,detail:info.detail,failure:'Transaksi belum tersimpan',retry:{label:'Buka lagi',run:()=>openTx(info.retry.preset,info.retry.editing)},after:()=>setRevision(n=>n+1)})}const go=(requested:string,target?:string)=>{const hub=hubByKey(requested),key=hub?(lastTab.current[hub.key]||hub.tabs[0][0]):requested;if(key==='dashboard')trail.current=[];else if(key!==view){trail.current.push(view);if(trail.current.length>30)trail.current.shift()}setFocus(target);setView(key);const inHub=hubOf(key);if(inHub)lastTab.current[inHub.key]=key;window.scrollTo({top:0,behavior:'smooth'})};const selectTab=(key:string)=>{const inHub=hubOf(key);if(inHub)lastTab.current[inHub.key]=key;setFocus(undefined);setView(key)};const props={notify:setToast,openTx,revision};
 useReminderEngine(go);
 /** One way to open any capability (search, Lainnya, Jelajahi, discovery, "Yang bisa dilakukan di sini"). */
 function openFeature(action:FeatureAction){if(action.kind==='view')go(action.view,action.focus);else if(action.kind==='tx')openTx(action.type?{type:action.type}:undefined);else if(action.kind==='scan')setScan('expense');else{setPreset(undefined);setEditing(undefined);setQuickStart(true);setTxOpen(true)}}
 useSearchHotkey(useCallback(()=>setSearchOpen(true),[]));
 // Pages opened, counted on this device (Discovery: "never opened Insight"); no financial data.
 useEffect(()=>{if(user)writeUsage(user.uid,u=>countVisit(u,view))},[view,user?.uid]);
 useEffect(()=>{if(profile)rememberGreetingName(profile.displayName||profile.username||'');},[profile?.displayName,profile?.username]);
 useEffect(()=>{rememberSplashStyle(profile?.splashStyle);},[profile?.splashStyle]);
 const hubSwipe=useHubSwipe(view,selectTab);
 if(!ready)return <main className="loading-screen"><div className="panel"><h2>Dompet Ajaib belum terhubung</h2><p className="muted" style={{marginTop:8}}>Isi konfigurasi Firebase pada berkas .env.local sesuai panduan proyek, lalu jalankan ulang aplikasi.</p></div></main>;
 if(!loading&&user&&!profile&&error)return <main className="loading-screen"><div className="panel"><h2>Catatan keuangan belum bisa dibuka</h2><p className="form-error" style={{marginTop:12}}>{error}</p><p className="muted" style={{marginTop:12}}>Jika baru membuat link percobaan, buka Firebase Console → Firestore Database → Rules dan pastikan akunmu diberi akses ke datanya sendiri.</p><Button style={{marginTop:16}} onClick={()=>window.location.reload()}>Coba lagi</Button></div></main>;
 if(loading||!user||!profile)return <LoadingScreen stage={!user?0:!profile?1:2} error={error} name={profile?.displayName||profile?.username||''} style={profile?.splashStyle}/>;
 if(!profile.onboardingDone)return <Onboarding notify={setToast}/>;
 if(appLock.locked)return <PinLockScreen onUnlock={appLock.unlock}/>;
 const views:Record<string,React.ReactNode>={dashboard:<Dashboard openTx={openTx} navigate={go} notify={setToast} focus={focus} openFeature={openFeature}/>,transactions:<TransactionsView {...props} focus={focus}/>,inbox:<TransactionInbox openTx={openTx} notify={setToast}/>,budgets:<BudgetsView {...props} navigate={go}/>,wallets:<WalletsView {...props} focus={focus} navigate={go}/>,claims:<ClaimsView {...props}/>,receivables:<ReceivablesView {...props} navigate={go}/>,debts:<DebtsView {...props} navigate={go}/>,splitbill:<SplitBillView {...props} navigate={go} focus={focus}/>,owedArchive:<OwedArchive navigate={go} focus={focus}/>,owedReport:<OwedReport navigate={go}/>,funds:<FundsView {...props}/>,recurring:<RecurringControl notify={setToast} navigateInbox={()=>go('inbox')}/>,upcoming:<UpcomingView openTx={openTx} notify={setToast}/>,calendar:<FinancialCalendar notify={setToast}/>,categories:<CategoriesView {...props}/>,forecast:<ForecastView focus={focus}/>,analytics:<AnalyticsView navigate={go}/>,report:<ReportView navigate={go}/>,cycles:<CycleHistory notify={setToast}/>,health:<DataHealth notify={setToast} navigate={go}/>,advisor:<AdvisorView navigate={go} focus={focus}/>,wishlist:<WishlistView openTx={openTx}/>,settings:<SettingsView notify={setToast} navigate={go} focus={focus} onLockNow={appLock.enabled?appLock.lock:undefined}/>,help:<HelpView navigate={go} focus={focus}/>,explore:<FeatureExplorer onOpen={openFeature}/>};
 return <div className="app-layout"><Sidebar items={menu} view={view} onNavigate={go}/><div className="main-area"><header className="topbar"><div className="topbar-title">{hubOf(view)?.label||nav.find(item=>item.key===view)?.label||'Dompet Ajaib'}</div><div className="topbar-actions"><PageHelp view={view} onOpen={openFeature}/><button type="button" className="icon-btn topbar-search" aria-label="Cari fitur" title="Cari fitur (Ctrl/⌘+K)" onClick={()=>setSearchOpen(true)}><Search size={18}/><span className="ts-label">Cari fitur…</span><kbd className="ts-kbd">Ctrl K</kbd></button><AmountToggle/><NotificationBell navigate={go}/><span className={`status-pill ${online&&sync!=='offline'&&sync!=='error'?'':'offline'}`}><i/>{online?(sync==='syncing'?'Menyinkron…':sync==='error'?'Gagal sinkron':sync==='offline'?'Data tersimpan lokal':'Tersinkron'):'Offline'}</span><Button className="small" aria-label="Catat transaksi" title="Catat transaksi" onClick={()=>openTx()}><Plus size={16}/><span className="btn-label">Catat transaksi</span></Button></div></header><TxActionsContext.Provider value={txActions}><main className="content" {...hubSwipe.handlers}>{error&&<div className="notice error">Koneksi data bermasalah: {error}</div>}<HubTabs view={view} onSelect={selectTab}/>{['transactions','wallets','advisor','analytics'].includes(view)&&<DiscoveryCard key={`dc-${view}`} screen={view} onOpen={openFeature}/>}<ViewEnter key={`${view}:${focus||''}`} from={hubSwipe.direction}>{views[view]}</ViewEnter></main></TxActionsContext.Provider></div><MobileNavigation view={view} items={menu} onNavigate={go} openTx={openTx} onScan={()=>setScan('expense')} onSearch={()=>setSearchOpen(true)}/>{searchUsed&&<Suspense fallback={null}><FeatureSearch open={searchOpen} onOpenChange={setSearchOpen} onOpen={openFeature}/></Suspense>}<Orientation show={data.transactions.length>=5}/><ReceiptScan open={scan!==null} onOpenChange={open=>{if(!open)setScan(null)}} startType={scan||'expense'} background={saveInBackground} openTx={openTx} navigate={go}/><Dialog open={txOpen} onOpenChange={setTxOpen}><DialogContent title={editing?(editing.interest?'Bunga saldo':editing.splitBillId&&!editing.walletId?'Bagianmu di Split Bill':'Ubah transaksi'):'Catat transaksi'}>{editing?.interest&&<InterestTxDetail tx={editing} notify={setToast} onDone={()=>setTxOpen(false)}/>}{editing&&editing.splitBillId&&editing.type==='expense'?<SplitTxNotice tx={editing} onOpen={()=>{setTxOpen(false);go('splitbill',`bill:${editing.splitBillId}`)}}/>:editing&&editing.type==='expense'&&editing.walletId&&<Button variant="secondary" className="full" style={{marginBottom:10}} onClick={()=>{setTxOpen(false);go('splitbill',`tx:${editing.id}`)}}><ReceiptText size={16}/> Split Bill: bagi tagihan ini</Button>}{editing&&!['claim_advance','receivable_issue','borrowing'].includes(editing.type)&&!(editing.splitBillId&&editing.type==='expense')&&<Button variant="danger" className="full" style={{marginBottom:editing.interest?6:15,marginTop:editing.interest?14:undefined}} onClick={()=>{setTxOpen(false);removeTx(editing)}}>{editing.interest?'Hapus bunga ini':'Hapus transaksi'}</Button>}{editing?.interest&&<p className="muted int-delete-note">Salah hitung? Hapus saja. Saldo dompet ikut turun dan bunga untuk tanggal ini tidak dibuat lagi.</p>}{editing&&isCycleClosed(editing.date,data.cycleSnapshots||[])&&<div className="notice">Transaksi ini berada dalam siklus yang sudah ditutup. Penghapusan akan menghitung ulang laporan siklus.</div>}{editing&&['claim_advance','receivable_issue','borrowing','claim_writeoff'].includes(editing.type)&&<div className="notice">Transaksi ini dibuat otomatis dari catatan utang, klaim, atau piutang, jadi ubah lewat catatan tersebut. Untuk klaim yang ditolak, hapus transaksi penolakannya lalu catat ulang.</div>}{!editing&&<button type="button" className="rs-entry" onClick={()=>{setTxOpen(false);setScan(preset?.type==='income'?'income':'expense')}}><ScanText size={18}/><span><strong>Scan struk</strong><small>Foto struk atau nota, isinya dibaca otomatis</small></span></button>}{!editing?.interest&&!(editing?.splitBillId&&editing.type==='expense'&&!editing.walletId)&&<TransactionForm key={editing?.id||JSON.stringify(preset)||(quickStart?'quick':'new')} startQuick={quickStart} preset={preset} editing={editing} background={saveInBackground} onQuick={next=>openTx(next)} onNavigate={(key,target)=>{setTxOpen(false);go(key,target)}} onDone={m=>{setTxOpen(false);setRevision(n=>n+1);setToast(m)}} onCancel={()=>setTxOpen(false)}/>}</DialogContent></Dialog></div>;
}
