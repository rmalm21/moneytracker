/**
 * Catat otomatis V3 — dual-semantic consensus.
 *
 *   text → Engine A (Financial Grammar: lib/quick-plan.ts with the entity resolver and the Bug Catcher)
 *        → Engine B (NLP.js, lib/catat/nlp-engine.ts) on each action's clause
 *        → semantic consensus per role → Bug Catcher again → confidence → the one question → action plan.
 *
 * Not a vote. Each role has its own authority, set from the benchmark (bench/quick/REPORT-v3.md):
 *   amount, date, transfer/debt direction, corrections, references  → Engine A only (NLP.js is never asked);
 *   intent   → A decides; B agreeing makes a "likely" kind "verified"; B disagreeing is only raised when A itself was unsure
 *              and B is very sure (≥ 0.9), so a confident correct grammar reading is never made noisier;
 *   wallet   → a configured wallet matched exactly by A wins; B may add a wallet A missed (a typo such as "mandri"), as
 *              "Kemungkinan benar", only when its words are not already used by another entity;
 *   merchant → B may split off a known place A missed (a typo such as "famili mart") or merge a fragment; otherwise A wins;
 *   person   → B only knows people from the records; it may fill an empty person after "ke / dari / bayar".
 * Whatever B proposes goes through the Bug Catcher again. B never writes a transaction.
 */
import { normalizeQuick, parseQuickPlan, refreshAction, type ActionCandidate, type QuickParseResult } from '../quick-plan.ts';
import { knownPlaces, walletsIn, type QuickContext, type QuickGroup, type QuickKind } from '../quick-entry.ts';
import { catchBugs } from './bug-catcher.ts';
import { analyzeSemantics, kindOfIntent, type SemanticEngineResult } from './nlp-engine.ts';

export type ConsensusNote = { role: 'intent' | 'wallet' | 'merchant' | 'person' | 'amount'; outcome: 'agree' | 'rescued' | 'rejected' | 'escalated' | 'both-silent'; detail: string };
export type V3Action = ActionCandidate & { consensus?: ConsensusNote[]; semantic?: SemanticEngineResult };
export type V3Result = QuickParseResult & { actions: V3Action[]; engines: { grammarMs: number; nlpMs: number; nlpLoadMs?: number } };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const wordsOf = (s?: string) => lower(s || '').split(/\s+/).filter(Boolean);
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleCase = (s: string) => s.replace(/(^|\s)(\S)/g, (_, sp: string, c: string) => sp + c.toLocaleUpperCase('id-ID'));
const SPENDING = new Set<QuickKind>(['expense', 'income', 'plan_new', 'recurring_new']);

