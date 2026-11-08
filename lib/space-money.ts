/**
 * 9.0 Money between someone's own records (Pribadi) and a Ruang Bersama.
 *
 *  - Setor: money from a personal wallet into a shared wallet (Pribadi: spending "Kontribusi bersama"; space: income
 *    "Setoran Rama").
 *  - Ambil: the other way.
 *  - Paid with personal money, "untuk bersama": counted as that person's contribution; no shared wallet changes.
 *  - Paid with personal money, "patungan": split between members. In Pribadi only the payer's own share is spending,
 *    the others' shares are Piutang (with each member's name); in the space the others now owe the payer.
 *  - Lunasi: a member pays back what they owe. Each person confirms their own side (nobody writes into someone
 *    else's Pribadi): the payer records it when paying, the one paid back picks the wallet it came into.
 *
 * Each step is one write (a batch), so both sides change together or not at all.
 */
import {
  collection, deleteField, doc, getDocs, getDocsFromCache, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, limit,
  type DocumentReference, type Unsubscribe, type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { settle } from './offline';
import { newTx, syncSnapshot, upsertTransaction } from './firestore';
import { spaceKey, stamp } from './space-key';
import { logActivity } from './space-activity';
import type { Category, LedgerTx, Wallet } from './types';
import type { Space } from './space-profile';
import { balances, equalShares } from './space-math';
export { balances, equalShares };

export type MemberFlow = { kind: 'deposit' | 'withdrawal' | 'paid' | 'split' | 'reimburse'; uid: string; name: string; shares?: Record<string, number>; /** 9.1 reimburse: still waiting to be paid back from the shared cash. */ pending?: boolean; paidBackBy?: string };
/** 9.1 The shared cash as the one paying back (in settlements, and on the payer's Piutang). */
export const KAS = '__kas';
export type SpaceFlow = { spaceId: string; spaceName: string; kind: MemberFlow['kind'] | 'settle' | 'received' };
export type Settlement = { id: string; from: string; fromName: string; to: string; toName: string; amount: number; date: string; at?: unknown; received?: boolean; receivedAt?: unknown };
export type Person = { uid: string; name: string };

/** Categories made when first needed, on fixed ids (never twice). */
export const CAT = {
  personalOut: { id: 'shared-contribution', name: 'Kontribusi bersama', type: 'expense', icon: '🏠' },
  personalIn: { id: 'shared-return', name: 'Dari ruang bersama', type: 'income', icon: '🏠' },
  spaceIn: { id: 'member-deposit', name: 'Setoran anggota', type: 'income', icon: '💰' },
  spaceOut: { id: 'member-withdrawal', name: 'Diambil anggota', type: 'expense', icon: '👛' },
} as const;

function database() { if (!db) throw Error('Konfigurasi Firebase belum tersedia.'); return db; }
const own = (uid: string, name: string, id?: string) => id ? doc(database(), 'users', uid, name, id) : doc(collection(database(), 'users', uid, name));
const shared = (spaceId: string, name: string, id?: string) => id ? doc(database(), 'spaces', spaceId, name, id) : doc(collection(database(), 'spaces', spaceId, name));
const valid = (n: number) => Number.isSafeInteger(n) && n > 0;

/** The person's own wallets and categories, also while a space is on screen (device copy first). */
export async function readPersonal(uid: string) {
  const read = async (name: string) => { const target = collection(database(), 'users', uid, name); try { const snap = await getDocsFromCache(target); if (!snap.empty) return snap; } catch { /* ask the server */ } return getDocs(target); };
  const [w, c] = await Promise.all([read('wallets'), read('categories')]);
  return {
    wallets: w.docs.map(d => ({ id: d.id, ...d.data() }) as Wallet).filter(x => !x.isArchived).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    categories: c.docs.map(d => ({ id: d.id, ...d.data() }) as Category),
  };
}

function ensureCategory(b: WriteBatch, target: DocumentReference, have: Category[], c: { id: string; name: string; type: string; icon: string }) {
  if (have.some(x => x.id === c.id && !x.isArchived)) return;
  b.set(target, { name: c.name, type: c.type, parentId: null, icon: c.icon, sortOrder: 900, isArchived: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
}
function checkWallet(w: Wallet | undefined, use: 'pay' | 'receive') {
  if (!w || w.isArchived) throw Error('Dompet tidak ditemukan.');
  if (use === 'pay' && w.canPay === false) throw Error(`${w.name} tidak bisa dipakai untuk membayar.`);
  if (use === 'receive' && w.canReceive === false) throw Error(`${w.name} tidak bisa menerima uang.`);
}
function tx(input: Partial<LedgerTx> & Pick<LedgerTx, 'type' | 'amount' | 'walletId'>, extra: Record<string, unknown> = {}) {
  const { id: _id, ...fields } = newTx(input);
  return { ...fields, ...extra, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}
async function after(uid: string, space: Space, date: string) { await Promise.all([syncSnapshot(uid, date).catch(() => {}), syncSnapshot(spaceKey(space.id), date).catch(() => {})]); }

type Base = { me: Person; space: Space; amount: number; date: string; personalWallet: Wallet; personalCats: Category[]; spaceCats: Category[] };

/** Setor: personal wallet → shared wallet. */
export async function deposit({ me, space, amount, date, personalWallet, personalCats, spaceCats, spaceWallet, note = '' }: Base & { spaceWallet: Wallet; note?: string }) {
  if (!valid(amount)) throw Error('Nominal harus lebih dari nol.');
  checkWallet(personalWallet, 'pay'); checkWallet(spaceWallet, 'receive');
  const b = writeBatch(database()), sk = spaceKey(space.id), sTx = shared(space.id, 'transactions');
  ensureCategory(b, own(me.uid, 'categories', CAT.personalOut.id), personalCats, CAT.personalOut);
  ensureCategory(b, shared(space.id, 'categories', CAT.spaceIn.id), spaceCats, CAT.spaceIn);
  b.set(own(me.uid, 'transactions'), tx({ type: 'expense', amount, walletId: personalWallet.id, categoryId: CAT.personalOut.id, date, description: `Setor ke ${space.name}`, notes: note }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: 'deposit' } satisfies SpaceFlow }));
  b.update(own(me.uid, 'wallets', personalWallet.id), { cachedBalance: increment(-amount), updatedAt: serverTimestamp() });
  const spaceTx = tx({ type: 'income', amount, walletId: spaceWallet.id, categoryId: CAT.spaceIn.id, date, description: `Setoran ${me.name}`, notes: note }, { ...stamp(sk, true), memberFlow: { kind: 'deposit', uid: me.uid, name: me.name } satisfies MemberFlow });
  b.set(sTx, spaceTx);
  b.update(shared(space.id, 'wallets', spaceWallet.id), { cachedBalance: increment(amount), updatedAt: serverTimestamp() });
  await settle(b.commit());
  logActivity(sk, 'add', { ...spaceTx, id: sTx.id } as unknown as LedgerTx);
  await after(me.uid, space, date);
}

/** Ambil: shared wallet → personal wallet. */
export async function withdraw({ me, space, amount, date, personalWallet, personalCats, spaceCats, spaceWallet, note = '' }: Base & { spaceWallet: Wallet; note?: string }) {
  if (!valid(amount)) throw Error('Nominal harus lebih dari nol.');
  checkWallet(spaceWallet, 'pay'); checkWallet(personalWallet, 'receive');
  const b = writeBatch(database()), sk = spaceKey(space.id), sTx = shared(space.id, 'transactions');
  ensureCategory(b, own(me.uid, 'categories', CAT.personalIn.id), personalCats, CAT.personalIn);
  ensureCategory(b, shared(space.id, 'categories', CAT.spaceOut.id), spaceCats, CAT.spaceOut);
  const spaceTx = tx({ type: 'expense', amount, walletId: spaceWallet.id, categoryId: CAT.spaceOut.id, date, description: `Diambil ${me.name}`, notes: note }, { ...stamp(sk, true), memberFlow: { kind: 'withdrawal', uid: me.uid, name: me.name } satisfies MemberFlow });
  b.set(sTx, spaceTx);
  b.update(shared(space.id, 'wallets', spaceWallet.id), { cachedBalance: increment(-amount), updatedAt: serverTimestamp() });
  b.set(own(me.uid, 'transactions'), tx({ type: 'income', amount, walletId: personalWallet.id, categoryId: CAT.personalIn.id, date, description: `Diambil dari ${space.name}`, notes: note }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: 'withdrawal' } satisfies SpaceFlow }));
  b.update(own(me.uid, 'wallets', personalWallet.id), { cachedBalance: increment(amount), updatedAt: serverTimestamp() });
  await settle(b.commit());
  logActivity(sk, 'add', { ...spaceTx, id: sTx.id } as unknown as LedgerTx);
  await after(me.uid, space, date);
}

