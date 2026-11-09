'use client';
/** 9.6 What the mini games show on the Arena card and panel (kept small: the games themselves load when opened). */
import { useApp } from '../app-provider';
import { openMinigame, useGame } from './game-store';
import { addDays, arcadeOf, arcadeXpLeft, ARCADE, canScratch, canSpin, coinXpLeft, goldenSpin, mondayOf, SCRATCH_PRIZES, scratchIndex, SPIN_PRIZES, spinIndex, spinRun } from '@/lib/game';
import type { MiniGameId } from './game-store';
import { play } from '@/lib/game-sound';
import { todayInTimeZone } from '@/lib/period';

/** Where the mini games are offered: in the Arena panel and on the Arena card. */
export function useMiniGameStatus() {
  const g = useGame(), { account, personalProfile } = useApp();
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  const s = g.state;
  if (!s || !account) return null;
  const lit = s.days.includes(today), spun = s.spinDay === today;
  const prize = spun ? SPIN_PRIZES[spinIndex(account.uid, today)] : null;
  const missionsDone = s.missionDay === today ? s.missionsDone.length : 0, missionsTotal = s.missionDay === today ? s.missionIds.length || 3 : 3;
  const scratched = s.scratchDay === today, scratchPrize = scratched ? SCRATCH_PRIZES[scratchIndex(account.uid, today)] : null;
  const match = arcadeOf(s, 'match'), shop = arcadeOf(s, 'shop');
  // 9.7 This week's scratch cards (Monday to Sunday) and the spin streak toward Roda Emas.
  const scratchedOn = new Set([...(s.scratchDays || []), s.scratchDay].filter(Boolean));
  const scratchWeek = Array.from({ length: 7 }, (_, k) => { const day = addDays(mondayOf(today), k); return { day, today: day === today, future: day > today, emoji: scratchedOn.has(day) ? SCRATCH_PRIZES[scratchIndex(account.uid, day)].emoji : null }; });
  const run = spinRun(s, today), golden = goldenSpin(s, today);
  return { lit, spun, ready: canSpin(s, today), prize, best: s.coinBest || 0, xpLeft: coinXpLeft(s, today),
    scratchReady: canScratch(s, today), scratched, scratchPrize, missionsDone, missionsTotal, scratchWeek, spinRun: run, golden,
    match: { best: match.best, top: match.top, xpLeft: arcadeXpLeft(s, 'match', today), cap: ARCADE.match.cap, missionDone: match.missionDay === today },
    shop: { best: shop.best, top: shop.top, xpLeft: arcadeXpLeft(s, 'shop', today), cap: ARCADE.shop.cap, missionDone: shop.missionDay === today } };
}
/** 9.7 Sent when a game started from the Arena's list closes: the Arena opens again at the list. */
export const ARENA_GAMES_EVENT = 'dompet-ajaib:arena-games';
let fromList = false;
export const launchMinigame = (kind: MiniGameId, before?: () => void) => {
  play('open'); fromList = Boolean(before);
  if (before) { before(); window.setTimeout(() => openMinigame(kind), 280); } else openMinigame(kind);
};
/** Closes the game on screen (and goes back to the Arena's list when it was started there). */
export const closeMinigame = () => {
  openMinigame(null);
  if (fromList) { fromList = false; window.setTimeout(() => window.dispatchEvent(new Event(ARENA_GAMES_EVENT)), 120); }
};

