/**
 * Builds a minimarket benchmark set outside the repository: the receipts of receipts.mjs printed flat in Chromium
 * (with every word's box), then photographed by photo.py (curl, tilt, fade, shadow, blur, JPEG).
 * Usage: MINI_DIR=/tmp/mini node bench/minimarket/build.mjs <set> <seed> <count> [dev|train|hold]
 * Output, in the format of bench/cord/convert.py: <MINI_DIR>/<set>/<id>.jpg, <set>.json (truth), <set>-lines.json.
 * Needs Playwright (PLAYWRIGHT_MODULE) and Python with numpy, scipy and Pillow (PYTHON).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeSet, rng } from './receipts.mjs';

const [set, seed = '1', count = '60', split = 'dev'] = process.argv.slice(2);
const dir = process.env.MINI_DIR || '/tmp/mini', flat = path.join(dir, 'flat', set);
fs.mkdirSync(flat, { recursive: true }); fs.mkdirSync(path.join(dir, set), { recursive: true });
const receipts = makeSet(set, +seed, +count, split), r = rng(+seed * 7 + 3);
const FONTS = [['DejaVu Sans Mono', 'normal'], ['Liberation Mono', 'bold'], ['FreeMono', 'bold'], ['Courier 10 Pitch', 'bold'], ['JetBrains Mono', 'normal'], ['Unifont', 'normal'], ['DejaVu Sans Mono', 'bold']];
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 900 } });
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const words = {};
for (const receipt of receipts) {
  const [font, weight] = FONTS[Math.floor(r() * FONTS.length)];
  const body = receipt.lines.map((l, i) => `<div class="${l.kind}" data-row="${i}">${esc(l.kind === 'l' || l.kind === 'bold' ? l.text : l.text.trim()).replace(/\S+/g, w => `<span>${w}</span>`)}</div>`).join('');
  await page.setContent(`<style>body{margin:0;background:#777}
    .paper{display:inline-block;padding:${28 + Math.floor(r() * 30)}px ${14 + Math.floor(r() * 16)}px;background:#fbfaf6;color:#151515;font:${weight} ${font === 'Unifont' ? 24 : 20}px/${(1.15 + r() * .3).toFixed(2)} '${font}'}
    .l,.bold{white-space:pre}.bold{font-weight:bold}.head,.big{white-space:pre;text-align:center;font-weight:bold}.big{font-size:1.6em;line-height:1.3}
  </style><div class="paper">${body}</div>`);
  const paper = await page.$('.paper');
  const info = await page.evaluate(() => {
    const p = document.querySelector('.paper').getBoundingClientRect(), dpr = window.devicePixelRatio;
    const words = [...document.querySelectorAll('.paper span')].map(s => { const b = s.getBoundingClientRect(); return { text: s.textContent, row: +s.parentElement.dataset.row, box: [b.left - p.left, b.top - p.top, b.right - p.left, b.bottom - p.top].map(v => Math.round(v * dpr)) }; });
    return { w: Math.round(p.width * dpr), h: Math.round(p.height * dpr), words };
  });
  await page.setViewportSize({ width: 900, height: Math.ceil(info.h / 2) + 20 });
  await paper.screenshot({ path: path.join(flat, `${receipt.id}.png`) });
  words[receipt.id] = info;
}
await browser.close();
fs.writeFileSync(path.join(flat, 'words.json'), JSON.stringify(words));
fs.writeFileSync(path.join(dir, `${set}.json`), JSON.stringify(Object.fromEntries(receipts.map(x => [`${x.id}.jpg`, x.truth])), null, 1));
fs.writeFileSync(path.join(dir, `${set}-text.txt`), receipts.map(x => `===== ${x.id} (${x.style})\n${x.lines.map(l => l.text).join('\n')}`).join('\n'));
execFileSync(process.env.PYTHON || 'python3', ['-I', path.join(path.dirname(new URL(import.meta.url).pathname), 'photo.py'), flat, path.join(dir, set), path.join(dir, `${set}-lines.json`), String(seed)], { stdio: 'inherit' });
console.log(`${receipts.length} receipts in ${path.join(dir, set)}`);
