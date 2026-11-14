/**
 * 10.2 One of the person's categories for a phrase, however it is said: "makan malem", "pos transportasi", "parkir
 * motor", "dinner", "bonus". Shared by the chat (an answer to "Masuk kategori apa?") and Catat otomatis (a change to a
 * saved record: "ubah kopi tadi jadi kategori jajan"). Only the person's own categories are ever picked.
 */
import { suggestCategory } from './categorize.ts';
import type { Category } from './types';

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const norm = (s: string) => lower(s).replace(/\bdan\b/g, '&').replace(/[^\p{L}\p{N}&]+/gu, '');
type Cat = Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'isArchived'> & { templateKey?: string; icon?: string };
export type Flow = 'expense' | 'income';
export type CatPick = { categoryId: string; subcategoryId: string | null; name: string; type: Flow };

// Everyday spellings, to read a category the way it is named in the list.
const SPELL: [RegExp, string][] = [
  [/\b(?:malem|mlm)\b/g, 'malam'], [/\b(?:mkn|maem|mamam|makn)\b/g, 'makan'], [/\bmaksi\b/g, 'makan siang'], [/\bmakmal\b/g, 'makan malam'],
  [/\bsarap\b/g, 'sarapan'], [/\btransport\b/g, 'transportasi'], [/\bngopi\b/g, 'kopi'], [/\bjajanan\b/g, 'jajan'], [/\bbbm\b/g, 'bensin'],
  [/\bmakanan\b/g, 'makan'], [/\bminuman\b/g, 'minum'], [/\bbelanjaan\b/g, 'belanja'], [/\bkesehatn\b/g, 'kesehatan'], [/\blangganan bulanan\b/g, 'langganan'],
  [/\bjualan\b/g, 'penjualan'], [/\bhasil penjualan\b/g, 'penjualan'], [/\bgojek|grab|maxim|ojol\b/g, 'ojek'],
];
const spell = (s: string) => SPELL.reduce((t, [re, to]) => t.replace(re, to), s);
// Names that say nothing on their own ("Lainnya" is under every category).
const VAGUE = new Set(['lainnya', 'lain', 'lainlain', 'belumdikategorikan', 'tagihanlainnya', 'belanjalainnya', 'biayalainnya', 'pemasukanlainnya', 'reimburselainnya']);

/**
 * One of the person's categories for a phrase ("makan malem", "pos transportasi", "parkir motor", "bonus"), or null.
 * `prefer`: the kind of the record it is for; a category of the other kind is only taken when nothing of this kind fits.
 */
export function resolveCategory(phrase: string, categories: Cat[], prefer: Flow = 'expense'): CatPick | null {
  const p = spell(lower(phrase)).replace(/[^\p{L}\p{N}&/ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!p || p.length < 2) return null;
  const live = categories.filter(c => !c.isArchived && (c.type === 'expense' || c.type === 'income'));
  const pick = (c: Cat): CatPick => {
    const parent = c.parentId ? live.find(x => x.id === c.parentId) : undefined;
    return { categoryId: parent ? parent.id : c.id, subcategoryId: parent ? c.id : null, name: c.name, type: c.type as Flow };
  };
  const rank = (c: Cat) => (c.type === prefer ? 0 : 2) + (c.parentId ? 0 : 1);
  // The concepts behind the person's categories ("dinner" → Makan Malam, "parkir motor" → Parkir, "bonus" → Bonus).
  const guess = (type: Flow) => suggestCategory({ text: p, item: p, amount: 50000, type }, { categories: live, history: [] });
  const own = guess(prefer), other = guess(prefer === 'expense' ? 'income' : 'expense');
  const best = own && (!other || own.score >= other.score - 0.5) ? own : other;
  const meant = best && best.score >= 2.5 ? live.find(x => x.id === (best.subcategoryId || best.categoryId)) : undefined;
  // The whole name ("makan malam", "kopi & minuman", "taxi / online"). A name only a subcategory elsewhere has ("Makan"
  // under Travel) gives way to what the word means ("makan" → Makan & Minum).
  const whole = norm(p), exact = live.filter(c => norm(c.name) === whole && !VAGUE.has(norm(c.name))).sort((a, b) => rank(a) - rank(b));
  if (exact.length) {
    if (meant && exact.some(c => c.id === meant.id)) return pick(meant);
    if (meant && exact.every(c => c.parentId)) return pick(meant);
    return pick(exact[0]);
  }
  if (meant) return pick(meant);
  // A name inside the phrase ("pos transportasi", "yang kebutuhan rumah"): the longest one.
  const inside = live.filter(c => !VAGUE.has(norm(c.name)) && norm(c.name).length >= 3 && new RegExp(`(?:^|[^\\p{L}])${lower(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(p))
    .sort((a, b) => b.name.length - a.name.length || rank(a) - rank(b));
  if (inside.length) return pick(inside[0]);
  // Words of one main category's name ("hiburan" → Nongkrong & Hiburan, "sosial" → Sosial & Sedekah), when only one has them.
  const words = p.split(' ').filter(w => w.length >= 3 && w !== 'dan');
  if (words.length) {
    const nameWords = (c: Cat) => lower(c.name).replace(/&/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const covering = live.filter(c => !c.parentId && !VAGUE.has(norm(c.name)) && words.every(w => nameWords(c).includes(w))).sort((a, b) => rank(a) - rank(b));
    if (covering.length === 1 || covering.length > 1 && covering[0].type === prefer && covering[1].type !== prefer) return pick(covering[0]);
  }
  // One letter off a name of five letters or more ("kesehatn", "pendidkan").
  const typo = live.filter(c => { const n = norm(c.name); return n.length >= 5 && !VAGUE.has(n) && oneOff(n, whole); }).sort((a, b) => rank(a) - rank(b));
  return typo.length ? pick(typo[0]) : null;
}
function oneOff(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++diff > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

