/**
 * Catat otomatis V3.3 — sentences about records that already exist.
 *
 *   "ubah kopi cotti tadi jadi 25k"      → UPDATE the Cotti Coffee entry of today (19.000 → 25.000), no new entry
 *   "hapus parkir tadi"                  → DELETE today's Parkir entry (after confirmation)
 *   "yang kemarin harusnya 25 bukan 20"  → UPDATE yesterday's Rp20.000 entry to Rp25.000
 *   "batalin transfer jago ke mandiri tadi" → CANCEL (delete, balances restored by the ledger) today's transfer
 *   "atuy masih ngutang berapa"          → QUERY, read only
 *   "mulai bulan depan spotify jadi 35k" → RECUR change from 1 Nov; "bulan depan stop spotify" → STOP_RECURRING
 *
 * The resolver scores the bounded recent entries (QuickContext.recent) on the words, the merchant, the wallet, the
 * amount, the day and the order; a record is only chosen when it is clearly ahead of the next one. Two similar
 * candidates → nothing is changed and the person picks. Everything here is read only: it proposes an operation; the
 * ledger (lib/firestore.ts) executes it after confirmation.
 */
import { DATE_PHRASES, findAmounts, knownPlaces, nameLike, readDate, walletsIn, type QuickContext, type RecentTx } from '../quick-entry.ts';

