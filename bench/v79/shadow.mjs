/**
 * 7.9 shadow: every sentence of every older Catat otomatis set (bench/quick/fixtures-*.mjs), read by 7.8
 * (bench/v79/baseline-v78) and now. Lists what changed: the money (kind, amount, wallets, day, person, sharing, lines)
 * and, separately, the category.   node bench/v79/shadow.mjs [--all]
 */
import { readdirSync } from 'node:fs';
const before = await import('./baseline-v78/lib/catat/v3.ts'), after = await import('../../lib/catat/v3.ts');
const v35 = (await import('../quick/fixtures-v35state.mjs')).ctx, v68 = (await import('../quick/fixtures-v68state.mjs')).ctx;
const dir = new URL('../quick/', import.meta.url);
const files = readdirSync(dir).filter(f => /^fixtures-.*\.mjs$/.test(f) && !/state/.test(f));
const money = a => { const r = a.result, p = r.preset; return [r.kind, r.amount || 0, p.walletId || '', p.destinationWalletId || '', r.date, String(r.person || '').toLowerCase(), r.split?.strong ? r.split.participants.length : 0, (p.splits || []).length].join('|'); };
const cat = a => a.result.preset.subcategoryId || a.result.preset.categoryId || '';
const seen = new Set(); let total = 0; const changes = [];
for (const f of files) {
  const mod = await import(new URL(f, dir).href), local = /^fixtures-v(6[89]|610|7|8)/.test(f) ? v68 : v35;
  for (const c of mod.cases || mod.default || []) {
    const text = c.text || c.input; if (!text || seen.has(text)) continue; seen.add(text); total++;
    const b = await before.parseQuickPlanV3(text, local), a = await after.parseQuickPlanV3(text, local);
    const mb = b.actions.map(money).join(' || '), ma = a.actions.map(money).join(' || ');
    const cb = b.actions.map(cat).join(' || '), ca = a.actions.map(cat).join(' || ');
    if (mb !== ma || cb !== ca) changes.push({ f, id: c.id, text, meaning: mb !== ma, mb, ma, cb, ca });
  }
}
console.log(`Shadow 7.8 → sekarang: ${total} kalimat unik dari ${files.length} set · uang berubah ${changes.filter(c => c.meaning).length} · kategori saja berubah ${changes.filter(c => !c.meaning).length}`);
for (const c of changes.filter(c => c.meaning || process.argv.includes('--all'))) console.log(`${c.meaning ? '‼' : '·'} ${c.f.replace(/^fixtures-|\.mjs$/g, '')}/${c.id} “${c.text}”\n    7.8: ${c.mb}  [${c.cb}]\n    now: ${c.ma}  [${c.ca}]`);
