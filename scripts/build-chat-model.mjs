/**
 * Trains the chat intent model once, at build time (the app never trains on the device):
 * node scripts/build-chat-model.mjs → lib/chat/chat-model.ts.
 *
 * Corpus: the hand-written sentences (lib/chat/corpus.ts) and the generated ones (lib/chat/corpus-gen.ts), each with its
 * everyday variants (corpus.ts `augment`), read as the phone reads them (lib/chat/feature.ts). Removed before training:
 * every sentence that reads the same as a held-out test message (bench/chat), and the same sentence under two intents.
 * The exported model keeps only what classifying needs (the training sentences are dropped); the script checks that the
 * trimmed model answers exactly like the full one.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { containerBootstrap } from '@nlpjs/core';
import { Nlp } from '@nlpjs/nlp';
import { LangId } from '@nlpjs/lang-id';
import { CHAT_CORPUS, CHAT_NONE, augment } from '../lib/chat/corpus.ts';
import { generatedCorpus, generatedCorpus104, generatedCorpus104b, generatedCorpus106 } from '../lib/chat/corpus-gen.ts';
import { chatFeature } from '../lib/chat/feature.ts';

// Held-out messages (single and in conversations) never reach training.
const bench = new URL('../bench/chat/', import.meta.url), held = new Set();
for (const f of readdirSync(bench).filter(f => /^(?:fixtures-heldout\d*|dialogs-heldout)\.mjs$/.test(f))) {
  const mod = await import(new URL(f, bench).href);
  for (const c of mod.cases || []) held.add(chatFeature(c.text));
  for (const d of mod.dialogs || []) for (const t of d.turns) if (t.text !== '#save') held.add(chatFeature(t.text));
}
// 10.2: and every later chat held-out set (v8.1 personality, v3 generated and hand-written, v4, Asisten 3.0, gaul, 3.5).
const turnsOf = cases => cases.flatMap(c => (c.turns || []).map(t => t.say).filter(Boolean));
const later = [
  ...turnsOf((await import('../bench/v81/fixtures-heldout.mjs')).cases),
  ...turnsOf((await import('../bench/v83/cases.mjs')).build('heldout')), ...turnsOf((await import('../bench/v83/fixtures-hand.mjs')).cases),
  ...turnsOf((await import('../bench/v84/cases.mjs')).build('heldout')), ...turnsOf((await import('../bench/v84/fixtures-hand.mjs')).cases),
  ...turnsOf((await import('../bench/v100/cases-heldout.mjs')).cases), ...turnsOf((await import('../bench/v100/cases-gaul-heldout.mjs')).cases),
  ...turnsOf((await import('../bench/v102/cases-heldout.mjs')).cases),
  // 10.4: Asisten 4.0 (v103 generated + hand-written, v1031) and Asisten 4.5 (v104).
  ...(await import('../bench/v103/gen.mjs')).build('heldout').map(c => c.text).filter(Boolean), ...turnsOf((await import('../bench/v103/gen.mjs')).build('heldout')),
  ...(await import('../bench/v103/hand-heldout.mjs')).cases.map(c => c.text).filter(Boolean), ...turnsOf((await import('../bench/v103/hand-heldout.mjs')).cases),
  ...(await import('../bench/v1031/gen.mjs')).build('heldout').map(c => c.text).filter(Boolean), ...turnsOf((await import('../bench/v1031/gen.mjs')).build('heldout')),
  ...turnsOf((await import('../bench/v104/gen.mjs')).build('heldout')),
  // 10.6: Asisten 5.0 (v106).
  ...turnsOf((await import('../bench/v106/gen.mjs')).build('heldout')),
];
for (const text of later) held.add(chatFeature(text));

// 10.4 The sentences written for 4.5 (corpus-gen.ts generatedCorpus104) never use a word that only the 4.5 held-out
// set has: not in its dev set, and not in the corpus written before it. The build stops if one does.
const v104 = await import('../bench/v104/gen.mjs');
const tokensOf = split => new Set(v104.build(split).flatMap(c => c.turns.flatMap(t => t.say ? chatFeature(t.say).split(' ') : [])));
const before = new Set([...Object.values(CHAT_CORPUS).flat(), ...CHAT_NONE, ...Object.values(generatedCorpus()).flat()].flatMap(x => chatFeature(x).split(' ')));
const devWords = tokensOf('dev'), forbidden = new Set([...tokensOf('heldout')].filter(w => w && !devWords.has(w) && !before.has(w)));
const corpus104 = generatedCorpus104();
const dirty = Object.values(corpus104).flat().flatMap(x => augment(x)).filter(x => chatFeature(x).split(' ').some(w => forbidden.has(w)));
if (dirty.length) { console.error(`10.4 sentences with held-out-only words (${dirty.length}), not built:\n${[...new Set(dirty)].slice(0, 20).join('\n')}`); process.exit(1); }

// 10.6 The same check for the 5.0 sentences (corpus-gen.ts G106) against the 5.0 held-out set (bench/v106).
const v106 = await import('../bench/v106/gen.mjs');
const tokens106 = split => new Set(v106.build(split).flatMap(c => c.turns.flatMap(t => t.say ? chatFeature(t.say).split(' ') : [])));
const before106 = new Set([...before, ...Object.values(corpus104).flat().flatMap(x => chatFeature(x).split(' ')), ...Object.values(generatedCorpus104b()).flat().flatMap(x => chatFeature(x).split(' '))]);
const dev106 = tokens106('dev'), forbidden106 = new Set([...tokens106('heldout')].filter(w => w && !dev106.has(w) && !before106.has(w)));
const corpus106 = generatedCorpus106();
const dirty106 = Object.values(corpus106).flat().flatMap(x => augment(x)).filter(x => chatFeature(x).split(' ').some(w => forbidden106.has(w)));
if (dirty106.length) { console.error(`10.6 sentences with held-out-only words (${dirty106.length}), not built:\n${[...new Set(dirty106)].slice(0, 20).join('\n')}`); process.exit(1); }

const generated = generatedCorpus(), seen = new Map(), docs = [];
for (const [intent, list] of Object.entries(corpus106)) generated[intent] = [...(generated[intent] || []), ...list];
for (const [intent, list] of Object.entries(corpus104)) generated[intent] = [...(generated[intent] || []), ...list];
// 10.4 post-hoc (after the first held-out run): everyday English, not held to the held-out words (corpus-gen.ts G104B).
for (const [intent, list] of Object.entries(generatedCorpus104b())) generated[intent] = [...(generated[intent] || []), ...list];
let hand = 0, made = 0, leaks = 0, clash = 0;
// 10.2 "None": what needs the conversation before it to mean anything (corpus.ts CHAT_NONE).
for (const [intent, list] of [...Object.entries(CHAT_CORPUS), ['None', CHAT_NONE]]) {
  const all = [...list.map(s => [s, true]), ...(generated[intent] || []).map(s => [s, false])];
  for (const [s, written] of all) {
    if (written) hand++; else made++;
    for (const v of augment(s)) {
      const f = chatFeature(v);
      if (!f) continue;
      if (held.has(f)) { leaks++; continue; }
      const before = seen.get(f);
      if (before === intent) continue;
      if (before) { clash++; continue; }
      seen.set(f, intent); docs.push([f, intent]);
    }
  }
}

const container = await containerBootstrap();
container.use(Nlp); container.use(LangId);
const nlp = container.get('nlp');
nlp.settings.autoSave = false; nlp.settings.nlu = { log: false };
nlp.addLanguage('id');
for (const [f, intent] of docs) nlp.addDocument('id', f, intent);
const t0 = Date.now();
await nlp.train();
const full = nlp.export(true);

// Trim: the training sentences are not needed to classify.
const json = JSON.parse(full), dm = json.nluManager.domainManagers.id;
dm.sentences = []; json.nluManager.extraSentences = [];
const model = JSON.stringify(json);
const check = async text => {
  const a = await nlp.process('id', chatFeature(text));
  return `${a.intent}:${a.score.toFixed(4)}`;
};
const trimmed = (await containerBootstrap()); trimmed.use(Nlp); trimmed.use(LangId);
const small = trimmed.get('nlp'); small.settings.autoSave = false; small.settings.autoLoad = false; small.settings.nlu = { log: false };
small.import(model);
let same = 0, total = 0;
for (const f of readdirSync(bench).filter(f => /^(?:fixtures-heldout\d*|dialogs-(?:dev|heldout))\.mjs$/.test(f))) {
  const mod = await import(new URL(f, bench).href);
  const texts = [...(mod.cases || []).map(c => c.text), ...(mod.dialogs || []).flatMap(d => d.turns.map(t => t.text).filter(t => t !== '#save'))];
  for (const text of texts) { total++; const b = await small.process('id', chatFeature(text)); if (await check(text) === `${b.intent}:${b.score.toFixed(4)}`) same++; }
}
if (same !== total) { console.error(`Trimmed model differs on ${total - same} of ${total} test messages: not written.`); process.exit(1); }

writeFileSync(new URL('../lib/chat/chat-model.ts', import.meta.url), `/** Generated by scripts/build-chat-model.mjs — the serialized NLP.js chat intent model (do not edit). */\nexport default ${JSON.stringify(model)};\n`);
const intents = Object.keys(CHAT_CORPUS).length;
console.log(`Chat model: ${hand} written + ${made} generated sentences, ${docs.length} with variants, ${intents} intents; removed ${leaks} matching held-out tests and ${clash} under two intents; trained in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${(model.length / 1024).toFixed(1)} KB (full ${(full.length / 1024).toFixed(1)} KB, same answers on ${same}/${total} test messages).`);
