import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyForSpending, dailyLine, perDayAmount } from '../lib/budget-daily.ts';
import { budgetCurrent, budgetSpent } from '../lib/accounting.ts';
import { dailyOnSaved } from '../lib/chat/engine.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/chat/store.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 10.1 "Hari ini sisa segini" after a spending is saved, from the budget it counts toward; nothing forced where a
// per-day figure would not mean anything.
const data = v3Ctx.data, today = new Date(`${v3Ctx.today}T12:00:00`), salaryDay = v3Ctx.salaryDay;
const makan = data.budgets.find(b => b.name === 'Makan & Minum');
const KOPI = { categoryId: 'expense.makan-minum', subcategoryId: 'expense.makan-minum.kopi-minuman' };
// Today with nothing spent in Makan & Minum yet, so today's share is plain to see.
const quiet = { ...data, transactions: data.transactions.filter(t => !(t.date === v3Ctx.today && t.categoryId === 'expense.makan-minum')) };

test('10.1 jatah hari ini: dari sisa anggaran saat hari dimulai dibagi sisa hari; sisa hari ini = jatah − yang kepake hari ini', () => {
  const status = budgetCurrent(makan, quiet.transactions, quiet.categories, today, salaryDay);
  const [d] = dailyForSpending(quiet, [{ ...KOPI, amount: 25000 }], today, salaryDay);
  assert.equal(d.name, 'Makan & Minum'); assert.equal(d.state, 'today');
  assert.equal(d.days, status.daysRemaining);
  assert.equal(d.perDay, perDayAmount(status.remaining / d.days));
  assert.equal(d.spentToday, 25000);
  assert.equal(d.todayLeft, Math.floor((d.perDay - 25000) / 100) * 100);
  assert.equal(d.left, status.remaining - 25000);
  assert.match(dailyLine(d), /^Jatah Makan & Minum hari ini ±Rp[\d.]+, terpakai Rp25\.000 → sisa hari ini Rp[\d.]+\.$/);
  // What today already took in the ledger counts toward today, and is not counted twice once the new record is in.
  const spentData = budgetSpent(makan, data.transactions.filter(t => t.date === v3Ctx.today), data.categories);
  const [busy] = dailyForSpending(data, [{ ...KOPI, amount: 10000 }], today, salaryDay);
  assert.equal(busy.spentToday, spentData + 10000);
  const [saved] = dailyForSpending(data, [{ ...KOPI, amount: 10000 }], today, salaryDay, false);
  assert.equal(saved.spentToday, spentData);
  assert.equal(perDayAmount(43166.7), 43100);
});

test('10.1 dirasionalkan: lewat jatah hari ini → jatah mulai besok; tinggal dikit → cukup berapa kali lagi; habis → rem', () => {
  // Past today's share, still plenty for the rest: how much past, and the share from tomorrow on.
  const [past] = dailyForSpending(quiet, [{ ...KOPI, amount: 60000 }], today, salaryDay);
  assert.equal(past.state, 'overToday');
  assert.ok(past.tomorrow > 0 && past.tomorrow < past.perDay);
  assert.equal(past.tomorrow, perDayAmount(past.left / (past.days - 1)));
  assert.match(dailyLine(past), /lewat Rp[\d.]+ dari jatah ±Rp[\d.]+\. Mulai besok jatahnya ±Rp[\d.]+\/hari\.$/);
  // Transportasi after a big isi bensin: a few thousand a day means nothing, so how many more times instead.
  const [tight] = dailyForSpending(data, [{ categoryId: 'expense.transportasi', amount: 50000 }], today, salaryDay);
  assert.equal(tight.state, 'tight'); assert.ok(tight.typical > 0);
  assert.equal(tight.times, Math.floor(tight.left / tight.typical));
  assert.ok(tight.even < tight.typical * 0.5);
  assert.match(dailyLine(tight), /tinggal Rp[\d.]+ untuk \d+ hari, kira-kira cukup \d+× lagi/);
  // Nearly gone: not even once more.
  const [none] = dailyForSpending(data, [{ categoryId: 'expense.transportasi', amount: tight.left + 50000 - 1000 }], today, salaryDay);
  assert.equal(none.state, 'tight'); assert.equal(none.times, 0);
  assert.match(dailyLine(none), /sudah tidak cukup untuk sekali lagi.*Rem dulu, atau naikkan batasnya/);
  // Over the limit.
  const [over] = dailyForSpending(data, [{ categoryId: 'expense.transportasi', amount: 5_000_000 }], today, salaryDay);
  assert.equal(over.state, 'over'); assert.ok(over.over > 0);
  assert.match(dailyLine(over), /sudah lewat Rp[\d.]+\. Rem dulu \d+ hari ke depan/);
  // A few hundred rupiah left of today's share is "pas", not "sisa Rp100".
  const [base] = dailyForSpending(quiet, [{ ...KOPI, amount: 1 }], today, salaryDay);
  const [pas] = dailyForSpending(quiet, [{ ...KOPI, amount: base.perDay - 500 }], today, salaryDay);
  assert.equal(pas.state, 'today'); assert.equal(pas.todayLeft, 0);
  assert.match(dailyLine(pas), /sudah pas terpakai/);
});

