'use client';
import { useRef, useState } from 'react';
import { menuKeyOf } from './hubs';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Compass, Search, Star, CreditCard, HandCoins, Home, ListFilter, Menu, Plus, Receipt, ReceiptText, ScanText, Sparkles, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { QuickEntryBox } from './quick-entry';
import { Dialog, DialogContent } from './ui/dialog';
import type { LedgerTx } from '@/lib/types';
import { useUsage } from './usage-hooks';
import { featureById, features } from '@/lib/features';

const tabs: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Beranda', icon: Home },
  { key: 'transactions', label: 'Transaksi', icon: ListFilter },
  { key: 'add', label: 'Tambah', icon: Plus },
  { key: 'wallets', label: 'Dompet', icon: Wallet },
  { key: 'more', label: 'Lainnya', icon: Menu },
];
/** "Lainnya" (5.0): grouped by what people want to do, each entry with one line about what it is for. */
const groups = [
  { label: 'Rencanakan', items: ['budgets', 'funds', 'wishlist', 'schedule'] },
  { label: 'Utang, piutang & klaim', items: ['owed', 'splitbill'] },
  { label: 'Pahami', items: ['advisor', 'reports'] },
  { label: 'Data & pengaturan', items: ['categories', 'settings', 'help'] },
];
const hubLines: Record<string, string> = { owed: 'Utang, piutang, klaim kantor, laporan, arsip', schedule: 'Arus kas, kalender, rutin, konfirmasi', reports: 'Laporan, analisis, proyeksi, riwayat siklus' };
const featureOf: Record<string, string> = { advisor: 'insight' };
const lineOf = (key: string) => hubLines[key] || featureById(featureOf[key] || key)?.description || '';
/** Bottom-bar pages are always one tap away; "Sering dibuka" suggests the others. */
const ALWAYS = new Set(['dashboard', 'transactions', 'wallets', 'more', 'add']);

