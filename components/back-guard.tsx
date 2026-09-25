'use client';
import { useEffect, useRef } from 'react';

/**
 * The phone/browser back button walks back through the app instead of leaving it:
 * open popup → in-page step (e.g. a settings sub-page) → previous page → Beranda →
 * "press again to exit". One extra history entry (the guard) is kept on top; every
 * back press consumes it, we decide what to do, then put it back.
 */
const GUARD = 'dompetAjaibGuard';
const handlers: (() => void)[] = [];

/** Register an in-page back step (last registered runs first) while `active` is true. */
export function useBackHandler(active: boolean, handler: () => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active) return;
    const run = () => latest.current();
    handlers.push(run);
    return () => { const index = handlers.lastIndexOf(run); if (index >= 0) handlers.splice(index, 1); };
  }, [active]);
}

/** Close the top popup (dialog, sheet, confirm, dropdown) the same way Escape does. */
function closeOverlay() {
  const open = document.querySelector('.app-select-menu, [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  if (!open) return false;
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  return true;
}

/**
 * Mount once in the app shell. `onBack` handles page-level history and returns false
 * when there is nowhere left to go (already on Beranda); `onExitHint` shows the toast.
 */
export function useBackGuard(onBack: () => boolean, onExitHint: () => void) {
  const latest = useRef({ onBack, onExitHint });
  latest.current = { onBack, onExitHint };
  useEffect(() => {
    const arm = () => { if (!(history.state && history.state[GUARD])) history.pushState({ ...(history.state || {}), [GUARD]: true }, ''); };
    arm();
    let exitUntil = 0;
    const onPop = () => {
      if (closeOverlay()) { arm(); return; }
      const step = handlers[handlers.length - 1];
      if (step) { step(); arm(); return; }
      if (latest.current.onBack()) { arm(); return; }
      if (Date.now() < exitUntil) { history.back(); return; }
      exitUntil = Date.now() + 2000;
      latest.current.onExitHint();
      arm();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
