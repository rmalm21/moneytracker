/**
 * Insight V2.5 — spending signals: categories, subcategories, merchants and the overall pace.
 *
 * Every comparison is at the same point of the cycle (what earlier cycles had spent by this day), so day 5 of a
 * cycle is never compared with whole months. A change is "material" only when it is big in money, big next to the
 * category's usual size, and outside its usual swing (robust z). Giving is never framed as something to cut.
 */
import { isGiving } from '../../advisor.ts';
import { compare, stats, sum, volatility, type Baseline } from '../baseline.ts';
import { confidence } from '../confidence.ts';
import { merchantKey, type InsightContext, type Line } from '../context.ts';
import { driverTree, merchantStats } from '../drivers.ts';
import type { Driver, Evidence, InsightSignal, Status } from '../types.ts';
import { clamp01, pct, rp, short, signal } from './common.ts';

const spendLines = (lines: Line[]) => lines.filter(l => l.amount > 0);

/** The branch that explains most of a change, followed down while one branch keeps dominating. */
export function mainDriver(root: Driver): Driver[] {
  const path: Driver[] = [];
  let node: Driver | undefined = root;
  while (node?.children?.length) {
    const sign = Math.sign(node.delta);
    const best: Driver | undefined = [...node.children].filter(c => Math.sign(c.delta) === sign && c.level !== 'other').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (!best || Math.abs(best.delta) < Math.abs(node.delta) * .45) break;
    path.push(best); node = best;
  }
  return path;
}
/** "lebih sering" / "lebih mahal per transaksi" for a branch. */
export function mechanism(d: Driver) {
  const f = d.frequencyEffect || 0, t = d.ticketEffect || 0, up = d.delta > 0;
  if (!d.count?.baseline) return up ? 'kebiasaan baru' : 'berhenti';
  if (Math.abs(f) >= Math.abs(t) * 1.5) return up ? 'lebih sering' : 'lebih jarang';
  if (Math.abs(t) >= Math.abs(f) * 1.5) return up ? 'lebih mahal per transaksi' : 'lebih murah per transaksi';
  return up ? 'lebih sering dan lebih mahal' : 'lebih jarang dan lebih murah';
}
const countText = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');

function driverEvidence(d: Driver): Evidence[] {
  const out: Evidence[] = [];
  if (d.count) out.push({ label: 'Jumlah transaksi', value: `${countText(d.count.current)}×`, note: `biasanya ${countText(Math.round(d.count.baseline * 10) / 10)}× di titik yang sama` });
  if (d.count?.current && d.count.baseline) out.push({ label: 'Rata-rata per transaksi', value: rp(d.current / d.count.current), note: `biasanya ${rp(d.baseline / d.count.baseline)}` });
  if (d.frequencyEffect !== undefined && d.count?.baseline && d.count.current) out.push({ label: 'Dari frekuensi', value: `${d.frequencyEffect >= 0 ? '+' : '−'}${rp(Math.abs(d.frequencyEffect))}` }, { label: 'Dari nominal per transaksi', value: `${(d.ticketEffect || 0) >= 0 ? '+' : '−'}${rp(Math.abs(d.ticketEffect || 0))}` });
  return out;
}

type Read = { b: Baseline; tree: Driver; cur: Line[]; base: Line[][] };

/**
 * Is the change bigger than chance? Its two parts are tested on their own terms:
 *   - more/fewer purchases: purchase counts behave like a Poisson count, so z = (cC − bC) / √bC;
 *   - pricier/cheaper purchases: the average ticket against the usual spread of single tickets, z = Δavg / (σ/√cC).
 * The part that carries the change must pass (z ≥ 2 for counts, ≥ 2.5 for tickets). One purchase more or less than
 * usual never passes, and neither does a change smaller than the natural swing of the count.
 */
