'use client';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CircleCheck, Siren } from 'lucide-react';
import { highlightDate, type Highlight, type HighlightKind } from '@/lib/insight-v3/highlights';

const icons: Record<HighlightKind, typeof Siren> = { income: ArrowDownLeft, spend: ArrowUpRight, alert: Siren, warn: AlertTriangle, good: CircleCheck };

/** "Sorotan siklus ini": the cycle's key events as a row of small cards; each opens its story or its transaction. */
export function Highlights({ items, today, onOpen, onTx }: { items: Highlight[]; today: string; onOpen: (signature: string) => void; onTx: (id: string, date: string) => void }) {
  if (!items.length) return null;
  return <section className="ix-highlights" aria-label="Sorotan siklus ini">
    <h2 className="ix-highlights-title">Sorotan siklus ini</h2>
    <ul>{items.map(h => { const Icon = icons[h.kind]; return <li key={h.key}>
      <button type="button" className={`ix-hl is-${h.kind}`} onClick={() => h.signature ? onOpen(h.signature) : h.txId && onTx(h.txId, h.date)}>
        <span className="ix-hl-top"><span className="ix-hl-icon" aria-hidden="true"><Icon size={15}/></span><small>{h.label}</small><time>{highlightDate(h.date, today)}</time></span>
        <strong>{h.title}</strong>
        {h.value && <b className="ix-hl-value">{h.value}</b>}
      </button>
    </li>; })}</ul>
  </section>;
}
