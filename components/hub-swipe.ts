'use client';
import { useRef, useState, type TouchEvent } from 'react';
import { hubOf } from './hubs';

/** Things that keep their own horizontal gestures: never switch tabs when a swipe starts on them. */
const OWN_GESTURES = 'input, textarea, select, [contenteditable], .transaction-row, .hub-tabs, .ins-tabs, .wallet-tabs, .segmented, .recharts-wrapper, .chart-box, .modal-content, .sort-handle, .quick-actions, [data-no-hub-swipe]';

function scrollsSideways(element: Element | null) {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 4) return true;
  }
  return false;
}

/**
 * Phones: swipe left/right on a page that belongs to a hub (Laporan, Jadwal, Utang & Piutang)
 * to move to the next/previous tab. Only quick, clearly horizontal swipes count.
 */
export function useHubSwipe(view: string, onSelect: (key: string) => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [direction, setDirection] = useState<'left' | 'right' | ''>('');
  const hub = hubOf(view);
  const handlers = hub ? {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      start.current = null;
      if (event.touches.length !== 1 || !window.matchMedia('(max-width: 760px)').matches) return;
      const target = event.target as Element;
      if (target.closest(OWN_GESTURES) || scrollsSideways(target)) return;
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const s = start.current; start.current = null;
      if (!s || !hub) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - s.x, dy = touch.clientY - s.y, dt = event.timeStamp - s.t;
      if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const keys = hub.tabs.map(([key]) => key), index = keys.indexOf(view);
      const next = keys[index + (dx < 0 ? 1 : -1)];
      if (!next) return;
      setDirection(dx < 0 ? 'left' : 'right');
      window.setTimeout(() => setDirection(''), 450);
      onSelect(next);
    },
  } : {};
  return { handlers, direction };
}
