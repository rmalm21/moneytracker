'use client';
/**
 * 10.3.1 "Belum ada subkategori" with the category's subcategories as quick picks (most used first). Only a nudge: the
 * transaction saves fine without one. Shared by Catat otomatis / chat cards, the Tambah/Ubah form, Scan struk and Impor mutasi.
 */
import { memo } from 'react';
import { FolderTree } from 'lucide-react';
import { Emoji } from './emoji';
import { emojiOrFallback } from './visual-identity';
import type { Category } from '@/lib/types';

const SHOWN = 6;

export const SubcategoryHint = memo(function SubcategoryHint({ category, subs, onPick, compact = false }: { category: Category | undefined; subs: Category[] | null; onPick: (id: string) => void; compact?: boolean }) {
  if (!category || !subs?.length) return null;
  const shown = subs.slice(0, SHOWN);
  return <div className={`sub-hint ${compact ? 'is-compact' : ''}`} role="group" aria-label={`Belum ada subkategori di ${category.name}`}>
    <span className="sub-hint-q"><FolderTree size={14} aria-hidden="true"/><span>Belum ada subkategori di <b>{category.name}</b>{compact ? '' : '. Pilih biar laporannya rapi:'}</span></span>
    <span className="qp-picks">{shown.map(c => <button type="button" key={c.id} className="sb-chip" onClick={() => onPick(c.id)}><Emoji e={emojiOrFallback(c.icon)}/> {c.name}</button>)}{subs.length > SHOWN && <small className="sub-hint-more">+{subs.length - SHOWN} lagi di Kategori</small>}</span>
  </div>;
});