test('10.1 tanpa anggaran diam; catatan di luar periode tidak dihitung', () => {
  assert.deepEqual(dailyForSpending(data, [{ categoryId: 'expense.kesehatan', amount: 50000 }], today, salaryDay), []);
  assert.deepEqual(dailyForSpending(data, [{ ...KOPI, amount: 25000, date: '2026-08-01' }], today, salaryDay), []);
});

test('10.1 chat: setelah Simpan "hari ini sisa segini", ikut gaya bahasa, bisa dimatikan', () => {
  const ctx = { ...v3Ctx, data: quiet };
  assert.match(dailyOnSaved('kopi 25rb', { ...ctx, voice: 'santai' }), /^Jatah Makan & Minum hari ini ±Rp[\d.]+, udah kepake Rp25\.000, jadi hari ini sisa Rp[\d.]+ ya\.$/);
  assert.match(dailyOnSaved('kopi 25rb', { ...ctx, voice: 'gaul' }), /Jatah Makan & Minum lo hari ini/);
  assert.match(dailyOnSaved('kopi 25rb', { ...ctx, voice: 'singkat' }), /^Makan & Minum: sisa hari ini Rp[\d.]+ \(jatah ±Rp[\d.]+\)\.$/);
  assert.match(dailyOnSaved('kopi 60rb', { ...ctx, voice: 'santai' }), /lewat Rp[\d.]+ dari jatah harian.*mulai besok jatahnya jadi ±Rp[\d.]+\/hari/);
  assert.match(dailyOnSaved('bensin 50rb', { ...v3Ctx, voice: 'santai' }), /tinggal Rp[\d.]+ buat \d+ hari\. Kalau dibagi rata cuma ±Rp[\d.]+\/hari, jadi nggak usah dipaksa harian: sisa ini kira-kira cukup \d+× lagi/);
  assert.match(dailyOnSaved('bensin 2jt', { ...v3Ctx, voice: 'santai' }), /udah lewat Rp[\d.]+\. Mending rem dulu/);
  assert.match(dailyOnSaved('kopi 20rb, bensin 30rb', { ...ctx, voice: 'santai' }), /Makan & Minum.*Transportasi/);
  assert.equal(dailyOnSaved('gaji masuk 5jt', v3Ctx), null);
  assert.equal(dailyOnSaved('servis laptop 150rb', v3Ctx), null);
  assert.equal(dailyOnSaved('kopi 25rb', ctx, { daily: false }), null);
});

test('10.1 saklar "Tampilkan jatah per hari": nyala bawaan, tersimpan di HP', () => {
  const box = new Map(); globalThis.localStorage = { getItem: k => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: k => box.delete(k) };
  try {
    assert.equal(DEFAULT_SETTINGS.daily, true);
    assert.equal(loadSettings('u1').daily, true);
    saveSettings('u1', { ...DEFAULT_SETTINGS, daily: false });
    assert.equal(loadSettings('u1').daily, false);
    box.set('dompet-ajaib:chat:settings:u2', JSON.stringify({ voice: 'gaul' }));
    assert.equal(loadSettings('u2').daily, true);
  } finally { delete globalThis.localStorage; }
});