export function significant(r: Pick<Read, 'cur' | 'base'>, tree: Driver) {
  const cC = tree.count?.current || 0, bC = tree.count?.baseline || 0;
  const zF = (cC - bC) / Math.sqrt(Math.max(bC, 1));
  const perTx = (lines: Line[]) => [...lines.reduce((m, l) => m.set(l.tx.id, (m.get(l.tx.id) || 0) + l.amount), new Map<string, number>()).values()];
  const tickets = r.base.flatMap(perTx), s = stats(tickets);
  const bA = bC ? tree.baseline / bC : 0, cA = cC ? tree.current / cC : 0;
  const zT = cC && bC ? (cA - bA) / (Math.max(1.4826 * s.mad, bA * .1, 1) / Math.sqrt(cC)) : 0;
  const f = tree.frequencyEffect || 0, t = tree.ticketEffect || 0, sign = Math.sign(tree.delta);
  const freqOk = Math.sign(zF) === sign && Math.abs(zF) >= 2, ticketOk = Math.sign(zT) === sign && Math.abs(zT) >= 2.5;
  if (Math.abs(f) >= Math.abs(t) ? freqOk || (ticketOk && Math.abs(t) >= Math.abs(tree.delta) * .4) : ticketOk || (freqOk && Math.abs(f) >= Math.abs(tree.delta) * .4)) return true;
  // A category's total is noisy because of all its other purchases: it also counts when the branch carrying most of
  // its change (a subcategory or merchant) is clearly beyond chance on its own.
  for (const child of tree.children || []) {
    if (Math.sign(child.delta) !== sign || Math.abs(child.delta) < Math.abs(tree.delta) * .5 || child.level === 'other') continue;
    const [level, key] = (child.id.split('/').pop() || '').split(/:(.*)/s);
    const match = level === 'subcategory' ? (l: Line) => l.subcategoryId === key : level === 'merchant' ? (l: Line) => (merchantKey(l.merchant) || '∅') === key : null;
    if (match && significant({ cur: r.cur.filter(match), base: r.base.map(lines => lines.filter(match)) }, child)) return true;
  }
  return false;
}

