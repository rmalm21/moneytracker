/**
 * 9.9.2 Whether two saved values hold the same data. The account's copy comes back from Firestore with its fields in
 * another order than the one made on this phone, so a plain JSON.stringify comparison would call equal data different.
 * Fields that are undefined count as missing (Firestore drops them when saving).
 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(v => (v === undefined ? 'null' : stableJson(v))).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export const sameData = (a: unknown, b: unknown) => stableJson(a ?? null) === stableJson(b ?? null);

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
/**
 * 9.9.2 Three-way merge of saved data: what this phone changed (`mine` against `base`, the copy it started from) is put
 * on top of `theirs` (what the account holds now, maybe changed by another phone), field by field. Where both changed
 * the same field, this phone's value wins; everything else another phone did is kept.
 */
export function mergeChanges<T>(base: T, mine: T, theirs: T): T {
  if (sameData(mine, base)) return theirs;
  if (!isRecord(mine) || !isRecord(theirs)) return mine;
  const b: Record<string, unknown> = isRecord(base) ? base : {};
  const out: Record<string, unknown> = { ...theirs };
  for (const key of new Set([...Object.keys(b), ...Object.keys(mine)])) {
    if (sameData(mine[key], b[key])) continue;
    if (mine[key] === undefined) delete out[key];
    else out[key] = mergeChanges(b[key], mine[key], theirs[key]);
  }
  return out as T;
}

/** 9.9.2 The top-level fields `next` changed against `base` (for a write that leaves every other field as the account has it). */
export function changedFields<T extends object>(base: T | null, next: T): Partial<T> {
  if (!base) return next;
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) if (!sameData(next[key], base[key])) out[key] = next[key];
  return out;
}
