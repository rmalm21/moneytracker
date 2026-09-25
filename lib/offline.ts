import { getDoc, getDocFromCache, runTransaction, writeBatch, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore';

/**
 * Saving without a connection. Firestore already keeps plain writes and batches in the
 * device cache and sends them when the connection returns; server transactions are the
 * exception (they need the server). These helpers make every save behave the same way.
 */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const offlineError = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as Error | null)?.message || '');
  return code === 'unavailable' || /client is offline|network|offline/i.test(message);
};
const logLater = (error: unknown) => console.error('Perubahan offline belum terkirim', error);

/** Wait for a write only when online. Offline, the change is already applied locally and syncs later. */
export async function settle<T>(write: Promise<T>): Promise<void> {
  if (isOffline()) { void write.catch(logLater); return; }
  await write;
}

/**
 * runTransaction that also works offline: the same body runs against the device cache
 * and its writes go into a batch that Firestore sends when the connection returns.
 */
export async function runTx<T>(database: Firestore, body: (trx: Transaction) => Promise<T>): Promise<T> {
  if (!isOffline()) {
    try { return await runTransaction(database, body); } catch (error) { if (!offlineError(error)) throw error; }
  }
  const batch = writeBatch(database);
  const trx = {
    get: async (target: DocumentReference) => { try { return await getDocFromCache(target); } catch { return await getDoc(target); } },
    set: (target: DocumentReference, data: never, options?: never) => { if (options) batch.set(target, data, options); else batch.set(target, data); return trx; },
    update: (target: DocumentReference, ...args: never[]) => { (batch.update as (...a: unknown[]) => unknown)(target, ...args); return trx; },
    delete: (target: DocumentReference) => { batch.delete(target); return trx; },
  } as unknown as Transaction;
  const result = await body(trx);
  void batch.commit().catch(logLater);
  return result;
}

/** Work that needs the server (e.g. rebuilding closed-cycle reports) waits until the app is online again. */
const laterKey = 'dompet-ajaib:after-online';
export function whenOnline(key: string, run: () => Promise<unknown>) {
  if (typeof window === 'undefined') return;
  const pending = new Set<string>(JSON.parse(localStorage.getItem(laterKey) || '[]'));
  pending.add(key); localStorage.setItem(laterKey, JSON.stringify([...pending]));
  const go = () => { window.removeEventListener('online', go); void run().then(() => { const left = new Set<string>(JSON.parse(localStorage.getItem(laterKey) || '[]')); left.delete(key); localStorage.setItem(laterKey, JSON.stringify([...left])); }).catch(logLater); };
  window.addEventListener('online', go);
}
