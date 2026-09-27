import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = readFileSync(new URL('../lib/firestore.ts', import.meta.url), 'utf8');
const remove = store.slice(store.indexOf('export async function deleteTransaction'), store.indexOf('export async function createClaim'));

test('deleting an automatic recurring entry skips it instead of recording it again', () => {
  // "pending" + mode auto is posted again at once by postAutoDrafts; a deleted automatic entry must become "dismissed".
  assert.match(remove, /mode==='auto'\?'dismissed':'pending'/);
  assert.ok(!/drafts',old\.draftId\),\{status:'pending'/.test(remove), 'never unconditionally back to pending');
  const auto = store.slice(store.indexOf('export async function postAutoDrafts'));
  assert.match(auto, /d\.status==='pending'&&d\.mode==='auto'/, 'only pending automatic entries are posted');
});

test('a deleted document is dropped from the device copy, and a deleted row is only shown again if the delete failed', () => {
  assert.match(store, /async function dropFromDevice[\s\S]*getDocFromServer/);
  assert.match(store, /export async function noteDeleted\(uid:string,items[^)]*\)\{markTxDeleted\(items\.transactions\|\|\[\]\);await dropFromDevice\(uid,items\)/);
  const undo = readFileSync(new URL('../components/undo-delete.tsx', import.meta.url), 'utf8');
  // A delete whose follow-up (the cycle report) failed is still a delete: the row stays hidden.
  assert.match(undo, /if \(!\(error as \{ committed\?: boolean \}\)\.committed\) show\(id, false\)/);
  assert.ok(!/after: \(\) => show\(id, false\)/.test(undo));
});

test('transactions this device deleted never come back from a stale device copy', async () => {
  const t = readFileSync(new URL('../lib/tombstones.ts', import.meta.url), 'utf8');
  assert.match(t, /export function withoutDeleted/);
  // Every way the screens read transactions skips them.
  assert.match(store, /onPart\('transactions',withoutDeleted\(/);
  assert.equal((store.match(/withoutDeleted\(snapshot\.docs/g) || []).length, 2, 'period and related lists');
  assert.equal((store.match(/withoutDeleted\(result\)|return withoutDeleted\(\(await getDocsFromCache/g) || []).length, 2, 'full history, cache and server');
  // Checked with the server on opening; a restore clears them.
  // On opening (and back online): the device's queue is sent first, then what the server still holds is deleted again;
  // only a refusal (not a missing connection) shows it again.
  const check = store.slice(store.indexOf('export async function checkDeletedTransactions'));
  assert.match(check, /waitForPendingWrites\(database\(\)\)/);
  assert.match(check, /if\(!snap\.exists\(\)\)continue;\s*await deleteTransaction\(uid,id\);/);
  assert.match(check, /offline\|network\|unavailable[\s\S]*continue;forgetTxDeleted\(\[id\]\)/);
  const t2 = readFileSync(new URL('../lib/tombstones.ts', import.meta.url), 'utf8');
  assert.match(t2, /const left = readPending\(\);/, 'a delete cut short by closing the app is finished next time');
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /markDeletePending\(tx\.id\);undo\.remove/);
  assert.match(page, /\(\)=>clearDeletePending\(tx\.id\)\)\}/, 'Batalkan clears it');
  assert.match(store, /importData[^{]*\{const \{data\}=validateBackup\(backup\);forgetTxDeleted\(\);/);
  assert.match(store, /noteDeleted\(uid:string,items[^)]*\)\{markTxDeleted\(items\.transactions\|\|\[\]\)/);
});

test('a plain transaction is deleted with a queued batch (works offline and survives closing the app)', () => {
  const del = store.slice(store.indexOf('export async function deleteTransaction'), store.indexOf('export async function createClaim'));
  assert.match(del, /const batch=writeBatch\(database\(\)\)/);
  assert.match(del, /batch\.delete\(r\)/);
  assert.match(del, /increment\(-delta\)/);
  assert.match(del, /catch\(error\)\{forgetTxDeleted\(\[id\]\);throw error;\}/, 'a refused delete shows the transaction again');
  assert.match(del, /!relation\(plain,-1\)&&!plain\.draftId&&!plain\.plannedId/, 'linked ones keep the checked server transaction');
});
