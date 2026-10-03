/**
 * Catat otomatis V3.5 — Compositional Language Intelligence.
 *
 * One financial event can carry several semantic roles. V3.4 already reads the core of an event (amount, wallet, date,
 * place after "di", activity → category) in any word order; what it could not do was keep the *other* parts of the
 * sentence apart from the description:
 *
 *   "nongkrong 77k di kongsi tiam krom beli teh tarik dan snack platter buat meeting masuk ke kategori hiburan"
 *    ACTIVITY  AMOUNT  PLACE           WALLET  DETAIL_INTRODUCER  ITEM  ·  ITEM  PURPOSE        EXPLICIT_CATEGORY
 *
 * This module finds those extra scopes as spans (never as word-order templates), removes them from the text the existing
 * grammar reads (so every V2.5–V3.4 rule, the Temporal Engine, entities, debts and transfers stay the authority), and
 * hands back what each scope meant and where it was, so the plan reader can attach it to the event that owns it:
 *
 *   ITEM_DETAILS       after a detail introducer (beli, pesen, order, ambil…) once the event already has an activity;
 *                      items split on dan / sama / & / + / plus / comma; item prices only when they add up to the total
 *   PURPOSE            "buat / untuk meeting"; an activity in that position ("… buat nongkrong") becomes the activity
 *   EXPLICIT_CATEGORY  "masuk ke kategori hiburan", "kategori hiburan › nongkrong" — only an existing category
 *   PLACE boundaries   "di kongsi tiam nongkrong 77k" (the place stops at the activity), "nongkrong kongsi tiam 77k"
 *                      (an unknown phrase right after a place-like activity is the place)
 *
 * Precision first: a scope is taken only with a clear cue; sentences about debts, receivables, claims, transfers,
 * budgets, goals or splits are left exactly as V3.4 reads them. The plan reader checks the composed reading against
 * the plain one (V3.5 Bug Catcher) and keeps the plain reading if money, wallet, date or the number of events would move.
 */
import { DATE_PHRASES, findAmounts, walletsIn, type QuickContext } from '../quick-entry.ts';
import { conceptWords } from '../categorize.ts';
import { CANONICAL, compileLanguagePack, curatedReading } from './language.ts';

export type ComposedItem = { name: string; qty?: number; amount?: number };
export type ComposedSlot = {
  /** Offset in the composed (core) text inside the clause that owns this slot. */
  at: number;
  items?: ComposedItem[];
  purpose?: string;
  activity?: string;
  category?: { categoryId: string; subcategoryId: string | null; label: string; text: string };
  place?: string;
  /** Who it was with ("bareng andi"): not the description, not the place. */
  people?: string[];
  /** Who it was bought for ("buat budi"). */
  forWhom?: string;
  /** Item prices that do not add up to the total (kept as a warning, never as money). */
  mismatch?: number;
  /** Items read without taking them out of the description ("beli teh dan kopi 30k"). */
  inline?: boolean;
  /** A place taken out of the text whole because it contains a wallet's name ("di Krom Store … jago"). */
  merchant?: string;
  /** "masuk ke kategori xyz" with no such category: asked, never created. */
  categoryMissing?: string;
  /** Charges / discounts moved next to the amount they change ("… di kongsi tiam krom diskon 7k"). */
  charges?: number[];
};
export type Composed = { core: string; slots: ComposedSlot[]; trace: string[] };

