/**
 * Split Bill: the arithmetic, the payment status, the receipt reader and the texts to share. Pure functions, no storage.
 *
 * A bill is an optional list of items plus extra costs (tax, service, discounts, fees, tip, rounding, shared costs).
 *  - Subtotal: the items, or — without items — the total paid minus the extra costs.
 *  - Each person's part of the subtotal comes from the chosen method: equal, the items they had (shared items, units of
 *    an item with a quantity, or custom amounts), a manual amount, or a percentage.
 *  - Every extra cost is divided among the people it applies to: in proportion to their subtotal (the default for tax,
 *    service and discounts), equally (fees and shared costs), or in custom amounts. A discount on one item only lowers
 *    that item, so only the people who had it get it.
 * Every division uses the largest-remainder method, so the parts always add up to the whole Rupiah amount
 * (Rp100.000 / 3 → 33.334 + 33.333 + 33.333) and the shares always add up to the bill total.
 */
import { allocate, rupiah } from './accounting.ts';
export { allocate };
import { formatDate } from './period.ts';
import type { Debt, ReceiptSnapshot, ReceiptSnapshotCharge, Receivable, SplitBill, SplitExtra, SplitExtraKind, SplitItem, SplitMethod, SplitParticipant } from './types';

export const METHOD_LABELS: Record<SplitMethod, string> = { equal: 'Bagi rata', items: 'Sesuai pesanan', amount: 'Nominal manual', percent: 'Persentase' };
export const EXTRA_LABELS: Record<SplitExtraKind, string> = { tax: 'Pajak / PB1', service: 'Service', discount: 'Diskon / promo', delivery: 'Ongkos kirim', admin: 'Biaya admin', tip: 'Tip', rounding: 'Pembulatan', other: 'Biaya lain', shared: 'Biaya bersama' };
/** Tax, service and discounts follow what each person ordered; a fee or a shared cost (court rental, parking) is split equally. */
export const defaultDistribution = (kind: SplitExtraKind) => kind === 'tax' || kind === 'service' || kind === 'discount' || kind === 'tip' || kind === 'rounding' ? 'proportional' as const : 'equal' as const;
export const isDeduction = (kind: SplitExtraKind) => kind === 'discount';

export type SplitDraft = Pick<SplitBill, 'total' | 'method' | 'participants' | 'items' | 'extras'> & Partial<Pick<SplitBill, 'categoryId' | 'subcategoryId' | 'payer' | 'payerId'>>;
export type ShareLine = { key: string; label: string; amount: number; kind: 'item' | 'base' | SplitExtraKind; categoryId: string | null; subcategoryId: string | null };
export type PersonShare = { id: string; name: string; isMe: boolean; base: number; lines: ShareLine[]; total: number };
export type SplitIssue = { step: 'bill' | 'people' | 'items' | 'extras' | 'split'; message: string };
export type ResolvedExtra = { id: string; kind: SplitExtraKind; label: string; amount: number };
export type SplitResult = {
  /** Items (after item discounts), or the total minus the extra costs when there are no items. */
  subtotal: number;
  extras: ResolvedExtra[];
  /** What the bill comes to; with items this is computed, otherwise it is the total entered. */
  total: number;
  /** Items + extras differ from the total entered (items only): positive = the items are short of the total. */
  mismatch: number;
  allocated: number;
  /** Total minus what is divided: positive = still to divide, negative = divided too much. */
  unassigned: number;
  unassignedItems: { id: string; name: string; amount: number }[];
  people: PersonShare[];
  /** Participant id → final share. */
  shares: Record<string, number>;
  issues: SplitIssue[];
  ok: boolean;
};

