import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// 10.4.1 "Beranda & Dompet" hides the Beranda page, the Dompet page and the windows of the Dompet menu, wherever they
// are opened. The rule is checked in the app (emulator); these keep its two halves from drifting apart.
test('10.4.1: which window is hidden does not depend on the page behind it', () => {
  const src = read('components/hide-amounts.tsx');
  assert.match(src, /const HOME = '\.home-dash, main\[data-view="wallets"\], \[data-hide-with="wallets"\]'/);
  assert.match(src, /const hides = \(el: Element\) => level === 'ketat' \|\| !!el\.closest\(HOME\);/);
  assert.doesNotMatch(src, /viewBehind|openedFromHome/);
  // Switching pages updates what stays on screen.
  assert.match(src, /attributeFilter: \[\.\.\.ATTRS, 'data-view'\]/);
});

test('10.4.1: every window of the Dompet menu is marked, and only those', () => {
  const marked = {
    'components/identity-views.tsx': ["title={editing?'Ubah dompet':'Tambah dompet'}", 'title={w.name} className="wallet-detail-dialog"'],
    'components/pockets.tsx': ['className="pocket-dialog"'],
    'components/wallet-portions.tsx': ['`Pisahkan isi ${wallet.name}`'],
    'components/wallet-interest.tsx': ['title="Bunga saldo"'],
    'components/wallet-controls.tsx': ["'Cocokkan saldo'"],
    'components/wallet-delete.tsx': ['title={`Hapus ${wallet.name}?`}'],
  };
  let count = 0;
  for (const [file, windows] of Object.entries(marked)) {
    const lines = read(file).split('\n');
    for (const piece of windows) {
      const line = lines.find(l => l.includes(piece) && l.includes('<DialogContent'));
      assert.ok(line, `${file}: ${piece}`);
      const at = line.indexOf(piece), open = line.lastIndexOf('<DialogContent', at);
      assert.ok(line.slice(open, at).includes('hideWith="wallets"'), `${file}: ${piece} hidden with Dompet`);
      count++;
    }
  }
  // Windows opened from anywhere stay unmarked: their amounts show at "Beranda & Dompet" wherever they are opened.
  for (const file of ['components/transaction-form.tsx', 'app/page.tsx', 'components/notifications.tsx']) {
    try { assert.doesNotMatch(read(file), /hideWith=/, file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  assert.equal(count, 7);
});
