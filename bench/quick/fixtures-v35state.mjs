/**
 * Catat otomatis V3.5 — the V3.3 state plus the real default taxonomy groups the composition sets need
 * (lib/category-templates.ts): Nongkrong & Hiburan › Nongkrong / Bioskop / Gaming, Belanja › Pakaian, Makan & Minum › Sarapan.
 */
import { ctx as base } from './fixtures-v33state.mjs';
export { today, nowMs, at } from './fixtures-v33state.mjs';
export const ctx = {
  ...base,
  categories: [...base.categories,
    { id: 'fun', name: 'Nongkrong & Hiburan', type: 'expense', parentId: null },
    { id: 'hang', name: 'Nongkrong', type: 'expense', parentId: 'fun' },
    { id: 'cinema', name: 'Bioskop', type: 'expense', parentId: 'fun' },
    { id: 'game', name: 'Gaming', type: 'expense', parentId: 'fun' },
    { id: 'clothes', name: 'Pakaian', type: 'expense', parentId: 'shop' },
    { id: 'breakfast', name: 'Sarapan', type: 'expense', parentId: 'food' },
  ],
};
