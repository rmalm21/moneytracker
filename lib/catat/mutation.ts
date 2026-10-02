/**
 * Catat otomatis V3.3 — the Financial Mutation Plan: "if this reading is right, what exactly changes?"
 *
 * A dry run over the actions of one message, before anything is saved: money movements per wallet, relationship
 * balances before → after, records created / updated / deleted, plans and schedules. Nothing is written here; the
 * ledger (lib/firestore.ts, lib/split-bill-store.ts, lib/finance-store.ts) executes the confirmed actions. The same plan
 * drives the consequence preview ("Piutang Atuy Rp12.000 → Rp7.000"), the V3.3 Bug Catcher and the benchmark.
 */
import type { QuickContext } from '../quick-entry.ts';
import type { ActionCandidate } from '../quick-plan.ts';
import type { BugWarning } from './bug-catcher.ts';
import { computeSplit } from '../split-bill.ts';

export type MoneyMovement = { walletId: string; delta: number; label: string };
export type RelationshipChange = { kind: 'receivable' | 'debt' | 'claim'; id?: string; action?: string; label: string; before: number; after: number; status: 'new' | 'open' | 'partial' | 'settled' };
export type FinancialMutationPlan = {
  actionId: string; operationType: string;
  moneyMovements: MoneyMovement[]; relationshipChanges: RelationshipChange[];
  creates: string[]; updates: string[]; deletes: string[]; schedules: string[]; recurringChanges: string[];
  warnings: string[]; confirmations: string[];
  /** Worth showing as a consequence preview (a plain spending stays a plain card). */
  complex: boolean;
};

const rupiah = (n: number) => `Rp${Math.abs(n).toLocaleString('id-ID')}`;

