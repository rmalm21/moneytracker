/**
 * Catat otomatis V3.4 — Kamus Pribadi (personal language memory).
 *
 * Learns the WORDS this person uses for places, people, wallets and short forms. It never learns money: no amount,
 * date, time, wallet habit, debt direction or transfer direction is ever taken from memory.
 *
 *   raw text → cold reading (general engine, untouched)
 *            → personal candidates (aliases in the text, a pronoun from the short session)
 *            → the same general engine reads the text again with the canonical words (it validates; memory decides nothing)
 *            → personal Bug Catcher: the warm reading may not change any high-risk field of the cold one
 *              (amount, date, time, explicit wallet, debt or transfer direction) — otherwise memory is dropped
 *            → preview ("Kenapa?" says which word came from the Kamus Pribadi).
 *
 * Memory is evidence, not truth: the current sentence always wins, an alias whose word is a configured wallet or a
 * money word is never used, two meanings for one word are asked, and every alias can be edited, disabled or removed.
 * Aliases live in the user's own profile document (Firestore, per uid) and are never sent anywhere else.
 */
import { findAmounts, isHonorific, knownPlaces, readDate, walletsIn, type QuickContext, type QuickGroup, type QuickKind } from '../quick-entry.ts';
import { generalSpelling, parseQuickPlan, type ActionCandidate, type QuickParseResult } from '../quick-plan.ts';

export type AliasType = 'merchant' | 'person' | 'place' | 'wallet' | 'category' | 'purpose' | 'abbr';
/** candidate: seen once, not used yet · provisional: used, marked "kemungkinan benar" · learned: used as read · disabled: never used. */
export type AliasStatus = 'candidate' | 'provisional' | 'learned' | 'disabled';
export type AliasSource = 'explicit' | 'correction' | 'choice';
export type PersonalAlias = {
  id: string;
  /** The word(s) as the person wrote them ("Besto"). */
  alias: string;
  /** Normalized lookup key ("besto"). */
  key: string;
  type: AliasType;
  /** What the word means, as shown ("D'Besto"). For a wallet / category / contact the current name of `targetId` wins. */
  label: string;
  /** Stable id of the entity: wallet id, category id, or "sp:<contact id>" for a Split Bill contact. */
  targetId?: string;
  status: AliasStatus;
  /** Weighted evidence: a save that kept the reading counts 0.5, a correction or a pick from a question counts 1. */
  confirm: number;
  correct: number;
  reject: number;
  source: AliasSource;
  /** Set when the person turned it off by hand (kept until turned on again). */
  off?: boolean;
  created: number;
  updated: number;
  used?: number;
};
export type PersonalLexicon = { on?: boolean; aliases?: Record<string, PersonalAlias> };

export const TYPE_LABEL: Record<AliasType, string> = { merchant: 'Tempat belanja', person: 'Orang', place: 'Tempat', wallet: 'Dompet', category: 'Kategori', purpose: 'Keperluan', abbr: 'Singkatan' };
export const STATUS_LABEL: Record<AliasStatus, string> = { candidate: 'Baru sekali', provisional: 'Kemungkinan benar', learned: 'Dikenali', disabled: 'Nonaktif' };

