import { deleteDoc, deleteField, getDocs, limit, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, signOut, type User } from 'firebase/auth';
import { auth, db } from './firebase';
import { coll, exportData, names, userRef } from './firestore';
import { isOffline } from './offline';

/**
 * "Reset semua data" and "Hapus akun" (Pengaturan). Both remove every record of the signed-in account only
 * (users/{uid}/…), page by page, and need a connection: offline, the device cache cannot see every record.
 */
type Name = typeof names[number];
export const recordLabels: Record<Name, string> = { wallets: 'dompet', categories: 'kategori', budgets: 'anggaran', transactions: 'transaksi', claims: 'klaim kantor', receivables: 'piutang', debts: 'utang', funds: 'tujuan dana', recurring: 'jadwal rutin', drafts: 'draf', plannedTransactions: 'rencana', categorizationRules: 'aturan kategori', financialNotes: 'catatan', cycleSnapshots: 'riwayat siklus', wishlist: 'wish list' };
/** Schedules and drafts go first so nothing new is created from them mid-way; wallets and categories go last. */
const first: Name[] = ['recurring', 'drafts', 'plannedTransactions', 'budgets', 'categorizationRules', 'transactions'];
export const wipeOrder: Name[] = [...first, ...names.filter(name => !first.includes(name))];
export type WipeProgress = { step: number; total: number; label: string };

function requireOnline() { if (isOffline()) throw Error('Butuh koneksi internet. Sambungkan dulu, lalu coba lagi.'); }

/** Receipt files of office claims. Removed when the storage rules allow it; the records are deleted either way. */
async function removeReceipts(uid: string, paths: unknown[]) {
  const own = paths.filter((path): path is string => typeof path === 'string' && path.startsWith(`users/${uid}/`));
  if (!own.length) return;
  try {
    const { storage } = await import('./firebase'); if (!storage) return;
    const { ref, deleteObject } = await import('firebase/storage');
    await Promise.allSettled(own.map(path => deleteObject(ref(storage, path))));
  } catch { /* Storage is optional. */ }
}

export async function wipeUserData(uid: string, onProgress?: (progress: WipeProgress) => void) {
  if (!db) throw Error('Konfigurasi Firebase belum tersedia.');
  requireOnline();
  for (const [index, name] of wipeOrder.entries()) {
    onProgress?.({ step: index + 1, total: wipeOrder.length, label: recordLabels[name] });
    for (let page = 0; page < 2000; page++) {
      const snap = await getDocs(query(coll(uid, name), limit(400)));
      if (snap.empty) break;
      if (name === 'claims') await removeReceipts(uid, snap.docs.map(row => row.get('attachmentPath')));
      const batch = writeBatch(db); snap.docs.forEach(row => batch.delete(row.ref)); await batch.commit();
      if (snap.size < 400) break;
    }
  }
}

/** Profile fields that point at deleted records; they are always cleared. */
const recordLinks = ['defaultExpenseWalletId', 'defaultIncomeWalletId', 'salaryIncomeCategoryId', 'dashboardWidgetConfig', 'quickActions', 'defaultCategoryTemplateVersion'];
/** Preferences cleared only when the user also resets the settings (account, name, salary day and PIN stay). */
const preferences = ['themePreset', 'colorMode', 'accentColor', 'density', 'fontSize', 'fontFamily', 'reminders', 'dashboardWidgetsVersion', 'primaryMetric', 'dashboardPeriod', 'dashboardCustom', 'analyticsPeriod', 'analyticsCustom', 'analyticsGranularity', 'realisticMode', 'largeTransactionThreshold', 'excludeCommittedFromAvailable', 'netWorthIncludesReceivables', 'freeMoneyBuffer', 'commitmentHorizon', 'budgetWarningPercent', 'insightProfile', 'insightLayout'];

/** Local copies on this device that belong to the account (notification history, appearance, fingerprint unlock…). */
function forgetOnDevice(uid: string, only?: string[]) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith('dompet-ajaib:') || !key.endsWith(`:${uid}`)) continue;
      if (!only || only.some(kind => key === `dompet-ajaib:${kind}:${uid}`)) localStorage.removeItem(key);
    }
    if (!only && localStorage.getItem('dompet-ajaib:appearance:last') === uid) localStorage.removeItem('dompet-ajaib:appearance:last');
  } catch { /* Nothing stored on this device. */ }
}

/** Deletes every record, then starts the first-run setup again. The account, password, name and PIN stay. */
export async function resetAllData(uid: string, options: { preferences: boolean }, onProgress?: (progress: WipeProgress) => void) {
  requireOnline();
  await wipeUserData(uid, onProgress);
  // syncMarks: the account's other devices see that everything was deleted and empty their copy too (lib/sync.ts).
  const changes: Record<string, unknown> = { onboardingDone: false, syncMarks: Object.fromEntries(names.map(name => [name, serverTimestamp()])), updatedAt: serverTimestamp() };
  for (const field of recordLinks) changes[field] = deleteField();
  if (options.preferences) { for (const field of preferences) changes[field] = deleteField(); Object.assign(changes, { theme: 'light', dashboardWidgets: [], hideReserved: true }); }
  await updateDoc(userRef(uid), changes);
  forgetOnDevice(uid, ['seen', 'notifications']);
}

export type DeleteProgress = WipeProgress & { stage: 'verify' | 'data' | 'account' };
/** Checks the password, deletes every record and the profile, then the login itself. */
export async function deleteAccount(user: User, password: string, onProgress?: (progress: DeleteProgress) => void) {
  requireOnline();
  if (!user.email) throw Error('Akun ini belum memiliki email.');
  const uid = user.uid, total = wipeOrder.length;
  onProgress?.({ stage: 'verify', step: 0, total, label: 'password' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await wipeUserData(uid, progress => onProgress?.({ ...progress, stage: 'data' }));
  onProgress?.({ stage: 'account', step: total, total, label: 'akun' });
  await deleteDoc(userRef(uid));
  try { sessionStorage.setItem('dompet-ajaib:account-deleted', 'done'); } catch { /* Only for the goodbye message. */ }
  try { await deleteUser(user); }
  catch (error) {
    // The records are gone but the login stayed: sign out so the next login starts clean and can try again.
    try { sessionStorage.setItem('dompet-ajaib:account-deleted', 'partial'); } catch { /* Message only. */ }
    if (auth) await signOut(auth).catch(() => undefined);
    throw error;
  } finally { forgetOnDevice(uid); }
}

/** Saves every record as a JSON file (the same file Pulihkan dari cadangan reads). */
export async function downloadBackup(uid: string) {
  const backup = await exportData(uid);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `dompet-ajaib-backup-${new Date().toLocaleDateString('en-CA')}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
