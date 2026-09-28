/**
 * Split Bill records and their links to the ledger. A bill is saved in one transaction together with everything it
 * changes, so the bill, its payment, the Piutang of the others and the Utang to someone who paid never drift apart.
 *
 *  - The user paid: one cash transaction for the full amount (the existing one when made from a transaction), marked with
 *    the user's own share. Wallets fall by the full amount; spending, budgets and analysis count the own share only.
 *    Every other person's share is a Piutang linked to the bill (no second cash transaction).
 *  - Someone else paid: the user's own share is spending on the day of the bill without any wallet, and the same amount
 *    is an Utang to the person who paid. Paying it later moves money but is not spending again.
 *  - Payments between two other people (someone else paid) move none of the user's money and are kept on the bill.
 * The ledger stays the source of truth: paid amounts are read from the Piutang/Utang, which keep their payment history.
 */
import { deleteField, doc, getDoc, getDocFromCache, increment, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type DocumentData, type DocumentSnapshot, type Unsubscribe } from 'firebase/firestore';
import { coll, newTx, noteDeleted, ref, syncSnapshot } from './firestore';
import { db } from './firebase';
import { isOffline, runTx, settle } from './offline';
import { effects, rupiah } from './accounting';
import { computeSplit, ownCategoryLines, payerOf } from './split-bill';
import { validateWalletUse } from './wallet-capabilities';
import type { Debt, LedgerTx, Receivable, SplitBill, SplitGroup, SplitParticipant, SplitPayment, SplitPerson, Wallet } from './types';

function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
const local = { source: 'cache' } as const;
const now = () => serverTimestamp();
const today = () => new Date().toLocaleDateString('en-CA');
const read = <T>(snap: DocumentSnapshot<DocumentData> | null | undefined) => (snap?.exists() ? { id: snap.id, ...snap.data() } as T : null);
/** Firestore rules that predate Split Bill refuse a share without a wallet; say how to fix it instead of a bare error. */
function explain(error: unknown): never {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'permission-denied') throw Object.assign(new Error('Firestore menolak penyimpanan ini. Perbarui aturan keamanan Firestore (deploy firestore:rules dari versi aplikasi ini), lalu coba lagi.'), { code });
  throw error;
}

/* ------------------------------------------------------------------ Reading (from the device copy, see lib/sync.ts) */