/** Activities: what happened (category evidence, description), never a place or an item. */
const ACTIVITIES = ['nongkrong', 'ngopi', 'jajan', 'makan siang', 'makan malam', 'makan', 'sarapan', 'nonton', 'karaoke', 'gaming', 'main game', 'liburan', 'traveling', 'travelling', 'jalan-jalan', 'jalan jalan', 'belanja', 'servis motor', 'service motor', 'servis mobil', 'isi bensin', 'gym', 'nge-gym', 'laundry', 'ngemil', 'hangout', 'healing', 'nyalon', 'potong rambut', 'staycation', 'kondangan', 'piknik', 'rekreasi', 'olahraga', 'futsal', 'badminton', 'renang', 'watch movie', 'maksi', 'makmal'];
const ACT_ALT = ACTIVITIES.map(a => a.replace(/[-]/g, '[- ]?')).sort((a, b) => b.length - a.length).join('|');
const ACTIVITY_RE = new RegExp(`(?<![\\p{L}])(${ACT_ALT})(?![\\p{L}])`, 'iu');
/** Activities whose bare object is usually a place ("nongkrong kongsi tiam", "ngopi cotti", "makan solaria"). */
const PLACE_ACTIVITIES = new Set(['nongkrong', 'ngopi', 'makan', 'sarapan', 'makan siang', 'makan malam', 'hangout']);
const INTRODUCER = /(?<![\p{L}])(beli|beliin|pesan|pesen|order|orderin|ambil|checkout)(?![\p{L}])/iu;
/** Sentences that belong to the relationship / operation engines (V3.2–V3.3): never recomposed. */
const HANDS_OFF = /(?<![\p{L}])(ngutang|utang|hutang|minjem|pinjem|pinjam|minjam|minjemin|pinjemin|talangin|nalangin|bayarin|dibayarin|balikin|dibalikin|lunasin|nyicil|cicil|cicilan|klaim|claim|reimburse|transfer|transferin|tf|topup|top up|patungan|split|bagi dua|traktir|nabung|tabung|menabung|budget|anggaran|target|rencana|ingetin|ingatkan|pengingat|catatan|hapus|ubah|ganti|batal|batalin|tiap|setiap|langganan|gaji|gajian|bonus|refund|kembalian|piutang|ditalangin)(?![\p{L}])/iu;
const PURPOSE = /(?<![\p{L}])(buat|untuk|utk|bwt)\s+/iu;
const STOP_WORD = /^(di|@|at|buat|untuk|utk|bwt|pake|pakai|via|lewat|kategori|masuk|masukin|catat|terus|trus|lalu|kemudian|abis|habis|kemarin|kemaren|tadi|besok|lusa|barusan|jam)$/i;
const BOUNDARY = /(?<![\p{L}])(terus|trus|lalu|kemudian|abis itu|habis itu|setelah itu)(?![\p{L}])/iu;
const ITEM_SPLIT = /\s*(?:,|(?<![\p{L}])(?:dan|sama|ama|plus|and)(?![\p{L}])|&|\+)\s*/iu;
const FUNCTION = new Set('yang yg dan sama ama dengan dgn bareng di ke dari aku gue gw saya kita dia doi kamu ini itu tadi juga aja doang lagi udah sudah buat untuk pake pakai via lewat terus trus lalu nya sih dong deh nih'.split(' '));
const PEOPLE_WORDS = new Set('aku gue gw saya kita kami dia doi kamu lu lo elu temen teman pacar ayang istri suami keluarga anak ortu'.split(' '));
const NUMBER_WORDS: Record<string, number> = { satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6 };
const lower = (s: string) => s.toLocaleLowerCase('id-ID');

/** A display name for an item / place / purpose: the user's own capitals win, otherwise title case. */
function display(raw: string) {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (/\p{Lu}/u.test(t)) return t;
  return t.replace(/(^|[\s-])(\p{L})/gu, (_, sp: string, c: string) => sp + c.toLocaleUpperCase('id-ID'));
}
let known: Set<string> | null = null;
/** Words the app already knows as vocabulary (activities, items, categories): never an unknown place word. */
function isKnownWord(w: string) {
  known ||= new Set([...CANONICAL, ...conceptWords(), ...compileLanguagePack().variants.keys()]);
  return known.has(w) || FUNCTION.has(w) || Boolean(curatedReading(w)) || ACTIVITY_RE.test(w);
}

/** Money amounts only: a bare 1–2 digit number before a word is a quantity ("beli 2 teh tarik"), not money. */
const moneyIn = (s: string) => findAmounts(s).filter(a => a.marked || a.value >= 1000 || !/^\d{1,2}\s$/.test(a.text));
const PURPOSE_WORDS = new Set('meeting rapat kerja kantor kuliah sekolah kampus acara ultah arisan nikahan kondangan mudik lebaran natal imlek hadiah kado bekal stok persediaan project proyek klien client tamu rumah kos kosan oleh-oleh event lembur nongkrong ngopi liburan healing'.split(' '));
const COMPANION = /(?<![\p{L}])(bareng|bersama|dengan|dgn)\s+([\p{L}'’-]{3,}(?:\s+[\p{L}'’-]{3,})?)(?=\s*(?:$|[,;]|\d|\s))/iu;

