import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickPlanV3 } from '../lib/catat/v3.ts';
import { ctx, C } from '../bench/quick/fixtures-v68state.mjs';

// Catat otomatis 6.8 — everyday language on the real default taxonomy (bench/quick/fixtures-v68state.mjs).
const read = async text => { const a = (await parseQuickPlanV3(text, ctx)).actions[0]; const p = a.result.preset; return { amount: a.result.amount, description: p.description || '', merchant: p.merchant || '', cat: p.subcategoryId || p.categoryId || '', wallet: p.walletId || '' }; };

test('a place after the amount needs no "di"; the category word and the default wallet stay where they belong', async () => {
  assert.deepEqual(await read('soyjoy jajan 25k bedeng'), { amount: 25000, description: 'Soyjoy', merchant: 'Bedeng', cat: C('Jajan'), wallet: '' });
  assert.equal((await read('bakso 15rb pak kumis')).merchant, 'Pak Kumis');
  assert.equal((await read('es teh 5rb kantin')).merchant, 'Kantin');
  assert.equal((await read('soyjoy jajan 25k bedeng gopay')).wallet, 'gopay');
});

test('words after the amount that are not a place stay out of the merchant', async () => {
  for (const text of ['bensin 30rb pertalite', 'parkir 2rb motor', 'nasi padang 25rb 2 bungkus', 'soyjoy 25k qris', 'jajan 15rb doang', 'soyjoy 25k jajan', '3 kopi 18k satu', 'makan 20k mand']) assert.equal((await read(text)).merchant, '', text);
});

test('a meal time is the category and the food is the description', async () => {
  for (const [text, cat] of [['nasi padang buat makan malam 25rb', 'Makan Malam'], ['nasi padang buat sarapan 20rb', 'Sarapan'], ['nasi padang sarapan 20rb', 'Sarapan'], ['sarapan nasi padang 20rb', 'Sarapan'], ['beli nasi padang buat makan malam 25rb', 'Makan Malam'], ['nasi padang 25rb buat makan siang', 'Makan Siang']]) {
    const r = await read(text);
    assert.equal(r.description, 'Nasi Padang', text); assert.equal(r.cat, C(cat), text);
  }
  assert.equal((await read('lunch mie ayam 15rb')).description, 'Mie Ayam');
  assert.equal((await read('makan malam 30rb')).description, 'Makan Malam');
  assert.equal((await read('makan siang di warteg 15rb')).description, 'Makan Siang');
  assert.match((await read('dinner w/ fam 250k')).description, /^Dinner/);
});

test('snacks and drinks are known by their names', async () => {
  for (const text of ['beli soyjoy 12rb di indomaret', 'oreo 9rb alfamart', 'silverqueen 18rb', 'beng beng 3rb', 'martabak 35rb']) assert.equal((await read(text)).cat, C('Jajan'), text);
  for (const text of ['aqua 4rb', 'teh pucuk 4rb', 'yakult 10rb']) assert.equal((await read(text)).cat, C('Kopi & Minuman'), text);
});