export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'SETTLE' | 'PARTIAL_SETTLE' | 'TRANSFER' | 'SPLIT' | 'LINK' | 'UNLINK' | 'SCHEDULE' | 'RECUR' | 'STOP_RECURRING' | 'QUERY' | 'INSPECT' | 'CONFIRM';
export type TargetRef = { kind: 'transaction' | 'receivable' | 'debt' | 'claim' | 'plan' | 'recurring'; id: string; label: string; amount?: number; date?: string; time?: string; score: number; evidence: string[] };
export type FieldChange = { field: 'amount' | 'walletId' | 'date' | 'description'; before: string | number; after: string | number; label: string; inferred?: boolean };
/** V3.3: what an action does to existing state (stored on QuickResult.operation). */
export type OperationInfo = {
  type: OperationType; target?: TargetRef; targets?: TargetRef[]; candidates?: TargetRef[]; changes?: FieldChange[];
  /** A record created earlier in the same message that this payment settles ("atuy ngutang 20k terus dia bayar 5k"). */
  linkAction?: string;
  remainingBefore?: number; remainingAfter?: number; over?: number;
  /** The remaining balance the amount was worked out from ("lunas", "setengah"): checked again when saving. */
  expect?: number;
  query?: QueryAnswer; recurring?: Command['recurring'];
};
export type QueryAnswer = { question: string; answer: string; lines: { label: string; amount: number }[]; total?: number };
export type Command = {
  type: Extract<OperationType, 'UPDATE' | 'DELETE' | 'CANCEL' | 'QUERY' | 'RECUR' | 'STOP_RECURRING'>;
  target?: TargetRef; targets?: TargetRef[]; candidates: TargetRef[]; ambiguous: boolean;
  changes?: FieldChange[]; query?: QueryAnswer; recurring?: { id: string; name: string; amount?: number; before?: number; stop?: boolean; from: string; fromLabel: string };
  /** Plain sentences for "Kenapa?". */
  why: string[]; trace: string[];
};

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const lower = (t: string) => t.toLocaleLowerCase('id-ID');
const shift = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const dayLabel = (iso: string, today: string) => iso === today ? 'hari ini' : iso === shift(today, -1) ? 'kemarin' : `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const EDITABLE = new Set(['expense', 'income', 'transfer', 'debt_payment', 'receivable_payment', 'claim_payment', 'fund_contribution']);
const STOPWORDS = new Set(['ubah', 'ganti', 'edit', 'koreksi', 'ralat', 'benerin', 'betulin', 'hapus', 'hapusin', 'apus', 'apusin', 'delete', 'buang', 'batalin', 'batalkan', 'cancel', 'batal', 'yang', 'yg', 'tadi', 'td', 'barusan', 'kemarin', 'kemaren', 'kmrn', 'jadi', 'harusnya', 'seharusnya', 'bukan', 'aja', 'saja', 'dong', 'deh', 'ya', 'transaksi', 'catatan', 'semua', 'semuanya', 'itu', 'ini', 'pake', 'pakai', 'dari', 'ke', 'di', 'hari', 'terakhir', 'pertama', 'tolong', 'catat', 'nya', 'tuh', 'sih', 'aku', 'gue', 'saya', 'udah', 'sudah', 'beli', 'bayar']);
const TRANSFER_WORD = /^(transfer|tf|trf|topup|top)$/;

function txLabel(t: RecentTx, ctx: QuickContext) {
  const wallet = (id?: string | null) => ctx.wallets.find(w => w.id === id)?.name || '';
  const what = t.type === 'transfer' ? `Transfer ${wallet(t.walletId)} → ${wallet(t.destinationWalletId)}` : [t.description, t.merchant].filter(Boolean).join(' · ') || 'Transaksi';
  return `${what} ${rupiah(t.amount)} (${dayLabel(t.date, ctx.today)}${t.time ? ` ${t.time}` : ''})`;
}

/**
 * The recent entries a phrase points to. `amountHint`: an amount the phrase gives for the entry as it is now
 * ("yang 20k tadi", "bukan 20"). Returns the clear winner or the close candidates.
 */
export function resolveTransactions(phrase: string, ctx: QuickContext, amountHint?: number, all = false) {
  const text = lower(phrase), trace: string[] = [];
  const recent = (ctx.recent || []).filter(t => EDITABLE.has(t.type) && t.date >= shift(ctx.today, -14));
  const places = knownPlaces(ctx);
  const words = text.split(/[^\p{L}\p{N}']+/u).filter(w => w && !STOPWORDS.has(w) && !/^\d/.test(w) && !findAmounts(w).length);
  const today = /\b(tadi|td|barusan|hari ini)\b/.test(text), yesterday = /\b(kemarin|kemaren|kmrn)\b/.test(text);
  const last = /\bterakhir\b/.test(text), first = /\bpertama\b/.test(text);
  const newest = [...recent].sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0))[0];
  const earliestToday = [...recent].filter(t => t.date === ctx.today).sort((a, b) => (a.createdMs || 0) - (b.createdMs || 0))[0];
  const scored: TargetRef[] = recent.map(t => {
    let score = 0; const evidence: string[] = [];
    const cat = ctx.categories.find(c => c.id === (t.subcategoryId || t.categoryId))?.name || '';
    const hay = lower([t.description, t.merchant, cat, t.counterparty || ''].join(' '));
    for (const w of words) {
      const wallet = walletsIn(w, ctx.wallets)[0];
      if (wallet) { if ([t.walletId, t.destinationWalletId].includes(wallet.id)) { score += 1.5; evidence.push(`dompet ${wallet.name}`); } else score -= 1; continue; }
      if (TRANSFER_WORD.test(w)) { if (t.type === 'transfer') { score += 2; evidence.push('jenisnya transfer'); } else score -= 2; continue; }
      const alias = places.get(w);
      const hit = new RegExp(`(?:^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(hay) || (alias && lower(t.merchant || '') === lower(alias));
      if (hit) { score += 2; evidence.push(t.merchant && lower(t.merchant).includes(w) || alias && lower(t.merchant || '') === lower(alias) ? `merchant ${t.merchant}` : `kata “${w}”`); }
      else score -= 1;
    }
    if (today) { if (t.date === ctx.today) { score += 2; evidence.push('waktu “tadi” (hari ini)'); } else score -= 3; }
    if (yesterday) { if (t.date === shift(ctx.today, -1)) { score += 2; evidence.push('waktu “kemarin”'); } else score -= 3; }
    if (amountHint) { if (t.amount === amountHint || t.amount === amountHint * 1000) { score += 3; evidence.push(`nominal ${rupiah(t.amount)}`); } else score -= 2; }
    if (last && t === newest) { score += 2; evidence.push('yang terakhir dicatat'); }
    if (first && t === earliestToday) { score += 2; evidence.push('yang pertama hari ini'); }
    if (!today && !yesterday && t.date === ctx.today) score += 0.25;
    // V3.4: "yang tadi" with nothing else to go on, right after saving from this box: the entry just saved.
    if (!words.length && !amountHint && !yesterday && ctx.sessionTxIds?.[0] === t.id) { score += 3; evidence.push('yang barusan kamu catat di sini'); }
    return { kind: 'transaction' as const, id: t.id, label: txLabel(t, ctx), amount: t.amount, date: t.date, ...(t.time ? { time: t.time } : {}), score, evidence };
  }).filter(c => c.score >= 2).sort((a, b) => b.score - a.score);
  trace.push(`kandidat: ${scored.slice(0, 4).map(c => `${c.label} skor ${c.score}`).join(' · ') || 'tidak ada'}`);
  if (all) return { best: undefined, candidates: scored.filter(c => c.score >= scored[0]?.score - 0.01 - 1), ambiguous: false, trace };
  const [best, next] = scored;
  const ambiguous = Boolean(best && next && best.score - next.score < 1.5);
  return { best: best && !ambiguous ? best : undefined, candidates: ambiguous ? scored.filter(c => best.score - c.score < 1.5).slice(0, 3) : best ? [best] : [], ambiguous, trace };
}

