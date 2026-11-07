import test from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, passwordChecks, passwordReady, passwordScore, strengthLabels } from '../lib/password.ts';

test('password strength grows with length and variety, obvious passwords stay weak', () => {
  assert.equal(passwordScore(''), 0);
  for (const weak of ['abc', 'password', 'password1', '12345678', '1234567890123', 'aaaaaaaaaa', 'Qwerty12']) assert.equal(passwordScore(weak), 1, weak);
  assert.equal(passwordScore('budi2024'), 2);
  assert.equal(passwordScore('Budi2024'), 3);
  assert.equal(passwordScore('Budi2024!xyz'), 4);
  assert.equal(passwordScore('correcthorsebattery'), 2);
  assert.equal(strengthLabels[passwordScore('Budi2024')], 'Kuat');
});

test('checklist and the rule for saving a new password', () => {
  const checks = passwordChecks('Budi2024', 'Budi2024');
  assert.deepEqual(checks.map(c => c.ok), [true, true, true, false]);
  assert.equal(checks.at(-1).label, 'Beda dari password lama');
  assert.equal(passwordChecks('budi').length, 3);
  assert.equal(passwordReady('budi2024', 'budi2024'), true);
  assert.equal(passwordReady('budi2024', 'budi2025'), false);
  assert.equal(passwordReady('budi202', 'budi202'), false);
  assert.equal(passwordReady('budi2024', 'budi2024', 'budi2024'), false);
  assert.equal(passwordReady('budi2025', 'budi2025', 'budi2024'), true);
});

test('email masking keeps the start and the domain', () => {
  assert.equal(maskEmail('budi@gmail.com'), 'bu••@gmail.com');
  assert.equal(maskEmail('budisantoso1001@gmail.com'), 'bu••••••@gmail.com');
  assert.equal(maskEmail('a@x.id'), 'a••@x.id');
  assert.equal(maskEmail('no-at-sign'), 'no-at-sign');
});