/** The dry run of one action. `all`: the actions of the same message (a payment may settle a record created there). */
export function planMutation(a: ActionCandidate, ctx: QuickContext, all: ActionCandidate[] = []): FinancialMutationPlan {
  const r = a.result, op = r.operation, amount = r.amount || 0;
  const wallet = r.preset.walletId || '', to = r.preset.destinationWalletId || '';
  const name = (id: string) => ctx.wallets.find(w => w.id === id)?.name || 'dompet utama';
  const plan: FinancialMutationPlan = { actionId: a.id, operationType: op?.type || (r.kind === 'query' ? 'QUERY' : r.kind === 'transfer' ? 'TRANSFER' : r.kind === 'plan_new' ? 'SCHEDULE' : r.kind === 'recurring_new' ? 'RECUR' : 'CREATE'), moneyMovements: [], relationshipChanges: [], creates: [], updates: [], deletes: [], schedules: [], recurringChanges: [], warnings: [], confirmations: [], complex: false };
  const move = (walletId: string, delta: number, label: string) => { if (delta) plan.moneyMovements.push({ walletId, delta, label: `${name(walletId)} ${delta < 0 ? '−' : '+'}${rupiah(delta)}${label ? ` · ${label}` : ''}` }); };
  const settle = (kind: RelationshipChange['kind'], noun: string) => {
    const linked = op?.linkAction ? all.find(x => x.id === op.linkAction) : undefined;
    const before = op?.remainingBefore ?? (linked ? linked.result.amount : undefined);
    if (before === undefined) return;
    // Worked out from the amount as it stands now (it may have been edited on the card); never below zero.
    const after = Math.max(0, before - amount);
    plan.relationshipChanges.push({ kind, ...(op?.target ? { id: op.target.id } : {}), ...(linked ? { action: linked.id } : {}), label: op?.target?.label || `${noun} ${linked?.result.person || r.person || ''}`.trim(), before, after, status: after === 0 ? 'settled' : 'partial' });
  };
  if (amount && r.kind !== 'tx_update' && r.kind !== 'tx_delete' && r.kind !== 'query' && r.kind !== 'recurring_change') plan.creates.push(r.kind);
  switch (r.kind) {
    case 'expense':
      move(wallet, -amount, r.split ? 'dibayar penuh' : '');
      const shares = r.split && r.split.total !== amount ? computeSplit({ total: amount, method: 'equal', participants: r.split.participants, items: [], extras: [] }).shares : r.split?.shares || {};
      if (r.split) for (const p of r.split.participants) { const share = shares[p.id] || 0; if (p.isMe) plan.creates.push(`bagian kamu ${rupiah(share)}`); else plan.relationshipChanges.push({ kind: 'receivable', label: `Piutang ${p.name}`, before: 0, after: share, status: 'new' }); }
      if (r.preset.plannedId) plan.updates.push(`${op?.target?.label || 'Rencana'} → selesai`);
      break;
    case 'income': move(wallet, amount, ''); if (r.preset.plannedId) plan.updates.push(`${op?.target?.label || 'Rencana'} → selesai`); break;
    case 'transfer': { const fee = r.preset.transferFee || 0; move(wallet, -(amount + fee), fee ? `termasuk biaya admin ${rupiah(fee)}` : ''); move(to, amount, ''); break; }
    case 'receivable_new': if (wallet) move(wallet, -amount, ''); plan.relationshipChanges.push({ kind: 'receivable', label: `Piutang ${r.person || '?'}${r.purpose ? ` · ${r.purpose}` : ''}`, before: 0, after: amount, status: 'new' }); break;
    case 'debt_new': if (wallet) move(wallet, amount, ''); plan.relationshipChanges.push({ kind: 'debt', label: `Utang ke ${r.person || '?'}`, before: 0, after: amount, status: 'new' }); break;
    case 'claim_new': move(wallet, -amount, ''); plan.relationshipChanges.push({ kind: 'claim', label: `Klaim ${r.name || ''}`.trim(), before: 0, after: amount, status: 'new' }); break;
    case 'receivable_payment': move(wallet, amount, ''); settle('receivable', 'Piutang'); break;
    case 'debt_payment': move(wallet, -amount, ''); settle('debt', 'Utang'); break;
    case 'claim_payment': move(wallet, amount, ''); settle('claim', 'Klaim'); break;
    case 'plan_new': plan.schedules.push(`${r.name || 'Rencana'} ${rupiah(amount)} · ${r.date}${r.preset.time ? ` ${r.preset.time}` : ''}`); break;
    case 'recurring_new': plan.recurringChanges.push(`Jadwal baru ${r.name || ''} ${rupiah(amount)}`); break;
    case 'tx_update': {
      const t = ctx.recent?.find(x => x.id === op?.target?.id);
      // Nothing changes before the target is known (ambiguous: the person picks first).
      if (!op?.target) break;
      for (const c of op.changes || []) plan.updates.push(`${op.target.label}: ${c.label}`);
      const change = op?.changes?.find(c => c.field === 'amount');
      if (t && change) { const d = Number(change.after) - Number(change.before), sign = t.type === 'income' || t.type === 'receivable_payment' || t.type === 'claim_payment' ? 1 : -1; move(t.walletId, sign * d, 'selisih perubahan'); }
      break;
    }
    case 'tx_delete': {
      const targets = op?.targets?.length ? op.targets : op?.target ? [op.target] : [];
      for (const target of targets) {
        plan.deletes.push(target.label);
        const t = ctx.recent?.find(x => x.id === target.id); if (!t) continue;
        if (t.type === 'transfer') { move(t.walletId, t.amount, 'dikembalikan'); if (t.destinationWalletId) move(t.destinationWalletId, -t.amount, 'dikembalikan'); }
        else move(t.walletId, ['income', 'receivable_payment', 'claim_payment', 'borrowing'].includes(t.type) ? -t.amount : t.amount, 'dikembalikan');
      }
      if (targets.length > 1) plan.confirmations.push(`${targets.length} transaksi akan dihapus.`);
      else if (targets.length) plan.confirmations.push('Transaksi ini akan dihapus.');
      break;
    }
    case 'recurring_change': { const c = op?.recurring; if (c) plan.recurringChanges.push(c.stop ? `${c.name} berhenti ${c.fromLabel}` : `${c.name} ${rupiah(c.before || 0)} → ${rupiah(c.amount || 0)} ${c.fromLabel}`); break; }
  }
  plan.complex = plan.relationshipChanges.length > 0 || plan.updates.length > 0 || plan.deletes.length > 0 || plan.schedules.length > 0 && r.kind !== 'plan_new' || plan.recurringChanges.length > 0 && r.kind !== 'recurring_new' || plan.moneyMovements.length > 1 || Boolean(r.composition || r.split);
  return plan;
}