export function MobileNavigation({ view, items, onNavigate, openTx, onScan, onSearch }: { view: string; items: { key: string; label: string; icon: LucideIcon }[]; onNavigate: (key: string, target?: string) => void; openTx: (preset?: Partial<LedgerTx>) => void; onScan: () => void; onSearch?: () => void }) {
  const usage = useUsage();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false), [auto, setAuto] = useState(false);
  const showAdd = (open: boolean) => { setAddOpen(open); if (!open) setAuto(false); };
  const secondary = !['dashboard', 'transactions', 'wallets'].includes(view);
  function navigate(key: string, target?: string) { setMoreOpen(false); setAddOpen(false); onNavigate(key, target); }
  const handingOff = useRef(false);
  /**
   * From "Catat cepat" to the form without a gap: the form opens on top first (stacked dialogs show only the top one),
   * then this sheet closes on the next frame. The form's backdrop takes over an already dimmed screen, so its fade-in is
   * switched off on that element (a class that is later removed would restart the fade).
   */
  function add(preset?: Partial<LedgerTx>) { handOff(() => openTx(preset)); }
  function handOff(open: () => void) {
    handingOff.current = true;
    open();
    requestAnimationFrame(() => {
      const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay'), top = overlays[overlays.length - 1];
      if (top) top.style.animation = 'none';
      showAdd(false);
      window.setTimeout(() => { handingOff.current = false; }, 400);
    });
  }
  return <>
    <nav className="bottom-nav" aria-label="Navigasi seluler">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-label={label} aria-current={(key === 'more' && secondary || key === view) ? 'page' : undefined} className={`${(key === 'more' ? secondary : view === key) ? 'active' : ''} ${key === 'add' ? 'add' : ''}`} onClick={() => key === 'more' ? setMoreOpen(true) : key === 'add' ? showAdd(true) : navigate(key)}>{key === 'add' ? <span className="nav-add-icon" aria-hidden="true"><Icon size={22}/></span> : <Icon size={21} aria-hidden="true"/>}<span>{label}</span></button>)}</nav>
    <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent title="Lainnya" className="mobile-sheet more-sheet"><div className="mobile-menu-groups">
      {onSearch && <button type="button" className="more-search" onClick={() => { setMoreOpen(false); onSearch(); }}><Search size={18} aria-hidden="true"/><span>Cari fitur, menu, atau datamu…</span></button>}
      {(() => {
        const pinned = usage.favorites.map(featureById).filter(Boolean).slice(0, 6);
        const visited = Object.entries(usage.visited).filter(([key, n]) => n >= 2 && !ALWAYS.has(key) && features.some(f => f.page && f.action.kind === 'view' && f.action.view === key)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key]) => features.find(f => f.page && f.action.kind === 'view' && f.action.view === key)!);
        const row = pinned.length ? pinned : visited;
        if (!row.length) return null;
        return <section><h3>{pinned.length ? <><Star size={12}/> Disematkan</> : 'Sering dibuka'}</h3><div className="more-chips">{row.map(f => f && <button type="button" key={f.id} className="fs-chip" onClick={() => { setMoreOpen(false); if (f.action.kind === 'view') onNavigate(f.action.view, f.action.focus); else if (f.action.kind === 'tx') openTx(f.action.type ? { type: f.action.type } : undefined); else if (f.action.kind === 'scan') onScan(); else { setMoreOpen(false); setAddOpen(true); setAuto(true); } }}>{f.name}</button>)}</div></section>;
      })()}
      {groups.map(group => <section key={group.label}><h3>{group.label}</h3><div className="mobile-menu-grid more-grid">{group.items.map(key => { const item = items.find(entry => entry.key === key); if (!item) return null; return <button type="button" key={key} className={`${menuKeyOf(view) === key ? 'active' : ''} ${key === 'advisor' ? 'menu-special' : ''}`} onClick={() => navigate(key)}><item.icon size={19}/><span className="more-text"><strong>{item.label}</strong><small>{lineOf(key)}</small></span>{key === 'advisor' && <Sparkles size={14} className="nav-spark" aria-hidden="true"/>}</button>; })}</div></section>)}
      <button type="button" className="fs-explore" onClick={() => navigate('explore')}><Compass size={18}/><span><strong>Jelajahi semua fitur</strong><small>Bunga otomatis, cocokkan saldo, skenario, periksa data, dan lainnya</small></span><ChevronRight size={16}/></button>
    </div></DialogContent></Dialog>
    <Dialog open={addOpen} onOpenChange={showAdd}><DialogContent title={auto ? 'Catat otomatis' : 'Catat cepat'} className="mobile-sheet" onCloseAutoFocus={event => { if (handingOff.current) event.preventDefault(); }}>{auto ? <div className="auto-entry"><button type="button" className="link-button auto-back" onClick={() => setAuto(false)}><ChevronLeft size={16}/> Kembali ke menu</button><QuickEntryBox autoFocus onOpenForm={add} onNavigate={navigate} onDone={() => showAdd(false)}/></div> : <div className="mobile-menu-grid add-menu"><button type="button" className="menu-special auto-entry-button" onClick={() => setAuto(true)}><Sparkles size={20}/><span className="aeb-text"><strong>Catat otomatis</strong><small>Tulis sekali, untuk semua menu</small></span><ChevronRight size={18}/></button><button type="button" className="add-scan" onClick={() => handOff(onScan)}><ScanText size={20}/><span className="aeb-text"><strong>Scan struk</strong><small>Foto struk, dibaca otomatis</small></span></button><button type="button" onClick={() => add({ type: 'expense' })}><TrendingDown size={20}/> Pengeluaran</button><button type="button" onClick={() => add({ type: 'income' })}><TrendingUp size={20}/> Pemasukan</button><button type="button" onClick={() => add({ type: 'transfer' })}><ArrowLeftRight size={20}/> Transfer</button><button type="button" onClick={() => navigate('claims')}><Receipt size={20}/> Klaim kantor</button><button type="button" onClick={() => navigate('receivables')}><HandCoins size={20}/> Piutang</button><button type="button" onClick={() => add({ type: 'debt_payment' })}><CreditCard size={20}/> Bayar utang</button><button type="button" className="add-split" onClick={() => navigate('splitbill', 'new')}><ReceiptText size={20}/><span className="aeb-text"><strong>Split Bill</strong><small>Bagi tagihan bareng teman</small></span></button><button type="button" className="all-transactions" onClick={() => add()}>Pilih jenis transaksi lain →</button></div>}</DialogContent></Dialog>
  </>;
}
