import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAmount, maskAmounts } from '../lib/privacy.ts';

test('every amount format is hidden, the sign and the words around it stay', () => {
  assert.equal(maskAmounts('Rp12.000'), 'Rp•••••');
  assert.equal(maskAmounts('-Rp1.208.000'), '-Rp•••••');
  assert.equal(maskAmounts('Sisa Rp400.000 sampai 24 Okt'), 'Sisa Rp••••• sampai 24 Okt');
  assert.equal(maskAmounts('Rp1,3 jt direncanakan'), 'Rp••••• direncanakan');
  assert.equal(maskAmounts('±Rp33 rb/hari'), '±Rp•••••/hari');
  assert.equal(maskAmounts('Naik +Rp4.800.000/bulan'), 'Naik +Rp•••••/bulan');
  assert.equal(maskAmounts('Rp2,5 M'), 'Rp•••••');
  assert.equal(maskAmounts('Masuk Rp0 · Keluar Rp85.000'), 'Masuk Rp••••• · Keluar Rp•••••');
});
test('a word after an amount is not swallowed, other numbers are left alone', () => {
  assert.equal(maskAmounts('Rp12.000 Makan malam'), 'Rp••••• Makan malam');
  assert.equal(maskAmounts('Rp50.000 Transfer'), 'Rp••••• Transfer');
  for (const text of ['Hari ke-2 dari 30', '70% terpakai', '25 Sep 2026 – 24 Okt 2026', '9 transaksi', 'Rp']) { assert.equal(hasAmount(text), false); assert.equal(maskAmounts(text), text); }
});