/** Evidence needed (see bench/quick/REPORT-v34.md): an explicit "ingat …" is learned at once; corrections add up. */
export const THRESHOLDS = { provisional: 2, learned: 4, explicitBase: 4, rejectWeight: 1.5, candidateDays: 60, provisionalDays: 180, maxAliases: 400 } as const;

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
export const aliasKey = (s: string) => lower(s.normalize('NFKD').replace(/[̀-ͯ]/g, '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const compact = (s: string) => aliasKey(s).replace(/\s+/g, '');
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleCase = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toLocaleUpperCase('id-ID'));
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
/** Safe as a Firestore field name (no dots or slashes). */
export const aliasId = (type: AliasType, key: string, target: string) => `${type}_${hash(`${key}\u0000${aliasKey(target)}`)}`;

/**
 * Words that carry money, time, direction or grammar: never an alias, whatever the person teaches. A memory may not
 * change what "20k", "jam 7", "ke", "bayar" or "ngutang" mean.
 */
const PROTECTED = new Set(('k rb ribu rebu jt juta m perak rp rupiah ' +
  'jam jm pukul pkl tgl tanggal kemarin kemaren kmrn kmren besok bsk lusa hari ini itu tadi td barusan pagi siang sore malam minggu bulan tahun senin selasa rabu kamis jumat sabtu ' +
  'ke dari di pake pakai pakek via dan terus trs lalu sama ama buat untuk utk dengan dgn atau ya yg yang ' +
  'bayar byr ngutang utang hutang pinjam minjem minjemin pinjem pinjemin transfer tf topup top up lunas lunasin cicil nyicil beli jual terima dapat dapet gaji balikin kasih ' +
  'diskon disc fee admin ongkir cashback potongan total sisanya sisa bonus lembur tip ' +
  'aku saya gue gw ane dia doi kamu lu lo beliau orangnya ' +
  'ga gak nggak enggak tidak bukan batal jadi eh ralat ubah ganti hapus edit koreksi tanya berapa').split(/\s+/));
const PRONOUN = /(^|[^\p{L}])(dia|doi|orangnya|beliau)(?![\p{L}])/u;
export const PLACE_WORDS = /^(kantor|kantor (lama|baru|pusat|cabang)|rumah|rumah (ortu|mama|papa|nenek|mertua)|kos|kost|kosan|kampus|sekolah|bedeng|basecamp|gudang|toko|warung|pasar|gereja|masjid|musala|mushola|gym|apartemen|apart)$/;
const ABBR_PEOPLE = /^(kak|kk|bang|bg|mas|mba|mbak|pak|bu|bunda|om|tante|teh|aa|a|cik|ko|koh|ci)$/;

/** Why a word cannot be an alias of that type, or null when it can. */
export function aliasProblem(raw: string, type: AliasType, ctx: Pick<QuickContext, 'wallets'>): string | null {
  const key = aliasKey(raw);
  if (key.length < 2) return 'Kata terlalu pendek.';
  if (key.split(' ').length > 4) return 'Paling banyak 4 kata.';
  if (/^\d/.test(key) || findAmounts(key).some(a => a.text.trim().length >= key.length - 1)) return 'Angka atau nominal tidak bisa dijadikan alias.';
  // Common shorthand belongs to the general language layer: "mkn" is "makan" for everyone, without memory.
  // (Only as a short form: "jg" may still be someone's name for the wallet Jago — that one is personal.)
  const general = type === 'abbr' && !key.includes(' ') ? generalSpelling(key) : undefined;
  if (general) return `“${raw}” sudah dikenali sebagai “${general}” tanpa Kamus Pribadi.`;
  if (key.split(' ').every(w => PROTECTED.has(w))) return `“${raw}” punya arti tetap (nominal, waktu, arah, atau kata kerja), jadi tidak bisa diubah artinya.`;
  if (type !== 'wallet' && walletsIn(key, ctx.wallets).some(w => aliasKey(w.name) === key)) return `“${raw}” adalah nama dompet. Nama dompet selalu dibaca sebagai dompet.`;
  return null;
}

/** Recomputes the status from the evidence (a manual "off" always stays off). */
export function withStatus(a: PersonalAlias): PersonalAlias {
  if (a.off) return { ...a, status: 'disabled' };
  const base = a.source === 'explicit' ? THRESHOLDS.explicitBase : 0;
  if (a.reject >= 2 && a.reject >= a.correct + a.confirm + (base ? 1 : 0)) return { ...a, status: 'disabled' };
  const score = base + a.correct + a.confirm - THRESHOLDS.rejectWeight * a.reject;
  const status: AliasStatus = score >= THRESHOLDS.learned ? 'learned' : score >= THRESHOLDS.provisional ? 'provisional' : 'candidate';
  // A wallet alias is high risk: it needs to be learned (explicit, or four confirmations) before it is used at all.
  return { ...a, status: a.type === 'wallet' && status === 'provisional' ? 'candidate' : status };
}

/** Old weak memories fade; an explicit or well-confirmed alias never disappears by itself. */
export function decay(lex: PersonalLexicon, nowMs: number): Record<string, PersonalAlias | null> {
  const out: Record<string, PersonalAlias | null> = {};
  for (const a of Object.values(lex.aliases || {})) {
    const idle = (nowMs - (a.used || a.updated)) / 86_400_000;
    if (a.status === 'candidate' && a.source !== 'explicit' && idle > THRESHOLDS.candidateDays) out[a.id] = null;
    else if (a.status === 'provisional' && a.source !== 'explicit' && idle > THRESHOLDS.provisionalDays) out[a.id] = withStatus({ ...a, confirm: Math.max(0, a.confirm - 1), updated: nowMs });
  }
  return out;
}

export type Contact = { id: string; name: string };
type Compiled = { on: boolean; byKey: Map<string, PersonalAlias[]>; keys: string[]; typoKeys: string[]; orphans: PersonalAlias[] };
let memo: { lex?: PersonalLexicon; wallets?: unknown; categories?: unknown; contacts?: unknown; value?: Compiled } = {};

/** The current name of an alias' entity (a renamed wallet, category or contact keeps its aliases). */
export function labelOf(a: PersonalAlias, ctx: Pick<QuickContext, 'wallets' | 'categories'>, contacts: Contact[] = []): string | null {
  if (a.type === 'wallet') { const w = ctx.wallets.find(x => x.id === a.targetId && !x.isArchived); return w ? w.name : null; }
  if (a.type === 'category' && a.targetId) { const c = ctx.categories.find(x => x.id === a.targetId && !x.isArchived); return c ? c.name : null; }
  if (a.type === 'person' && a.targetId?.startsWith('sp:')) { const p = contacts.find(x => `sp:${x.id}` === a.targetId); return p ? p.name : null; }
  return a.label;
}

/** Active aliases by key, built once per lexicon / wallets / categories / contacts (no history scan, ever). */
export function compile(lex: PersonalLexicon | undefined, ctx: Pick<QuickContext, 'wallets' | 'categories'>, contacts: Contact[] = []): Compiled {
  if (memo.value && memo.lex === lex && memo.wallets === ctx.wallets && memo.categories === ctx.categories && memo.contacts === contacts) return memo.value;
  const byKey = new Map<string, PersonalAlias[]>(), orphans: PersonalAlias[] = [];
  const on = Boolean(lex) && lex!.on !== false;
  if (on) for (const raw of Object.values(lex!.aliases || {})) {
    const a = withStatus(raw);
    if (a.status !== 'provisional' && a.status !== 'learned') continue;
    const label = labelOf(a, ctx, contacts);
    if (!label) { orphans.push(a); continue; }
    if (aliasProblem(a.key, a.type, ctx)) continue;
    const list = byKey.get(a.key) || [];
    list.push({ ...a, label });
    byKey.set(a.key, list);
  }
  const keys = [...byKey.keys()].sort((x, y) => y.split(' ').length - x.split(' ').length || y.length - x.length);
  const typoKeys = keys.filter(k => !k.includes(' ') && k.length >= 5 && byKey.get(k)!.every(a => a.status === 'learned' && a.type !== 'wallet' && a.type !== 'person'));
  const value = { on, byKey, keys, typoKeys, orphans };
  memo = { lex, wallets: ctx.wallets, categories: ctx.categories, contacts, value };
  return value;
}

function oneEdit(a: string, b: string) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export type PersonalSpan = { aliasId: string; raw: string; label: string; type: AliasType; start: number; end: number; status: AliasStatus; how: 'exact' | 'typo' | 'session' | 'override' | 'choice' };
export type PersonalAsk = { raw: string; question: string; choices: { id: string; label: string; type: AliasType }[]; kind: 'alias' | 'pronoun' };
export type PersonalCheck = { code: string; detail: string };
export type SessionView = { people: string[]; txIds: string[]; relation?: { kind: 'receivable' | 'debt'; id?: string; person: string }; ageMs: number };
export type PersonalInput = {
  lexicon?: PersonalLexicon;
  contacts?: Contact[];
  /** The short conversation memory (lib/catat/session.ts), already checked for expiry. */
  session?: SessionView;
  /** Answers to the personal questions of this sentence: lowercase raw word → alias id (or "none"). */
  choose?: Record<string, string>;
};
export type PersonalInfo = {
  used: PersonalSpan[];
  asks: PersonalAsk[];
  rejected: PersonalCheck[];
  /** "besto maksud gue Best Meat" said in this sentence: this reading only, and evidence against the old meaning. */
  overrides: { raw: string; label: string; type: AliasType }[];
  trace: string[];
  coldMs: number;
  warmMs: number;
};
export type PersonalPlan = QuickParseResult & { personal?: PersonalInfo };
export type PersonalAction = ActionCandidate & { personal?: PersonalSpan[] };

const OVERRIDE = /(?:^|[,;.]\s*|\s)(?:eh\s+)?((?:\p{L}[\p{L}\p{N}'.-]*)(?:\s+\p{L}[\p{L}\p{N}'.-]*){0,2})\s+maksud(?:nya|ku)?(?:\s+(?:gue|gw|aku|saya|ane))?\s+([^,;.]+?)\s*(?=$|[,;.])/iu;

/** The type a taught or corrected meaning most likely has (the person can change it before saving). */
export function guessType(raw: string, label: string, ctx: QuickContext, contacts: Contact[] = []): { type: AliasType; targetId?: string } {
  const l = aliasKey(label), r = aliasKey(raw);
  const wallet = ctx.wallets.find(w => !w.isArchived && aliasKey(w.name) === l);
  if (wallet) return { type: 'wallet', targetId: wallet.id };
  const contact = contacts.find(c => aliasKey(c.name) === l);
  if (contact) return { type: 'person', targetId: `sp:${contact.id}` };
  const people = new Set([...(ctx.receivables || []).map(x => aliasKey(x.person)), ...(ctx.debts || []).map(d => aliasKey(d.provider || '')), ...(ctx.people || []).map(aliasKey)].filter(Boolean));
  if (people.has(l)) return { type: 'person' };
  const category = ctx.categories.find(c => !c.isArchived && aliasKey(c.name) === l);
  if (category) return { type: 'category', targetId: category.id };
  if (PLACE_WORDS.test(l)) return { type: 'place' };
  if (!/\s/.test(r) && label === lower(label) && isAbbreviation(r, l.replace(/\s+/g, ''))) return { type: 'abbr' };
  if (knownPlaces(ctx).has(l)) return { type: 'merchant' };
  if (ABBR_PEOPLE.test(r.split(' ')[0]) || isHonorific(r.split(' ')[0])) return { type: 'person' };
  return { type: 'merchant' };
}
/** "mkn" for "makan", "prkr" for "parkir": same first letter, the letters in order, clearly shorter. */
export function isAbbreviation(short: string, full: string) {
  if (!short || !full || short[0] !== full[0] || short.length >= full.length || short.length < 2) return false;
  let i = 0; for (const ch of full) if (ch === short[i]) i++;
  return i === short.length;
}

/** "ingat besto itu D'Besto", "piot itu B1 Piot", "kntor itu kantor": a sentence that teaches a word, or null. */
export function readTeach(text: string, ctx: QuickContext, contacts: Contact[] = []): { raw: string; label: string; type: AliasType; targetId?: string; explicitCue: boolean; problem: string | null } | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || /\d{2,}|\d\s*(k|rb|ribu|jt|juta)\b/i.test(t)) return null;
  const cue = t.match(/^(?:tolong\s+)?(?:ingat|inget|ingetin|ingatkan|simpan|catat)(?:\s+(?:ya|yah|bahwa|kalau|kalo|aja))?\s+(.+?)\s+(?:itu|=|adalah|artinya|maksudnya|sama dengan|tuh)\s+(.+)$/i);
  const bare = !cue && t.match(/^(.+?)\s+(?:itu|=|artinya|maksudnya|maksud\s+(?:gue|gw|aku|saya))\s+(.+)$/i);
  const m = cue || bare;
  if (!m) return null;
  const raw = m[1].replace(/^["“']|["”']$/g, '').trim(), label = m[2].replace(/^["“']|["”']$/g, '').replace(/[.!]+$/, '').trim();
  if (!raw || !label || raw.split(' ').length > 4 || label.split(' ').length > 5 || aliasKey(raw) === aliasKey(label)) return null;
  // Without "ingat …", only when the meaning looks like a name the person means: written with a capital, a known
  // entity, a place word, or the long form of a short word. "kopi itu enak" teaches nothing.
  const g = guessType(raw, label, ctx, contacts);
  if (!cue && !(/\p{Lu}|'|\d/u.test(label) || g.targetId || g.type === 'place' || g.type === 'abbr' || g.type === 'person' && /\p{Lu}/u.test(label))) return null;
  return { raw, label: g.type === 'abbr' || g.type === 'place' && label === lower(label) ? (g.type === 'place' ? titleCase(label) : label) : label, ...g, explicitCue: Boolean(cue), problem: aliasProblem(raw, g.type, ctx) };
}

/** Aliases (and the short session's "dia") found in a sentence, with the questions when a word has two meanings. */
export function findPersonal(text: string, ctx: QuickContext, p: PersonalInput, coldPeople: string[]) {
  const compiled = compile(p.lexicon, ctx, p.contacts);
  const low = lower(text), spans: PersonalSpan[] = [], asks: PersonalAsk[] = [], trace: string[] = [];
  const blocked: [number, number][] = [];
  for (const a of findAmounts(text)) blocked.push([a.index, a.index + a.text.length]);
  for (const w of ctx.wallets) { const m = low.match(new RegExp(`(^|[^\\p{L}\\p{N}])(${esc(lower(w.name))})(?![\\p{L}\\p{N}])`, 'u')); if (m && m.index !== undefined) blocked.push([m.index + m[1].length, m.index + m[1].length + m[2].length]); }
  const free = (s: number, e: number) => !blocked.some(([a, b]) => s < b && a < e) && !spans.some(x => s < x.end && x.start < e);
  if (compiled.on) {
    // Only keys whose first word is in the sentence are tried: one cheap set lookup per alias, no scan per keystroke.
    const words = new Set(low.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    for (const key of compiled.keys) {
      if (!words.has(key.split(' ')[0])) continue;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${key.split(' ').map(esc).join('[\\s\'.-]*')})(?![\\p{L}\\p{N}])`, 'gu');
      for (const m of low.matchAll(re)) {
        const start = (m.index || 0) + m[1].length, end = start + m[2].length;
        if (!free(start, end)) continue;
        const raw = text.slice(start, end);
        const list = compiled.byKey.get(key)!;
        const distinct = [...new Map(list.map(a => [`${a.type}|${aliasKey(a.label)}`, a])).values()];
        const chosen = p.choose?.[key];
        if (chosen === 'none') { trace.push(`“${raw}”: kamu memilih tidak memakai Kamus Pribadi`); blocked.push([start, end]); continue; }
        const pick = chosen ? distinct.find(a => a.id === chosen) : distinct.length === 1 ? distinct[0] : undefined;
        if (!pick) {
          asks.push({ raw, kind: 'alias', question: `“${raw}” maksudnya ${distinct.map(a => a.label).join(' atau ')}?`, choices: distinct.map(a => ({ id: a.id, label: a.label, type: a.type })) });
          trace.push(`“${raw}”: ${distinct.length} arti di Kamus Pribadi (${distinct.map(a => a.label).join(', ')}) — ditanya`);
          blocked.push([start, end]);
          continue;
        }
        spans.push({ aliasId: pick.id, raw, label: pick.label, type: pick.type, start, end, status: pick.status, how: chosen ? 'choice' : 'exact' });
      }
    }
    // One typo around a well-learned alias ("bestoo"), never across a word the engine already knows.
    if (compiled.typoKeys.length) {
      const places = knownPlaces(ctx);
      for (const m of low.matchAll(/\p{L}[\p{L}\p{N}]{4,}/gu)) {
        const start = m.index || 0, end = start + m[0].length, word = m[0];
        if (!free(start, end) || PROTECTED.has(word) || places.has(word) || compiled.byKey.has(word) || walletsIn(word, ctx.wallets).length) continue;
        const key = compiled.typoKeys.find(k => oneEdit(word, k));
        if (!key) continue;
        const list = compiled.byKey.get(key)!;
        if (list.length !== 1) continue;
        const a = list[0];
        spans.push({ aliasId: a.id, raw: text.slice(start, end), label: a.label, type: a.type, start, end, status: 'provisional', how: 'typo' });
        trace.push(`“${word}” mirip “${key}” (satu huruf beda) → ${a.label}, ditandai kemungkinan benar`);
      }
    }
  }
  // "dia bayar 5k" right after "atuy ngutang 20k": the one person of the short session; two people → asked.
  const pron = low.match(PRONOUN);
  if (pron && pron.index !== undefined && !coldPeople.length && !spans.some(s => s.type === 'person') && p.session?.people.length) {
    const start = pron.index + pron[1].length, end = start + pron[2].length, raw = text.slice(start, end), key = lower(raw);
    const people = p.session.people;
    const chosen = p.choose?.[key];
    if (chosen && chosen !== 'none' && people.includes(chosen)) spans.push({ aliasId: 'session', raw, label: chosen, type: 'person', start, end, status: 'learned', how: 'choice' });
    else if (!chosen && people.length === 1) { spans.push({ aliasId: 'session', raw, label: people[0], type: 'person', start, end, status: 'learned', how: 'session' }); trace.push(`“${raw}” → ${people[0]} (satu-satunya orang yang baru dicatat, ${Math.round(p.session.ageMs / 60000)} menit lalu)`); }
    else if (!chosen && people.length > 1) { asks.push({ raw, kind: 'pronoun', question: `“${raw}” maksudnya ${people.join(' atau ')}?`, choices: people.map(name => ({ id: name, label: name, type: 'person' as const })) }); trace.push(`“${raw}”: baru saja ada ${people.join(' dan ')} — ditanya`); }
  }
  return { spans: spans.sort((a, b) => a.start - b.start), asks, trace, orphans: compiled.orphans };
}

const PAYMENT = new Set<QuickKind>(['receivable_payment', 'debt_payment', 'claim_payment']);
const DIRECTION_PAIRS: [QuickKind, QuickKind][] = [['debt_new', 'receivable_new'], ['debt_payment', 'receivable_payment']];

/**
 * Personal Bug Catcher: what memory may not change. The warm reading is compared with the cold one action by action;
 * a change of amount, date, time, explicit wallet, destination, debt or transfer direction rejects the memory.
 */
export function checkPersonal(cold: QuickParseResult, warm: QuickParseResult, spans: PersonalSpan[], text = ''): PersonalCheck[] {
  const out: PersonalCheck[] = [];
  // Nothing read without memory: there is no cold value memory could change, but every amount must still be written.
  if (!cold.actions.length && warm.actions.length && text) {
    const written = findAmounts(text).map(a => a.value);
    return warm.actions.filter(a => a.result.amount && !written.some(v => v === a.result.amount || v * 1000 === a.result.amount)).map(a => ({ code: 'PERSONALIZATION_CHANGED_AMOUNT', detail: `Rp${a.result.amount} tidak tertulis di kalimat` }));
  }
  if (cold.actions.length !== warm.actions.length) return [{ code: 'PERSONALIZATION_CHANGED_STRUCTURE', detail: `${cold.actions.length} → ${warm.actions.length} aksi` }];
  const walletSpan = spans.some(s => s.type === 'wallet'), personSpan = spans.some(s => s.type === 'person');
  cold.actions.forEach((c, i) => {
    const w = warm.actions[i], cr = c.result, wr = w.result;
    if ((cr.amount || 0) !== (wr.amount || 0)) out.push({ code: 'PERSONALIZATION_CHANGED_AMOUNT', detail: `${cr.amount} → ${wr.amount}` });
    if (cr.date !== wr.date) out.push({ code: 'PERSONALIZATION_CHANGED_DATE', detail: `${cr.date} → ${wr.date}` });
    if ((cr.preset.time || '') !== (wr.preset.time || '')) out.push({ code: 'PERSONALIZATION_CHANGED_TIME', detail: `${cr.preset.time || '-'} → ${wr.preset.time || '-'}` });
    if (cr.kind !== wr.kind) {
      if (DIRECTION_PAIRS.some(([a, b]) => cr.kind === a && wr.kind === b || cr.kind === b && wr.kind === a)) out.push({ code: 'PERSONALIZATION_CHANGED_DEBT_DIRECTION', detail: `${cr.kind} → ${wr.kind}` });
      // A person recognised only through memory may turn "kak tio bayar 5k" into the payment of Muhammad Tio's open
      // receivable — the general engine decided it from the record; any other change of kind is memory's doing.
      else if (!(personSpan && cr.kind === 'expense' && PAYMENT.has(wr.kind) && (wr.preset.receivableId || wr.preset.debtId || wr.operation?.target))) out.push({ code: 'PERSONALIZATION_CHANGED_KIND', detail: `${cr.kind} → ${wr.kind}` });
    }
    const cw = cr.preset.walletId || '', ww = wr.preset.walletId || '';
    if (cw !== ww) {
      if (c.fields.wallet?.status === 'verified' && cw) out.push({ code: 'PERSONALIZATION_CHANGED_EXPLICIT_WALLET', detail: `${cw} → ${ww}` });
      else if (!walletSpan && !(personSpan && PAYMENT.has(wr.kind))) out.push({ code: 'KNOWN_WALLET_OVERRIDDEN_BY_MEMORY', detail: `${cw || '-'} → ${ww || '-'}` });
    }
    const cd = cr.preset.destinationWalletId || '', wd = wr.preset.destinationWalletId || '';
    if (cr.kind === 'transfer' && wr.kind === 'transfer' && cw && cd && cw === wd && cd === ww) out.push({ code: 'PERSONALIZATION_CHANGED_TRANSFER_DIRECTION', detail: `${cw}→${cd} jadi ${ww}→${wd}` });
    else if (cd !== wd && c.fields.to?.status === 'verified' && cd) out.push({ code: 'PERSONALIZATION_CHANGED_EXPLICIT_WALLET', detail: `tujuan ${cd} → ${wd}` });
    // A word the cold reading took as a person, turned into a place by memory (or the reverse).
    for (const s of spans) {
      const rawKey = aliasKey(s.raw);
      if (s.type !== 'person' && cr.person && aliasKey(cr.person) === rawKey) out.push({ code: 'PERSONAL_MEMORY_WRONG_ENTITY_TYPE', detail: `“${s.raw}” dibaca orang oleh tata bahasa, Kamus Pribadi bilang ${TYPE_LABEL[s.type].toLowerCase()}` });
    }
  });
  return out;
}

function replaceSpans(text: string, spans: PersonalSpan[]) {
  let out = text;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + (s.type === 'abbr' ? lower(s.label) : s.label) + out.slice(s.end);
  return out;
}

/** The Kenapa line of one personal reading: what was mapped and why, nothing about habits. */
export function whyLine(s: PersonalSpan) {
  if (s.how === 'session') return `“${s.raw}” dibaca ${s.label}: orang yang baru saja kamu catat.`;
  if (s.how === 'override') return `“${s.raw}” dibaca ${s.label} karena kamu menulisnya di kalimat ini.`;
  if (s.how === 'choice') return `“${s.raw}” dibaca ${s.label} sesuai pilihanmu.`;
  if (s.how === 'typo') return `“${s.raw}” mirip kata di Kamus Pribadi, jadi dibaca ${s.label}. Periksa kalau keliru.`;
  if (s.type === 'person') return `“${s.raw}” dikenali sebagai ${s.label} dari Kamus Pribadi.`;
  if (s.type === 'abbr') return `“${s.raw}” dibaca “${lower(s.label)}” dari Kamus Pribadi.`;
  return `${s.label} dipilih karena sebelumnya kamu menyimpan “${s.raw}” sebagai ${s.label}.`;
}

type Parse = (input: string, ctx: QuickContext, mode: QuickGroup | QuickKind) => QuickParseResult;

/**
 * Reads a sentence with the Kamus Pribadi and the short session. Returns the warm reading only when the personal Bug
 * Catcher finds nothing; otherwise the cold reading (with the reason in `personal.rejected`).
 */
export function personalize(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind, p: PersonalInput | undefined, parse: Parse = parseQuickPlan): { plan: PersonalPlan; text: string; ctx: QuickContext } {
  const t0 = performance.now();
  const sessionCtx: QuickContext = p?.session?.txIds.length ? { ...ctx, sessionTxIds: p.session.txIds } : ctx;
  const info: PersonalInfo = { used: [], asks: [], rejected: [], overrides: [], trace: [], coldMs: 0, warmMs: 0 };
  // "…, besto maksud gue Best Meat": the meaning said now wins for this sentence; the clause itself is not an entry.
  let text = input;
  const ov = text.match(OVERRIDE);
  const overrideSpans: PersonalSpan[] = [];
  if (ov && ov.index !== undefined && findAmounts(text.replace(ov[0], ' ')).length) {
    const raw = ov[1].trim(), label = ov[2].trim(), g = guessType(raw, label, ctx, p?.contacts);
    if (!aliasProblem(raw, g.type, ctx)) {
      text = (text.slice(0, ov.index) + text.slice(ov.index + ov[0].length)).replace(/\s*[,;]\s*$/, '').trim();
      const m = lower(text).match(new RegExp(`(^|[^\\p{L}\\p{N}])(${aliasKey(raw).split(' ').map(esc).join('\\s+')})(?![\\p{L}\\p{N}])`, 'u'));
      if (m && m.index !== undefined) { const start = m.index + m[1].length; overrideSpans.push({ aliasId: 'override', raw: text.slice(start, start + m[2].length), label, type: g.type, start, end: start + m[2].length, status: 'learned', how: 'override' }); }
      info.overrides.push({ raw, label, type: g.type });
      info.trace.push(`koreksi di kalimat: “${raw}” = ${label} (hanya untuk kalimat ini; arti lama di Kamus Pribadi tidak dipakai)`);
    }
  }
  const cold = parse(text, sessionCtx, mode) as PersonalPlan;
  info.coldMs = performance.now() - t0;
  const enabled = Boolean(p) && (p!.lexicon?.on !== false || p!.session);
  if (!p || !enabled && !overrideSpans.length) return { plan: cold, text, ctx: sessionCtx };
  const coldPeople = cold.actions.map(a => a.result.person).filter((x): x is string => Boolean(x));
  const found = findPersonal(text, sessionCtx, p.lexicon?.on === false ? { ...p, lexicon: undefined } : p, coldPeople);
  const spans = [...overrideSpans, ...found.spans.filter(s => !overrideSpans.some(o => s.start < o.end && o.start < s.end))];
  info.asks = found.asks; info.trace.push(...found.trace);
  for (const o of found.orphans) info.rejected.push({ code: 'ORPHANED_PERSONAL_ALIAS', detail: `“${o.alias}” → ${o.label}: tujuannya sudah tidak ada` });
  let plan = cold, ctx2 = sessionCtx, used = spans;
  if (spans.length) {
    const t1 = performance.now();
    const extraPlaces = spans.filter(s => s.type === 'merchant' || s.type === 'place').map(s => s.label);
    const extraPeople = spans.filter(s => s.type === 'person').map(s => s.label);
    ctx2 = { ...sessionCtx, merchants: [...(sessionCtx.merchants || []), ...extraPlaces], people: [...(sessionCtx.people || []), ...extraPeople] };
    let warm = parse(replaceSpans(text, spans), ctx2, mode) as PersonalPlan;
    let checks = checkPersonal(cold, warm, spans, text);
    // A rejected reading is tried once more without the aliases that are not names of people or places (the riskier
    // ones); if memory still changes a high-risk field, the cold reading stays.
    if (checks.length && spans.some(s => s.type === 'wallet' || s.type === 'abbr' || s.type === 'category' || s.type === 'purpose')) {
      const safer = spans.filter(s => s.type === 'merchant' || s.type === 'place' || s.type === 'person');
      const retry = safer.length ? parse(replaceSpans(text, safer), ctx2, mode) as PersonalPlan : cold;
      const again = safer.length ? checkPersonal(cold, retry, safer, text) : [];
      info.rejected.push(...checks.map(c => ({ ...c, detail: `${c.detail} (dibatalkan: ${spans.filter(s => !safer.includes(s)).map(s => `“${s.raw}”`).join(', ')})` })));
      if (!again.length) { warm = retry; used = safer; checks = []; } else checks = again;
    }
    info.warmMs = performance.now() - t1;
    if (checks.length) {
      info.rejected.push(...checks);
      info.trace.push(`Kamus Pribadi ditolak pemeriksa: ${checks.map(c => c.code).join(', ')} — hasil umum dipakai`);
      plan = cold; used = []; ctx2 = sessionCtx;
    } else plan = warm;
  }
  info.used = used;
  decorate(plan, info, input, text, ctx2, p.session);
  return { plan, text: used.length ? replaceSpans(text, used) : text, ctx: ctx2 };
}


/**
 * Puts the personal readings on a plan read from the personalized text: the Kenapa lines, "kemungkinan benar" for weak
 * memories, the sentence as typed, "sisanya" from the session. Called once per fresh plan.
 */
export function decorate(plan: PersonalPlan, info: PersonalInfo, input: string, text: string, ctx: QuickContext, session?: SessionView) {
  const used = info.used;
  if (used.length) {
    for (const a of plan.actions as PersonalAction[]) {
      const here = used.filter(s => lower(a.text).includes(lower(s.label)) || plan.actions.length === 1);
      if (!here.length) continue;
      a.personal = here;
      for (const s of here) {
        // "besto 13k": the place word was the whole description — it is the place, written as taught.
        const p = a.result.preset;
        if ((s.type === 'merchant' || s.type === 'place') && !p.merchant && p.description && aliasKey(p.description) === aliasKey(s.label)) { p.merchant = s.label; delete p.description; }
        a.evidence.push(whyLine(s));
        const weak = s.status === 'provisional' || s.how === 'typo';
        if (s.type === 'person' && a.fields.person?.status === 'verified' && weak) a.fields.person = { status: 'likely', note: whyLine(s) };
        if (s.type === 'wallet' && a.fields.wallet) a.fields.wallet = { status: weak ? 'likely' : a.fields.wallet.status, note: whyLine(s) };
      }
      // The card shows the sentence as the person wrote it.
      for (const s of here) a.text = a.text.replace(new RegExp(esc(s.type === 'abbr' ? lower(s.label) : s.label), 'i'), s.raw);
    }
    plan.sourceText = input.trim();
  }
  // "sisanya besok" right after a payment: the remaining balance of that record, as a plan (never a guessed amount).
  remainderFromSession(plan, text, ctx, session, info);
  plan.personal = info;
  if (info.trace.length) plan.trace = [...info.trace.map(x => `Kamus Pribadi: ${x}`), ...plan.trace.filter(x => !x.startsWith('Kamus Pribadi: '))];
}

function remainderFromSession(plan: PersonalPlan, text: string, ctx: QuickContext, session: SessionView | undefined, info: PersonalInfo) {
  const m = lower(text).match(/^\s*(?:yang\s+|yg\s+)?sisa(?:nya)?\b\s*(.*)$/);
  if (!m || findAmounts(text).length || plan.actions.some(a => a.result.kind !== 'note_new')) return;
  const rel = session?.relation;
  if (!rel) return;
  const rec = rel.kind === 'receivable' ? (ctx.receivables || []).find(r => r.id === rel.id || !rel.id && aliasKey(r.person) === aliasKey(rel.person) && r.remainingAmount > 0) : (ctx.debts || []).find(d => d.id === rel.id);
  const rest = rec ? ('remainingAmount' in rec ? rec.remainingAmount : (rec as { outstandingAmount: number }).outstandingAmount) : 0;
  if (!rec || rest <= 0) { info.trace.push(`“sisanya”: ${rel.person} tidak punya sisa ${rel.kind === 'receivable' ? 'piutang' : 'utang'} lagi — tidak dibuat rencana`); return; }
  const phrase = m[1].trim(), when = phrase ? readDate(phrase, ctx.today, true) : null;
  const income = rel.kind === 'receivable';
  const title = income ? `Sisa piutang ${rel.person}` : `Sisa utang ke ${rel.person}`;
  const date = when?.date || ctx.today;
  const action: PersonalAction = {
    id: 'a0', clause: 0, text: text.trim(),
    result: { kind: 'plan_new', amount: rest, date, preset: { type: income ? 'income' : 'expense', amount: rest, date }, name: title, understood: [] },
    fields: { kind: { status: 'verified', note: '“sisanya” = sisa catatan yang baru saja kamu catat' }, amount: { status: 'likely', note: `sisa ${income ? 'piutang' : 'utang'} ${rel.person} sekarang` }, date: when?.date ? { status: 'verified', note: `“${phrase}”` } : { status: 'missing', note: 'Kapan sisanya dibayar?' }, name: { status: 'verified' } },
    evidence: [`“sisanya” dibaca sisa ${income ? 'piutang' : 'utang'} ${rel.person} yang baru saja kamu catat (sekarang Rp${rest.toLocaleString('id-ID')}), bukan nominal yang ditebak.`],
    alternatives: [], options: {}, warnings: [], review: !when?.date, confidence: when?.date ? 0.85 : 0.5,
    personal: [{ aliasId: 'session', raw: 'sisanya', label: title, type: 'purpose', start: 0, end: 7, status: 'learned', how: 'session' }],
  };
  plan.actions = [action];
  plan.unresolved = when?.date ? [] : ['Kapan sisanya dibayar?'];
  info.trace.push(`“sisanya” → ${title} Rp${rest} (${rel.kind} ${rec.id}, dari sesi)`);
}

// ——— Learning ———

export type SavedFacts = {
  /** The sentence of the action as typed. */
  text: string;
  kind: QuickKind;
  parsed: { merchant?: string; person?: string; walletId?: string; categoryId?: string };
  saved: { merchant?: string; person?: string; walletId?: string; categoryId?: string };
  used?: PersonalSpan[];
};
const now = () => Date.now();
function bump(lex: PersonalLexicon, changes: Record<string, PersonalAlias | null>, base: Omit<PersonalAlias, 'id' | 'status' | 'confirm' | 'correct' | 'reject' | 'created' | 'updated'>, delta: Partial<Record<'confirm' | 'correct' | 'reject', number>>, at: number) {
  const id = aliasId(base.type, base.key, base.targetId || base.label);
  const old = changes[id] || lex.aliases?.[id];
  const next: PersonalAlias = withStatus({
    ...(old || { ...base, id, status: 'candidate', confirm: 0, correct: 0, reject: 0, created: at }),
    ...(old ? {} : base),
    confirm: (old?.confirm || 0) + (delta.confirm || 0), correct: (old?.correct || 0) + (delta.correct || 0), reject: (old?.reject || 0) + (delta.reject || 0),
    updated: at, ...(delta.confirm || delta.correct ? { used: at } : {}),
  });
  changes[id] = next;
  return next;
}

/** What one saved card teaches (quietly): kept readings are confirmed, changed ones rejected, a corrected name a candidate. */
export function learnFromSave(lex: PersonalLexicon, facts: SavedFacts[], ctx: QuickContext, contacts: Contact[] = [], at = now()): Record<string, PersonalAlias | null> {
  const changes: Record<string, PersonalAlias | null> = {};
  if (lex.on === false) return changes;
  for (const f of facts) {
    // 1. Readings that came from memory: kept → confirmed (weakly), changed → evidence against.
    for (const s of f.used || []) {
      if (s.aliasId === 'session' || s.aliasId === 'override') continue;
      const old = changes[s.aliasId] || lex.aliases?.[s.aliasId];
      if (!old) continue;
      const value = s.type === 'person' ? f.saved.person : s.type === 'wallet' ? f.saved.walletId : s.type === 'category' ? f.saved.categoryId : s.type === 'merchant' || s.type === 'place' ? f.saved.merchant : undefined;
      if (value === undefined) continue;
      const kept = s.type === 'wallet' || s.type === 'category' ? value === old.targetId : aliasKey(value) === aliasKey(s.label);
      changes[s.aliasId] = withStatus({ ...old, ...(kept ? { confirm: old.confirm + (s.how === 'choice' ? 1 : 0.5), used: at } : { reject: old.reject + 1 }), updated: at });
    }
    // 2. A place corrected by hand: the word of the sentence that names it becomes (or strengthens) a candidate.
    const m0 = f.parsed.merchant || '', m1 = (f.saved.merchant || '').trim();
    if (m1 && aliasKey(m1) !== aliasKey(m0)) {
      const raw = wordFor(f.text, m1, m0, ctx);
      if (raw && !aliasProblem(raw, 'merchant', ctx)) bump(lex, changes, { alias: raw, key: aliasKey(raw), type: PLACE_WORDS.test(aliasKey(m1)) ? 'place' : 'merchant', label: m1, source: 'correction' }, { correct: 1 }, at);
    }
    // 3. A person corrected by hand ("Tio" → "Muhammad Tio"), only towards someone the person already has.
    const p0 = f.parsed.person || '', p1 = (f.saved.person || '').trim();
    if (p0 && p1 && aliasKey(p0) !== aliasKey(p1)) {
      const knownPeople = new Set([...(ctx.receivables || []).map(r => aliasKey(r.person)), ...(ctx.debts || []).map(d => aliasKey(d.provider || '')), ...contacts.map(c => aliasKey(c.name))]);
      const contact = contacts.find(c => aliasKey(c.name) === aliasKey(p1));
      const raw = personWord(f.text, p0);
      if (raw && knownPeople.has(aliasKey(p1)) && !aliasProblem(raw, 'person', ctx)) bump(lex, changes, { alias: raw, key: aliasKey(raw), type: 'person', label: p1, ...(contact ? { targetId: `sp:${contact.id}` } : {}), source: 'correction' }, { correct: 1 }, at);
    }
  }
  return changes;
}
/** The word(s) of the sentence a corrected place name was written as ("besto" for D'Besto, "piot" for B1 Piot). */
function wordFor(text: string, label: string, parsed: string, ctx: QuickContext) {
  const target = compact(label);
  if (parsed && compact(parsed) !== target && (target.includes(compact(parsed)) || compact(parsed).includes(target))) return parsed;
  const words = aliasKey(text).split(' ').filter(w => w.length >= 3 && !PROTECTED.has(w) && !/^\d/.test(w) && !walletsIn(w, ctx.wallets).length);
  const hits = words.filter(w => w !== target && (target.includes(w) || w.includes(target)));
  return hits.sort((a, b) => b.length - a.length)[0] || '';
}
/** "kak tio" when the person was read as "Tio" from "kak tio ngutang 20k". */
function personWord(text: string, parsed: string) {
  const key = aliasKey(parsed), words = aliasKey(text).split(' ');
  const at = words.indexOf(key.split(' ')[0]);
  if (at < 0) return '';
  const before = words[at - 1];
  return before && (ABBR_PEOPLE.test(before) || isHonorific(before)) ? `${before} ${key}` : key;
}

/** "Selalu anggap …" / "ingat besto itu D'Besto": an alias the person asked for, learned at once. */
export function teach(lex: PersonalLexicon, raw: string, label: string, type: AliasType, targetId: string | undefined, ctx: QuickContext, at = now()): { changes: Record<string, PersonalAlias | null>; problem: string | null } {
  const problem = aliasProblem(raw, type, ctx);
  if (problem) return { changes: {}, problem };
  const key = aliasKey(raw), changes: Record<string, PersonalAlias | null> = {};
  // Teaching a new meaning for the same word and type retires the old one (it stays in the list, turned off).
  for (const a of Object.values(lex.aliases || {})) if (a.key === key && a.type === type && aliasKey(a.targetId || a.label) !== aliasKey(targetId || label)) changes[a.id] = withStatus({ ...a, off: true, updated: at });
  const id = aliasId(type, key, targetId || label), old = lex.aliases?.[id];
  changes[id] = withStatus({ ...(old || { confirm: 0, correct: 0, reject: 0, created: at }), id, alias: raw.trim(), key, type, label: label.trim(), ...(targetId ? { targetId } : {}), source: 'explicit', status: 'learned', off: false, reject: 0, updated: at, used: old?.used } as PersonalAlias);
  return { changes, problem: null };
}

/** The answer to "Besto maksudnya D'Besto atau Best Meat?" counts for the chosen meaning and against the other. */
export function learnFromChoice(lex: PersonalLexicon, ask: PersonalAsk, chosenId: string, at = now()): Record<string, PersonalAlias | null> {
  const changes: Record<string, PersonalAlias | null> = {};
  if (ask.kind !== 'alias') return changes;
  for (const c of ask.choices) { const a = lex.aliases?.[c.id]; if (a) changes[c.id] = withStatus({ ...a, ...(c.id === chosenId ? { correct: a.correct + 1, used: at } : { reject: a.reject + 0.5 }), updated: at }); }
  return changes;
}

/** Applies changes to a lexicon (for local use and tests; the store writes the same changes per entry). */
export function applyChanges(lex: PersonalLexicon, changes: Record<string, PersonalAlias | null>): PersonalLexicon {
  const aliases = { ...(lex.aliases || {}) };
  for (const [id, a] of Object.entries(changes)) { if (a) aliases[id] = a; else delete aliases[id]; }
  // Bounded: the weakest candidates go first when the dictionary is full.
  const list = Object.values(aliases);
  if (list.length > THRESHOLDS.maxAliases) for (const a of list.filter(x => x.status === 'candidate').sort((x, y) => x.updated - y.updated).slice(0, list.length - THRESHOLDS.maxAliases)) delete aliases[a.id];
  return { ...lex, aliases };
}

/** "besto maksud gue Best Meat" in a saved sentence: evidence against the old meaning, a candidate for the new one. */
export function learnOverrides(lex: PersonalLexicon, overrides: PersonalInfo['overrides'], ctx: QuickContext, at = now()): Record<string, PersonalAlias | null> {
  const changes: Record<string, PersonalAlias | null> = {};
  if (lex.on === false) return changes;
  for (const o of overrides) {
    const key = aliasKey(o.raw);
    for (const a of Object.values(lex.aliases || {})) if (a.key === key && aliasKey(a.label) !== aliasKey(o.label)) changes[a.id] = withStatus({ ...a, reject: a.reject + 1, updated: at });
    if (!aliasProblem(o.raw, o.type, ctx)) bump(lex, changes, { alias: o.raw, key, type: o.type, label: o.label, source: 'correction' }, { correct: 1 }, at);
  }
  return changes;
}
