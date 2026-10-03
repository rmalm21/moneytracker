import { readFileSync, writeFileSync } from 'node:fs';
const S = process.env.S;
const b = JSON.parse(readFileSync(`${S}/v5/before/metrics.json`)), a = JSON.parse(readFileSync(`${S}/v5/after/metrics.json`));
const key = r => `${r.user}|${r.size}|${r.view}`, am = new Map(a.map(r => [key(r), r]));
const keys = ['actions', 'cards', 'amounts', 'badges', 'concepts', 'emphasis'];
let md = '| Halaman | Pengguna | Ukuran | Aksi (layar 1) | Kartu | Angka | Badge | Konsep | Penekanan | Aksi (seluruh) | Scroll |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
const tot = { before: Object.fromEntries(keys.map(k => [k, 0])), after: Object.fromEntries(keys.map(k => [k, 0])) };
for (const r of b) { const x = am.get(key(r)); if (!x) continue;
  for (const k of keys) { tot.before[k] += r.first[k]; tot.after[k] += x.first[k]; }
  md += `| ${r.view} | ${r.user} | ${r.size} | ${keys.map(k => `${r.first[k]} → ${x.first[k]}`).join(' | ')} | ${r.page.actions} → ${x.page.actions} | ${r.page.scroll} → ${x.page.scroll} |\n`; }
const sum = `\nTotal layar pertama (semua halaman × pengguna × ukuran): ${keys.map(k => `${k} ${tot.before[k]} → ${tot.after[k]} (${Math.round((tot.after[k] - tot.before[k]) / tot.before[k] * 100)}%)`).join(' · ')}\n`;
writeFileSync(`${S}/v5/compare.md`, md + sum);
console.log(sum);
for (const v of ['dashboard', 'more', 'wallets', 'budgets', 'transactions']) for (const r of b.filter(r => r.view === v && r.user === 'rama')) { const x = am.get(key(r)); if (x) console.log(v, r.size, keys.map(k => `${k} ${r.first[k]}→${x.first[k]}`).join(' '), `scroll ${r.page.scroll}→${x.page.scroll}`); }
