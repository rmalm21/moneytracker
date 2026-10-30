import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply } from '../lib/chat/engine.ts';
import { understand } from '../lib/chat/understand.ts';
import { readSaving } from '../lib/chat/answers.ts';
import { readPeriod } from '../lib/catat/ask.ts';
import { v3Ctx } from '../bench/v83/state.mjs';

// 8.3 — chat v3: what the chat works out itself, and the words it now reads.
const ask = async (text, memory = {}) => chatReply(text, memory, { ...v3Ctx, voice: 'santai' });
const said = r => r.reply.kind === 'say' ? [r.reply.text, r.reply.hero && `${r.reply.hero.label} ${r.reply.hero.value}`, ...(r.reply.lines || []).map(l => `${l.label} ${l.value}`)].filter(Boolean).join(' ') : r.reply.text;

test('8.3 understand: English, regional words, misspellings and words of address around a question', () => {
  assert.equal(understand('how much did i spend this month'), 'pengeluaran bulan ini berapa');
  assert.equal(understand('my gopay balance'), 'saldo gopay berapa');
  assert.equal(understand('duitku kari piro'), 'uang aku sisa berapa');
  assert.equal(understand('pengeluaran abdi bulan ieu sabaraha'), 'pengeluaran aku bulan ini berapa');
  assert.equal(understand('pengeluarn bln ini brp'), 'pengeluaran bln ini brp');
  assert.equal(understand('bot, tanggal 9 habis brp??'), 'tanggal 9 habis brp??');
  assert.equal(understand('JAGONYA MASIH BRAPAH?'), 'jago masih berapa?');
});
test('8.3 understand leaves records, greetings and real words alone', () => {
  for (const text of ['kak tio ngutang 25k', 'makan di SRPN Coffee 30k jago', 'dinner w/ fam 250k', 'rian udah lunasin utangnya', 'hai hai dompet ajaib', 'beli beras', 'jatuh tempo kapan', '🤣🤣🤣', 'cukup nggak uangku sampe gajian']) assert.equal(understand(text), text);
});
test('8.3 one day: a date, a weekday, "tgl 1 kemarin" is this month', () => {
  const day = p => readPeriod(p, '2026-10-15', 24)?.start;
  assert.equal(day('tanggal 5'), '2026-10-05');
  assert.equal(day('tanggal 20 bulan lalu'), '2026-09-20');
  assert.equal(day('17 agustus'), '2026-08-17');
  assert.equal(day('tgl 1 kemarin'), '2026-10-01');
  assert.equal(day('senin kemarin'), '2026-10-12');
  assert.equal(day('rabu minggu lalu'), '2026-10-07');
  assert.equal(day('hari minggu kemarin'), '2026-10-11');
  assert.equal(day('minggu kemarin'), '2026-10-05');
  assert.equal(day('sebulan kemarin'), '2026-09-01');
});
test('8.3 saving sums: how long, how much a month, how much in the end; a record is not one', () => {
  assert.match(readSaving('nabung 500rb sebulan kapan dapet 10jt', '2026-10-15', 'santai').text, /20 bulan \(1 tahun 8 bulan\)/);
  assert.match(readSaving('mau punya 12jt dalam 6 bulan nabung berapa sebulan', '2026-10-15', 'santai').text, /Rp2\.000\.000 per bulan/);
  assert.match(readSaving('kalau nabung 20 ribu sehari setahun dapet berapa', '2026-10-15', 'santai').text, /Rp7\.300\.000/);
  assert.match(readSaving('berapa bulan buat ngumpulin 4,5jt kalau sebulan sejuta', '2026-10-15', 'santai').text, /5 bulan/);
  const first = readSaving('kalau nabung 500rb per bulan kapan dapet 10jt', '2026-10-15', 'santai');
  assert.match(readSaving('kalau 1jt per bulan?', '2026-10-15', 'santai', first.saving).text, /10 bulan/);
  for (const text of ['nabung 500rb ke jago', 'nyisihin 500rb ke jago buat dana darurat']) assert.equal(readSaving(text, '2026-10-15', 'santai'), null);
});
test('8.3 Uang bebas, the daily allowance, a share, spending per category, the health score', async () => {
  assert.match(said(await ask('uang bebasku berapa')), /Rp4\.200\.000/);
  assert.match(said(await ask('sehari boleh jajan berapa')), /Rp466\.667/);
  assert.match(said(await ask('berapa persen pengeluaran buat makan bulan ini')), /25%/);
  assert.match(said(await ask('rincian pengeluaran bulan ini')), /Tagihan/);
  assert.match(said(await ask('skor keuangan aku berapa')), /75 dari 100/);
  assert.match(said(await ask('aku harus hemat di mana')), /Makan & Minum/);
});
test('8.3 one item by its name, and "kalau dimas?" after it', async () => {
  assert.match(said(await ask('cicilan hp sisa berapa')), /Rp1\.800\.000.*6 bulan/);
  const budi = await ask('budi masih utang berapa');
  assert.match(said(budi), /Budi masih utang Rp100\.000/);
  assert.match(said(await ask('kalau dimas?', budi.memory)), /Dimas masih utang Rp250\.000.*30 Okt/);
  assert.match(said(await ask('kapan liburan bali tercapai')), /8 bulan/);
  assert.match(said(await ask('tagihan terdekat apa')), /Spotify/);
  assert.match(said(await ask('klaim taksi udah cair belum')), /belum cair/);
});
test('8.3 records stay records', async () => {
  for (const text of ['kopi 25rb', 'tanggal 5 bayar kos 1,5jt', 'nabung 500rb ke jago', 'budi bayar 100rb', 'sehari jajan 20rb']) {
    const r = await ask(text);
    assert.equal(r.reply.kind, 'plan', text);
    assert.equal(v3Ctx.inspect(r.reply.text).reading, 'record', text);
  }
});
