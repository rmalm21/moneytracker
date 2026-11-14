/**
 * 10.3 Asisten chat 4.0 — free-written records: 10.2 (bench/v103/baseline-v102, from `sh bench/v103/make-baseline.sh`)
 * vs now.
 *   SET=dev|heldout node bench/v103/run.mjs [--first] [--fails] [--only=10.2|sekarang] [--fam=typo] [--fields]
 * --first writes FROZEN-<set>-first.md once (the held-out set is run that way, a single time, at the end).
 *
 * Cases: bench/v103/gen.mjs (generated, the two splits share no list) and the hand-written hand-<set>.mjs. A record is
 * read by Catat otomatis (the same reader the chat hands a record to); a chat case is a conversation with the chat,
 * with each version's own trained model. Every case runs on both accounts of bench/v102/state.mjs and counts only when
 * it passes on both.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { accounts } from '../v102/state.mjs';
import { build, FAMILIES } from './gen.mjs';
const SET = process.env.SET || 'dev', arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const hand = (await import(SET === 'heldout' ? './hand-heldout.mjs' : './hand-dev.mjs')).cases;
const cases = [...build(SET), ...hand].filter(c => !arg('fam') || c.fam === arg('fam'));
const all = { '10.2': './baseline-v102/lib', sekarang: '../../lib' };
const engines = {};
// The current version reads with its pembaca kalimat loaded, as in the app once Catat otomatis or the chat is open.
if (!arg('only') || arg('only') === 'sekarang') await (await import('../../lib/catat/tagger.ts')).loadTagger();
for (const [k, dir] of Object.entries(all)) if (!arg('only') || arg('only') === k) engines[k] = { parse: (await import(`${dir}/quick-plan.ts`)).parseQuickPlan, chat: await import(`${dir}/chat/engine.ts`), inspect: (await import(`${dir}/chat/inspect.ts`)).inspect, classify: (await import(`${dir}/chat/model.ts`)).classifyChat };

const low = s => String(s || '').toLocaleLowerCase('id-ID');
const word = (text, w) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text);
const mainCat = (acc, catId, subId) => { const by = id => acc.data.categories.find(c => c.id === id); const c = by(subId) || by(catId); if (!c) return ''; return c.parentId ? by(c.parentId)?.name || '' : c.name; };
const RECORD = new Set(['expense', 'income', 'transfer']);
const FIELDS = ['kind', 'total', 'wallet', 'to', 'date', 'cat', 'item', 'place', 'clean', 'count'];

/** What is wrong with one card against what it should say (field → message). */
function judgeRecord(acc, r, want) {
  const p = r?.preset || {}, errs = {};
  const named = low(`${p.description || ''} ${p.merchant || ''}`);
  if (want.kind && r?.kind !== want.kind) errs.kind = `jenis ${r?.kind || '-'} ≠ ${want.kind}`;
  if (want.total && r?.amount !== want.total) errs.total = `nominal ${r?.amount ?? '-'} ≠ ${want.total}`;
  if (want.wallet && p.walletId !== want.wallet) errs.wallet = `dompet ${p.walletId || '-'} ≠ ${want.wallet}`;
  if (want.to && p.destinationWalletId !== want.to) errs.to = `tujuan ${p.destinationWalletId || '-'} ≠ ${want.to}`;
  if (want.date && (p.date || acc.today) !== want.date) errs.date = `tanggal ${p.date || acc.today} ≠ ${want.date}`;
  // The main category, or the subcategory when the case names one ("Jajan", "Makan Malam").
  const subName = acc.data.categories.find(c => c.id === p.subcategoryId)?.name;
  if (want.cat && mainCat(acc, p.categoryId, p.subcategoryId) !== want.cat && subName !== want.cat) errs.cat = `kategori ${mainCat(acc, p.categoryId, p.subcategoryId) || '-'} ≠ ${want.cat}`;
  if (want.item && !named.includes(low(want.item).split(' ')[0])) errs.item = `nama “${p.description || ''}” tanpa ${want.item}`;
  if (want.place && !named.includes(low(want.place).split(' ')[0])) errs.place = `tempat “${p.merchant || ''}” tanpa ${want.place}`;
  const dirty = (want.clean || []).filter(w => w && word(named, low(w)));
  if (dirty.length) errs.clean = `nama “${[p.description, p.merchant].filter(Boolean).join(' · ')}” memuat ${dirty.join(', ')}`;
  return errs;
}