const lineOf = (item: SplitItem) => Math.max(0, Math.round(item.qty || 0) * Math.round(item.price || 0) - Math.max(0, Math.round(item.discount || 0)));
const itemLabel = (item: SplitItem) => item.name.trim() || 'Item';
const extraLabel = (extra: Pick<SplitExtra, 'kind' | 'label'>) => extra.label.trim() || EXTRA_LABELS[extra.kind];
const money = (value: number) => rupiah(Math.abs(value));
/** "Masih ada Rp12.500 yang belum dibagi." / "Pembagian lebih Rp5.000." (with a prefix: "PB1: masih ada …"). */
export function differenceText(difference: number, prefix = '') {
  if (!difference) return '';
  const text = difference > 0 ? `masih ada ${money(difference)} yang belum dibagi.` : `pembagian lebih ${money(difference)}.`;
  return prefix ? prefix + text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** The amount of each extra cost, signed (a discount is negative). `percent` counts only when the subtotal comes from items. */
export function resolveExtras(extras: SplitExtra[], itemsSubtotal: number | null): ResolvedExtra[] {
  const service = extras.filter(extra => extra.kind === 'service');
  const amountOf = (extra: SplitExtra, base: number) => itemsSubtotal !== null && extra.percent && extra.percent > 0 ? Math.round(base * extra.percent / 100) : Math.round(extra.amount || 0);
  const serviceTotal = itemsSubtotal === null ? 0 : service.reduce((sum, extra) => sum + Math.abs(amountOf(extra, itemsSubtotal)), 0);
  return extras.map(extra => {
    // Restaurant tax (PB1) is charged on the food plus the service charge.
    const raw = amountOf(extra, extra.kind === 'tax' ? (itemsSubtotal || 0) + serviceTotal : itemsSubtotal || 0);
    const amount = extra.kind === 'rounding' ? raw : isDeduction(extra.kind) ? -Math.abs(raw) : Math.abs(raw);
    return { id: extra.id, kind: extra.kind, label: extraLabel(extra), amount };
  });
}

/** Works out every person's share and everything that still needs attention before the bill can be saved. */
export function computeSplit(bill: SplitDraft): SplitResult {
  const issues: SplitIssue[] = [];
  const add = (step: SplitIssue['step'], message: string) => { if (message && !issues.some(issue => issue.message === message)) issues.push({ step, message }); };
  /** A difference already explained by a more specific message (percentages, a custom division). */
  let explained = false;
  const explain = (step: SplitIssue['step'], message: string) => { explained = true; add(step, message); };
  const people = bill.participants.filter(person => person.id);
  const index = new Map(people.map((person, i) => [person.id, i]));
  const category = { categoryId: bill.categoryId || null, subcategoryId: bill.subcategoryId || null };
  const lines: ShareLine[][] = people.map(() => []);
  const base = people.map(() => 0);
  if (people.length < 2) add('people', 'Tambahkan minimal 2 orang.');
  const names = new Map<string, number>();
  for (const person of people) { const key = person.name.trim().toLocaleLowerCase('id-ID'); if (!key) add('people', 'Ada orang yang belum diberi nama.'); else names.set(key, (names.get(key) || 0) + 1); }
  for (const [name, count] of names) if (count > 1) add('people', `Nama “${people.find(person => person.name.trim().toLocaleLowerCase('id-ID') === name)?.name.trim()}” dipakai lebih dari sekali. Beri nama yang berbeda.`);

  // Items and the subtotal.
  const items = bill.items || [];
  const hasItems = items.length > 0;
  const unassignedItems: SplitResult['unassignedItems'] = [];
  for (const item of items) {
    if (!Number.isFinite(item.qty) || item.qty < 1 || !Number.isInteger(item.qty) || !Number.isSafeInteger(item.price) || item.price < 0) add('items', `${itemLabel(item)}: jumlah atau harga belum benar.`);
    if ((item.discount || 0) > Math.round(item.qty || 0) * Math.round(item.price || 0)) add('items', `Diskon ${itemLabel(item)} lebih besar dari harganya.`);
  }
  const itemsSubtotal = hasItems ? items.reduce((sum, item) => sum + lineOf(item), 0) : null;
  const extras = resolveExtras(bill.extras || [], itemsSubtotal).filter(extra => extra.amount !== 0);
  const extrasTotal = extras.reduce((sum, extra) => sum + extra.amount, 0);
  const declared = Math.max(0, Math.round(bill.total || 0));
  const subtotal = itemsSubtotal ?? declared - extrasTotal;
  const total = subtotal + extrasTotal;
  const mismatch = hasItems && declared > 0 ? declared - total : 0;
  if (!hasItems && declared <= 0) add('bill', 'Isi total tagihan.');
  else if (!hasItems && subtotal < 0) add('extras', 'Biaya tambahan lebih besar dari total tagihan.');
  else if (total <= 0) add(hasItems ? 'items' : 'bill', 'Total tagihan harus lebih dari nol.');
  if (mismatch) add('extras', `Rincian ${rupiah(total)} belum sama dengan total tagihan ${rupiah(declared)} (selisih ${money(mismatch)}).`);

  // Each person's part of the subtotal.
  const method = bill.method;
  if (method === 'items') {
    if (!hasItems) add('items', 'Tambahkan item, atau pilih cara bagi yang lain.');
    const ordered = (ids: string[]) => [...new Set(ids)].filter(id => index.has(id)).sort((a, b) => index.get(a)! - index.get(b)!);
    for (const item of items) {
      const line = lineOf(item), label = itemLabel(item), byUnits = item.assign === 'units' && item.qty > 1;
      const takers = byUnits ? ordered(Object.keys(item.units || {}).filter(id => (item.units?.[id] || 0) > 0))
        : item.assign === 'custom' ? ordered([...(item.people || []), ...Object.keys(item.custom || {}).filter(id => (item.custom?.[id] || 0) > 0)])
        : ordered(item.people || []);
      let parts: number[] = [], rest = 0;
      if (byUnits) {
        const units = takers.map(id => Math.max(0, Math.round(item.units?.[id] || 0)));
        const used = units.reduce((a, b) => a + b, 0);
        if (used > item.qty) { explain('items', `${label}: dipilih ${used} dari ${item.qty}.`); parts = takers.map(() => 0); rest = line; }
        else { const divided = allocate(line, [...units, item.qty - used]); parts = divided.slice(0, -1); rest = divided[divided.length - 1]; }
      } else if (item.assign === 'custom') {
        parts = takers.map(id => Math.max(0, Math.round(item.custom?.[id] || 0)));
        rest = line - parts.reduce((a, b) => a + b, 0);
        if (rest < 0) explain('items', differenceText(rest, `${label}: `));
      } else if (takers.length) parts = allocate(line, takers.map(() => 1));
      else rest = line;
      takers.forEach((id, i) => { const amount = parts[i] || 0; if (!amount) return; const at = index.get(id)!; base[at] += amount; lines[at].push({ key: `item:${item.id}`, label: takers.length > 1 && item.assign === 'shared' ? `${label} (dibagi ${takers.length})` : item.assign === 'units' && item.qty > 1 ? `${label} ×${item.units?.[id] || 0}` : label, amount, kind: 'item', categoryId: item.categoryId || category.categoryId, subcategoryId: item.categoryId ? item.subcategoryId || null : category.subcategoryId }); });
      if (rest > 0) unassignedItems.push({ id: item.id, name: label, amount: rest });
    }
  } else if (method === 'equal') {
    allocate(subtotal, people.map(() => 1)).forEach((amount, i) => { base[i] = amount; });
  } else if (method === 'amount') {
    people.forEach((person, i) => { base[i] = Math.max(0, Math.round(person.amount || 0)); });
    const difference = subtotal - base.reduce((a, b) => a + b, 0);
    if (difference && extras.length) explain('split', differenceText(difference, 'Nominal sebelum biaya tambahan: '));
  } else if (method === 'percent') {
    const points = people.map(person => Math.max(0, Math.round(person.percent || 0)));
    const sum = points.reduce((a, b) => a + b, 0);
    if (sum === 10000) allocate(subtotal, points).forEach((amount, i) => { base[i] = amount; });
    else {
      points.forEach((point, i) => { base[i] = Math.floor(subtotal * point / 10000); });
      const percent = (value: number) => `${(value / 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
      explain('split', sum < 10000 ? `Persentase baru ${percent(sum)}. Masih kurang ${percent(10000 - sum)}.` : `Persentase lebih ${percent(sum - 10000)}.`);
    }
  }
  if (method !== 'items') people.forEach((_, i) => { if (base[i]) lines[i].push({ key: 'base', label: hasItems ? 'Pesanan' : 'Bagian', amount: base[i], kind: 'base', ...category }); });

  // Extra costs, each divided among the people it applies to.
  for (const extra of extras) {
    const source = (bill.extras || []).find(row => row.id === extra.id);
    const chosen = (source?.people || []).filter(id => index.has(id));
    if (source?.people?.length && !chosen.length) { explain('extras', `${extra.label}: pilih siapa yang ikut menanggung.`); continue; }
    const takers = (chosen.length ? chosen : people.map(person => person.id)).sort((a, b) => index.get(a)! - index.get(b)!);
    let parts: number[];
    if (source?.distribution === 'custom') {
      parts = takers.map(id => Math.abs(Math.round(source.custom?.[id] || 0)) * Math.sign(extra.amount));
      const difference = extra.amount - parts.reduce((a, b) => a + b, 0);
      if (difference) explain('extras', differenceText(extra.amount < 0 ? -difference : difference, `${extra.label}: `));
    } else if (source?.distribution === 'equal') parts = allocate(extra.amount, takers.map(() => 1));
    else parts = allocate(extra.amount, takers.map(id => Math.max(0, base[index.get(id)!])));
    takers.forEach((id, i) => { const amount = parts[i] || 0; if (!amount) return; const at = index.get(id)!; lines[at].push({ key: `extra:${extra.id}`, label: extra.label, amount, kind: extra.kind, categoryId: source?.categoryId || category.categoryId, subcategoryId: source?.categoryId ? source.subcategoryId || null : category.subcategoryId }); });
  }

  // Rounding or a correction on someone's total ("dibulatkan jadi Rp40.000"): the payer takes the opposite amount,
  // so what everyone owes still adds up to the bill.
  const payerAt = bill.payer === 'other' ? people.findIndex(person => person.id === bill.payerId) : people.findIndex(person => person.isMe);
  let shifted = 0;
  people.forEach((person, i) => {
    const adjust = Math.round(person.adjust || 0);
    if (!adjust || i === payerAt) return;
    lines[i].push({ key: 'adjust', label: adjust > 0 ? 'Pembulatan' : 'Koreksi', amount: adjust, kind: 'rounding', ...category });
    shifted += adjust;
  });
  if (shifted && payerAt >= 0) lines[payerAt].push({ key: 'adjust', label: 'Selisih pembulatan teman', amount: -shifted, kind: 'rounding', ...category });
  const result = people.map((person, i) => ({ id: person.id, name: person.name.trim(), isMe: Boolean(person.isMe), base: base[i], lines: lines[i], total: lines[i].reduce((sum, line) => sum + line.amount, 0) }));
  for (const person of result) if (person.total < 0) add('split', `Bagian ${person.name || 'seseorang'} jadi minus. Ubah cara bagi diskonnya.`);
  const allocated = result.reduce((sum, person) => sum + person.total, 0);
  const unassigned = total - allocated;
  if (unassigned && total > 0 && (!explained || unassignedItems.length)) add(method === 'items' && unassignedItems.length ? 'items' : 'split', differenceText(unassigned));
  return { subtotal, extras, total, mismatch, allocated, unassigned, unassignedItems, people: result, shares: Object.fromEntries(result.map(person => [person.id, person.total])), issues, ok: issues.length === 0 };
}

/** The user's own share by category, for the ledger (one line per category, largest first). */
export function ownCategoryLines(share: PersonShare | undefined) {
  const rows = new Map<string, { categoryId: string; subcategoryId: string | null; amount: number }>();
  for (const line of share?.lines || []) {
    if (!line.categoryId) continue;
    const key = `${line.categoryId}:${line.subcategoryId || ''}`;
    const row = rows.get(key) || { categoryId: line.categoryId, subcategoryId: line.subcategoryId, amount: 0 };
    row.amount += line.amount; rows.set(key, row);
  }
  return [...rows.values()].filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ Payment status */

export type PersonStatus = 'payer' | 'paid' | 'partial' | 'unpaid';
export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = { payer: 'Yang bayar', paid: 'Lunas', partial: 'Bayar sebagian', unpaid: 'Belum bayar' };
export type BillStatus = 'draft' | 'active' | 'partial' | 'settled' | 'cancelled';
export const BILL_STATUS_LABELS: Record<BillStatus, string> = { draft: 'Draft', active: 'Aktif', partial: 'Sebagian lunas', settled: 'Lunas', cancelled: 'Dibatalkan' };
/** How a person pays: back to the user (Piutang), the user's own part to someone else (Utang), or between two other people. */
export type PersonRole = 'payer' | 'receivable' | 'debt' | 'between';
export type PersonProgress = { id: string; name: string; isMe: boolean; share: number; paid: number; remaining: number; status: PersonStatus; role: PersonRole; record?: Receivable | Debt };
export type BillProgress = { status: BillStatus; people: PersonProgress[]; owed: number; paid: number; remaining: number; counts: Record<PersonStatus, number>; payerName: string; myShare: number; toMe: number; fromMe: number };

/** Who paid the bill: the user, or one of the people in it. */
export function payerOf(bill: Pick<SplitBill, 'payer' | 'payerId' | 'participants'>) {
  return bill.payer === 'me' ? bill.participants.find(person => person.isMe) : bill.participants.find(person => person.id === bill.payerId);
}

/**
 * Paid and remaining per person. Money owed to the user lives in its Piutang, the user's own part of a bill someone else
 * paid lives in its Utang (both keep their payment history in the ledger), and payments between two other people are kept
 * on the bill. Shares are the ones saved with the bill.
 */
export function billProgress(bill: SplitBill, receivables: Receivable[], debts: Debt[], shares: Record<string, number> = bill.shares || {}): BillProgress {
  const byId = <T extends { id: string }>(list: T[], id?: string | null) => id ? list.find(row => row.id === id) : undefined;
  const payer = payerOf(bill);
  const people: PersonProgress[] = bill.participants.map(person => {
    const share = Math.max(0, shares[person.id] || 0), isMe = Boolean(person.isMe), name = person.name.trim();
    if ((bill.payer === 'me' && isMe) || (bill.payer === 'other' && person.id === bill.payerId)) return { id: person.id, name, isMe, share, paid: share, remaining: 0, status: 'payer', role: 'payer' };
    let paid = 0, remaining = share, role: PersonRole = 'between', record: Receivable | Debt | undefined;
    if (bill.payer === 'me') {
      role = 'receivable'; record = byId(receivables, person.receivableId);
      if (record) { paid = Math.max(0, record.originalAmount - record.remainingAmount); remaining = Math.max(0, record.remainingAmount); }
    } else if (isMe) {
      role = 'debt'; record = byId(debts, person.debtId);
      if (record) { paid = Math.max(0, record.originalAmount - (record as Debt).outstandingAmount); remaining = Math.max(0, (record as Debt).outstandingAmount); }
    } else {
      paid = (bill.payments || []).filter(payment => payment.participantId === person.id).reduce((sum, payment) => sum + payment.amount, 0);
      remaining = Math.max(0, share - paid);
    }
    const status: PersonStatus = share > 0 && remaining <= 0 || share === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    return { id: person.id, name, isMe, share, paid, remaining, status, role, record };
  });
  const owing = people.filter(person => person.role !== 'payer');
  const counts: Record<PersonStatus, number> = { payer: 0, paid: 0, partial: 0, unpaid: 0 };
  for (const person of people) counts[person.status]++;
  const owed = owing.reduce((sum, person) => sum + person.share, 0), paid = owing.reduce((sum, person) => sum + Math.min(person.share, person.paid), 0), remaining = owing.reduce((sum, person) => sum + person.remaining, 0);
  const status: BillStatus = bill.status === 'draft' ? 'draft' : bill.status === 'cancelled' ? 'cancelled' : remaining <= 0 ? 'settled' : paid > 0 ? 'partial' : 'active';
  const me = people.find(person => person.isMe);
  return {
    status, people, owed, paid, remaining, counts, payerName: payer ? (payer.isMe ? 'Kamu' : payer.name.trim()) : '',
    myShare: me?.share || 0,
    toMe: bill.payer === 'me' ? owing.reduce((sum, person) => sum + person.remaining, 0) : 0,
    fromMe: bill.payer === 'other' ? (me?.remaining || 0) : 0,
  };
}

/* ------------------------------------------------------------------ Texts to share */

const shortDate = (date: string) => formatDate(date, false);
/** How the user is called in texts meant for friends. */
const nameFor = (person: Pick<SplitParticipant, 'name' | 'isMe'> | undefined, myName: string) => person?.isMe ? (myName.trim() || 'saya') : person?.name.trim() || '';

/** One person's part: what it is made of and whom to pay. Only this bill; no balances or other private details. */
export function personShareText(bill: SplitBill, result: SplitResult, participantId: string, options: { myName?: string; remaining?: number } = {}) {
  const person = result.people.find(row => row.id === participantId);
  const participant = bill.participants.find(row => row.id === participantId);
  if (!person || !participant) return '';
  const payer = payerOf(bill);
  const items = person.lines.filter(line => line.kind === 'item' || line.kind === 'base');
  const charges = person.lines.filter(line => line.kind === 'tax' || line.kind === 'service');
  const other = person.lines.filter(line => line.kind !== 'item' && line.kind !== 'base' && !charges.includes(line));
  const signed = (value: number) => `${value < 0 ? '−' : ''}${rupiah(Math.abs(value))}`;
  const text = [`*${bill.title.trim() || 'Split Bill'}*`, `${shortDate(bill.date)}${bill.merchant.trim() ? ` · ${bill.merchant.trim()}` : ''}`, '', nameFor(participant, options.myName || '')];
  if (items.length > 6) text.push(`Pesanan (${items.length} item): ${rupiah(items.reduce((sum, line) => sum + line.amount, 0))}`);
  else for (const line of items) text.push(`${line.label}: ${rupiah(line.amount)}`);
  // Tax and service together, as on most receipts ("PB1 + Service").
  if (charges.length) text.push(`${charges.map(line => line.label).join(' + ')}: ${signed(charges.reduce((sum, line) => sum + line.amount, 0))}`);
  for (const line of other) text.push(`${line.label}: ${signed(line.amount)}`);
  text.push('', `TOTAL: ${rupiah(person.total)}`);
  if (options.remaining !== undefined && options.remaining !== person.total) text.push(options.remaining > 0 ? `Sisa: ${rupiah(options.remaining)}` : 'Sudah lunas, terima kasih!');
  if (payer && payer.id !== participantId) text.push(`Bayar ke: ${nameFor(payer, options.myName || '')}`);
  return text.join('\n');
}

/** The whole bill for a group chat: each person's total and whom to pay. */
export function billShareText(bill: SplitBill, result: SplitResult, options: { myName?: string; progress?: BillProgress } = {}) {
  const payer = payerOf(bill);
  const text = [`*Split Bill — ${bill.title.trim() || 'Tagihan'}*`, `${shortDate(bill.date)}${bill.merchant.trim() ? ` · ${bill.merchant.trim()}` : ''}`, ''];
  for (const person of result.people) {
    const participant = bill.participants.find(row => row.id === person.id);
    const state = options.progress?.people.find(row => row.id === person.id);
    const note = !state || state.role === 'payer' ? (participant && payer?.id === participant.id ? ' (yang bayar)' : '') : state.status === 'paid' ? ' ✓ lunas' : state.status === 'partial' ? ` (sisa ${rupiah(state.remaining)})` : '';
    text.push(`${nameFor(participant, options.myName || '')}: ${rupiah(person.total)}${note}`);
  }
  text.push('', `Total: ${rupiah(result.total)}`);
  if (payer) text.push(`Bayar ke: ${nameFor(payer, options.myName || '')}`);
  return text.join('\n');
}

/* ------------------------------------------------------------------ Nota: the bill as a receipt to share */

export type NotaPerson = { name: string; note: string; lines: [label: string, amount: number][]; total: number };
export type Nota = { title: string; place: string; when: string; people: NotaPerson[]; total: number; payTo: string; single: boolean };

/**
 * The bill as a receipt for the group: per person what they had and their total, then the bill total and whom to pay.
 * With `only`, just that person's part. Only this bill; no balances or other private details.
 */
export function billNota(bill: SplitBill, result: SplitResult, options: { myName?: string; progress?: BillProgress; only?: string } = {}): Nota {
  const payer = payerOf(bill), myName = options.myName || '';
  const people = result.people.filter(person => !options.only || person.id === options.only).map(person => {
    const participant = bill.participants.find(row => row.id === person.id);
    const state = options.progress?.people.find(row => row.id === person.id);
    const items = person.lines.filter(line => line.kind === 'item' || line.kind === 'base');
    const charges = person.lines.filter(line => line.kind === 'tax' || line.kind === 'service');
    const other = person.lines.filter(line => line.kind !== 'item' && line.kind !== 'base' && !charges.includes(line));
    // "Kentang (dibagi 3)" reads as "Kentang ÷3" on a narrow nota.
    const lines: [string, number][] = items.map(line => [line.label.replace(/ \(dibagi (\d+)\)$/, ' ÷$1'), line.amount]);
    if (charges.length) lines.push([charges.map(line => line.label).join(' + '), charges.reduce((sum, line) => sum + line.amount, 0)]);
    for (const line of other) lines.push([line.label, line.amount]);
    const isPayer = Boolean(participant && payer?.id === participant.id);
    const note = isPayer ? 'yang bayar' : !state || state.role === 'payer' ? '' : state.status === 'paid' ? 'lunas' : state.status === 'partial' ? `sisa ${rupiah(state.remaining)}` : '';
    return { name: nameFor(participant, myName) || person.name, note, lines, total: person.total };
  });
  return { title: bill.title.trim() || 'Split Bill', place: bill.merchant.trim() !== bill.title.trim() ? bill.merchant.trim() : '', when: `${formatDate(bill.date)}${bill.time ? ` · ${bill.time}` : ''}`, people, total: options.only ? people[0]?.total || 0 : result.total, payTo: payer && !(options.only && payer.id === options.only) ? nameFor(payer, myName) : '', single: Boolean(options.only) };
}

const plain = (value: number) => `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('id-ID')}`;
/** Splits text into lines of at most `width` characters, at spaces where possible. */
function wrap(text: string, width: number) {
  const out: string[] = []; let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word; else if (line.length + 1 + word.length <= width) line += ` ${word}`; else { out.push(line); line = word; }
    while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width); }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}
/** A label and an amount on one line of `width` characters (the label wraps above when it is long). */
function row(label: string, amount: string, width: number) {
  const room = width - amount.length - 1, parts = wrap(label, Math.max(8, room)), last = parts.pop()!;
  return [...parts, last.length <= room ? `${last}${' '.repeat(width - last.length - amount.length)}${amount}` : `${last}\n${' '.repeat(width - amount.length)}${amount}`].join('\n');
}
const center = (text: string, width: number) => wrap(text, width).map(line => `${' '.repeat(Math.max(0, Math.floor((width - line.length) / 2)))}${line}`).join('\n');

/** The nota as text in a fixed-width block (WhatsApp shows ```…``` in a monospace font), so the columns line up. */
export function notaText(nota: Nota, width = 30) {
  const rule = '-'.repeat(width), double = '='.repeat(width), out: string[] = [];
  out.push(center(nota.single ? 'TAGIHAN SPLIT BILL' : 'NOTA SPLIT BILL', width), center(nota.title, width));
  if (nota.place) out.push(center(nota.place, width));
  out.push(center(nota.when, width), double);
  nota.people.forEach((person, index) => {
    if (index) out.push(rule);
    out.push(wrap(`${person.name.toUpperCase()}${person.note ? ` (${person.note})` : ''}`, width).join('\n'));
    for (const [label, amount] of person.lines) out.push(row(label, plain(amount), width - 1).split('\n').map(line => ` ${line}`).join('\n'));
    if (!nota.single) { const total = rupiah(person.total); out.push(`${' '.repeat(width - total.length)}${'-'.repeat(total.length)}`, row(' Total', total, width)); }
  });
  out.push(double, row(nota.single ? 'TOTAL KAMU' : 'TOTAL TAGIHAN', rupiah(nota.total), width));
  if (nota.payTo) out.push(`Bayar ke: ${nota.payTo}`);
  out.push(rule, center('Terima kasih!', width));
  return `\`\`\`\n${out.join('\n')}\n\`\`\``;
}

/** A friendly, neutral reminder; the user edits it before sending it themselves. */
export function reminderText(bill: SplitBill, participant: Pick<SplitParticipant, 'name' | 'isMe'>, remaining: number) {
  const payer = payerOf(bill);
  const to = payer && !payer.isMe ? `, dibayar ke ${payer.name.trim()}` : '';
  return `Hai ${participant.name.trim()}, bagian Split Bill ${bill.title.trim()} tanggal ${shortDate(bill.date)} masih ${rupiah(remaining)} ya${to}. Terima kasih!`;
}

/* ------------------------------------------------------------------ Receipt text */

/** The receipt reader lives in receipt.ts (shared with Scan struk for transactions). */
export { readAmount, readReceiptText, type ReceiptLine, type ReceiptRead } from './receipt.ts';

/**
 * A receipt checked in the shared Scan struk review → a bill's items and extra costs. The input is the structured
 * snapshot of what the person confirmed (their corrections included), never the raw reading:
 *  - items keep their gross unit price and their own discount, so the amount to share is the net one
 *    (Burger Rp50.000 − Rp10.000 → Rp40.000 to share);
 *  - bill discounts, vouchers and shipping discounts become a discount; tax, service, delivery, tip and rounding their
 *    own kind; admin, app fee, packaging, insurance and other fees a fee, each with its own label;
 *  - a charge already inside the prices (PPN printed for information) and cashback are not added.
 */
const CHARGE_KIND: Record<ReceiptSnapshotCharge['type'], SplitExtraKind> = {
  discount: 'discount', voucher: 'discount', shipping_discount: 'discount', tax: 'tax', service: 'service', delivery: 'delivery',
  admin_fee: 'admin', platform_fee: 'admin', packaging: 'admin', insurance: 'admin', other_fee: 'admin', tip: 'tip', rounding: 'rounding',
};
export function splitFromReceipt(receipt: ReceiptSnapshot, id: (prefix: string) => string = prefix => `${prefix}${Math.random().toString(36).slice(2, 9)}`) {
  const items: SplitItem[] = receipt.items.filter(item => item.qty > 0 && item.price > 0).map(item => ({ id: id('i'), name: item.name.slice(0, 60), qty: item.qty, price: item.price, ...(item.discount ? { discount: item.discount } : {}), assign: 'shared' as const, people: [] }));
  const extras: SplitExtra[] = receipt.charges.filter(charge => !charge.included && charge.amount).map(charge => {
    const kind = CHARGE_KIND[charge.type];
    return { id: id('x'), kind, label: charge.label || EXTRA_LABELS[kind], amount: kind === 'rounding' ? charge.amount : Math.abs(charge.amount), distribution: defaultDistribution(kind) };
  });
  return { merchant: receipt.merchant || '', date: receipt.date || '', time: receipt.time || '', total: receipt.total, items, extras };
}

/* ------------------------------------------------------------------ Data health */

export type SplitHealthIssue = { id: string; title: string; impact: string; action: string; splitBillId?: string };
/**
 * Checks that bills and their Piutang, Utang and transactions still agree. Nothing is changed here; every finding says
 * what to check and opens the bill.
 */
export function scanSplitBills(bills: SplitBill[], receivables: Receivable[], debts: Debt[], ledger: import('./types').LedgerTx[]): SplitHealthIssue[] {
  const issues: SplitHealthIssue[] = [];
  const add = (id: string, bill: SplitBill | null, title: string, impact: string, action: string) => { if (!issues.some(issue => issue.id === id)) issues.push({ id, title, impact, action, ...(bill ? { splitBillId: bill.id } : {}) }); };
  const txById = new Map(ledger.map(tx => [tx.id, tx]));
  const billById = new Map(bills.map(bill => [bill.id, bill]));
  const usedTx = new Map<string, string>(), usedRecord = new Map<string, string>();
  for (const bill of bills) {
    if (bill.status !== 'active') continue;
    const name = `Split Bill “${bill.title}”`;
    const shares = bill.shares || {};
    const sum = bill.participants.reduce((total, person) => total + (shares[person.id] || 0), 0);
    if (sum !== bill.total) add(`split-total:${bill.id}`, bill, `${name}: pembagian ${rupiah(sum)} tidak sama dengan total ${rupiah(bill.total)}`, 'Bagian tiap orang tidak cocok dengan tagihannya.', 'Buka tagihannya, periksa pembagian, lalu simpan ulang.');
    const ids = new Set(bill.participants.map(person => person.id));
    if (bill.payer === 'other' && !ids.has(bill.payerId)) add(`split-payer:${bill.id}`, bill, `${name}: orang yang membayar tidak ada di daftar`, 'Utang dan status pembayaran bisa keliru.', 'Buka tagihannya dan pilih lagi siapa yang membayar.');
    if ((bill.payments || []).some(payment => !ids.has(payment.participantId)) || (bill.items || []).some(item => [...(item.people || []), ...Object.keys(item.units || {}), ...Object.keys(item.custom || {})].some(id => !ids.has(id)))) add(`split-people:${bill.id}`, bill, `${name}: ada item atau pembayaran untuk orang yang sudah tidak ada`, 'Sebagian nominal bisa tidak terhitung.', 'Buka tagihannya dan periksa item serta pembayarannya.');
    // The transaction behind the bill.
    const tx = bill.transactionId ? txById.get(bill.transactionId) : undefined;
    const me = bill.participants.find(person => person.isMe), myShare = me ? shares[me.id] || 0 : 0;
    if (bill.transactionId) {
      const other = usedTx.get(bill.transactionId);
      if (other) add(`split-dup-tx:${bill.transactionId}`, bill, `${name} dan tagihan lain memakai transaksi yang sama`, 'Pengeluaran bisa terbagi dua kali.', 'Batalkan salah satu Split Bill.');
      usedTx.set(bill.transactionId, bill.id);
    }
    if (bill.payer === 'me') {
      if (!tx) add(`split-tx:${bill.id}`, bill, `${name}: transaksi pembayarannya tidak ditemukan`, 'Saldo dompet dan pengeluaranmu untuk tagihan ini tidak tercatat.', 'Buka tagihannya lalu simpan ulang, atau batalkan tagihannya.');
      else if (tx.splitBillId !== bill.id || tx.amount !== bill.total || (tx.ownShare ?? -1) !== myShare) add(`split-tx:${bill.id}`, bill, `${name}: transaksi pembayarannya tidak cocok`, 'Pengeluaran pribadimu bisa terhitung terlalu besar atau kecil.', 'Buka tagihannya lalu simpan ulang agar transaksinya disesuaikan.');
    } else if (myShare > 0) {
      if (!tx || tx.splitBillId !== bill.id || tx.amount !== myShare || tx.walletId) add(`split-tx:${bill.id}`, bill, `${name}: pengeluaran bagianmu tidak cocok`, 'Bagianmu bisa belum terhitung sebagai pengeluaran.', 'Buka tagihannya lalu simpan ulang.');
    }
    // Piutang and Utang.
    for (const person of bill.participants) {
      const share = shares[person.id] || 0;
      if (bill.payer === 'me' && !person.isMe && share > 0) {
        const record = receivables.find(row => row.id === person.receivableId);
        if (!record) { add(`split-rec:${bill.id}:${person.id}`, bill, `${name}: piutang ${person.name} tidak ditemukan`, 'Uang yang harus kembali darinya tidak tercatat.', 'Buka tagihannya lalu simpan ulang agar piutangnya dibuat lagi.'); continue; }
        const other = usedRecord.get(record.id);
        if (other && other !== bill.id) add(`split-dup-rec:${record.id}`, bill, `Piutang ${record.person} dipakai dua Split Bill`, 'Piutang bisa terhitung dua kali.', 'Buka kedua tagihan dan periksa pembagiannya.');
        usedRecord.set(record.id, bill.id);
        if (record.splitBillId !== bill.id || record.originalAmount !== share) add(`split-rec:${bill.id}:${person.id}`, bill, `${name}: piutang ${person.name} tidak cocok dengan bagiannya`, 'Sisa piutang bisa keliru.', 'Buka tagihannya lalu simpan ulang.');
        if (record.remainingAmount < 0 || record.remainingAmount > record.originalAmount) add(`split-paid:${record.id}`, bill, `${name}: pembayaran ${person.name} melebihi bagiannya`, 'Sisa piutang jadi minus atau tidak masuk akal.', 'Periksa riwayat pelunasannya dan batalkan pembayaran yang dobel.');
      }
      if (bill.payer === 'other' && person.isMe && share > 0) {
        const record = debts.find(row => row.id === person.debtId);
        if (!record) add(`split-debt:${bill.id}`, bill, `${name}: utangmu ke ${bill.participants.find(row => row.id === bill.payerId)?.name || 'yang membayar'} tidak ditemukan`, 'Uang yang harus kamu bayar tidak tercatat.', 'Buka tagihannya lalu simpan ulang.');
        else {
          if (record.splitBillId !== bill.id || record.originalAmount !== share) add(`split-debt:${bill.id}`, bill, `${name}: utang bagianmu tidak cocok`, 'Sisa utang bisa keliru.', 'Buka tagihannya lalu simpan ulang.');
          if (record.outstandingAmount < 0 || record.outstandingAmount > record.originalAmount) add(`split-paid:${record.id}`, bill, `${name}: pembayaran bagianmu melebihi utangnya`, 'Sisa utang jadi minus atau tidak masuk akal.', 'Periksa riwayat pembayarannya dan batalkan yang dobel.');
        }
      }
      if (bill.payer === 'other' && !person.isMe && person.id !== bill.payerId) {
        const paid = (bill.payments || []).filter(row => row.participantId === person.id).reduce((sum, row) => sum + row.amount, 0);
        if (paid > share) add(`split-between:${bill.id}:${person.id}`, bill, `${name}: pembayaran ${person.name} melebihi bagiannya`, 'Status pembayaran bisa keliru.', 'Buka tagihannya dan hapus pembayaran yang berlebih.');
      }
    }
  }
  // Records and transactions that point at a bill that is gone or no longer active.
  const inactive = (id?: string | null) => { const bill = id ? billById.get(id) : undefined; return !bill || bill.status !== 'active'; };
  for (const record of receivables) if (record.sourceType === 'split_bill' && inactive(record.splitBillId)) add(`split-orphan-rec:${record.id}`, null, `Piutang ${record.person} dari Split Bill yang sudah tidak aktif`, 'Piutang ini tidak lagi punya tagihan asal.', 'Periksa piutangnya di menu Piutang.');
  for (const record of debts) if (record.sourceType === 'split_bill' && inactive(record.splitBillId)) add(`split-orphan-debt:${record.id}`, null, `Utang ke ${record.name} dari Split Bill yang sudah tidak aktif`, 'Utang ini tidak lagi punya tagihan asal.', 'Periksa utangnya di menu Utang.');
  for (const tx of ledger) if (tx.type === 'expense' && tx.splitBillId && inactive(tx.splitBillId)) add(`split-orphan-tx:${tx.id}`, null, `Transaksi ${tx.description || tx.id} masih tertaut ke Split Bill yang tidak aktif`, tx.walletId ? 'Hanya sebagian nominalnya yang dihitung sebagai pengeluaran.' : 'Pengeluaran ini tidak punya tagihan asal.', 'Periksa transaksinya; buat ulang Split Bill bila perlu.');
  return issues;
}
