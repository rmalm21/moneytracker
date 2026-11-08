'use client';
/** 8.10 The events behind "Bisa dicoba di sini" (components/feature-tips.tsx), in a module with no runtime imports so
 * any component can use them without loading the card. */
import { useEffect, useRef } from 'react';
import type { TipPayload } from '@/lib/feature-tips';
export type { TipPayload };

export const TIP_USED = 'dompet-ajaib:feature-used', TIP_TRY = 'dompet-ajaib:feature-try';
/** A feature was really used (the card stops offering it). */
export function featureUsed(id: string) { try { window.dispatchEvent(new CustomEvent(TIP_USED, { detail: id })); } catch { /* not in a browser */ } }
/** Asks the page a tip lives on to start that feature, with what a suggestion knows. */
export function askToTry(id: string, payload?: TipPayload) { try { window.dispatchEvent(new CustomEvent(TIP_TRY, { detail: { id, payload } })); } catch { /* not in a browser */ } }
/** A page starts its own features when a tip is tapped: `{ home_layout: () => setCustomize(true) }`. */
export function useTipTry(handlers: Record<string, (payload?: TipPayload) => void>) {
  const ref = useRef(handlers); ref.current = handlers;
  useEffect(() => {
    const on = (event: Event) => { const d = (event as CustomEvent<{ id: string; payload?: TipPayload }>).detail; ref.current[d?.id]?.(d?.payload); };
    window.addEventListener(TIP_TRY, on); return () => window.removeEventListener(TIP_TRY, on);
  }, []);
}
/** Points at a button: scrolls to it and makes it glow for a moment. */
export function pulseElement(el: HTMLElement | null, scroll = true) {
  if (!el) return false;
  if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('ft-pulse'); void el.offsetWidth; el.classList.add('ft-pulse');
  window.setTimeout(() => el.classList.remove('ft-pulse'), 2600);
  return true;
}