/** "jadi 25k", "jadi pake gopay", "jadi kemarin": the new value of an entry, read against its current one. */
function readChange(value: string, target: RecentTx | undefined, ctx: QuickContext): FieldChange | null {
  const v = lower(value).trim();
  const amount = findAmounts(v).find(a => a.marked || a.value >= 10);
  if (amount) {
    // "harusnya 25" for an entry of Rp20.000: the same scale as the entry (thousands), marked as read that way.
    const inferred = !amount.marked && amount.value < 1000 && (target?.amount || 0) >= 1000;
    const after = inferred ? amount.value * 1000 : amount.value;
    return { field: 'amount', before: target?.amount ?? 0, after, label: `${target ? rupiah(target.amount) : '?'} → ${rupiah(after)}`, ...(inferred ? { inferred: true } : {}) };
  }
  const wallet = walletsIn(v, ctx.wallets)[0];
  if (wallet) { const before = ctx.wallets.find(w => w.id === target?.walletId)?.name || '?'; return { field: 'walletId', before: target?.walletId || '', after: wallet.id, label: `${before} → ${wallet.name}` }; }
  const date = new RegExp(DATE_PHRASES.source).test(v) ? readDate(v, ctx.today) : null;
  if (date?.date) return { field: 'date', before: target?.date || '', after: date.date, label: `${target ? dayLabel(target.date, ctx.today) : '?'} → ${dayLabel(date.date, ctx.today)}` };
  return null;
}

const UPDATE_VERB = /^(?:tolong\s+)?(?:ubah|ganti|edit|koreksi|ralat|benerin|betulin|ubahin|gantiin)\s+(.+?)\s+(?:jadi|menjadi)\s+(.+)$/;
const UPDATE_TAIL = /^(?:yang\s+|yg\s+)?(.+?)\s+(?:ubah|ganti|ubahin|gantiin)\s+(?:jadi|menjadi)\s+(.+)$/;
const SHOULD_BE = /^(?:yang\s+|yg\s+)?(.*?)\s*\b(?:harusnya|seharusnya|mestinya)\s+(.+?)(?:\s*,?\s*bukan\s+(.+))?$/;
const REF_JADI = /^(?:yang\s+|yg\s+)?(.+?\b(?:tadi|td|kemarin|kemaren|kmrn|barusan|terakhir)\b.*?)\s+jadi\s+(.+)$/;
const DELETE_VERB = /^(?:tolong\s+)?(?:hapus|hapusin|apus|apusin|delete|buang)\s+(.+)$/;
const CANCEL_VERB = /^(?:tolong\s+)?(?:batalin|batalkan|cancel|batal)\s+(.+)$/;
const STOP_WORD = /\b(stop|berhenti|udahan|unsubscribe|matiin|hentikan|stopin)\b/;

/** The first day of next month, or a named day ("mulai tgl 5"), from today. */
function effective(text: string, ctx: QuickContext, fallback: string) {
  if (/\bbulan depan\b/.test(text)) { const [y, m] = ctx.today.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return { from: d.toISOString().slice(0, 10), label: 'mulai bulan depan' }; }
  const named = text.match(/\bmulai\s+(.+)$/); const d = named ? readDate(named[1], ctx.today, true) : null;
  if (d?.date) return { from: d.date, label: `mulai ${dayLabel(d.date, ctx.today)}` };
  return { from: fallback, label: 'mulai jadwal berikutnya' };
}

