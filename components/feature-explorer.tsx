'use client';
import { useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { useApp } from './app-provider';
import { FeatureIcon } from './feature-icons';
import { useUsage, type OpenFeature } from './usage-hooks';
import { features, intentGroups, searchFeatures, type FeatureDef } from '@/lib/features';
import { lifecycle, readSignals } from '@/lib/discovery';
import { toggleFavorite, touchRecent, writeUsage } from '@/lib/usage';
import { todayInTimeZone } from '@/lib/period';

const LEVEL: Record<FeatureDef['complexity'], string> = { core: 'Dasar', common: 'Umum', advanced: 'Lanjutan', expert: 'Untuk ahli' };

/** Jelajahi Dompet Ajaib: every capability, grouped by what people want to do, with one honest badge each. */
export function FeatureExplorer({ onOpen }: { onOpen: OpenFeature }) {
  const { data, profile, user } = useApp();
  const usage = useUsage();
  const [query, setQuery] = useState('');
  const today = todayInTimeZone(profile?.timeZone);
  const signals = useMemo(() => readSignals(data, profile, today, { healthIssues: usage.health?.issues }), [data, profile, today, usage.health?.issues]);
  const shown = useMemo(() => query.trim() ? new Set(searchFeatures(query).map(h => h.item.id)) : null, [query]);
  const badge = (f: FeatureDef) => {
    const life = lifecycle(f.id, signals, usage.discovery, Date.now());
    if (life === 'LEARNED' || usage.visited[f.action.kind === 'view' ? f.action.view : ''] && f.page) return <em className="fx-badge is-used">Sudah dipakai</em>;
    if (life === 'ELIGIBLE' || life === 'SHOWN') return <em className="fx-badge is-relevant">Cocok untukmu</em>;
    if (f.complexity === 'advanced' || f.complexity === 'expert') return <em className="fx-badge">{LEVEL[f.complexity]}</em>;
    return null;
  };
  const open = (f: FeatureDef) => { writeUsage(user?.uid, u => touchRecent(u, f.id)); onOpen(f.action, f.id); };
  const card = (f: FeatureDef) => <div key={f.id} className="fx-card" role="button" tabIndex={0} onClick={() => open(f)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(f); } }}>
    <span className="fs-icon"><FeatureIcon name={f.icon}/></span>
    <span className="fx-text"><strong>{f.name}</strong><small>{f.description}</small>{badge(f)}</span>
    <button type="button" className={`fs-star ${usage.favorites.includes(f.id) ? 'is-on' : ''}`} aria-pressed={usage.favorites.includes(f.id)} aria-label={`${usage.favorites.includes(f.id) ? 'Lepas sematan' : 'Sematkan'} ${f.name}`} onClick={e => { e.stopPropagation(); writeUsage(user?.uid, u => toggleFavorite(u, f.id)); }}><Star size={15}/></button>
  </div>;
  const list = features.filter(f => f.id !== 'explore' && (!shown || shown.has(f.id)));
  return <div className="feature-explorer">
    <div className="page-heading"><div><h1>Jelajahi Dompet Ajaib</h1><p>Semua yang bisa dilakukan, dikelompokkan menurut kebutuhan. Halaman lain sengaja menampilkan yang penting saja.</p></div></div>
    <label className="search-box fx-search"><Search size={18} aria-hidden="true"/><input className="search-input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Saring fitur… (mis. bunga, klaim, struk)" aria-label="Saring fitur"/></label>
    {!query && usage.favorites.length > 0 && <section className="fx-group"><h2><Star size={16}/> Disematkan</h2><div className="fx-grid">{usage.favorites.map(id => features.find(f => f.id === id)).filter((f): f is FeatureDef => Boolean(f)).map(card)}</div></section>}
    {intentGroups.map(g => { const items = list.filter(f => f.group === g.id); if (!items.length) return null; return <section key={g.id} className="fx-group" aria-labelledby={`fx-${g.id}`}>
      <h2 id={`fx-${g.id}`}><FeatureIcon name={g.icon} size={17}/> {g.title}</h2><p className="fx-lead">{g.lead}</p>
      <div className="fx-grid">{items.map(card)}</div>
    </section>; })}
    {!list.length && <p className="fs-empty">Tidak ada fitur yang cocok. Coba kata lain.</p>}
  </div>;
}
