/**
 * Insight V3 — view model: chooses WHAT the page shows and in WHICH words, from the engine's output only.
 *
 * Engine = truth (lib/insight-v3, lib/insight-v25, lib/advisor). View model = selection and plain Indonesian.
 * Component = rendering. Nothing here computes a financial number: every amount comes from a signal, a story, the
 * world model or a scenario result; this file only picks the 3–5 things that matter, keeps the engine's order and
 * tone, and replaces engine terms (pressure, liquidity, momentum) with everyday words.
 */
import type { Story, InsightSignal } from '../insight-v25/types.ts';
import { mainDriver, mechanism } from '../insight-v25/signals/spending.ts';
import type { InsightV3Report } from './index.ts';
import type { Level, MomentumState, PressureDomain } from './types.ts';
import { dayMonth, money, percent, signedMoney } from './format.ts';

export type Tone = 'good' | 'info' | 'warn' | 'bad';
const toneOf: Record<Story['tone'], Tone> = { positive: 'good', neutral: 'info', watch: 'warn', important: 'bad' };

/** Everyday names for the engine's pressure domains. */
export const domainPlain: Record<PressureDomain, { label: string; explain: string }> = {
  liquidity: { label: 'Uang sampai gajian', explain: 'Apakah uang bebas cukup untuk belanja dan tagihan sampai gajian berikutnya.' },
  budget: { label: 'Anggaran', explain: 'Anggaran yang sudah atau hampir terlampaui di periode ini.' },
  debt: { label: 'Cicilan utang', explain: 'Besar cicilan dibanding pemasukan, dan sisa utang.' },
  goal: { label: 'Setoran target dana', explain: 'Total setoran yang dibutuhkan semua target dibanding sisa uang yang biasa tersisa.' },
  claim: { label: 'Klaim kantor belum cair', explain: 'Uang yang sudah kamu keluarkan untuk kantor dan belum diganti.' },
  receivable: { label: 'Piutang belum kembali', explain: 'Uang yang dipinjam orang lain dan belum dikembalikan.' },
  recurring: { label: 'Tagihan rutin', explain: 'Tagihan langganan dan rutin yang jatuh sebelum gajian.' },
};
export const levelPlain: Record<Level, string> = { good: 'Aman', stable: 'Cukup', watch: 'Perlu dijaga', pressure: 'Berat' };
export const momentumPlain: Record<MomentumState, { label: string; dir: 'up' | 'down' | 'flat' | 'mixed' }> = {
  IMPROVING: { label: 'Membaik', dir: 'up' }, STABLE: { label: 'Stabil', dir: 'flat' }, MIXED: { label: 'Campuran', dir: 'mixed' }, UNDER_PRESSURE: { label: 'Memburuk', dir: 'down' },
};
export const scoreLabel = (score: number) => score >= 75 ? 'Sehat' : score >= 55 ? 'Cukup sehat' : score >= 40 ? 'Perlu perhatian' : 'Rawan';
export const help = {
  score: { title: 'Skor kesehatan', text: 'Gambaran keseluruhan kondisi keuanganmu (0–100) dari 6 hal: sisa uang tiap siklus, dana darurat, cicilan, anggaran, bekal sampai gajian, dan arah pengeluaran.' },
  momentum: { title: 'Arah keuangan', text: 'Apakah keadaan bergerak lebih baik atau lebih buruk dibanding siklus-siklus sebelumnya: sisa uang, pengeluaran, utang, dana darurat, dan target. Butuh minimal 3 siklus.' },
  watch: { title: 'Yang perlu dijaga', text: 'Hal yang sedang berat untuk sementara, misalnya klaim kantor yang belum cair atau setoran target yang melebihi sisa uang. Ini tidak mengubah skor: skor bisa tetap sehat walau ada yang perlu dijaga.' },
  cost: { title: 'Indeks harga pribadi', text: 'Perubahan harga barang yang kamu beli berulang, dari struk yang kamu pindai (toko dan ukuran yang sama). Ini bukan angka inflasi Indonesia.' },
  impact: { title: 'Arti label dampak', text: 'Langsung = hubungan hitungan yang pasti. Perkiraan = bila pola ini berlanjut. Bersamaan = bergerak bersamaan, bukan sebab yang pasti.' },
};

/** First sentence; a dot inside a number (Rp12.000.000) is not the end of a sentence. */
export const firstSentence = (text: string) => (text.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] || text).trim();
const visible = (s: Story) => s.state !== 'DISMISSED' && s.state !== 'SNOOZED';
const badgeOf = (s: Story | InsightSignal) => { const st = 'state' in s ? s.state : s.lifecycleState; return st === 'NEW' ? 'Baru' : st === 'WORSENING' ? 'Memburuk' : st === 'IMPROVING' ? 'Membaik' : undefined; };
const limited = (s: InsightSignal) => s.confidence.level === 'low' ? 'Data masih terbatas' : undefined;

