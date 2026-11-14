/**
 * 10.3 Trains the pembaca kalimat (lib/catat/tagger.ts) on the app's own sentences (scripts/tagger-corpus.mjs) and writes
 * lib/catat/tagger-model.ts. Averaged perceptron, left to right (each word also sees the tag given to the word before).
 *   node scripts/train-tagger.mjs [--sentences=40000] [--epochs=6]
 * Prints how well it tags sentences it was not trained on (a separate set from the same generator, another seed).
 */
import { writeFileSync } from 'node:fs';
import { assertClean, makeCorpus, random } from './tagger-corpus.mjs';
import { features, walletWords, tagTokens, repairWallets } from '../lib/catat/tagger.ts';

const arg = (k, d) => Number(process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] || d);
const TAGS = ['O', 'AMT', 'WAL', 'WTO', 'ITEM', 'PLACE', 'DATE', 'PERSON'];
const T = TAGS.length, ix = Object.fromEntries(TAGS.map((t, i) => [t, i]));
const N = arg('sentences', 40000), EPOCHS = arg('epochs', 6), SCALE = 100, PRUNE = arg('prune', 5), MIN_SEEN = arg('min-seen', 5);

const train = makeCorpus(11, N), test = makeCorpus(99, 4000);
const forbiddenCount = assertClean([...train.sentences, ...test.sentences]);
const toks = s => s.tokens.map(([w, , comma]) => ({ text: w, low: w, start: 0, end: 0, comma: Boolean(comma) }));
console.log(`korpus: ${train.sentences.length} kalimat latih, ${test.sentences.length} kalimat uji sendiri · ${forbiddenCount} kata uji tersembunyi & salah ketik benchmark dijauhkan (dibuang: ${train.dropped + test.dropped})`);

// Averaged perceptron (weights, their running totals and when each was last changed).
const W = new Map(), U = new Map(), stamp = new Map(), seen = new Map();
let clock = 1;
const row = (map, f) => { let r = map.get(f); if (!r) { r = new Float64Array(T); map.set(f, r); } return r; };
function update(feats, gold, guess) {
  for (const f of feats) {
    const w = row(W, f), u = row(U, f), last = stamp.get(f) || clock;
    for (let k = 0; k < T; k++) u[k] += (clock - last) * w[k];
    stamp.set(f, clock);
    w[gold] += 1; w[guess] -= 1;
  }
}
function predict(feats) {
  const s = new Float64Array(T);
  for (const f of feats) { const w = W.get(f); if (w) for (let k = 0; k < T; k++) s[k] += w[k]; }
  let best = 0; for (let k = 1; k < T; k++) if (s[k] > s[best]) best = k;
  return best;
}
const order = train.sentences.map((_, i) => i), rnd = random(5);
for (let epoch = 1; epoch <= EPOCHS; epoch++) {
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let right = 0, all = 0;
  for (const n of order) {
    const s = train.sentences[n], words = walletWords(s.account), tk = toks(s);
    let prev = '<s>';
    for (let i = 0; i < tk.length; i++) {
      const feats = features(tk, i, words, prev), gold = ix[s.tokens[i][1]], guess = predict(feats);
      if (epoch === 1) for (const f of feats) seen.set(f, (seen.get(f) || 0) + 1);
      if (guess !== gold) update(feats, gold, guess); else right++;
      all++; clock++;
      prev = TAGS[guess];
    }
  }
  console.log(`  putaran ${epoch}: ${(right / all * 100).toFixed(2)}% kata benar saat latihan`);
}
// Averages, rounded and pruned to what matters.
const model = { tags: TAGS, scale: SCALE, w: {} };
for (const [f, w] of W) {
  // A feature seen only a few times (a made-up word's spelling) says nothing about new sentences: dropped.
  if ((seen.get(f) || 0) < MIN_SEEN) continue;
  const u = U.get(f), last = stamp.get(f) || clock, out = [];
  for (let k = 0; k < T; k++) { const avg = (u[k] + (clock - last) * w[k]) / clock, v = Math.round(avg * SCALE); if (Math.abs(v) >= PRUNE) out.push(k, v); }
  if (out.length) model.w[f] = out;
}

// How it does on sentences it never saw.
let right = 0, all = 0; const per = Object.fromEntries(TAGS.map(t => [t, { tp: 0, fp: 0, fn: 0 }]));
let slipHit = 0, slipAll = 0, lookFalse = 0, lookAll = 0, fixWrong = 0;
for (const s of test.sentences) {
  const tk = toks(s), got = tagTokens(model, tk, s.account), words = walletWords(s.account);
  for (let i = 0; i < tk.length; i++) {
    const gold = s.tokens[i][1], g = got[i].tag;
    all++; if (g === gold) { right++; per[gold].tp++; } else { per[g].fp++; per[gold].fn++; }
    const isWallet = gold === 'WAL' || gold === 'WTO', known = words.has(tk[i].low);
    if (isWallet && !known && /^\p{L}+$/u.test(tk[i].low)) { slipAll++; if (g === 'WAL' || g === 'WTO') slipHit++; }
  }
  // A word that only looks like a wallet must stay what it is once the sentence is repaired.
  const text = s.tokens.map(([w]) => w).join(' '), fixed = repairWallets(text, s.account, model);
  for (const f of fixed.fixed) { const k = s.tokens.findIndex(([w]) => w === f.from); if (k >= 0 && !['WAL', 'WTO'].includes(s.tokens[k][1])) fixWrong++; }
  for (const [w, tag] of s.tokens) if (['krim', 'krem', 'kram', 'jaga', 'mandi', 'tuna', 'neon', 'blue', 'jagung', 'kroket'].includes(w)) { lookAll++; if (fixed.fixed.some(f => f.from === w)) lookFalse++; void tag; }
}
const confusion = {};
for (const s of test.sentences) { const got = tagTokens(model, toks(s), s.account); s.tokens.forEach(([w, gold], i) => { if ((gold === 'WTO' || got[i].tag === 'WTO') && gold !== got[i].tag) { const k = `${gold}→${got[i].tag}`; (confusion[k] ||= []).push(s.tokens.map(([x], j) => j === i ? `[${x}]` : x).join(' ')); } }); }
if (process.argv.includes('--why')) for (const [k, v] of Object.entries(confusion)) console.log(k, v.length, '·', v.slice(0, 6).join(' | '));
const f1 = t => { const { tp, fp, fn } = per[t]; return tp ? (2 * tp / (2 * tp + fp + fn) * 100).toFixed(1) : '0.0'; };
console.log(`\nuji sendiri: ${(right / all * 100).toFixed(2)}% kata benar · F1 ${TAGS.map(t => `${t} ${f1(t)}`).join(' · ')}`);
console.log(`dompet salah ketik dikenali sebagai dompet: ${slipHit}/${slipAll} · kata mirip dompet (krim, krem, kram, jaga, mandi, tuna, neon, blue…) ikut diubah: ${lookFalse}/${lookAll} · perbaikan yang salah sasaran: ${fixWrong}`);

const body = JSON.stringify(model);
writeFileSync(new URL('../lib/catat/tagger-model.ts', import.meta.url), `/* Generated by scripts/train-tagger.mjs (10.3 pembaca kalimat). Do not edit. */\n/* eslint-disable */\nexport const TAGGER = ${body};\n`);
console.log(`\nlib/catat/tagger-model.ts: ${Object.keys(model.w).length} fitur, ${(body.length / 1024).toFixed(0)} KB`);
