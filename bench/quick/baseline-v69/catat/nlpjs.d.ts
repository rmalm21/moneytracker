/** NLP.js ships without type declarations; Engine B (nlp-engine.ts) types what it uses itself. */
declare module '@nlpjs/core' { export function containerBootstrap(...args: unknown[]): Promise<{ use(plugin: unknown): void; get(name: string): unknown }>; }
declare module '@nlpjs/nlp' { export const Nlp: unknown; }
declare module '@nlpjs/lang-id' { export const LangId: unknown; }