async function runText(eng, c, acc) {
  // A case that does not say the kind ("bayarin obat budi", "dibayar budi 100rb") may fairly be money lent or paid back:
  // any money record counts.
  const kinds = c.want.kind || c.want.count ? RECORD : new Set([...RECORD, 'receivable_new', 'receivable_payment', 'borrowing', 'debt_payment']);
  const plan = eng.parse(c.text, acc.quick), recs = plan.actions.map(a => a.result).filter(r => kinds.has(r.kind));
  if (c.want.count) {
    const errs = c.want.count !== recs.length ? { count: `${recs.length} catatan ≠ ${c.want.count}` } : {};
    c.want.records.forEach((w, i) => Object.assign(errs, Object.fromEntries(Object.entries(judgeRecord(acc, recs[i], w)).map(([k, v]) => [k, `#${i + 1} ${v}`]))));
    return errs;
  }
  if (!recs.length) return { kind: `bukan catatan (${plan.actions.map(a => a.result.kind).join('/') || 'kosong'})` };
  return judgeRecord(acc, recs[0], c.want);
}

async function runChat(eng, c, acc) {
  let memory = {}, reply = null;
  const ctx = { ...acc, voice: 'santai', inspect: t => eng.inspect(t, acc.quick), classify: eng.classify };
  for (const turn of c.turns) {
    const r = await eng.chat.chatReply(turn.say, memory, ctx); memory = r.memory; reply = r.reply;
    if (!turn.check) continue;
    if (reply.kind !== 'plan') return { kind: `bukan kartu (“${String(reply.text).slice(0, 80)}”)` };
    const recs = eng.parse(reply.text, acc.quick).actions.map(a => a.result).filter(r => RECORD.has(r.kind));
    if (!recs.length) return { kind: `kartu bukan catatan «${reply.text}»` };
    const errs = judgeRecord(acc, recs[0], turn.check.rec);
    if (Object.keys(errs).length) return Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, `${v} «${reply.text}»`]));
  }
  return {};
}

const out = [], log = l => { out.push(l); console.log(l); };
const res = {}, started = Date.now();
for (const [k, eng] of Object.entries(engines)) {
  res[k] = [];
  for (const c of cases) {
    const errs = {};
    for (const acc of accounts) {
      const e = await (c.turns ? runChat(eng, c, acc) : runText(eng, c, acc)).catch(x => ({ kind: `error: ${x.message.split('\n')[0]}` }));
      for (const [f, m] of Object.entries(e)) errs[f] ||= `[${acc.account}] ${m}`;
    }
    res[k].push({ c, errs });
  }
}
const pct = (a, b) => b ? `${a}/${b} (${(a / b * 100).toFixed(1)}%)` : '–';
const names = Object.keys(engines), fams = [...Object.keys(FAMILIES), 'tangan'];
log(`## Asisten chat 4.0 — kalimat bebas, ${SET} (${cases.length} kasus × 2 akun)\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
log(`| **Semua kasus** | ${names.map(k => pct(res[k].filter(x => !Object.keys(x.errs).length).length, cases.length)).join(' | ')} |`);
for (const f of fams) { const n = cases.filter(c => c.fam === f).length; if (n) log(`| · ${FAMILIES[f] || 'Tulisan tangan'} | ${names.map(k => pct(res[k].filter(x => x.c.fam === f && !Object.keys(x.errs).length).length, n)).join(' | ')} |`); }
if (process.argv.includes('--fields') || process.argv.includes('--first')) {
  log(`\n**Per bagian** (kasus yang memeriksa bagian itu, benar di dua akun)\n\n| | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`);
  for (const f of FIELDS) {
    const has = c => f === 'count' ? Boolean(c.want?.count) : c.turns ? Boolean(c.turns.some(t => t.check?.rec?.[f === 'total' ? 'total' : f])) : c.want?.count ? c.want.records.some(r => r[f]) : f === 'clean' ? Boolean(c.want?.clean?.length) : Boolean(c.want?.[f]);
    const n = cases.filter(has).length; if (!n) continue;
    log(`| ${f} | ${names.map(k => pct(res[k].filter(x => has(x.c) && !x.errs[f] && !(f !== 'kind' && x.errs.kind?.startsWith('bukan'))).length, n)).join(' | ')} |`);
  }
}
log(`\n(${Math.round((Date.now() - started) / 1000)} dtk)`);
if (process.argv.includes('--fails')) for (const k of names) { const f = res[k].filter(x => Object.keys(x.errs).length); if (!f.length) continue; log(`\n### Gagal — ${k} (${f.length})`); for (const x of f) log(`- ${x.c.id} [${x.c.fam}] ${x.c.text ? `“${x.c.text}”` : x.c.turns.map(t => `“${t.say}”`).join(' → ')}: ${Object.values(x.errs).join('; ')}`); }
if (process.argv.includes('--first')) {
  const file = new URL(`./FROZEN-${SET}-first.md`, import.meta.url);
  if (existsSync(file)) console.log(`\n${file.pathname} sudah ada: hasil percobaan pertama tidak ditimpa.`);
  else { writeFileSync(file, `# Percobaan pertama, dibekukan (${new Date().toISOString().slice(0, 10)})\n\n${out.join('\n')}\n`); console.log(`\nDibekukan: ${file.pathname}`); }
}
