// Run with Playwright and the demo account in the Firebase emulator, against a production build served statically:
//   BASE=http://localhost:3001 NAME=8.5 node bench/v85/perf-timeline.mjs
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3001', ver = process.env.VER || '8.4.1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(v => { try { localStorage.setItem('dompet-ajaib:whats-new-seen', v); localStorage.setItem('dompet-ajaib:about-seen', v); } catch {}
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {} }, ver);
const p = await c.newPage();
await p.goto(`${base}/login/`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000);
await p.fill('input[autocomplete=username]', 'tes@gmail.com'); await p.fill('input[autocomplete=current-password]', 'password123'); await p.getByRole('button', { name: 'Masuk', exact: true }).click();
await p.waitForSelector('.home-dash', { timeout: 180000 }); await p.waitForTimeout(4000);
const cdp = await c.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const res = {};
for (let k = 0; k < Number(process.env.RUNS || 5); k++) for (const [from, fromSel, to, toSel] of [['Transaksi', '.transaction-row', 'Beranda', '.home-dash'], ['Beranda', '.home-dash', 'Transaksi', '.transaction-row']]) {
  await p.locator('nav').getByText(from, { exact: true }).first().click(); await p.waitForSelector(fromSel); await p.waitForTimeout(2500);
  await p.evaluate(([to, sel]) => { window.__lt = []; window.__marks = {}; const btn = [...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === to);
    const mo = new MutationObserver(() => { if (!window.__marks.dom && document.querySelector(sel)) { window.__marks.dom = performance.now(); requestAnimationFrame(() => { window.__marks.frame = performance.now(); }); } }); mo.observe(document.body, { subtree: true, childList: true });
    window.__marks.click = performance.now(); btn.click(); }, [to, toSel]);
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => ({ m: window.__marks, lt: window.__lt }));
  const t0 = r.m.click, tasks = r.lt.filter(t => t.start >= t0 - 5);
  (res[`${from} → ${to}`] ||= []).push({ paint: r.m.frame - t0, first: tasks[0] ? tasks[0].dur : 0, max: Math.max(0, ...tasks.map(t => t.dur)), tbt: tasks.reduce((n, t) => n + Math.max(0, t.dur - 50), 0) });
}
const med = (xs, k) => { const v = xs.map(x => x[k]).sort((a, b) => a - b); return Math.round(v[Math.floor(v.length / 2)]); };
for (const [k, xs] of Object.entries(res)) console.log(`${process.env.NAME || base} ${k.padEnd(22)} tampil ${med(xs, 'paint')} ms · tugas terpanjang ${med(xs, 'max')} ms · total blokir ${med(xs, 'tbt')} ms  (tampil: ${xs.map(x => Math.round(x.paint)).join('/')})`);
await browser.close();