// ——— Hero ———
export function heroView(r: InsightV3Report) {
  const advice = r.v25.advice, m = r.momentum;
  const watch = r.mainPressure.map(p => ({ domain: p.domain, label: domainPlain[p.domain].label, level: levelPlain[p.level], reason: p.reasons[0] || '', signature: p.signature }));
  const liquidity = r.pressures.find(p => p.domain === 'liquidity');
  const liquidOk = liquidity && (liquidity.level === 'good' || liquidity.level === 'stable');
  const top = r.priority.find(visible);
  const statement = top?.tone === 'important' ? (top.root.headline || top.title)
    : r.silent ? 'Keuangan relatif stabil.'
    : watch.length ? `${liquidOk && !watch.some(w => w.domain === 'liquidity') ? 'Uang sampai gajian aman, tapi ' : ''}${watch.map(w => w.label.toLowerCase()).join(' dan ')} perlu dijaga.`.replace(/^./, c => c.toUpperCase())
    : scoreLabel(advice.score) === 'Sehat' ? 'Keuanganmu berjalan sehat sesuai polanya.' : 'Tidak ada yang mendesak saat ini.';
  const goods = m.parts.filter(p => p.good === true).map(p => p.label.toLowerCase()), bads = m.parts.filter(p => p.good === false).map(p => p.label.toLowerCase());
  const momentumLine = !m.enough ? 'Butuh minimal 3 siklus untuk melihat arahnya.' : m.state === 'IMPROVING' ? `${cap(goods.join(' dan '))} bergerak ke arah yang lebih baik.` : m.state === 'MIXED' ? `${cap(goods.join(', '))} membaik; ${bads.join(', ')} memburuk.` : m.state === 'UNDER_PRESSURE' ? `${cap(bads.join(' dan '))} bergerak ke arah yang kurang baik.` : 'Tidak ada perubahan arah yang berarti.';
  const parts = [...advice.parts].sort((a, b) => b.score - a.score);
  return {
    score: advice.score, label: scoreLabel(advice.score), tone: (advice.score >= 75 ? 'good' : advice.score >= 55 ? 'info' : advice.score >= 40 ? 'warn' : 'bad') as Tone,
    momentum: { enough: m.enough, label: m.enough ? momentumPlain[m.state].label : 'Belum terlihat', dir: m.enough ? momentumPlain[m.state].dir : 'flat', line: momentumLine, parts: m.parts },
    watch, allPressures: r.pressures.map(p => ({ domain: p.domain, label: domainPlain[p.domain].label, explain: domainPlain[p.domain].explain, level: p.level, levelText: levelPlain[p.level], reasons: p.reasons })),
    statement, delta: r.v25.hero.delta,
    why: { strong: parts.filter(p => p.score >= 75).slice(0, 2).map(p => ({ label: p.label, value: p.value })), held: parts.filter(p => p.score < 55).reverse().slice(0, 2).map(p => ({ label: p.label, value: p.value })) },
    numbers: [['Rata-rata masuk', money(advice.summary.avgIncome)], ['Rata-rata keluar', money(advice.summary.avgExpense)], ['Sisa per siklus', percent(Math.max(0, advice.summary.savingsRate))], ['Potensi hemat', advice.impact.monthly > 0 ? `${money(advice.impact.monthly)}/bln` : '–']] as [string, string][],
    basis: r.v25.learning.active ? `${r.v25.learning.message} · ${r.v25.learning.detail}` : `Dari ${advice.cyclesUsed} siklus gaji · ${advice.summary.daysLeft} hari lagi gajian`,
    learning: r.v25.learning.active,
  };
}
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

// ——— Brief ———
/** 2–4 short lines from the engine brief; the engine's "tekanan utama" phrase is said in everyday words. */
export function briefView(r: InsightV3Report) {
  return r.brief.slice(0, 4).map(b => ({ source: b.source, text: b.source === 'momentum' && b.domain === 'overall' ? `Arah keuangan ${heroView(r).momentum.label.toLowerCase()}${r.mainPressure.length ? `; yang perlu dijaga: ${r.mainPressure.map(p => domainPlain[p.domain].label.toLowerCase()).join(' dan ')}` : ''}.` : b.text.replace(/[Tt]ekanan utama/g, 'yang perlu dijaga') }));
}