/** The open receivables, debts and claims a question asks about, read only. */
function answer(text: string, ctx: QuickContext): QueryAnswer | null {
  const asks = /\b(berapa|brp|siapa|apa aja|mana aja)\b|\?\s*$/.test(text);
  if (!asks || findAmounts(text).some(a => a.marked)) return null;
  const words = text.split(/[^\p{L}]+/u);
  const person = words.find(w => w.length >= 3 && nameLike(w, ctx) && !/^(berapa|siapa|total|masih|piutang|utang|hutang|sisa|klaim|semua|belum|bayar|aja|saja)$/.test(w));
  const open = (ctx.receivables || []).filter(r => r.remainingAmount > 0), debts = (ctx.debts || []).filter(d => d.outstandingAmount > 0), claims = (ctx.claims || []).filter(c => c.remainingAmount > 0);
  const sum = (xs: { amount: number }[]) => xs.reduce((n, x) => n + x.amount, 0);
  const mine = /\b(aku|gue|gw|saya|ane)\b/.test(text);
  if (/\bklaim\b/.test(text)) { const lines = claims.map(c => ({ label: c.name, amount: c.remainingAmount })); return { question: text, answer: lines.length ? `Klaim yang belum cair ${rupiah(sum(lines))}.` : 'Tidak ada klaim yang belum cair.', lines, total: sum(lines) }; }
  if (/\bsiapa\b/.test(text) && /\b(belum bayar|masih ngutang|masih utang|punya utang|ngutang)\b/.test(text)) {
    const by = new Map<string, number>(); for (const r of open) by.set(r.person, (by.get(r.person) || 0) + r.remainingAmount);
    const lines = [...by].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    return { question: text, answer: lines.length ? `${lines.length} orang belum lunas: ${lines.map(l => `${l.label} ${rupiah(l.amount)}`).join(', ')}.` : 'Semua piutang sudah lunas.', lines, total: sum(lines) };
  }
  // "sisa utang gue ke aldi", "utang gue total": the user's debts; "atuy masih ngutang", "piutang gue total": receivables.
  // "rian masih punya utang ke gue": a person owing the user (a receivable); "utang gue ke aldi": the user's debt.
  const owesMe = /\bke\s+(?:aku|gue|gw|saya|ane)\b/.test(text) || Boolean(person) && new RegExp(`\\b${person}\\b.*\\b(?:masih\\s+)?(?:punya\\s+)?(?:utang|hutang|ngutang)`).test(text) && !/\b(?:aku|gue|gw|saya)\b.*\b(?:utang|hutang)\b.*\bke\b/.test(text);
  const debtSide = mine && !owesMe && /\b(utang|hutang)\b/.test(text) && !/\bpiutang\b/.test(text);
  if (debtSide) {
    const list = debts.filter(d => !person || lower(`${d.provider} ${d.name}`).split(/\s+/).includes(person));
    const lines = list.map(d => ({ label: d.provider ? `${d.name} (${d.provider})` : d.name, amount: d.outstandingAmount }));
    return { question: text, answer: person ? (lines.length ? `Sisa utangmu ke ${person[0].toUpperCase() + person.slice(1)} ${rupiah(sum(lines))}.` : `Tidak ada utang ke ${person} yang tercatat.`) : `Total utangmu ${rupiah(sum(lines))}.`, lines, total: sum(lines) };
  }
  if (/\b(utang|hutang|ngutang|piutang|minjem|pinjam|bayar)\b/.test(text)) {
    const list = open.filter(r => !person || lower(r.person).split(/\s+/).includes(person));
    const lines = list.map(r => ({ label: r.description ? `${r.person} (${r.description})` : r.person, amount: r.remainingAmount }));
    const name = person ? person[0].toUpperCase() + person.slice(1) : '';
    return { question: text, answer: person ? (lines.length ? `${name} masih berutang ${rupiah(sum(lines))} ke kamu.` : `${name} tidak punya piutang yang terbuka.`) : `Total piutangmu ${rupiah(sum(lines))}.`, lines, total: sum(lines) };
  }
  return null;
}

/**
 * Reads a whole message as an operation on existing records, or null when it is something to create (the normal path).
 * `text` is the normalized message (lib/quick-plan.ts normalizeQuick).
 */
