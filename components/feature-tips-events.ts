'use client';
/** 8.10 The events behind "Bisa dicoba di sini" (components/feature-tips.tsx), in a module with no imports so any
 * component can use them without loading the card. */
import { useEffect, useRef } from 'react';

export const TIP_USED = 'dompet-ajaib:feature-used', TIP_TRY = 'dompet-ajaib:feature-try';
/** A feature was really used (the card stops offering it). */
export function featureUsed(id: string) { try { window.dispatchEvent(new CustomEvent(TIP_USED, { detail: id })); } catch { /* not in a browser */ } }
/** Asks the page a tip lives on to start that feature. */
export function askToTry(id: string) { try { window.dispatchEvent(new CustomEvent(TIP_TRY, { detail: id })); } catch { /* not in a browser */ } }
/** A page starts its own features when a tip is tapped: `{ home_layout: () => setCustomize(true) }`. */
export function useTipTry(handlers: Record<string, () => void>) {
  const ref = useRef(handlers); ref.current = handlers;
  useEffect(() => {
    const on = (event: Event) => { const id = (event as CustomEvent<string>).detail; ref.current[id]?.(); };
    window.addEventListener(TIP_TRY, on); return () => window.removeEventListener(TIP_TRY, on);
  }, []);
}
