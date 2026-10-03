/**
 * Dompet Ajaib 5.0 — Adaptive Simplicity: feature retention (release blocker), Feature Registry, Global Search,
 * Discovery Engine lifecycle and fatigue, "Perlu perhatian", the adaptive default Beranda, and usage metadata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { features, featureById, featuresOn, intentGroups, searchFeatures } from '../lib/features.ts';
import { attentionItems, discoveryCandidates, lifecycle, markDismissed, markShown, markTried, pickDiscovery, readSignals, repeatPayments, DISMISS_DAYS } from '../lib/discovery.ts';
import { countVisit, emptyUsage, markSeen, resetTips, toggleFavorite, touchRecent } from '../lib/usage.ts';
import { helpGroups } from '../lib/help-content.ts';
import { emptyData } from '../lib/types.ts';

const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const inventory = JSON.parse(src('bench/ux/inventory-4.10.json'));
const page = src('app/page.tsx'), hubs = src('components/hubs.tsx'), mobile = src('components/mobile-navigation.tsx'), settings = src('components/settings.tsx'), dash = src('components/dashboard-home.tsx'), icons = src('components/feature-icons.tsx');
const viewsNow = new Set([...page.slice(page.indexOf('const views:')).matchAll(/(\w+):<\w+/g)].map(m => m[1]));
const navNow = new Set([...page.match(/const nav=\[(.*?)\];/s)[1].matchAll(/\{key:'([^']+)'/g)].map(m => m[1]));
const sectionsNow = new Set([...settings.matchAll(/\{ key: '(\w+)', title: '/g)].map(m => m[1]));
const widgetsNow = new Set([...dash.slice(dash.indexOf('export const dashboardOptions'), dash.indexOf('] as const;')).matchAll(/\['(\w+)','/g)].map(m => m[1]));
const helpIds = new Set(); const walk = items => items.forEach(i => { helpIds.add(i.id); if (i.children) walk(i.children); }); helpGroups.forEach(g => walk(g.items));

// ——— Release gate: zero feature loss against the frozen 4.10 inventory ———
test('every 4.10 page still renders in 5.0 and is in the navigation list', () => {
  for (const v of inventory.views) assert.ok(viewsNow.has(v), `page ${v} disappeared`);
  for (const n of inventory.nav) assert.ok(navNow.has(n.key), `nav ${n.key} disappeared`);
});
test('every 4.10 hub tab, settings section, Tambah action, Beranda card and help answer still exists', () => {
  for (const t of inventory.hubTabs) assert.ok(hubs.includes(`['${t.key}', '${t.label}']`), `hub tab ${t.key}`);
  for (const s of inventory.sections) assert.ok(sectionsNow.has(s.key), `settings ${s.key}`);
  for (const a of inventory.addMenu) {
    const needle = a === 'quick' ? 'setAuto(true)' : a === 'scan' ? 'handOff(onScan)' : a.startsWith('tx:') ? `add({ type: '${a.slice(3)}' })` : `navigate('${a.split(':')[1]}'${a.split(':')[2] ? `, '${a.split(':')[2]}'` : ''})`;
    assert.ok(mobile.includes(needle), `Tambah action ${a}`);
  }
  for (const w of inventory.widgets) assert.ok(widgetsNow.has(w.id), `Beranda card ${w.id}`);
  for (const id of inventory.helpIds) assert.ok(helpIds.has(id), `help ${id}`);
});
test('every 4.10 page has a registry entry (searchable, in Jelajahi) — no dark features', () => {
  const pageViews = new Set(features.filter(f => f.action.kind === 'view').map(f => f.action.view));
  for (const v of inventory.views) assert.ok(pageViews.has(v), `no feature opens ${v}`);
  for (const s of inventory.sections) assert.ok(features.some(f => f.action.kind === 'view' && f.action.view === 'settings' && f.action.focus === s.key), `no feature opens Pengaturan › ${s.key}`);
});

// ——— Registry integrity ———
test('registry: unique ids, known groups, icons, routes, help ids, focus targets', () => {
  const ids = features.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate feature id');
  for (const f of features) {
    assert.ok(intentGroups.some(g => g.id === f.group), `${f.id}: group`);
    assert.ok(icons.includes(`${f.icon}:`), `${f.id}: icon ${f.icon}`);
    assert.ok(f.description.length > 10 && f.keywords.length >= 2, `${f.id}: description/keywords`);
    if (f.action.kind === 'view') assert.ok(viewsNow.has(f.action.view), `${f.id}: view ${f.action.view}`);
    if (f.action.kind === 'view' && f.action.view === 'settings' && f.action.focus) assert.ok(sectionsNow.has(f.action.focus) || f.action.focus === 'danger', `${f.id}: settings focus`);
    if (f.help) assert.ok(helpIds.has(f.help), `${f.id}: help ${f.help}`);
  }
  for (const g of intentGroups) assert.ok(features.some(f => f.group === g.id), `empty group ${g.id}`);
});
test('advanced capabilities each have at least one discovery path (search keywords + Jelajahi + context or help)', () => {
  for (const f of features.filter(x => x.complexity === 'advanced' || x.complexity === 'expert')) {
    assert.ok(searchFeatures(f.name).some(h => h.item.id === f.id), `${f.id} not found by its own name`);
    const onSomePage = [...viewsNow].some(v => featuresOn(v).some(x => x.id === f.id));
    assert.ok(onSomePage || f.help || f.relevant?.length || f.page, `${f.id}: no contextual path (page, "Yang bisa dilakukan di sini", help or discovery)`);
  }
});
test('"Yang bisa dilakukan di sini" lists the wallet capabilities without showing them on the screen', () => {
  const here = featuresOn('wallets').map(f => f.id);
  for (const id of ['interest', 'reconcile', 'kantong', 'wallet-archive', 'recalculate']) assert.ok(here.includes(id), id);
});

// ——— Global Search: user language (§207) ———
const expectTop = { tagihan: 'recurring', utang: 'debts', 'uang balik': ['receivables', 'claims'], bunga: 'interest', budget: 'budgets', split: 'splitbill', struk: 'scan', laporan: 'report', 'data error': 'health', 'uang aman': 'available', claim: 'claims', rekonsiliasi: 'reconcile', 'kalau beli': 'whatif', recurring: 'recurring', 'uang yang bisa dipakai': 'available', 'tagihan bulanan': 'recurring', 'dark mode': 'appearance', backup: 'backup', pin: 'security', 'semua fitur': 'explore' };
for (const [q, id] of Object.entries(expectTop)) test(`search "${q}" → ${[id].flat().join(' / ')}`, () => {
  const top = searchFeatures(q)[0]?.item.id;
  assert.ok([id].flat().includes(top), `got ${top}`);
});
test('search is typo tolerant but conservative', () => {
  assert.equal(searchFeatures('rekonsilasi')[0]?.item.id, 'reconcile');
  assert.equal(searchFeatures('spilt')[0]?.item.id, 'splitbill');
  assert.equal(searchFeatures('anggran')[0]?.item.id, 'budgets');
  assert.equal(searchFeatures('bunga mawar').length, 0, 'every word must match');
  assert.ok(!searchFeatures('bunga').some(h => h.item.id === 'funds'), '"bunga" must not match inside "tabungan"');
  assert.equal(searchFeatures('').length, 0);
});
test('search is fast enough to feel instant (registry, 1 000 queries)', () => {
  const t = performance.now(); for (let i = 0; i < 1000; i++) searchFeatures(['bunga', 'uang balik', 'tagihan bulanan', 'rekonsilasi'][i % 4]);
  assert.ok((performance.now() - t) / 1000 < 2, 'more than 2 ms per query');
});

// ——— Discovery Engine ———
const TODAY = '2026-10-15', NOW = Date.parse('2026-10-15T08:00:00Z');
const tx = (o) => ({ id: Math.random().toString(36).slice(2), type: 'expense', amount: 54000, date: TODAY, walletId: 'w', destinationWalletId: null, categoryId: null, subcategoryId: null, merchant: '', description: '', notes: '', tags: [], claimId: null, debtId: null, receivableId: null, fundId: null, recurringTransactionId: null, draftId: null, adjustmentDirection: 'in', ...o });
const spotify = ['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map(date => tx({ merchant: 'Spotify', date }));
const data = (o = {}) => ({ ...emptyData, wallets: [{ id: 'w', name: 'BCA', type: 'bank', cachedBalance: 1e6, openingBalance: 1e6, isArchived: false }], ...o });

test('a brand-new account gets no prompt at all (nothing useful to suggest)', () => {
  const d = data(); const s = readSignals(d, {}, TODAY);
  assert.equal(pickDiscovery(discoveryCandidates(d, s, { screen: 'home' }), s, {}, NOW), null);
});
test('a payment repeated monthly suggests Rutin, with the reason; daily lunch does not', () => {
  const lunch = Array.from({ length: 60 }, (_, i) => tx({ merchant: 'Warteg', amount: 25000, date: `2026-${String(8 + Math.floor(i / 30)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` }));
  assert.deepEqual(repeatPayments([...spotify, ...lunch], []).map(r => r.name), ['spotify']);
  const d = data({ transactions: spotify }); const s = readSignals(d, {}, TODAY);
  const pick = pickDiscovery(discoveryCandidates(d, s, { screen: 'home' }), s, {}, NOW);
  assert.equal(pick?.featureId, 'recurring'); assert.match(pick.title, /Spotify/); assert.match(pick.reason, /repeatPayment/);
});
test('a feature already used is never promoted (LEARNED)', () => {
  const d = data({ transactions: spotify, recurring: [{ id: 'r', name: 'Netflix', active: true }] }); const s = readSignals(d, {}, TODAY);
  assert.equal(lifecycle('recurring', s, {}, NOW), 'LEARNED');
  assert.ok(!discoveryCandidates(d, s, { screen: 'home' }).some(c => c.featureId === 'recurring'));
});
test('fatigue: dismissed stays away for 60 days, tried never returns, 3 days shown stops', () => {
  const d = data({ transactions: spotify }); const s = readSignals(d, {}, TODAY);
  const list = discoveryCandidates(d, s, { screen: 'home' }), key = list[0].key;
  let st = markDismissed({}, key, NOW);
  assert.notEqual(pickDiscovery(list, s, st, NOW + 86_400_000)?.key, key, 'dismissed came back the next day');
  assert.equal(pickDiscovery(list, s, st, NOW + (DISMISS_DAYS + 1) * 86_400_000)?.key, key, 'should be eligible again after 60 days');
  assert.notEqual(pickDiscovery(list, s, markTried({}, key, NOW), NOW)?.key, key);
  st = {}; for (const day of ['2026-10-15', '2026-10-15', '2026-10-16', '2026-10-17']) st = markShown(st, key, NOW, day);
  assert.equal(st[key].shownDays.length, 3, 'one count per day');
  assert.notEqual(pickDiscovery(list, s, st, NOW)?.key, key);
});
test('at most one prompt; screen-scoped (wallet interest only on Beranda or Dompet)', () => {
  const d = data({ wallets: [{ id: 's', name: 'Tabungan', type: 'savings', group: 'savings', cachedBalance: 5e6, isArchived: false }], transactions: spotify });
  const s = readSignals(d, {}, TODAY);
  assert.ok(discoveryCandidates(d, s, { screen: 'wallets' }).some(c => c.featureId === 'interest'));
  assert.ok(!discoveryCandidates(d, s, { screen: 'budgets' }).some(c => c.featureId === 'interest'));
  const pick = pickDiscovery(discoveryCandidates(d, s, { screen: 'home' }), s, {}, NOW);
  assert.equal(typeof pick?.key, 'string');
});
test('widget suggestion only for a customized Beranda that lacks the card, never automatic', () => {
  const d = data({ claims: [{ id: 'c', name: 'Dinas', remainingAmount: 500000, status: 'submitted', submissionDate: '2026-10-01' }] }); const s = readSignals(d, {}, TODAY);
  assert.ok(discoveryCandidates(d, s, { screen: 'home', customizedHome: true, homeWidgets: ['free'] }).some(c => c.key === 'widget:claims'));
  assert.ok(!discoveryCandidates(d, s, { screen: 'home', customizedHome: false }).some(c => c.key === 'widget:claims'));
  assert.ok(!discoveryCandidates(d, s, { screen: 'home', customizedHome: true, homeWidgets: ['claims'] }).some(c => c.key === 'widget:claims'));
});
test('discovery never reads or writes money: candidates carry no amounts beyond the reason text', () => {
  const lib = src('lib/discovery.ts');
  for (const bad of ['saveTransaction', 'firestore', 'fetch(', 'localStorage']) assert.ok(!lib.includes(bad), bad);
});

// ——— Perlu perhatian ———
test('attention: most important first, nothing when nothing needs attention, zero values never shown', () => {
  assert.deepEqual(attentionItems(data(), TODAY), []);
  const d = data({
    drafts: [{ id: 'x', status: 'pending', amount: 171000 }],
    debts: [{ id: 'd', name: 'Laptop', status: 'open', outstandingAmount: 5e6, installmentAmount: 5e5, dueDate: '2026-10-17' }],
    claims: [{ id: 'c', name: 'Dinas', remainingAmount: 1.25e6, status: 'submitted', submissionDate: '2026-09-01' }, { id: 'p', name: 'Lunas', remainingAmount: 0, status: 'paid', submissionDate: '2026-08-01' }],
    receivables: [{ id: 'r', person: 'Dodi', remainingAmount: 0, dueDate: '2026-09-01' }],
  });
  const items = attentionItems(d, TODAY, { budgetsOver: 1, healthIssues: 2 });
  assert.deepEqual(items.map(i => i.key), ['budgets-over', 'debts-due', 'inbox', 'claims-old', 'health']);
  assert.match(items.find(i => i.key === 'debts-due').text, /2 hari lagi/);
  assert.ok(!items.some(i => i.key === 'receivables-late'), 'a settled receivable is not late');
});

// ——— Adaptive default Beranda ———
test('5.0 default Beranda is state-aware and small; 4.x layouts and customization are preserved', () => {
  assert.match(dash, /export function homeDefault/);
  assert.match(dash, /const oldDefaults=\[legacyDefault,/, 'the 4.x default counts as "never customized"');
  assert.match(dash, /dashboardWidgetsBefore5/, 'the previous layout can be restored');
  assert.match(dash, /Coba tampilan rekomendasi 5\.0/, 'customized users are offered, not replaced');
  const fn = dash.slice(dash.indexOf('export function homeDefault'), dash.indexOf('\n', dash.indexOf('export function homeDefault')));
  assert.ok(!/claims|receivables|debts|liabilities/.test(fn), 'no zero-value obligation cards by default');
});

// ——— Usage metadata ———
test('usage: recents move to front, favorites toggle, visits count, tips reset keeps favorites', () => {
  let u = emptyUsage();
  u = touchRecent(touchRecent(touchRecent(u, 'a'), 'b'), 'a'); assert.deepEqual(u.recent, ['a', 'b']);
  u = toggleFavorite(u, 'interest'); assert.deepEqual(u.favorites, ['interest']); assert.deepEqual(toggleFavorite(u, 'interest').favorites, []);
  u = countVisit(countVisit(u, 'advisor'), 'advisor'); assert.equal(u.visited.advisor, 2);
  u = markSeen(markSeen(u, 'orientation-5.0'), 'tip:home5'); u.discovery = { x: { status: 'dismissed', shownDays: [], at: 1 } };
  const r = resetTips(u);
  assert.deepEqual(r.discovery, {}); assert.deepEqual(r.seen, ['orientation-5.0']); assert.deepEqual(r.favorites, ['interest']);
  assert.ok(!/amount|balance|saldo/i.test(src('lib/usage.ts').match(/export type Usage = \{[\s\S]*?\n\};/)[0]), 'no financial facts in usage metadata');
});
test('offline: registry, search and discovery are pure local code', () => {
  for (const f of ['lib/features.ts', 'lib/discovery.ts', 'components/feature-search.tsx']) for (const bad of ['fetch(', 'XMLHttpRequest', 'gemini', 'openai']) assert.ok(!src(f).includes(bad), `${f}: ${bad}`);
  assert.ok(featureById('explore') && viewsNow.has('explore'));
});
