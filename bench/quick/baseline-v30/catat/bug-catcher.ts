/**
 * Catat otomatis V3 — Financial Semantic Bug Catcher.
 *
 * Runs on every parsed action before it is shown, independently of how the parse was made (grammar, NLP.js evidence,
 * a correction or a reference). It checks the result against the source words, the person's configured entities and
 * a few invariants, and proposes repairs:
 *
 *   KNOWN_WALLET_SWALLOWED_BY_MERCHANT  merchant "B1 Piot Krom" while Krom is a configured wallet → merchant "B1 Piot", wallet Krom
 *   MERCHANT_DUPLICATED_IN_DESCRIPTION  description "Mie Ayam Bedeng" with merchant "Bedeng" → "Mie Ayam"
 *   UNASSIGNED_KNOWN_WALLET             a configured wallet in the text has no role → it becomes the wallet (when free)
 *   AMOUNT_INSIDE_ENTITY                money text inside a merchant or description → taken out
 *   DATE_INSIDE_DESCRIPTION             "Kemarin Beli Susu" → "Susu"
 *   WALLET_AS_PERSON                    the person is a configured wallet → not a person (a transfer target instead)
 *   ROLE_COLLISION                      one word in two roles (merchant and person, description equal to merchant)
 *   ENTITY_FRAGMENTATION                "Susu Family" + merchant "Mart" where "Family Mart" is a known place → merged
 *
 * A repair is only applied when it removes a contradiction; it never invents an amount, a wallet that is not in the
 * text, a person or a direction. Whatever cannot be repaired is reported so the field is marked to check.
 */
import { knownPlaces, walletsIn, type QuickContext } from '../quick-entry.ts';

export type BugCode =
  | 'KNOWN_WALLET_SWALLOWED_BY_MERCHANT' | 'MERCHANT_DUPLICATED_IN_DESCRIPTION' | 'UNASSIGNED_KNOWN_WALLET' | 'AMOUNT_INSIDE_ENTITY'
  | 'DATE_INSIDE_DESCRIPTION' | 'WALLET_AS_PERSON' | 'ROLE_COLLISION' | 'ENTITY_FRAGMENTATION';
export type BugWarning = { code: BugCode; detail: string; repaired: boolean };
export type CheckedParse = { kind: string; description?: string; merchant?: string; walletId?: string; destinationWalletId?: string | null; person?: string };

