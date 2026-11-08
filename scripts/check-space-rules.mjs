// 9.0 Ruang Bersama — checks firestore.rules against the local Firebase Emulator (never a real project).
// Start the emulator (auth + firestore, project demo-dompet) with this repo's firestore.rules, then:
//   node scripts/check-space-rules.mjs
// Every case says what must be allowed or refused; the script exits non-zero if any case differs.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  arrayUnion, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query,
  serverTimestamp, setDoc, setLogLevel, Timestamp, updateDoc, where, writeBatch, deleteField,
} from 'firebase/firestore';
setLogLevel('silent');

const PROJECT = 'demo-dompet', AUTH = 'http://127.0.0.1:9099', FS = 'http://127.0.0.1:8080';
const run = Date.now().toString(36);
let failed = 0, passed = 0;
async function expect(label, allowed, action) {
  let ok = true, why = '';
  try { await action(); } catch (e) { ok = false; why = e.code || e.message; }
  if (ok === allowed) { passed++; console.log(`  ok   ${allowed ? 'boleh ' : 'ditolak'}  ${label}`); }
  else { failed++; console.log(`  GAGAL ${allowed ? 'harus boleh' : 'harus ditolak'}  ${label}${why ? `  (${why})` : ''}`); }
}

async function makeUser(name, grant = true) {
  const email = `${name}-${run}@example.test`;
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }) });
  const { localId: uid } = await res.json();
  if (grant) await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/accessGrants/${uid}`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { code: { stringValue: 'rules-check' } } }) });
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `${name}-${run}`);
  const auth = getAuth(app); connectAuthEmulator(auth, AUTH, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, 'password123');
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { name, uid, email, db };
}
const code = () => Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const inHours = h => Timestamp.fromMillis(Date.now() + h * 36e5);

async function invite(member, spaceId, hours = 24) {
  const c = code();
  await setDoc(doc(member.db, 'spaceInvites', c), { spaceId, spaceName: 'Rumah', inviterName: member.name, createdBy: member.uid, expiresAt: inHours(hours), at: serverTimestamp() });
  return c;
}
async function ask(person, spaceId, c) {
  const b = writeBatch(person.db);
  b.set(doc(person.db, 'spaces', spaceId, 'requests', person.uid), { name: person.name, email: person.email, code: c, at: serverTimestamp() });
  b.update(doc(person.db, 'spaceInvites', c), { usedBy: person.uid, usedAt: serverTimestamp() });
  await b.commit();
}
async function approve(member, spaceId, person) {
  const b = writeBatch(member.db);
  b.update(doc(member.db, 'spaces', spaceId), { memberIds: arrayUnion(person.uid), [`members.${person.uid}`]: { name: person.name }, updatedAt: serverTimestamp() });
  b.delete(doc(member.db, 'spaces', spaceId, 'requests', person.uid));
  await b.commit();
}
async function leave(person, spaceId, remaining) {
  await updateDoc(doc(person.db, 'spaces', spaceId), { memberIds: remaining, [`members.${person.uid}`]: deleteField(), [`formerMembers.${person.uid}`]: { name: person.name }, updatedAt: serverTimestamp() });
}

console.log('Menyiapkan 7 akun di emulator…');
const [A, B, C, D, E, F] = await Promise.all(['ana', 'budi', 'cici', 'dodi', 'eka', 'fani'].map(n => makeUser(n)));
const G = await makeUser('gita', false);
const S = `space-${run}`, sref = who => doc(who.db, 'spaces', S), tx = (who, id) => doc(who.db, 'spaces', S, 'transactions', id);

console.log('\nMembuat ruang');
await expect('akun tanpa kode akses membuat ruang', false, () => setDoc(doc(G.db, 'spaces', `g-${run}`), { name: 'X', createdBy: G.uid, memberIds: [G.uid], members: { [G.uid]: { name: 'gita' } } }));
await expect('membuat ruang atas nama orang lain', false, () => setDoc(doc(B.db, 'spaces', `b-${run}`), { name: 'X', createdBy: A.uid, memberIds: [A.uid], members: { [A.uid]: { name: 'ana' } } }));
await expect('membuat ruang dengan anggota lain sekaligus', false, () => setDoc(doc(A.db, 'spaces', `a2-${run}`), { name: 'X', createdBy: A.uid, memberIds: [A.uid, B.uid], members: { [A.uid]: { name: 'ana' }, [B.uid]: { name: 'budi' } } }));
await expect('Ana membuat ruang Rumah', true, () => setDoc(sref(A), { name: 'Rumah', emoji: '🏠', createdBy: A.uid, memberIds: [A.uid], members: { [A.uid]: { name: 'ana' } }, salaryCycleStartDay: 25, createdAt: serverTimestamp() }));
await expect('Ana mencatat transaksi di ruang', true, () => setDoc(tx(A, 't1'), { type: 'expense', amount: 150000, date: '2026-11-08', walletId: 'w1', createdBy: A.uid, updatedBy: A.uid }));
await expect('Ana mencatat di Pribadi-nya', true, () => setDoc(doc(A.db, 'users', A.uid, 'transactions', 'p1'), { type: 'income', amount: 9000000, date: '2026-11-01', walletId: 'w9' }));

console.log('\nBukan anggota');
await expect('Budi membaca ruang Ana', false, () => getDoc(sref(B)));
await expect('Budi membaca transaksi ruang', false, () => getDocs(collection(B.db, 'spaces', S, 'transactions')));
await expect('Budi menulis transaksi ke ruang', false, () => setDoc(tx(B, 'x'), { type: 'expense', amount: 1 }));
await expect('Budi menambahkan dirinya sebagai anggota', false, () => updateDoc(sref(B), { memberIds: arrayUnion(B.uid), [`members.${B.uid}`]: { name: 'budi' } }));
await expect('Budi minta gabung tanpa kode', false, () => setDoc(doc(B.db, 'spaces', S, 'requests', B.uid), { name: 'budi', email: B.email, code: 'NGASAL1234', at: serverTimestamp() }));
await expect('Budi melihat daftar semua ruang', false, () => getDocs(collection(B.db, 'spaces')));

console.log('\nUndangan');
await expect('undangan berlaku lebih dari sehari', false, () => setDoc(doc(A.db, 'spaceInvites', code()), { spaceId: S, spaceName: 'Rumah', inviterName: 'ana', createdBy: A.uid, expiresAt: inHours(48), at: serverTimestamp() }));
await expect('bukan anggota membuat undangan ruang Ana', false, () => setDoc(doc(B.db, 'spaceInvites', code()), { spaceId: S, spaceName: 'Rumah', inviterName: 'budi', createdBy: B.uid, expiresAt: inHours(24), at: serverTimestamp() }));
let c1 = ''; await expect('Ana membuat kode undangan', true, async () => { c1 = await invite(A, S); });
await expect('Budi membaca kode undangan', true, () => getDoc(doc(B.db, 'spaceInvites', c1)));
await expect('daftar semua kode undangan', false, () => getDocs(collection(B.db, 'spaceInvites')));
await expect('Budi memakai kode (minta gabung)', true, () => ask(B, S, c1));
await expect('Cici memakai kode yang sudah dipakai', false, () => ask(C, S, c1));
await expect('Budi membaca ruang sebelum dikonfirmasi', false, () => getDoc(sref(B)));
await expect('Budi menyetujui dirinya sendiri', false, () => approve(B, S, B));
await expect('Ana melihat permintaan gabung', true, () => getDocs(collection(A.db, 'spaces', S, 'requests')));
await expect('Ana menambahkan Cici yang tidak minta gabung', false, () => updateDoc(sref(A), { memberIds: arrayUnion(C.uid), [`members.${C.uid}`]: { name: 'cici' } }));
await expect('Ana menerima Budi', true, () => approve(A, S, B));

console.log('\nSudah anggota');
await expect('Budi membaca ruang', true, () => getDoc(sref(B)));
await expect('Budi membaca transaksi ruang', true, () => getDocs(collection(B.db, 'spaces', S, 'transactions')));
await expect('Budi mencatat transaksi ruang', true, () => setDoc(tx(B, 't2'), { type: 'expense', amount: 50000, date: '2026-11-08', walletId: 'w1', createdBy: B.uid, updatedBy: B.uid }));
await expect('Budi mengubah catatan Ana (anggota setara)', true, () => updateDoc(tx(B, 't1'), { amount: 160000, updatedBy: B.uid }));
await expect('Budi melihat daftar ruangnya', true, () => getDocs(query(collection(B.db, 'spaces'), where('memberIds', 'array-contains', B.uid))));
await expect('Budi membaca Pribadi Ana', false, () => getDocs(collection(B.db, 'users', A.uid, 'transactions')));
await expect('Budi membaca profil Pribadi Ana', false, () => getDoc(doc(B.db, 'users', A.uid)));
await expect('Budi menulis ke Pribadi Ana', false, () => setDoc(doc(B.db, 'users', A.uid, 'transactions', 'x'), { type: 'income', amount: 1, date: '2026-11-08', walletId: 'w9' }));
await expect('Budi mengganti nama ruang', true, () => updateDoc(sref(B), { name: 'Rumah Kita', updatedAt: serverTimestamp() }));
await expect('Budi mengganti pembuat ruang', false, () => updateDoc(sref(B), { createdBy: B.uid }));
await expect('Budi mengeluarkan Ana', false, () => updateDoc(sref(B), { memberIds: [B.uid], [`members.${A.uid}`]: deleteField() }));
await expect('Riwayat atas nama sendiri', true, () => setDoc(doc(B.db, 'spaces', S, 'activity', 'a1'), { by: B.uid, at: serverTimestamp(), kind: 'add', txId: 't2' }));
await expect('Riwayat atas nama orang lain', false, () => setDoc(doc(B.db, 'spaces', S, 'activity', 'a2'), { by: A.uid, at: serverTimestamp(), kind: 'add' }));
await expect('mengubah isi Riwayat', false, () => updateDoc(doc(A.db, 'spaces', S, 'activity', 'a1'), { kind: 'delete' }));
await expect('menandai Riwayat dikembalikan', true, () => updateDoc(doc(A.db, 'spaces', S, 'activity', 'a1'), { restoredBy: A.uid, restoredAt: serverTimestamp() }));
await expect('bukan anggota membaca Riwayat', false, () => getDocs(collection(C.db, 'spaces', S, 'activity')));

console.log('\nChat grup');
const msg = (who, id) => doc(who.db, 'spaces', S, 'messages', id);
await expect('Budi kirim pesan', true, () => setDoc(msg(B, 'm1'), { by: B.uid, byName: 'budi', at: serverTimestamp(), kind: 'text', text: 'Belanja dapur udah ya' }));
await expect('Ana membaca chat grup', true, () => getDocs(collection(A.db, 'spaces', S, 'messages')));
await expect('bukan anggota membaca chat grup', false, () => getDocs(collection(C.db, 'spaces', S, 'messages')));
await expect('bukan anggota kirim pesan', false, () => setDoc(msg(C, 'x1'), { by: C.uid, byName: 'cici', at: serverTimestamp(), kind: 'text', text: 'halo' }));
await expect('kirim pesan atas nama orang lain', false, () => setDoc(msg(B, 'm2'), { by: A.uid, byName: 'ana', at: serverTimestamp(), kind: 'text', text: 'palsu' }));
await expect('pesan jenis tak dikenal', false, () => setDoc(msg(B, 'm3'), { by: B.uid, byName: 'budi', at: serverTimestamp(), kind: 'image', text: '' }));
await expect('pesan terlalu panjang', false, () => setDoc(msg(B, 'm4'), { by: B.uid, byName: 'budi', at: serverTimestamp(), kind: 'text', text: 'x'.repeat(2001) }));
await expect('mengubah pesan', false, () => updateDoc(msg(B, 'm1'), { text: 'diubah' }));
await expect('Ana menghapus pesan Budi', false, () => deleteDoc(msg(A, 'm1')));
await expect('Budi menghapus pesannya sendiri', true, () => deleteDoc(msg(B, 'm1')));
await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/spaces/${S}/messages/old1`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ fields: { by: { stringValue: A.uid }, byName: { stringValue: 'ana' }, at: { timestampValue: '2026-01-01T00:00:00Z' }, kind: { stringValue: 'text' }, text: { stringValue: 'lama' } } }) });
await expect('Budi menghapus pesan Ana yang sudah lewat 90 hari', true, () => deleteDoc(msg(B, 'old1')));
await expect('Ana kirim kartu transaksi', true, () => setDoc(msg(A, 'm5'), { by: A.uid, byName: 'ana', at: serverTimestamp(), kind: 'tx', text: '', tx: { id: 't1', title: 'Belanja', amount: 160000, type: 'expense', date: '2026-11-08' } }));
await expect('Budi kirim pesan lagi', true, () => setDoc(msg(B, 'm6'), { by: B.uid, byName: 'budi', at: serverTimestamp(), kind: 'text', text: 'oke' }));

