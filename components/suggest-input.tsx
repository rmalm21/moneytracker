'use client';
import { useId, useMemo, useState, type InputHTMLAttributes } from 'react';
import { History } from 'lucide-react';
import type { LedgerTx } from '@/lib/types';

/**
 * Texts typed before (keterangan, tempat) come back as suggestions. They are gathered from
 * the loaded transactions plus a small per-device memory of saved texts, ranked by how
 * often and how recently they were used.
 */
const memoryKey = (uid: string, field: string) => `dompet-ajaib:typed:${uid}:${field}`;
export type TypedField = 'description' | 'merchant';

export function rememberTyped(uid: string, field: TypedField, text: string) {
  const value = text.trim();
  if (!value) return;
  try {
    const list: string[] = JSON.parse(localStorage.getItem(memoryKey(uid, field)) || '[]');
    localStorage.setItem(memoryKey(uid, field), JSON.stringify([value, ...list.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 300)));
  } catch { /* Suggestions are a convenience. */ }
}

export type Suggestion = { text: string; last?: LedgerTx };
export function useTypedSuggestions(uid: string | undefined, field: TypedField, transactions: LedgerTx[]) {
  return useMemo(() => {
    const map = new Map<string, { text: string; count: number; score: number; last?: LedgerTx }>();
    const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
    sorted.forEach((tx, index) => {
      const text = (tx[field] || '').trim();
      if (!text) return;
      const key = text.toLowerCase();
      const row = map.get(key) || { text, count: 0, score: 0, last: tx };
      row.count++; row.score += 1 + 1 / (1 + index / 20);
      map.set(key, row);
    });
    let remembered: string[] = [];
    try { if (uid) remembered = JSON.parse(localStorage.getItem(memoryKey(uid, field)) || '[]'); } catch { /* ignore */ }
    remembered.forEach((text, index) => { const key = text.toLowerCase(); const row = map.get(key) || { text, count: 0, score: 0 }; row.score += .5 / (1 + index / 10); map.set(key, row); });
    return [...map.values()].sort((a, b) => b.score - a.score).map(({ text, last }) => ({ text, last }));
  }, [uid, field, transactions]);
}

function match(list: Suggestion[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = list.filter(item => item.text.toLowerCase().startsWith(q) && item.text.toLowerCase() !== q);
  const words = list.filter(item => !starts.includes(item) && item.text.toLowerCase().split(/\s+/).some(word => word.startsWith(q)) && item.text.toLowerCase() !== q);
  const inside = list.filter(item => !starts.includes(item) && !words.includes(item) && q.length >= 3 && item.text.toLowerCase().includes(q));
  return [...starts, ...words, ...inside].slice(0, 5);
}

/** Text input with a suggestion list under it; tapping a suggestion fills the field (and lets the form copy related values). */
export function SuggestInput({ value, onValue, suggestions, onPick, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onValue: (value: string) => void; suggestions: Suggestion[]; onPick?: (item: Suggestion) => void }) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const id = useId();
  const items = open ? match(suggestions, value) : [];
  const q = value.trim().toLowerCase();
  function pick(item: Suggestion) { onValue(item.text); onPick?.(item); setOpen(false); setActive(-1); }
  return <div className="suggest">
    <input {...rest} className={`input ${rest.className || ''}`} value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0} aria-controls={id} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
      onChange={event => { onValue(event.target.value); setOpen(true); setActive(-1); }}
      onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
      onKeyDown={event => {
        if (!items.length) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % items.length); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index <= 0 ? items.length : index) - 1); }
        else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); pick(items[active]); }
        else if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
      }}/>
    {items.length > 0 && <ul className="suggest-list" id={id} role="listbox">{items.map((item, index) => {
      const at = item.text.toLowerCase().indexOf(q);
      return <li key={item.text} id={`${id}-${index}`} role="option" aria-selected={index === active} className={index === active ? 'active' : ''} onPointerDown={event => { event.preventDefault(); pick(item); }}>
        <History size={14} aria-hidden="true"/>
        <span>{at >= 0 ? <>{item.text.slice(0, at)}<b>{item.text.slice(at, at + q.length)}</b>{item.text.slice(at + q.length)}</> : item.text}</span>
      </li>;
    })}</ul>}
  </div>;
}
