'use client';
/**
 * 10.3.1 "Subkategori belum dipilih" with a dropdown of the category's subcategories (most used first). Only a nudge: the
 * transaction saves fine without one. Shared by Catat otomatis / chat cards, the Tambah/Ubah form, Scan struk and Impor mutasi.
 */
import { memo } from 'react';
import { FolderTree } from 'lucide-react';
import { Select } from './fields';
import { emojiOrFallback } from './visual-identity';
import type { Category } from '@/lib/types';

export const SubcategoryHint = memo(function SubcategoryHint({ category, subs, onPick, compact = false }: { category: Category | undefined; subs: Category[] | null; onPick: (id: string) => void; compact?: boolean }) {
  if (!category || !subs?.length) return null;
  return <div className={`sub-hint ${compact ? 'is-compact' : ''}`} role="group" aria-label={`Subkategori ${category.name} belum dipilih`}>
    <span className="sub-hint-q"><FolderTree size={14} aria-hidden="true"/><span>Subkategori <b>{category.name}</b> belum dipilih</span></span>
    <Select className="sub-hint-select" value="" aria-label={`Pilih subkategori ${category.name}`} onChange={event => { if (event.target.value) onPick(event.target.value); }}>
      <option value="">Pilih subkategori</option>
      {subs.map(c => <option key={c.id} value={c.id}>{`${emojiOrFallback(c.icon)} ${c.name}`}</option>)}
    </Select>
  </div>;
});
