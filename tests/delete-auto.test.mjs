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
  assert.match(store, /export async function checkDeletedTransactions[\s\S]*if\(snap\.exists\(\)\)forgetTxDeleted/);
  assert.match(store, /importData[^{]*\{const \{data\}=validateBackup\(backup\);forgetTxDeleted\(\);/);
  assert.match(store, /noteDeleted\(uid:string,items[^)]*\)\{markTxDeleted\(items\.transactions\|\|\[\]\)/);
});