export function spendingSignals(ctx: InsightContext): InsightSignal[] {
  const { current, today } = ctx;
  if (ctx.baseline.length < 2 || current.progress < .15) return [];
  const out: InsightSignal[] = [];
  const base = ctx.baseline.map(c => spendLines(ctx.samePoint(c)));
  const cur = spendLines(current.lines);
  const labels = [...ctx.baseline.map(c => c.label), 'Kini'];
  const income = ctx.profile.monthlyIncome || ctx.baseline.map(c => c.income).sort((a, b) => a - b)[Math.floor(ctx.baseline.length / 2)] || ctx.input.monthlySalary || 0;
  const uncategorized = ctx.quality.uncategorizedCurrent;
  const plannedIds = new Set((ctx.input.data.plannedTransactions || []).map(p => p.postedTransactionId).filter(Boolean) as string[]);
  const caveatsFor = (b: Baseline) => [
    ...(uncategorized >= .05 ? [`${pct(uncategorized)} pengeluaran siklus ini belum memiliki kategori, jadi angka per kategori bisa kurang.`] : []),
    ...(b.outliers.length ? [`${b.outliers.length} siklus yang tidak biasa tidak dihitung dalam angka biasanya.`] : []),
  ];
  const projectFull = (delta: number) => delta / Math.max(current.progress, .2);
  const focus = (kind: string, id: string) => ({ view: 'transactions', focus: `${kind}:${id}@${current.start}..${current.end}` });

  const read = (match: (l: Line) => boolean, id: string, label: string, level: Driver['level'], levels: ('subcategory' | 'merchant')[]): Read => {
    const c = cur.filter(match), bl = base.map(lines => lines.filter(match));
    const b = compare(sum(c.map(l => l.amount)), bl.map(lines => sum(lines.map(l => l.amount))), 'same-point', 20_000);
    // Drivers use the same kept cycles as the typical value, so the tree adds up to the headline change.
    return { b, cur: c, base: bl, tree: driverTree(ctx, id, label, level, c, b.kept.map(i => bl[i]), levels) };
  };
  const toneFor = (up: boolean, id: string, deltaPct: number): Status => !up ? 'positive' : isGiving(ctx.nameOf(id)) ? 'neutral' : ctx.kindOf(id) === 'want' && deltaPct >= .5 ? 'important' : 'watch';
  const severityFor = (up: boolean, deltaPct: number, delta: number, id: string) => !up ? .2 : clamp01((.2 + .45 * Math.min(1, deltaPct) + Math.min(.3, income ? projectFull(delta) / income * 2 : .1)) * (ctx.kindOf(id) === 'want' ? 1 : .85));

  const make = (r: Read, o: { signature: string; parent?: string; name: string; id: string; kind: string; minAbs: number; minPct: number }) => {
    const { b, tree } = r;
    const up = b.delta > 0, abs = Math.abs(b.delta);
    if (b.typical < 30_000 && b.current < 100_000) return null;
    if (abs < Math.max(o.minAbs, b.typical * o.minPct) || Math.abs(b.z) < 1) return null;
    // Early in a cycle a few purchases swing everything: only a big, clear change counts.
    if (current.progress < .25 && (Math.abs(b.z) < 2.5 || abs < 150_000)) return null;
    // One purchase more or less than usual is normal life, not a change (a single big purchase is the anomaly engine's).
    if (!significant(r, tree)) return null;
    // A rise that comes from purchases the user planned (a posted Rencana) is a fact, not a warning.
    const plannedAmount = up ? sum(r.cur.filter(l => l.tx.plannedId || plannedIds.has(l.tx.id)).map(l => l.amount)) : 0;
    const planned = plannedAmount > 0 && abs - plannedAmount < Math.max(o.minAbs, b.typical * o.minPct);
    const path = mainDriver(tree), main = path[path.length - 1];
    const why = path.length ? path.map(d => d.label).join(' → ') : '';
    const conf = confidence({ cycles: b.kept.length, volatility: volatility(b.stats), z: b.z, progress: current.progress, uncategorized: uncategorized >= .05 ? uncategorized : undefined, samples: tree.count?.current });
    const tone = planned ? 'neutral' : toneFor(up, o.id, b.deltaPct);
    const verb = up ? 'naik' : 'turun';
    const mech = mechanism(main || tree);
    const summary = `Sampai hari ke-${current.elapsed}: ${rp(b.current)}, biasanya ${rp(b.typical)} di titik yang sama pada siklus sebelumnya.`;
    return signal({
      signature: o.signature, domain: o.kind === 'merchant' ? 'merchant' : 'spending', type: up ? `${o.kind}_up` : `${o.kind}_down`,
      title: `${o.name} ${verb} ${b.typical ? pct(Math.abs(b.deltaPct)) : rp(abs)}`, summary,
      headline: `${o.name} ${verb} ${short(abs)}${main ? `, terutama ${main.label} (${mech})` : ` (${mech})`}`,
      tone, severity: severityFor(up, b.deltaPct, b.delta, o.id), confidence: conf, deepDive: 'spending', unit: 'money',
      current: b.current, baseline: b.typical, delta: b.delta, impact: up ? projectFull(abs) : -projectFull(abs), urgency: up ? clamp01(current.progress * .6) : 0,
      actionable: up && tone !== 'neutral', material: !planned, parent: o.parent,
      drivers: [tree],
      evidence: [
        { label: 'Siklus ini (sampai hari ini)', value: rp(b.current), txIds: tree.txIds },
        { label: 'Biasanya di titik yang sama', value: rp(b.typical), note: `rata-rata ${b.kept.length} siklus; median ${rp(b.stats.median)}` },
        { label: 'Rentang biasanya', value: `${short(b.stats.p25)} – ${short(b.stats.p75)}`, note: 'kuartil bawah – atas' },
        ...(b.previous !== null ? [{ label: 'Siklus lalu di titik yang sama', value: rp(b.previous) }] : []),
        ...driverEvidence(main || tree),
        ...(why ? [{ label: 'Penyebab utama', value: why, note: mech }] : []),
        ...(up && current.progress < .95 ? [{ label: 'Bila pola sama sampai gajian', value: `±${rp(projectFull(abs))} lebih ${up ? 'banyak' : 'sedikit'}`, note: 'perkiraan, bukan kepastian' }] : []),
      ],
      caveats: [...caveatsFor(b), ...(planned ? [`Kenaikan ini terutama dari pembelian yang sudah direncanakan (${rp(plannedAmount)}).`] : [])],
      series: { labels, values: [...r.base.map(lines => sum(lines.map(l => l.amount))), b.current] },
      action: { label: 'Lihat transaksinya', target: focus(o.kind === 'merchant' ? 'search' : 'category', o.kind === 'merchant' ? o.name : o.id) },
    }, today);
  };

  // Categories.
  const catIds = new Set([...cur, ...base.flat()].map(l => l.categoryId).filter(id => id !== 'uncategorized' && id !== 'debt-payment'));
  const catSignals = new Map<string, InsightSignal>();
  for (const id of catIds) {
    const r = read(l => l.categoryId === id, `cat:${id}`, ctx.nameOf(id), 'category', ['subcategory', 'merchant']);
    const s = make(r, { signature: `spending:category:${id}`, name: ctx.nameOf(id), id, kind: 'category', minAbs: 75_000, minPct: .2 });
    if (s) { catSignals.set(id, s); out.push(s); }
  }
  // Subcategories (under a category, with or without a category signal of their own).
  const subSignals = new Map<string, InsightSignal>();
  const subIds = new Set([...cur, ...base.flat()].filter(l => l.subcategoryId !== 'none').map(l => `${l.categoryId}|${l.subcategoryId}`));
  for (const key of subIds) {
    const [parentId, id] = key.split('|');
    const r = read(l => l.subcategoryId === id && l.categoryId === parentId, `sub:${id}`, ctx.nameOf(id), 'subcategory', ['merchant']);
    const s = make(r, { signature: `spending:subcategory:${id}`, parent: catSignals.has(parentId) ? `spending:category:${parentId}` : undefined, name: ctx.nameOf(id), id, kind: 'subcategory', minAbs: 50_000, minPct: .25 });
    if (s) { subSignals.set(id, s); out.push(s); }
  }
  // Merchants: a usual place that changed, or a new place with real money.
  for (const m of merchantStats(ctx)) {
    if (m.cycles < 2 && !(m.baselineCount === 0 && m.total >= 150_000)) continue;
    const r = read(l => merchantKey(l.merchant) === m.key, `m:${m.key}`, m.name, 'merchant', []);
    const parent = subSignals.has(m.subcategoryId) ? `spending:subcategory:${m.subcategoryId}` : catSignals.has(m.categoryId) ? `spending:category:${m.categoryId}` : undefined;
    const s = make(r, { signature: `merchant:${m.key.replace(/\s+/g, '-')}`, parent, name: m.name, id: m.categoryId, kind: 'merchant', minAbs: 50_000, minPct: .3 });
    if (s) { s.evidence.push({ label: 'Porsi dari pengeluaran siklus ini', value: pct(m.share) }, { label: 'Nominal tengah per transaksi', value: rp(m.median), note: 'median semua transaksi di tempat ini' }); out.push(s); }
  }
  // Overall pace.
  const total = read(() => true, 'total', 'Semua pengeluaran', 'category', []);
  {
    const { b } = total, abs = Math.abs(b.delta), up = b.delta > 0;
    if (abs >= Math.max(300_000, b.typical * .15) && Math.abs(b.z) >= 1.5) {
      const byCat = [...catIds].map(id => ({ id, d: sum(cur.filter(l => l.categoryId === id).map(l => l.amount)) - (b.kept.length ? b.kept.reduce((n, i) => n + sum(base[i].filter(l => l.categoryId === id).map(l => l.amount)), 0) / b.kept.length : 0) })).filter(x => Math.sign(x.d) === Math.sign(b.delta)).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
      out.push(signal({
        signature: 'cashflow:spending-pace', domain: 'cashflow', type: up ? 'pace_up' : 'pace_down',
        title: up ? `Belanja siklus ini ${pct(b.deltaPct)} lebih cepat` : `Belanja siklus ini ${pct(-b.deltaPct)} lebih pelan`,
        summary: `Sampai hari ke-${current.elapsed}: ${rp(b.current)}, biasanya ${rp(b.typical)} di titik yang sama.`,
        headline: `Total belanja ${up ? 'lebih cepat' : 'lebih pelan'} ${short(abs)} dari biasanya`,
        tone: up ? (b.deltaPct >= .3 ? 'important' : 'watch') : 'positive', severity: up ? clamp01(.3 + b.deltaPct) : .2, deepDive: 'cashflow',
        confidence: confidence({ cycles: b.kept.length, volatility: volatility(b.stats), z: b.z, progress: current.progress }),
        current: b.current, baseline: b.typical, delta: b.delta, impact: up ? projectFull(abs) : -projectFull(abs), urgency: up ? clamp01(current.progress) : 0, actionable: up, material: true,
        evidence: [
          { label: 'Siklus ini (sampai hari ini)', value: rp(b.current) }, { label: 'Biasanya di titik yang sama', value: rp(b.typical), note: `rata-rata ${b.kept.length} siklus` },
          ...byCat.slice(0, 3).map(x => ({ label: `Dari ${ctx.nameOf(x.id)}`, value: `${x.d >= 0 ? '+' : '−'}${rp(Math.abs(x.d))}` })),
        ],
        caveats: caveatsFor(b), series: { labels, values: [...base.map(lines => sum(lines.map(l => l.amount))), b.current] },
        drivers: [{ ...total.tree, children: byCat.slice(0, 4).map(x => ({ id: `pace/${x.id}`, label: ctx.nameOf(x.id), level: 'category' as const, current: 0, baseline: 0, delta: x.d })) }],
      }, today));
    }
  }
  return out;
}
