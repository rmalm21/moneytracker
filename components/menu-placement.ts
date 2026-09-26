'use client';
import { useEffect } from 'react';

/**
 * "Lainnya" menus (details.more-actions) open upwards when there is not enough room below them,
 * e.g. for the last wallet on a phone, where the bottom bar would cover the lower items.
 * The direction is chosen on the click that opens the menu, before it is drawn, so it never jumps.
 */
const ROW = 40, FRAME = 18;
function roomBelow() {
  const nav = document.querySelector<HTMLElement>('.bottom-nav');
  return nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : window.innerHeight;
}
function place(details: HTMLDetailsElement, height: number) {
  const box = details.getBoundingClientRect(), floor = roomBelow() - 8;
  const up = box.bottom + height + 6 > floor && box.top - height - 6 > 56;
  details.toggleAttribute('data-up', up);
}
export function useMenuPlacement() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const summary = (event.target as Element | null)?.closest?.('summary');
      const details = summary?.parentElement;
      if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('more-actions') || details.open) return;
      const items = details.querySelectorAll(':scope > .more-menu > *').length;
      place(details, items * ROW + FRAME);
    };
    // After opening, check again with the real height (e.g. items that wrap on two lines).
    const onToggle = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('more-actions') || !details.open) return;
      const menu = details.querySelector<HTMLElement>(':scope > .more-menu');
      if (menu) place(details, menu.offsetHeight);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('toggle', onToggle, true);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('toggle', onToggle, true); };
  }, []);
}