console.log('\nMaksimal 5 anggota');
for (const p of [C, D, E]) { const c = await invite(A, S); await ask(p, S, c); await approve(B, S, p); }
await expect('ruang berisi 5 anggota', true, async () => { const snap = await getDoc(sref(A)); if (snap.data().memberIds.length !== 5) throw Error(`${snap.data().memberIds.length} anggota`); });
let c6 = ''; await expect('membuat undangan saat penuh (boleh, tapi tak bisa dipakai)', true, async () => { c6 = await invite(A, S); });
await expect('orang ke-6 minta gabung', false, () => ask(F, S, c6));

console.log('\nKadaluwarsa');
const expired = code();
await setDoc(doc(A.db, 'spaceInvites', expired), { spaceId: S, spaceName: 'Rumah', inviterName: 'ana', createdBy: A.uid, expiresAt: inHours(-1), at: serverTimestamp() });
await leave(E, S, [A.uid, B.uid, C.uid, D.uid]);
await expect('memakai kode yang sudah hangus', false, () => ask(F, S, expired));

console.log('\nKeluar & hapus');
await expect('Eka (sudah keluar) membaca ruang', false, () => getDoc(sref(E)));
await expect('Eka (sudah keluar) membaca transaksi', false, () => getDocs(collection(E.db, 'spaces', S, 'transactions')));
await expect('Ana menghapus ruang saat masih ada anggota lain', false, () => deleteDoc(sref(A)));
await expect('Dodi keluar', true, () => leave(D, S, [A.uid, B.uid, C.uid]));
await expect('Cici keluar', true, () => leave(C, S, [A.uid, B.uid]));
await expect('Budi keluar', true, () => leave(B, S, [A.uid]));
await expect('Ana (anggota terakhir) keluar tanpa menghapus', false, () => updateDoc(sref(A), { memberIds: [], members: {} }));
await expect('Ana (anggota terakhir) menghapus pesan Budi', true, () => deleteDoc(msg(A, 'm6')));
await expect('Ana menghapus isi ruang', true, async () => { for (const id of ['t1', 't2']) await deleteDoc(tx(A, id)); await deleteDoc(doc(A.db, 'spaces', S, 'activity', 'a1')); await deleteDoc(doc(A.db, 'spaces', S, 'messages', 'm5')); });
await expect('Ana (anggota terakhir) menghapus ruang', true, () => deleteDoc(sref(A)));

console.log(`\n${passed} sesuai, ${failed} tidak sesuai`);
process.exit(failed ? 1 : 0);
