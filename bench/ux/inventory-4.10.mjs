/**
 * Freezes the 4.10 capability inventory straight from the 4.10 source (git commit 5853ffe), so the 5.0 release gate
 * can prove nothing disappeared:  node bench/ux/inventory-4.10.mjs  → bench/ux/inventory-4.10.json
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const show = f => execSync(`git show 5853ffe:${f}`, { encoding: 'utf8', maxBuffer: 1 << 26 });
const page = show('app/page.tsx'), hubs = show('components/hubs.tsx'), mobile = show('components/mobile-navigation.tsx'), settings = show('components/settings.tsx'), dash = show('components/dashboard-home.tsx'), help = show('lib/help-content.ts');
const navLine = page.match(/const nav=\[(.*?)\];/s)[1];
const nav = [...navLine.matchAll(/\{key:'([^']+)',label:'([^']+)'/g)].map(m => ({ key: m[1], label: m[2] }));
const views = [...page.slice(page.indexOf('const views:')).matchAll(/(\w+):<\w+/g)].map(m => m[1]);
const hubTabs = [...hubs.matchAll(/\['(\w+)', '([^']+)'\]/g)].map(m => ({ key: m[1], label: m[2] }));
const sections = [...settings.matchAll(/\{ key: '(\w+)', title: '([^']+)'/g)].map(m => ({ key: m[1], title: m[2] }));
const addMenu = [...mobile.matchAll(/onClick=\{\(\) => (?:add\(\{ type: '(\w+)' \}\)|navigate\('(\w+)'(?:, '(\w+)')?\)|handOff\((onScan)\)|setAuto\((true)\))\}/g)].map(m => m[1] ? `tx:${m[1]}` : m[2] ? `view:${m[2]}${m[3] ? `:${m[3]}` : ''}` : m[4] ? 'scan' : 'quick');
const widgets = [...dash.slice(dash.indexOf('export const dashboardOptions'), dash.indexOf('] as const;')).matchAll(/\['(\w+)','([^']+)'\]/g)].map(m => ({ id: m[1], label: m[2] }));
const helpIds = [...help.matchAll(/\{ id: '([\w-]+)'/g)].map(m => m[1]);
const inventory = { source: '4.10 (5853ffe)', nav, views: [...new Set(views)], hubTabs, sections, addMenu: [...new Set(addMenu)], widgets, helpIds };
writeFileSync(new URL('./inventory-4.10.json', import.meta.url), JSON.stringify(inventory, null, 1));
console.log(Object.fromEntries(Object.entries(inventory).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])));