// ——— What changed ———
export type ChangeItem = { signature: string; title: string; delta?: string; deltaDir: 'up' | 'down' | 'flat'; driver: string; tone: Tone; badge?: string; limited?: string; tree: { driver?: string; impact?: string } };
export function changeItem(r: InsightV3Report, s: Story): ChangeItem {
  const root = s.root, d = root.drivers[0] ? mainDriver(root.drivers[0]) : [], main = d[d.length - 1];
  const driver = main ? `Terutama ${main.label} (${mechanism(main)}).` : firstSentence(root.summary);
  const budget = s.members.find(m => m.domain === 'budget');
  const impact = budget ? (budget.headline || budget.title) : r.chain(s.signature).find(e => e.basis === 'direct' && e.to === 'state:available') ? `Uang tersedia ${(root.delta || 0) > 0 ? 'berkurang' : 'bertambah'} ±${money(Math.abs(root.delta || 0))}` : undefined;
  return {
    signature: s.signature, title: s.title, delta: root.delta !== undefined && root.unit === 'money' ? signedMoney(root.delta) : undefined, deltaDir: !root.delta ? 'flat' : root.delta > 0 ? 'up' : 'down',
    driver, tone: toneOf[s.tone], badge: badgeOf(s), limited: limited(root),
    tree: { driver: d.length > 1 ? d.map(x => x.label).join(' → ') : undefined, impact },
  };
}
export function changesView(r: InsightV3Report, limit = 3) {
  const all = r.changed.filter(visible).map(s => changeItem(r, s));
  return { top: all.slice(0, limit), rest: all.slice(limit), quiet: !all.length };
}

// ——— Priority ———
export type PriorityItem = { signature: string; title: string; why: string; tone: Tone; findingId?: string; pinKey: string; action?: { label: string; target?: { view: string; focus?: string }; apply?: NonNullable<InsightSignal['action']>['apply'] } };
/** Engine order is kept. Stories already told under "Yang berubah" are not repeated here. */
export function priorityView(r: InsightV3Report, options: { pinned?: string[]; hidden?: string[]; limit?: number } = {}) {
  const shown = new Set(r.changed.filter(visible).slice(0, 3).map(s => s.signature));
  const items: PriorityItem[] = r.priority.filter(visible).filter(s => !shown.has(s.signature)).filter(s => !(s.root.finding && options.hidden?.includes(s.root.finding.id))).map(s => {
    const root = s.root, finding = root.finding, apply = root.action?.apply || finding?.apply, target = root.action?.target || finding?.target;
    const title = root.headline && root.headline.length <= 80 ? root.headline : s.title;
    const why = firstSentence(root.summary.replace(/\*\*|==/g, ''));
    return { signature: s.signature, title, why: why === title ? '' : why, tone: toneOf[s.tone], findingId: finding?.id, pinKey: finding?.id || s.signature, action: apply ? { label: apply.kind === 'create-budget' ? `Buat ${money(apply.amount)}` : `Ubah ke ${money(apply.amount)}`, apply, target } : target ? { label: root.action?.label && root.action.label !== 'Lihat' ? root.action.label : 'Lihat', target } : undefined };
  });
  const pinned = options.pinned || [];
  items.sort((a, b) => (pinned.includes(b.pinKey) ? 1 : 0) - (pinned.includes(a.pinKey) ? 1 : 0));
  const limit = options.limit ?? 3;
  return { top: items.slice(0, limit), rest: items.slice(limit) };
}

// ——— Progress ———
export function progressView(r: InsightV3Report, today: string, shown: Set<string> = new Set()) {
  const items = [
    ...r.v25.progress.stories.filter(visible).map(s => ({ key: s.signature, title: s.title, line: s.root.headline && s.root.headline !== s.title ? s.root.headline : firstSentence(s.root.summary), done: false, signature: s.signature as string | undefined })),
    ...r.v25.progress.resolved.filter(x => daysSince(x.date, today) <= 7).map(x => ({ key: x.signature, title: x.title, line: `Selesai sejak ${dayMonth(x.date)}`, done: true, signature: undefined })),
  ];
  const fresh = items.filter(i => !shown.has(i.key));
  return { top: fresh.slice(0, 3), rest: fresh.slice(3) };
}
const daysSince = (date: string, today: string) => Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000);

// ——— Ask suggestions ———
export function questionsView(r: InsightV3Report) {
  const out: string[] = [];
  const cat = r.changed.find(s => s.root.domain === 'spending' && (s.root.delta || 0) > 0 && s.signature.startsWith('spending:category:'));
  const catName = cat ? r.v25.context.nameOf(cat.signature.split(':')[2]) : '';
  if (cat) out.push(`${catName} naik karena apa?`);
  out.push('Kenapa uang tersedia turun?');
  if (r.world.obligations.claimsOutstanding > 0) out.push('Klaim kantor gimana?');
  else if (r.world.obligations.receivablesOutstanding > 0) out.push('Piutang yang belum kembali berapa?');
  if (cat) out.push(`Kalau ${catName.split(/[\s&]+/)[0].toLowerCase()} balik normal gimana?`);
  else if (r.changed.length) out.push('Apa yang paling berubah?');
  else out.push('Apa prioritas sekarang?');
  for (const extra of ['Kenapa skor ini?', 'Apa prioritas sekarang?']) if (out.length < 3 && !out.includes(extra)) out.push(extra);
  return [...new Set(out)].slice(0, 4);
}

