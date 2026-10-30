import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReply, askAgain } from '../lib/chat/engine.ts';
import { calculate, calcText } from '../lib/chat/calc.ts';
import { prune, page } from '../lib/chat/store.ts';
import { chatCtx } from '../bench/chat/state.mjs';

/** A conversation: each step is a message (or "#save" for the Simpan button); returns every result. */
async function talk(...steps) {
  let mem = {}; const out = [], ctx = typeof steps[0] === 'object' ? { ...chatCtx, ...steps.shift() } : chatCtx;
  for (const s of steps) {
    if (s === '#save') { mem = { ...mem, plan: { ...mem.plan, status: 'saved' } }; continue; }
    const r = await chatReply(s, mem, ctx); mem = r.memory; out.push(r);
  }
  return out;
}

test('chat calculator: words left to right, symbols with precedence, brackets, percents, number words', async () => {
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

test('chat: a record is handed to Catat otomatis; short follow-ups change it before it is saved', async () => {
  const [rec, amount, wallet, day, cat, split] = await talk('makan siang 35rb pakai gopay', 'jadi 45rb', 'pakai jago', 'kemarin', 'kategorinya jajan', 'bagi 2 sama rina');
  assert.deepEqual([rec.intent, rec.reply.kind, rec.reply.text], ['plan', 'plan', 'makan siang 35rb pakai gopay']);
  assert.equal(amount.reply.text, 'makan siang 45rb pakai gopay');
  assert.equal(wallet.reply.text, 'makan siang 45rb pakai jago');
  assert.equal(day.reply.text, 'makan siang 45rb pakai jago kemarin');
  assert.equal(cat.reply.text, 'makan siang 45rb pakai jago kemarin kategori jajan');
  assert.match(split.reply.text, /bagi 2 sama rina$/);
  assert.ok([amount, wallet, day, cat, split].every(r => r.intent === 'edit'));
});

test('chat: a wallet that does not exist is said so, with the wallets that do', async () => {
  const [, r] = await talk('makan 20rb', 'pakai ovo aja');
  assert.equal(r.reply.kind, 'say'); assert.match(r.reply.text, /belum ada/); assert.ok(r.reply.chips.includes('pakai gopay'));
});

test('chat: after saving, the last record is changed or removed (with a confirmation card)', async () => {
  const [, amount, undo] = await talk('makan 20rb', '#save', 'jadi 25rb', 'batalin yang tadi');
  assert.equal(amount.reply.text, 'ubah transaksi terakhir jadi 25rb');
  assert.deepEqual([undo.intent, undo.reply.text], ['undo', 'hapus transaksi terakhir']);
  const [, cancel] = await talk('makan 20rb', 'gak jadi');
  assert.equal(cancel.intent, 'cancel'); assert.equal(cancel.dismiss, true);
});

test('chat: the last question asked again with a new period or subject', async () => {
  assert.equal(askAgain('berapa pengeluaran makan bulan ini', 'bulan lalu', '2026-10-15', 24), 'berapa pengeluaran makan bulan lalu');
  assert.equal(askAgain('berapa pengeluaran makan bulan ini', 'transport', '2026-10-15', 24), 'berapa pengeluaran transport bulan ini');
  assert.equal(askAgain('berapa pengeluaranku bulan ini', 'buat bensin', '2026-10-15', 24), 'berapa pengeluaranku untuk bensin bulan ini');
  const [q, f1, f2] = await talk('berapa pengeluaran makan bulan ini', 'kalau bulan lalu?', 'kalau transport?');
  assert.equal(q.intent, 'question');
  assert.deepEqual([f1.intent, f1.reply.text], ['followup', 'berapa pengeluaran makan bulan lalu']);
  assert.equal(f2.reply.text, 'berapa pengeluaran transport bulan lalu');
});

test('chat: a calculation carried on ("kalau dibagi 4?") is not taken for a question', async () => {
  const [, c, again] = await talk('berapa pengeluaran makan bulan ini', 'hitung 128181 dibagi 3 dikali 2', 'kalau dibagi 4?');
  assert.equal(c.intent, 'calc'); assert.match(c.reply.text, /= Rp85\.454$/);
  assert.equal(again.intent, 'calc'); assert.match(again.reply.text, /85\.454 ÷ 4 = Rp21\.364/);
});

test('chat: summary, "boleh beli?" and tips come from the person\'s own records', async () => {
  const [sum] = await talk('ringkasan bulan ini');
  assert.equal(sum.intent, 'summary');
  assert.ok(sum.reply.stats.some(l => l.label === 'Pengeluaran' && l.value === 'Rp1.270.000'));
  assert.match(sum.reply.text, /Makan & Minum 84%/);
  const [ok] = await talk('aman nggak beli sepatu 500rb?');
  assert.equal(ok.intent, 'afford'); assert.equal(ok.reply.tone, 'good'); assert.equal(ok.reply.title, 'Beli sepatu?');
  const [no] = await talk('boleh beli hp 6jt ga');
  assert.equal(no.reply.tone, 'warn'); assert.match(no.reply.text, /^Belum aman/);
  const [tips] = await talk('kasih tips hemat');
  assert.equal(tips.intent, 'tips'); assert.ok(tips.reply.steps.length >= 3);
});

test('chat: greetings, thanks, help, examples, and a kind reply when nothing is understood', async () => {
  const [hi, thx, help, ex, none] = await talk('halo', 'makasih', 'bisa apa aja?', 'contoh', 'asdfgh');
  assert.deepEqual([hi.intent, thx.intent, help.intent, ex.intent, none.intent], ['greet', 'thanks', 'help', 'examples', 'unknown']);
  assert.match(hi.reply.text, /Dinda/);
  assert.ok(none.reply.chips.length >= 3);
});

test('chat history: kept for the chosen days, shown ten at a time', async () => {
  const now = Date.parse('2026-10-15T12:00:00Z'), day = 86_400_000;
  const msgs = Array.from({ length: 25 }, (_, i) => ({ id: String(i), at: now - (24 - i) * day, role: 'user', text: `m${i}` }));
  assert.equal(prune(msgs, 7, now).length, 8);
  assert.equal(prune(msgs, 14, now).length, 15);
  assert.equal(prune(msgs, 30, now).length, 25);
  const p = page(msgs, 10);
  assert.deepEqual([p.visible.length, p.more, p.hidden, p.visible[0].text], [10, true, 15, 'm15']);
  assert.equal(page(msgs, 30).more, false);
});

test('chat: a record missing a category is asked back, and a short answer fills it in', async () => {
  const [ask, fill] = await talk('beli 25rb', 'jajan');
  assert.equal(ask.reply.kind, 'plan');
  assert.match(ask.reply.intro, /kategori/i);
  assert.ok(ask.reply.chips.length >= 3);
  assert.equal(ask.memory.asking.field, 'category');
  assert.deepEqual([fill.intent, fill.reply.text], ['fill', 'beli 25rb kategori jajan']);
});

test('chat: four ways of talking, chosen in settings or by saying so', async () => {
  const replies = {};
  for (const voice of ['santai', 'sopan', 'singkat', 'gaul']) replies[voice] = (await talk({ voice }, 'makan siang 35rb pakai gopay', 'jadi 45rb'))[1].reply.intro;
  assert.match(replies.santai, /kuganti/); assert.match(replies.sopan, /saya ubah/); assert.match(replies.gaul, /gue/);
  assert.ok(replies.singkat.length < replies.santai.length);
  const [formal] = await talk('pakai bahasa formal ya');
  assert.equal(formal.setVoice, 'sopan');
  const [gaul] = await talk('gaya gaul');
  assert.equal(gaul.setVoice, 'gaul');
});

test('chat: learns from the person: a phrase not understood, then the one that worked', async () => {
  const [miss, hit] = await talk('gmn nasib dompetku', 'ringkasan bulan ini');
  assert.equal(miss.intent, 'unknown');
  assert.deepEqual(hit.learn, { phrase: 'gmn nasib dompetku', as: 'ringkasan bulan ini' });
  const [again] = await talk({ learned: { 'gmn nasib dompetku': 'ringkasan bulan ini' } }, 'gmn nasib dompetku');
  assert.deepEqual([again.intent, again.by], ['summary', 'learned']);
  // Never learned for records (money must be read from the sentence each time).
  const [, rec] = await talk('asdf qwer', 'kopi 20rb');
  assert.equal(rec.learn, undefined);
});

test('chat 7.7: every budget at once, days to payday, a kind word when money worries', async () => {
  const [b] = await talk('anggaranku gimana');
  assert.equal(b.intent, 'budget'); assert.equal(b.reply.card, 'budget');
  assert.equal(b.reply.bars[0].label, 'Makan & Minum'); assert.equal(b.reply.bars[0].tone, 'warn'); assert.equal(b.reply.hero.value, 'Rp165.000');
  // One budget by name stays a Tanya question.
  const [one] = await talk('sisa anggaran makan berapa');
  assert.equal(one.intent, 'question');
  const [none] = await talk({ data: { ...chatCtx.data, budgets: [] } }, 'cek semua anggaran');
  assert.equal(none.intent, 'budget'); assert.match(none.reply.text, /belum punya anggaran/); assert.ok(none.reply.chips.includes('anggaran makan 2jt'));
  const [p] = await talk('kapan gajian?');
  assert.equal(p.intent, 'payday'); assert.equal(p.reply.hero.value, '9 hari lagi'); assert.match(p.reply.hero.note, /24 Oktober/);
  const [rec] = await talk('gajian 8jt masuk jago');
  assert.equal(rec.intent, 'plan');
  const [m] = await talk('aduh lagi bokek');
  assert.equal(m.intent, 'mood'); assert.match(m.reply.text, /Wajar/); assert.equal(m.reply.steps.length, 3);
  const [soft] = await talk('lagi galau nih');
  assert.equal(soft.intent, 'curhat');
});

test('chat 7.7: saving goals become a fund to create; small talk; a greeting with more after it', async () => {
  const [g] = await talk('pengen nabung 30jt buat nikah');
  assert.equal(g.intent, 'goal'); assert.equal(g.reply.hero.value, 'Rp30.000.000'); assert.ok(g.reply.chips.includes('target nikah 30jt'));
  assert.equal(chatCtx.inspect('target nikah 30jt').kind, 'fund_new');
  const [open] = await talk('aku pengen nabung buat liburan');
  assert.equal(open.intent, 'goal'); assert.deepEqual(open.reply.chips.slice(0, 2), ['target liburan 10jt', 'target liburan 20jt']);
  const [e] = await talk('mau siapin dana darurat');
  assert.equal(e.reply.hero.value, 'Rp5.000.000–Rp10.000.000');
  // Saving into a wallet is still a record, and "cara nabung" is still tips.
  const [save] = await talk('nabung 500rb ke jago');
  assert.equal(save.intent, 'plan');
  const [how] = await talk('gimana caranya bisa nabung');
  assert.equal(how.intent, 'tips');
  const [k] = await talk('apa kabar');
  assert.equal(k.intent, 'smalltalk'); assert.match(k.reply.text, /Baik/);
  const [hi] = await talk('malam kak, masih bangun?');
  assert.equal(hi.intent, 'greet');
  const [notHi] = await talk('pagi, saldo jago berapa');
  assert.equal(notHi.intent, 'question');
  for (const voice of ['santai', 'sopan', 'singkat', 'gaul']) {
    const [r] = await talk({ voice }, 'gajian masih berapa hari');
    assert.ok(r.reply.text.length > 5, voice);
  }
});

test('chat 7.8: jokes go on ("lagi") and explain themselves ("maksudnya?"); banter; serious mode answers the rest', async () => {
  const [j1, j2, why, b] = await talk('kasih jokes dong', 'lagi', 'maksudnya?', 'wkwk garing');
  assert.deepEqual([j1.intent, j2.intent, why.intent, b.intent], ['joke', 'joke', 'explain', 'banter']);
  assert.notEqual(j1.reply.text, j2.reply.text);
  assert.match(why.reply.text, /Lucunya|gini/);
  const [s] = await talk('udah ah serius, ringkasan bulan ini');
  assert.equal(s.intent, 'summary'); assert.equal(s.memory.serious, true);
  const [s2] = await talk('serius dong');
  assert.equal(s2.intent, 'serious');
});

test('chat 7.8: anger gets a sorry and an offer to be taught; apologies; venting is listened to; offers answered', async () => {
  const [a, p] = await talk('kamu bego ya', 'maaf ya tadi aku kasar');
  assert.equal(a.intent, 'angry'); assert.ok(a.reply.chips.includes('ajari aku')); assert.equal(p.intent, 'apology');
  // Self-blame is not anger at the assistant.
  const [self] = await talk('aku bodoh banget soal uang');
  assert.notEqual(self.intent, 'angry');
  const [c1, c2, yes] = await talk('aku lagi sedih', 'kerjaan numpuk terus atasan marah', 'boleh');
  assert.deepEqual([c1.intent, c2.intent, yes.intent], ['curhat', 'curhat', 'joke']);
  const [sleep, ok] = await talk('aku ngantuk', 'boleh');
  assert.deepEqual([sleep.intent, ok.intent], ['smalltalk', 'question']);
  const [, no] = await talk('aku ngantuk', 'ga usah');
  assert.equal(no.intent, 'decline');
  const [harm] = await talk('aku pengen mati aja');
  assert.equal(harm.intent, 'curhat'); assert.match(harm.reply.text, /119/);
  // Money worries stay "mood" (with an offer of tips).
  const [m, tips] = await talk('lagi stres soal tagihan', 'boleh');
  assert.deepEqual([m.intent, tips.intent], ['mood', 'tips']);
});

test('chat 7.8: after two messages not understood the person can teach it; explicit teaching; learned words inside sentences', async () => {
  const learned = {};
  let mem = {};
  const say = async text => { const r = await chatReply(text, mem, { ...chatCtx, learned }); mem = r.memory; if (r.learn) learned[r.learn.phrase] = r.learn.as; return r; };
  assert.equal((await say('blablabla qwerty')).intent, 'unknown');
  const second = await say('zxcv asdf');
  assert.equal(second.intent, 'unknown'); assert.ok(second.reply.chips.includes('ajari aku'));
  const ask = await say('ajari aku');
  assert.equal(ask.intent, 'teach'); assert.match(ask.reply.text, /zxcv asdf/);
  const taught = await say('ringkasan bulan ini');
  assert.equal(taught.intent, 'summary'); assert.equal(learned['zxcv asdf'], 'ringkasan bulan ini');
  assert.equal((await say('zxcv asdf')).intent, 'summary');
  const t = await say('kalau aku bilang boncos artinya boros');
  assert.equal(t.intent, 'teach'); assert.equal(learned.boncos, 'boros');
  // 7.9: "aku boros banget bulan ini" (the learned word read inside) is answered with an offer to look first (training document).
  const alias = await say('aku boncos banget bulan ini');
  assert.equal(alias.intent, 'clarify'); assert.match(alias.reply.text, /bulan ini/);
  const bad = await say('kalau aku bilang zzz artinya qqq www');
  assert.equal(bad.intent, 'teach'); assert.equal(learned.zzz, undefined);
});

test('chat 7.8: "jadi 50rb" on "gue cuma 45k" changes your part, not the bill', async () => {
  const [rec, edit] = await talk('290k hokben kemarin gue cuma 45k', 'jadi 50rb');
  assert.equal(rec.intent, 'plan'); assert.equal(edit.intent, 'edit');
  assert.equal(edit.reply.text, '290k hokben kemarin gue cuma 50rb');
});

// ——— 7.9 (training document) ———
import { suggestFor } from '../lib/chat/suggest.ts';
import { parseQuickPlan } from '../lib/quick-plan.ts';
const cards = text => parseQuickPlan(text, chatCtx.quick).actions.map(a => ({ kind: a.result.kind, amount: a.result.amount, wallet: a.result.preset.walletId || '', date: a.result.date, notes: a.result.preset.notes || '' }));

test('chat 7.9: several changes in one message, a note, one item of several, the wallet of the card before', async () => {
  const [, two] = await talk('beli kopi 25rb', 'GoPay, kemarin.');
  assert.equal(two.intent, 'edit'); assert.deepEqual(cards(two.reply.text).map(c => [c.wallet, c.date]), [['gopay', '2026-10-14']]);
  const [, , three] = await talk('catat makan 35rb di warteg pake jago kemarin', 'bukan jago, gopay. eh nominalnya 32rb', 'tanggalnya hari ini aja, catatan makan siang');
  const c = cards(three.reply.text)[0]; assert.deepEqual([c.amount, c.wallet, c.date], [32000, 'gopay', '2026-10-15']); assert.match(c.notes, /Makan siang/);
  const [, note] = await talk('kopi 20rb', 'catatannya lembur');
  assert.ok(!note.dismiss); assert.match(cards(note.reply.text)[0].notes, /Lembur/);
  const [, drop] = await talk('siapin kopi 20rb, roti 15rb, parkir 3rb', 'yang kedua hapus, nggak jadi beli');
  assert.ok(!drop.dismiss); assert.deepEqual(cards(drop.reply.text).map(x => x.amount), [20000, 3000]);
  const [, item] = await talk('buku 80rb dan pulpen 12rb, bayar tunai', 'pulpennya 10rb, buku tetep');
  assert.deepEqual(cards(item.reply.text).map(x => x.amount), [80000, 10000]);
  const [, day] = await talk('bensin 30rb, tol 20rb pakai jago', 'tolnya kemarin');
  assert.deepEqual(cards(day.reply.text).map(x => x.date), ['2026-10-15', '2026-10-14']);
  const [, same] = await talk('makan siang 25rb pake tunai', 'kopi 12rb juga, dompetnya sama');
  assert.deepEqual(cards(same.reply.text).map(x => x.wallet), ['cash']);
  const [, back] = await talk('kopi 25rb. eh 22rb', 'bener yang awal, 25rb');
  assert.deepEqual(cards(back.reply.text).map(x => x.amount), [25000]);
  const [, who] = await talk('dika pinjem 100rb dari jago', '#save', 'dia baru balikin 40rb ke tunai');
  assert.deepEqual(cards(who.reply.text).map(x => [x.kind, x.amount, x.wallet]), [['receivable_payment', 40000, 'cash']]);
});
test('chat 7.9: the chat never deletes or drops a card unless told to, and says honestly what it does not do', async () => {
  const [, , later] = await talk('catat bensin 40rb tunai', 'terus kopi 20rb jago', 'yang tadi kemarin ya');
  assert.notEqual(later.intent, 'undo'); assert.ok(!later.dismiss);
  const [, saved] = await talk('beli kopi 25rb', 'udah kesimpen belum?');
  assert.equal(saved.reply.kind, 'say'); assert.match(saved.reply.text, /^Belum/);
  const [, , all] = await talk('siapin kopi 20rb dan makan 30rb', 'makan jangan dulu', 'simpan semua');
  assert.match(all.reply.text, /Simpan di kartunya/);
  const [send] = await talk('transferin ke dika sekarang');
  assert.equal(send.reply.kind, 'say'); assert.match(send.reply.text, /aplikasi bank/);
});
test('chat 7.9: arithmetic in words is answered, not recorded, and can become cards after', async () => {
  const say = async text => (await talk(text))[0].reply;
  assert.match((await say('total 250rb, bayar 300rb, kembali berapa?')).text, /50\.000/);
  assert.match((await say('325rb cukup buat 13 hari, sehari berapa?')).text, /25\.000/);
  assert.match((await say('400rb jadi 500rb naik berapa persen?')).text, /25%/);
  assert.match((await say('patungan 10rb untuk 3 orang, bagi rata sampai rupiah')).text, /3\.334, Rp3\.333, Rp3\.333/);
  const [, maybe, plan] = await talk('budget makan 1,2jt, udah kepake 875rb. sisa?', 'kalau makan lagi 80rb?', 'ada rencana makan 100rb juga');
  assert.match(maybe.reply.text, /245\.000/); assert.match(plan.reply.text, /225\.000/);
  const [sum, keep] = await talk('kalau makan 35rb sama parkir 3rb total berapa?', 'oke catat tunai');
  assert.equal(sum.reply.kind, 'say'); assert.deepEqual(cards(keep.reply.text).map(x => [x.amount, x.wallet]), [[35000, 'cash'], [3000, 'cash']]);
});
test('chat 7.9: what things mean, money that is not money yet, someone else\'s purchase', async () => {
  const say = async text => (await talk(text))[0];
  assert.match((await say('budget sama saldo beda apa?')).reply.text, /Saldo itu uang/);
  assert.match((await say('arsip dompet itu apa?')).reply.text, /dipulihkan/);
  for (const text of ['cashback-nya 10rb tapi bentuk koin toko', 'gue udah ajuin refund 80rb', 'dika katanya beli hp 5jt kemarin, mahal juga ya', 'saldo beda 50rb, bikin aja transaksi biar pas', 'bimo bilang besok bakal lunasin 200rb']) {
    const r = await say(text); assert.equal(r.reply.kind, 'say', text);
  }
  const unit = await talk('beli kopi tiga sama roti, kopinya 18rb rotinya 12rb', 'per gelas');
  assert.match(unit[0].reply.text, /per gelas atau total/); assert.deepEqual(cards(unit[1].reply.text).map(x => x.amount), [54000, 12000]);
});
test('chat 7.9 suggestions: clear labels that follow the conversation, wallets that may pay only', async () => {
  const [draft] = await talk('beli kopi 25rb');
  const s = suggestFor(draft.memory, chatCtx, draft.reply);
  assert.ok(s.some(x => x.label === 'Ganti ke kemarin' && x.text === 'tanggalnya kemarin'));
  assert.ok(s.some(x => x.label.startsWith('Bayar pakai ')));
  assert.ok(s.some(x => x.fill === 'jadi ') && s.some(x => x.fill === 'catatannya '));
  const saving = { ...chatCtx, data: { ...chatCtx.data, wallets: chatCtx.data.wallets.map(w => w.id === 'gopay' ? { ...w, isSpendable: false } : w) } };
  assert.ok(!suggestFor(draft.memory, saving, draft.reply).some(x => x.text === 'pakai gopay'));
  const [q] = await talk('pengeluaran bulan ini berapa');
  assert.ok(suggestFor(q.memory, chatCtx, q.reply).some(x => x.text === 'kalau bulan lalu?'));
  const idle = suggestFor({}, { ...chatCtx, hour: 12 });
  assert.ok(idle.some(x => x.label === 'Catat makan siang…'));
  assert.ok(idle.length <= 6 && new Set(idle.map(x => x.label)).size === idle.length);
});
