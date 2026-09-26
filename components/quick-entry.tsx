'use client';
import { useState, type FormEvent } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useApp } from './app-provider';
import { parseQuickText } from '@/lib/quick-entry';
import { todayInTimeZone } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

/** "Ketik cepat": type a sentence such as "beli pocari 8rb di alfa" and the transaction form opens filled in, ready to save. */
export function QuickEntryBox({ onResult, autoFocus = false }: { onResult: (preset: Partial<LedgerTx>) => void; autoFocus?: boolean }) {
  const { data, profile } = useApp();
  const [text, setText] = useState(''), [hint, setHint] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = parseQuickText(text, { wallets: data.wallets, categories: data.categories, history: data.transactions, today: todayInTimeZone(profile?.timeZone) });
    if (!result) { setHint('Sebutkan nominalnya, misalnya "beli pocari 8rb di alfa".'); return; }
    setHint(''); setText('');
    onResult(result.preset);
  }
  return <form className="quick-entry" onSubmit={submit}>
    <span className="quick-entry-icon" aria-hidden="true"><Sparkles size={16}/></span>
    <input value={text} onChange={e => { setText(e.target.value); if (hint) setHint(''); }} placeholder="Ketik cepat: beli pocari 8rb di alfa" aria-label="Ketik cepat transaksi" autoFocus={autoFocus} enterKeyHint="go" autoComplete="off"/>
    <button type="submit" aria-label="Isi otomatis" disabled={!text.trim()}><ArrowRight size={17}/></button>
    {hint && <small className="quick-entry-hint" role="alert">{hint}</small>}
  </form>;
}
