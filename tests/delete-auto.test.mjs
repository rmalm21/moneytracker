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
  assert.match(store, /export async function noteDeleted\(uid:string,items[^)]*\)\{await dropFromDevice\(uid,items\)/);
  const undo = readFileSync(new URL('../components/undo-delete.tsx', import.meta.url), 'utf8');
  assert.match(undo, /task\.catch\(\(\) => show\(id, false\)\)/);
  assert.ok(!/after: \(\) => show\(id, false\)/.test(undo));
});
