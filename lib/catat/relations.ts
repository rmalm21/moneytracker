/**
 * Catat otomatis V3.2 — relationships and direction: who owes whom, for what, seen from the person writing.
 *
 *   "atuy ngutang 12k"            → Atuy is the debtor, you the creditor          → piutang Atuy
 *   "gue ngutang 12k ke aldi"     → you are the debtor, Aldi the creditor          → utang ke Aldi
 *   "ngutang 12k ke aldi"         → no subject said: it is you                     → utang ke Aldi
 *   "atuy ngutang 12k ke aldi"    → a debt between two other people                → not yours, nothing recorded
 *   "atuy bayar utang 12k"        → Atuy pays back what Atuy owes you              → pembayaran piutang (income)
 *   "atuy ngutang 12k buat ngedate" → purpose "Ngedate", a field of its own (never the person, never a second action)
 *
 * Each verb has a role model (who acts, who ends up owing, which way the money goes); the words around it fill the
 * roles: the word before the verb is its subject, a word after "ke / sama / dari" or right after a lending verb is the
 * other side. The relationship node is then turned into the user's perspective. Deterministic and local: no text
 * leaves the device. Pure functions over the normalized clause (lib/quick-plan.ts normalizes "gue/gw" to "aku").
 */
import { findAmounts, isHonorific, nameLike, walletsIn, type QuickContext } from '../quick-entry.ts';

export type Party = 'user' | string;
export type VerbClass = 'borrow' | 'lend' | 'passive' | 'repay' | 'repaid' | 'possession';
/** The reusable role model of a verb: who acts, who owes after it, and which way the money moves. */
export type VerbRole = {
  verb: string; class: VerbClass;
  actor: 'subject' | 'agent';
  debtor: 'subject' | 'object' | 'agent' | 'owner';
  creditor: 'subject' | 'object' | 'agent' | 'target';
  /** Money moves to the subject (they receive it) or from the subject (they hand it over). */
  moneyDirection: 'to_subject' | 'from_subject';
  relationshipType: 'loan' | 'repayment';
};
export type RelationshipNode = { debtor: Party; creditor: Party; amount?: number; purpose?: string; date?: string; sourceText: string; confidence: 'verified' | 'likely' | 'check' };
export type RelationReading = {
  /** The user's record: null when the debt is between two other people (third party). */
  kind: 'debt_new' | 'receivable_new' | 'debt_payment' | 'receivable_payment' | null;
  thirdParty: boolean;
  role: VerbRole;
  verbAt: number;
  subject: { word: string; party: Party; implicit: boolean; pronoun: boolean; at: number };
  /** The other person from the user's side (lender, borrower, payer, payee), title case; '' when not said. */
  counterparty: string;
  node: RelationshipNode;
  purpose?: { text: string; marker: string; start: number; end: number };
  /** "atuy ngutang 12k dari jago": a wallet named where a person could stand is where the money came from / went. */
  wallet?: string;
  confidence: 'verified' | 'likely' | 'check';
  /** Plain sentences for "Kenapa?". */
  why: string[];
  trace: string[];
};

