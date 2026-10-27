import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanCode, showCode } from '../lib/access.ts';

// 6.1 Kode akses: how a typed code is read and shown. The rules themselves are tested against the emulator.
test('a code typed any way is read the same', () => {
  assert.equal(cleanCode('e9u-2ce-dux'), 'E9U2CEDUX');
  assert.equal(cleanCode(' E9U 2CE DUX '), 'E9U2CEDUX');
  assert.equal(showCode('E9U2CEDUX'), 'E9U-2CE-DUX');
  assert.equal(showCode('E9U2'), 'E9U-2');
});

test('the rules let an account use its data only with a grant or as the owner', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /function own\(userId\) \{ return request\.auth != null && request\.auth\.uid == userId && allowed\(\); \}/);
  assert.match(rules, /match \/appConfig\/\{docId\} \{\s*allow get: if request\.auth != null;\s*allow list, write: if false;/);
  // A grant is made only while the code is being used (it was unused before this very write).
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/accessCodes\/\$\(request\.resource\.data\.code\)\)\.data\.get\('usedBy', null\) == null/);
});
