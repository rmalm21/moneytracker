'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useUsage, type OpenFeature } from './usage-hooks';
import { ArrowRight, Clock3, Compass, CornerDownLeft, Search, Star } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { FeatureIcon } from './feature-icons';
import { useApp } from './app-provider';
import { features, featureById, intentGroups, searchFeatures, searchRows, type FeatureAction, type FeatureDef } from '@/lib/features';
import { helpGroups, type HelpItem } from '@/lib/help-content';
import { toggleFavorite, touchRecent, writeUsage } from '@/lib/usage';
import type { Data } from '@/lib/types';

export type { OpenFeature };
type Row = { key: string; kind: 'feature' | 'data' | 'help' | 'tx'; title: string; detail: string; icon: string; action: FeatureAction; featureId?: string };
const strip = (s: string) => s.replace(/\*\*/g, '');
function helpRows(): { item: HelpItem; group: string }[] {
  const out: { item: HelpItem; group: string }[] = [];
  const walk = (items: HelpItem[], group: string) => items.forEach(item => { out.push({ item, group }); if (item.children) walk(item.children, group); });
  helpGroups.forEach(g => walk(g.items, g.title));
  return out;
}
/** The user's own records as search rows: names only (amounts stay on their pages). */
function dataRows(data: Data) {
  const rows: { name: string; keywords: string[]; row: Row }[] = [];
  const add = (key: string, name: string, keywords: string[], detail: string, icon: string, action: FeatureAction) => { if (name?.trim()) rows.push({ name, keywords, row: { key, kind: 'data', title: name, detail, icon, action } }); };
  for (const w of data.wallets.filter(x => !x.isArchived)) {
    const savings = w.type === 'savings' || w.group === 'savings' || Boolean(w.interest);
    add(`w:${w.id}`, w.name, ['dompet', 'saldo', w.type, w.purpose || '', ...(savings ? ['bunga', 'tabungan'] : [])], `Dompet${w.purpose ? ` · ${w.purpose}` : ''}`, 'wallet', { kind: 'view', view: 'wallets', focus: w.id });
    if (savings) add(`wi:${w.id}`, `Bunga ${w.name}`, ['bunga', 'interest', 'bunga otomatis'], w.interest ? 'Bunga otomatis aktif' : 'Atur bunga otomatis', 'percent', { kind: 'view', view: 'wallets', focus: `interest:${w.id}` });
  }
  for (const c of data.claims.filter(x => x.status !== 'paid' && x.status !== 'rejected')) add(`c:${c.id}`, c.name, ['klaim', 'claim', 'reimburse'], 'Klaim kantor', 'shield', { kind: 'view', view: 'claims' });
  for (const d of data.debts.filter(x => x.status !== 'paid')) add(`d:${d.id}`, d.name, ['utang', 'cicilan', d.provider || ''], `Utang${d.provider ? ` · ${d.provider}` : ''}`, 'card', { kind: 'view', view: 'debts' });
  for (const r of data.receivables.filter(x => x.remainingAmount > 0)) add(`r:${r.id}`, r.person, ['piutang', r.description || ''], `Piutang${r.description ? ` · ${r.description}` : ''}`, 'handcoins', { kind: 'view', view: 'receivables' });
  for (const f of data.funds.filter(x => !x.isArchived)) add(`f:${f.id}`, f.name, ['tujuan dana', 'target', 'kantong'], 'Tujuan dana', 'target', { kind: 'view', view: 'funds' });
  for (const b of data.budgets.filter(x => x.active)) add(`b:${b.id}`, b.name, ['anggaran', 'budget'], 'Anggaran', 'grid', { kind: 'view', view: 'budgets' });
  for (const r of data.recurring.filter(x => x.active)) add(`rc:${r.id}`, r.name, ['rutin', 'langganan', 'tagihan'], 'Rutin', 'repeat', { kind: 'view', view: 'recurring' });
  for (const c of data.categories.filter(x => !x.isArchived)) add(`k:${c.id}`, c.name, ['kategori'], 'Kategori · lihat transaksinya', 'layers', { kind: 'view', view: 'transactions', focus: `search:${c.name}` });
  return rows;
}
const featureRow = (f: FeatureDef): Row => ({ key: `f:${f.id}`, kind: 'feature', title: f.name, detail: f.description, icon: f.icon, action: f.action, featureId: f.id });
const SUGGESTIONS = ['uang aman', 'tagihan bulanan', 'uang balik', 'bunga', 'split bill', 'periksa data'];

