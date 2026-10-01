/**
 * What a scanned receipt said, kept with the transaction it became (`LedgerTx.receipt`).
 *
 * The transaction stays the accounting record (amount, wallet, category, splits); this is a read-only snapshot of the
 * receipt as the person confirmed it: place, time, payment, numbers, items, charges and total. It is shown again as
 * "Rincian struk" in the transaction's detail. It holds only what means something to a person: no OCR passes, boxes,
 * scores or raw text. Values that were not on the receipt are left out, so nothing is shown for them later.
 */
import { PAYMENT_LABELS, type ChargeKey, type ChargeType, type PaymentMethod, type ReceiptRead } from './receipt.ts';
import type { ReceiptSnapshot, ReceiptSnapshotCharge } from './types.ts';

/** How each kind of charge is called in the detail (the printed label is kept only for taxes such as "PB1" or "PPN"). */
export const CHARGE_NAMES: Record<ReceiptSnapshotCharge['type'], string> = {
  discount: 'Diskon', voucher: 'Voucher', shipping_discount: 'Diskon ongkir', tax: 'Pajak', service: 'Service', delivery: 'Ongkir',
  admin_fee: 'Biaya admin', platform_fee: 'Biaya layanan', packaging: 'Kemasan', tip: 'Tip', insurance: 'Asuransi', other_fee: 'Biaya lain', rounding: 'Pembulatan',
};
const KEY_TYPE: Record<ChargeKey, ReceiptSnapshotCharge['type']> = { discount: 'discount', tax: 'tax', service: 'service', delivery: 'delivery', fee: 'other_fee', rounding: 'rounding' };
const REDUCES = new Set<ReceiptSnapshotCharge['type']>(['discount', 'voucher', 'shipping_discount']);
const MAX_ITEMS = 200;

export type SnapshotInput = {
  read: ReceiptRead | null;
  merchant: string; date: string; time: string; payment: PaymentMethod; total: number;
  /** The items as confirmed (qty × price, with their own discount). */
  items: { name: string; qty: number; price: number; discount?: number; modifiers?: string[]; variant?: string; sku?: string }[];
  subtotal: number;
  /** Charges as confirmed per group (discount positive), and whether each one is counted on top of the prices. */
  charges: Record<ChargeKey, number>; counted: Record<ChargeKey, boolean>;
  reconciled?: boolean;
};

const taxLabel = (label: string) => label.match(/\b(ppn|pb1|pbjt|pajak restoran)\b/i)?.[1].toUpperCase().replace('PAJAK RESTORAN', 'Pajak restoran');

/** The charges of one group: the printed lines when they still add up to the confirmed amount, one line otherwise. */
function chargeLines(key: ChargeKey, amount: number, counted: boolean, read: ReceiptRead | null): ReceiptSnapshotCharge[] {
  if (!amount) return [];
  const printed = (read?.charges || []).filter(c => c.key === key && c.amount);
  const sign = (type: ReceiptSnapshotCharge['type'], value: number) => REDUCES.has(type) ? -Math.abs(value) : value;
  const extra = counted ? {} : { included: true as const };
  if (printed.length && printed.reduce((n, c) => n + Math.abs(c.amount), 0) === Math.abs(amount)) {
    return printed.map(c => {
      const type = (c.type === 'cashback' ? 'other_fee' : c.type) as ChargeType as ReceiptSnapshotCharge['type'];
      const label = type === 'tax' ? taxLabel(c.label) || CHARGE_NAMES.tax : CHARGE_NAMES[type];
      return { type, label, amount: sign(type, key === 'rounding' ? amount / Math.abs(amount) * Math.abs(c.amount) : c.amount), ...extra };
    });
  }
  const type = KEY_TYPE[key];
  return [{ type, label: CHARGE_NAMES[type], amount: key === 'rounding' ? amount : sign(type, amount), ...extra }];
}

export function buildReceiptSnapshot(input: SnapshotInput): ReceiptSnapshot {
  const ids = input.read?.identifiers || {};
  const items = input.items.filter(i => i.name.trim() || i.price).slice(0, MAX_ITEMS).map(i => {
    const gross = i.qty * i.price, discount = i.discount || 0;
    const modifiers = (i.modifiers || []).map(m => m.trim().slice(0, 60)).filter(Boolean).slice(0, 8);
    return { name: i.name.trim().slice(0, 80) || 'Item', qty: i.qty, price: i.price, ...(discount ? { discount } : {}), total: gross - discount,
      ...(modifiers.length ? { modifiers } : {}), ...(i.variant ? { variant: i.variant.slice(0, 40) } : {}), ...(i.sku ? { sku: i.sku } : {}) };
  });
  const charges = (['discount', 'tax', 'service', 'delivery', 'fee', 'rounding'] as ChargeKey[]).flatMap(key => chargeLines(key, input.charges[key], input.counted[key], input.read));
  const read = input.read;
  const snapshot: ReceiptSnapshot = {
    ...(input.merchant.trim() ? { merchant: input.merchant.trim().slice(0, 80) } : {}),
    ...(input.date ? { date: input.date } : {}), ...(input.time ? { time: input.time } : {}),
    ...(input.payment ? { payment: PAYMENT_LABELS[input.payment] } : {}),
    ...(read?.legalEntity ? { legalEntity: read.legalEntity.slice(0, 80) } : {}), ...(read?.branch ? { branch: read.branch.slice(0, 80) } : {}),
    ...(ids.receiptNo ? { receiptNo: ids.receiptNo } : {}), ...(ids.orderNo ? { orderNo: ids.orderNo } : {}),
    items, charges,
    ...(input.subtotal > 0 ? { subtotal: input.subtotal } : {}),
    total: input.total,
    ...(read?.paid && read.paid !== input.total ? { paid: read.paid } : {}), ...(read?.change ? { change: read.change } : {}),
    ...(read?.cashback ? { cashback: read.cashback } : {}),
    ...(read?.fuel?.liters ? { fuel: { product: read.fuel.product, liters: read.fuel.liters, pricePerLiter: read.fuel.pricePerLiter } } : {}),
    ...(input.reconciled !== undefined ? { reconciled: input.reconciled } : {}),
  };
  return snapshot;
}

/** The lines shown between the items and the total: subtotal, then every charge; nothing that is zero. */
export function receiptMoneyRows(r: ReceiptSnapshot) {
  const itemDiscounts = r.items.reduce((n, i) => n + (i.discount || 0), 0);
  const rows: { label: string; amount: number; note?: string }[] = [];
  const gross = r.items.reduce((n, i) => n + i.qty * i.price, 0);
  const subtotal = r.subtotal || (r.items.length ? gross - itemDiscounts : 0);
  if (subtotal && (r.charges.length || itemDiscounts)) rows.push({ label: 'Subtotal', amount: itemDiscounts && !r.subtotal ? gross : subtotal });
  if (itemDiscounts && !r.subtotal) rows.push({ label: 'Diskon item', amount: -itemDiscounts });
  for (const c of r.charges) if (c.amount) rows.push({ label: c.label, amount: c.amount, ...(c.included ? { note: 'sudah termasuk harga' } : {}) });
  return rows;
}

/** Short receipts are shown open in the detail; long ones start folded behind "Rincian struk". */
export const receiptStartsOpen = (r: ReceiptSnapshot) => r.items.length <= 6;
