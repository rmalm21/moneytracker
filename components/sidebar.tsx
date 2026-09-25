'use client';
import { useEffect, useState } from 'react';
import { menuKeyOf } from './hubs';
import { LogOut, PanelLeftClose, PanelLeftOpen, Sparkles, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { logout } from '@/lib/auth';
import { APP_VERSION } from '@/lib/version';
import { Confirm } from './ui/alert-dialog';

export function Sidebar({ items, view, onNavigate }: { items: { key: string; label: string; icon: LucideIcon; section?: string }[]; view: string; onNavigate: (key: string) => void }) {
  const { user, profile } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('dompet-ajaib-sidebar-collapsed') === 'true'); } catch { /* Browser storage may be blocked. */ } }, []);
  function toggle() {
    setCollapsed(previous => { const next = !previous; try { localStorage.setItem('dompet-ajaib-sidebar-collapsed', String(next)); } catch { /* Keep the preference for this tab. */ } return next; });
  }
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Menu utama">
    <div className="sidebar-header"><div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div><button type="button" className="sidebar-toggle" onClick={toggle} aria-label={collapsed ? 'Perluas sidebar' : 'Ringkas sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Perluas sidebar' : 'Ringkas sidebar'}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div>
    <div className="sidebar-scroll"><p className="nav-label">MENU UTAMA</p>{items.map((item) => { const active = menuKeyOf(view) === item.key; return <div key={item.key}>{item.section&&<p className="nav-label nav-divider">{item.section}</p>}<button type="button" className={`nav-item ${active ? 'active' : ''} ${item.key === 'advisor' ? 'nav-special' : ''}`} aria-label={item.label} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} onClick={() => onNavigate(item.key)}><item.icon size={18}/><span className="nav-text">{item.label}</span>{item.key === 'advisor' && <Sparkles size={14} className="nav-spark" aria-hidden="true"/>}</button></div>; })}</div>
    <div className="sidebar-bottom"><button type="button" className="account-chip" aria-label="Buka pengaturan akun" title={collapsed ? 'Pengaturan akun' : undefined} onClick={() => onNavigate('settings')}><span className="avatar">{(profile?.displayName || profile?.username || 'A')[0]}</span><span className="account-text"><strong>{profile?.displayName || profile?.username}</strong><small>{user?.email}</small></span></button><Confirm title="Keluar dari akun?" description="Kamu perlu masuk lagi dengan username dan password untuk membuka catatan keuangan ini." confirmLabel="Ya, keluar" onConfirm={() => logout()}><button type="button" className="nav-item" aria-label="Keluar" title={collapsed ? 'Keluar' : undefined}><LogOut size={17}/><span className="nav-text">Keluar</span></button></Confirm><small className="app-version nav-text">Versi {APP_VERSION}</small></div>
  </aside>;
}
