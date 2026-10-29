import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply, askAgain } from '../lib/chat/engine.ts';
import { calculate, calcText } from '../lib/chat/calc.ts';
import { prune, page } from '../lib/chat/store.ts';
import { chatCtx } from '../bench/chat/state.mjs';

/** A conversation: each step is a message (or "#save" for the Simpan button); returns every result. */
function talk(...steps) {
  let mem = {}; const out = [];
  for (const s of steps) {
    if (s === '#save') { mem = { ...mem, plan: { ...mem.plan, status: 'saved' } }; continue; }
    const r = chatReply(s, mem, chatCtx); mem = r.memory; out.push(r);
  }
  return out;
}

test('chat calculator: words left to right, symbols with precedence, brackets, percents, number words', () => {
  const v = t => calcText(calculate(t));
  assert.equal(v('128181 dibagi 3 dikali 2'), 'Rp85.454');
  assert.equal(v('100rb ditambah 50rb dibagi 2'), 'Rp75.000');
  assert.equal(v('100rb + 50rb / 2'), 'Rp125.000');
  assert.equal(v('(50rb+30rb)/2'), 'Rp40.000');
  assert.equal(v('15% dari 2,5jt'), 'Rp375.000');
  assert.equal(v('12 x 7'), '84');
  assert.equal(v('7 : 2'), '3,5');
  assert.equal(v('dua puluh ribu dikali tiga'), 'Rp60.000');
  assert.equal(calculate('makan 20rb'), null);
  assert.equal(calculate('5 / 0'), null);
});

test('chat: a record is handed to Catat otomatis; short follow-ups change it before it is saved', () => {
  const [rec, amount, wallet, day, cat, split] = talk('makan siang 35rb pakai gopay', 'jadi 45rb', 'pakai jago', 'kemarin', 'kategorinya jajan', 'bagi 2 sama rina');
  assert.deepEqual([rec.intent, rec.reply.kind, rec.reply.text], ['plan', 'plan', 'makan siang 35rb pakai gopay']);
  assert.equal(amount.reply.text, 'makan siang 45rb pakai gopay');
  assert.equal(wallet.reply.text, 'makan siang 45rb pakai jago');
  assert.equal(day.reply.text, 'makan siang 45rb pakai jago kemarin');
  assert.equal(cat.reply.text, 'makan siang 45rb pakai jago kemarin kategori jajan');
  assert.match(split.reply.text, /bagi 2 sama rina$/);
  assert.ok([amount, wallet, day, cat, split].every(r => r.intent === 'edit'));
});

test('chat: a wallet that does not exist is said so, with the wallets that do', () => {
  const [, r] = talk('makan 20rb', 'pakai ovo aja');
  assert.equal(r.reply.kind, 'say'); assert.match(r.reply.text, /belum ada/); assert.ok(r.reply.chips.includes('pakai gopay'));
});

test('chat: after saving, the last record is changed or removed (with a confirmation card)', () => {
  const [, amount, undo] = talk('makan 20rb', '#save', 'jadi 25rb', 'batalin yang tadi');
  assert.equal(amount.reply.text, 'ubah transaksi terakhir jadi 25rb');
  assert.deepEqual([undo.intent, undo.reply.text], ['undo', 'hapus transaksi terakhir']);
  const [, cancel] = talk('makan 20rb', 'gak jadi');
  assert.equal(cancel.intent, 'cancel'); assert.equal(cancel.dismiss, true);
});

test('chat: the last question asked again with a new period or subject', () => {
  assert.equal(askAgain('berapa pengeluaran makan bulan ini', 'bulan lalu', '2026-10-15', 24), 'berapa pengeluaran makan bulan lalu');
  assert.equal(askAgain('berapa pengeluaran makan bulan ini', 'transport', '2026-10-15', 24), 'berapa pengeluaran transport bulan ini');
  assert.equal(askAgain('berapa pengeluaranku bulan ini', 'buat bensin', '2026-10-15', 24), 'berapa pengeluaranku untuk bensin bulan ini');
  const [q, f1, f2] = talk('berapa pengeluaran makan bulan ini', 'kalau bulan lalu?', 'kalau transport?');
  assert.equal(q.intent, 'question');
  assert.deepEqual([f1.intent, f1.reply.text], ['followup', 'berapa pengeluaran makan bulan lalu']);
  assert.equal(f2.reply.text, 'berapa pengeluaran transport bulan lalu');
});

test('chat: a calculation carried on ("kalau dibagi 4?") is not taken for a question', () => {
  const [, c, again] = talk('berapa pengeluaran makan bulan ini', 'hitung 128181 dibagi 3 dikali 2', 'kalau dibagi 4?');
  assert.equal(c.intent, 'calc'); assert.match(c.reply.text, /= Rp85\.454$/);
  assert.equal(again.intent, 'calc'); assert.match(again.reply.text, /85\.454 ÷ 4 = Rp21\.364/);
});

test('chat: summary, "boleh beli?" and tips come from the person\'s own records', () => {
  const [sum] = talk('ringkasan bulan ini');
  assert.equal(sum.intent, 'summary');
  assert.ok(sum.reply.lines.some(l => l.label === 'Pengeluaran' && l.value === 'Rp1.270.000'));
  assert.match(sum.reply.text, /Makan & Minum 84%/);
  const [ok] = talk('aman nggak beli sepatu 500rb?');
  assert.equal(ok.intent, 'afford'); assert.equal(ok.reply.tone, 'good'); assert.equal(ok.reply.title, 'Beli sepatu?');
  const [no] = talk('boleh beli hp 6jt ga');
  assert.equal(no.reply.tone, 'warn'); assert.match(no.reply.text, /^Belum aman/);
  const [tips] = talk('kasih tips hemat');
  assert.equal(tips.intent, 'tips'); assert.ok(tips.reply.lines.length >= 3);
});

test('chat: greetings, thanks, help, examples, and a kind reply when nothing is understood', () => {
  const [hi, thx, help, ex, none] = talk('halo', 'makasih', 'bisa apa aja?', 'contoh', 'asdfgh');
  assert.deepEqual([hi.intent, thx.intent, help.intent, ex.intent, none.intent], ['greet', 'thanks', 'help', 'examples', 'unknown']);
  assert.match(hi.reply.text, /Dinda/);
  assert.ok(none.reply.chips.length >= 3);
});

test('chat history: kept for the chosen days, shown ten at a time', () => {
  const now = Date.parse('2026-10-15T12:00:00Z'), day = 86_400_000;
  const msgs = Array.from({ length: 25 }, (_, i) => ({ id: String(i), at: now - (24 - i) * day, role: 'user', text: `m${i}` }));
  assert.equal(prune(msgs, 7, now).length, 8);
  assert.equal(prune(msgs, 14, now).length, 15);
  assert.equal(prune(msgs, 30, now).length, 25);
  const p = page(msgs, 10);
  assert.deepEqual([p.visible.length, p.more, p.hidden, p.visible[0].text], [10, true, 15, 'm15']);
  assert.equal(page(msgs, 30).more, false);
});
