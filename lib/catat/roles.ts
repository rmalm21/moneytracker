/**
 * 10.3.1 What the pembaca kalimat (lib/catat/tagger.ts) adds after the rules have read a sentence, where the rules go by
 * word lists and a new word slips past them:
 *  - a transfer said without a word the rules know ("mandiri ke bri 14rb", "oper 50rb dari jago ke gopay"): one wallet
 *    money leaves, one it goes to, an amount, nothing bought → written as a sentence the rules read as a transfer;
 *  - slang that ended up in a name ("Celana · Cuy", "Lur Pertalite"): words the tagger is sure are neither a thing, a
 *    place nor a person, at the edge of a name, are taken out of it.
 * Nothing changes before the weights are loaded, and nothing is ever saved without the person tapping Simpan.
 */
import { editDistance, tagTokens, taggerReady, tokens, walletWords, type Tagged, type TaggerModel } from './tagger.ts';

/** The tagger's reading of a sentence, or null when the weights are not loaded yet. */
export function readRoles(text: string, walletNames: string[], model: TaggerModel | null = taggerReady()): Tagged[] | null {
  return model && text.trim() ? tagTokens(model, tokens(text), walletNames) : null;
}

/** "mandiri ke bri 14rb" → "transfer 14rb dari mandiri ke bri"; null when it is not plainly a move between two wallets. */
export function transferSentence(tags: Tagged[], walletNames: string[]): string | null {
  const words = walletWords(walletNames);
  const from = tags.filter(t => t.tag === 'WAL' && words.has(t.low)), to = tags.filter(t => t.tag === 'WTO' && words.has(t.low));
  if (from.length !== 1 || to.length !== 1 || words.get(from[0].low) === words.get(to[0].low)) return null;
  // Something bought, a place or a person: not a plain move between wallets. (An unknown verb the tagger is unsure
  // about, "geser 50rb dari jago ke gopay", does not count as something bought.)
  if (tags.some(t => t.tag === 'PLACE' || t.tag === 'PERSON' || t.tag === 'ITEM' && t.margin >= ITEM_SURE)) return null;
  const amount = tags.filter(t => t.tag === 'AMT');
  if (!amount.length || from[0].wallet < SURE || to[0].wallet < SURE) return null;
  const date = tags.filter(t => t.tag === 'DATE').map(t => t.text).join(' ');
  return `transfer ${amount.map(t => t.text).join(' ')} dari ${from[0].low} ke ${to[0].low}${date ? ` ${date}` : ''}`;
}
const SURE = 10, ITEM_SURE = 25;

/** Words said on purpose in a name ("Beli Kado", "Bayar Listrik"), never taken out. */
const KEEP = new Set(['pake', 'pakai', 'pk', 'via', 'lewat', 'dari', 'dr', 'ke', 'di', 'buat', 'untuk', 'utk', 'sama', 'sm', 'dan', 'terus', 'trus', 'lalu', 'yang', 'yg', 'aja', 'saja', 'beli', 'bayar', 'jajan', 'isi', 'top', 'up', 'pesan', 'pesen', 'order', 'sewa', 'servis', 'cuci', 'ganti', 'potong', 'les', 'iuran', 'makan', 'minum', 'ngopi', 'nonton', 'parkir', 'tiket', 'biaya', 'uang', 'ongkos', 'ongkir', 'tagihan', 'cicilan']);
/** How sure the tagger must be that a word is "anything else" before it leaves a name. */
const JUNK_SURE = 5;
/** After these a word is a place or a person ("di superindo", "dari aldi"), never slang. */
const OBJECT_OF = new Set(['di', 'ke', 'dari', 'dr', 'sama', 'sm', 'buat', 'untuk', 'utk', 'bareng', 'dengan', 'dgn', 'from', 'to', 'at']);
const LEAD = new Set(['pake', 'pakai', 'pk', 'pakek', 'via', 'lewat', 'bayarnya', 'pakenya']);

