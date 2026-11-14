import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { readFix, resolveCategory } from '../lib/chat/followup.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
import { recentEntries } from '../lib/quick-entry.ts';
import { asli, bench, saveInto, categoryNames } from '../bench/v102/state.mjs';

/** A conversation on an account: "[simpan]" taps Simpan on the last card (the ledger changes as in the app). */
async function talk(acc, ...steps) {
  let memory = {}, last = null; const out = [];
  for (const s of steps) {
    if (s === '[simpan]') {
      acc = saveInto(acc, last.reply.text);
      memory = { ...memory, plan: { ...memory.plan, status: 'saved' }, saves: [...(memory.saves || []), last.reply.text].slice(-5) };
      continue;
    }
    last = await chatReply(s, memory, { ...acc, voice: 'santai' }); memory = last.memory; out.push(last);
  }
  return { out, acc, last };
}
const card = (acc, text) => parseQuickPlan(text, acc.quick).actions.map(a => a.result);

test('10.2: "35k nambah di mandiri" is money in, and "pemasukan" after it is the type, not a category', async () => {
  for (const acc of [bench, asli]) {
    const [r] = card(acc, '35k nambah di mandiri');
    assert.equal(r.kind, 'income'); assert.equal(r.amount, 35000); assert.equal(r.preset.walletId, 'mandiri');
    const { last } = await talk(acc, '35k nambah di mandiri', 'pemasukan');
    const [after] = card(acc, last.reply.text);
    assert.equal(after.kind, 'income'); assert.equal(after.amount, 35000);
    assert.notEqual(categoryNames(acc, after.preset.categoryId, after.preset.subcategoryId)[0], 'Pemasukan Lainnya');
    // An expense card turned into money in by the answer.
    const turned = await talk(acc, 'keluar 35k di mandiri', 'bukan, pemasukan');
    const [t] = card(acc, turned.last.reply.text);
    assert.equal(t.kind, 'income'); assert.equal(t.amount, 35000); assert.equal(t.preset.walletId, 'mandiri');
  }
});

test('10.2: "masuk ke makan malam" answers the category question, before and after Simpan', async () => {
  for (const acc of [bench, asli]) {
    const before = await talk(acc, 'keluar 45rb pake gopay', 'masuk ke makan malam');
    assert.equal(before.out[0].reply.kind, 'plan'); assert.match(before.out[0].reply.intro || '', /kategori apa/i);
    const [r] = card(acc, before.last.reply.text);
    assert.equal(r.kind, 'expense'); assert.equal(r.amount, 45000); assert.equal(r.preset.walletId, 'gopay');
    assert.deepEqual(categoryNames(acc, r.preset.categoryId, r.preset.subcategoryId), ['Makan Malam', 'Makan & Minum']);

    // Saved without a category: the answer becomes a change card for that same record.
    const after = await talk(acc, 'keluar 45rb pake gopay', '[simpan]', 'masuk ke makan malam');
    const [u] = card(after.acc, after.last.reply.text);
    assert.equal(u.kind, 'tx_update');
    const saved = after.acc.data.transactions.find(t => t.id === u.operation.target.id);
    assert.equal(saved.amount, 45000); assert.equal(saved.walletId, 'gopay');
    const change = u.operation.changes.find(c => c.field === 'category');
    assert.deepEqual(categoryNames(acc, change.categoryId, change.subcategoryId), ['Makan Malam', 'Makan & Minum']);
  }
});

test('10.2: corrections after Simpan change or remove the record just saved', async () => {
  const fix = await talk(asli, 'kopi 25rb', '[simpan]', 'eh salah, 28rb', '[simpan]');
  const kopi = fix.acc.data.transactions.filter(t => /kopi/i.test(t.description || '') && t.createdMs > Date.parse('2026-10-15T15:00:00+07:00'));
  assert.equal(kopi.length, 1); assert.equal(kopi[0].amount, 28000);
  const gone = await talk(asli, 'kopi 25rb', '[simpan]', 'hapus aja yang tadi', '[simpan]');
  assert.equal(gone.acc.data.transactions.length, asli.data.transactions.length);
});

test('10.2: fixes one after another after Simpan all land on the same record (a change card saved in between)', async () => {
  const r = await talk(asli, 'kopi 25rb pakai cash', '[simpan]', 'eh salah, 28rb', '[simpan]', 'kategorinya makan malem dong', '[simpan]', 'pake gopay', '[simpan]');
  const kopi = r.acc.data.transactions.find(t => String(t.id).startsWith('chat') && /kopi/i.test(t.description || ''));
  assert.equal(kopi.amount, 28000); assert.equal(kopi.walletId, 'gopay');
  assert.deepEqual(categoryNames(asli, kopi.categoryId, kopi.subcategoryId), ['Makan Malam', 'Makan & Minum']);
});

test('10.2: readFix reads a follow-up as fields and leaves questions and notes alone', () => {
  const q = asli.quick;
  assert.equal(readFix('masuk ke makan malam', q, { kind: 'expense' }).category.name, 'Makan Malam');
  assert.equal(readFix('kategorinya hiburan', q, { kind: 'expense' }).category.name, 'Nongkrong & Hiburan');
  assert.equal(readFix('eh itu pemasukan', q, { kind: 'expense' }).type, 'income');
  assert.equal(readFix('bukan keluar, masuk', q, { kind: 'expense' }).type, 'income');
  assert.equal(readFix('pake mandiri aja', q, { kind: 'expense' }).wallet.id, 'mandiri');
  assert.equal(readFix('jadi 28rb', q, { kind: 'expense' }).amount.value, 28000);
  assert.equal(readFix('kemarin', q, { kind: 'expense' }).date, 'kemarin');
  assert.equal(readFix('hapus aja', q, { kind: 'expense' }).remove, true);
  assert.equal(readFix('berapa sisa gopay?', q, { kind: 'expense' }), null);
  assert.equal(readFix('catatannya lembur', q, { kind: 'expense' }), null);
});