/** Something for the space paid with the payer's own money: "untuk bersama" (their contribution) or "patungan" (split). */
export async function payPersonally({ me, space, amount, date, personalWallet, personalCats, description, categoryId, subcategoryId, mode, shares, names }: Base & {
  description: string; categoryId: string; subcategoryId?: string | null; mode: 'together' | 'split'; shares?: Record<string, number>; names: Record<string, string>;
}) {
  if (!valid(amount)) throw Error('Nominal harus lebih dari nol.');
  if (!categoryId) throw Error('Pilih kategori pengeluaran.');
  checkWallet(personalWallet, 'pay');
  const what = description.trim() || 'Belanja bersama';
  const parts = mode === 'split' ? Object.fromEntries(Object.entries(shares || {}).filter(([, n]) => n > 0)) : {};
  if (mode === 'split') {
    const sum = Object.values(parts).reduce((n, x) => n + x, 0);
    if (sum !== amount) throw Error(sum < amount ? `Pembagian masih kurang Rp${(amount - sum).toLocaleString('id-ID')}.` : `Pembagian lebih Rp${(sum - amount).toLocaleString('id-ID')}.`);
    if (!Object.keys(parts).some(uid => uid !== me.uid)) throw Error('Pilih minimal satu anggota lain untuk patungan.');
    if (Object.values(parts).some(n => !Number.isSafeInteger(n) || n < 0)) throw Error('Bagian tiap orang harus angka Rupiah.');
  }
  const b = writeBatch(database()), sk = spaceKey(space.id), sTx = shared(space.id, 'transactions');
  const mine = mode === 'split' ? parts[me.uid] || 0 : amount;
  ensureCategory(b, own(me.uid, 'categories', CAT.personalOut.id), personalCats, CAT.personalOut);
  // Pribadi: own share as spending; the others' shares as Piutang, each with the member's name.
  if (mine > 0) b.set(own(me.uid, 'transactions'), tx({ type: 'expense', amount: mine, walletId: personalWallet.id, categoryId: CAT.personalOut.id, date, description: mode === 'split' ? `${what} · bagianku di ${space.name}` : `${what} · untuk ${space.name}` }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: mode === 'split' ? 'split' : 'paid' } satisfies SpaceFlow }));
  for (const [uid, share] of Object.entries(parts)) {
    if (uid === me.uid) continue;
    const r = own(me.uid, 'receivables'), person = names[uid] || 'Anggota';
    b.set(r, { person, description: `Patungan ${what} · ${space.name}`, originalAmount: share, remainingAmount: share, sourceWalletId: personalWallet.id, date, dueDate: '', status: 'open', spaceId: space.id, spaceName: space.name, memberUid: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.set(own(me.uid, 'transactions'), tx({ type: 'receivable_issue', amount: share, walletId: personalWallet.id, receivableId: r.id, date, description: person }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: 'split' } satisfies SpaceFlow }));
  }
  b.update(own(me.uid, 'wallets', personalWallet.id), { cachedBalance: increment(-amount), updatedAt: serverTimestamp() });
  // Space: the whole spending, no shared wallet moves; in a split the others now owe the payer.
  const flow: MemberFlow = { kind: mode === 'split' ? 'split' : 'paid', uid: me.uid, name: me.name, ...(mode === 'split' ? { shares: parts } : {}) };
  const spaceTx = tx({ type: 'expense', amount, walletId: '', categoryId, subcategoryId: subcategoryId || null, date, description: what }, { ...stamp(sk, true), memberFlow: flow });
  b.set(sTx, spaceTx);
  const owed: Record<string, unknown> = {};
  for (const [uid, share] of Object.entries(parts)) if (uid !== me.uid) owed[`owed.${uid}.${me.uid}`] = increment(share);
  if (Object.keys(owed).length) b.update(doc(database(), 'spaces', space.id), { ...owed, updatedAt: serverTimestamp() });
  await settle(b.commit());
  logActivity(sk, 'add', { ...spaceTx, id: sTx.id } as unknown as LedgerTx);
  await after(me.uid, space, date);
}