const USER = /^(aku|saya|ane|gue|gua|gw|ku|sy)$/;
const PRONOUN = /^(dia|doi|orangnya|beliau|ia|die)$/;
const BORROW_V = /^(ngutang|ngehutang|berutang|berhutang|utang|hutang|pinjam|minjem|pinjem|minjam|meminjam|kasbon|ngebon)$/;
const LEND_V = /^(pinjemin|minjemin|pinjamin|minjamin|meminjamkan|minjemkan|minjamkan|utangin|ngutangin|hutangin|ngehutangin|talangin|nalangin|nalangi|talangi|bayarin|bayari)$/;
const GIVE = /^(kasih|ngasih|kasi|ngasi|ngasi)$/, LOAN_NOUN = /^(pinjem|pinjam|pinjaman|utang|hutang)$/;
const PASSIVE_V = /^(dipinjemin|dipinjamin|dipinjami|diutangin|dihutangin|ditalangin|ditalangi|dibayarin)$/;
const REPAY_STRONG = /^(balikin|ngembaliin|kembaliin|mengembalikan|ngebalikin|lunasin|lunasi|ngelunasin|melunasi|nglunasin)$/;
const REPAY_WEAK = /^(bayar|byr|nyicil|cicil|nyetor|ganti|gantiin|transfer|tf)$/;
const REPAID_V = /^(dibayar|dibalikin|dikembaliin|dikembalikan|dilunasin|dilunasi)$/;
const DEBT_NOUN = /^(utang|hutang|utangnya|hutangnya|pinjaman|pinjamannya|pinjeman|kasbon|kasbonnya)$/;
const PREP = /^(ke|sama|ama|sm|kepada|dari|dr|dengan|dgn|ma|oleh)$/;
const PURPOSE = /^(buat|untuk|utk|bwt|guna|demi|keperluan)$/;
const SKIP_BACK = /^(udah|sudah|udh|dah|uda|tadi|td|barusan|baru|mau|lagi|juga|emang|memang|katanya|akhirnya|kemarin|kemaren|kmrn|si|sih|tuh|nih|yang|yg|lalu|terus|jadi|ternyata|hari|ini|pagi|siang|sore|malam|minggu|kmrin|dulu|lg)$/;
const FILLER_AFTER = /^(dulu|duit|uang|doang|aja|ya|sih|deh|dong|sebesar|senilai|lagi|nih|tuh|si)$/;
const DATE_STOP = /^(kemarin|tadi|barusan|besok|lusa|tgl|tanggal|jam|jm|pukul|pkl|kmrn|kemaren)$/;
const WALLET_CUE = /^(pakai|pake|pk|via|lewat|masuk)$/;

