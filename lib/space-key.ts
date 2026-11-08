/**
 * 9.0 Ruang Bersama: where a set of records lives. Someone's own records are keyed by their uid (users/{uid}); a
 * shared space by "space:{id}" (spaces/{id}). Every data function takes this key, so the same screens work on both.
 */
export const SPACE_PREFIX = 'space:';
export const isSpaceKey = (key: string) => key.startsWith(SPACE_PREFIX);
export const spaceKey = (id: string) => SPACE_PREFIX + id;
export const spaceIdOf = (key: string) => key.slice(SPACE_PREFIX.length);
/** Firestore path of the records' root document: ['users', uid] or ['spaces', id]. */
export function rootSegments(key: string): [string, string] { return isSpaceKey(key) ? ['spaces', spaceIdOf(key)] : ['users', key]; }

/** Who is writing (the signed-in person), so shared records say who added or changed them. */
export type Actor = { uid: string; name: string };
let actor: Actor | null = null;
export function setActor(next: Actor | null) { actor = next; }
export function currentActor() { return actor; }
/** Fields marking who added or changed a shared record (nothing on someone's own records). */
export function stamp(key: string, created: boolean): Record<string, string> {
  if (!isSpaceKey(key) || !actor) return {};
  return { ...(created ? { createdBy: actor.uid, createdByName: actor.name } : {}), updatedBy: actor.uid, updatedByName: actor.name };
}
