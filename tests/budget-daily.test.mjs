import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyForSpending, dailyLine, perDayAmount } from '../lib/budget-daily.ts';
import { budgetCurrent } from '../lib/accounting.ts';
import { dailyOnSaved } from '../lib/chat/engine.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/chat/store.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 10.1 "Sehari seharusnya segini" after a spending is saved, from the budget it counts toward.
const data = v3Ctx.data, today = new Date(`${v3Ctx.today}T12:00:00`), salaryDay = v3Ctx.salaryDay;
const makan = data.budgets.find(b => b.name === 'Makan & Minum');

test('10.1 jatah per hari: sisa anggaran (dikurangi catatan baru) dibagi sisa hari, sama seperti menu Anggaran', () => {
  const status = budgetCurrent(makan, data.transactions, data.categories, today, salaryDay);
  const [d] = dailyForSpending(data, [{ categoryId: 'expense.makan-minum', subcategoryId: 'expense.makan-minum.kopi-minuman', amount: 25000 }], today, salaryDay);
  assert.equal(d.name, 'Makan & Minum');
  assert.equal(d.left, status.remaining - 25000);
  assert.equal(d.days, status.daysRemaining);
  assert.equal(Math.round(d.perDay), Math.round(d.left / d.days));
  // Already in the ledger: not counted twice.
  const [same] = dailyForSpending(data, [{ categoryId: 'expense.makan-minum', amount: 25000 }], today, salaryDay, false);
  assert.equal(same.left, status.remaining);
  assert.match(dailyLine(d), /^Anggaran Makan & Minum: sehari seharusnya ±Rp[\d.]+ \(sisa Rp[\d.]+, \d+ hari lagi\)\.$/);
  assert.equal(perDayAmount(43166.7), 43100);
});

test('10.1 jatah per hari: tanpa anggaran diam; catatan bulan lalu tidak dihitung; lewat batas dibilang', () => {
  assert.deepEqual(dailyForSpending(data, [{ categoryId: 'expense.kesehatan', amount: 50000 }], today, salaryDay), []);
  assert.deepEqual(dailyForSpending(data, [{ categoryId: 'expense.makan-minum', amount: 25000, date: '2026-08-01' }], today, salaryDay), []);
  const [over] = dailyForSpending(data, [{ categoryId: 'expense.transportasi', amount: 5_000_000 }], today, salaryDay);
  assert.ok(over.over > 0); assert.equal(over.perDay, 0); assert.match(dailyLine(over), /sudah lewat Rp[\d.]+/);
});

test('10.1 chat: setelah Simpan disebut jatah per harinya, ikut gaya bahasa, bisa dimatikan', () => {
  const santai = dailyOnSaved('kopi 25rb', { ...v3Ctx, voice: 'santai' });
  assert.match(santai, /^Anggaran Makan & Minum sisa Rp[\d.]+ buat \d+ hari lagi, jadi sehari seharusnya ±Rp[\d.]+\.$/);
  assert.match(dailyOnSaved('kopi 25rb', { ...v3Ctx, voice: 'gaul' }), /jatah lo ±Rp/);
  assert.match(dailyOnSaved('kopi 20rb, bensin 30rb', { ...v3Ctx, voice: 'singkat' }), /Makan & Minum: ±Rp[\d.]+\/hari.*Transportasi: ±Rp[\d.]+\/hari/);
  assert.equal(dailyOnSaved('gaji masuk 5jt', v3Ctx), null);
  assert.equal(dailyOnSaved('kopi 25rb', v3Ctx, { daily: false }), null);
});

test('10.1 saklar "Tampilkan jatah per hari": nyala bawaan, tersimpan di HP', () => {
  const box = new Map(); globalThis.localStorage = { getItem: k => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: k => box.delete(k) };
  try {
    assert.equal(DEFAULT_SETTINGS.daily, true);
    assert.equal(loadSettings('u1').daily, true);
    saveSettings('u1', { ...DEFAULT_SETTINGS, daily: false });
    assert.equal(loadSettings('u1').daily, false);
  } finally { delete globalThis.localStorage; }
});