export function readCommand(text: string, ctx: QuickContext): Command | null {
  const t = text.trim().replace(/[.!]+$/, '');
  const trace: string[] = [];
  // QUERY first: a question never changes anything.
  const q = answer(t, ctx);
  if (q) return { type: 'QUERY', candidates: [], ambiguous: false, query: q, why: ['Ini pertanyaan, jadi tidak ada yang dicatat atau diubah.'], trace: [`pertanyaan: ${q.answer}`] };

  // Recurring rules named in the message: a new amount or a stop.
  for (const rule of (ctx.recurring || []).filter(r => r.active)) {
    const name = lower(rule.name);
    if (!name.split(/\s+/).some(w => w.length >= 3 && new RegExp(`\\b${w}\\b`).test(t))) continue;
    const stop = STOP_WORD.test(t) || /\b(?:batalin|batalkan|cancel)\s+(?:langganan\s+)?/.test(t) && /\blangganan\b|\bbulan depan\b/.test(t);
    const change = t.match(/\b(?:jadi|naik jadi|turun jadi|menjadi)\s+((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?)/);
    if (!stop && !change) continue;
    const { from, label } = effective(t, ctx, stop ? ctx.today : rule.nextDate);
    const amount = change ? findAmounts(change[1])[0]?.value : undefined;
    const why = stop ? [`Jadwal rutin ${rule.name} berhenti ${label}; transaksi yang sudah tercatat tidak berubah.`] : [`Jadwal rutin ${rule.name} jadi ${rupiah(amount!)} ${label}; transaksi ${rule.name} sebelumnya tetap ${rupiah(rule.amount)}.`];
    return { type: stop ? 'STOP_RECURRING' : 'RECUR', target: { kind: 'recurring', id: rule.id, label: rule.name, amount: rule.amount, score: 3, evidence: [`nama jadwal “${rule.name}”`] }, candidates: [], ambiguous: false, recurring: { id: rule.id, name: rule.name, ...(amount ? { amount, before: rule.amount } : {}), ...(stop ? { stop: true } : {}), from, fromLabel: label }, why, trace: [`jadwal rutin: ${rule.name} ${stop ? 'berhenti' : `→ ${rupiah(amount!)}`} ${label} (${from})`] };
  }

  let type: Command['type'] | null = null, phrase = '', value = '', hint: number | undefined;
  let m: RegExpMatchArray | null;
  if ((m = t.match(UPDATE_VERB)) || (m = t.match(UPDATE_TAIL))) { type = 'UPDATE'; phrase = m[1]; value = m[2]; }
  else if ((m = t.match(SHOULD_BE)) && /\b(tadi|td|kemarin|kemaren|kmrn|barusan|terakhir|yang|yg)\b/.test(t)) { type = 'UPDATE'; phrase = m[1] || ''; value = m[2]; const old = m[3] ? findAmounts(m[3])[0] : undefined; if (old) hint = old.value; }
  else if ((m = t.match(REF_JADI)) && findAmounts(m[2]).length) { type = 'UPDATE'; phrase = m[1]; value = m[2]; }
  else if ((m = t.match(DELETE_VERB))) { type = 'DELETE'; phrase = m[1]; }
  else if ((m = t.match(CANCEL_VERB)) && !findAmounts(m[1]).some(a => a.marked)) { type = 'CANCEL'; phrase = m[1]; }
  if (!type) return null;
  // "yang 20k tadi": an amount inside the phrase describes the entry as it is now.
  const inPhrase = findAmounts(phrase)[0]; if (inPhrase && hint === undefined) { hint = inPhrase.value; phrase = phrase.replace(inPhrase.text, ' ').replace(/\s+/g, ' '); }
  const bulk = type !== 'UPDATE' && /\b(semua|semuanya)\b/.test(phrase);
  const found = resolveTransactions(phrase, ctx, hint, bulk);
  trace.push(`perintah ${type}: “${phrase.trim()}”${hint ? ` (nominal sekarang ${rupiah(hint)})` : ''}`, ...found.trace);
  const target = found.best, targetTx = target ? ctx.recent?.find(x => x.id === target.id) : undefined;
  const change = type === 'UPDATE' ? readChange(value, targetTx, ctx) : null;
  if (type === 'UPDATE' && !change) return null;
  if (!found.candidates.length) {
    return { type, candidates: [], ambiguous: false, ...(change ? { changes: [change] } : {}), why: [`Tidak ada transaksi terbaru yang cocok dengan “${phrase.trim()}”, jadi tidak ada yang diubah.`], trace };
  }
  const why: string[] = [];
  if (bulk) why.push(`${found.candidates.length} transaksi cocok dengan “${phrase.trim()}”.`);
  else if (target) why.push(`${target.label} dipilih karena cocok dengan ${target.evidence.join(', ')}.`);
  else why.push(`Ada ${found.candidates.length} transaksi yang sama-sama cocok, jadi kamu yang memilih: tidak ada yang diubah sebelum itu.`);
  if (change?.inferred) why.push(`“${value.trim()}” dibaca ${rupiah(Number(change.after))} karena transaksinya ${rupiah(Number(change.before))}.`);
  return { type, ...(target ? { target } : {}), ...(bulk ? { targets: found.candidates } : {}), candidates: found.candidates, ambiguous: found.ambiguous, ...(change ? { changes: [change] } : {}), why, trace };
}
