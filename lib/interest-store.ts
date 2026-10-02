/**
 * Bunga saldo otomatis: saving the settings and writing the credited days (lib/wallet-interest.ts decides what).
 *
 * Runs lazily, never at midnight: whenever the app is open and online, every completed day not yet credited is worked
 * out from the transaction history and written. Each day is written in its own Firestore transaction on its fixed id
 * (`wint_{walletId}_{date}`), together with the wallet's cached balance: two devices doing this at once end with one
 * record, and the balance moves exactly once.
 */
import { arrayUnion, increment, serverTimestamp, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import { isOffline, runTx, settle } from './offline';
import { loadAllTransactions, newTx, noteDeleted, ref, syncSnapshot } from './firestore';
import { planInterest, reconcileInterest, type PlannedInterest, type WalletInterest } from './wallet-interest';
import type { Category, LedgerTx, Wallet } from './types';

function database() { if (!db) throw Error('Database belum tersedia.'); return db; }

export async function saveWalletInterest(uid: string, walletId: string, settings: WalletInterest | undefined) {
  await settle(updateDoc(ref(uid, 'wallets', walletId), { interest: settings ? JSON.parse(JSON.stringify(settings)) : deleteField(), updatedAt: serverTimestamp() }));
}

/** An existing income category for interest ("Bunga", "Bunga Bank"…), never a new one. */
export function interestCategory(categories: Category[]) {
  const income = categories.filter(c => c.type === 'income' && !c.isArchived);
  return income.find(c => /^bunga\b/i.test(c.name)) || income.find(c => /bunga|interest/i.test(c.name)) || null;
}

function interestTx(wallet: Wallet, item: PlannedInterest, categoryId: string | null): Omit<LedgerTx, 'id'> {
  const { id: _id, ...fields } = newTx({ type: 'income', amount: item.amount, date: item.date, time: '23:59', walletId: wallet.id, categoryId, description: 'Bunga saldo', tags: ['bunga-otomatis'] });
  return { ...fields, interest: item.record };
}

let running: Promise<number> | null = null;
/** Credits every completed, uncredited day for the wallets that have it on. Returns how many records changed. */
export function accrueInterest(uid: string, wallets: Wallet[], categories: Category[], today: string): Promise<number> {
  // On, or turned off with accrued interest still to pay on its last day.
  const active = wallets.filter(w => (w.interest?.enabled || w.interest?.endDate) && !w.isArchived);
  if (!active.length || isOffline() || typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(0);
  return running ||= (async () => {
    try {
      const all = await loadAllTransactions(uid);
      const categoryId = interestCategory(categories)?.id || null;
      let changed = 0, earliest = '';
      for (const wallet of active) {
        const txs = all.filter(tx => tx.walletId === wallet.id || tx.destinationWalletId === wallet.id);
        const { create, update, remove } = reconcileInterest(wallet, planInterest(wallet, txs, today), txs, today);
        for (const item of [...create, ...update]) {
          const r = ref(uid, 'transactions', item.id), w = ref(uid, 'wallets', wallet.id);
          const wrote = await runTx(database(), async trx => {
            const [old, current] = await Promise.all([trx.get(r), trx.get(w)]);
            const settings = current.exists() ? (current.data() as Wallet).interest : undefined;
            if (!settings || !(settings.enabled || settings.endDate) || settings.skipped?.includes(item.date) || (!settings.enabled && old.exists()) || old.exists() && old.data().interest?.confirmed) return false;
            const before = old.exists() ? Number(old.data().amount) || 0 : 0;
            const same = old.exists() && before === item.amount && old.data().interest?.closing === item.record.closing && old.data().interest?.rate === item.record.rate && old.data().interest?.taxRate === item.record.taxRate && old.data().interest?.netMicro === item.record.netMicro;
            if (same) return false;
            trx.set(r, { ...interestTx(wallet, item, categoryId), createdAt: old.exists() ? old.data().createdAt ?? serverTimestamp() : serverTimestamp(), updatedAt: serverTimestamp() });
            if (item.amount !== before) trx.update(w, { cachedBalance: increment(item.amount - before), updatedAt: serverTimestamp() });
            return true;
          });
          if (wrote) { changed++; if (!earliest || item.date < earliest) earliest = item.date; }
        }
        const removed: string[] = [];
        for (const tx of remove) {
          const r = ref(uid, 'transactions', tx.id), w = ref(uid, 'wallets', wallet.id);
          const gone = await runTx(database(), async trx => {
            const old = await trx.get(r);
            if (!old.exists() || old.data().interest?.source !== 'wallet_interest' || old.data().interest?.confirmed) return false;
            trx.delete(r); trx.update(w, { cachedBalance: increment(-(Number(old.data().amount) || 0)), updatedAt: serverTimestamp() });
            return true;
          });
          if (gone) { removed.push(tx.id); changed++; if (!earliest || tx.date < earliest) earliest = tx.date; }
        }
        if (removed.length) await noteDeleted(uid, { transactions: removed });
      }
      if (earliest) await syncSnapshot(uid, earliest).catch(() => undefined);
      return changed;
    } finally { running = null; }
  })();
}

/**
 * The user checked a credited interest against the bank: `actual` is what the bank paid (the same amount = "Sesuai").
 * The transaction takes the bank's amount, the wallet balance moves by the difference, and the record is locked; the
 * following days are recalculated from the corrected balance on the next run.
 */
export async function confirmInterest(uid: string, transactionId: string, actual: number) {
  if (!Number.isSafeInteger(actual) || actual <= 0) throw Error('Nominal bunga harus lebih dari nol.');
  const r = ref(uid, 'transactions', transactionId);
  const date = await runTx(database(), async trx => {
    const snap = await trx.get(r);
    if (!snap.exists() || snap.data().interest?.source !== 'wallet_interest') throw Error('Catatan bunga tidak ditemukan.');
    const data = snap.data() as LedgerTx, before = Number(data.amount) || 0;
    const calculated = data.interest?.confirmed?.calculated ?? before;
    trx.update(r, { amount: actual, 'interest.confirmed': { at: new Date().toISOString(), calculated }, updatedAt: serverTimestamp() });
    if (actual !== before) trx.update(ref(uid, 'wallets', data.walletId), { cachedBalance: increment(actual - before), updatedAt: serverTimestamp() });
    return data.date;
  });
  await syncSnapshot(uid, date).catch(() => undefined);
}

/**
 * The user deletes a credited interest as wrong. The transaction goes, the wallet balance drops by its amount, and the
 * day is noted on the wallet's settings so the next run does not pay it again; the following days are recalculated.
 */
export async function deleteInterest(uid: string, transactionId: string) {
  const r = ref(uid, 'transactions', transactionId);
  const date = await runTx(database(), async trx => {
    const snap = await trx.get(r);
    if (!snap.exists() || snap.data().interest?.source !== 'wallet_interest') throw Error('Catatan bunga tidak ditemukan.');
    const data = snap.data() as LedgerTx, w = ref(uid, 'wallets', data.walletId);
    const wallet = await trx.get(w);
    trx.delete(r);
    trx.update(w, { cachedBalance: increment(-(Number(data.amount) || 0)), ...(wallet.exists() && (wallet.data() as Wallet).interest ? { 'interest.skipped': arrayUnion(data.date) } : {}), updatedAt: serverTimestamp() });
    return data.date;
  });
  await noteDeleted(uid, { transactions: [transactionId] });
  await syncSnapshot(uid, date).catch(() => undefined);
}
