// Cognitive-load audit: same script before (4.10) and after (5.0). Usage: S=… LABEL=before node measure.mjs
import { chromium } from '../fbtools/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const S = process.env.S, LABEL = process.env.LABEL || 'before', out = `${S}/v5/${LABEL}`; mkdirSync(out, { recursive: true });
const USERS = (process.env.USERS || 'rama,budi').split(',');
const PAGES = (process.env.PAGES || 'dashboard,transactions,wallets,budgets,claims,debts,receivables,splitbill,funds,wishlist,recurring,upcoming,calendar,advisor,analytics,report,health,settings,help').split(',');
const SIZES = (process.env.SIZES || 'mobile,desktop').split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const results = [];
const measure = () => {
  const vh = innerHeight, chrome = el => el.closest('.bottom-nav,.topbar,.sidebar,.hub-tabs');
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && !el.closest('[hidden],[aria-hidden="true"]') && el.checkVisibility?.() !== false; };
  const inView = el => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0; };
  const scope = document.querySelector('[role="dialog"]') || document.querySelector('main.content') || document.body;
  const all = sel => [...scope.querySelectorAll(sel)].filter(el => vis(el) && !chrome(el));
  const count = (list, first) => first ? list.filter(inView).length : list.length;
  const actions = all('button, a[href], summary, [role="button"], [role="tab"], select, input:not([type="hidden"])');
  const cardSel = '.panel, .card, [class*="-card"], .widget-slot, .glass, .tile';
  const cardsAll = all(cardSel).filter(el => !el.parentElement.closest(cardSel));
  const badges = all('[class*="badge"], [class*="chip"], [class*="pill"], .tag, [class*="status-"]').filter(el => !el.matches('button'));
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT); const amounts = []; let node;
  while ((node = walker.nextNode())) { const t = node.textContent; const m = t.match(/(?:-|\+)?Rp\s?[\d.,]+(?:\s?(?:jt|rb|M))?|\b\d{1,3}%/g); if (m && node.parentElement && vis(node.parentElement) && !chrome(node.parentElement)) for (let i = 0; i < m.length; i++) amounts.push(node.parentElement); }
  const big = all('*').filter(el => { const s = getComputedStyle(el); return parseFloat(s.fontSize) >= 22 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); });
  const heads = all('h1,h2,h3,h4,summary strong,.widget-head strong,legend,[class*="title"]').map(el => el.textContent.trim().slice(0, 40)).filter(Boolean);
  const headsFirst = all('h1,h2,h3,h4,summary strong,.widget-head strong,legend,[class*="title"]').filter(inView).map(el => el.textContent.trim().slice(0, 40)).filter(Boolean);
  return {
    first: { actions: count(actions, 1), cards: count(cardsAll, 1), amounts: amounts.filter(inView).length, badges: count(badges, 1), concepts: new Set(headsFirst).size, emphasis: big.filter(inView).length },
    page: { actions: actions.length, cards: cardsAll.length, amounts: amounts.length, badges: badges.length, concepts: new Set(heads).size, emphasis: big.length, scroll: +(document.documentElement.scrollHeight / vh).toFixed(1) },
  };
};
for (const user of USERS) for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: size === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 860 }, deviceScaleFactor: size === 'mobile' ? 2 : 1 });
  await ctx.addInitScript(() => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important} *{animation-duration:0s!important;transition-duration:0s!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
  // The one-time 5.0 orientation is a dialog, not a page: mark it seen so every page is measured as itself.
  await ctx.addInitScript(u => { try { const k = `dompet-ajaib:usage:demo-${u}`; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.seen = [...new Set([...(v.seen || []), 'orientation-5.0'])]; localStorage.setItem(k, JSON.stringify(v)); } catch {} }, user);
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/login/');
  await page.fill('input[autocomplete=username]', `${user}@gmail.com`); await page.fill('input[autocomplete=current-password]', 'password123');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForSelector('.home-dash', { timeout: 180000 }); await page.waitForTimeout(2500);
  for (const view of PAGES) {
    const t0 = Date.now();
    if (view === 'dashboard') await page.goto('http://localhost:3000/'); else await page.goto(`http://localhost:3000/?view=${view}`);
    await page.waitForSelector('.home-dash, main.content', { timeout: 60000 }); await page.waitForTimeout(2600);
    while (await page.locator('.heads-up-close').count()) { await page.locator('.heads-up-close').first().click().catch(() => {}); await page.waitForTimeout(150); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
    const m = await page.evaluate(measure);
    results.push({ user, size, view, ms: Date.now() - t0, ...m });
    await page.screenshot({ path: `${out}/${user}-${size}-${view}.png` });
    console.log(user, size, view, JSON.stringify(m.first), 'page', JSON.stringify(m.page));
  }
  if (size === 'mobile') { // the "Lainnya" menu
    await page.goto('http://localhost:3000/'); await page.waitForSelector('.home-dash'); await page.waitForTimeout(2000);
    await page.locator('.bottom-nav button[aria-label="Lainnya"]').click(); await page.waitForTimeout(800);
    const m = await page.evaluate(measure); results.push({ user, size, view: 'more', ...m });
    await page.screenshot({ path: `${out}/${user}-${size}-more.png` }); console.log(user, size, 'more', JSON.stringify(m.first), 'page', JSON.stringify(m.page));
  }
  await ctx.close();
}
writeFileSync(`${out}/metrics.json`, JSON.stringify(results, null, 1));
await browser.close();
