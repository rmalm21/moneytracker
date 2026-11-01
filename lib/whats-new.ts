import type { Release } from './changelog.ts';

/**
 * "Apa yang baru" after an update (8.4): every release newer than the one whose changes this device last saw, newest
 * first. Someone last seen at 5.3 gets everything since 5.3. `seen` is the version the popup was last closed at, or for
 * devices from before 8.4 the version Pengaturan → Info aplikasi was last opened at. With nothing seen yet: the newest
 * release when the app was used on this device before (an update), nothing on a first visit.
 */
export function unseenReleases(releases: Release[], current: string, seen: string | null, usedBefore: boolean): Release[] {
  if (seen === current) return [];
  if (!seen) return usedBefore ? releases.slice(0, 1) : [];
  const at = releases.findIndex(release => release.version === seen);
  return at < 0 ? releases.slice(0, 1) : releases.slice(0, at);
}