/** Lunasi: this person pays back another member (recorded in their own Pribadi when a wallet is chosen). */
export async function settleUp({ me, space, to, amount, date, personalWallet, personalCats }: { me: Person; space: Space; to: Person; amount: number; date: string; personalWallet: Wallet | null; personalCats: Category[] }) {
  if (!valid(amount)) throw Error('Nominal harus lebih dari nol.');
  if (personalWallet) checkWallet(personalWallet, 'pay');
  const b = writeBatch(database());
  b.set(shared(space.id, 'settlements'), { from: me.uid, fromName: me.name, to: to.uid, toName: to.name, amount, date, at: serverTimestamp(), received: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.update(doc(database(), 'spaces', space.id), { [`owed.${me.uid}.${to.uid}`]: increment(-amount), updatedAt: serverTimestamp() });
  if (personalWallet) {
    ensureCategory(b, own(me.uid, 'categories', CAT.personalOut.id), personalCats, CAT.personalOut);
    b.set(own(me.uid, 'transactions'), tx({ type: 'expense', amount, walletId: personalWallet.id, categoryId: CAT.personalOut.id, date, description: `Bayar patungan ke ${to.name} · ${space.name}` }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: 'settle' } satisfies SpaceFlow }));
    b.update(own(me.uid, 'wallets', personalWallet.id), { cachedBalance: increment(-amount), updatedAt: serverTimestamp() });
  }
  await settle(b.commit());
  if (personalWallet) await syncSnapshot(me.uid, date).catch(() => {});
}

