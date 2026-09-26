import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { flattenHelp, helpGroups } from '../lib/help-content.ts';

// Tanya Jawab links must open real pages (and real Pengaturan sections); the page list is read from the app itself.
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const settings = fs.readFileSync(new URL('../components/settings.tsx', import.meta.url), 'utf8');
const views = new Set([...page.slice(page.indexOf('const nav=')).split('\n')[0].matchAll(/key:'(\w+)'/g)].map(m => m[1]));
const sections = new Set([...settings.matchAll(/\{ key: '(\w+)', title:/g)].map(m => m[1]));

test('Tanya Jawab: every link opens a page that exists', () => {
  assert.ok(views.has('help') && views.has('settings') && sections.has('control'), 'page lists were read');
  for (const { item } of flattenHelp()) {
    if (!item.go) continue;
    assert.ok(views.has(item.go.view), `${item.id} → ${item.go.view}`);
    if (item.go.target) assert.ok(item.go.view === 'settings' && sections.has(item.go.target), `${item.id} → ${item.go.target}`);
  }
});

test('Tanya Jawab: ids are unique, every topic has questions, bold marks are closed', () => {
  const rows = flattenHelp(), ids = rows.map(r => r.item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const group of helpGroups) assert.ok(group.items.length > 0, group.id);
  for (const { item } of rows) for (const text of [item.a, item.tip || '', ...(item.steps || [])]) assert.equal((text.match(/\*\*/g) || []).length % 2, 0, item.id);
});
