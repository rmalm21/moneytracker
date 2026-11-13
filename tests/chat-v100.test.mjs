import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply, commentOnSaved } from '../lib/chat/engine.ts';
import { commentFor } from '../lib/chat/comment.ts';
import { understand } from '../lib/chat/understand.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/chat/store.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 10.0 Asisten chat 3.0: what the person wants to set up (asked in the chat, with a button to the form), a remark after a
// record is saved, advice from the person's own records, and the budget a subcategory is counted in.
const talk = async (messages, voice = 'santai', ctx = v3Ctx) => { let memory = {}; const out = []; for (const m of messages) { const r = await chatReply(m, memory, { ...ctx, voice }); memory = r.memory; out.push(r); } return out; };
const said = r => r.reply.kind === 'say' ? [r.reply.title, r.reply.text, ...(r.reply.steps || [])].filter(Boolean).join(' ') : `${r.reply.intro || ''} «${r.reply.text}»`;
const facts = over => ({ kind: 'expense', amount: 25000, text: 'kopi 25rb', treatCount: 1, todayCount: 1, treatTotal: 25000, generous: false, free: 2_000_000, ...over });

test('10.0 tujuan ditulis beda-beda tetap jadi Anggaran baru: ditanya di chat, ada tombol ke formnya', async () => {
  for (const say of ['budgeting baru', 'bikin anggaran', 'mau set limit bulanan', 'new budget']) {
    const [r] = await talk([say]);
    assert.equal(r.intent, 'setup', say);
    assert.match(said(r), /\?/, say);
    assert.equal(r.reply.open?.view, 'budgets', say); assert.equal(r.reply.open?.target, 'new', say);
    assert.ok((r.reply.chips || []).length >= 2, say);
  }
  const [, amount, card] = await talk(['budgeting baru', 'jajan', '300rb']);
  assert.match(said(amount), /berapa/i);
  assert.equal(card.reply.kind, 'plan'); assert.equal(card.reply.text, 'anggaran jajan 300rb');
  const ins = v3Ctx.inspect(card.reply.text); assert.equal(ins.reading, 'record'); assert.equal(ins.kind, 'budget');
});

test('10.0 tujuan lengkap langsung jadi kartu; batal di tengah jalan', async () => {
  const [r] = await talk(['set limit jajan 500rb']);
  assert.equal(r.reply.kind, 'plan'); assert.equal(v3Ctx.inspect(r.reply.text).total, 500000);
  const [, cancel] = await talk(['budgeting baru', 'gak jadi deh']);
  assert.equal(cancel.intent, 'cancel');
  const [wallet] = await talk(['nambah rekening bca']);
  assert.equal(wallet.reply.open?.view === 'wallets' || wallet.reply.kind === 'plan', true);
});

test('10.0 komentar setelah simpan: sedekah dipuji, jajan kelima diingatkan, ikut gaya bahasa, bisa dimatikan', () => {
  assert.equal(commentFor(facts({ text: 'sedekah 50rb', generous: true, amount: 50000 }), 'santai', 1)?.tone, 'good');
  assert.equal(commentFor(facts({ treat: 'kopi', treatCount: 5, todayCount: 1 }), 'santai', 1)?.tone, 'warn');
  assert.equal(commentFor(facts({ treat: 'kopi', treatCount: 1, todayCount: 1 }), 'santai', 1), null);
  const barbar = commentFor(facts({ treat: 'kopi', treatCount: 6, todayCount: 1 }), 'barbar', 1);
  assert.match(barbar.text, /\b(?:lo|lu|gue|gw)\b/i);
  // A budget is mentioned only when this record takes it over the limit, not on every record after.
  assert.equal(commentFor(facts({ text: 'bensin 50rb', amount: 50000, budget: { name: 'Transportasi', spent: 820000, before: 770000, limit: 800000, warnAt: 0.8 } }), 'santai', 1)?.tone, 'warn');
  assert.equal(commentFor(facts({ text: 'bensin 50rb', amount: 50000, budget: { name: 'Transportasi', spent: 900000, before: 850000, limit: 800000, warnAt: 0.8 } }), 'santai', 1), null);
  const ctx = { ...v3Ctx, voice: 'santai' };
  assert.equal(commentOnSaved('sedekah 50rb pakai cash', {}, ctx)?.reply.tone, 'good');
  assert.equal(commentOnSaved('sedekah 50rb pakai cash', {}, ctx, { comments: false }), null);
});

test('10.0 komentar: catatan yang sudah masuk ke data tidak dihitung dua kali', () => {
  const ctx = { ...v3Ctx, voice: 'santai' };
  const before = commentOnSaved('kopi 25rb', {}, ctx);
  const sub = ctx.inspect('kopi 25rb');
  const fresh = { id: 'baru', type: 'expense', amount: 25000, date: ctx.today, description: 'Kopi', merchant: '', walletId: 'w', destinationWalletId: null, categoryId: sub.categoryId || null, subcategoryId: sub.subcategoryId || null, createdAt: { toMillis: () => Date.now() } };
  const after = commentOnSaved('kopi 25rb', {}, { ...ctx, data: { ...ctx.data, transactions: [...ctx.data.transactions, fresh] } });
  assert.equal(after?.reply.text, before?.reply.text);
});

