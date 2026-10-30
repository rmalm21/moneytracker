import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { readSwear, readLaugh, laughBack } from '../lib/chat/fun.ts';
import { readModule } from '../lib/chat/modules.ts';
import { fullCtx, borosCtx } from '../bench/v80/state.mjs';

const talk = async (voice, messages, ctx = fullCtx) => { let memory = {}; const out = []; for (const m of messages) { const r = await chatReply(m, memory, { ...ctx, voice }); memory = r.memory; out.push(r); } return out; };
const said = r => r.reply.kind === 'say' ? r.reply.text : `${r.reply.intro || ''} ${r.reply.text}`;

test('8.0 kata kasar: Sopan istighfar, Gaul ngatain balik, kata jorok tidak diulang', async () => {
  const [sopan] = await talk('sopan', ['anjing']);
  assert.equal(sopan.intent, 'swear'); assert.match(said(sopan), /astaghfirullah/i);
  for (let i = 0; i < 4; i++) { const r = (await talk('gaul', Array(i + 1).fill('anjing')))[i]; assert.equal(r.intent, 'swear'); assert.doesNotMatch(said(r), /maaf|mohon/i); }
  for (const v of ['sopan', 'santai', 'gaul', 'singkat']) { const [r] = await talk(v, ['memek lu']); assert.doesNotMatch(said(r), /memek/i); }
});

test('8.0 kata kasar dengan maksud lain: tetap dicatat atau dijawab', async () => {
  const [r] = await talk('gaul', ['anjir bensin 50rb pake gopay']);
  assert.equal(r.reply.kind, 'plan'); assert.equal(fullCtx.inspect(r.reply.text).reading, 'record'); assert.match(r.reply.intro, /wkwk|ngegas|santai/i);
  assert.deepEqual(readSwear('anjir mahal banget').words, ['anjir']);
  assert.equal(readSwear('sejuta anjungan'), null);
});

test('8.0 ketawa dibalas sama kerasnya', async () => {
  assert.equal(readLaugh('WKWKWKWK').loud, true); assert.equal(readLaugh('wkwk').loud, false); assert.ok(readLaugh('awokawok')); assert.ok(readLaugh('🤣🤣'));
  assert.match(laughBack('gaul', readLaugh('WKWKWKWK'), 1, false), /^WKWK/);
  const [, after] = await talk('santai', ['kasih jokes dong', 'hahaha']);
  assert.equal(after.intent, 'banter'); assert.match(said(after), /lagi/i);
});

test('8.0 tebak-tebakan dua arah dan jokes orang', async () => {
  const [ask, reveal] = await talk('santai', ['tebak-tebakan dong', 'nyerah']);
  assert.equal(ask.intent, 'joke'); assert.match(said(ask), /\?/); assert.match(said(reveal), /jawabannya/i);
  const [start, guess, laugh] = await talk('gaul', ['gue punya tebakan', 'hewan apa yang paling kaya?', 'ayam, bulunya emas']);
  assert.equal(start.intent, 'riddle'); assert.match(said(guess), /nyerah|apaan|kasih tau/i); assert.match(said(laugh), /wkwk|haha/i);
  const [told] = await talk('santai', ['kenapa ikan ga bisa main bola? karena takut kena jaring']);
  assert.equal(told.intent, 'banter'); assert.match(said(told), /\/10|haha|wkwk/i);
  const [notJoke] = await talk('santai', ['kenapa pengeluaran aku naik?']);
  assert.notEqual(notJoke.intent, 'banter');
});

test('8.0 roasting dari catatan sendiri, dan sindiran kalau jajan yang sama terus', async () => {
  const [r] = await talk('gaul', ['roasting gue dong'], borosCtx);
  assert.equal(r.intent, 'roast'); assert.match(said(r), /Jajan|Kopi/);
  const [hemat] = await talk('santai', ['roasting aku dong']);
  assert.match(said(hemat), /hemat|celah/i);
  const [kopi] = await talk('gaul', ['kopi 45rb pake jago'], borosCtx);
  assert.equal(kopi.reply.kind, 'plan'); assert.match(kopi.reply.intro, /ke-\d+/);
  const [singkat] = await talk('singkat', ['kopi 45rb pake jago'], borosCtx);
  assert.doesNotMatch(singkat.reply.intro || '', /ke-\d+/);
});

test('8.0 semua menu: buka menu dan jawab dari data dengan tombol', async () => {
  assert.equal(readModule('buka anggaran', fullCtx.data, fullCtx.today, 'santai').open.view, 'budgets');
  assert.equal(readModule('siapa aja yang utang ke gue', fullCtx.data, fullCtx.today, 'gaul').open.view, 'receivables');
  assert.equal(readModule('sisa anggaran makan berapa', fullCtx.data, fullCtx.today, 'santai'), null);
  const [debt] = await talk('santai', ['cicilan aku masih berapa']);
  assert.equal(debt.intent, 'module'); assert.equal(debt.reply.open.view, 'debts'); assert.match(said(debt), /1\.800\.000/);
  const [open] = await talk('santai', ['tunjukin laporan']);
  assert.equal(open.reply.open.view, 'report');
  const [rec] = await talk('santai', ['utang ke budi 50rb pake jago']);
  assert.equal(rec.reply.kind, 'plan');
});
