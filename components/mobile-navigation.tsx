'use client';
import { useRef, useState } from 'react';
import { menuKeyOf } from './hubs';
import { ArrowLeftRight, ChevronLeft, ChevronRight, CreditCard, HandCoins, Home, ListFilter, Menu, Plus, Receipt, Sparkles, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { QuickEntryBox } from './quick-entry';
import { Dialog, DialogContent } from './ui/dialog';
import type { LedgerTx } from '@/lib/types';

const tabs: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Beranda', icon: Home },
  { key: 'transactions', label: 'Transaksi', icon: ListFilter },
  { key: 'add', label: 'Tambah', icon: Plus },
  { key: 'wallets', label: 'Dompet', icon: Wallet },
  { key: 'more', label: 'Lainnya', icon: Menu },
];
const groups = [
  { label: 'Keuangan', items: ['advisor', 'budgets', 'funds', 'wishlist', 'owed', 'schedule'] },
  { label: 'Laporan & lainnya', items: ['reports', 'categories', 'settings', 'help'] },
];

export function MobileNavigation({ view, items, onNavigate, openTx }: { view: string; items: { key: string; label: string; icon: LucideIcon }[]; onNavigate: (key: string) => void; openTx: (preset?: Partial<LedgerTx>) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false), [auto, setAuto] = useState(false);
  const showAdd = (open: boolean) => { setAddOpen(open); if (!open) setAuto(false); };
  const secondary = !['dashboard', 'transactions', 'wallets'].includes(view);
  function navigate(key: string) { setMoreOpen(false); setAddOpen(false); onNavigate(key); }
  const handingOff = useRef(false);
  /**
   * From "Catat cepat" to the form without a gap: the form opens on top first (stacked dialogs show only the top one),
   * then this sheet closes on the next frame. The form's backdrop takes over an already dimmed screen, so its fade-in is
   * switched off on that element (a class that is later removed would restart the fade).
   */
  function add(preset?: Partial<LedgerTx>) {
    handingOff.current = true;
    openTx(preset);
    requestAnimationFrame(() => {
      const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay'), top = overlays[overlays.length - 1];
      if (top) top.style.animation = 'none';
      showAdd(false);
      window.setTimeout(() => { handingOff.current = false; }, 400);
    });
  }
  return <>
    <nav className="bottom-nav" aria-label="Navigasi seluler">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-label={label} aria-current={(key === 'more' && secondary || key === view) ? 'page' : undefined} className={`${(key === 'more' ? secondary : view === key) ? 'active' : ''} ${key === 'add' ? 'add' : ''}`} onClick={() => key === 'more' ? setMoreOpen(true) : key === 'add' ? showAdd(true) : navigate(key)}>{key === 'add' ? <span className="nav-add-icon" aria-hidden="true"><Icon size={22}/></span> : <Icon size={21} aria-hidden="true"/>}<span>{label}</span></button>)}</nav>
    <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent title="Semua menu" className="mobile-sheet"><div className="mobile-menu-groups">{groups.map(group => <section key={group.label}><h3>{group.label}</h3><div className="mobile-menu-grid">{group.items.map(key => { const item = items.find(entry => entry.key === key); if (!item) return null; return <button type="button" key={key} className={`${menuKeyOf(view) === key ? 'active' : ''} ${key === 'advisor' ? 'menu-special' : ''}`} onClick={() => navigate(key)}><item.icon size={19}/><span>{item.label}</span>{key === 'advisor' && <Sparkles size={14} className="nav-spark" aria-hidden="true"/>}</button>; })}</div></section>)}</div></DialogContent></Dialog>
    <Dialog open={addOpen} onOpenChange={showAdd}><DialogContent title={auto ? 'Catat otomatis' : 'Catat cepat'} className="mobile-sheet" onCloseAutoFocus={event => { if (handingOff.current) event.preventDefault(); }}>{auto ? <div className="auto-entry"><button type="button" className="link-button auto-back" onClick={() => setAuto(false)}><ChevronLeft size={16}/> Kembali ke menu</button><QuickEntryBox autoFocus onOpenForm={add} onDone={() => showAdd(false)}/></div> : <div className="mobile-menu-grid add-menu"><button type="button" className="menu-special auto-entry-button" onClick={() => setAuto(true)}><Sparkles size={20}/><span className="aeb-text"><strong>Catat otomatis</strong><small>Tulis sekali, langsung tercatat</small></span><ChevronRight size={18}/></button><button type="button" onClick={() => add({ type: 'expense' })}><TrendingDown size={20}/> Pengeluaran</button><button type="button" onClick={() => add({ type: 'income' })}><TrendingUp size={20}/> Pemasukan</button><button type="button" onClick={() => add({ type: 'transfer' })}><ArrowLeftRight size={20}/> Transfer</button><button type="button" onClick={() => navigate('claims')}><Receipt size={20}/> Klaim kantor</button><button type="button" onClick={() => navigate('receivables')}><HandCoins size={20}/> Piutang</button><button type="button" onClick={() => add({ type: 'debt_payment' })}><CreditCard size={20}/> Bayar utang</button><button type="button" className="all-transactions" onClick={() => add()}>Pilih jenis transaksi lain →</button></div>}</DialogContent></Dialog>
  </>;
}
