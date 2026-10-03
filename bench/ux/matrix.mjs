/** Feature discovery matrix (§147) generated from the registry:  node --experimental-strip-types bench/ux/matrix.mjs > bench/ux/MATRIX.md */
import { readFileSync } from 'node:fs';
import { features, featuresOn, intentGroups } from '../../lib/features.ts';
const inv = JSON.parse(readFileSync(new URL('./inventory-4.10.json', import.meta.url)));
const disc = readFileSync(new URL('../../lib/discovery.ts', import.meta.url), 'utf8');
const discovered = new Set([...disc.matchAll(/featureId: '([\w-]+)'/g)].map(m => m[1]));
const page = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');
const menu5 = page.match(/const menu=\[(.*?)\];/s)[1];
const hubTabs = new Set(inv.hubTabs.map(t => t.key)), nav4 = new Set(inv.nav.map(n => n.key));
const views = ['dashboard', 'transactions', 'wallets', 'budgets', 'claims', 'debts', 'receivables', 'splitbill', 'funds', 'wishlist', 'recurring', 'upcoming', 'calendar', 'advisor', 'analytics', 'report', 'forecast', 'cycles', 'health', 'settings', 'help', 'categories', 'inbox', 'owedReport', 'owedArchive'];
const LEVEL = { core: 'Selalu terlihat', common: 'Saat relevan', advanced: 'Konteks / cari', expert: 'Cari / Jelajahi' };
const where4 = f => { const a = f.action; if (a.kind === 'tx' || a.kind === 'scan' || a.kind === 'quick') return 'Tombol Tambah'; if (a.view === 'settings') return `Pengaturan${a.focus ? ` › ${a.focus}` : ''}`; if (a.view === 'explore') return '– (baru)'; if (f.page) return hubTabs.has(a.view) ? 'Tab di hub' : nav4.has(a.view) ? 'Menu' : 'Menu'; return `Di halaman ${f.on || a.view}${a.focus ? ' (menu/tombol)' : ''}`; };
const where5 = f => { const p = ['Cari', 'Jelajahi']; const a = f.action; if (f.page && a.kind === 'view' && (menu5.includes(`'${a.view}'`) || hubTabs.has(a.view))) p.push('Menu/Lainnya'); if (a.kind !== 'view') p.push('Tambah'); if (views.some(v => featuresOn(v).some(x => x.id === f.id))) p.push('Yang bisa dilakukan di sini'); if (discovered.has(f.id)) p.push('Saran kontekstual'); if (f.help) p.push('Tanya Jawab'); return p.join(' · '); };
let out = `# Matriks discovery fitur — Dompet Ajaib 5.0\n\nDibuat otomatis dari \`lib/features.ts\` (${features.length} kemampuan). Kolom "4.10" = jalur yang ada sebelumnya; "5.0" = semua jalur sekarang.\n\n| Fitur | Kelompok | Tampil default | Pemicu kontekstual | Kata kunci (contoh) | Jalur 4.10 | Jalur 5.0 |\n|---|---|---|---|---|---|---|\n`;
for (const f of features) out += `| ${f.name} | ${intentGroups.find(g => g.id === f.group).title} | ${LEVEL[f.complexity]} | ${[...(f.relevant || []), ...(discovered.has(f.id) ? ['aturan discovery'] : [])].join(', ') || '–'} | ${f.keywords.slice(0, 4).join(', ')} | ${where4(f)} | ${where5(f)} |\n`;
const dark = features.filter(f => where5(f).split(' · ').length < 2);
out += `\nFitur gelap (kurang dari 2 jalur): ${dark.length ? dark.map(f => f.name).join(', ') : '0'}\n`;
console.log(out);
