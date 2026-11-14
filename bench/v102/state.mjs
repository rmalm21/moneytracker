/**
 * 10.2 Asisten chat 3.5 — two accounts every case runs on, and what tapping Simpan does to them.
 *
 *   bench: the chat v3 account (bench/v83/state.mjs: Dinda, Thursday 15 Oct 2026, payday the 24th), category ids the
 *          template keys ("expense.makan-minum").
 *   asli:  the same records with category ids as the app writes them when the starter categories are added
 *          (lib/category-templates.ts templateDocId: "tpl1_expense_makan_minum"), with their templateKey, so nothing
 *          can lean on an id spelling.
 *
 * Both give Catat otomatis the bounded recent entries the app gives it (the last 14 days, newest first, with when each
 * was made), so "yang tadi" and "kopi tadi" are read against the ledger as in the app.
 *
 * `saveInto(account, planText)` stands for the person tapping Simpan on a chat card: the records the card makes are
 * added to the ledger (made "now", newest of all), a change card changes its record. It returns the next account.
 */
import { v3Ctx } from '../v83/state.mjs';
import { inspect } from '../../lib/chat/inspect.ts';
import { parseQuickPlan } from '../../lib/quick-plan.ts';
import { templateDocId } from '../../lib/category-templates.ts';

const NOW = Date.parse('2026-10-15T15:00:00+07:00');
const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** What the app hands Catat otomatis as `recent` (components/quick-entry.tsx). */
function recentOf(transactions, today) {
  const since = shift(today, -14);
  return transactions.filter(t => t.date >= since).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 200)
    .map(t => ({ id: t.id, type: t.type, amount: t.amount, date: t.date, time: t.time, walletId: t.walletId, destinationWalletId: t.destinationWalletId, categoryId: t.categoryId, subcategoryId: t.subcategoryId, merchant: t.merchant, description: t.description, createdMs: t.createdMs ?? Date.parse(`${t.date}T${t.time || '08:00'}:00+07:00`) }));
}

/** An account from its data: the chat's context and Catat otomatis's, as the app builds them. */
export function account(name, data, base = v3Ctx) {
  // As components/chat-assistant.tsx builds it: every list straight from the data (debts, receivables, claims, goals, wish
  // list, schedules), the whole ledger as history, and the bounded recent entries Catat otomatis resolves "yang tadi" in.
  const quick = { ...base.quick, categories: data.categories, budgets: data.budgets, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist, recurring: data.recurring, plans: data.plannedTransactions, history: data.transactions, recent: recentOf(data.transactions, base.today), ask: { ...base.quick.ask, transactions: data.transactions, wallets: data.wallets, budgets: data.budgets } };
  return { ...base, name: base.name, account: name, data, quick, inspect: text => inspect(text, quick) };
}

export const bench = account('bench', v3Ctx.data);

// The app's ids for the starter categories ("expense.makan-minum" → "tpl1_expense_makan_minum").
const idMap = new Map(v3Ctx.data.categories.map(c => [c.id, templateDocId(c.id)]));
const swap = value => typeof value === 'string' && idMap.has(value) ? idMap.get(value) : value;
const remap = obj => Array.isArray(obj) ? obj.map(remap) : obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? swap(v) : remap(v)])) : obj;
const asliData = { ...remap(v3Ctx.data), categories: v3Ctx.data.categories.map(c => ({ ...c, id: idMap.get(c.id), parentId: c.parentId ? idMap.get(c.parentId) : null, templateKey: c.id })) };
export const asli = account('asli', asliData);
export const accounts = [bench, asli];

let made = 0;
/** Tapping Simpan on a chat card with this text: the next account. */
export function saveInto(acc, planText) {
  const plan = parseQuickPlan(planText, acc.quick);
  let transactions = [...acc.data.transactions];
  for (const a of plan.actions) {
    const r = a.result, p = r.preset || {};
    if (r.kind === 'tx_update') {
      const id = r.operation?.target?.id; if (!id) continue;
      transactions = transactions.map(t => {
        if (t.id !== id) return t;
        const next = { ...t };
        for (const c of r.operation.changes || []) {
          if (c.field === 'amount') next.amount = Number(c.after);
          if (c.field === 'walletId') next.walletId = String(c.after);
          if (c.field === 'date') next.date = String(c.after);
          if (c.field === 'category') { next.categoryId = c.categoryId ?? null; next.subcategoryId = c.subcategoryId ?? null; }
          if (c.field === 'type') { next.type = String(c.after); next.categoryId = c.categoryId ?? null; next.subcategoryId = c.subcategoryId ?? null; }
        }
        return next;
      });
      continue;
    }
    if (r.kind === 'tx_delete') { const ids = new Set([r.operation?.target?.id, ...(r.operation?.targets || []).map(x => x.id)].filter(Boolean)); transactions = transactions.filter(t => !ids.has(t.id)); continue; }
    if (!['expense', 'income', 'transfer'].includes(r.kind)) continue;
    made += 1;
    transactions.push({ id: `chat${made}`, type: r.kind, amount: r.amount, date: p.date || acc.today, time: '15:00', walletId: p.walletId || null, destinationWalletId: p.destinationWalletId || null, categoryId: p.categoryId || null, subcategoryId: p.subcategoryId || null, merchant: p.merchant || '', description: p.description || '', notes: '', tags: [], splits: p.splits || [], transferFee: p.transferFee || 0, adjustmentDirection: 'in', createdMs: NOW + made * 1000, createdAt: { toMillis: () => Date.now() } });
  }
  return account(acc.account, { ...acc.data, transactions });
}

/** The names a category id stands for (the subcategory and its parent), for checks written with names. */
export function categoryNames(acc, categoryId, subcategoryId) {
  const by = id => acc.data.categories.find(c => c.id === id);
  return [by(subcategoryId)?.name, by(categoryId)?.name].filter(Boolean);
}
