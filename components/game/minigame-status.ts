'use client';
/** 9.6 What the mini games show on the Arena card and panel (kept small: the games themselves load when opened). */
import { useApp } from '../app-provider';
import { openMinigame, useGame } from './game-store';
import { canSpin, coinXpLeft, SPIN_PRIZES, spinIndex } from '@/lib/game';
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
  return { lit, spun, ready: canSpin(s, today), prize, best: s.coinBest || 0, xpLeft: coinXpLeft(s, today) };
}
export const launchMinigame = (kind: 'spin' | 'coin', before?: () => void) => {
  play('open');
  if (before) { before(); window.setTimeout(() => openMinigame(kind), 280); } else openMinigame(kind);
};