test('10.0 saran nyata dari catatan sendiri, dan fitur yang pas', async () => {
  const [left] = await talk(['uang tinggal 300rb sampai gajian']);
  assert.match(said(left), /Rp[\d.]+.*(?:sehari|per hari)|(?:sehari|per hari).*Rp[\d.]+/i);
  const [salary] = await talk(['gaji 5jt dibagi gimana']);
  assert.match(said(salary), /Rp2\.500\.000/);
  const [wasteful] = await talk(['aku boros banget ya']);
  assert.match(said(wasteful), /Rp[\d.]+/); assert.ok(wasteful.reply.chips?.includes('budgeting baru'));
  const [forget] = await talk(['aku sering lupa nyatet']);
  assert.equal(forget.reply.open?.view, 'settings'); assert.equal(forget.reply.open?.target, 'reminders');
});

test('10.0 "budget jajan aman ga?": anggaran induknya disebut, lalu bisa dibuatkan sendiri', async () => {
  const [r, yes] = await talk(['budget jajan aman ga', 'iya']);
  assert.match(said(r), /Makan & Minum/); assert.match(said(r), /Rp[\d.]+/);
  assert.equal(r.reply.chips?.[0], 'bikin anggaran jajan');
  assert.equal(yes.intent, 'setup'); assert.match(said(yes), /berapa/i);
});

test('10.0 bahasa: Inggris dan singkatan dibaca dulu', () => {
  assert.equal(understand('tlg cek budget makan msh aman gak'), 'sisa anggaran makan berapa');
  assert.match(understand('can i afford a 2 million phone'), /^aman nggak beli\b.*\b2jt\b/); assert.match(understand('can i afford a 2 million phone'), /\bhp\b/);
});

test('10.0 saklar komentar: nyala bawaan, tersimpan di HP ini', () => {
  const box = new Map(); globalThis.localStorage = { getItem: k => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: k => box.delete(k) };
  try {
    assert.equal(DEFAULT_SETTINGS.comments, true);
    assert.equal(loadSettings('u1').comments, true);
    saveSettings('u1', { ...DEFAULT_SETTINGS, comments: false });
    assert.equal(loadSettings('u1').comments, false);
    box.set('dompet-ajaib:chat:settings:u2', JSON.stringify({ voice: 'gaul' }));
    assert.equal(loadSettings('u2').comments, true);
  } finally { delete globalThis.localStorage; }
});

test('10.0 bahasa sehari-hari: singkatan, gaul, salah ketik, daerah', async () => {
  const [budget] = await talk(['bkin anggaran dong'], 'gaul');
  assert.equal(budget.intent, 'setup'); assert.equal(budget.reply.open?.view, 'budgets');
  const [typo] = await talk(['bikinin bajet makan 1,5jt dong'], 'gaul');
  assert.equal(typo.reply.kind, 'plan'); assert.equal(v3Ctx.inspect(typo.reply.text).kind, 'budget');
  const [, , card] = await talk(['bkin anggaran dong', 'jajan', '300rb aja'], 'gaul');
  assert.equal(card.reply.text, 'anggaran jajan 300rb');
  const [save] = await talk(['pngen ngumpulin duit buat beli motor']);
  assert.equal(save.intent, 'goal'); assert.match(said(save), /motor/i);
  const [schedule] = await talk(['bikinin jadwal bayar kos tiap tgl 5 1,2jt']);
  assert.equal(schedule.reply.kind, 'plan'); assert.equal(v3Ctx.inspect(schedule.reply.text).kind, 'recurring_new');
  assert.equal(understand('duit aye berape sekarang'), 'uang bebas berapa');
  assert.equal(understand('boleh jajan brp hari ini'), 'jatah harian berapa');
  assert.equal(understand('ganti jd 40rb'), 'ganti jadi 40rb');
  const [afford] = await talk(['beli sepatu 500rb aman kah']);
  assert.equal(afford.intent, 'afford');
  const [ack] = await talk(['mantap bro']);
  assert.equal(ack.intent, 'ack');
  const [mood] = await talk(['uang jajan gw udh abis']);
  assert.equal(mood.intent, 'mood');
});

test('10.0 alur selesai begitu kartunya disimpan; catatan baru tidak jadi jawaban alur', async () => {
  const ctx = { ...v3Ctx, voice: 'santai' };
  let memory = {};
  for (const say of ['bkin anggaran dong', 'jajan', '275rb aja']) memory = (await chatReply(say, memory, ctx)).memory;
  assert.equal(memory.plan.text, 'anggaran jajan 275rb');
  // Saved: the next record is a record of its own (found in the app: it used to become "anggaran jajan 20rb").
  const after = await chatReply('sedekah jumatan 20rb pakai cash', { ...memory, plan: { ...memory.plan, status: 'saved' } }, ctx);
  assert.equal(after.reply.kind, 'plan'); assert.equal(after.reply.text, 'sedekah jumatan 20rb pakai cash');
  // Still waiting: a whole new record is not the flow's answer either, but a new amount is.
  const other = await chatReply('sedekah jumatan 20rb pakai cash', memory, ctx);
  assert.equal(other.reply.text, 'sedekah jumatan 20rb pakai cash');
  const change = await chatReply('eh 300rb aja deh', memory, ctx);
  assert.equal(change.reply.text, 'anggaran jajan 300rb');
  // An earlier saved record does not stop a new flow.
  let m2 = { plan: { text: 'kopi 25rb', status: 'saved' } };
  for (const say of ['bkin anggaran dong', 'jajan']) m2 = (await chatReply(say, m2, ctx)).memory;
  assert.equal((await chatReply('300rb', m2, ctx)).reply.text, 'anggaran jajan 300rb');
});