const byNewest = (a: SplitBill, b: SplitBill) => b.date.localeCompare(a.date) || ((b.createdAt as { seconds?: number } | undefined)?.seconds ?? Infinity) - ((a.createdAt as { seconds?: number } | undefined)?.seconds ?? Infinity);
/** Bills are read only while a Split Bill screen is open; the device copy is kept current by the sync engine. */
export function subscribeSplitBills(uid: string, onValue: (bills: SplitBill[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(coll(uid, 'splitBills'), local, snap => onValue(snap.docs.map(row => ({ id: row.id, ...row.data() }) as SplitBill).sort(byNewest)), onError);
}
export function subscribeSplitContacts(uid: string, onValue: (value: { people: SplitPerson[]; groups: SplitGroup[] }) => void, onError: (error: Error) => void): Unsubscribe {
  let people: SplitPerson[] | null = null, groups: SplitGroup[] | null = null;
  const emit = () => { if (people && groups) onValue({ people, groups }); };
  const stops = [
    onSnapshot(coll(uid, 'splitPeople'), local, snap => { people = snap.docs.map(row => ({ id: row.id, ...row.data() }) as SplitPerson).sort((a, b) => a.name.localeCompare(b.name, 'id')); emit(); }, onError),
    onSnapshot(coll(uid, 'splitGroups'), local, snap => { groups = snap.docs.map(row => ({ id: row.id, ...row.data() }) as SplitGroup).sort((a, b) => a.name.localeCompare(b.name, 'id')); emit(); }, onError),
  ];
  return () => stops.forEach(stop => stop());
}

/** One transaction (for "Split Bill" from a transaction that is not among the recent ones on screen). */
export async function readTransaction(uid: string, id: string) {
  const target = ref(uid, 'transactions', id);
  try { const snap = await getDocFromCache(target); if (snap.exists()) return read<LedgerTx>(snap); } catch { /* ask the server */ }
  return read<LedgerTx>(await getDoc(target));
}

/* ------------------------------------------------------------------ Saving a bill */

export type SplitBillInput = Omit<SplitBill, 'id' | 'createdAt' | 'updatedAt' | 'shares' | 'myShare' | 'cancelledAt' | 'status'> & { id?: string };
type Deleted = { receivables: string[]; debts: string[]; transactions: string[] };
const receivablePaid = (row: Pick<Receivable, 'originalAmount' | 'remainingAmount'> | null) => row ? Math.max(0, row.originalAmount - row.remainingAmount) : 0;
const debtPaid = (row: Pick<Debt, 'originalAmount' | 'outstandingAmount'> | null) => row ? Math.max(0, row.originalAmount - row.outstandingAmount) : 0;
const clearLinks = (people: SplitParticipant[]) => people.map(person => ({ ...person, receivableId: null, debtId: null }));

/**
 * Saves a draft (no money records yet) or an active bill with all its ledger links. Links of an earlier version are
 * updated in place; what is no longer needed is removed only while nothing has been paid on it.
 */
export async function saveSplitBill(uid: string, input: SplitBillInput, options: { draft?: boolean } = {}) {
  const billRef = input.id ? ref(uid, 'splitBills', input.id) : doc(coll(uid, 'splitBills'));
  const billId = billRef.id, draft = Boolean(options.draft);
  const result = computeSplit(input);
  const title = input.title.trim(), me = input.participants.find(person => person.isMe), payer = payerOf(input);
  if (!title) throw Error('Beri nama tagihan.');
  if (input.participants.filter(person => person.isMe).length > 1) throw Error('Hanya satu orang yang bisa ditandai sebagai kamu.');
  if (!draft) {
    if (!result.ok) throw Error(result.issues[0].message);
    if (input.payer === 'other' && (!payer || payer.isMe)) throw Error('Pilih siapa yang membayar.');
    if (input.payer === 'me' && !input.fromTransaction && !input.walletId) throw Error('Pilih dompet yang dipakai membayar.');
    if (input.fromTransaction && input.payer !== 'me') throw Error('Split Bill dari transaksi selalu dibayar olehmu.');
  }
  const shares = result.shares, myShare = me ? shares[me.id] || 0 : 0, total = result.total;
  const lines = ownCategoryLines(result.people.find(person => person.isMe));
  const ownSplits = lines.length > 1 && lines.reduce((sum, line) => sum + line.amount, 0) === myShare ? lines : [];
  const common = { title, merchant: input.merchant.trim(), date: input.date, time: input.time || '', dueDate: input.dueDate || '', payer: input.payer, payerId: input.payer === 'me' ? (me?.id || '') : input.payerId, method: input.method, categoryId: input.categoryId || null, subcategoryId: input.categoryId ? input.subcategoryId || null : null, items: input.items, extras: input.extras, notes: (input.notes || '').trim(), groupId: input.groupId || null, fromTransaction: Boolean(input.fromTransaction), receiptPath: input.receiptPath || '' };
  let deleted: Deleted = { receivables: [], debts: [], transactions: [] }, earliest = input.date;
  try {
    await runTx(database(), async trx => {
      deleted = { receivables: [], debts: [], transactions: [] };
      const oldSnap = input.id ? await trx.get(billRef) : null;
      if (input.id && !oldSnap?.exists()) throw Error('Split Bill tidak ditemukan.');
      const old = read<SplitBill>(oldSnap);
      if (old?.status === 'cancelled') throw Error('Split Bill yang sudah dibatalkan tidak bisa diubah. Salin jadi tagihan baru bila perlu.');
      if (old?.status === 'active' && draft) throw Error('Split Bill yang sudah aktif tidak bisa kembali jadi draft.');
      if (old && old.date < earliest) earliest = old.date;
      if (draft) {
        const record = { ...common, total: Math.max(0, Math.round(input.total || 0)), participants: clearLinks(input.participants), payments: [], shares, myShare, walletId: input.walletId || '', transactionId: input.transactionId || '', status: 'draft' };
        if (old) trx.update(billRef, { ...record, updatedAt: now() }); else trx.set(billRef, { ...record, createdAt: now(), updatedAt: now() });
        return;
      }
      if (!input.categoryId && !input.fromTransaction) throw Error('Pilih kategori tagihan.');

      // Everything this save may touch is read first (Firestore transactions read before they write).
      const active = old?.status === 'active' ? old : null;
      const before = new Map((active?.participants || []).map(person => [person.id, person]));
      const oldTxId = active?.transactionId || '';
      const convertedId = input.fromTransaction ? input.transactionId : '';
      const txIds = [...new Set([oldTxId, convertedId].filter(Boolean))];
      const txSnaps = new Map(await Promise.all(txIds.map(async id => [id, await trx.get(ref(uid, 'transactions', id))] as const)));
      const receivableIds = [...new Set((active?.participants || []).map(person => person.receivableId).filter((id): id is string => Boolean(id)))];
      const receivables = new Map(await Promise.all(receivableIds.map(async id => [id, await trx.get(ref(uid, 'receivables', id))] as const)));
      const oldMe = active?.participants.find(person => person.isMe);
      const debtSnap = oldMe?.debtId ? await trx.get(ref(uid, 'debts', oldMe.debtId)) : null;
      const walletSnap = input.payer === 'me' && !input.fromTransaction ? await trx.get(ref(uid, 'wallets', input.walletId)) : null;

      const oldDebt = read<Debt>(debtSnap);
      const oldPayments = active?.payments || [];
      const anyPaid = [...receivables.values()].some(snap => receivablePaid(read<Receivable>(snap)) > 0) || debtPaid(oldDebt) > 0 || oldPayments.length > 0;
      if (active && (active.payer !== input.payer || (input.payer === 'other' && active.payerId !== input.payerId)) && anyPaid) throw Error('Pembayar tidak bisa diganti karena sudah ada pembayaran. Batalkan pembayarannya dulu.');

      const people: SplitParticipant[] = clearLinks(input.participants);
      const wallets: Record<string, number> = {};
      const move = (tx: LedgerTx, sign: number) => { for (const [wallet, delta] of Object.entries(effects(tx))) wallets[wallet] = (wallets[wallet] || 0) + delta * sign; };
      const oldTx = read<LedgerTx>(oldTxId ? txSnaps.get(oldTxId) : null);
      const removeTx = (tx: LedgerTx) => { move(tx, -1); trx.delete(ref(uid, 'transactions', tx.id)); deleted.transactions.push(tx.id); if (tx.date < earliest) earliest = tx.date; };
      let txId = '', walletId = '';

      if (input.payer === 'me') {
        if (input.fromTransaction) {
          const tx = read<LedgerTx>(txSnaps.get(convertedId));
          if (!tx) throw Error('Transaksi asalnya tidak ditemukan.');
          if (tx.type !== 'expense' || !tx.walletId) throw Error('Hanya pengeluaran dari dompet yang bisa dijadikan Split Bill.');
          if (tx.splitBillId && tx.splitBillId !== billId) throw Error('Transaksi ini sudah dipakai di Split Bill lain.');
          if (tx.amount !== total) throw Error(`Total tagihan (${rupiah(total)}) harus sama dengan transaksinya (${rupiah(tx.amount)}). Ubah nominal transaksinya dulu bila memang berbeda.`);
          if (!input.categoryId && !tx.splits?.length && !tx.categoryId) throw Error('Pilih kategori tagihan.');
          const category = input.categoryId && !tx.splits?.length ? { categoryId: input.categoryId, subcategoryId: input.subcategoryId || null } : {};
          trx.update(ref(uid, 'transactions', tx.id), { splitBillId: billId, ownShare: myShare, ownSplits: ownSplits.length ? ownSplits : deleteField(), ...category, updatedAt: now() });
          if (oldTx && oldTx.id !== tx.id) removeTx(oldTx);
          txId = tx.id; walletId = tx.walletId;
          if (tx.date < earliest) earliest = tx.date;
        } else {
          if (!walletSnap?.exists()) throw Error('Dompet tidak ditemukan.');
          const cash = oldTx && oldTx.walletId && oldTx.type === 'expense' ? oldTx : null;
          const next = newTx({ type: 'expense', amount: total, walletId: input.walletId, date: input.date, time: input.time || '', categoryId: input.categoryId, subcategoryId: input.subcategoryId || null, merchant: common.merchant, description: title, splitBillId: billId, ownShare: myShare, ...(ownSplits.length ? { ownSplits } : {}) });
          validateWalletUse({ id: walletSnap.id, ...walletSnap.data() } as Wallet, 'pay', cash, next);
          const r = cash ? ref(uid, 'transactions', cash.id) : doc(coll(uid, 'transactions'));
          const { id: _id, ...fields } = next;
          if (cash) { move(cash, -1); trx.update(r, { ...fields, ownSplits: ownSplits.length ? ownSplits : deleteField(), updatedAt: now() }); if (cash.date < earliest) earliest = cash.date; }
          else { trx.set(r, { ...fields, createdAt: now(), updatedAt: now() }); if (oldTx) removeTx(oldTx); }
          move(next, 1);
          txId = r.id; walletId = input.walletId;
        }
        // Everyone else owes their share back: one Piutang each.
        for (const person of people) {
          if (person.isMe) continue;
          const share = shares[person.id] || 0, earlier = before.get(person.id);
          const snap = earlier?.receivableId && active?.payer === 'me' ? receivables.get(earlier.receivableId) : undefined;
          const record = read<Receivable>(snap), paid = receivablePaid(record);
          if (share < paid) throw Error(`${person.name.trim()} sudah membayar ${rupiah(paid)}, jadi bagiannya tidak bisa kurang dari itu.`);
          if (!share) continue;
          const remaining = share - paid;
          const fields = { person: person.name.trim(), description: `Split Bill — ${title}`, originalAmount: share, remainingAmount: remaining, sourceWalletId: '', date: input.date, dueDate: input.dueDate || '', status: remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'open', sourceType: 'split_bill', splitBillId: billId, participantId: person.id, transactionId: txId };
          if (record) { trx.update(ref(uid, 'receivables', record.id), { ...fields, updatedAt: now() }); person.receivableId = record.id; }
          else { const r = doc(coll(uid, 'receivables')); trx.set(r, { ...fields, createdAt: now(), updatedAt: now() }); person.receivableId = r.id; }
        }
      } else {
        if (oldTx?.walletId) { if (active?.fromTransaction) throw Error('Split Bill dari transaksi selalu dibayar olehmu.'); removeTx(oldTx); }
        if (me && myShare > 0) {
          // The user's own share: spending today, no wallet yet.
          const earlierShare = oldTx && !oldTx.walletId ? oldTx : null;
          const main = ownSplits[0] || { categoryId: input.categoryId, subcategoryId: input.subcategoryId || null };
          const next = newTx({ type: 'expense', amount: myShare, walletId: '', date: input.date, time: input.time || '', categoryId: main.categoryId, subcategoryId: main.subcategoryId, merchant: common.merchant, description: title, splitBillId: billId, splits: ownSplits });
          const r = earlierShare ? ref(uid, 'transactions', earlierShare.id) : doc(coll(uid, 'transactions'));
          const { id: _id, ...fields } = next;
          if (earlierShare) { trx.update(r, { ...fields, updatedAt: now() }); if (earlierShare.date < earliest) earliest = earlierShare.date; }
          else trx.set(r, { ...fields, createdAt: now(), updatedAt: now() });
          txId = r.id;
        } else if (oldTx && !oldTx.walletId) removeTx(oldTx);
      }

      // The user's Utang to the person who paid.
      const debtPaidSoFar = debtPaid(oldDebt);
      const meNow = people.find(person => person.isMe);
      if (input.payer === 'other' && meNow && myShare > 0 && payer) {
        if (myShare < debtPaidSoFar) throw Error(`Kamu sudah membayar ${rupiah(debtPaidSoFar)} ke ${payer.name.trim()}, jadi bagianmu tidak bisa kurang dari itu.`);
        const remaining = myShare - debtPaidSoFar;
        const fields = { name: payer.name.trim(), provider: `Split Bill — ${title}`, originalAmount: myShare, outstandingAmount: remaining, dueDate: input.dueDate || '', interestRate: 0, installmentAmount: 0, status: remaining === 0 ? 'paid' : 'open', sourceType: 'split_bill', splitBillId: billId, participantId: meNow.id, transactionId: txId };
        if (oldDebt) { trx.update(ref(uid, 'debts', oldDebt.id), { ...fields, updatedAt: now() }); meNow.debtId = oldDebt.id; }
        else { const r = doc(coll(uid, 'debts')); trx.set(r, { ...fields, notes: '', createdAt: now(), updatedAt: now() }); meNow.debtId = r.id; }
      } else if (oldDebt) {
        if (debtPaidSoFar > 0) throw Error('Bagianmu sudah dibayar sebagian, jadi tagihan ini tidak bisa diubah seperti itu. Batalkan pembayarannya dulu.');
        trx.delete(ref(uid, 'debts', oldDebt.id)); deleted.debts.push(oldDebt.id);
      }
      // Piutang no longer needed (a person removed, a share of zero, or the payer changed).
      for (const id of receivableIds) {
        if (people.some(person => person.receivableId === id)) continue;
        const record = read<Receivable>(receivables.get(id));
        if (!record) continue;
        if (receivablePaid(record) > 0) throw Error(`${record.person} sudah membayar sebagian, jadi tidak bisa dihapus dari tagihan ini.`);
        trx.delete(ref(uid, 'receivables', id)); deleted.receivables.push(id);
      }
      // Payments between two other people stay valid only for the same payer and within each share.
      const payments = input.payer === 'other' && active?.payer === 'other' && active.payerId === input.payerId ? oldPayments : [];
      for (const person of people) {
        const paid = payments.filter(payment => payment.participantId === person.id).reduce((sum, payment) => sum + payment.amount, 0);
        if (paid > (shares[person.id] || 0)) throw Error(`${person.name.trim()} sudah membayar ${rupiah(paid)}, jadi bagiannya tidak bisa kurang dari itu.`);
      }
      if (payments.some(payment => !people.some(person => person.id === payment.participantId))) throw Error('Orang yang sudah membayar tidak bisa dihapus dari tagihan ini.');

      for (const [wallet, delta] of Object.entries(wallets)) if (delta) trx.update(ref(uid, 'wallets', wallet), { cachedBalance: increment(delta), updatedAt: now() });
      const record = { ...common, total, participants: people, payments, shares, myShare, walletId, transactionId: txId, status: 'active' };
      if (old) trx.update(billRef, { ...record, updatedAt: now() }); else trx.set(billRef, { ...record, createdAt: now(), updatedAt: now() });
    });
  } catch (error) { explain(error); }
  if (deleted.receivables.length || deleted.debts.length || deleted.transactions.length) await noteDeleted(uid, deleted);
  if (!draft) await syncSnapshot(uid, earliest);
  return billId;
}

/** A payment between two other people on a bill someone else paid (no wallet of the user is involved). */
export async function recordBetweenPayment(uid: string, billId: string, participantId: string, amount: number, date: string, note = '') {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('Nominal harus lebih dari nol.');
  await runTx(database(), async trx => {
    const snap = await trx.get(ref(uid, 'splitBills', billId)), bill = read<SplitBill>(snap);
    if (!bill) throw Error('Split Bill tidak ditemukan.');
    if (bill.status !== 'active' || bill.payer !== 'other') throw Error('Pembayaran ini dicatat lewat Piutang atau Utang-nya.');
    const person = bill.participants.find(row => row.id === participantId);
    if (!person || person.isMe || person.id === bill.payerId) throw Error('Orang ini tidak perlu membayar.');
    const paid = (bill.payments || []).filter(row => row.participantId === participantId).reduce((sum, row) => sum + row.amount, 0);
    const left = (bill.shares?.[participantId] || 0) - paid;
    if (amount > left) throw Error(`Nominal melebihi sisa ${person.name.trim()} (${rupiah(Math.max(0, left))}).`);
    const payment: SplitPayment = { id: crypto.randomUUID(), participantId, amount, date, ...(note.trim() ? { note: note.trim() } : {}), createdAt: new Date().toISOString() };
    trx.update(ref(uid, 'splitBills', billId), { payments: [...(bill.payments || []), payment], updatedAt: now() });
  });
}
export async function undoBetweenPayment(uid: string, billId: string, paymentId: string) {
  await runTx(database(), async trx => {
    const bill = read<SplitBill>(await trx.get(ref(uid, 'splitBills', billId)));
    if (!bill) throw Error('Split Bill tidak ditemukan.');
    trx.update(ref(uid, 'splitBills', billId), { payments: (bill.payments || []).filter(row => row.id !== paymentId), updatedAt: now() });
  });
}

/**
 * Cancels a bill. Only possible while nothing has been paid: its Piutang/Utang and the transactions it created are removed,
 * and a transaction it was made from counts in full as the user's own spending again. The bill stays in history as cancelled.
 */
export async function cancelSplitBill(uid: string, billId: string) {
  let deleted: Deleted = { receivables: [], debts: [], transactions: [] }, date = '';
  try {
    await runTx(database(), async trx => {
      deleted = { receivables: [], debts: [], transactions: [] };
      const billRef = ref(uid, 'splitBills', billId), bill = read<SplitBill>(await trx.get(billRef));
      if (!bill) throw Error('Split Bill tidak ditemukan.');
      if (bill.status === 'cancelled') return;
      date = bill.date;
      if (bill.status === 'draft') { trx.update(billRef, { status: 'cancelled', cancelledAt: today(), updatedAt: now() }); return; }
      const receivables = await Promise.all(bill.participants.filter(person => person.receivableId).map(person => trx.get(ref(uid, 'receivables', person.receivableId!))));
      const me = bill.participants.find(person => person.isMe);
      const debt = read<Debt>(me?.debtId ? await trx.get(ref(uid, 'debts', me.debtId)) : null);
      const tx = read<LedgerTx>(bill.transactionId ? await trx.get(ref(uid, 'transactions', bill.transactionId)) : null);
      if (receivables.some(snap => receivablePaid(read<Receivable>(snap)) > 0) || debtPaid(debt) > 0 || (bill.payments || []).length) throw Error('Split Bill ini sudah punya pembayaran. Batalkan pembayarannya dulu dari detail tiap orang, lalu coba lagi.');
      for (const snap of receivables) if (snap.exists()) { trx.delete(snap.ref); deleted.receivables.push(snap.id); }
      if (debt) { trx.delete(ref(uid, 'debts', debt.id)); deleted.debts.push(debt.id); }
      if (tx) {
        if (bill.fromTransaction) trx.update(ref(uid, 'transactions', tx.id), { splitBillId: deleteField(), ownShare: deleteField(), ownSplits: deleteField(), updatedAt: now() });
        else {
          for (const [wallet, delta] of Object.entries(effects(tx))) trx.update(ref(uid, 'wallets', wallet), { cachedBalance: increment(-delta), updatedAt: now() });
          trx.delete(ref(uid, 'transactions', tx.id)); deleted.transactions.push(tx.id);
        }
        if (tx.date < date) date = tx.date;
      }
      trx.update(billRef, { status: 'cancelled', cancelledAt: today(), participants: clearLinks(bill.participants), transactionId: bill.fromTransaction ? bill.transactionId : '', walletId: bill.fromTransaction ? bill.walletId : '', updatedAt: now() });
    });
  } catch (error) { explain(error); }
  if (deleted.receivables.length || deleted.debts.length || deleted.transactions.length) await noteDeleted(uid, deleted);
  if (date) await syncSnapshot(uid, date);
}

/** Drafts and cancelled bills can be deleted for good; active bills are cancelled first. */
export async function deleteSplitBill(uid: string, bill: Pick<SplitBill, 'id' | 'status' | 'receiptPath'>) {
  if (bill.status === 'active') throw Error('Batalkan Split Bill ini dulu sebelum menghapusnya.');
  const batch = writeBatch(database()); batch.delete(ref(uid, 'splitBills', bill.id)); await settle(batch.commit());
  await noteDeleted(uid, { splitBills: [bill.id] });
  if (bill.receiptPath) await removeReceiptFile(uid, bill.receiptPath);
}

/* ------------------------------------------------------------------ Saved people and groups */

export async function saveSplitPerson(uid: string, person: Pick<SplitPerson, 'name'> & Partial<SplitPerson>, id?: string) {
  const name = person.name.trim().slice(0, 60);
  if (!name) throw Error('Isi nama orangnya.');
  const r = id ? ref(uid, 'splitPeople', id) : doc(coll(uid, 'splitPeople'));
  const fields = { name, nickname: (person.nickname || '').trim().slice(0, 40), emoji: person.emoji || '', notes: (person.notes || '').trim().slice(0, 300) };
  if (id) await settle(updateDoc(r, { ...fields, updatedAt: now() })); else await settle(setDoc(r, { ...fields, createdAt: now(), updatedAt: now() }));
  return r.id;
}
export async function deleteSplitPerson(uid: string, id: string) {
  const batch = writeBatch(database()); batch.delete(ref(uid, 'splitPeople', id)); await settle(batch.commit());
  await noteDeleted(uid, { splitPeople: [id] });
}
export async function saveSplitGroup(uid: string, group: Pick<SplitGroup, 'name' | 'memberIds'> & Partial<SplitGroup>, id?: string) {
  const name = group.name.trim().slice(0, 60);
  if (!name) throw Error('Isi nama grupnya.');
  const r = id ? ref(uid, 'splitGroups', id) : doc(coll(uid, 'splitGroups'));
  const fields = { name, emoji: group.emoji || '👥', memberIds: [...new Set(group.memberIds)].slice(0, 60) };
  if (id) await settle(updateDoc(r, { ...fields, updatedAt: now() })); else await settle(setDoc(r, { ...fields, createdAt: now(), updatedAt: now() }));
  return r.id;
}
export async function deleteSplitGroup(uid: string, id: string) {
  const batch = writeBatch(database()); batch.delete(ref(uid, 'splitGroups', id)); await settle(batch.commit());
  await noteDeleted(uid, { splitGroups: [id] });
}

/* ------------------------------------------------------------------ Receipt photo (optional, needs Firebase Storage) */

/** Keeps the receipt photo under the user's own folder (users/{uid}/…); only the owner can read it (storage.rules). */
export async function attachSplitReceipt(uid: string, billId: string, file: Blob, previous?: string) {
  if (file.size > 10 * 1024 * 1024) throw Error('Ukuran foto maksimal 10 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Gunakan foto JPG, PNG, atau WebP.');
  const { storage } = await import('./firebase');
  if (!storage) throw Error('Penyimpanan foto belum tersedia.');
  const { ref: storageRef, uploadBytes } = await import('firebase/storage');
  const path = `users/${uid}/split-bills/${billId}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
  await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
  await settle(updateDoc(ref(uid, 'splitBills', billId), { receiptPath: path, updatedAt: now() }));
  if (previous && previous !== path) await removeReceiptFile(uid, previous);
  return path;
}
export async function removeSplitReceipt(uid: string, billId: string, path: string) {
  await settle(updateDoc(ref(uid, 'splitBills', billId), { receiptPath: '', updatedAt: now() }));
  await removeReceiptFile(uid, path);
}
async function removeReceiptFile(uid: string, path: string) {
  if (!path.startsWith(`users/${uid}/`)) return;
  try { const { storage } = await import('./firebase'); if (!storage) return; const { ref: storageRef, deleteObject } = await import('firebase/storage'); await deleteObject(storageRef(storage, path)); } catch { /* already gone or Storage unavailable */ }
}
/**
 * Shows the photo inside the app only: the file is fetched with the owner's sign-in and turned into a local
 * blob: address (revoke it when done). No shareable download link is ever created.
 */
export async function splitReceiptUrl(path: string) {
  const { storage } = await import('./firebase');
  if (!storage) throw Error('Penyimpanan foto belum tersedia.');
  const { ref: storageRef, getBlob } = await import('firebase/storage');
  return URL.createObjectURL(await getBlob(storageRef(storage, path)));
}
/** Removes every Split Bill receipt photo of this account from the cloud (and the links to them). Returns how many. */
export async function removeAllSplitReceipts(uid: string, bills: Pick<SplitBill, 'id' | 'receiptPath'>[]) {
  if (isOffline()) throw Error('Butuh koneksi internet. Sambungkan dulu, lalu coba lagi.');
  const linked = bills.filter(bill => bill.receiptPath);
  for (const bill of linked) await settle(updateDoc(ref(uid, 'splitBills', bill.id), { receiptPath: '', updatedAt: now() }));
  const paths = new Set(linked.map(bill => bill.receiptPath!));
  // Also files no bill points to any more (an earlier photo that was replaced, a failed save).
  try {
    const { storage } = await import('./firebase');
    if (storage) {
      const { ref: storageRef, listAll } = await import('firebase/storage');
      const walk = async (path: string) => { const found = await listAll(storageRef(storage, path)); found.items.forEach(item => paths.add(item.fullPath)); for (const folder of found.prefixes) await walk(folder.fullPath); };
      await walk(`users/${uid}/split-bills`);
    }
  } catch { /* listing is best effort; the linked photos are still removed */ }
  for (const path of paths) await removeReceiptFile(uid, path);
  return paths.size;
}
