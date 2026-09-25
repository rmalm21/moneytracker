'use client';
import { useState } from 'react';
import { menuKeyOf } from './hubs';
import { ArrowLeftRight, CreditCard, HandCoins, Home, ListFilter, Menu, Plus, Receipt, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
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
  { label: 'Keuangan', items: ['advisor', 'budgets', 'funds', 'owed', 'schedule'] },
  { label: 'Laporan & lainnya', items: ['reports', 'categories', 'settings'] },
];

export function MobileNavigation({ view, items, onNavigate, openTx }: { view: string; items: { key: string; label: string; icon: LucideIcon }[]; onNavigate: (key: string) => void; openTx: (preset?: Partial<LedgerTx>) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const secondary = !['dashboard', 'transactions', 'wallets'].includes(view);
  function navigate(key: string) { setMoreOpen(false); setAddOpen(false); onNavigate(key); }
  function add(preset?: Partial<LedgerTx>) { setAddOpen(false); openTx(preset); }
  return <>
    <nav className="bottom-nav" aria-label="Navigasi seluler">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-label={label} aria-current={(key === 'more' && secondary || key === view) ? 'page' : undefined} className={`${(key === 'more' ? secondary : view === key) ? 'active' : ''} ${key === 'add' ? 'add' : ''}`} onClick={() => key === 'more' ? setMoreOpen(true) : key === 'add' ? setAddOpen(true) : navigate(key)}>{key === 'add' ? <span className="nav-add-icon" aria-hidden="true"><Icon size={22}/></span> : <Icon size={21} aria-hidden="true"/>}<span>{label}</span></button>)}</nav>
    <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent title="Semua menu" className="mobile-sheet"><div className="mobile-menu-groups">{groups.map(group => <section key={group.label}><h3>{group.label}</h3><div className="mobile-menu-grid">{group.items.map(key => { const item = items.find(entry => entry.key === key); if (!item) return null; return <button type="button" key={key} className={menuKeyOf(view) === key ? 'active' : ''} onClick={() => navigate(key)}><item.icon size={19}/><span>{item.label}</span></button>; })}</div></section>)}</div></DialogContent></Dialog>
    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent title="Catat cepat" className="mobile-sheet"><div className="mobile-menu-grid add-menu"><button type="button" onClick={() => add({ type: 'expense' })}><TrendingDown size={20}/> Pengeluaran</button><button type="button" onClick={() => add({ type: 'income' })}><TrendingUp size={20}/> Pemasukan</button><button type="button" onClick={() => add({ type: 'transfer' })}><ArrowLeftRight size={20}/> Transfer</button><button type="button" onClick={() => navigate('claims')}><Receipt size={20}/> Klaim kantor</button><button type="button" onClick={() => navigate('receivables')}><HandCoins size={20}/> Piutang</button><button type="button" onClick={() => add({ type: 'debt_payment' })}><CreditCard size={20}/> Bayar utang</button><button type="button" className="all-transactions" onClick={() => add()}>Pilih jenis transaksi lain →</button></div></DialogContent></Dialog>
  </>;
}
