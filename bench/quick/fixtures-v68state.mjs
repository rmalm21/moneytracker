/**
 * Catat otomatis 6.8 — everyday language on the real default taxonomy. The state is a fresh account that picked every
 * default category group (lib/category-templates.ts), so "jajan", "makan malam", "sarapan", "kopi & minuman" exist as
 * they do in the app, plus the V3.3 wallets, records and recent transactions. Today is Thursday 15 October 2026, 15:00.
 *
 * The default wallet (what "pakai dompet bawaan" means when a sentence names none) is the first active wallet, as in
 * the app: Jago.
 */
import { categoryTemplates } from '../../lib/category-templates.ts';
import { ctx as base } from './fixtures-v33state.mjs';
export { today, nowMs, at } from './fixtures-v33state.mjs';

const categories = [];
for (const t of categoryTemplates) {
  categories.push({ id: t.key, name: t.name, type: t.type, parentId: null, templateKey: t.key });
  for (const s of t.subcategories) categories.push({ id: s.key, name: s.name, type: t.type, parentId: t.key, templateKey: s.key });
}
export const ctx = { ...base, categories, history: [], recent: base.recent.map(r => ({ ...r, categoryId: 'expense.makan-minum', subcategoryId: r.subcategoryId === 'drink' ? 'expense.makan-minum.kopi-minuman' : r.subcategoryId === 'park' ? null : null })) };
/** Category ids by their visible names, for writing the truth: C('Jajan') → 'expense.makan-minum.jajan'. */
export const C = name => { const hit = categories.filter(c => c.name.toLowerCase() === name.toLowerCase()); if (hit.length !== 1) throw Error(`kategori ${name}: ${hit.length}`); return hit[0].id; };
