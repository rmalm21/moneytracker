import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPin, hashPin, newPinSalt, validPin } from '../lib/pin.ts';

test('only four digits are accepted as a PIN', () => {
  assert.equal(validPin('2580'), true);
  for (const bad of ['258', '25801', 'abcd', '25 8', '']) assert.equal(validPin(bad), false);
});

test('PIN is stored as a salted hash and checked against it', async () => {
  const salt = newPinSalt(), other = newPinSalt();
  assert.notEqual(salt, other);
  const hash = await hashPin('2580', salt);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, '2580');
  assert.notEqual(hash, await hashPin('2580', other));
  assert.equal(await checkPin('2580', salt, hash), true);
  assert.equal(await checkPin('0852', salt, hash), false);
  assert.equal(await checkPin('25a0', salt, hash), false);
});