/** Common slang and chatter (the same words the tagger was trained on as "anything else"): known wherever it sits. */
const SLANG = new Set(['eh', 'btw', 'gue', 'gw', 'wah', 'aduh', 'yah', 'oke', 'ok', 'nah', 'bang', 'kak', 'mas', 'mbak', 'say', 'beb', 'cuk', 'anjir', 'waduh', 'hmm', 'yaudah', 'fyi', 'anyway', 'plis', 'pls', 'lho', 'loh', 'omg', 'sumpah', 'parah', 'gila', 'oalah', 'ih', 'seriusan', 'asik', 'ya', 'yaa', 'dong', 'sip', 'min', 'dah', 'udah', 'siap', 'thanks', 'makasih', 'tq', 'huhu']);
/** Laughter of any length ("wkwk", "hahaha", "xixi", "hehe", "kwkw"). */
const LAUGH = /^(?:(?:wk)+w?|(?:ha)+h?|(?:he)+h?|(?:hi)+h?|(?:xi)+x?|(?:ka)+k?|(?:k)+(?:w|k)+)$/;

/**
 * Lowercased words to take out of a name as slang or chatter. Only where there is something to go on, because a word the
 * app has never seen can be slang or a place ("…75k xxi jago", "…18rb bro pake jago"): the first word with a comma after
 * it ("gan, …"), words after the wallet at the end ("… pake gopay bro"), laughter, and common slang (SLANG) at the start,
 * between the amount and the wallet, or at the end. The tagger must take the word for "anything else" (or for a wallet it
 * is not: "bro" by BRI). Never a word after "di"/"ke"/"dari"/"sama"/"buat", one the person has used in their own
 * records (`known`), or one said on purpose (KEEP).
 */
export function chatterWords(tags: Tagged[], walletNames: string[] = [], known: Set<string> = new Set()): Set<string> {
  const words = walletWords(walletNames);
  let lastWallet = -1, lastAmount = -1;
  tags.forEach((t, i) => { if (words.has(t.low)) lastWallet = i; if (t.tag === 'AMT') lastAmount = i; });
  return new Set(tags.filter((t, i) => {
    if (!/^\p{L}{2,}$/u.test(t.low) || KEEP.has(t.low) || LEAD.has(t.low) || known.has(t.low) || OBJECT_OF.has(tags[i - 1]?.low || '')) return false;
    const looksWallet = (t.tag === 'WAL' || t.tag === 'WTO') && !words.has(t.low) && [...words.keys()].some(w => editDistance(t.low, w) === 1);
    if (t.tag !== 'O' && !looksWallet) return false;
    if (LAUGH.test(t.low)) return true;
    const sure = t.margin >= JUNK_SURE, next = tags[i + 1], prev = tags[i - 1];
    // Right after the wallet, with only chatter between ("… pake gopay bro"); not a place said after a wallet at the start ("gopay 65k ngopi tuku").
    const afterWallet = lastWallet >= 0 && i > lastWallet && i > lastAmount && tags.slice(lastWallet + 1, i).every(x => x.tag === 'O');
    if (i === 0 && t.comma || afterWallet) return sure;
    const edge = i === 0 || i === tags.length - 1 || prev?.tag === 'AMT' && next && (LEAD.has(next.low) || words.has(next.low));
    return edge && SLANG.has(t.low) && sure;
  }).map(t => t.low));
}

/** The sentence without the given words (and a comma right after one): "gan, parkir 33k" → "parkir 33k". */
export function withoutWords(text: string, drop: Set<string>): string {
  return text.replace(/[\p{L}]+,?/gu, w => drop.has(w.replace(/,$/, '').toLocaleLowerCase('id-ID')) ? '' : w).replace(/\s+/g, ' ').trim();
}

/** A name left with nothing said on purpose but the small words around it ("Bayarnya", "Pake", ""): never what slang removal may leave. */
export function onlyFiller(name: string): boolean {
  return !name.toLocaleLowerCase('id-ID').split(/[^\p{L}\p{N}]+/u).some(w => w && !FILLER.has(w) && !LEAD.has(w) && !OBJECT_OF.has(w));
}
const FILLER = new Set(['dan', 'terus', 'trus', 'lalu', 'yang', 'yg', 'aja', 'saja', 'tadi', 'nya']);

/** A name without the chatter at its edges ("Celana · Cuy" → "Celana"); the words in the middle stay. */
export function withoutChatter(name: string, chatter: Set<string>): string {
  if (!name || !chatter.size) return name;
  const parts = name.split(/\s+/);
  while (parts.length && chatter.has(parts[0].toLocaleLowerCase('id-ID').replace(/[^\p{L}]/gu, ''))) parts.shift();
  while (parts.length && chatter.has(parts[parts.length - 1].toLocaleLowerCase('id-ID').replace(/[^\p{L}]/gu, ''))) parts.pop();
  return parts.join(' ');
}
