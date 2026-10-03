/**
 * Catat otomatis V3.3 — several people in one sentence.
 *
 *   "budi sama aldi masing2 ngutang 10k"  → piutang Budi 10.000 + piutang Aldi 10.000
 *   "budi sama aldi total ngutang 20k"    → never 20.000 each: the allocation is asked (equal split offered, marked to check)
 *   "gue bayar makan 150k bagi rata bertiga gue atuy budi" → Split Bill: you paid 150.000, your share 50.000,
 *                                                            piutang Atuy 50.000, piutang Budi 50.000
 * People named together do not mean an equal split by themselves: "bagi rata", "patungan", "bertiga", "split" do.
 * The shares come from the Split Bill engine (lib/split-bill.ts computeSplit), so they always add up to the total.
 */
import { findAmounts, nameLike, type QuickContext } from '../quick-entry.ts';
import { computeSplit } from '../../../../lib/split-bill.ts';

const USER = /^(aku|saya|ane|gue|gua|gw|ku)$/;
const COUNT: Record<string, number> = { berdua: 2, bertiga: 3, berempat: 4, berlima: 5, berenam: 6, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6 };
const title = (w: string) => w[0].toUpperCase() + w.slice(1);
const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

export type GroupReading = { names: string[]; each: boolean; explicitTotal: boolean; verb: string; amount: number; amountText: string; rest: string; shares: number[]; note: string };

/** "budi sama aldi masing2 ngutang 10k", "budi dan aldi ngutang 20k total": one loan verb for two or more people. */
export function readGroup(text: string, ctx: QuickContext): GroupReading | null {
  const m = text.match(/^((?:\p{L}+)(?:\s*(?:,|sama|dan|&|ama)\s*\p{L}+)+)\s+(?:(masing-masing|tiap orang|per orang|total|semuanya|berdua|bertiga|berempat)\s+)?(ngutang|minjem|pinjem|pinjam|utang|hutang|ngutang ke aku|minjem ke aku)\s+(.+)$/u);
  if (!m) return null;
  const names = m[1].split(/\s*(?:,|\bsama\b|\bdan\b|&|\bama\b)\s*/).map(w => w.trim()).filter(Boolean);
  if (names.length < 2 || names.some(n => USER.test(n) || !nameLike(n, ctx))) return null;
  const amount = findAmounts(m[4]).find(a => a.marked || a.value >= 1000); if (!amount) return null;
  const rest = (m[4].slice(0, amount.index) + m[4].slice(amount.index + amount.text.length)).replace(/\b(masing-masing|tiap orang|per orang|total|semuanya)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const quant = m[2] || m[4].match(/\b(masing-masing|tiap orang|per orang|total|semuanya)\b/)?.[1] || '';
  const each = /^(masing-masing|tiap orang|per orang)$/.test(quant), explicitTotal = /^(total|semuanya|berdua|bertiga|berempat)$/.test(quant);
  const people = names.map(n => title(n));
  let shares: number[], note: string;
  if (each) { shares = people.map(() => amount.value); note = `“${quant}” berarti tiap orang ${rupiah(amount.value)}`; }
  else {
    const split = computeSplit({ total: amount.value, method: 'equal', participants: people.map((name, i) => ({ id: `p${i}`, name })), items: [], extras: [] });
    shares = people.map((_, i) => split.shares[`p${i}`] || 0);
    note = `${explicitTotal ? 'Total' : 'Nominalnya'} ${rupiah(amount.value)} untuk ${people.join(' dan ')}: dibagi rata ${shares.map(rupiah).join(' + ')}? Ubah kalau tidak rata.`;
  }
  return { names: people, each, explicitTotal, verb: m[3], amount: amount.value, amountText: amount.text, rest, shares, note };
}

export type SplitReading = { total: number; participants: { id: string; name: string; isMe?: boolean }[]; shares: Record<string, number>; strong: boolean; why: string; words: string[] };

/**
 * A spending shared by named people. `strong` = the words say it is divided ("bagi rata", "bertiga", "patungan"); without
 * them it is only offered. The user is in it when "gue/aku" is named or the count says one more than the names.
 */
export function readSplit(text: string, total: number, ctx: QuickContext, skip: string[] = []): SplitReading | null {
  if (!total) return null;
  const strongWord = text.match(/\b(bagi rata|dibagi rata|patungan|split bill|split|bagi\s+(?:dua|tiga|empat|lima|\d)|dibagi\s+(?:dua|tiga|empat|lima|\d)|berdua|bertiga|berempat|berlima|berenam)\b/)?.[1] || '';
  // Every list after a joining word; the one naming the most people wins ("patungan pizza 120k berempat aku budi aldi nisa").
  const skipSet = new Set(skip.map(w => w.toLocaleLowerCase('id-ID')));
  const lists = [...text.matchAll(/\b(?:buat|untuk|utk|sama|bareng|bersama|bagi rata|bertiga|berempat|berdua|berlima|patungan)\b\s+((?:(?:aku|gue|gw|saya|\p{L}+)(?:\s*,\s*|\s+dan\s+|\s+sama\s+|\s+)?){2,6})/gu)].map(m => {
    const words = m[1].split(/[\s,]+|\bdan\b|\bsama\b/).map(w => w.trim()).filter(Boolean);
    return { words, names: [...new Set(words.filter(w => !USER.test(w) && nameLike(w, ctx) && !skipSet.has(w) && !COUNT[w]))] };
  }).sort((a, b) => b.names.length - a.names.length);
  if (!lists.length && !strongWord) return null;
  const words = lists[0]?.words || [], names = lists[0]?.names || [];
  if (!names.length) return null;
  const count = COUNT[strongWord.split(/\s+/).pop() || ''] || 0;
  const me = words.some(w => USER.test(w)) || /^(?:aku|gue|gw|saya)\s+(?:bayar|bayarin|traktir)/.test(text) || count === names.length + 1;
  if (count && count !== names.length + (me ? 1 : 0)) return null;
  const participants: SplitReading['participants'] = [...(me ? [{ id: 'me', name: 'Kamu', isMe: true }] : []), ...names.map((n, i) => ({ id: `p${i + 1}`, name: title(n) }))];
  if (participants.length < 2) return null;
  const split = computeSplit({ total, method: 'equal', participants, items: [], extras: [] });
  const why = strongWord ? `Bagi rata dipilih karena kamu menulis “${strongWord}” dan menyebut ${participants.map(p => p.isMe ? 'kamu' : p.name).join(', ').replace(/, ([^,]*)$/, ', dan $1')}.` : `${participants.map(p => p.isMe ? 'Kamu' : p.name).join(', ')} disebut bersama, tapi tidak ada kata “bagi rata”; pembagian hanya ditawarkan.`;
  return { total, participants, shares: split.shares, strong: Boolean(strongWord), why, words: [strongWord, ...words].filter(Boolean) };
}
