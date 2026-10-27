/**
 * Catat otomatis V3 — Engine B: NLP.js, a second, independent local reading of the sentence.
 *
 * It runs on the device only (no network, no cloud model): the intent model is trained once at build time
 * (scripts/build-nlp-model.mjs → nlp-model.ts) and imported; the person's own entities (wallets, known places, people
 * from their records) are registered at run time as NER options, so nothing personal is in the source or the model.
 *
 * Its output is evidence only, in an engine-neutral shape (SemanticEngineResult): it never writes a transaction and
 * never decides money, dates or direction. The consensus in lib/catat/v3.ts weighs it per role.
 */
import { containerBootstrap } from '@nlpjs/core';
import { Nlp } from '@nlpjs/nlp';
import { LangId } from '@nlpjs/lang-id';
import model from './nlp-model.ts';
import { KIND_TO_INTENT, type NlpIntent } from './nlp-corpus.ts';
import { knownPlaces, type QuickContext } from '../quick-entry.ts';

export type SemanticEntityType = 'WALLET' | 'MERCHANT' | 'PERSON' | 'AMOUNT';
export type SemanticEntity = { type: SemanticEntityType; value: string; id?: string; rawText: string; start: number; end: number; confidence: number };
export type SemanticEngineResult = {
  engineId: 'nlpjs';
  intentCandidates: { intent: NlpIntent; score: number }[];
  entityCandidates: SemanticEntity[];
  /** Processing time of this call, and of the one-time model load. */
  ms: number; loadMs?: number;
};

type NlpLike = { import(json: string): void; process(locale: string, text: string): Promise<{ intent: string; score: number; classifications?: { intent: string; score: number }[] }>; ner: { process(input: { locale: string; utterance: string; threshold?: number }): Promise<{ entities: { entity: string; option: string; start: number; end: number; accuracy: number }[] }>; settings: Record<string, unknown> }; addNerRuleOptionTexts(locale: string, entity: string, option: string, texts: string[]): void; addNerRegexRule(locale: string, entity: string, re: RegExp): void; settings: Record<string, unknown> };
let loaded: { nlp: NlpLike; signature: string; loadMs: number } | null = null;

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
function signatureOf(ctx: QuickContext) {
  return JSON.stringify([ctx.wallets.filter(w => !w.isArchived).map(w => w.name), [...knownPlaces(ctx).keys()].length, (ctx.debts || []).map(d => d.provider), (ctx.receivables || []).map(r => r.person), ctx.merchants || []]);
}

/** The engine for this person's entities (the model is loaded once; entities are re-registered when they change). */
async function engine(ctx: QuickContext): Promise<{ nlp: NlpLike; loadMs: number }> {
  const signature = signatureOf(ctx);
  if (loaded && loaded.signature === signature) return loaded;
  const t0 = performance.now();
  const container = await containerBootstrap();
  container.use(Nlp); container.use(LangId);
  const nlp = container.get('nlp') as NlpLike;
  nlp.settings.autoSave = false; nlp.settings.autoLoad = false; nlp.settings.nlu = { log: false };
  nlp.import(model);
  // The person's own entities: configured wallets (with the usual aliases), known places, people in the records.
  for (const w of ctx.wallets.filter(x => !x.isArchived)) {
    const name = lower(w.name), texts = [name, name.replace(/\s+/g, ''), ...(/^(cash|tunai)$/.test(name) ? ['cash', 'tunai'] : [])];
    nlp.addNerRuleOptionTexts('id', 'wallet', w.id, [...new Set(texts)]);
  }
  const places = new Map<string, string[]>();
  for (const [key, name] of knownPlaces(ctx)) places.set(name, [...(places.get(name) || []), key]);
  for (const [name, keys] of places) nlp.addNerRuleOptionTexts('id', 'merchant', name, [...new Set(keys.filter(k => k.length >= 3))]);
  for (const person of new Set([...(ctx.debts || []).map(d => d.provider), ...(ctx.receivables || []).map(r => r.person)].filter(Boolean))) nlp.addNerRuleOptionTexts('id', 'person', person, [lower(person)]);
  nlp.addNerRegexRule('id', 'money', /(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta)\b/gi);
  loaded = { nlp, signature, loadMs: performance.now() - t0 };
  return loaded;
}

/** One sentence (or clause) read by NLP.js, as evidence. */
export async function analyzeSemantics(text: string, ctx: QuickContext): Promise<SemanticEngineResult> {
  const { nlp, loadMs } = await engine(ctx);
  const t0 = performance.now();
  const utterance = lower(text);
  const [intent, ner] = await Promise.all([nlp.process('id', utterance), nlp.ner.process({ locale: 'id', utterance, threshold: 0.8 })]);
  const intentCandidates = (intent.classifications?.length ? intent.classifications : [{ intent: intent.intent, score: intent.score }])
    .filter(c => c.intent && c.intent !== 'None').map(c => ({ intent: c.intent as NlpIntent, score: c.score })).sort((a, b) => b.score - a.score).slice(0, 3);
  const types: Record<string, SemanticEntityType> = { wallet: 'WALLET', merchant: 'MERCHANT', person: 'PERSON', money: 'AMOUNT' };
  const entityCandidates: SemanticEntity[] = ner.entities.filter(e => types[e.entity]).map(e => {
    const rawText = utterance.slice(e.start, e.end + 1);
    const type = types[e.entity];
    const wallet = type === 'WALLET' ? ctx.wallets.find(w => w.id === e.option) : undefined;
    return { type, value: wallet ? wallet.name : e.option || rawText, ...(wallet ? { id: wallet.id } : {}), rawText, start: e.start, end: e.end + 1, confidence: e.accuracy ?? 1 };
  });
  return { engineId: 'nlpjs', intentCandidates, entityCandidates, ms: performance.now() - t0, loadMs };
}

const INTENT_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_INTENT).map(([k, v]) => [v, k])) as Record<NlpIntent, string>;
export const kindOfIntent = (intent?: NlpIntent) => (intent ? INTENT_TO_KIND[intent] : undefined);

/** Benchmark mode C: what NLP.js alone would produce (no grammar, no validation) — to measure its evidence quality. */
export async function nlpOnlyActions(text: string, ctx: QuickContext) {
  const r = await analyzeSemantics(text, ctx);
  const kind = kindOfIntent(r.intentCandidates[0]?.intent);
  if (!kind) return [];
  const money = r.entityCandidates.find(e => e.type === 'AMOUNT');
  const amount = money ? (() => { const m = money.rawText.match(/(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/); if (!m) return undefined; const n = Number(m[1].replace(',', '.')); return Math.round(n * (/jt|juta/.test(m[2] || '') ? 1e6 : /k|rb|ribu/.test(m[2] || '') ? 1e3 : 1)); })() : undefined;
  const wallets = r.entityCandidates.filter(e => e.type === 'WALLET');
  const merchant = r.entityCandidates.find(e => e.type === 'MERCHANT');
  const person = r.entityCandidates.find(e => e.type === 'PERSON');
  return [{ kind, amount, date: ctx.today, wallet: wallets[0]?.id, to: kind === 'transfer' ? wallets[1]?.id : undefined, link: undefined, category: undefined, person: person?.value, description: undefined, merchant: merchant?.value, flagged: new Set<string>(), confident: true, ask: undefined }];
}