/** A charge or discount word right before an amount (the V3.3 composition reads these next to the main amount). */
const CHARGE_BEFORE = /(?<![\p{L}])(?:diskon|disc|discount|potongan|promo|hemat|voucher|vocer|pajak|ppn|pb1|tax|service charge|service|ongkir|ongkos kirim|biaya admin|admin|biaya layanan|tip|tips|cashback)(?:nya)?\s*(?:sebesar|senilai|rp\.?)?\s*$/iu;
const PLACE_SUFFIX = /^(?:store|shop|cafe|kafe|coffee|mart|resto|restaurant|official|outlet|bakery|kitchen|house|express|corner|bar|space|studio)$/i;

type Clause = { start: number; end: number };
/** Clauses: separated by ';', "terus / lalu / …", or a comma followed by its own amount, wallet or activity. */
function clausesOf(text: string, ctx: Pick<QuickContext, 'wallets'>): Clause[] {
  const cuts: number[] = [];
  const low = lower(text);
  for (const m of low.matchAll(/;|(?<![\p{L}])(?:terus|trus|lalu|kemudian|abis itu|habis itu|setelah itu)(?![\p{L}])/gu)) cuts.push(m.index!);
  for (const m of low.matchAll(/,/g)) {
    const next = low.slice(m.index! + 1).split(/[,;]/)[0];
    if (moneyIn(next).length) cuts.push(m.index!);
  }
  const sorted = [...new Set(cuts)].sort((a, b) => a - b);
  const out: Clause[] = [];
  let s = 0;
  for (const c of sorted) { out.push({ start: s, end: c }); s = c; }
  out.push({ start: s, end: text.length });
  return out.filter(c => text.slice(c.start, c.end).replace(/^[\s,;]+/, '').trim());
}

/** Where a scope that starts at `from` stops: the next amount, wallet, date, marker word, boundary or the clause end. */
function scopeEnd(low: string, from: number, end: number, stops: number[]) {
  let stop = Math.min(end, ...stops.filter(s => s >= from));
  const words = [...low.slice(from, stop).matchAll(/[\p{L}@-]+/gu)];
  for (const w of words) if (STOP_WORD.test(w[0]) && (w.index ?? 0) > 0) { stop = from + (w.index ?? 0); break; }
  return stop;
}

function parseItems(text: string): ComposedItem[] {
  return text.split(ITEM_SPLIT).map(part => part.trim()).filter(Boolean).map(part => {
    const amount = moneyIn(lower(part))[0];
    let name = amount ? (part.slice(0, amount.index) + part.slice(amount.index + amount.text.length)).trim() : part;
    let qty: number | undefined;
    const q = name.match(/^(\d{1,2}|satu|dua|tiga|empat|lima|enam)\s+(?=\p{L})/iu);
    if (q) { qty = /^\d/.test(q[1]) ? Number(q[1]) : NUMBER_WORDS[lower(q[1])]; name = name.slice(q[0].length); }
    name = name.replace(/^(?:satu|se)(?=porsi|gelas|cup|botol)/i, '').trim();
    return { name: display(name), ...(qty && qty > 1 ? { qty } : {}), ...(amount ? { amount: amount.value } : {}) };
  }).filter(i => i.name && !/^\d/.test(i.name));
}