/** V3.3 Bug Catcher over the dry run: consequences that cannot be right, before anything is committed. */
export function catchMutationBugs(plans: FinancialMutationPlan[], actions: ActionCandidate[], ctx: QuickContext): Map<string, BugWarning[]> {
  const out = new Map<string, BugWarning[]>();
  const add = (id: string, w: BugWarning) => { const list = out.get(id) || []; if (!list.some(x => x.code === w.code)) list.push(w); out.set(id, list); };
  for (const p of plans) {
    const a = actions.find(x => x.id === p.actionId)!, r = a.result;
    if (r.kind === 'transfer') {
      const fee = r.preset.transferFee || 0, src = p.moneyMovements.find(m => m.walletId === (r.preset.walletId || '') && m.delta < 0), dst = p.moneyMovements.find(m => m.walletId === (r.preset.destinationWalletId || '') && m.delta > 0);
      if (dst && dst.delta !== r.amount) add(p.actionId, { code: 'TRANSFER_DESTINATION_RECEIVED_FEE', detail: `dompet tujuan menerima ${rupiah(dst.delta)}, bukan pokok ${rupiah(r.amount)}`, repaired: false });
      if (src && dst && src.delta + dst.delta + fee !== 0) add(p.actionId, { code: 'TRANSFER_PRINCIPAL_MISMATCH', detail: 'uang keluar ≠ uang masuk + biaya admin', repaired: false });
    }
    if (r.composition) { const c = r.composition, paid = c.parts.filter(x => x.role !== 'CASHBACK').reduce((n, x) => n + x.sign * x.amount, c.gross); if (r.amount !== (c.cashback && !c.cashbackPending ? paid - c.cashback : paid)) add(p.actionId, { code: 'GROSS_NET_MISMATCH', detail: `${rupiah(r.amount)} ≠ ${c.formula}`, repaired: false }); }
    if (r.split) { const sum = Object.values(r.split.shares).reduce((n, x) => n + x, 0); if (sum !== r.split.total) add(p.actionId, { code: 'SPLIT_TOTAL_MISMATCH', detail: `bagian ${rupiah(sum)} ≠ total ${rupiah(r.split.total)}`, repaired: false }); }
    for (const c of p.relationshipChanges) if (c.after < 0 || c.before - (r.amount || 0) < 0 && c.status !== 'new') add(p.actionId, { code: 'PARTIAL_SETTLEMENT_OVERFLOW', detail: `${c.label} akan jadi negatif`, repaired: false });
    if (['receivable_payment', 'debt_payment', 'claim_payment'].includes(r.kind) && !r.operation?.linkAction && !r.preset.receivableId && !r.preset.debtId && !r.preset.claimId)
      add(p.actionId, { code: 'MISSING_RELATIONSHIP_UPDATE', detail: 'pembayaran belum tertaut ke catatan mana pun; dipilih dulu sebelum disimpan', repaired: false });
    if (r.kind === 'recurring_change' && r.operation?.recurring && r.operation.recurring.from < ctx.today) add(p.actionId, { code: 'RECURRING_HISTORY_REWRITE', detail: 'perubahan jadwal tidak boleh berlaku mundur', repaired: false });
    if ((r.kind === 'expense') && !r.preset.plannedId && (ctx.plans || []).some(pl => pl.status === 'planned' && pl.date === ctx.today && pl.amount === r.amount && (r.preset.description || '').toLocaleLowerCase('id-ID').includes(pl.title.toLocaleLowerCase('id-ID'))))
      add(p.actionId, { code: 'PLAN_ACTUAL_DUPLICATE', detail: 'ada rencana yang sama hari ini; pilih rencananya supaya tidak tercatat dua kali', repaired: false });
  }
  // Across actions: one lending or one repayment must not move money twice.
  for (const a of actions) {
    const r = a.result;
    if (r.kind === 'receivable_new' && r.preset.walletId) {
      const twin = actions.find(x => x !== a && x.result.kind === 'expense' && x.result.amount === r.amount && x.clause === a.clause);
      if (twin) add(a.id, { code: 'DUPLICATE_MONEY_MOVEMENT', detail: `talangan ${rupiah(r.amount)} tercatat dua kali (piutang + pengeluaran)`, repaired: false });
    }
    if (r.kind === 'receivable_payment') {
      const twin = actions.find(x => x !== a && x.result.kind === 'income' && x.result.amount === r.amount && x.clause === a.clause);
      if (twin) add(a.id, { code: 'DUPLICATE_MONEY_MOVEMENT', detail: `pembayaran ${rupiah(r.amount)} tercatat dua kali`, repaired: false });
    }
    if (r.kind === 'income' && /\b(diskon|discount|potongan)\b/i.test(r.preset.description || '') && actions.some(x => x.result.kind === 'expense')) add(a.id, { code: 'DISCOUNT_DOUBLE_COUNT', detail: 'diskon dicatat sebagai pemasukan terpisah', repaired: false });
    if (r.kind === 'income' && /\bcashback\b/i.test(r.preset.description || '') && /\b(nanti|akan|bakal|menyusul|pending)\b/.test(a.text.toLocaleLowerCase('id-ID'))) add(a.id, { code: 'CASHBACK_PREMATURELY_CREDITED', detail: 'cashback yang dijanjikan dicatat sebagai uang masuk', repaired: false });
  }
  return out;
}
