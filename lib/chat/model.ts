/**
 * The chat intent model (NLP.js, trained at build time by scripts/build-chat-model.mjs): loaded once, when the chat is
 * first used, and run on the device. It only gives a second opinion for sentences the rules in lib/chat/engine.ts do
 * not catch.
 */
import model from './chat-model.ts';
import { chatFeature, type ChatModelIntent } from './feature.ts';

type NlpLike = { import(json: string): void; process(locale: string, text: string): Promise<{ intent: string; score: number }>; settings: Record<string, unknown> };
let loading: Promise<NlpLike> | null = null;

export function loadChatModel(): Promise<NlpLike> {
  return loading ||= (async () => {
    const [{ containerBootstrap }, { Nlp }, { LangId }] = await Promise.all([import('@nlpjs/core'), import('@nlpjs/nlp'), import('@nlpjs/lang-id')]);
    const container = await containerBootstrap();
    container.use(Nlp); container.use(LangId);
    const nlp = container.get('nlp') as NlpLike;
    nlp.settings.autoSave = false; nlp.settings.autoLoad = false; nlp.settings.nlu = { log: false };
    nlp.import(model);
    return nlp;
  })();
}

/** The most likely intent and its score, or null (nothing above "None"). */
export async function classifyChat(text: string): Promise<{ intent: ChatModelIntent; score: number } | null> {
  try {
    const nlp = await loadChatModel();
    const r = await nlp.process('id', chatFeature(text));
    return r.intent && r.intent !== 'None' ? { intent: r.intent as ChatModelIntent, score: r.score } : null;
  } catch { return null; }
}
