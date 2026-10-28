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
/** V3.3: the consequences of an action checked before commit (lib/catat/mutation.ts). */
export type MutationBugCode =
  | 'PAYMENT_EXCEEDS_REMAINING_BALANCE' | 'CLAIM_PAYMENT_EXCEEDS_REMAINING' | 'DUPLICATE_MONEY_MOVEMENT' | 'MISSING_RELATIONSHIP_UPDATE'
  | 'WRONG_HISTORICAL_TARGET' | 'AMBIGUOUS_HISTORICAL_TARGET' | 'UPDATE_PARSED_AS_CREATE' | 'DELETE_PARSED_AS_CREATE' | 'QUERY_PARSED_AS_CREATE'
  | 'TRANSFER_FEE_MISAPPLIED' | 'TRANSFER_PRINCIPAL_MISMATCH' | 'TRANSFER_DESTINATION_RECEIVED_FEE' | 'GROSS_NET_MISMATCH' | 'DISCOUNT_DOUBLE_COUNT'
  | 'CASHBACK_PREMATURELY_CREDITED' | 'SPLIT_TOTAL_MISMATCH' | 'PARTIAL_SETTLEMENT_OVERFLOW' | 'PLAN_ACTUAL_DUPLICATE' | 'RECURRING_HISTORY_REWRITE'
  | 'STALE_STATE_MUTATION' | 'UPDATE_COMMAND_CREATED_NEW_TRANSACTION';
export type BugWarning = { code: BugCode | TemporalBugCode | RelationBugCode | MutationBugCode; detail: string; repaired: boolean };
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

/* ---------------------------------------------------------------- V3.1 temporal checks */

export type TemporalBugCode =
  | 'TEMPORAL_SPAN_LEAKED_INTO_DESCRIPTION' | 'TEMPORAL_SPAN_LEAKED_INTO_MERCHANT' | 'TEMPORAL_SPAN_LEAKED_INTO_PERSON'
  | 'MONEY_MISCLASSIFIED_AS_TIME' | 'EXPLICIT_TIME_IGNORED' | 'INVALID_CLOCK_TIME';
export type TemporalWarning = { code: TemporalBugCode; detail: string; repaired: boolean };

/**
 * After the time is resolved: the time and date phrases the text used must live only in the time/date fields, a time
 * needs a time phrase in the words (a bare "12000" is money), and a clock must be a real clock.
 * `phrases` are the time/date source phrases (lower case) found in the clause.
 */
export function catchTemporalBugs(input: { kind: string; description?: string; merchant?: string; person?: string; time?: string }, phrases: string[], hasTimePhrase: boolean, dated: boolean) {
  const parse = { ...input }, warnings: TemporalWarning[] = [];
  const codes = { description: 'TEMPORAL_SPAN_LEAKED_INTO_DESCRIPTION', merchant: 'TEMPORAL_SPAN_LEAKED_INTO_MERCHANT', person: 'TEMPORAL_SPAN_LEAKED_INTO_PERSON' } as const;
  for (const key of ['description', 'merchant', 'person'] as const) {
    const value = parse[key]; if (!value) continue;
    let list = words(value);
    for (const phrase of phrases) {
      const p = words(phrase); if (!p.length) continue;
      for (let i = 0; i + p.length <= list.length; i++) if (list.slice(i, i + p.length).join(' ') === p.join(' ')) {
        warnings.push({ code: codes[key], detail: `“${phrase}” sudah dibaca sebagai waktu, bukan ${key === 'description' ? 'deskripsi' : key === 'merchant' ? 'tempat' : 'orang'}`, repaired: true });
        list = [...list.slice(0, i), ...list.slice(i + p.length)]; i--;
      }
    }
    const rebuilt = titleWords(list, value);
    if (rebuilt !== value) parse[key] = rebuilt || undefined;
  }
  if (parse.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(parse.time)) { warnings.push({ code: 'INVALID_CLOCK_TIME', detail: `jam ${parse.time} tidak ada`, repaired: true }); parse.time = undefined; }
  if (parse.time && !hasTimePhrase) { warnings.push({ code: 'MONEY_MISCLASSIFIED_AS_TIME', detail: 'jam dibaca tanpa kata waktu (angka itu nominal)', repaired: true }); parse.time = undefined; }
  if (!parse.time && hasTimePhrase && dated) warnings.push({ code: 'EXPLICIT_TIME_IGNORED', detail: 'ada jam di kalimat tapi belum terpakai', repaired: false });
  const changed = (['description', 'merchant', 'person', 'time'] as const).some(k => (parse[k] || undefined) !== (input[k] || undefined));
  return { parse, warnings, changed };
}

/* ------------------------------------------------------------------ V3.2 relationships and segmentation */

/**
 *   SUBJECT_DIRECTION_MISMATCH            the subject before the verb is the debtor, but the record goes the other way
 *   DEBT_RECEIVABLE_DIRECTION_MISMATCH    utang read where the words say piutang (or the reverse)
 *   REPAYMENT_AS_NEW_DEBT                 "gue bayar utang ke aldi" read as a new debt
 *   REPAYMENT_AS_NEW_RECEIVABLE           "atuy bayar utang" read as a new receivable (or as paying your own debt)
 *   PERSON_SWALLOWED_BY_PURPOSE           the purpose word became the person ("Ngedate")
 *   PURPOSE_SWALLOWED_BY_PERSON           the person's name became the purpose / description ("Atuy")
 *   USER_SUBJECT_IGNORED                  "gue / aku" read as somebody else, or as the person on the record
 *   THIRD_PERSON_SUBJECT_IGNORED          a name before the verb ignored ("atuy ngutang" read as your debt)
 *   MULTIPLE_FINANCIAL_ANCHORS_IN_ONE_ACTION  one action holds two amounts that each have their own head
 *   LIKELY_UNSPLIT_MULTI_ACTION           the description joins two things bought with two amounts ("Kopi Bensin")
 */