export function subscribeSettlements(spaceId: string, onValue: (list: Settlement[]) => void): Unsubscribe {
  return onSnapshot(query(collection(database(), 'spaces', spaceId, 'settlements'), orderBy('at', 'desc'), limit(100)), snap => onValue(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Settlement)), () => onValue([]));
}

/** The one paid back confirms it: into which of their own wallets (paying off the Piutang made for that member,
 * oldest first; anything beyond it is income), or not recorded at all. */
export async function receiveSettlement({ me, space, settlement, personalWallet, personalCats }: { me: Person; space: Space; settlement: Settlement; personalWallet: Wallet | null; personalCats: Category[] }) {
  if (personalWallet) {
    checkWallet(personalWallet, 'receive');
    const open = (await getDocs(query(collection(database(), 'users', me.uid, 'receivables'), where('spaceId', '==', space.id), where('memberUid', '==', settlement.from))))
      .docs.map(d => ({ id: d.id, ...d.data() }) as { id: string; remainingAmount: number; date: string; person: string })
      .filter(r => r.remainingAmount > 0).sort((a, b) => a.date.localeCompare(b.date));
    let left = settlement.amount;
    for (const r of open) {
      if (left <= 0) break;
      const part = Math.min(left, r.remainingAmount);
      await upsertTransaction(me.uid, newTx({ type: 'receivable_payment', amount: part, walletId: personalWallet.id, receivableId: r.id, date: settlement.date, description: `${settlement.fromName} bayar patungan · ${space.name}` }));
      left -= part;
    }
    if (left > 0) {
      const b = writeBatch(database());
      ensureCategory(b, own(me.uid, 'categories', CAT.personalIn.id), personalCats, CAT.personalIn);
      b.set(own(me.uid, 'transactions'), tx({ type: 'income', amount: left, walletId: personalWallet.id, categoryId: CAT.personalIn.id, date: settlement.date, description: `${settlement.fromName} bayar patungan · ${space.name}` }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: 'received' } satisfies SpaceFlow }));
      b.update(own(me.uid, 'wallets', personalWallet.id), { cachedBalance: increment(left), updatedAt: serverTimestamp() });
      await settle(b.commit());
      await syncSnapshot(me.uid, settlement.date).catch(() => {});
    }
  }
  await updateDoc(shared(space.id, 'settlements', settlement.id), { received: true, receivedAt: serverTimestamp(), receivedRecorded: Boolean(personalWallet), updatedAt: serverTimestamp() });
}

/** Removes a shared spending paid with someone's own money; a split's "owes" are taken back. The payer's own records
 * (their spending and Piutang) stay as they are: only they can change those. */
