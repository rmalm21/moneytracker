/**
 * Renders the benchmark receipts (fixtures.mjs) as phone-like JPEG photos in bench/receipts/out/, with truth.json.
 * Usage: node bench/receipts/generate.mjs   (needs Playwright; set PLAYWRIGHT_MODULE to its index.mjs if it is not
 * installed in this project, and CHROMIUM to a Chromium binary when Playwright has none of its own).
 * The output is not committed; it is the same every run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { receipts, conditions, plan } from './fixtures.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), out = path.join(here, 'out');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const truth = {};
for (const receipt of receipts) for (const name of plan[receipt.id]) {
  const c = conditions[name], id = `${receipt.id}-${name}`;
  const rows = receipt.rows.map(([kind, a = '', b = '']) => kind === '-' ? '<div class="c">- - - - - - - - - - - - - - - - - -</div>' : kind === 'c' || kind === 'l' ? `<div class="${kind}">${esc(a).replace(/ {2,}/g, m => '&nbsp;'.repeat(m.length))}</div>` : `<div class="row ${kind === 'b' ? 'bold' : ''}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('');
  const long = receipt.rows.length > 30;
  const transform = c.transform || `rotate(${c.rotate || 0}deg) scale(${(c.scale || 1) * (long ? .78 : 1)})`;
  await page.setViewportSize({ width: 1200, height: long ? 2400 : 1600 });
  await page.setContent(`<style>
    body{margin:0;height:100vh;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 30% 20%,#7a6a58,#4b3f33 70%);}
    .paper{position:relative;width:560px;padding:44px 36px;background:linear-gradient(180deg,#f7f5ee,#efebe0 55%,#f5f2e8);font:24px/1.5 'DejaVu Sans Mono',monospace;color:${c.ink || '#262626'};transform:${transform};box-shadow:0 24px 50px rgba(0,0,0,.45);filter:${c.filter || 'contrast(.95)'}}
    .c{text-align:center}.l{white-space:pre}.row{display:flex;justify-content:space-between;gap:16px}.bold{font-weight:bold}
    .over{position:absolute;inset:0;background:${c.overlay || 'none'};pointer-events:none}
  </style><div class="paper">${rows}<div class="over"></div></div>`);
  await page.screenshot({ path: path.join(out, `${id}.jpg`), type: 'jpeg', quality: c.quality || 78 });
  truth[id] = { ...receipt.truth, type: receipt.type, receipt: receipt.id, condition: name };
}
fs.writeFileSync(path.join(out, 'truth.json'), JSON.stringify(truth, null, 1));
console.log(`${Object.keys(truth).length} photos in ${out}`);
await browser.close();
