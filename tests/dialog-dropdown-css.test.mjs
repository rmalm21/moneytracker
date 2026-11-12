import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 9.10 Guard for the 9.9 bug where no dropdown inside a form could be tapped. A dropdown opened inside a dialog is drawn
// inside that dialog (components/ui/app-select.tsx), and the dialog takes taps while the rest of the page does not. A
// stylesheet rule that switches off taps on every dropdown while a dialog is open therefore switches off the very
// dropdowns of the open form. Only a dropdown drawn straight on the page (a direct child of <body>) may be switched off.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors.split(',').map(s => s.trim()), body }));

test('no rule switches off taps on the dropdowns inside a dialog', () => {
  const offending = [];
  for (const { selectors, body } of rules) {
    if (!/pointer-events\s*:\s*none/.test(body)) continue;
    for (const s of selectors) {
      if (!/\.app-select-(menu|option)\b/.test(s)) continue;
      // Allowed: the menu itself only as a direct child of <body> (a dropdown on the page, not in a dialog).
      if (/body\[[^\]]*\]\s*>\s*\.app-select-menu$/.test(s)) continue;
      offending.push(s);
    }
  }
  assert.deepEqual(offending, [], `these selectors make dropdown menus in forms untappable: ${offending.join(' | ')}`);
});

test('the dialog layer itself is never switched off', () => {
  for (const { selectors, body } of rules) {
    if (!/pointer-events\s*:\s*none/.test(body)) continue;
    for (const s of selectors) assert.ok(!/(^|[\s>])\.(app-dialog|modal-content)$/.test(s) || /:has\(~ \.modal-content\)/.test(s), `a dialog is switched off by: ${s}`);
  }
});