export async function deletePaidPersonally(space: Space, t: LedgerTx & { memberFlow?: MemberFlow }) {
  const b = writeBatch(database());
  b.delete(shared(space.id, 'transactions', t.id));
  const flow = t.memberFlow;
  if (flow?.kind === 'reimburse' && flow.pending) b.update(doc(database(), 'spaces', space.id), { [`reimburse.${t.id}`]: deleteField(), updatedAt: serverTimestamp() });
  if (flow?.kind === 'split' && flow.shares) {
    const back: Record<string, unknown> = {};
    for (const [uid, share] of Object.entries(flow.shares)) if (uid !== flow.uid && share > 0) back[`owed.${uid}.${flow.uid}`] = increment(-share);
    if (Object.keys(back).length) b.update(doc(database(), 'spaces', space.id), { ...back, updatedAt: serverTimestamp() });
  }
  await settle(b.commit());
  logActivity(spaceKey(space.id), 'delete', t, t);
  await syncSnapshot(spaceKey(space.id), t.date).catch(() => {});
}

/** 9.1 Paid with one's own money, to be paid back from the shared cash: in Pribadi a Piutang to "Kas <space>" (money out,
 * not spending); in the space the spending, waiting for a member to pay it back from a shared wallet. */
export async function payForReimbursement({ me, space, amount, date, personalWallet, description, categoryId, subcategoryId }: Base & { description: string; categoryId: string; subcategoryId?: string | null }) {
  if (!valid(amount)) throw Error('Nominal harus lebih dari nol.');
  if (!categoryId) throw Error('Pilih kategori pengeluaran.');
  checkWallet(personalWallet, 'pay');
  const what = description.trim() || 'Belanja bersama';
  const b = writeBatch(database()), sk = spaceKey(space.id), sTx = shared(space.id, 'transactions'), r = own(me.uid, 'receivables');
  b.set(r, { person: `Kas ${space.name}`, description: `Diganti dari kas · ${what}`, originalAmount: amount, remainingAmount: amount, sourceWalletId: personalWallet.id, date, dueDate: '', status: 'open', spaceId: space.id, spaceName: space.name, memberUid: KAS, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.set(own(me.uid, 'transactions'), tx({ type: 'receivable_issue', amount, walletId: personalWallet.id, receivableId: r.id, date, description: `Kas ${space.name}` }, { spaceFlow: { spaceId: space.id, spaceName: space.name, kind: 'reimburse' } satisfies SpaceFlow }));
  b.update(own(me.uid, 'wallets', personalWallet.id), { cachedBalance: increment(-amount), updatedAt: serverTimestamp() });
  const spaceTx = tx({ type: 'expense', amount, walletId: '', categoryId, subcategoryId: subcategoryId || null, date, description: what }, { ...stamp(sk, true), memberFlow: { kind: 'reimburse', uid: me.uid, name: me.name, pending: true } satisfies MemberFlow });
  b.set(sTx, spaceTx);
  b.update(doc(database(), 'spaces', space.id), { [`reimburse.${sTx.id}`]: { uid: me.uid, name: me.name, amount, title: what, date }, updatedAt: serverTimestamp() });
  await settle(b.commit());
  logActivity(sk, 'add', { ...spaceTx, id: sTx.id } as unknown as LedgerTx);
  await after(me.uid, space, date);
}

/** 9.1 A member pays it back from a shared wallet: the spending now comes out of that wallet, and the payer is told
 * (they confirm into which of their own wallets, like any Lunasi). */
export async function reimburseFromCash({ me, space, txId, spaceWallet }: { me: Person; space: Space; txId: string; spaceWallet: Wallet }) {
  const item = space.reimburse?.[txId];
  if (!item) throw Error('Sudah diganti atau tidak ditemukan.');
  checkWallet(spaceWallet, 'pay');
  const b = writeBatch(database()), sk = spaceKey(space.id);
  b.update(shared(space.id, 'transactions', txId), { walletId: spaceWallet.id, 'memberFlow.pending': false, 'memberFlow.paidBackBy': me.uid, ...stamp(sk, false), updatedAt: serverTimestamp() });
  b.update(shared(space.id, 'wallets', spaceWallet.id), { cachedBalance: increment(-item.amount), updatedAt: serverTimestamp() });
  b.update(doc(database(), 'spaces', space.id), { [`reimburse.${txId}`]: deleteField(), updatedAt: serverTimestamp() });
  b.set(shared(space.id, 'settlements'), { from: KAS, fromName: `Kas ${space.name}`, to: item.uid, toName: item.name, amount: item.amount, date: item.date, kind: 'reimburse', note: item.title, by: me.uid, byName: me.name, at: serverTimestamp(), received: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await settle(b.commit());
  await syncSnapshot(sk, item.date).catch(() => {});
}
