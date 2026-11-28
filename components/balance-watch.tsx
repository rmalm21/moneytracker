'use client';
import { useEffect, useRef } from 'react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { rupiah } from '@/lib/accounting';
import { balanceDrifts, steadyDrifts } from '@/lib/balance-drift';
import { loadAllTransactions } from '@/lib/firestore';
import { isOffline } from '@/lib/offline';

/**
 * 10.7 Once per opening, after the copy on the phone has caught up: a wallet whose stored balance is not the sum of its
 * transactions is pointed out, with a tap to "Hitung ulang saldo" (Dompet). Nothing is changed without the person.
 * Not while the PIN screen is up (the note names a wallet and an amount).
 */
export function useBalanceWatch(navigate: (view: string, focus?: string) => void, enabled: boolean) {
  const { user, data, dataReady, sync } = useApp();
  const { push } = useNotify();
  const wallets = useRef(data.wallets); wallets.current = data.wallets;
  const go = useRef(navigate); go.current = navigate;
  const key = user?.uid || '';
  const ready = enabled && Boolean(key) && dataReady && sync === 'synced';
  useEffect(() => {
    if (!ready) return;
    const mark = `dompet-ajaib:balance-watch:${key}`;
    try { if (sessionStorage.getItem(mark)) return; } catch { /* checked again next time */ }
    let stop = false;
    const look = async () => balanceDrifts(wallets.current, await loadAllTransactions(key));
    const timer = window.setTimeout(() => void (async () => {
      if (stop || isOffline()) return;
      const first = await look();
      if (first.length) await new Promise(resolve => window.setTimeout(resolve, 15000));
      if (stop) return;
      const steady = first.length ? steadyDrifts(first, await look()) : [];
      try { sessionStorage.setItem(mark, '1'); } catch { /* optional */ }
      for (const d of steady) push({ id: `drift-${d.walletId}`, title: `Saldo ${d.name} perlu dicek`, body: `Saldo tersimpan beda ${rupiah(Math.abs(d.difference))} dari total transaksinya. Ketuk untuk menghitung ulang.`, kind: 'warning', action: { label: 'Periksa', run: () => go.current('wallets', `recalc:${d.walletId}`) } });
    })().catch(() => { /* a check for the next opening */ }), 6000);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [ready, key, push]);
}
