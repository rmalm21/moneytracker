// Opening the app again (signed in, files cached like an installed app): reload → Beranda on screen, CPU slowed 4×.
// Run with Playwright and the demo account in the Firebase emulator, against a production build served statically:
//   BASE=http://localhost:3001 NAME=8.6 LAT=150 node bench/v86/perf-coldstart.mjs
import { chromium } from 'playwright';
const base = process.env.BASE || 'http://localhost:3001', ver = process.env.VER || '8.5', runs = Number(process.env.RUNS || 5);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
await c.addInitScript(v => { try { localStorage.setItem('dompet-ajaib:whats-new-seen', v); localStorage.setItem('dompet-ajaib:about-seen', v); localStorage.setItem('dompet-ajaib:rekap-seen:2026-10', '1'); } catch {}
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  window.__home = 0; const mo = new MutationObserver(() => { if (!window.__home && document.querySelector('.home-dash .home-hero')) { window.__home = performance.now(); } }); document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { subtree: true, childList: true })); }, ver);
const p = await c.newPage();
await p.goto(`${base}/login/`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000);
await p.fill('input[autocomplete=username]', 'tes@gmail.com'); await p.fill('input[autocomplete=current-password]', 'password123'); await p.getByRole('button', { name: 'Masuk', exact: true }).click();
await p.waitForSelector('.home-dash', { timeout: 180000 }); await p.waitForTimeout(5000);
const cdp = await c.newCDPSession(p);
const res = [];
for (let i = 0; i < runs; i++) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const lat = Number(process.env.LAT || 0); if (lat) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: lat, downloadThroughput: -1, uploadThroughput: -1 }); }
  await p.goto(`${base}/`, { waitUntil: 'commit' }).catch(() => {});
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.waitForSelector('.home-dash .home-hero', { timeout: 120000 }); await p.waitForTimeout(6000);
  const r = await p.evaluate(() => ({ home: window.__home, lt: window.__lt, js: performance.getEntriesByType('resource').filter(e => e.initiatorType === 'script' && e.startTime < window.__home).reduce((n, e) => n + (e.decodedBodySize || 0), 0) }));
  const before = r.lt.filter(t => t.start < r.home);
  res.push({ home: r.home, blockBefore: before.reduce((n, t) => n + t.dur, 0), longest: Math.max(0, ...r.lt.map(t => t.dur)), after: r.lt.filter(t => t.start >= r.home).reduce((n, t) => n + Math.max(0, t.dur - 50), 0), js: r.js });
}
const med = k => { const v = res.map(x => x[k]).sort((a, b) => a - b); return Math.round(v[Math.floor(v.length / 2)]); };
console.log(`${process.env.NAME || base}: Beranda tampil ${med('home')} ms · tugas panjang sebelum tampil ${med('blockBefore')} ms · tugas terpanjang ${med('longest')} ms · blokir sesudah tampil ${med('after')} ms · JS dimuat sebelum tampil ${Math.round(med('js') / 1024)} KB  (tampil: ${res.map(x => Math.round(x.home)).join('/')})`);
await browser.close();
