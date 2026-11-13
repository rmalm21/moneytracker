'use client';
import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { TxActionsContext } from '@/components/tx-actions';
import { UndoDeleteProvider, useUndoDelete } from '@/components/undo-delete';
import { HubTabs, hubByKey, hubOf, hubs } from '@/components/hubs';
import { useHubSwipe } from '@/components/hub-swipe';
import { useBackGuard } from '@/components/back-guard';
import { useRouter } from 'next/navigation';
import { Sparkles, ScanText, Archive, BarChart3, BookOpenText, CalendarDays, CalendarClock, ChartNoAxesCombined, CircleHelp, CreditCard, HandCoins, HeartPulse, Gift, Home, Inbox, Layers3, LayoutGrid, Lightbulb, ListFilter, Plus, ReceiptText, Repeat, ScrollText, Settings, ShieldCheck, Target, Wallet } from 'lucide-react';
import { useApp } from '@/components/app-provider';
// Every page except Beranda is its own download, fetched when first opened (and warmed up in the background).
const viewLoading = () => <div className="view-skeleton" aria-busy="true" aria-label="Memuat halaman"><span/><span/><span/></div>;
const pages = {
  insights: () => import('@/components/insights'), reports: () => import('@/components/reports'), manage: () => import('@/components/manage-views'),
  receivables: () => import('@/components/receivables-refined'), budgets: () => import('@/components/budgets-refined'), identity: () => import('@/components/identity-views'),
  settings: () => import('@/components/settings'), inbox: () => import('@/components/transaction-inbox'), recurring: () => import('@/components/recurring-control'),
  planning: () => import('@/components/financial-planning'), control: () => import('@/components/financial-control-views'), advisor: () => import('@/components/advisor-view'), wishlist: () => import('@/components/wishlist'),
  help: () => import('@/components/help-center'), split: () => import('@/components/split-bill'), owed: () => import('@/components/owed-tools'),
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
import { Dashboard } from '@/components/dashboard-home';
import dynamic from 'next/dynamic';
import { ChatMark } from '@/components/chat-mark';
import { loadSettings as loadChatSettings } from '@/lib/chat/store';
import { OPEN_GROUP, lastRead, subscribeLatestGroup, unreadCount } from '@/lib/space-chat';
// 8.6 Not needed to show Beranda: loaded after it (the chat, the forms, the receipt scanner, the charts, the popups),
// so opening the app reads and runs much less code first.
// 9.9.1 The loaded chat is kept here, so once its code is in it is drawn straight away: through dynamic() React first shows
// the loading button and then holds the chat back by up to 0.3 s, even when nothing is left to download.
let chatReady: typeof import('@/components/chat-assistant').ChatLauncher | undefined;
const loadChat = () => import('@/components/chat-assistant').then(m => { chatReady = m.ChatLauncher; return m; });
const ChatLauncherLazy = dynamic(() => loadChat().then(m => m.ChatLauncher), { ssr: false, loading: () => <ChatButton loading/> });
function ChatLauncher(props: ComponentProps<typeof ChatLauncherLazy>) {
  const [Ready] = useState(() => chatReady);
  return Ready ? <Ready {...props}/> : <ChatLauncherLazy {...props}/>;
}
/** 8.6 The chat button alone (light): the chat and its engine load on the first touch, then open at once. */
function ChatButton({ onOpen, loading = false, unread = 0 }: { onOpen?: () => void; loading?: boolean; unread?: number }) {
  const { user } = useApp();
  const [isNew] = useState(() => { try { return user ? !loadChatSettings(user.uid).seen : false; } catch { return false; } });
  if (!user) return null;
  return <button type="button" className={`chat-fab ${isNew ? 'is-new' : ''} ${loading ? 'is-loading' : ''}`} aria-label={unread ? `Buka chat, ${unread} pesan grup belum dibaca` : 'Buka asisten chat'} aria-busy={loading} onPointerDown={() => { void loadChat(); }} onClick={onOpen}><ChatMark/>{unread > 0 && <span className="chat-fab-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}</button>;
}
// 9.9.1 Kept as it is when the page around it changes (the form or a menu opening), so the chat is not redrawn for it.
const ChatEntry = memo(function ChatEntry(props: { openTx: (preset?: Partial<LedgerTx>) => void; navigate: (key: string, target?: string) => void }) {
  const { space, account } = useApp();
  const [wanted, setWanted] = useState<false | 'bot' | 'group'>(false);
  // 8.10 A tip ("Asisten chat") opens it.
  useTipTry({ home_chat: () => setWanted('bot') });
  // 9.2 Before the chat is loaded: the unread dot of the space's group, and the bell's "open the group".
  const unread = useGroupUnread(wanted ? undefined : space?.id, account?.uid);
  const [draft, setDraft] = useState('');
  useEffect(() => { if (wanted) return; const on = (e: Event) => { setDraft((e as CustomEvent<{ draft?: string }>).detail?.draft || ''); setWanted('group'); }; window.addEventListener(OPEN_GROUP, on); return () => window.removeEventListener(OPEN_GROUP, on); }, [wanted]);
  return wanted ? <ChatLauncher {...props} startOpen startTab={wanted} startDraft={draft}/> : <ChatButton unread={space ? unread : 0} onOpen={() => setWanted(space && unread ? 'group' : 'bot')}/>;
});
function useGroupUnread(spaceId?: string, uid?: string) {
  const [count, setCount] = useState(0);
  useEffect(() => { setCount(0); if (!spaceId || !uid) return; const since = lastRead(uid, spaceId); return subscribeLatestGroup(spaceId, list => setCount(unreadCount(list, uid, since))); }, [spaceId, uid]);
  return count;
}
// 9.9.1 Same for the transaction form: warmed up while the app is idle, then drawn at once on the first tap.
let formReady: typeof import('@/components/transaction-form').TransactionForm | undefined;
const loadForm = () => import('@/components/transaction-form').then(m => { formReady = m.TransactionForm; return m; });
const TransactionFormLazy = dynamic(() => loadForm().then(m => m.TransactionForm), { ssr: false, loading: () => <div className="form-loading" role="status">Membuka formulir…</div> });
function TransactionForm(props: ComponentProps<typeof TransactionFormLazy>) {
  const [Ready] = useState(() => formReady);
  return Ready ? <Ready {...props}/> : <TransactionFormLazy {...props}/>;
}
const ReceiptScan = dynamic(() => import('@/components/receipt-scan').then(m => m.ReceiptScan), { ssr: false });
const InterestTxDetail = dynamic(() => import('@/components/wallet-interest').then(m => m.InterestTxDetail), { ssr: false });
const SettleDialog = dynamic(() => import('@/components/settle-dialog').then(m => m.SettleDialog), { ssr: false });
const WhatsNew = dynamic(() => import('@/components/whats-new').then(m => m.WhatsNew), { ssr: false });
const OwedReport = dynamic(() => import('@/components/owed-report').then(m => m.OwedReport), { ssr: false });
const Onboarding = dynamic(() => import('@/components/onboarding').then(m => m.Onboarding), { ssr: false });
const WrappedView = dynamic(() => import('@/components/wrapped').then(m => m.WrappedView), { ssr: false });
const GooglePasswordPrompt = dynamic(() => import('@/components/google-password-prompt').then(m => m.GooglePasswordPrompt), { ssr: false });
const GameKeeper = dynamic(() => import('@/components/game/game-keeper').then(m => m.GameKeeper), { ssr: false });
const Celebrations = dynamic(() => import('@/components/game/celebrate').then(m => m.Celebrations), { ssr: false });
const MiniGames = dynamic(() => import('@/components/game/minigames').then(m => m.MiniGames), { ssr: false });
const PetDock = dynamic(() => import('@/components/pet/pet-dock').then(m => m.PetDock), { ssr: false });
/** Renders its children once the browser is idle after the first screen (or after `wait` ms at most). */
function AfterFirstPaint({ children, wait = 1500 }: { children: ReactNode; wait?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) { const id = idle(() => setReady(true), { timeout: wait }); return () => (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id); }
    const id = window.setTimeout(() => setReady(true), 300); return () => window.clearTimeout(id);
  }, [wait]);
  return ready ? <>{children}</> : null;
}
import { LoadingScreen, rememberGreetingName, rememberSplashStyle } from '@/components/loading-screen';
import { HomeShotOff, HomeShotSwap, useHomeShotKeeper } from '@/components/home-shot';
import { useMenuPlacement } from '@/components/menu-placement';
import { Sidebar } from '@/components/sidebar';
import { MobileNavigation } from '@/components/mobile-navigation';
import { isCycleClosed } from '@/lib/finance-control';
import { rupiah } from '@/lib/accounting';
import { Button } from '@/components/ui/button';
import type { SettleTarget } from '@/components/settle-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RecordedTo, SpaceSwitch } from '@/components/space-switch';
const SpaceWatch = dynamic(() => import('@/components/space-watch').then(m => m.SpaceWatch), { ssr: false });
const PayPersonallyDialog = dynamic(() => import('@/components/space-money').then(m => m.PayPersonallyDialog), { ssr: false });
const SpaceFlowNotice = dynamic(() => import('@/components/space-money').then(m => m.SpaceFlowNotice), { ssr: false });
const ShareToGroup = dynamic(() => import('@/components/space-chat').then(m => m.ShareToGroup), { ssr: false });
import { Confirm } from '@/components/ui/alert-dialog';
import { deleteTransaction, whenSent } from '@/lib/firestore';
import { clearDeletePending, markDeletePending } from '@/lib/tombstones';
import { AccessGate } from '@/components/access-gate';
import { NotificationBell, NotificationProvider, useNotify } from '@/components/notifications';
import { REKAP_EVENT } from '@/lib/rekap-open';
import { AmountToggle } from '@/components/hide-amounts';
import { FeatureTips, FeatureTipsBridge, useTipTry } from '@/components/feature-tips';
import { PinLockScreen, useAppLock } from '@/components/pin-lock';
import { useReminderEngine } from '@/components/reminders';
import type { Debt, LedgerTx } from '@/lib/types';
const nav=[{key:'dashboard',label:'Beranda',icon:Home},{key:'transactions',label:'Transaksi',icon:ListFilter},{key:'inbox',label:'Perlu Dikonfirmasi',icon:Inbox},{key:'budgets',label:'Anggaran',icon:LayoutGrid},{key:'advisor',label:'Insight',icon:Lightbulb},{key:'wallets',label:'Dompet',icon:Wallet},{key:'claims',label:'Klaim kantor',icon:ShieldCheck},{key:'receivables',label:'Piutang',icon:HandCoins},{key:'debts',label:'Utang',icon:CreditCard},{key:'owedReport',label:'Laporan utang & piutang',icon:BookOpenText},{key:'owedArchive',label:'Arsip utang & piutang',icon:Archive},{key:'funds',label:'Tujuan dana',icon:Target},{key:'wishlist',label:'Wish list',icon:Gift},{key:'splitbill',label:'Split Bill',icon:ReceiptText},{key:'recurring',label:'Rutin',icon:Repeat},{key:'upcoming',label:'Arus Kas Mendatang',icon:CalendarClock},{key:'calendar',label:'Kalender Keuangan',icon:CalendarDays},{key:'categories',label:'Kategori',icon:Layers3},{key:'forecast',label:'Proyeksi',icon:ChartNoAxesCombined},{key:'analytics',label:'Analisis',icon:BarChart3},{key:'report',label:'Laporan',icon:BookOpenText},{key:'cycles',label:'Riwayat Siklus',icon:ScrollText},{key:'health',label:'Periksa Data',icon:HeartPulse},{key:'settings',label:'Pengaturan',icon:Settings},{key:'help',label:'Tanya Jawab',icon:CircleHelp}];
/** What the sidebar and the phone menu show: related pages are grouped into hubs with tabs. */
const menu=[...['dashboard','transactions','budgets','advisor'].map(key=>({...nav.find(item=>item.key===key)!})),{...nav.find(item=>item.key==='wallets')!,section:'KEUANGAN'},{...nav.find(item=>item.key==='funds')!},{...nav.find(item=>item.key==='wishlist')!},...hubs.filter(hub=>hub.key!=='reports').flatMap(hub=>hub.key==='owed'?[{key:hub.key,label:hub.label,icon:hub.icon},{...nav.find(item=>item.key==='splitbill')!}]:[{key:hub.key,label:hub.label,icon:hub.icon}]),{key:'reports',label:'Laporan',icon:BookOpenText,section:'LAPORAN'},{...nav.find(item=>item.key==='categories')!,section:'LAINNYA'},{...nav.find(item=>item.key==='settings')!},{...nav.find(item=>item.key==='help')!}];
/** 9.0 Pages about the person's own money only (Utang & Piutang, Split Bill, Insight): not offered while a space is open. */
const personalOnly=new Set(['advisor','owed','claims','receivables','debts','owedReport','owedArchive','splitbill']);
const sharedMenu=menu.filter(item=>!personalOnly.has(item.key));
/** Holds the open page. Its entrance animation is fixed when the page opens, so later updates never replay it. */
function ViewEnter({ from, children }: { from: string; children: ReactNode }) {
  const [className] = useState(() => `view-enter${from ? ` from-${from}` : ''}`);
  return <div className={className}>{children}</div>;
}
/** A Split Bill transaction: what part is the user's own spending, and where the bill is changed. */
/** A Split Bill share. Paid by someone else, it has no wallet: paying that person back from a wallet is the way to
 * "give it a wallet" (8.3.3). The payment is marked with the bill, so the share is still counted as spending only once. */
