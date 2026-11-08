import { chromium } from '../fbtools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [throttle, threads] of [[1, 4], [1, 1], [4, 4]]) {
  const p = await browser.newPage();
  if (throttle > 1) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  await p.goto(`http://127.0.0.1:3091/?threads=${threads}`);
  await p.waitForFunction(() => document.getElementById('log').textContent.includes('DONE'), null, { timeout: 900000 });
  console.log(`--- cpu x${throttle}, threads ${threads}:`, (await p.locator('#log').innerText()).replace(/\n/g, ' | '));
  await p.close();
}
await browser.close();
