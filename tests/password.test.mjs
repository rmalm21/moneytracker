import test from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, passwordChecks, passwordReady, passwordScore, strengthLabels } from '../lib/password.ts';

test('password strength grows with length and variety, obvious passwords stay weak', () => {
  assert.equal(passwordScore(''), 0);
  for (const weak of ['abc', 'password', 'password1', '12345678', '1234567890123', 'aaaaaaaaaa', 'Qwerty12']) assert.equal(passwordScore(weak), 1, weak);
  assert.equal(passwordScore('rama2024'), 2);
  assert.equal(passwordScore('Rama2024'), 3);
  assert.equal(passwordScore('Rama2024!xyz'), 4);
  assert.equal(passwordScore('correcthorsebattery'), 2);
  assert.equal(strengthLabels[passwordScore('Rama2024')], 'Kuat');
});

test('checklist and the rule for saving a new password', () => {
  const checks = passwordChecks('Rama2024', 'Rama2024');
  assert.deepEqual(checks.map(c => c.ok), [true, true, true, false]);
  assert.equal(checks.at(-1).label, 'Beda dari password lama');
  assert.equal(passwordChecks('rama').length, 3);
  assert.equal(passwordReady('rama2024', 'rama2024'), true);
  assert.equal(passwordReady('rama2024', 'rama2025'), false);
  assert.equal(passwordReady('rama202', 'rama202'), false);
  assert.equal(passwordReady('rama2024', 'rama2024', 'rama2024'), false);
  assert.equal(passwordReady('rama2025', 'rama2025', 'rama2024'), true);
});

test('email masking keeps the start and the domain', () => {
  assert.equal(maskEmail('rama@gmail.com'), 'ra••@gmail.com');
  assert.equal(maskEmail('ramaalmahi1001@gmail.com'), 'ra••••••@gmail.com');
  assert.equal(maskEmail('a@x.id'), 'a••@x.id');
  assert.equal(maskEmail('no-at-sign'), 'no-at-sign');
});