function SplitTxNotice({tx,debt,onOpen,onPay}:{tx:LedgerTx;debt?:Debt;onOpen:()=>void;onPay:(debt:Debt)=>void}){const own=tx.walletId?Math.max(0,Math.min(tx.amount,tx.ownShare||0)):tx.amount;const open=debt&&debt.outstandingAmount>0;return <div className="notice sb-tx-notice"><strong>{tx.walletId?'Bagian dari Split Bill.':debt?`Bagianmu di Split Bill, dibayar ${debt.name}.`:'Bagianmu di Split Bill yang dibayar orang lain.'}</strong><p>{tx.walletId?`Uang keluar ${rupiah(tx.amount)}, tetapi pengeluaranmu hanya ${rupiah(own)}. Sisanya ${rupiah(tx.amount-own)} ditalangi untuk orang lain dan tercatat sebagai piutang.`:open?`Pengeluaranmu ${rupiah(own)} sudah dihitung di tanggal ini. Sisa yang belum kamu bayar ke ${debt.name}: ${rupiah(debt.outstandingAmount)}. Kalau sudah kamu bayar, catat dari dompet: saldonya berkurang, tapi pengeluarannya tidak dihitung dua kali.`:debt?`Pengeluaranmu ${rupiah(own)} sudah dihitung di tanggal ini, dan bagianmu sudah lunas ke ${debt.name}.`:`Pengeluaranmu ${rupiah(own)} tanpa mengubah saldo dompet. Nominal dan pembayarannya diatur lewat Split Bill.`}</p><small className="muted">Untuk menghapusnya, buka Split Bill lalu pilih Batalkan: transaksi ini dan piutangnya ikut terhapus.</small><div className="sb-tx-actions">{!tx.walletId&&open&&<Button type="button" className="small" onClick={()=>onPay(debt)}><Wallet size={15}/> Bayar ke {debt.name} dari dompet</Button>}<Button type="button" variant={!tx.walletId&&open?'secondary':undefined} className="small" onClick={onOpen}><ReceiptText size={15}/> Buka Split Bill</Button></div></div>}
export default function Page(){return <NotificationProvider><UndoDeleteProvider><AppPage/></UndoDeleteProvider></NotificationProvider>}
function AppPage(){const {user,profile,data,dataReady,loading,error,ready,sync,access,accessRequests,space,spaces,account,personalProfile}=useApp();const {notify:setToast,track,push}=useNotify();const undo=useUndoDelete();const appLock=useAppLock();useMenuPlacement();const router=useRouter(),[view,setView]=useState('dashboard'),[txOpen,setTxOpen]=useState(false),[scan,setScan]=useState<null|'expense'|'income'>(null),[preset,setPreset]=useState<Partial<LedgerTx>|undefined>(),[editing,setEditing]=useState<LedgerTx|undefined>(),[focus,setFocus]=useState<string|undefined>(),[revision,setRevision]=useState(0),[online,setOnline]=useState(true),[settle,setSettle]=useState<SettleTarget|null>(null),[scanUsed,setScanUsed]=useState(false),[rekap,setRekap]=useState<string|null>(null),[payPersonal,setPayPersonal]=useState(false);
 const trail=useRef<string[]>([]),viewRef=useRef(view),lastTab=useRef<Record<string,string>>({});viewRef.current=view;
 // Back button: previous page first, then Beranda, then "press again to exit".
 useBackGuard(()=>{const previous=trail.current.pop();if(previous!==undefined){setFocus(undefined);setView(previous);return true}if(viewRef.current!=='dashboard'){setFocus(undefined);setView('dashboard');return true}return false},()=>push({title:'Tekan kembali sekali lagi untuk keluar',kind:'info',history:false}));
 // 9.0 A page that is not in a Ruang Bersama (e.g. Utang) goes back to Beranda when a space opens.
 useEffect(()=>{try{window.dispatchEvent(new CustomEvent('dompet-ajaib:view',{detail:view}))}catch{/* not in a browser */}},[view]);useEffect(()=>{if(space&&(personalOnly.has(view)||personalOnly.has(hubOf(view)?.key||'')))setView('dashboard');},[space?.id]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!loading&&!user&&ready)router.replace('/login/');},[loading,user,ready,router]);
 // 8.6 The other pages are warmed up after Beranda has shown, one download per idle moment (all at once used to compete
 // with Beranda for the phone's CPU while the app opened).
 // 9.9.1 The chat's code is the first thing made ready while the app is idle (it used to wait for the first touch on the
 // chat button), so the first open of the chat does not have to read and run it.
 useEffect(()=>{if(!user)return;let stop=false;const idle=(window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number}).requestIdleCallback;const queue=[loadChat,...preloads];const next=()=>{if(stop)return;const load=queue.shift();if(!load)return;void load().catch(()=>{}).finally(()=>{if(idle)idle(next,{timeout:3000});else window.setTimeout(next,200)})};const start=window.setTimeout(()=>{if(idle)idle(next,{timeout:3000});else next()},4000);return()=>{stop=true;window.clearTimeout(start)}},[user?.uid]);
 // 8.6 The transaction form is fetched while the app is idle, so the first tap on "+" opens it at once.
 useEffect(()=>{const idle=(globalThis as {requestIdleCallback?:(f:()=>void,o?:{timeout:number})=>number}).requestIdleCallback;const warm=()=>{void loadForm()};if(idle){const id=idle(warm,{timeout:5000});return()=>(globalThis as {cancelIdleCallback?:(id:number)=>void}).cancelIdleCallback?.(id)}const id=window.setTimeout(warm,2500);return()=>window.clearTimeout(id)},[]);
 // 8.6 The receipt scanner loads the first time it is opened, and stays (its closing animation keeps working).
 useEffect(()=>{if(scan!==null)setScanUsed(true)},[scan]);
 useEffect(()=>{if(!profile?.onboardingDone)return;const params=new URLSearchParams(window.location.search),action=params.get('action'),target=params.get('view');if(!action&&!target)return;if(target&&nav.some(item=>item.key===target))setView(target);if(action==='expense'||action==='income'||action==='transfer')openTx({type:action});window.history.replaceState(window.history.state,'',window.location.pathname)},[profile?.onboardingDone]);useEffect(()=>{setOnline(navigator.onLine);const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[]);useEffect(()=>{const close=(event:Event)=>{const target=event.target instanceof Element?event.target:null;document.querySelectorAll<HTMLDetailsElement>('details.more-actions[open]').forEach(menu=>{if(!target||!menu.contains(target)||target.closest('.more-menu button'))menu.open=false})};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')document.querySelectorAll<HTMLDetailsElement>('details.more-actions[open]').forEach(menu=>{menu.open=false})};document.addEventListener('click',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',escape)}},[]);
 function openTx(p?:Partial<LedgerTx>,e?:LedgerTx){setPreset(p);setEditing(e);setTxOpen(true)}
 /** Deletes with a few seconds to undo; opening records of debts/claims/receivables are changed through their record instead. */
 function removeTx(tx:LedgerTx){if(!user)return;if(['claim_advance','receivable_issue','borrowing'].includes(tx.type)||tx.splitBillId&&tx.type==='expense'){openTx(undefined,tx);return}const uid=user.uid;undo.remove(tx.id,'Transaksi',()=>{markDeletePending(tx.id);const offline=typeof navigator!=='undefined'&&!navigator.onLine;return (tx.interest?import('@/lib/interest-store').then(m=>m.deleteInterest(uid,tx.id)):space&&tx.memberFlow&&!tx.walletId?import('@/lib/space-money').then(m=>m.deletePaidPersonally(space,tx)):deleteTransaction(uid,tx.id)).then(()=>{setRevision(n=>n+1);if(offline)void whenSent().then(()=>push({title:'Transaksi terhapus dari cloud.',body:[tx.description||tx.merchant,rupiah(tx.amount)].filter(Boolean).join(' · '),kind:'success'}))}).finally(()=>clearDeletePending(tx.id))},[tx.description||tx.merchant,rupiah(tx.amount)].filter(Boolean).join(' · '))}
 /** Saves in the background: the form closes at once and a card shows the sync progress. */
 function saveInBackground(run:()=>Promise<unknown>,info:{message:string;detail?:string;retry:{preset?:Partial<LedgerTx>;editing?:LedgerTx}}){setTxOpen(false);track(run(),{pending:info.retry.editing?'Memperbarui transaksi…':'Menyimpan transaksi…',success:info.message,detail:info.detail,failure:'Transaksi belum tersimpan',open:()=>go('transactions'),link:{view:'transactions'},retry:{label:'Buka lagi',run:()=>openTx(info.retry.preset,info.retry.editing)},after:()=>setRevision(n=>n+1)})}const go=(requested:string,target?:string)=>{/* 8.6 "rekap:2026-10" (from the chat) opens the Rekap over the page. */if(requested.startsWith('rekap')){setRekap(requested.slice(6));return}/* 10.0 "Buka Scan struk" from the chat. */if(requested==='scan'){setScan('expense');return}const hub=hubByKey(requested),key=hub?(lastTab.current[hub.key]||hub.tabs[0][0]):requested;if(key==='dashboard')trail.current=[];else if(key!==view){trail.current.push(view);if(trail.current.length>30)trail.current.shift()}setFocus(target);setView(key);const inHub=hubOf(key);if(inHub)lastTab.current[inHub.key]=key;window.scrollTo({top:0,behavior:'smooth'})};const selectTab=(key:string)=>{const inHub=hubOf(key);if(inHub)lastTab.current[inHub.key]=key;setFocus(undefined);setView(key)};const props={notify:setToast,openTx,revision};
 // 9.9.1 The same functions on every render (each calls the latest one), so opening the form or a menu does not redraw
 // Beranda, its charts and its transaction rows.
 const latest=useRef({openTx,go,removeTx});latest.current={openTx,go,removeTx};
 const stable=useMemo(()=>({openTx:(p?:Partial<LedgerTx>,e?:LedgerTx)=>latest.current.openTx(p,e),go:(requested:string,target?:string)=>latest.current.go(requested,target),txActions:{remove:(tx:LedgerTx)=>latest.current.removeTx(tx),edit:(tx:LedgerTx)=>latest.current.openTx(undefined,tx)}}),[]);
 useReminderEngine(go,()=>openTx({type:'expense'}));
 // 9.9.2 The copy of Beranda shown the next time the app opens (components/home-shot.tsx). None while a PIN is on.
 useHomeShotKeeper({uid:account?.uid,active:view==='dashboard'&&dataReady&&!loading,pin:Boolean(personalProfile?.pinHash&&personalProfile?.pinSalt),mode:space?.id||''});
 // 8.10 Tips that start something kept on this page: the receipt scanner and Rekap.
 useTipTry({add_scan:()=>{setTxOpen(false);setScan('expense')},home_rekap:()=>setRekap('')});
 // 9.5 Rekap from anywhere (header, Beranda, Laporan, Insight).
 useEffect(()=>{const on=(e:Event)=>setRekap((e as CustomEvent<string>).detail||'');window.addEventListener(REKAP_EVENT,on);return()=>window.removeEventListener(REKAP_EVENT,on)},[]);
 useEffect(()=>{if(profile&&user)rememberGreetingName(profile.displayName||profile.username||'',user.uid);},[profile?.displayName,profile?.username,user?.uid]);
 useEffect(()=>{rememberSplashStyle(profile?.splashStyle);},[profile?.splashStyle]);
 const hubSwipe=useHubSwipe(view,selectTab);
 // 6.1 Kode akses: tell the owner when someone new is waiting for access.
 // 6.5: told only once the app is on screen, never over the loading screen.
 const seenRequests=useRef(0),appShown=!loading&&Boolean(user&&profile);useEffect(()=>{if(!appShown)return;if(accessRequests>seenRequests.current)push({id:'access-requests',title:`${accessRequests} orang minta akses`,body:'Ketuk untuk membuka Kode akses',kind:'info',open:()=>go('settings','access'),link:{view:'settings',focus:'access'}});seenRequests.current=accessRequests;},[accessRequests,appShown]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!ready)return <main className="loading-screen"><HomeShotOff/><div className="panel"><h2>Dompet Ajaib belum terhubung</h2><p className="muted" style={{marginTop:8}}>Isi konfigurasi cloud pada berkas .env.local sesuai panduan proyek, lalu jalankan ulang aplikasi.</p></div></main>;
 if(!loading&&user&&!profile&&error)return <main className="loading-screen"><HomeShotOff/><div className="panel"><h2>Catatan keuangan belum bisa dibuka</h2><p className="form-error" style={{marginTop:12}}>{error}</p><p className="muted" style={{marginTop:12}}>Jika baru membuat link percobaan, buka pengaturan cloud → aturan akses dan pastikan akunmu diberi akses ke datanya sendiri.</p><Button style={{marginTop:16}} onClick={()=>window.location.reload()}>Coba lagi</Button></div></main>;
 // 6.1 Kode akses: an account the owner has not let in yet types its code first (the rules hold its data back anyway).
 if(user&&(access==='needs-code'||access==='error'&&!profile))return <><HomeShotOff/><AccessGate/></>;
 if(loading||!user||!profile)return <>{!loading&&!user&&<HomeShotOff/>}<LoadingScreen stage={!user?0:!profile?1:2} error={error} name={profile?.displayName||profile?.username||''} style={profile?.splashStyle} uid={user?.uid}/></>;
 if(!profile.onboardingDone)return <><HomeShotOff/><Onboarding notify={setToast}/></>;
 if(appLock.locked)return <><HomeShotOff/><PinLockScreen onUnlock={appLock.unlock}/></>;
 const views:Record<string,React.ReactNode>={dashboard:<Dashboard openTx={stable.openTx} navigate={stable.go} notify={setToast}/>,transactions:<TransactionsView {...props} focus={focus} navigate={go}/>,inbox:<TransactionInbox openTx={openTx} notify={setToast}/>,budgets:<BudgetsView {...props} navigate={go} focus={focus}/>,wallets:<WalletsView {...props} focus={focus} navigate={go}/>,claims:<ClaimsView {...props}/>,receivables:<ReceivablesView {...props} navigate={go}/>,debts:<DebtsView {...props} navigate={go}/>,splitbill:<SplitBillView {...props} navigate={go} focus={focus}/>,owedArchive:<OwedArchive navigate={go} focus={focus}/>,owedReport:<OwedReport navigate={go}/>,funds:<FundsView {...props} focus={focus}/>,recurring:<RecurringControl notify={setToast} navigateInbox={()=>go('inbox')} focus={focus}/>,upcoming:<UpcomingView openTx={openTx} notify={setToast}/>,calendar:<FinancialCalendar notify={setToast}/>,categories:<CategoriesView {...props} focus={focus}/>,forecast:<ForecastView/>,analytics:<AnalyticsView navigate={go}/>,report:<ReportView navigate={go}/>,cycles:<CycleHistory notify={setToast}/>,health:<DataHealth notify={setToast} navigate={go}/>,advisor:<AdvisorView navigate={go}/>,wishlist:<WishlistView openTx={openTx}/>,settings:<SettingsView notify={setToast} navigate={go} focus={focus} onLockNow={appLock.enabled?appLock.lock:undefined}/>,help:<HelpView navigate={go} focus={focus}/>};
 return <><HomeShotSwap show={view==='dashboard'} ready={dataReady||Boolean(error)}/><div className="app-layout"><Sidebar items={space?sharedMenu:menu} view={view} onNavigate={go}/><div className="main-area"><header className={`topbar ${spaces.length?'has-spaces':''}`}><div className="topbar-title"><SpaceSwitch onManage={()=>go('settings','shared')}/><span className="topbar-title-text">{hubOf(view)?.label||nav.find(item=>item.key===view)?.label||'Dompet Ajaib'}</span></div><div className="topbar-actions"><button type="button" className="eye-button topbar-rekap" aria-label="Buka Rekap" title="Rekap" onClick={()=>setRekap('')}><Sparkles size={18}/></button><AmountToggle/><NotificationBell navigate={go}/><span className={`status-pill ${online&&sync!=='offline'&&sync!=='error'?'':'offline'}`}><i/>{online?(sync==='syncing'?'Menyinkron…':sync==='error'?'Gagal sinkron':sync==='offline'?'Data tersimpan lokal':'Tersinkron'):'Offline'}</span><Button className="small" aria-label="Catat transaksi" title="Catat transaksi" onClick={()=>openTx()}><Plus size={16}/><span className="btn-label">Catat transaksi</span></Button></div></header><TxActionsContext.Provider value={stable.txActions}><main className="content" data-view={view} {...hubSwipe.handlers}>{error&&<div className="notice error">Koneksi data bermasalah: {error}</div>}<HubTabs view={view} onSelect={selectTab}/><ViewEnter key={`${view}:${focus||''}`} from={hubSwipe.direction}>{views[view]}</ViewEnter></main></TxActionsContext.Provider></div><MobileNavigation view={view} items={space?sharedMenu:menu} onNavigate={go} openTx={openTx} onScan={()=>setScan('expense')}/><ChatEntry openTx={stable.openTx} navigate={stable.go}/>{spaces.length>0&&<SpaceWatch navigate={go}/>}{space&&<PayPersonallyDialog open={payPersonal} onOpenChange={setPayPersonal}/>}<FeatureTipsBridge/>{(scan!==null||scanUsed)&&<ReceiptScan open={scan!==null} onOpenChange={open=>{if(!open)setScan(null)}} startType={scan||'expense'} background={saveInBackground} openTx={openTx} navigate={go}/>}<Dialog open={txOpen} onOpenChange={setTxOpen}><DialogContent title={editing?(editing.interest?'Bunga saldo':editing.splitBillId&&!editing.walletId?'Bagianmu di Split Bill':'Ubah transaksi'):'Catat transaksi'}><RecordedTo tx={editing}/>{space&&editing?.memberFlow?<SpaceFlowNotice tx={editing} onDone={()=>setTxOpen(false)}/>:<>{space&&!editing&&<button type="button" className="sp-paid-entry" onClick={()=>{setTxOpen(false);setPayPersonal(true)}}>Dibayar pakai uang pribadimu? <b>Catat di sini</b></button>}{editing?.interest&&<InterestTxDetail tx={editing} notify={setToast} onDone={()=>setTxOpen(false)}/>}{editing&&editing.splitBillId&&editing.type==='expense'?<SplitTxNotice tx={editing} debt={data.debts.find(d=>d.splitBillId===editing.splitBillId&&d.sourceType==='split_bill')} onOpen={()=>{setTxOpen(false);go('splitbill',`bill:${editing.splitBillId}`)}} onPay={debt=>{setTxOpen(false);setSettle({kind:'debts',id:debt.id,name:debt.name,remaining:debt.outstandingAmount,split:true})}}/>:!space&&editing&&editing.type==='expense'&&editing.walletId&&<Button variant="secondary" className="full" style={{marginBottom:10}} onClick={()=>{setTxOpen(false);go('splitbill',`tx:${editing.id}`)}}><ReceiptText size={16}/> Split Bill: bagi tagihan ini</Button>}{space&&editing&&!editing.interest&&<ShareToGroup tx={editing} onDone={m=>{setTxOpen(false);setToast(m)}}/>}{editing&&!['claim_advance','receivable_issue','borrowing'].includes(editing.type)&&!(editing.splitBillId&&editing.type==='expense')&&<Button variant="danger" className="full" style={{marginBottom:editing.interest?6:15,marginTop:editing.interest?14:undefined}} onClick={()=>{setTxOpen(false);removeTx(editing)}}>{editing.interest?'Hapus bunga ini':'Hapus transaksi'}</Button>}{editing?.interest&&<p className="muted int-delete-note">Salah hitung? Hapus saja. Saldo dompet ikut turun dan bunga untuk tanggal ini tidak dibuat lagi.</p>}{editing&&isCycleClosed(editing.date,data.cycleSnapshots||[])&&<div className="notice">Transaksi ini berada dalam siklus yang sudah ditutup. Penghapusan akan menghitung ulang laporan siklus.</div>}{editing&&['claim_advance','receivable_issue','borrowing','claim_writeoff'].includes(editing.type)&&<div className="notice">Transaksi ini dibuat otomatis dari catatan utang, klaim, atau piutang, jadi ubah lewat catatan tersebut. Untuk klaim yang ditolak, hapus transaksi penolakannya lalu catat ulang.</div>}{!editing&&<FeatureTips menu="add" navigate={(key,target)=>{setTxOpen(false);go(key,target)}} className="ft-in-form"/>}{!editing&&<button type="button" className="rs-entry" onClick={()=>{setTxOpen(false);setScan(preset?.type==='income'?'income':'expense')}}><ScanText size={18}/><span><strong>Scan struk</strong><small>Foto struk atau nota, isinya dibaca otomatis</small></span></button>}{!editing?.interest&&!(editing?.splitBillId&&editing.type==='expense'&&!editing.walletId)&&<TransactionForm key={editing?.id||JSON.stringify(preset)||'new'} preset={preset} editing={editing} background={saveInBackground} onQuick={next=>openTx(next)} onNavigate={(key,target)=>{setTxOpen(false);go(key,target)}} onDone={m=>{setTxOpen(false);setRevision(n=>n+1);setToast(m)}} onCancel={()=>setTxOpen(false)}/>}</>}</DialogContent></Dialog></div>{rekap!==null&&<WrappedView initial={rekap||undefined} onClose={()=>setRekap(null)}/>}{settle&&<SettleDialog target={settle} onClose={()=>setSettle(null)}/>}<AfterFirstPaint wait={2500}><WhatsNew ready={Boolean(profile?.onboardingDone)&&!appLock.locked} navigate={go}/></AfterFirstPaint><AfterFirstPaint wait={3000}><GooglePasswordPrompt notify={setToast}/></AfterFirstPaint><AfterFirstPaint wait={1500}><GameKeeper navigate={go}/><Celebrations/><MiniGames/></AfterFirstPaint><AfterFirstPaint wait={2500}><PetDock/></AfterFirstPaint></>;
}