export function FeatureSearch({ open, onOpenChange, onOpen, initialQuery = '' }: { open: boolean; onOpenChange: (open: boolean) => void; onOpen: OpenFeature; initialQuery?: string }) {
  const { data, user } = useApp();
  const usage = useUsage();
  const [query, setQuery] = useState(initialQuery), [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(initialQuery); setActive(0); } }, [open, initialQuery]);
  const help = useMemo(helpRows, []);
  const records = useMemo(() => dataRows(data), [data]);
  const groups = useMemo(() => {
    const q = deferred.trim();
    if (!q) return [];
    const found = searchFeatures(q).slice(0, 7).map(h => featureRow(h.item));
    const mine = searchRows(records, q, r => r).filter(h => h.score >= 2).slice(0, 5).map(h => h.item.row);
    const answers = searchRows(help, q, h => ({ name: strip(h.item.q), keywords: (h.item.keywords || '').split(/\s+/), description: strip(h.item.a) })).slice(0, 4)
      .map(h => ({ key: `h:${h.item.item.id}`, kind: 'help' as const, title: strip(h.item.item.q), detail: h.item.group, icon: 'help', action: { kind: 'view', view: 'help', focus: h.item.item.id } as FeatureAction }));
    const out: { title: string; rows: Row[] }[] = [];
    if (found.length) out.push({ title: 'Fitur', rows: found });
    if (mine.length) out.push({ title: 'Datamu', rows: mine });
    if (answers.length) out.push({ title: 'Bantuan', rows: answers });
    if (q.length >= 2) out.push({ title: '', rows: [{ key: 'tx', kind: 'tx', title: `Cari “${q}” di transaksi`, detail: 'Nama, kategori, dompet, atau catatan', icon: 'list', action: { kind: 'view', view: 'transactions', focus: `search:${q}` } }] });
    return out;
  }, [deferred, records, help]);
  const flat = groups.flatMap(g => g.rows);
  const pinned = usage.favorites.map(featureById).filter((f): f is FeatureDef => Boolean(f));
  const recent = usage.recent.map(featureById).filter((f): f is FeatureDef => Boolean(f) && !usage.favorites.includes(f!.id)).slice(0, 5);
  function go(row: Row) {
    if (row.featureId) writeUsage(user?.uid, u => touchRecent(u, row.featureId!));
    onOpenChange(false);
    onOpen(row.action, row.featureId);
  }
  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(flat.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (event.key === 'Enter' && flat[active]) { event.preventDefault(); go(flat[active]); }
  }
  useEffect(() => { setActive(0); }, [deferred]);
  useEffect(() => { document.getElementById(`fs-row-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const star = (id: string) => <button type="button" className={`fs-star ${usage.favorites.includes(id) ? 'is-on' : ''}`} aria-pressed={usage.favorites.includes(id)} aria-label={usage.favorites.includes(id) ? 'Lepas dari Disematkan' : 'Sematkan'} title={usage.favorites.includes(id) ? 'Lepas sematan' : 'Sematkan'} onClick={e => { e.stopPropagation(); writeUsage(user?.uid, u => toggleFavorite(u, id)); }}><Star size={15}/></button>;
  let index = -1;
  const row = (r: Row) => { index += 1; const i = index; const groupName = r.featureId ? intentGroups.find(g => g.id === featureById(r.featureId!)?.group)?.title : ''; return <div key={r.key} id={`fs-row-${i}`} role="option" aria-selected={i === active} className={`fs-row ${i === active ? 'is-active' : ''} is-${r.kind}`} onMouseEnter={() => setActive(i)} onClick={() => go(r)}><span className="fs-icon"><FeatureIcon name={r.icon}/></span><span className="fs-text"><strong>{r.title}</strong><small>{r.detail}{groupName ? <em> · {groupName}</em> : null}</small></span>{r.featureId ? star(r.featureId) : <ArrowRight size={15} className="fs-go" aria-hidden="true"/>}</div>; };
  const chip = (f: FeatureDef) => <button type="button" key={f.id} className="fs-chip" onClick={() => go(featureRow(f))}><FeatureIcon name={f.icon} size={15}/>{f.name}</button>;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Cari" className="feature-search-dialog">
    <label className="fs-input"><Search size={18} aria-hidden="true"/><input ref={input} autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={keys} placeholder="Cari fitur, menu, atau datamu…" aria-label="Cari fitur, menu, atau data" enterKeyHint="search" role="combobox" aria-expanded={flat.length > 0} aria-controls="fs-results" aria-activedescendant={flat.length ? `fs-row-${active}` : undefined} autoComplete="off"/><kbd className="fs-kbd" aria-hidden="true">Esc</kbd></label>
    {query.trim() ? <div id="fs-results" role="listbox" aria-label="Hasil pencarian" className="fs-results">
      {groups.map(g => <section key={g.title || 'more'} className="fs-group">{g.title && <h3>{g.title}</h3>}{g.rows.map(row)}</section>)}
      {!groups.some(g => g.title) && <p className="fs-empty">Belum ada fitur yang cocok dengan “{query.trim()}”. Coba kata lain, misalnya “tagihan” atau “saldo”.</p>}
    </div> : <div className="fs-home">
      {pinned.length > 0 && <section className="fs-group"><h3><Star size={13}/> Disematkan</h3><div className="fs-chips">{pinned.map(chip)}</div></section>}
      {recent.length > 0 && <section className="fs-group"><h3><Clock3 size={13}/> Terakhir dibuka</h3><div className="fs-chips">{recent.map(chip)}</div></section>}
      <section className="fs-group"><h3>Coba cari</h3><div className="fs-chips">{SUGGESTIONS.map(s => <button type="button" key={s} className="fs-chip is-suggest" onClick={() => { setQuery(s); input.current?.focus(); }}>{s}</button>)}</div></section>
      <button type="button" className="fs-explore" onClick={() => go(featureRow(featureById('explore')!))}><Compass size={18}/><span><strong>Jelajahi semua fitur</strong><small>{features.length} kemampuan, dikelompokkan menurut kebutuhan</small></span><ArrowRight size={16}/></button>
    </div>}
    <p className="fs-hint" aria-hidden="true"><CornerDownLeft size={12}/> buka · ↑↓ pilih · <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> dari mana saja</p>
  </DialogContent></Dialog>;
}