export async function parseQuickPlanV3(input: string, ctx: QuickContext, mode: QuickGroup | QuickKind = 'auto'): Promise<V3Result> {
  const t0 = performance.now();
  let plan = parseQuickPlan(input, ctx, mode) as V3Result;
  let grammarMs = performance.now() - t0, nlpMs = 0, nlpLoadMs: number | undefined;
  // Respelling: NLP.js recognises a configured wallet or a known place written with a typo ("mandri", "famili mart");
  // the grammar then reads the message again with the right spelling (it validates the result; NLP.js decides nothing).
  const respelled: { raw: string; value: string; type: 'WALLET' | 'MERCHANT'; id?: string }[] = [];
  try {
    const whole = await analyzeSemantics(normalizeQuick(input), ctx);
    nlpMs += whole.ms; nlpLoadMs = whole.loadMs;
    const places = knownPlaces(ctx);
    for (const e of whole.entityCandidates) {
      if ((e.type !== 'WALLET' && e.type !== 'MERCHANT') || e.confidence < 0.8 || e.rawText.length < 4) continue;
      const raw = lower(e.rawText).trim(), value = lower(e.value);
      if (raw === value || raw.replace(/\s+/g, '') === value.replace(/\s+/g, '')) continue;
      if (e.type === 'WALLET' && walletsIn(raw, ctx.wallets).length) continue;
      if (e.type === 'MERCHANT' && places.has(raw)) continue;
      // One typo per word at most ("famili mart", "indomart", "mandri"); "barber king" is not "Burger King".
      if (!oneTypoPerWord(raw, value)) continue;
      respelled.push({ raw, value, type: e.type, id: e.id });
    }
    if (respelled.length) {
      let fixed = input;
      for (const r of respelled) fixed = fixed.replace(new RegExp(`(^|[^\\p{L}])${r.raw.split(/\s+/).map(esc).join('\\s+')}(?![\\p{L}])`, 'iu'), (_m, pre: string) => `${pre}${r.value}`);
      const t1 = performance.now();
      const again = parseQuickPlan(fixed, ctx, mode) as V3Result;
      grammarMs += performance.now() - t1;
      if (again.actions.length === plan.actions.length || plan.actions.length === 0) {
        again.sourceText = plan.sourceText;
        for (const a of again.actions) for (const r of respelled) {
          const note = `“${r.raw}” dibaca ${r.type === 'WALLET' ? ctx.wallets.find(w => w.id === r.id)?.name : titleCase(r.value)} (mirip nama ${r.type === 'WALLET' ? 'dompet' : 'tempat'} yang dikenal)`;
          if (r.type === 'WALLET' && r.id) { for (const key of ['wallet', 'to'] as const) { const id = key === 'wallet' ? a.result.preset.walletId : a.result.preset.destinationWalletId; if (id === r.id && a.fields[key]?.status === 'verified') a.fields[key] = { status: 'likely', note }; } }
          if (r.type === 'WALLET') { const name = ctx.wallets.find(w => w.id === r.id)?.name; a.evidence = a.evidence.filter(e => !(name && e.startsWith(`${name} dikenali sebagai dompet karena cocok`))); }
          if (lower(a.text).includes(r.value) && (r.type === 'MERCHANT' ? lower(a.result.preset.merchant || '') === r.value : Boolean(r.id) && [a.result.preset.walletId, a.result.preset.destinationWalletId].includes(r.id))) { a.evidence.push(`${note}.`); (a.consensus ||= []).push({ role: r.type === 'WALLET' ? 'wallet' : 'merchant', outcome: 'rescued', detail: `ejaan ${r.raw} → ${r.value}` }); }
        }
        again.trace.unshift(...respelled.map(r => `NLP.js: ejaan “${r.raw}” → “${r.value}” (${r.type === 'WALLET' ? 'dompet' : 'tempat'}), dibaca ulang oleh tata bahasa`));
        plan = again;
      }
    }
  } catch (error) { if (typeof console !== 'undefined') console.warn('Catat otomatis V3: NLP.js gagal, hasil tata bahasa dipakai.', error); }
  for (const action of plan.actions) {
    // V3.3: an operation on existing records (ubah / hapus / tanya / jadwal) is not a new entry to cross-check.
    if (['tx_update', 'tx_delete', 'query', 'recurring_change'].includes(action.result.kind)) continue;
    const clause = plan.clauses[action.clause]?.normalized || normalizeQuick(action.text);
    let sem: SemanticEngineResult;
    try { sem = await analyzeSemantics(clause, ctx); } catch (error) { console.warn('Catat otomatis V3: NLP.js gagal pada klausa, hasil tata bahasa dipakai.', error); continue; }
    nlpMs += sem.ms;
    action.semantic = sem;
    action.consensus = [...(action.consensus || []), ...resolve(action, sem, clause, ctx)];
    plan.trace.push(...action.consensus.filter(n => n.outcome !== 'agree' && n.outcome !== 'both-silent').map(n => `konsensus ${action.id} ${n.role}: ${n.outcome} — ${n.detail}`));
  }
  plan.engines = { grammarMs, nlpMs, nlpLoadMs };
  plan.confidence = !plan.actions.length ? 'none' : plan.actions.some(a => a.review) || plan.unresolved.length ? 'review' : 'high';
  return plan;
}

