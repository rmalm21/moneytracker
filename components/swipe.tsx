'use client';
import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

const TRIGGER = 88;

/**
 * Touch swipe on a list row: left runs `onLeft` (delete), right runs `onRight` (edit).
 * Only touch/pen start a swipe, only a mostly-horizontal drag counts, so vertical
 * scrolling and taps behave as before.
 */
export function useSwipe({ onLeft, onRight }: { onLeft?: () => void; onRight?: () => void }) {
  const start = useRef<{ x: number; y: number; id: number; locked: boolean | null } | null>(null);
  const moved = useRef(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const enabled = Boolean(onLeft || onRight);

  function reset() { start.current = null; setDx(0); }
  const handlers = enabled ? {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === 'mouse' || leaving) return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, locked: null };
      moved.current = false;
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const s = start.current; if (!s || event.pointerId !== s.id) return;
      const x = event.clientX - s.x, y = event.clientY - s.y;
      if (s.locked === null) {
        if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
        s.locked = Math.abs(x) > Math.abs(y) * 1.3;
        if (!s.locked) { start.current = null; return; }
        try { event.currentTarget.setPointerCapture(s.id); } catch { /* Capture is optional. */ }
      }
      moved.current = true;
      let next = x;
      if (next < 0 && !onLeft) next = 0;
      if (next > 0 && !onRight) next = 0;
      const limit = TRIGGER * 1.4;
      if (Math.abs(next) > limit) next = Math.sign(next) * (limit + (Math.abs(next) - limit) * .25);
      setDx(next);
    },
    onPointerUp() {
      const s = start.current; if (!s) return;
      start.current = null;
      if (dx <= -TRIGGER && onLeft) { setLeaving(true); setDx(-window.innerWidth); setTimeout(() => { onLeft(); setLeaving(false); setDx(0); }, 180); return; }
      if (dx >= TRIGGER && onRight) { setDx(0); onRight(); return; }
      setDx(0);
    },
    onPointerCancel: reset,
    // A swipe must not also count as a tap on the row.
    onClickCapture(event: MouseEvent<HTMLElement>) { if (moved.current) { event.stopPropagation(); event.preventDefault(); moved.current = false; } },
  } : {};
  const side = dx < 0 ? 'left' : dx > 0 ? 'right' : '';
  return { handlers, dx, side, armed: Math.abs(dx) >= TRIGGER, dragging: Boolean(start.current?.locked), leaving };
}

/** The coloured action shown under the row while it is being swiped. */
export function SwipeUnder({ side, armed }: { side: string; armed: boolean }) {
  if (!side) return null;
  return <div className={`swipe-under is-${side} ${armed ? 'is-armed' : ''}`} aria-hidden="true">{side === 'left' ? <span><Trash2 size={18}/> Hapus</span> : <span><Pencil size={18}/> Ubah</span>}</div>;
}