// ——— Cashflow ———
export function cashflowView(r: InsightV3Report) {
  const { base, claimArrives, claimDelayed } = r.scenarios, pace = Math.max(1, r.world.liquidity.dailyPace), low = base.lowest;
  const status = low.balance < 0 ? { text: 'Bisa minus sebelum gajian', tone: 'bad' as Tone } : low.balance < pace * 7 ? { text: 'Mepet, kurang dari seminggu belanja', tone: 'warn' as Tone } : { text: 'Aman sampai gajian', tone: 'good' as Tone };
  const events = [
    { date: base.points[0].date, label: 'Hari ini', amount: r.world.liquidity.free - r.world.liquidity.buffer, kind: 'now' as const },
    ...base.points.flatMap(p => p.events.filter(e => Math.abs(e.amount) >= 50_000).map(e => ({ date: p.date, label: e.label, amount: e.amount, kind: (e.kind === 'claim' ? 'claim' : 'scheduled') as 'claim' | 'scheduled' }))),
    ...(low.date !== base.points[0].date ? [{ date: low.date, label: 'Titik tersempit', amount: low.balance, kind: 'lowest' as const }] : []),
    { date: r.world.currentCycle.end, label: 'Gajian', amount: base.afterSalary - base.beforePayday, kind: 'salary' as const },
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'now' ? -1 : 1));
  const cases = r.world.obligations.claimsOutstanding > 0 && claimArrives.lowest.balance !== claimDelayed.lowest.balance ? { arrives: claimArrives, delayed: claimDelayed } : null;
  return { lowest: low, status, events, cases, beforePayday: base.beforePayday, pace };
}

// ——— Explain this cycle (narrative order) ———
export function explainView(r: InsightV3Report) {
  const hero = heroView(r), w = r.world, sections = r.explain(), cf = cashflowView(r);
  const pick = (title: string) => sections.find(s => s.title === title)?.lines || [];
  const typical = w.income.typical;
  return [
    { title: 'Keseluruhan', lines: [`Skor ${hero.score} (${hero.label.toLowerCase()}). Arah: ${hero.momentum.label.toLowerCase()}.`, hero.statement] },
    { title: 'Pemasukan', lines: [`Siklus ini masuk ${money(w.currentCycle.income)}${typical ? `; biasanya ${money(typical)} per siklus` : ''}.`, ...(w.income.irregularShare >= .1 ? [`${percent(w.income.irregularShare)} pemasukan beberapa siklus terakhir dari sumber tidak tetap.`] : [])] },
    { title: 'Pengeluaran', lines: [...pick('Ringkasan').slice(1, 2), ...pick('Penyebab utama')] },
    { title: 'Uang sampai gajian', lines: [`${cf.status.text}. Titik tersempit ±${money(cf.lowest.balance)} sekitar ${dayMonth(cf.lowest.date)}.`, `Uang tersedia ${money(w.liquidity.available)}; jatah aman ${money(w.liquidity.safeDaily)} per hari.`] },
    { title: 'Kewajiban', lines: [...pick('Kewajiban terdekat'), ...(w.obligations.claimsOutstanding ? [`Klaim kantor belum cair ${money(w.obligations.claimsOutstanding)}.`] : []), ...(w.obligations.receivablesOutstanding ? [`Piutang belum kembali ${money(w.obligations.receivablesOutstanding)}.`] : [])] },
    { title: 'Kemajuan', lines: pick('Kemajuan').length ? pick('Kemajuan') : ['Belum ada kemajuan baru yang tercatat.'] },
    { title: 'Yang perlu diperhatikan', lines: [...hero.watch.map(x => `${x.label}: ${x.reason}`), ...(r.priority.slice(0, 1).map(s => s.root.headline || s.title))].slice(0, 3).concat(hero.watch.length || r.priority.length ? [] : ['Tidak ada yang mendesak.']) },
  ].filter(s => s.lines.length);
}

// ——— Data ———
export function dataView(r: InsightV3Report) {
  const d = r.world.dataQuality;
  const headline = d.category >= .95 && d.merchant >= .6 ? 'Data cukup lengkap' : d.category < .85 ? 'Data kategori masih terbatas' : 'Data cukup, sebagian bisa dilengkapi';
  return { headline, rows: [['Berkategori', d.category], ['Ada nama tempat', d.merchant], ['Ada jam', d.time], ['Dari struk', d.receipt]] as [string, number][], receiptLine: d.receipt < .1 ? 'Riwayat struk belum cukup untuk harga barang.' : '', count: d.spendingCount };
}