function resolve(action: V3Action, sem: SemanticEngineResult, clause: string, ctx: QuickContext): ConsensusNote[] {
  const notes: ConsensusNote[] = [];
  const r = action.result, kind = r.kind;
  const set = (key: keyof ActionCandidate['fields'], status: 'verified' | 'likely' | 'check', note: string) => { action.fields[key] = { status, note }; };
  const note = (role: ConsensusNote['role'], outcome: ConsensusNote['outcome'], detail: string) => notes.push({ role, outcome, detail });

  // Intent.
  const top = sem.intentCandidates[0], bKind = kindOfIntent(top?.intent);
  if (bKind && top) {
    if (bKind === kind) {
      note('intent', 'agree', `${kind} (${top.score.toFixed(2)})`);
      if (action.fields.kind?.status === 'likely' && top.score >= 0.7) set('kind', 'verified', 'dua mesin sepakat');
    } else if (action.fields.kind?.status !== 'verified' && top.score >= 0.9 && (kind === 'expense' || kind === 'income') && (bKind === 'expense' || bKind === 'income')) {
      note('intent', 'escalated', `tata bahasa: ${kind}, NLP.js: ${bKind} (${top.score.toFixed(2)})`);
      set('kind', 'check', bKind === 'income' ? 'Uang masuk atau keluar?' : 'Uang keluar atau masuk?');
    } else note('intent', 'rejected', `NLP.js ${bKind} (${top.score.toFixed(2)}) ditolak: tata bahasa ${kind}${action.fields.kind?.status === 'verified' ? ' terverifikasi' : ''}`);
  }

  // Words already used by an entity of the grammar reading (B may not reuse them).
  const used = new Set([...wordsOf(r.preset.merchant), ...wordsOf(r.person)]);
  for (const id of [r.preset.walletId, r.preset.destinationWalletId]) { const w = ctx.wallets.find(x => x.id === id); if (w) wordsOf(w.name).forEach(x => used.add(x)); }

  // Wallet.
  const wallets = sem.entityCandidates.filter(e => e.type === 'WALLET');
  if (SPENDING.has(kind) || ['debt_payment', 'receivable_payment', 'debt_new', 'receivable_new'].includes(kind)) {
    const exact = wallets.find(w => w.id === r.preset.walletId);
    const defaulted = action.fields.wallet?.status === 'likely' && /bawaan|biasa/.test(action.fields.wallet?.note || '');
    if (exact) note('wallet', 'agree', exact.value);
    else if (wallets.length && (!r.preset.walletId || defaulted)) {
      // Only a typo: a wallet word written exactly was already seen by the grammar, which decided its role ("promo gopay" is not the wallet).
      const fuzzy = wallets.find(w => w.confidence >= 0.8 && !wordsOf(w.rawText).some(x => used.has(x)) && !walletsIn(lower(w.rawText), ctx.wallets).length);
      if (fuzzy) {
        r.preset.walletId = fuzzy.id;
        set('wallet', 'likely', `“${fuzzy.rawText}” mirip dompet ${fuzzy.value}`);
        action.evidence.push(`${fuzzy.value} dikenali dari “${fuzzy.rawText}” (mirip nama dompet ${fuzzy.value}).`);
        if (r.preset.description) r.preset.description = removeWords(r.preset.description, fuzzy.rawText);
        note('wallet', 'rescued', `${fuzzy.rawText} → ${fuzzy.value}`);
      }
    } else if (wallets.length && r.preset.walletId) note('wallet', 'rejected', `NLP.js ${wallets.map(w => w.value).join('/')} ditolak: dompet ${ctx.wallets.find(w => w.id === r.preset.walletId)?.name} disebut persis`);
    else if (!wallets.length && !r.preset.walletId) note('wallet', 'both-silent', 'tidak ada dompet');
  } else if (kind === 'transfer') {
    // Missing transfer wallets: a fuzzy wallet right after "dari" (source) or "ke" (destination); never a guess without a cue.
    for (const w of wallets) {
      if (w.id === r.preset.walletId || w.id === r.preset.destinationWalletId) { note('wallet', 'agree', w.value); continue; }
      const before = clause.slice(0, w.start);
      if (walletsIn(lower(w.rawText), ctx.wallets).length) continue; // written exactly: the grammar's call
      if (!r.preset.walletId && /\b(dari|dr)\s+$/.test(before) && w.confidence >= 0.8) { r.preset.walletId = w.id; set('wallet', 'likely', `“${w.rawText}” mirip dompet ${w.value}`); note('wallet', 'rescued', `sumber ${w.value}`); }
      else if (!r.preset.destinationWalletId && /\b(ke|masuk(?: ke)?)\s+$/.test(before) && w.confidence >= 0.8 && w.id !== r.preset.walletId) { r.preset.destinationWalletId = w.id; set('to', 'likely', `“${w.rawText}” mirip dompet ${w.value}`); note('wallet', 'rescued', `tujuan ${w.value}`); }
    }
  }

  // Merchant (known places only).
  const place = sem.entityCandidates.find(e => e.type === 'MERCHANT' && e.confidence >= 0.85);
  if (SPENDING.has(kind) && place) {
    const a = lower(r.preset.merchant || ''), canonical = place.value;
    if (a && a === lower(canonical)) note('merchant', 'agree', canonical);
    else if (!a && r.preset.description && wordsOf(r.preset.description).length > wordsOf(place.rawText).length && containsWords(r.preset.description, place.rawText) && !wordsOf(place.rawText).some(x => used.has(x))) {
      r.preset.merchant = canonical;
      r.preset.description = removeWords(r.preset.description, place.rawText);
      action.evidence.push(`${canonical} dianggap tempat transaksi karena mirip nama tempat yang dikenal (“${place.rawText}”).`);
      note('merchant', 'rescued', `${place.rawText} → ${canonical}`);
    } else if (a && lower(place.rawText).includes(a) && lower(place.rawText) !== a) {
      // A fragment of a known place ("Mart" of "Family Mart").
      if (r.preset.description) r.preset.description = removeWords(r.preset.description, place.rawText.replace(new RegExp(`\\s*${a}$`), ''));
      r.preset.merchant = canonical;
      note('merchant', 'rescued', `pecahan ${a} → ${canonical}`);
    } else if (a) note('merchant', 'rejected', `NLP.js ${canonical} ditolak: tata bahasa ${r.preset.merchant}`);
  } else if (SPENDING.has(kind) && r.preset.merchant) note('merchant', 'rejected', 'NLP.js tidak mengenal tempat ini (tata bahasa dipakai)');

  // Person (people from the records only).
  const person = sem.entityCandidates.find(e => e.type === 'PERSON');
  if (person) {
    if (r.person && lower(r.person) === lower(person.value)) note('person', 'agree', person.value);
    else if (!r.person && SPENDING.has(kind) && /\b(ke|kepada|dari|dr|bayar|buat|untuk)\s+$/.test(clause.slice(0, person.start)) && !wordsOf(person.rawText).some(x => used.has(x))) {
      r.person = titleCase(person.value); set('person', 'likely', `${r.person} (dari catatan)`); note('person', 'rescued', person.value);
    } else if (r.person) note('person', 'rejected', `NLP.js ${person.value} ditolak: tata bahasa ${r.person}`);
  }

  // Amount: evidence only.
  const money = sem.entityCandidates.find(e => e.type === 'AMOUNT');
  if (money && r.amount) note('amount', 'agree', `nominal dibaca tata bahasa (${r.amount}); NLP.js melihat “${money.rawText}”`);

  // Challenge the combined result again.
  if (notes.some(n => n.outcome === 'rescued')) {
    const caught = catchBugs({ kind, description: r.preset.description, merchant: r.preset.merchant, walletId: r.preset.walletId, destinationWalletId: r.preset.destinationWalletId, person: r.person }, clause, ctx);
    if (caught.changed) { r.preset.description = caught.parse.description; r.preset.merchant = caught.parse.merchant; r.person = caught.parse.person; if (caught.parse.walletId) r.preset.walletId = caught.parse.walletId; }
    action.checks = [...(action.checks || []), ...caught.warnings];
  }
  refreshAction(action, ctx);
  if (action.confirm) action.review = true;
  return notes;
}

function containsWords(text: string, part: string) { const t = ` ${wordsOf(text).join(' ')} `, p = ` ${wordsOf(part).join(' ')} `; return t.includes(p); }
function removeWords(text: string, part: string) {
  const t = wordsOf(text), p = wordsOf(part);
  for (let i = 0; i + p.length <= t.length; i++) if (t.slice(i, i + p.length).join(' ') === p.join(' ')) {
    const left = text.split(/\s+/).filter(Boolean); left.splice(i, p.length);
    return left.join(' ') || undefined;
  }
  return text;
}

/** Same number of words, each within one edit (insert, delete, substitute or swap) of the other. */
function oneTypoPerWord(a: string, b: string) {
  const x = a.split(/\s+/), y = b.split(/\s+/);
  if (x.length !== y.length) return x.join('') === y.join('') ? false : distance(x.join(''), y.join('')) <= 1;
  return x.every((w, i) => distance(w, y[i]) <= 1);
}
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