const SPENDING = new Set(['expense', 'income', 'plan_new', 'recurring_new']);
const WALLET_TAKERS = new Set(['expense', 'income', 'plan_new', 'recurring_new', 'debt_payment', 'receivable_payment', 'claim_new', 'claim_payment', 'target', 'transfer', 'debt_new', 'receivable_new']);
const MONEY = /(?:^|\s)(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:k|rb|ribu|jt|juta)\b|(?:^|\s)rp\.?\s*\d[\d.,]*/gi;
const DATE_WORD = /\b(kemarin|kemaren|kmrn|kmarin|tadi|td|barusan|besok|lusa|hari ini|semalam|kemarin malam)\b/gi;
const LEAD_VERB = /^(?:beli|bayar|jajan|byr)\s+/i;
const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const words = (s?: string) => lower(s || '').split(/\s+/).filter(Boolean);
const titleWords = (list: string[], like: string) => {
  // Keep the casing the parse already had for the words that stay.
  const original = like.split(/\s+/);
  return list.map(w => original.find(o => lower(o) === w) || w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

export function catchBugs(input: CheckedParse, text: string, ctx: QuickContext): { parse: CheckedParse; warnings: BugWarning[]; changed: boolean } {
  const parse: CheckedParse = { ...input };
  const warnings: BugWarning[] = [];
  const places = knownPlaces(ctx);
  const inText = walletsIn(lower(text), ctx.wallets);
  const walletWord = (w: string) => ctx.wallets.find(x => !x.isArchived && (lower(x.name) === w || (lower(x.name).split(/\s+/).includes(w) && w.length >= 3) || (/^(tunai|cash)$/.test(lower(x.name)) && /^(tunai|cash)$/.test(w))));

  // 1. A configured wallet at the edge of the merchant.
  if (parse.merchant && !places.has(lower(parse.merchant))) {
    const list = words(parse.merchant);
    let wallet: ReturnType<typeof walletWord>;
    while (list.length > 1 && (wallet = walletWord(list[list.length - 1]))) {
      const taken = list.pop()!;
      const free = !parse.walletId || parse.walletId === wallet.id;
      warnings.push({ code: 'KNOWN_WALLET_SWALLOWED_BY_MERCHANT', detail: `“${taken}” adalah dompet ${wallet.name}, bukan bagian tempat`, repaired: true });
      if (free && WALLET_TAKERS.has(parse.kind) && parse.kind !== 'transfer') parse.walletId = wallet.id;
    }
    while (list.length > 1 && (wallet = walletWord(list[0]))) { list.shift(); warnings.push({ code: 'KNOWN_WALLET_SWALLOWED_BY_MERCHANT', detail: `“${wallet.name}” di awal tempat adalah dompet`, repaired: true }); if (!parse.walletId && parse.kind !== 'transfer') parse.walletId = wallet.id; }
    const merchant = titleWords(list, parse.merchant);
    if (merchant !== parse.merchant) parse.merchant = merchant;
  }
  // 2. Money inside an entity.
  for (const key of ['merchant', 'description'] as const) {
    const v = parse[key]; if (!v) continue;
    const cleaned = v.replace(MONEY, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned !== v) { warnings.push({ code: 'AMOUNT_INSIDE_ENTITY', detail: `nominal di dalam ${key === 'merchant' ? 'tempat' : 'deskripsi'}`, repaired: true }); parse[key] = cleaned || undefined; }
  }
  // 3. Date words (and the leading verb that came with them) inside the description.
  if (parse.description) {
    const cleaned = parse.description.replace(DATE_WORD, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned !== parse.description) {
      warnings.push({ code: 'DATE_INSIDE_DESCRIPTION', detail: 'kata tanggal di dalam deskripsi', repaired: true });
      parse.description = cleaned.replace(LEAD_VERB, '').trim() || undefined;
    }
  }
  // 4. Fragmented place: the description's last word + the merchant is a known place.
  if (parse.merchant && parse.description) {
    const d = words(parse.description), joined = `${d[d.length - 1]} ${lower(parse.merchant)}`;
    if (d.length > 1 && places.has(joined)) {
      warnings.push({ code: 'ENTITY_FRAGMENTATION', detail: `“${joined}” satu nama tempat`, repaired: true });
      parse.merchant = places.get(joined); parse.description = titleWords(d.slice(0, -1), parse.description);
    }
  }
  // 5. The merchant repeated in the description.
  if (parse.merchant && parse.description) {
    const m = words(parse.merchant), d = words(parse.description);
    const tail = d.length > m.length && d.slice(-m.length).join(' ') === m.join(' '), head = d.length > m.length && d.slice(0, m.length).join(' ') === m.join(' ');
    if (tail || head) {
      warnings.push({ code: 'MERCHANT_DUPLICATED_IN_DESCRIPTION', detail: `“${parse.merchant}” juga ada di deskripsi`, repaired: true });
      parse.description = titleWords(tail ? d.slice(0, -m.length) : d.slice(m.length), parse.description);
    } else if (d.join(' ') === m.join(' ')) warnings.push({ code: 'ROLE_COLLISION', detail: 'deskripsi sama dengan tempat', repaired: false });
  }
  // 6. A configured wallet as the person.
  if (parse.person) {
    const wallet = walletWord(lower(parse.person));
    if (wallet) {
      warnings.push({ code: 'WALLET_AS_PERSON', detail: `${parse.person} adalah dompet terdaftar, bukan orang`, repaired: true });
      parse.person = undefined;
      if (parse.kind === 'transfer' && !parse.destinationWalletId && parse.walletId !== wallet.id) parse.destinationWalletId = wallet.id;
    }
  }
  // 7. One word in two roles: merchant and person.
  if (parse.person && parse.merchant && words(parse.merchant).includes(lower(parse.person))) warnings.push({ code: 'ROLE_COLLISION', detail: `${parse.person} dibaca sebagai orang dan tempat`, repaired: false });
  // 8. A configured wallet in the text with no role at all.
  const used = new Set([parse.walletId, parse.destinationWalletId].filter(Boolean));
  const recordWords = new Set([...(ctx.debts || []).flatMap(d => [d.name, d.provider]), ...(ctx.receivables || []).map(r => r.person), ...(ctx.claims || []).map(c => c.name), ...(ctx.funds || []).map(f => f.name), ...(ctx.wishlist || []).map(w => w.name)].flatMap(n => words(n)));
  const roleless = inText.filter(w => !used.has(w.id) && !recordWords.has(w.word) && !words(parse.merchant).includes(w.word) && !/\b(?:promo|diskon|cashback|tarik|setor|narik|nyetor)\s+$/.test(lower(text).slice(0, w.at)));
  for (const w of roleless) {
    if (!parse.walletId && SPENDING.has(parse.kind)) { parse.walletId = w.id; warnings.push({ code: 'UNASSIGNED_KNOWN_WALLET', detail: `dompet ${w.name} disebut tapi belum dipakai`, repaired: true }); }
    else if (SPENDING.has(parse.kind)) warnings.push({ code: 'UNASSIGNED_KNOWN_WALLET', detail: `dompet ${w.name} juga disebut`, repaired: false });
  }
  const changed = (['description', 'merchant', 'walletId', 'destinationWalletId', 'person'] as const).some(k => (parse[k] || undefined) !== (input[k] || undefined));
  return { parse, warnings, changed };
}