/** Resolves "hiburan", "hiburan nongkrong", "hiburan > nongkrong" to an existing category (never creates one). */
export function findCategory(phrase: string, categories: QuickContext['categories']) {
  const norm = (s: string) => lower(s).replace(/&/g, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = (s: string) => new Set(norm(s).split(' ').filter(w => w && w !== 'dan'));
  const active = categories.filter(c => !(c as { isArchived?: boolean }).isArchived && (!('type' in c) || c.type === 'expense' || c.type === 'income'));
  const parents = active.filter(c => !c.parentId), subs = active.filter(c => c.parentId);
  const covers = (name: string, part: string) => { const w = words(name), p = [...words(part)]; return p.length > 0 && p.every(x => w.has(x)); };
  const parts = phrase.split(/\s*(?:>|›|\/|-)\s*/).filter(Boolean);
  if (parts.length === 2) {
    const parent = parents.find(c => covers(c.name, parts[0])), sub = parent && subs.find(c => c.parentId === parent.id && covers(c.name, parts[1]));
    if (parent && sub) return { categoryId: parent.id, subcategoryId: sub.id, label: `${parent.name} › ${sub.name}` };
  }
  const tokens = norm(phrase).split(' ');
  // "hiburan nongkrong" (no separator): a parent named by some words and its sub by the rest.
  for (let k = 1; k < tokens.length; k++) {
    const parent = parents.find(c => covers(c.name, tokens.slice(0, k).join(' '))), sub = parent && subs.find(c => c.parentId === parent.id && covers(c.name, tokens.slice(k).join(' ')));
    if (parent && sub) return { categoryId: parent.id, subcategoryId: sub.id, label: `${parent.name} › ${sub.name}` };
  }
  const exactParent = parents.find(c => norm(c.name) === norm(phrase)) || parents.find(c => covers(c.name, phrase));
  if (exactParent) return { categoryId: exactParent.id, subcategoryId: null, label: exactParent.name };
  const sub = subs.find(c => norm(c.name) === norm(phrase));
  if (sub) return { categoryId: sub.parentId!, subcategoryId: sub.id, label: `${categories.find(c => c.id === sub.parentId)?.name || ''} › ${sub.name}` };
  return null;
}
const CATEGORY_CMD = /(?<![\p{L}])(?:masuk(?:in|kan)?\s+(?:ke\s+)?(?:dalam\s+)?kategori|kategori(?:kan|nya)?(?:\s+ke)?|catat\s+sebagai|set\s+kategori|masukin\s+ke)\s+([\p{L}&›>\/ -]+?)\s*(?=$|[,;.]|\s(?:pake|pakai|via|lewat|di|kemarin|tadi|beli|buat|untuk)\b|\s\d)/iu;

/**
 * Finds the extra scopes of every clause and returns the core text for the grammar plus what was taken out.
 * Null when nothing was composed (the sentence is read exactly as before).
 */
export function composeSlots(text: string, ctx: Pick<QuickContext, 'wallets' | 'categories' | 'receivables' | 'debts' | 'people'>): Composed | null {
  const low = lower(text);
  if (!findAmounts(low).length) return null;
  const people = new Set([...(ctx.people || []), ...(ctx.receivables || []).map(r => r.person), ...(ctx.debts || []).map(d => d.provider || '')].filter(Boolean).map(lower));
  const pieces: { text: string; slot?: Omit<ComposedSlot, 'at'> }[] = [];
  const trace: string[] = [];
  let changed = false;
  for (const clause of clausesOf(text, ctx)) {
    let part = text.slice(clause.start, clause.end), plow = lower(part);
    if (HANDS_OFF.test(plow) || !findAmounts(plow).length) { pieces.push({ text: part }); continue; }
    const slot: Omit<ComposedSlot, 'at'> = {};
    // Punctuation inside one event ("nongkrong 77k, di kongsi tiam, krom, beli …") separates roles, not events.
    const walletWords = ctx.wallets.map(w => lower(w.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const soft = new RegExp(`\\s*,\\s*(?=(?:di|@|pake|pakai|via|lewat|buat|untuk|kategori|masuk|beli|beliin|pesan|pesen|order|orderin|ambil|checkout${walletWords.length ? '|' + walletWords.join('|') : ''})(?![\\p{L}]))`, 'giu');
    part = part.replace(/^(\s*[,;]?)(.*)$/su, (_, lead: string, body: string) => lead + body.replace(soft, ' ')); plow = lower(part);
    const cut = (s: number, e: number) => { part = part.slice(0, s) + ' ' + part.slice(e); plow = lower(part); };
    // 0a. A place that carries a wallet's name ("di Krom Store") while another wallet pays: the place is one entity.
    const wp = plow.match(/(?<![\p{L}])(?:di|@)\s+([\p{L}'’-]+)\s+([\p{L}'’-]+)/u);
    if (wp && walletsIn(wp[1], ctx.wallets).length && PLACE_SUFFIX.test(wp[2])) {
      const rest = plow.slice(0, wp.index!) + ' ' + plow.slice(wp.index! + wp[0].length);
      if (walletsIn(rest, ctx.wallets).length) {
        const at = wp.index!, raw = part.slice(at, at + wp[0].length).replace(/^(?:di|@)\s+/i, '');
        slot.merchant = display(raw); cut(at, at + wp[0].length);
        trace.push(`“${raw}” satu tempat (nama dompet di dalam nama tempat)`);
      }
    }
    // 0b. Charges said away from the amount ("nongkrong 77k di kongsi tiam krom diskon 7k") move next to it, so the one
    //     purchase is read with its discount instead of as a second spending.
    {
      const money = moneyIn(plow);
      const isCharge = (a: { index: number }) => CHARGE_BEFORE.test(plow.slice(Math.max(0, a.index - 24), a.index));
      const mains = money.filter(a => !isCharge(a)), charges = money.filter(isCharge);
      if (mains.length === 1 && charges.length) {
        const main = mains[0], mainEnd = main.index + main.text.length;
        const spans = charges.map(c => { const w = plow.slice(Math.max(0, c.index - 24), c.index).match(CHARGE_BEFORE)!; return { start: c.index - w[0].length, end: c.index + c.text.length, value: c.value }; });
        const adjacent = spans.every((sp, i) => !plow.slice(i ? spans[i - 1].end : mainEnd, sp.start).trim());
        // Cashback (received vs promised) and charges with their own small words ("nanti dapet …") stay where they are.
        const between = plow.slice(mainEnd, spans[0].start);
        const own = /(?<![\p{L}])(?:nanti|ntar|dapet|dapat|kena|plus|ada|terus|udah|sudah|akan|bakal|menyusul|pending|cashback|cash back|kesbek)(?![\p{L}])/iu;
        if (!adjacent && spans.every(sp => sp.start > mainEnd) && !own.test(between) && !spans.some(sp => own.test(plow.slice(Math.max(0, sp.start - 12), sp.end)))) {
          const moved = spans.map(sp => part.slice(sp.start, sp.end).trim());
          for (const sp of [...spans].reverse()) cut(sp.start, sp.end);
          part = part.slice(0, mainEnd) + ' ' + moved.join(' ') + part.slice(mainEnd); plow = lower(part);
          slot.charges = spans.map(sp => sp.value);
          trace.push(`${moved.join(', ')} → milik nominal ${main.text.trim()}`);
        }
      }
    }
    // 1. Explicit category ("masuk ke kategori hiburan").
    const cm = plow.match(CATEGORY_CMD);
    if (cm && !/(?<![\p{L}])(buat|bikin|tambah|tambahin)\s+kategori/iu.test(plow)) {
      const found = findCategory(cm[1].trim(), ctx.categories);
      if (found) { slot.category = { ...found, text: cm[0].trim() }; cut(cm.index!, cm.index! + cm[0].length); trace.push(`kategori eksplisit “${cm[1].trim()}” → ${found.label}`); }
      else if (cm[1].trim().split(/\s+/).length <= 3) { slot.categoryMissing = cm[1].trim(); cut(cm.index!, cm.index! + cm[0].length); trace.push(`kategori “${cm[1].trim()}” belum ada → ditanyakan`); }
    }
    // 2. Purpose ("buat meeting"); an activity there is the event's activity ("… buat nongkrong").
    const amountsIn = () => findAmounts(plow).map(a => a.index), walletsAt = () => walletsIn(plow, ctx.wallets).map(w => w.at);
    const dateAt = () => [...plow.matchAll(new RegExp(DATE_PHRASES.source, 'g'))].map(m => m.index ?? 0);
    const pm = plow.match(PURPOSE);
    if (pm) {
      const from = pm.index! + pm[0].length, end = scopeEnd(plow, from, plow.length, [...amountsIn(), ...walletsAt(), ...dateAt(), ...[...plow.matchAll(new RegExp(INTRODUCER.source, "giu"))].map(m => m.index ?? 0)].filter(x => x >= from));
      const what = part.slice(from, end).trim().replace(/[,.]$/, '');
      const words = lower(what).split(/\s+/);
      const isPerson = words.some(w => people.has(w) || PEOPLE_WORDS.has(w));
      if (what && words.length <= 5 && !walletsIn(lower(what), ctx.wallets).length) {
        const act = what.match(ACTIVITY_RE);
        const before = plow.slice(0, pm.index!) + ' ' + plow.slice(end);
        if (act && act[0].length === what.length && !ACTIVITY_RE.test(before)) { slot.activity = lower(act[0]); cut(pm.index!, end); trace.push(`“buat ${what}” → aktivitas`); }
        // "buat budi": one unknown word is who it was for, not a purpose.
        else if (words.length === 1 && !PURPOSE_WORDS.has(words[0]) && (isPerson || !isKnownWord(words[0])) && /^[\p{L}'’-]{3,}$/u.test(words[0])) { slot.forWhom = display(what); cut(pm.index!, end); trace.push(`“${pm[1]} ${what}” → untuk orang`); }
        else if (!isPerson) { slot.purpose = what; cut(pm.index!, end); trace.push(`“${pm[1]} ${what}” → keperluan`); }
      }
    }
    // 3. Item details after a detail introducer, once the event has an activity.
    const im = plow.match(INTRODUCER);
    const activityBefore = im ? ACTIVITY_RE.test(plow.slice(0, im.index!)) : false;
    if (im && (activityBefore || slot.activity)) {
      const from = im.index! + im[0].length;
      const amounts = moneyIn(plow), outside = amounts.filter(a => a.index < im.index!), inside = amounts.filter(a => a.index >= from);
      const softEnd = scopeEnd(plow, from, plow.length, [...walletsAt(), ...dateAt()].filter(x => x >= from));
      // Item prices: every item has one and together they make the total written outside the list.
      const listed = part.slice(from, softEnd), items = parseItems(listed);
      const each = items.length >= 2 && items.every(i => i.amount) && outside.length === 1 && inside.length === items.length;
      const sum = items.reduce((n, i) => n + (i.amount || 0), 0);
      const priced = each && sum === outside[0].value;
      // Prices that do not add up: still one event with its details; the difference is a warning, never money.
      if (each && !priced) slot.mismatch = sum;
      // "beli rokok 30k": an item with its own price that is not a priced list is its own spending, not a detail.
      const ownPrice = outside.length > 0 && inside.length > 0 && !each;
      const end = each ? softEnd : scopeEnd(plow, from, plow.length, [...inside.map(a => a.index), ...walletsAt(), ...dateAt()].filter(x => x >= from));
      const list = parseItems(part.slice(from, end)).filter(i => !people.has(lower(i.name)) && !PEOPLE_WORDS.has(lower(i.name)));
      if (!ownPrice && list.length && list.every(i => i.name.split(' ').length <= 6)) {
        slot.items = each ? items : list.map(({ amount: _a, ...i }) => i);
        cut(im.index!, end);
        trace.push(`rincian: ${slot.items.map(i => `${i.qty ? `${i.qty} ` : ''}${i.name}${i.amount ? ` ${i.amount}` : ''}`).join(' · ')}${priced ? ' (harga per item = total)' : ''}`);
      }
    }
    // 3b. "beli teh dan kopi 30k": no activity, a list right after the verb → details of the one entry (text kept).
    else if (im && !slot.activity && im.index! <= 1 && !/(?<![\p{L}])(?:di|@)\s/u.test(plow.slice(0, im.index!))) {
      const from = im.index! + im[0].length;
      const end = scopeEnd(plow, from, plow.length, [...moneyIn(plow).map(a => a.index), ...walletsAt(), ...dateAt()].filter(x => x >= from));
      const list = parseItems(part.slice(from, end));
      if (list.length >= 2 && list.every(i => !i.amount && !i.qty && i.name.split(' ').length <= 3 && !people.has(lower(i.name)) && !PEOPLE_WORDS.has(lower(i.name)))) {
        slot.items = list; slot.inline = true;
        trace.push(`rincian: ${list.map(i => i.name).join(' · ')} (satu entri)`);
      }
    }
    // 3c. Who it was with ("bareng andi", "dengan budi"): not the place, not the description.
    const cp = plow.match(COMPANION);
    if (cp) {
      const who = cp[2].split(/\s+/).filter(w => !walletsIn(w, ctx.wallets).length && !STOP_WORD.test(w));
      const name = who.length === cp[2].split(/\s+/).length ? cp[2] : who[0];
      if (name && !isKnownWord(lower(name.split(/\s+/)[0])) || (name && (people.has(lower(name)) || PEOPLE_WORDS.has(lower(name))))) {
        slot.people = [display(name)];
        cut(cp.index!, cp.index! + cp[1].length + 1 + name.length);
        trace.push(`“${cp[1]} ${name}” → orang`);
      }
    }
    // 4. Place boundaries: a place stops at an activity ("di kongsi tiam nongkrong 77k"); an unknown phrase right after a
    //    place-like activity is the place ("nongkrong kongsi tiam 77k").
    const di = plow.match(/(?<![\p{L}])(?:di|@)\s+((?:[\p{L}'’.&-]+\s+){0,4}?)([\p{L}'’-]+)\s+(?=\d)/u);
    // Only an activity that ends the span, written in lower case, and not said before "di" ("jajan di Jajan Cafe 20k").
    const span = di ? (di[1] + di[2]) : '';
    const actInPlace = di && span.match(new RegExp(`(?:^|\\s)(${ACT_ALT})$`, 'iu'));
    const placeAt = di ? di.index! + di[0].indexOf(span) : 0;
    if (di && actInPlace && !slot.activity && !ACTIVITY_RE.test(plow.slice(0, di.index!)) && !/\p{Lu}/u.test(part.slice(placeAt + span.length - actInPlace[1].length, placeAt + span.length))) {
      const a = lower(actInPlace[1]), at = placeAt + span.length - a.length;
      cut(at, at + a.length);
      slot.activity = a;
      trace.push(`tempat berhenti sebelum aktivitas “${a}”`);
    }
    const bare = !/(?<![\p{L}])(?:di|@|at)\s/u.test(plow) && plow.match(new RegExp(`(?<![\\p{L}])(${[...PLACE_ACTIVITIES].sort((x, y) => y.length - x.length).join('|')})\\s+((?:[\\p{L}'’.&-]+\\s*){1,3}?)(?=\\s*(?:$|[,;]|\\d|\\b(?:${ctx.wallets.map(w => lower(w.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || 'zz'})\\b|pake|pakai|via))`, 'u'));
    if (bare) {
      const words = bare[2].trim().split(/\s+/);
      const unknown = words.length >= 1 && words.every(w => w.length >= 3 && !isKnownWord(w) && !people.has(w) && !walletsIn(w, ctx.wallets).length);
      if (unknown && (words.length >= 2 || /[A-Z]/.test(text.slice(clause.start, clause.end)))) {
        const at = plow.indexOf(bare[2].trim(), bare.index!);
        slot.place = display(text.slice(clause.start, clause.end).slice(at, at + bare[2].trim().length) || bare[2]);
        part = part.slice(0, at) + 'di ' + part.slice(at); plow = lower(part);
        trace.push(`“${bare[2].trim()}” setelah “${bare[1]}” → tempat`);
      }
    }
    if (Object.keys(slot).length) {
      changed = true;
      if (slot.activity) { part = part.replace(/^(\s*[,;]?\s*)/, `$1${slot.activity} `); plow = lower(part); }
      pieces.push({ text: part, slot });
    } else pieces.push({ text: part });
  }
  if (!changed) return null;
  // Rebuild the core text; each slot points into the clause it came from.
  let core = '';
  const slots: ComposedSlot[] = [];
  for (const p of pieces) {
    const clean = p.text.replace(/\s+([,;])/g, '$1').replace(/\s{2,}/g, ' ').replace(/(?<![\p{L}])(?:dan|sama|ama)\s*(?=[,;]|$)/giu, '').replace(/\s+$/, '');
    const start = core.length;
    core += (core && !/^[\s,;]/.test(clean) ? ' ' : '') + clean;
    if (p.slot) slots.push({ ...p.slot, at: start + Math.max(0, Math.floor((core.length - start) / 2)) });
  }
  return { core: core.replace(/\s{2,}/g, ' ').trim(), slots, trace };
}

/** Notes text for the composed extras, one line (the form's Catatan is a single line; the structured list stays on the plan). */
export function slotNotes(slot: Pick<ComposedSlot, 'items' | 'purpose' | 'people' | 'inline' | 'forWhom'>) {
  const lines: string[] = [];
  if (slot.inline) return '';
  if (slot.items?.length) lines.push(`Rincian: ${slot.items.map(i => `${i.qty ? `${i.qty} ` : ''}${i.name}`).join(', ')}`);
  if (slot.purpose) lines.push(`Keperluan: ${slot.purpose}`);
  if (slot.forWhom) lines.push(`Untuk: ${slot.forWhom}`);
  if (slot.people?.length) lines.push(`Bersama: ${slot.people.join(', ')}`);
  return lines.join(' · ');
}
export { ACTIVITY_RE };
