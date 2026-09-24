'use client';
import { useEffect, useState } from 'react';
import { LogOut, PanelLeftClose, PanelLeftOpen, Sparkles, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { logout } from '@/lib/auth';

export function Sidebar({ items, view, onNavigate }: { items: { key: string; label: string; icon: LucideIcon }[]; view: string; onNavigate: (key: string) => void }) {
  const { user, profile } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('dompet-ajaib-sidebar-collapsed') === 'true'); } catch { /* Browser storage may be blocked. */ } }, []);
  function toggle() {
    setCollapsed(previous => { const next = !previous; try { localStorage.setItem('dompet-ajaib-sidebar-collapsed', String(next)); } catch { /* Keep the preference for this tab. */ } return next; });
  }
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Menu utama">
    <div className="sidebar-header"><div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div><button type="button" className="sidebar-toggle" onClick={toggle} aria-label={collapsed ? 'Perluas sidebar' : 'Ringkas sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Perluas sidebar' : 'Ringkas sidebar'}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div>
    <div className="sidebar-scroll"><p className="nav-label">MENU UTAMA</p>{items.map((item) => <div key={item.key}>{item.key==='wallets'&&<p className="nav-label nav-divider">DOMPET & ANGGARAN</p>}{item.key==='upcoming'&&<p className="nav-label nav-divider">PERENCANAAN</p>}{item.key==='forecast'&&<p className="nav-label nav-divider">LAPORAN</p>}{item.key==='health'&&<p className="nav-label nav-divider">DATA</p>}<button type="button" className={`nav-item ${view === item.key ? 'active' : ''}`} aria-label={item.label} aria-current={view === item.key ? 'page' : undefined} title={collapsed ? item.label : undefined} onClick={() => onNavigate(item.key)}><item.icon size={18}/><span className="nav-text">{item.label}</span></button></div>)}</div>
    <div className="sidebar-bottom"><button type="button" className="account-chip" aria-label="Buka pengaturan akun" title={collapsed ? 'Pengaturan akun' : undefined} onClick={() => onNavigate('settings')}><span className="avatar">{(profile?.displayName || profile?.username || 'A')[0]}</span><span className="account-text"><strong>{profile?.displayName || profile?.username}</strong><small>{user?.email}</small></span></button><button type="button" className="nav-item" aria-label="Keluar" title={collapsed ? 'Keluar' : undefined} onClick={() => void logout()}><LogOut size={17}/><span className="nav-text">Keluar</span></button></div>
  </aside>;
}
