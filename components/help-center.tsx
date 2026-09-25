'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, ChevronDown, CircleHelp, Compass, HeartPulse, Lightbulb, Rocket, Search, SearchX, ShieldCheck, SlidersHorizontal, Wand2, Wrench, X, type LucideIcon } from 'lucide-react';
import { flattenHelp, helpGroups, plainText, type HelpGroup, type HelpItem } from '@/lib/help-content';

/**
 * Tanya Jawab: every term, menu and how-to in one place. Groups hold questions; a question can hold
 * follow-up questions that open inside it. Search looks through questions, answers, steps and tips.
 */
type Navigate = (key: string, target?: string) => void;

const icons: Record<HelpGroup['icon'], LucideIcon> = { rocket: Rocket, book: BookOpen, compass: Compass, wand: Wand2, shield: ShieldCheck, wrench: Wrench };
const popular = ['Uang tersedia', 'Kantong', 'Tutup siklus', 'Cadangan aman', 'Saldo tidak cocok', 'Transfer'];
const fold = (text: string) => plainText(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const countAll = (items: HelpItem[]): number => items.reduce((n, item) => n + 1 + countAll(item.children || []), 0);

/** Answer text with **bold** words; search terms are highlighted when given. */
function Rich({ text, terms = [] }: { text: string; terms?: string[] }) {
  return <>{text.split('**').map((part, i) => i % 2 ? <b key={i}><Marked text={part} terms={terms}/></b> : <Marked key={i} text={part} terms={terms}/>)}</>;
}
function Marked({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.join('|')})`, 'gi');
  return <>{text.split(pattern).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</>;
}

function Question({ item, navigate, openIds, terms, sub = false }: { item: HelpItem; navigate: Navigate; openIds: Set<string>; terms: string[]; sub?: boolean }) {
  const more = item.children?.length || 0;
  return <details id={`qa-${item.id}`} className={`qa-item ${sub ? 'is-sub' : ''}`} open={openIds.has(item.id) || undefined}>
    <summary>
      <span className="qa-q"><Marked text={item.q} terms={terms}/></span>
      {more > 0 && <span className="qa-more">+{more}</span>}
      <ChevronDown size={17} className="qa-chev" aria-hidden="true"/>
    </summary>
    <div className="qa-body">
      <p className="qa-a"><Rich text={item.a} terms={terms}/></p>
      {item.steps && <ol className="qa-steps">{item.steps.map((step, i) => <li key={i}><span className="qa-step-no">{i + 1}</span><span><Rich text={step} terms={terms}/></span></li>)}</ol>}
      {item.tip && <p className="qa-tip"><Lightbulb size={15} aria-hidden="true"/><span><b>Tips</b> <Rich text={item.tip} terms={terms}/></span></p>}
      {more > 0 && <div className="qa-children"><small className="qa-children-label">Pertanyaan lanjutan</small>{item.children!.map(child => <Question key={child.id} item={child} navigate={navigate} openIds={openIds} terms={terms} sub/>)}</div>}
      {item.go && <button type="button" className="qa-go" onClick={() => navigate(item.go!.view, item.go!.target)}>{item.go.label}<ArrowRight size={15} aria-hidden="true"/></button>}
    </div>
  </details>;
}

function GroupSection({ group, children, onShowAll }: { group: HelpGroup; children: ReactNode; onShowAll?: () => void }) {
  const Icon = icons[group.icon];
  return <section className={`qa-section tone-${group.icon}`} aria-labelledby={`qa-h-${group.id}`}>
    <header className="qa-section-head"><span className="qa-icon"><Icon size={18} aria-hidden="true"/></span><div><h2 id={`qa-h-${group.id}`}>{group.title}</h2><p>{group.lead}</p></div>{onShowAll && <button type="button" className="link-button" onClick={onShowAll}>Semua topik</button>}</header>
    <div className="qa-list">{children}</div>
  </section>;
}

export function HelpView({ navigate, focus }: { navigate: Navigate; focus?: string }) {
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const rows = useMemo(() => flattenHelp(), []);
  const total = rows.length;
  // A linked question opens together with the questions it sits under.
  const openIds = useMemo(() => {
    const parents = new Map<string, string>();
    const walk = (items: HelpItem[], parent?: string) => { for (const item of items) { if (parent) parents.set(item.id, parent); if (item.children) walk(item.children, item.id); } };
    helpGroups.forEach(group => walk(group.items));
    const ids = new Set<string>();
    for (let id = focus; id && rows.some(row => row.item.id === id); id = parents.get(id)) ids.add(id);
    return ids;
  }, [focus, rows]);
  useEffect(() => { if (focus) document.getElementById(`qa-${focus}`)?.scrollIntoView({ block: 'center' }); }, [focus]);

  const terms = useMemo(() => fold(query).split(/\s+/).filter(term => term.length > 0), [query]);
  const results = useMemo(() => {
    if (!terms.length) return [];
    return rows.map(row => {
      const q = fold(row.item.q), keys = fold(row.item.keywords || ''), body = fold([row.item.a, ...(row.item.steps || []), row.item.tip || '', ...row.path].join(' '));
      if (!terms.every(term => q.includes(term) || keys.includes(term) || body.includes(term))) return null;
      const score = terms.reduce((n, term) => n + (q.includes(term) ? 4 : 0) + (keys.includes(term) ? 2 : 0) + (q.startsWith(term) ? 2 : 0), 0);
      return { ...row, score };
    }).filter(Boolean).sort((a, b) => b!.score - a!.score) as (ReturnType<typeof flattenHelp>[number] & { score: number })[];
  }, [rows, terms]);
  const shown = groupId ? helpGroups.filter(group => group.id === groupId) : helpGroups;
  const searching = terms.length > 0;

  return <div className="qa-page">
    <section className="qa-hero">
      <div className="qa-hero-text">
        <span className="qa-hero-badge"><CircleHelp size={15} aria-hidden="true"/> Pusat bantuan</span>
        <h1>Tanya Jawab</h1>
        <p>Arti istilah, fungsi setiap menu, dan langkah-langkah memakai Dompet Ajaib — {total} jawaban dalam {helpGroups.length} topik.</p>
      </div>
      <label className="qa-search">
        <Search size={18} aria-hidden="true"/>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari istilah atau pertanyaan…" aria-label="Cari di Tanya Jawab" enterKeyHint="search"/>
        {query && <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery('')}><X size={16}/></button>}
      </label>
      <div className="qa-popular" aria-label="Pencarian populer">{popular.map(word => <button type="button" key={word} onClick={() => setQuery(word)}>{word}</button>)}</div>
    </section>

    {searching ? <section className="qa-results" aria-live="polite">
      <header className="qa-results-head"><strong>{results.length ? `${results.length} jawaban untuk “${query.trim()}”` : `Belum ada jawaban untuk “${query.trim()}”`}</strong><button type="button" className="link-button" onClick={() => setQuery('')}>Kembali ke topik</button></header>
      {results.length ? <div className="qa-list">{results.map(({ item, group, path }) => { const Icon = icons[group.icon]; return <div key={item.id} className={`qa-result tone-${group.icon}`}>
        <small className="qa-path"><Icon size={13} aria-hidden="true"/>{path.join(' › ')}</small>
        <Question item={item} navigate={navigate} openIds={results.length === 1 ? new Set([item.id]) : openIds} terms={terms}/>
      </div>; })}</div>
        : <div className="qa-empty"><SearchX size={28} aria-hidden="true"/><p>Coba kata lain yang lebih umum, misalnya <b>saldo</b>, <b>anggaran</b>, atau <b>siklus</b>.</p></div>}
    </section> : <>
      <nav className="qa-topics" aria-label="Topik">{helpGroups.map(group => { const Icon = icons[group.icon]; const active = groupId === group.id; return <button type="button" key={group.id} className={`qa-topic tone-${group.icon} ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => setGroupId(active ? null : group.id)}>
        <span className="qa-icon"><Icon size={18} aria-hidden="true"/></span>
        <span className="qa-topic-text"><strong>{group.title}</strong><small>{countAll(group.items)} jawaban</small></span>
      </button>; })}</nav>
      {shown.map(group => <GroupSection key={group.id} group={group} onShowAll={groupId ? () => setGroupId(null) : undefined}>{group.items.map(item => <Question key={item.id} item={item} navigate={navigate} openIds={openIds} terms={[]}/>)}</GroupSection>)}
    </>}

    <section className="qa-footer">
      <div><strong>Masih ada yang janggal?</strong><p>Periksa Data mencari saldo atau catatan yang tidak cocok tanpa mengubah apa pun. Kontrol keuangan menjelaskan setiap angka dengan datamu sendiri.</p></div>
      <div className="qa-footer-actions">
        <button type="button" className="qa-go" onClick={() => navigate('health')}><HeartPulse size={15} aria-hidden="true"/>Periksa Data</button>
        <button type="button" className="qa-go" onClick={() => navigate('settings', 'control')}><SlidersHorizontal size={15} aria-hidden="true"/>Kontrol keuangan</button>
      </div>
    </section>
  </div>;
}