export type RelationBugCode =
  | 'SUBJECT_DIRECTION_MISMATCH' | 'DEBT_RECEIVABLE_DIRECTION_MISMATCH' | 'REPAYMENT_AS_NEW_DEBT' | 'REPAYMENT_AS_NEW_RECEIVABLE'
  | 'PERSON_SWALLOWED_BY_PURPOSE' | 'PURPOSE_SWALLOWED_BY_PERSON' | 'USER_SUBJECT_IGNORED' | 'THIRD_PERSON_SUBJECT_IGNORED'
  | 'MULTIPLE_FINANCIAL_ANCHORS_IN_ONE_ACTION' | 'LIKELY_UNSPLIT_MULTI_ACTION';
export type RelationWarning = { code: RelationBugCode; detail: string; repaired: boolean };
type RelationLike = { kind: string | null; subject: { word: string; party: string; implicit: boolean; pronoun: boolean }; counterparty: string; purpose?: { text: string }; role: { relationshipType: string; verb: string } };
const USER_WORD = /^(aku|saya|ane|gue|gua|gw|ku)$/;
const debtSide = (k: string) => k.startsWith('debt') ? 'debt' : k.startsWith('receivable') ? 'receivable' : '';

/** The grammar's first reading against the relationship the verb roles give; every mismatch is repaired by the relation. */
export function catchRelationBugs(before: { kind: string; person?: string; description?: string }, rel: RelationLike): RelationWarning[] {
  const out: RelationWarning[] = [];
  if (!rel.kind) return out;
  const was = debtSide(before.kind), now = debtSide(rel.kind), person = lower(before.person || ''), desc = lower(before.description || '');
  if (rel.role.relationshipType === 'repayment' && before.kind === 'debt_new') out.push({ code: 'REPAYMENT_AS_NEW_DEBT', detail: `“${rel.role.verb}” membayar utang lama, bukan utang baru`, repaired: true });
  else if (rel.role.relationshipType === 'repayment' && (before.kind === 'receivable_new' || rel.kind === 'receivable_payment' && before.kind === 'debt_payment')) out.push({ code: 'REPAYMENT_AS_NEW_RECEIVABLE', detail: rel.kind === 'receivable_payment' ? `${rel.counterparty || 'dia'} membayar utangnya ke kamu: pembayaran piutang` : 'pembayaran, bukan piutang baru', repaired: true });
  else if (was && now && was !== now) {
    if (!rel.subject.implicit && rel.subject.party !== 'user' && now === 'receivable') out.push({ code: 'THIRD_PERSON_SUBJECT_IGNORED', detail: `${rel.subject.party} muncul sebelum “${rel.role.verb}”: dia yang berutang`, repaired: true });
    else if (!rel.subject.implicit && rel.subject.party === 'user') out.push({ code: 'USER_SUBJECT_IGNORED', detail: `“${rel.subject.word}” = kamu: kamu yang ${now === 'debt' ? 'berutang' : 'meminjamkan'}`, repaired: true });
    else out.push({ code: 'DEBT_RECEIVABLE_DIRECTION_MISMATCH', detail: `arahnya ${now === 'debt' ? 'utang' : 'piutang'}, bukan ${was === 'debt' ? 'utang' : 'piutang'}`, repaired: true });
  } else if (!was && now && before.kind !== rel.kind) out.push({ code: 'SUBJECT_DIRECTION_MISMATCH', detail: `dibaca ${before.kind}, kata kerjanya berarti ${rel.kind}`, repaired: true });
  if (USER_WORD.test(person)) out.push({ code: 'USER_SUBJECT_IGNORED', detail: `“${before.person}” adalah kamu, bukan orang lain`, repaired: true });
  const purpose = lower(rel.purpose?.text || '');
  if (purpose && person && purpose.split(/\s+/).includes(person)) out.push({ code: 'PERSON_SWALLOWED_BY_PURPOSE', detail: `“${before.person}” adalah keperluan, bukan orang`, repaired: true });
  const cp = lower(rel.counterparty);
  if (cp && desc && desc.split(/\s+/).includes(cp)) out.push({ code: 'PURPOSE_SWALLOWED_BY_PERSON', detail: `“${before.description}” memuat nama ${rel.counterparty}; nama orang bukan keperluan`, repaired: true });
  return out;
}

/** An action that still holds two money amounts each with its own head word, or a description that joins two items. */
export function catchSegmentBugs(text: string, description: string | undefined, amounts: number, heads: number): RelationWarning[] {
  const out: RelationWarning[] = [];
  if (amounts >= 2 && heads >= 2) out.push({ code: 'MULTIPLE_FINANCIAL_ANCHORS_IN_ONE_ACTION', detail: `${amounts} nominal dengan kata kerja/barang masing-masing dalam satu aksi`, repaired: false });
  if (amounts >= 2 && words(description).length >= 2 && heads >= 2) out.push({ code: 'LIKELY_UNSPLIT_MULTI_ACTION', detail: `“${description}” mungkin dua transaksi`, repaired: false });
  void text;
  return out;
}
