/**
 * Catat otomatis — Memori Konteks (app 5.0).
 *
 * The person's own history is the memory: every place they wrote before, how often, and what they usually record there
 * (description, category). Two things are learned from it, both local and per account (the history is the account's own
 * transactions; nothing is stored or sent):
 *
 *   1. A PLACE NAMED IN PART. Once "kopi di Dopamine Avenue" is in the history, "kopi dopamine 77k" (no "di", one word
 *      of the name) is read as Dopamine Avenue. Only a distinctive word of a remembered name counts: not a word the app
 *      already knows (kopi, makan, cafe, warung…), not a wallet, not a person, at least four letters, and pointing at one
 *      place only (or clearly the one used most).
 *   2. THE HABIT OF A PLACE. "dopamine 45k jago" says only the place: the description and category usually recorded
 *      there fill what the sentence left empty ("Kopi", Minuman), marked "kemungkinan benar", never over what was said.
 *
 * Money, wallet, date and the kind of entry are never taken from memory.
 */
import type { QuickContext } from '../quick-entry.ts';

export type PlaceHabit = {
  name: string; count: number; last: string;
  /** Most frequent description recorded there and its share of the visits. */
  description?: { text: string; share: number };
  /** Most frequent category there and its share. */
  category?: { categoryId: string; subcategoryId: string | null; share: number };
};
type Memory = { places: Map<string, PlaceHabit>; tokens: Map<string, string[]> };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const key = (s: string) => lower(s).replace(/\s+/g, ' ').trim();
/** Words common to many place names: never enough on their own to name a place. */
const GENERIC = new Set('cafe kafe coffee kopi warung warkop toko resto restoran restaurant rumah makan store shop mart market official outlet bakery kitchen house corner space studio express cabang mall plaza square city park station hotel bistro eatery kedai depot lapak gerai grill bar kantin kantor tempat jalan raya baru lama besar kecil indonesia jakarta bandung surabaya the and dan'.split(' '));
const MAX_HISTORY = 1500;

const cache = new WeakMap<object, Memory>();
/** The memory of this account's places, built once per history array (the app passes the same array until it changes). */
export function placeMemory(ctx: Pick<QuickContext, 'history' | 'merchants'>): Memory {
  const hit = cache.get(ctx.history);
  if (hit && !ctx.merchants?.length) return hit;
  const raw = new Map<string, { name: string; count: number; last: string; desc: Map<string, number>; cat: Map<string, number> }>();
  const rows = ctx.history.length > MAX_HISTORY ? [...ctx.history].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, MAX_HISTORY) : ctx.history;
  const add = (name: string, date = '', description = '', cat = '') => {
    const k = key(name); if (k.length < 3) return;
    const p = raw.get(k) || { name: name.replace(/\s+/g, ' ').trim(), count: 0, last: '', desc: new Map(), cat: new Map() };
    p.count++; if (date > p.last) p.last = date;
    if (description) p.desc.set(description, (p.desc.get(description) || 0) + 1);
    if (cat) p.cat.set(cat, (p.cat.get(cat) || 0) + 1);
    raw.set(k, p);
  };
  for (const t of rows) if (t.merchant && (t.type === 'expense' || t.type === 'income')) add(t.merchant, t.date, (t.description || '').trim(), t.categoryId ? `${t.categoryId}|${t.subcategoryId || ''}` : '');
  for (const m of ctx.merchants || []) if (!raw.has(key(m))) add(m);
  const places = new Map<string, PlaceHabit>(), tokens = new Map<string, string[]>();
  const top = (m: Map<string, number>) => { let best = '', n = 0, all = 0; for (const [k, v] of m) { all += v; if (v > n) { best = k; n = v; } } return best ? { best, share: n / all } : null; };
  for (const [k, p] of raw) {
    const d = top(p.desc), c = top(p.cat);
    places.set(k, {
      name: p.name, count: p.count, last: p.last,
      ...(d ? { description: { text: d.best, share: d.share } } : {}),
      ...(c ? { category: { categoryId: c.best.split('|')[0], subcategoryId: c.best.split('|')[1] || null, share: c.share } } : {}),
    });
    for (const w of new Set(k.split(/[\s'’&.,-]+/))) if (w.length >= 4 && /^\p{L}+$/u.test(w) && !GENERIC.has(w)) tokens.set(w, [...(tokens.get(w) || []), k]);
  }
  const mem = { places, tokens };
  if (!ctx.merchants?.length) cache.set(ctx.history, mem);
  return mem;
}

/** The remembered place a word names, or null when it names none, or several without a clear favourite. */
export function recallPlace(word: string, mem: Memory): PlaceHabit | null {
  const w = lower(word);
  let keys = mem.tokens.get(w);
  // One typo in a long word ("dopamin" for Dopamine): only when it points at exactly one remembered word.
  if (!keys && w.length >= 6) {
    const near = [...mem.tokens.keys()].filter(t => Math.abs(t.length - w.length) <= 1 && t.length >= 6 && oneEdit(t, w));
    if (near.length === 1) keys = mem.tokens.get(near[0]);
  }
  if (!keys?.length) return null;
  if (keys.length === 1) return mem.places.get(keys[0]) || null;
  const ranked = keys.map(k => mem.places.get(k)!).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  return ranked[0].count >= 2 * ranked[1].count && ranked[0].count >= 2 ? ranked[0] : null;
}

/** True when a and b differ by one inserted, removed or changed letter. */
function oneEdit(a: string, b: string) {
  if (a === b) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

/** The habit of a place by its full name (any case), or null. */
export const habitOf = (name: string, mem: Memory) => mem.places.get(key(name)) || null;
