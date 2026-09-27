'use client';
import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, Tags } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Emoji } from './emoji';
import { categoryColor, emojiOrFallback, identityStyle } from './visual-identity';
import type { Category } from '@/lib/types';

export type CategoryChoice = { categoryId: string; subcategoryId: string | null };
const byOrder = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);

/**
 * A category dropdown grouped by main category: every main category is a row that folds open to show its
 * subcategories, so a long list stays short. The group holding the current choice starts open; typing in the search
 * box opens every group with a match. Picking the main category itself ("Semua …") or one subcategory closes it.
 */
export function CategoryAccordion({ type, value, onChange, placeholder = 'Pilih kategori', label = 'Pilih kategori', compact = false }: { type: 'expense' | 'income'; value: CategoryChoice; onChange: (value: CategoryChoice) => void; placeholder?: string; label?: string; compact?: boolean }) {
  const { data } = useApp();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [expanded, setExpanded] = useState<string[]>([]);
  const all = useMemo(() => data.categories.filter(c => !c.isArchived && c.type === type), [data.categories, type]);
  const parents = useMemo(() => all.filter(c => !c.parentId || !all.some(p => p.id === c.parentId)).sort(byOrder), [all]);
  const childrenOf = (id: string) => all.filter(c => c.parentId === id).sort(byOrder);
  const parent = all.find(c => c.id === value.categoryId), child = all.find(c => c.id === value.subcategoryId);
  const search = query.trim().toLocaleLowerCase('id-ID');
  const hits = (c: Category) => c.name.toLocaleLowerCase('id-ID').includes(search);
  function show() { setQuery(''); setExpanded(parent ? [parent.id] : []); setOpen(true); }
  function pick(choice: CategoryChoice) { onChange(choice); setOpen(false); }
  const toggle = (id: string) => setExpanded(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const icon = (c: Category) => <span className="ca-emoji" style={identityStyle(categoryColor(data.categories, c))} aria-hidden="true"><Emoji e={emojiOrFallback(c.icon)}/></span>;
  return <>
    <button type="button" className={`input ca-trigger ${compact ? 'is-compact' : ''}`} onClick={show} aria-haspopup="dialog">
      {parent ? <span className="ca-value"><Emoji e={emojiOrFallback((child || parent).icon)}/><span className="ca-text">{child ? <><small>{parent.name}</small>{child.name}</> : parent.name}</span></span> : <span className="ca-value muted">{placeholder}</span>}
      <ChevronDown size={16} aria-hidden="true"/>
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title={label} className="mobile-sheet category-accordion-dialog">
      <label className="emoji-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari kategori atau subkategori" aria-label="Cari kategori"/></label>
      <div className="ca-list">
        {parents.map(p => {
          const kids = childrenOf(p.id), shownKids = search ? kids.filter(hits) : kids;
          if (search && !hits(p) && !shownKids.length) return null;
          const isOpen = Boolean(search) || expanded.includes(p.id), current = value.categoryId === p.id;
          return <section key={p.id} className={`ca-group ${isOpen ? 'is-open' : ''} ${current ? 'is-current' : ''}`}>
            <div className="ca-head">
              <button type="button" className="ca-parent" onClick={() => kids.length ? toggle(p.id) : pick({ categoryId: p.id, subcategoryId: null })} aria-expanded={kids.length ? isOpen : undefined}>
                {icon(p)}<span className="ca-name"><strong>{p.name}</strong>{kids.length > 0 && <small>{current && child ? child.name : `${kids.length} subkategori`}</small>}</span>
                {kids.length > 0 ? <ChevronDown size={17} className="ca-chev" aria-hidden="true"/> : current && <Check size={17} className="ca-check"/>}
              </button>
            </div>
            {isOpen && kids.length > 0 && <div className="ca-kids">
              {(!search || hits(p)) && <button type="button" className={`ca-kid is-all ${current && !value.subcategoryId ? 'is-on' : ''}`} onClick={() => pick({ categoryId: p.id, subcategoryId: null })}><Tags size={15}/><span>Semua {p.name}</span>{current && !value.subcategoryId && <Check size={16}/>}</button>}
              {shownKids.map(c => <button type="button" key={c.id} className={`ca-kid ${value.subcategoryId === c.id ? 'is-on' : ''}`} onClick={() => pick({ categoryId: p.id, subcategoryId: c.id })}><Emoji e={emojiOrFallback(c.icon)}/><span>{c.name}</span>{value.subcategoryId === c.id && <Check size={16}/>}</button>)}
            </div>}
          </section>;
        })}
        {search && !parents.some(p => hits(p) || childrenOf(p.id).some(hits)) && <p className="muted">Kategori tidak ditemukan.</p>}
      </div>
    </DialogContent></Dialog>
  </>;
}