type Tok = { w: string; start: number; end: number };
const tokens = (text: string): Tok[] => [...text.matchAll(/[^\s,.;!?]+/g)].map(m => ({ w: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
const title = (w: string) => w ? w[0].toUpperCase() + w.slice(1) : w;
const show = (p: Party) => p === 'user' ? 'kamu' : p;

const ROLES: Record<VerbClass, Omit<VerbRole, 'verb' | 'class'>> = {
  borrow: { actor: 'subject', debtor: 'subject', creditor: 'target', moneyDirection: 'to_subject', relationshipType: 'loan' },
  lend: { actor: 'subject', debtor: 'object', creditor: 'subject', moneyDirection: 'from_subject', relationshipType: 'loan' },
  passive: { actor: 'agent', debtor: 'subject', creditor: 'agent', moneyDirection: 'to_subject', relationshipType: 'loan' },
  repay: { actor: 'subject', debtor: 'subject', creditor: 'target', moneyDirection: 'from_subject', relationshipType: 'repayment' },
  repaid: { actor: 'agent', debtor: 'agent', creditor: 'subject', moneyDirection: 'to_subject', relationshipType: 'repayment' },
  possession: { actor: 'subject', debtor: 'owner', creditor: 'target', moneyDirection: 'to_subject', relationshipType: 'loan' },
};

/**
 * Reads the relationship of one clause, or null when the clause has no loan or repayment in it (or when the words add
 * nothing to what the grammar already reads, e.g. "bayar cicilan motor"). `active`: the one person already named
 * earlier in the message, for "dia / doi / orangnya".
 */
export function readRelation(text: string, ctx: QuickContext, active?: { name: string; loan: boolean }): RelationReading | null {
  const toks = tokens(text);
  if (!toks.length) return null;
  const amounts = findAmounts(text).filter(a => a.marked || a.value >= 100);
  const isAmount = (t: Tok) => amounts.some(a => t.start < a.index + a.text.length && a.index < t.end) || /^\d/.test(t.w);
  const isWallet = (t: Tok) => walletsIn(t.w, ctx.wallets).some(w => w.at === 0);
  const person = (t?: Tok) => Boolean(t && (nameLike(t.w, ctx) || isHonorific(t.w)) && !isVerb(t.w));
  const trace: string[] = [];

  // The verb: the first loan or repayment word.
  let at = -1, cls: VerbClass | null = null;
  for (let i = 0; i < toks.length && at < 0; i++) {
    const w = toks[i].w, next = toks[i + 1]?.w || '';
    if (LEND_V.test(w)) { at = i; cls = 'lend'; }
    else if (GIVE.test(w) && LOAN_NOUN.test(next)) { at = i; cls = 'lend'; }
    else if (PASSIVE_V.test(w)) { at = i; cls = 'passive'; }
    else if (REPAID_V.test(w)) { at = i; cls = 'repaid'; }
    else if (REPAY_STRONG.test(w)) { at = i; cls = 'repay'; }
    else if (REPAY_WEAK.test(w) && (toks.slice(i + 1, i + 3).some(t => DEBT_NOUN.test(t.w)))) { at = i; cls = 'repay'; }
    else if (REPAY_WEAK.test(w) && /^(bayar|byr|balikin|transfer|tf)$/.test(w) && i > 0 && active?.loan && (PRONOUN.test(toks[i - 1].w) || toks[i - 1].w === active.name.toLocaleLowerCase('id-ID'))) { at = i; cls = 'repay'; }
    else if (BORROW_V.test(w)) {
      // "utang gue ke aldi", "utang atuy ke gue": the noun with its owner, not the verb.
      const owner = toks[i + 1];
      const before = i > 0 ? toks[i - 1] : undefined;
      const hasSubject = before && (USER.test(before.w) || PRONOUN.test(before.w) || person(before));
      if (/^(utang|hutang|pinjaman)$/.test(w) && !hasSubject && owner && (USER.test(owner.w) || person(owner))) { at = i; cls = 'possession'; }
      else { at = i; cls = 'borrow'; }
    }
  }
  if (at < 0 || !cls) return null;
  const verbTok = toks[at], verb = cls === 'lend' && GIVE.test(verbTok.w) ? `${verbTok.w} ${toks[at + 1].w}` : verbTok.w;
  const role: VerbRole = { verb, class: cls, ...ROLES[cls] };
  trace.push(`kata kerja “${verb}” → ${cls} (pelaku: ${role.actor}, berutang: ${role.debtor}, pemberi: ${role.creditor}, uang ${role.moneyDirection === 'to_subject' ? 'ke subjek' : 'dari subjek'})`);
  const afterVerb = at + (cls === 'lend' && GIVE.test(verbTok.w) ? 2 : 1);

  // The subject: the word before the verb, past small words and time words ("atuy tadi ngutang", "kmrn atuy bayar").
  let subject: RelationReading['subject'] = { word: '', party: 'user', implicit: true, pronoun: false, at: -1 };
  if (cls !== 'possession') {
    for (let j = at - 1; j >= 0; j--) {
      const t = toks[j];
      if (isAmount(t)) break;
      if (SKIP_BACK.test(t.w)) continue;
      if (USER.test(t.w)) subject = { word: t.w, party: 'user', implicit: false, pronoun: false, at: j };
      else if (PRONOUN.test(t.w)) {
        // "atuy, dia bayar utang": a name said before the pronoun in the same clause; otherwise the one person of the message.
        const earlier = toks.slice(0, j).reverse().find(x => person(x) && !isHonorific(x.w));
        const name = earlier ? title(earlier.w) : active?.name || '';
        subject = { word: t.w, party: name || 'dia', implicit: false, pronoun: true, at: j };
        trace.push(`“${t.w}” → ${name || 'belum jelas siapa'}${earlier ? ' (disebut sebelumnya di kalimat ini)' : active ? ' (satu-satunya orang di pesan ini)' : ''}`);
      } else if (person(t)) {
        const name = isHonorific(t.w) && toks[j + 1] && j + 1 < at && person(toks[j + 1]) ? toks[j + 1].w : t.w;
        subject = { word: name, party: title(name), implicit: false, pronoun: false, at: j };
      }
      break;
    }
  }

  // The other side.
  const targetAt = (from: number, to = toks.length): { party: Party; word: string; prep: string; wallet?: string; at: number } | null => {
    for (let k = from; k < to - 1; k++) {
      if (!PREP.test(toks[k].w)) continue;
      let n = k + 1; if (toks[n] && (isHonorific(toks[n].w) || toks[n].w === 'si') && toks[n + 1] && person(toks[n + 1])) n++;
      const t = toks[n]; if (!t) continue;
      if (USER.test(t.w)) return { party: 'user', word: t.w, prep: toks[k].w, at: n };
      if (isWallet(t)) return { party: '', word: t.w, prep: toks[k].w, wallet: walletsIn(t.w, ctx.wallets)[0].id, at: n };
      if (person(t)) return { party: title(t.w), word: t.w, prep: toks[k].w, at: n };
    }
    return null;
  };
  const bareAfter = (from: number): { party: Party; word: string; at: number } | null => {
    for (let k = from; k < toks.length; k++) {
      const t = toks[k];
      if (isAmount(t) || FILLER_AFTER.test(t.w) || DEBT_NOUN.test(t.w)) continue;
      if (USER.test(t.w)) return { party: 'user', word: t.w, at: k };
      if (isHonorific(t.w) && toks[k + 1] && person(toks[k + 1])) continue;
      if (person(t)) return { party: title(t.w), word: t.w, at: k };
      return null;
    }
    return null;
  };

  // Purpose: "buat / untuk / guna / demi …" up to an amount, a date or time word, a wallet, "ke/dari/sama + someone" or a loan verb.
  let purpose: RelationReading['purpose'];
  const purposeFrom = (k: number) => {
    const words: Tok[] = [];
    for (let n = k + 1; n < toks.length; n++) {
      const t = toks[n];
      if (isAmount(t) || DATE_STOP.test(t.w) || WALLET_CUE.test(t.w) || isWallet(t) || LEND_V.test(t.w) || BORROW_V.test(t.w) || PASSIVE_V.test(t.w)) break;
      if (t.w === 'hari' && /^(ini|itu)$/.test(toks[n + 1]?.w || '')) break;
      if (PREP.test(t.w) && toks[n + 1] && (USER.test(toks[n + 1].w) || person(toks[n + 1]) || isWallet(toks[n + 1]))) break;
      words.push(t);
    }
    return words.length ? { text: words.map(t => t.w).join(' '), marker: toks[k].w, start: toks[k].start, end: words[words.length - 1].end } : undefined;
  };

  let debtor: Party = '', creditor: Party = '', wallet: string | undefined, counterpartyWhy = '';
  if (cls === 'borrow' || cls === 'repay') {
    const target = targetAt(afterVerb);
    if (target?.wallet) wallet = target.wallet;
    let other: Party = target && !target.wallet ? target.party : '';
    if (target && !target.wallet) counterpartyWhy = `muncul setelah “${target.prep}”`;
    // "gue minjem budi 50k", "bayar utang aldi": a bare name after the verb, when the user is the one borrowing / paying.
    if (!other && subject.party === 'user') { const bare = bareAfter(afterVerb); if (bare && bare.party !== 'user') { other = bare.party; counterpartyWhy = `muncul setelah “${toks[bare.at - 1]?.w || verb}”`; } }
    debtor = subject.party; creditor = other || (subject.party === 'user' ? '' : 'user');
  } else if (cls === 'possession') {
    const owner = toks[at + 1];
    const ownerParty: Party = USER.test(owner.w) ? 'user' : title(owner.w);
    const target = targetAt(at + 2);
    debtor = ownerParty; creditor = target && !target.wallet ? target.party : ownerParty === 'user' ? '' : 'user';
    if (target && !target.wallet) counterpartyWhy = `muncul setelah “${target.prep}”`;
    subject = { word: owner.w, party: ownerParty, implicit: false, pronoun: false, at: at + 1 };
  } else if (cls === 'lend') {
    const obj = bareAfter(afterVerb) || (() => { const t = targetAt(afterVerb); return t && !t.wallet ? t : null; })();
    let objParty: Party = obj ? obj.party : '';
    // "pinjemin 50k buat budi": "buat + a name" is who borrowed, when no one else was named.
    if (!obj) { const k = toks.findIndex((t, i) => i >= afterVerb && PURPOSE.test(t.w)); const t = k >= 0 ? toks[k + 1] : undefined; if (t && person(t)) objParty = title(t.w); }
    if (obj || objParty) counterpartyWhy = `muncul setelah “${verb}”`;
    debtor = objParty; creditor = subject.party;
    const source = targetAt(afterVerb); if (source?.wallet) wallet = source.wallet;
  } else if (cls === 'passive') {
    const agent = bareAfter(afterVerb) || (() => { const t = targetAt(afterVerb); return t && !t.wallet ? t : null; })();
    debtor = subject.party; creditor = agent ? agent.party : '';
    if (agent) counterpartyWhy = `muncul setelah “${verb}”`;
  } else if (cls === 'repaid') {
    const agent = bareAfter(afterVerb) || (() => { const t = targetAt(afterVerb); return t && !t.wallet ? t : null; })();
    debtor = agent ? agent.party : ''; creditor = 'user';
    if (agent) counterpartyWhy = `muncul setelah “${verb}”`;
  }
  {
    const k = toks.findIndex((t, i) => i >= afterVerb && PURPOSE.test(t.w));
    if (k >= 0) { const p = purposeFrom(k); const lentTo = cls === 'lend' && p && title(p.text.split(' ')[0]) === debtor; if (p && !lentTo) purpose = p; }
  }

  // The user's perspective.
  const third = Boolean(debtor && creditor && debtor !== 'user' && creditor !== 'user' && debtor !== 'dia' && creditor !== 'dia');
  const userOwes = debtor === 'user' || (!debtor && creditor && creditor !== 'user');
  const repayment = role.relationshipType === 'repayment';
  const kind: RelationReading['kind'] = third ? null : userOwes ? (repayment ? 'debt_payment' : 'debt_new') : (repayment ? 'receivable_payment' : 'receivable_new');
  const counterparty = third ? '' : userOwes ? (creditor === 'user' ? '' : creditor) : (debtor === 'dia' ? '' : debtor);

  // Confidence: an explicit subject and a clear verb are sure; an implicit "you" is sure only with the other side named;
  // an owner without "ke …", an unresolved "dia", or a debt with nobody on the other side stays to check.
  let confidence: RelationReading['confidence'] = 'verified';
  if (subject.implicit && !counterparty && cls !== 'lend' && cls !== 'repaid') confidence = 'likely';
  if (subject.pronoun) confidence = subject.party === 'dia' ? 'check' : 'likely';
  if (cls === 'possession' && !counterpartyWhy) confidence = 'check';

  // Nothing to add: "bayar cicilan motor", "pinjam 500rb" — the grammar's reading stands.
  if (subject.implicit && !counterparty && !purpose && !wallet && (cls === 'repay' || cls === 'borrow')) return null;

  const why: string[] = [];
  const v = `“${verb}”`;
  if (third) why.push(`Ini utang ${show(debtor)} ke ${show(creditor)}: dua orang lain, bukan kamu.`);
  else if (repayment) {
    if (kind === 'receivable_payment') why.push(`${counterparty || 'Dia'} dikenali sebagai orang yang membayar utangnya ke kamu karena ${cls === 'repaid' ? `namanya muncul setelah ${v}` : `namanya muncul sebelum ${v}`}; ini pembayaran piutang, bukan utang baru.`);
    else why.push(`${subject.implicit ? `Tidak ada nama sebelum ${v}, jadi kamu yang membayar` : `Kamu yang membayar karena “${subject.word}” muncul sebelum ${v}`}${counterparty ? ` ke ${counterparty} (${counterpartyWhy})` : ''}; ini pembayaran utang, bukan utang baru.`);
  } else if (cls === 'lend') why.push(debtor === 'user' ? `${show(creditor)} yang meminjamkan karena namanya muncul sebelum ${v}, dan kamu yang meminjam.` : `${counterparty || 'Orang itu'} dikenali sebagai orang yang meminjam karena ${counterpartyWhy || `muncul setelah ${v}`}.`);
  else if (cls === 'possession') why.push(`“${toks[at].w} ${subject.word}” berarti utang milik ${show(debtor)}${creditor ? ` ke ${show(creditor)}` : ''}.`);
  else if (kind === 'receivable_new') why.push(`${counterparty || 'Dia'} dikenali sebagai orang yang berutang karena ${subject.pronoun ? `“${subject.word}” merujuk ke ${counterparty || 'orang sebelumnya'} dan muncul` : 'namanya muncul'} sebelum kata ${v}.`);
  else why.push(`${subject.implicit ? `Tidak ada nama sebelum ${v}, jadi kamu yang berutang` : `Kamu yang berutang karena “${subject.word}” muncul sebelum ${v}`}${counterparty ? `; ${counterparty} pemberi pinjamannya karena ${counterpartyWhy}` : ''}.`);
  if (purpose) why.push(`“${title(purpose.text)}” adalah keperluannya (setelah “${purpose.marker}”), bukan nama orang dan bukan transaksi kedua.`);
  if (wallet) why.push(`${ctx.wallets.find(w => w.id === wallet)?.name} adalah dompet, bukan orang: uangnya ${role.moneyDirection === 'to_subject' && debtor !== 'user' ? 'keluar dari' : 'lewat'} dompet itu.`);

  const amount = amounts[0]?.value;
  const node: RelationshipNode = { debtor, creditor, ...(amount ? { amount } : {}), ...(purpose ? { purpose: title(purpose.text) } : {}), sourceText: text, confidence };
  trace.push(`subjek: ${subject.implicit ? 'kamu (tidak disebut)' : `${subject.word} → ${show(subject.party)}`}; berutang: ${show(debtor) || '?'}; pemberi: ${show(creditor) || '?'}${purpose ? `; keperluan: ${purpose.text}` : ''}${wallet ? `; dompet: ${wallet}` : ''}`);
  trace.push(third ? 'sudut pandang: utang pihak ketiga — tidak dicatat' : `sudut pandang kamu: ${kind}${counterparty ? ` (${counterparty})` : ''} · ${confidence}`);
  return { kind, thirdParty: third, role, verbAt: verbTok.start, subject, counterparty, node, ...(purpose ? { purpose } : {}), ...(wallet ? { wallet } : {}), confidence, why, trace };
}

function isVerb(w: string) {
  return BORROW_V.test(w) || LEND_V.test(w) || PASSIVE_V.test(w) || REPAY_STRONG.test(w) || REPAY_WEAK.test(w) || REPAID_V.test(w) || DEBT_NOUN.test(w) || PURPOSE.test(w) || PREP.test(w) || USER.test(w) || PRONOUN.test(w);
}

/** The text with the purpose words blanked out (same length, so every other span keeps its place). */
export function withoutPurpose(text: string, r: RelationReading | null) {
  if (!r?.purpose) return text;
  return text.slice(0, r.purpose.start) + ' '.repeat(r.purpose.end - r.purpose.start) + text.slice(r.purpose.end);
}