test('10.2: resolveCategory finds the category a phrase means, with ids as the app writes them', () => {
  const cats = asli.quick.categories, name = p => resolveCategory(p, cats, 'expense')?.name ?? null;
  assert.equal(name('makan malam'), 'Makan Malam');
  assert.equal(name('mkan malam'), 'Makan Malam');
  assert.equal(name('makan'), 'Makan & Minum');
  assert.equal(name('hiburan'), 'Nongkrong & Hiburan');
  assert.equal(name('transport'), 'Transportasi');
  assert.equal(name('gojek'), 'Ojek');
  assert.equal(resolveCategory('jualan', cats, 'expense')?.type, 'income');
  assert.equal(name('zzz'), null);
  assert.match(resolveCategory('makan malam', cats, 'expense').subcategoryId, /^tpl1_/);
});

test('10.2: Catat otomatis — pemasukan, "2 @18rb", short names, category changes on saved records', () => {
  assert.equal(card(asli, 'pemasukan 35k')[0].kind, 'income');
  assert.equal(card(asli, 'kopi 2 @18rb')[0].amount, 36000);
  assert.equal(card(asli, 'keluar 45rb pake gopay kategori makan malam')[0].preset.subcategoryId, 'tpl1_expense_makan_minum_makan_malam');
  const [u] = card(asli, 'ubah transaksi terakhir jadi kategori makan malam');
  assert.equal(u.kind, 'tx_update');
  assert.equal(u.operation.changes[0].field, 'category');
  assert.equal(u.operation.changes[0].subcategoryId, 'tpl1_expense_makan_minum_makan_malam');
});

test('10.2: recentEntries — last 14 days, newest first, an entry not yet on the server counts as just made', () => {
  const tx = (id, date, createdAt) => ({ id, type: 'expense', amount: 1000, date, time: '10:00', walletId: 'cash', categoryId: null, subcategoryId: null, merchant: '', description: id, createdAt });
  const list = recentEntries([tx('lama', '2026-09-01', { seconds: 1 }), tx('a', '2026-10-14', { toMillis: () => 5000 }), tx('baru', '2026-10-15', null)], '2026-10-15', 99_000);
  assert.deepEqual(list.map(t => t.id), ['baru', 'a']);
  assert.equal(list[0].createdMs, 99_000); assert.equal(list[1].createdMs, 5000);
});

test('10.2: the trained model — fixes, "what about …?", how-to and games with nothing before them; quiet on bare answers', async () => {
  const { classifyChat } = await import('../lib/chat/model.ts');
  const { v3Ctx } = await import('../bench/v83/state.mjs');
  const fresh = async t => chatReply(t, {}, { ...v3Ctx, voice: 'santai', classify: classifyChat });
  const fix = await fresh('eh bukan keluar, itu uang masuk');
  assert.equal(fix.intent, 'clarify'); assert.match(fix.reply.text, /Belum ada catatan/);
  const follow = await fresh('kalau bulan lalu?');
  assert.equal(follow.intent, 'clarify'); assert.ok(follow.reply.chips.some(c => /pengeluaran bulan lalu/.test(c)));
  assert.equal((await classifyChat('main yuk'))?.intent, 'game');
  assert.equal((await classifyChat('kamu ai?'))?.intent, 'about');
  assert.equal(await classifyChat('boleh'), null);
  assert.equal(await classifyChat('sama andi'), null);
  // A model guess alone is not enough for the newer intents: "berapa sebulan" is no game.
  const odd = await fresh('targetnya berapa?');
  assert.notEqual(odd.intent, 'game');
  // "iphone 16 bagus ga ya": no card for "16", the price is asked for.
  const phone = await fresh('iphone 16 bagus ga ya');
  assert.equal(phone.reply.kind, 'say'); assert.match(phone.reply.text, /Harganya berapa/);
});

test('10.2 post-hoc: amounts in words, "oke, simpan", why this category, a date after a category, lists with -ku, how-to pages', async () => {
  const words = await talk(asli, 'beli bakso', 'tiga puluh lima ribu');
  assert.equal(card(asli, words.last.reply.text)[0].amount, 35000);
  const save = await talk(asli, 'roti 12rb', 'oke, simpan');
  assert.equal(save.last.reply.kind, 'say'); assert.match(save.last.reply.text, /ketuk Simpan/);
  const why = await talk(asli, 'teh manis 8rb', 'kok kategorinya gitu?');
  assert.equal(why.last.intent, 'explain'); assert.match(why.last.reply.text, /Kategorinya/);
  const dated = await talk(asli, 'beli sesuatu 40rb', 'makan malam', 'tanggal 12');
  const [d] = card(asli, dated.last.reply.text);
  assert.equal(d.preset.date, '2026-10-12'); assert.equal(d.preset.subcategoryId, 'tpl1_expense_makan_minum_makan_malam');
  const after = await talk(asli, 'roti 12rb', '[simpan]', 'lupa kasih kategori, transportasi ya');
  assert.equal(card(after.acc, after.last.reply.text)[0].kind, 'tx_update');
  const owed = await talk(asli, 'daftar piutangku');
  assert.equal(owed.last.intent, 'module');
  const { readHowto } = await import('../lib/chat/howto.ts');
  assert.equal(readHowto('cara nyatet piutang', { tail: true })?.title, 'Piutang');
  assert.equal(readHowto('gimana ngapus transaksi', { tail: true })?.title, 'Mengubah atau menghapus transaksi');
  assert.equal(readHowto('cara catat utang', { tail: true })?.title, 'Mencatat utang dan membayar cicilan');
});
