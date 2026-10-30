import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { readSwear } from '../lib/chat/fun.ts';
import { readGame } from '../lib/chat/games.ts';
import { readHowto } from '../lib/chat/howto.ts';
import { readTalk } from '../lib/chat/talk.ts';
import { fullCtx, statsCtx } from '../bench/v81/state.mjs';

const talk = async (voice, messages, ctx = fullCtx) => { let memory = {}; const out = []; for (const m of messages) { const r = await chatReply(m, memory, { ...ctx, voice }); memory = r.memory; out.push(r); } return out; };
const said = r => r.reply.kind === 'say' ? r.reply.text : `${r.reply.intro || ''} ${r.reply.text}`;

test('8.1 kata kasar ditulis dengan cara apa pun, dan bahasa daerah', () => {
  for (const [typed, word] of [['anjiiiiing', 'anjing'], ['4nj1ng', 'anjing'], ['a*jing', 'anjing'], ['b4ngs4t', 'bangsat'], ['f*ck', 'fuck'], ['asuuuu', 'asu'], ['ndasmu', 'ndasmu'], ['bodat', 'bodat'], ['k0nt0l', 'kontol']]) assert.deepEqual(readSwear(typed)?.words, [word], typed);
  for (const clean of ['cokelat 20rb', 'cukup segini', 'asuransi mobil', 'pantai kuta', 'tema gelap']) assert.equal(readSwear(clean), null, clean);
});

test('8.1 nama hewan dengan nominal tetap hewan', async () => {
  assert.equal(readSwear('makanan anjing 100rb', true), null);
  assert.equal(readSwear('sate babi 50rb', true), null);
  assert.ok(readSwear('anjing, mahal banget kopi 50rb', true));
  const [r] = await talk('santai', ['makanan anjing 100rb pake jago']);
  assert.equal(r.reply.kind, 'plan'); assert.match(r.reply.text, /anjing/);
});

test('8.1 gaya Bar-bar: dipilih lewat chat, menyapa dan meroasting dengan kasar', async () => {
  const [pick] = await talk('santai', ['pakai gaya bar-bar']);
  assert.equal(pick.setVoice, 'barbar');
  const [hi] = await talk('barbar', ['halo']);
  assert.match(said(hi), /anjir|woy/i);
  const [sw] = await talk('barbar', ['anjing']);
  assert.doesNotMatch(said(sw), /astaghfirullah/i);
});

test('8.1 obrolan baik dan kabar gembira', () => {
  for (const t of ['aku sayang kamu', 'kamu jomblo ya', 'umur kamu berapa', 'udah makan belum', 'dadah', 'semangatin aku dong', 'aku ulang tahun hari ini', 'yeay akhirnya gajian', 'laper banget', 'akhirnya weekend']) assert.ok(readTalk(t, 'santai', 1), t);
  for (const t of ['gajian kpn sih', 'kamu bisa ngapain aja', 'pengeluaran weekend berapa']) assert.equal(readTalk(t, 'santai', 1), null, t);
});

test('8.1 permainan: suit, koin, dadu, pilihin, tebak angka', async () => {
  const start = readGame('suit yuk', 'suit yuk', 'santai', 1);
  assert.equal(start.game.kind, 'suit');
  assert.match(readGame('batu', 'batu', 'santai', 2, start.game).text, /menang|kalah|seri/i);
  assert.match(readGame('lempar koin', 'lempar koin', 'gaul', 1).text, /angka|gambar/);
  assert.match(readGame('pilihin dong, bakso atau mie ayam', 'x', 'santai', 1).text, /bakso|mie ayam/);
  const [, guess] = await talk('santai', ['main tebak angka', '5']);
  assert.equal(guess.intent, 'game'); assert.match(said(guess), /besar|kecil|benar/i);
  const [rnd] = await talk('santai', ['angka acak 1 sampai 6']);
  assert.match(said(rnd), /\b[1-6]\b/);
});

test('8.1 pertanyaan data dan cara pakai fitur', async () => {
  const [weekday] = await talk('santai', ['hari apa aku paling boros'], statsCtx);
  assert.equal(weekday.intent, 'question'); assert.match(said(weekday), /Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu/);
  const [shop] = await talk('santai', ['paling sering belanja di mana'], statsCtx);
  assert.match(said(shop), /Indomaret/);
  assert.equal(readHowto('cara split bill sama temen').open.view, 'splitbill');
  assert.equal(readHowto('cara masak rendang'), null);
  const [how] = await talk('santai', ['gimana cara pasang pin']);
  assert.equal(how.intent, 'howto'); assert.equal(how.reply.open.view, 'settings');
  const [tips] = await talk('santai', ['gimana caranya biar bisa nyisihin uang']);
  assert.equal(tips.intent, 'tips');
});
