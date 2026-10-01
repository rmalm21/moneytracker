'use client';
import { useState } from 'react';
import { ChevronDown, ReceiptText } from 'lucide-react';
import { rupiah } from '@/lib/accounting';
import { receiptMoneyRows, receiptStartsOpen } from '@/lib/receipt-snapshot';
import type { ReceiptSnapshot } from '@/lib/types';

/**
 * "Rincian struk": the receipt a transaction was scanned from, read-only. Only what the receipt had is shown (no empty
 * rows). The transaction's own amount stays the record; a later manual change is noted, never pushed into the items.
 */
export function ReceiptDetail({ receipt, amount }: { receipt: ReceiptSnapshot; amount?: number }) {
  const [open, setOpen] = useState(receiptStartsOpen(receipt));
  const money = receiptMoneyRows(receipt);
  const summary = [receipt.items.length ? `${receipt.items.length} item` : '', receipt.payment, receipt.merchant, receipt.platform ? `via ${receipt.platform}` : ''].filter(Boolean).join(' · ');
  const differs = amount !== undefined && amount > 0 && receipt.total > 0 && amount !== receipt.total;
  const facts: [string, string][] = [
    ...(receipt.legalEntity ? [['Perusahaan', receipt.legalEntity] as [string, string]] : []),
    ...(receipt.branch ? [['Cabang', receipt.branch] as [string, string]] : []),
    ...(receipt.receiptNo ? [['No. struk', receipt.receiptNo] as [string, string]] : []),
    ...(receipt.orderNo ? [['No. pesanan', receipt.orderNo] as [string, string]] : []),
    ...(receipt.paid ? [['Dibayar', rupiah(receipt.paid)] as [string, string]] : []),
    ...(receipt.change ? [['Kembalian', rupiah(receipt.change)] as [string, string]] : []),
    ...(receipt.cashback ? [['Cashback / poin', rupiah(receipt.cashback)] as [string, string]] : []),
    ...(receipt.fuel ? [['BBM', `${receipt.fuel.product} ${receipt.fuel.liters.toLocaleString('id-ID')} L × ${rupiah(receipt.fuel.pricePerLiter)}`] as [string, string]] : []),
  ];
  return <section className="rd">
    <button type="button" className="rd-head" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <ReceiptText size={16} aria-hidden="true"/>
      <span className="rd-title"><strong>Rincian struk</strong>{summary && <small>{summary}</small>}</span>
      <ChevronDown size={16} className="rd-chev" aria-hidden="true"/>
    </button>
    {open && <div className="rd-body">
      {receipt.items.length > 0 && <ul className="rd-items">{receipt.items.map((item, i) => <li key={i}>
        <span className="rd-name">{item.name}{(item.qty > 1 || item.variant || item.modifiers?.length) ? <small>{[item.qty > 1 ? `${item.qty} × ${rupiah(item.price)}` : '', item.variant || '', ...(item.modifiers || [])].filter(Boolean).join(' · ')}</small> : null}</span>
        <b>{rupiah(item.qty * item.price)}</b>
        {item.discount ? <span className="rd-sub"><span>Diskon item</span><span>−{rupiah(item.discount)}</span></span> : null}
      </li>)}</ul>}
      {money.length > 0 && <div className="rd-money">{money.map((row, i) => <div key={i} className={row.note ? 'is-included' : ''}><span>{row.label}{row.note && <small> · {row.note}</small>}</span><span>{row.amount < 0 ? '−' : ''}{rupiah(Math.abs(row.amount))}</span></div>)}</div>}
      {receipt.total > 0 && <div className="rd-total"><span>Total</span><b>{rupiah(receipt.total)}</b></div>}
      {differs && <small className="rd-diff">Nominal transaksi sekarang {rupiah(amount!)}; rincian ini tetap seperti di struk.</small>}
      {(receipt.payment || facts.length > 0) && <dl className="rd-facts">
        {receipt.payment && <><dt>Pembayaran</dt><dd>{receipt.payment}</dd></>}
        {facts.map(([label, value]) => <Fragment2 key={label} label={label} value={value}/>)}
      </dl>}
    </div>}
  </section>;
}
const Fragment2 = ({ label, value }: { label: string; value: string }) => <><dt>{label}</dt><dd>{value}</dd></>;
