/**
 * Financial advisor: reads several salary cycles of history and turns them into a health
 * score, findings and a prioritised action plan. Pure and local — nothing leaves the device.
 */
import { budgetCurrent, budgetMonthly, budgetSpent, budgetWindow, salaryCycle, transactionExpense } from './accounting.ts';
import { categoryBreakdown } from './category-analytics.ts';
import { savingsPlan } from './savings.ts';
import { resolveInsightProfile, riskLabels, type InsightProfile } from './insight-profile.ts';
import { allocation, blendedReturn, equitySectors, futureValue, INFLATION, realValueIdle, type PlanItem } from './invest-plan.ts';
import { walletGroup } from './wallet-groups.ts';
import { emergencyPockets, isEmergencyFund, isKantong, kantongWalletIds, kantongWallets, resolveFunds } from './pockets.ts';
import type { Budget, Category, Data, LedgerTx } from './types';

export type Range = { start: string; end: string };
export type Tone = 'good' | 'warn' | 'bad' | 'info';
export type Target = { view: string; focus?: string };
export type Apply = { kind: 'set-budget'; budgetId: string; amount: number } | { kind: 'create-budget'; categoryId: string; name: string; amount: number };
/** One step of "how this number was worked out". */
export type CalcRow = { label: string; amount: number; op?: '+' | '-' | '×' | '='; note?: string; text?: string };
/** `detail` may mark key facts as **bold** and the suggested step as ==highlight==. */
export type Finding = { calc?: CalcRow[]; id: string; tone: Tone; title: string; detail: string; saving?: number; target?: Target; apply?: Apply; series?: number[]; stat?: { label: string; value: string; note?: string; progress?: number; progressLabel?: string }; seriesLabels?: string[]; score?: number };
export type CategoryStat = { id: string; name: string; icon?: string; color?: string; kind: 'need' | 'want'; history: number[]; avg: number; median: number; p75: number; current: number; projected: number; trend: number; share: number };
export type BudgetStat = { budget: Budget; name: string; usage: number[]; avgUsage: number; overCount: number; windows: number; suggested: number; status: 'loose' | 'tight' | 'ok' | 'new'; recent: number };
export type HealthPart = { key: string; label: string; score: number; weight: number; value: string; hint: string };
export type Advice = {
  enoughHistory: boolean; cyclesUsed: number; score: number; verdict: string; verdictTone: Tone; parts: HealthPart[];
  summary: { avgIncome: number; avgExpense: number; savingsRate: number; emergencyMonths: number; dsr: number; available: number; daysLeft: number; projectedSpend: number };
  cycles: { label: string; income: number; expense: number }[];
  categories: CategoryStat[]; budgets: BudgetStat[];
  actions: Finding[]; reduce: Finding[]; loose: Finding[]; budgetTips: Finding[]; habits: Finding[]; recurring: Finding[]; obligations: Finding[]; alerts: Finding[];
  split: { needs: number; wants: number; saved: number };
  /** The profile the advice was tuned to (defaults filled in). */
  personal: InsightProfile;
  wealth: Finding[]; idle: IdleInfo; invest: InvestPlan | null; paycheck: PaycheckRow[];
  impact: { monthly: number; yearly: number; grown: number; years: number };
  limits: { needs: number; wants: number; savings: number };
};
export type IdleInfo = { held: boolean; emergencyTargetText: string; emergencySource: 'kantong' | 'amount' | 'months'; savingsLabel: string; savingsNote: string; calc: CalcRow[]; opCalc: CalcRow[]; savingsCalc: CalcRow[]; needSource: 'history' | 'salary' | 'profile' | 'none'; monthlyNeed: number; budgetReserve: number; fundsDue: number; wishReserve: number; operational: number; operationalBalance: number; operationalNeed: number; savingsExcess: number; liquidReserve: number; emergencyTarget: number; emergencyShortfall: number; debtFirst: number; invested: number; total: number; investable: number; dormant: { id: string; name: string; balance: number; days: number | null }[]; inflationLoss: number };
export type InvestPlan = { amount: number; monthly: number; items: PlanItem[]; sectors: { name: string; share: number; amount: number; note: string }[] | null; expectedReturn: number; projection: { years: number; invested: number; idle: number; lump: number; lumpIdle: number }[] };
export type PaycheckRow = { key: string; label: string; amount: number; share: number; note: string; tone: Tone };
export type AdvisorInput = {
  data: Data; history: LedgerTx[]; today: string; salaryDay: number; monthlySalary: number; warnPercent: number;
  stat: { free: number; reserved: number; netWorth: number; liabilities: number }; committed: number;
  /** Cadangan aman from Kontrol keuangan: never counted as Uang tersedia. */
  safetyBuffer?: number;
  profile?: Partial<InsightProfile> | null;
};

const DAY = 86400000;
const parse = (date: string) => new Date(`${date}T12:00:00`);
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const days = (range: Range) => Math.max(1, Math.round((parse(range.end).getTime() - parse(range.start).getTime()) / DAY));
const sum = (values: number[]) => values.reduce((n, v) => n + v, 0);
const mean = (values: number[]) => values.length ? sum(values) / values.length : 0;
function quantile(values: number[], q: number) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); }
/** Round a suggested amount up to a friendly number (Rp5rb under 200rb, Rp10rb under 2jt, Rp50rb above). */
export function friendlyRound(value: number) { const step = value < 200_000 ? 5_000 : value < 2_000_000 ? 10_000 : 50_000; return Math.max(step, Math.ceil(value / step) * step); }
// Amounts in advice are estimates: show them to the nearest thousand.
const shortRp = (value: number) => Math.abs(value) >= 1e6 ? `Rp${(value / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : Math.abs(value) >= 1e3 ? `Rp${Math.round(value / 1e3)} rb` : `Rp${Math.round(value)}`;
const rp = (value: number) => `Rp${(Math.abs(value) >= 10_000 ? Math.round(value / 1000) * 1000 : Math.round(value)).toLocaleString('id-ID')}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const clamp = (value: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, value));
const inRange = (date: string, range: Range) => date >= range.start && date < range.end;

const NEED_WORDS = /(tagihan|listrik|air|pdam|gas|internet|wifi|pulsa|sewa|kost|kos|rumah|cicil|kredit|asuransi|pendidikan|sekolah|kuliah|kesehatan|obat|dokter|transport|bensin|bbm|parkir|tol|kebutuhan|belanja dapur|sembako|pajak|zakat|anak|bayi)/i;
const WANT_WORDS = /(hiburan|jajan|kopi|snack|camilan|boba|nongkrong|makan di luar|restoran|belanja|fashion|pakaian|hobi|game|langganan|streaming|liburan|rekreasi|travel|gadget|hadiah|kado|rokok|skincare|kecantikan|lainnya)/i;
/** Giving is a personal commitment: never suggested as something to cut. */
const GIVING_WORDS = /(sedekah|zakat|infa[qk]|donasi|amal|persembahan|perpuluhan|kurban|qurban|wakaf)/i;
export const isGiving = (name: string) => GIVING_WORDS.test(name);
/** Needs vs wants from the category name (food is a need, eating out and snacks are wants). */
/** Bills and groceries stay needs even when the name also has a "want" word ("Langganan internet", "Belanja bulanan"). */
const FIXED_NEED = /(tagihan|listrik|pdam|internet|wifi|pulsa|sewa|kost|cicil|kredit|asuransi|bpjs|pajak|dapur|sembako|bulanan|harian|rumah tangga|groceries|popok|susu anak)/i;
export function categoryKind(name: string, parentName?: string): 'need' | 'want' {
  if (isGiving(name) || FIXED_NEED.test(name)) return 'need';
  if (WANT_WORDS.test(name)) return 'want';
  if (NEED_WORDS.test(name) || /makan|minum|sarapan/i.test(name)) return 'need';
  // A subcategory with an unknown name follows its parent (e.g. "Warteg" under "Makan & Minum").
  return parentName ? categoryKind(parentName) : 'want';
}
const kindOf = (cat: Category | undefined, categories: Category[]) => categoryKind(cat?.name || '', cat?.parentId ? categories.find(c => c.id === cat.parentId)?.name : undefined);

/** Complete salary cycles before `current`, oldest first. */
export function pastCycles(current: Range, count: number, salaryDay: number): Range[] {
  const list: Range[] = []; let cursor = current.start;
  for (let i = 0; i < count; i++) { const before = parse(cursor); before.setDate(before.getDate() - 1); const cycle = salaryCycle(before, salaryDay); list.unshift({ start: cycle.start, end: cycle.end }); cursor = cycle.start; }
  return list;
}
function budgetWindows(budget: Budget, today: string, salaryDay: number, count: number) {
  const current = budgetWindow(budget, parse(today), salaryDay); const list: Range[] = []; let cursor = current.start;
  for (let i = 0; i < count; i++) { const before = parse(cursor); before.setDate(before.getDate() - 1); const w = budgetWindow(budget, before, salaryDay); list.unshift({ start: w.start, end: w.end }); cursor = w.start; }
  return { current: { start: current.start, end: current.end }, past: list };
}
const normalize = (text: string) => text.toLowerCase().replace(/[0-9]+/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Monthly saving of a set of suggestions, each counted once: cutting a category, its small leaks and a new
 * budget for it overlap (the largest counts), and the overall "wants too big" cut overlaps all category cuts.
 */
export function potentialSaving(list: Finding[]) {
  const perCategory = new Map<string, number>();
  let wantsTotal = 0, other = 0;
  for (const f of list) {
    const saving = f.saving || 0; if (!saving) continue;
    const cat = /^(cut|leak|new)-(.+)$/.exec(f.id)?.[2];
    if (cat) perCategory.set(cat, Math.max(perCategory.get(cat) || 0, saving));
    else if (f.id === 'split') wantsTotal = saving;
    else other += saving;
  }
  return Math.max(wantsTotal, sum([...perCategory.values()])) + other;
}

export function analyzeFinances(input: AdvisorInput): Advice {
  const { history, today, salaryDay, warnPercent } = input;
  // A kantong's amount is the balance of its wallets.
  const data = { ...input.data, funds: resolveFunds(input.data.funds, input.data.wallets) };
  const me = resolveInsightProfile(input.profile);
  // Budget style decides how tightly suggested budgets follow history.
  const budgetQ = me.budgetStyle === 'strict' ? .6 : me.budgetStyle === 'relaxed' ? .9 : .75, budgetPad = me.budgetStyle === 'strict' ? 1 : me.budgetStyle === 'relaxed' ? 1.1 : 1.05;
  const looseAt = me.budgetStyle === 'strict' ? .8 : me.budgetStyle === 'relaxed' ? .6 : .7;
  const limits = { needs: me.needsLimit || (me.household === 'family' || me.dependants > 0 ? .6 : .5), wants: me.wantsLimit || (me.budgetStyle === 'strict' ? .2 : me.budgetStyle === 'relaxed' ? .35 : .3), savings: me.savingsTarget };
  const categories: Category[] = data.categories;
  const currentCycle = salaryCycle(parse(today), salaryDay); const current: Range = { start: currentCycle.start, end: currentCycle.end };
  const cycles = pastCycles(current, 6, salaryDay);
  const earliest = history.reduce((min, tx) => tx.date < min ? tx.date : min, today);
  // Only cycles the ledger actually covers count as history.
  const recorded = cycles.filter(cycle => cycle.end > earliest && history.some(tx => inRange(tx.date, cycle)));
  // A cycle in which recording only started halfway would pull every average down: leave it out when later cycles exist.
  const startedLate = recorded.length > 1 && earliest > iso(new Date(parse(recorded[0].start).getTime() + 7 * DAY));
  const covered = startedLate ? recorded.slice(1) : recorded;
  const cycleItems = covered.map(cycle => history.filter(tx => inRange(tx.date, cycle)));
  const currentItems = history.filter(tx => inRange(tx.date, current));
  const incomeOf = (items: LedgerTx[]) => sum(items.filter(tx => tx.type === 'income').map(tx => tx.amount));
  const expenseOf = (items: LedgerTx[]) => sum(items.map(transactionExpense));
  const incomes = cycleItems.map(incomeOf), expenses = cycleItems.map(expenseOf);
  // A monthly income set in the Insight profile wins over what the ledger shows.
  const incomeOverride = resolveInsightProfile(input.profile).monthlyIncome;
  const avgIncome = incomeOverride || mean(incomes.filter(v => v > 0)) || input.monthlySalary || 0;
  const avgExpense = mean(expenses) || expenseOf(currentItems);
  const savingsRate = avgIncome > 0 ? (avgIncome - avgExpense) / avgIncome : 0;
  const elapsed = Math.max(1, Math.round((parse(today).getTime() - parse(current.start).getTime()) / DAY) + 1), total = days(current), daysLeft = Math.max(0, total - elapsed + 1);
  const progress = Math.min(1, elapsed / total);
  const currentExpense = expenseOf(currentItems);
  // Early in a cycle the pace says little; lean on history until a fifth of the cycle has passed.
  const projectedSpend = progress >= .2 || !avgExpense ? currentExpense / progress : Math.max(currentExpense, avgExpense);
  const cycleLabels = covered.map(c => parse(c.start).toLocaleDateString('id-ID', { month: 'short' }));

  // Categories: history per cycle, trend and share.
  const perCycle = cycleItems.map(items => new Map(categoryBreakdown(items, categories).map(slice => [slice.id, slice])));
  const currentSlices = new Map(categoryBreakdown(currentItems, categories).map(slice => [slice.id, slice]));
  const ids = new Set<string>([...perCycle.flatMap(map => [...map.keys()]), ...currentSlices.keys()]);
  const categoryStats: CategoryStat[] = [...ids].filter(id => id !== 'none' && id !== 'other' && id !== 'uncategorized').map(id => {
    const cat = categories.find(c => c.id === id);
    const series = perCycle.map(map => map.get(id)?.amount || 0);
    const cur = currentSlices.get(id)?.amount || 0;
    const avg = mean(series), median = quantile(series, .5), p75 = quantile(series, .75);
    const recent = mean(series.slice(-2)), earlier = mean(series.slice(0, -2));
    const trend = series.length >= 3 && earlier > 0 ? (recent - earlier) / earlier : 0;
    const projected = progress >= .2 ? cur / progress : Math.max(cur, avg);
    return { id, name: cat?.name || currentSlices.get(id)?.name || perCycle.find(m => m.get(id))?.get(id)?.name || 'Kategori', icon: cat?.icon, color: cat?.color, kind: kindOf(cat, categories), history: series, avg, median, p75, current: cur, projected, trend, share: avgExpense ? avg / avgExpense : 0 };
  }).filter(c => c.avg > 0 || c.current > 0).sort((a, b) => b.avg - a.avg || b.current - a.current);

  // Budgets: how full each window was, and a data-driven amount.
  const budgetStats: BudgetStat[] = data.budgets.filter(b => b.active).map(budget => {
    const { past, current: window } = budgetWindows(budget, today, salaryDay, budget.cycleType === 'weekly' ? 8 : 6);
    // A budget created this period gets a chance first; it is judged from the next period.
    const fresh = Boolean(budget.createdDate && budget.createdDate >= window.start);
    // Only windows recorded from (nearly) their start: a half-recorded one would look under-used.
    const windows = past.filter(w => w.end > earliest && parse(earliest).getTime() <= parse(w.start).getTime() + (parse(w.end).getTime() - parse(w.start).getTime()) * .25);
    const spent = windows.map(w => budgetSpent(budget, history.filter(tx => inRange(tx.date, w)), categories));
    const usage = spent.map(v => budget.amount ? v / budget.amount : 0);
    const withData = usage.length;
    const avgUsage = mean(usage), overCount = usage.slice(-3).filter(u => u > 1).length;
    const suggested = spent.length ? friendlyRound(quantile(spent, budgetQ) * budgetPad) : budget.amount;
    const status: BudgetStat['status'] = withData < 2 || fresh ? 'new' : avgUsage < looseAt && usage.slice(-3).every(u => u < looseAt + .15) ? 'loose' : overCount >= 2 ? 'tight' : 'ok';
    const cat = categories.find(c => c.id === (budget.subcategoryId || budget.categoryId));
    // What the last (up to) three periods typically cost: a realistic level for a budget that keeps overflowing.
    const recent = quantile(spent.slice(-3), .5);
    return { budget, name: budget.name || cat?.name || 'Anggaran', usage, avgUsage, overCount, windows: withData, suggested, status, recent };
  });

  const reduce: Finding[] = [], loose: Finding[] = [], budgetTips: Finding[] = [], habits: Finding[] = [], recurring: Finding[] = [], obligations: Finding[] = [], alerts: Finding[] = [];
  const enoughHistory = covered.length >= 2;
  const catFocus = (id: string) => ({ view: 'transactions', focus: `category:${id}@${current.start}..${current.end}` });

  // 1. What to cut: discretionary categories that are big, rising, or running hot this cycle.
  for (const c of categoryStats) {
    if (c.kind !== 'want' || c.avg < 50_000 && c.current < 50_000) continue;
    const hot = c.avg > 0 && c.projected > c.avg * 1.2 && c.current > 50_000;
    const rising = c.trend > .15;
    const heavy = c.share >= .12;
    if (!hot && !rising && !heavy) continue;
    const cut = heavy ? .2 : .15;
    const saving = Math.round(((c.avg || c.projected) * cut) / 1000) * 1000;
    const already = c.current >= c.avg * 1.2;
    const reasons = [hot && (already ? `siklus ini sudah **${rp(c.current)}**, **${pct(c.current / c.avg - 1)} di atas rata-rata**` : `siklus ini diperkirakan **${rp(c.projected)}**, **${pct(c.projected / c.avg - 1)} di atas rata-rata**`), rising && `**naik ${pct(c.trend)}** dibanding siklus-siklus sebelumnya`, heavy && `memakan **${pct(c.share)}** dari seluruh pengeluaran`].filter(Boolean).join('; ');
    reduce.push({ id: `cut-${c.id}`, tone: hot ? 'bad' : 'warn', title: `Kurangi ${c.name}`, detail: `Rata-rata **${rp(c.avg)}** per siklus — ${reasons}. ==Potong ${pct(cut)}== menghemat sekitar **${rp(saving)} per bulan**.`, saving, target: catFocus(c.id), series: [...c.history, Math.max(c.current, c.projected)], seriesLabels: [...cycleLabels, 'Kini'] });
  }
  reduce.sort((a, b) => (b.saving || 0) - (a.saving || 0));

  // 2. Where there is still room: this cycle below the usual pace, or budgets that are rarely used.
  const cut = new Set(reduce.map(f => f.id.replace('cut-', '')));
  for (const c of categoryStats) {
    if (!enoughHistory || cut.has(c.id) || c.avg < 100_000 || progress < .25) continue;
    // What past cycles had spent by the same day, so lump-sum categories aren't misread.
    const expectedSoFar = mean(cycleItems.map((items, i) => { const until = iso(new Date(parse(covered[i].start).getTime() + elapsed * DAY)); return categoryBreakdown(items.filter(tx => tx.date < until), categories).find(s => s.id === c.id)?.amount || 0; }));
    if (expectedSoFar < 50_000) continue;
    if (c.current < expectedSoFar * .7) loose.push({ id: `room-${c.id}`, tone: 'good', title: `${c.name} masih longgar`, detail: `Baru **${rp(c.current)}** dari biasanya ${rp(expectedSoFar)} di titik siklus yang sama. ==Sisa ruang sekitar ${rp(c.avg - c.current)}== kalau mengikuti rata-rata.`, target: catFocus(c.id), series: [...c.history, c.current], seriesLabels: [...cycleLabels, 'Kini'] });
  }

  // 3. Budgets: shrink the loose ones, fix the tight ones, add the missing ones.
  for (const b of budgetStats) {
    const monthlyAmount = budgetMonthly(b.budget);
    if (b.status === 'loose' && b.suggested < b.budget.amount) {
      const saving = budgetMonthly({ ...b.budget, amount: b.budget.amount - b.suggested });
      budgetTips.push({ id: `shrink-${b.budget.id}`, tone: 'good', title: `Anggaran ${b.name} bisa ditekan`, detail: `Rata-rata hanya **terpakai ${pct(b.avgUsage)}** dalam ${b.windows} periode terakhir. ==Turunkan dari ${rp(b.budget.amount)} ke ${rp(b.suggested)}== — selisih **${rp(saving)} per bulan** bisa dialihkan ke tabungan.`, saving, apply: { kind: 'set-budget', budgetId: b.budget.id, amount: b.suggested }, series: b.usage.map(u => Math.round(u * 100)), seriesLabels: b.usage.map((_, i) => `P${i + 1}`) });
    } else if (b.status === 'tight') {
      // Raise to what it really costs (never below the current amount), or cut spending by the same gap.
      const raiseTo = friendlyRound(Math.max(b.suggested, b.recent, b.budget.amount + 1));
      budgetTips.push({ id: `tight-${b.budget.id}`, tone: 'bad', title: `Anggaran ${b.name} terlalu ketat`, detail: `**Terlampaui ${b.overCount} dari ${Math.min(3, b.windows)} periode terakhir** (rata-rata terpakai ${pct(b.avgUsage)}). Pilih salah satu: ==naikkan ke ${rp(raiseTo)}== agar realistis, atau ==pangkas pengeluarannya sekitar ${rp(raiseTo - b.budget.amount)}== per periode.`, apply: { kind: 'set-budget', budgetId: b.budget.id, amount: raiseTo }, series: b.usage.map(u => Math.round(u * 100)), seriesLabels: b.usage.map((_, i) => `P${i + 1}`) });
    }
    void monthlyAmount;
  }
  const budgeted = new Set(data.budgets.filter(b => b.active).flatMap(b => [b.categoryId, b.subcategoryId].filter(Boolean) as string[]));
  for (const c of categoryStats) {
    if (!enoughHistory || budgeted.has(c.id) || !categories.some(x => x.id === c.id) || isGiving(c.name) || c.share < .06 || c.avg < 150_000) continue;
    // Needs (bills, groceries) get a realistic budget; wants start a little below the usual to nudge saving.
    const need = c.kind === 'need', amount = friendlyRound(need ? c.median : Math.min(c.median, c.avg) * .95);
    budgetTips.push({ id: `new-${c.id}`, tone: 'info', title: `Buat anggaran untuk ${c.name}`, detail: `Rata-rata **${rp(c.avg)}** per siklus (${pct(c.share)} pengeluaran) tapi **belum punya anggaran**. ==Mulai dari ${rp(amount)}== — ${need ? 'sesuai biasanya, supaya kebutuhan ini terpantau' : 'sedikit di bawah biasanya agar ada dorongan berhemat'}.`, saving: need ? 0 : Math.max(0, Math.round(c.avg - amount)), apply: { kind: 'create-budget', categoryId: c.id, name: c.name, amount }, series: c.history, seriesLabels: cycleLabels });
  }

  // 4. Small leaks: many small purchases that add up.
  const smallSpan = [...cycleItems.flat(), ...currentItems].filter(tx => transactionExpense(tx) > 0 && transactionExpense(tx) <= 50_000);
  const leakMap = new Map<string, { label: string; total: number; count: number; categoryId: string }>();
  for (const tx of smallSpan) {
    const cat = categories.find(c => c.id === (tx.subcategoryId || tx.categoryId)) || categories.find(c => c.id === tx.categoryId);
    // Everyday meals are needs; only wants and snack-like spending count as leaks.
    if (!cat || kindOf(cat, categories) === 'need' && !/kopi|jajan|snack|camilan|boba|gofood|grabfood|pesan antar/i.test(`${cat.name} ${tx.merchant} ${tx.description}`)) continue;
    const row = leakMap.get(cat.id) || { label: cat.name, total: 0, count: 0, categoryId: cat.id }; row.total += transactionExpense(tx); row.count++; leakMap.set(cat.id, row);
  }
  const spanCycles = Math.max(1, covered.length + progress);
  for (const leak of [...leakMap.values()].sort((a, b) => b.total - a.total).slice(0, 3)) {
    const perMonth = leak.total / spanCycles, perCount = leak.count / spanCycles;
    if (perMonth < 150_000 || perCount < 6) continue;
    habits.push({ id: `leak-${leak.categoryId}`, tone: 'warn', stat: { label: 'Total per siklus', value: shortRp(perMonth), note: `${Math.round(perCount)} transaksi kecil` }, title: `Kebocoran kecil di ${leak.label}`, detail: `Sekitar **${Math.round(perCount)} transaksi kecil** (≤ Rp50rb) per siklus, totalnya **${rp(perMonth)}**. ==Kurangi separuhnya== untuk menghemat **${rp(perMonth / 2)} per bulan**.`, saving: Math.round(perMonth / 2 / 1000) * 1000, target: catFocus(leak.categoryId) });
  }

  // 5. Habits: weekends, late nights, the days right after payday.
  // Habits look at everyday spending only: rent, bills and other big fixed payments are paid on set days and would skew them.
  const catOf = (tx: LedgerTx) => categories.find(c => c.id === (tx.subcategoryId || tx.categoryId)) || categories.find(c => c.id === tx.categoryId);
  const isWant = (tx: LedgerTx) => { const cat = catOf(tx); return Boolean(cat) && kindOf(cat, categories) === 'want'; };
  const allExpenses = [...cycleItems.flat(), ...currentItems].filter(tx => transactionExpense(tx) > 0 && (isWant(tx) || transactionExpense(tx) < 300_000));
  const totalAll = sum(allExpenses.map(transactionExpense));
  if (totalAll > 0 && allExpenses.length >= 20) {
    const weekend = sum(allExpenses.filter(tx => [0, 6].includes(parse(tx.date).getDay())).map(transactionExpense));
    const weekendDaily = weekend / 2, weekdayDaily = (totalAll - weekend) / 5;
    if (weekendDaily > weekdayDaily * 1.6) habits.push({ id: 'weekend', tone: 'warn', stat: { label: 'Akhir pekan vs hari kerja', value: `+${pct(weekendDaily / weekdayDaily - 1)}`, note: 'belanja per hari' }, title: 'Akhir pekan paling boros', detail: `Per hari, belanja Sabtu–Minggu **${pct(weekendDaily / weekdayDaily - 1)} lebih tinggi** dari hari kerja. ==Tentukan batas akhir pekan==, misalnya **${rp(friendlyRound(weekdayDaily * 1.3 / Math.max(1, spanCycles * 4.3) * 2))}** per akhir pekan.` });
    const timed = allExpenses.filter(tx => /^\d{2}:\d{2}$/.test(tx.time || ''));
    const night = timed.filter(tx => { const h = Number(tx.time!.slice(0, 2)); return h >= 21 || h < 4; });
    const nightShare = timed.length ? sum(night.map(transactionExpense)) / sum(timed.map(transactionExpense)) : 0;
    if (timed.length >= 15 && nightShare >= .2) habits.push({ id: 'night', tone: 'warn', stat: { label: 'Belanja di atas pukul 21.00', value: pct(nightShare), note: 'dari pengeluaran berjam' }, title: 'Sering belanja larut malam', detail: `**${pct(nightShare)} pengeluaran** yang punya jam terjadi **di atas pukul 21.00** — biasanya pesan antar atau belanja impulsif. Coba aturan =="tunda sampai besok"== untuk belanja malam.` });
    // Spending on wants in the first week after payday (bills paid early are fine and don't count).
    const firstWeek = cycleItems.map((items, i) => { const start = covered[i].start; const cut = iso(new Date(parse(start).getTime() + 7 * DAY)); const wantsOnly = items.filter(isWant); const e = expenseOf(wantsOnly); return e >= 100_000 ? expenseOf(wantsOnly.filter(tx => tx.date < cut)) / e : 0; }).filter(v => v > 0);
    const payday = mean(firstWeek);
    if (firstWeek.length >= 2 && payday >= .45) habits.push({ id: 'payday', tone: 'warn', stat: { label: 'Keinginan habis di 7 hari pertama', value: pct(payday), note: 'normalnya sekitar 25%' }, title: 'Efek gajian terasa', detail: `**${pct(payday)} belanja keinginan** (jajan, hiburan, belanja) terjadi **di 7 hari pertama** setelah gajian — normalnya sekitar 25%. Tagihan yang dibayar di awal tidak dihitung. ==Pisahkan dulu tabungan di hari gajian== sebelum belanja.` });
  }

  // 6. Recurring costs and repeats that aren't scheduled yet.
  const monthlyOf = (amount: number, frequency: string) => frequency === 'weekly' ? amount * 52 / 12 : frequency === 'yearly' ? amount / 12 : amount;
  const scheduled = data.recurring.filter(r => r.active && r.type === 'expense');
  const fixedMonthly = sum(scheduled.map(r => monthlyOf(r.amount, r.frequency)));
  if (scheduled.length) recurring.push({ id: 'fixed', tone: avgIncome && fixedMonthly / avgIncome > .5 ? 'bad' : 'info', stat: { label: 'Pengeluaran rutin', value: `${shortRp(fixedMonthly)}/bln`, note: avgIncome ? `${pct(fixedMonthly / avgIncome)} dari pemasukan` : `${scheduled.length} jadwal` }, title: `Pengeluaran rutin ${rp(fixedMonthly)} per bulan`, detail: `${scheduled.length} jadwal rutin${avgIncome ? ` — **${pct(fixedMonthly / avgIncome)} dari pemasukan**` : ''}. ==Tinjau satu per satu==: mana yang masih dipakai, mana yang bisa dihentikan atau diganti paket lebih murah.`, target: { view: 'recurring' } });
  const scheduledNames = new Set(scheduled.map(r => normalize(r.name)));
  const groups = new Map<string, { label: string; cycles: Set<number>; amounts: number[] }>();
  cycleItems.forEach((items, index) => items.filter(tx => tx.type === 'expense' && (tx.description || tx.merchant)).forEach(tx => { const key = normalize(tx.description || tx.merchant); if (!key || key.length < 3) return; const row = groups.get(key) || { label: tx.description || tx.merchant, cycles: new Set<number>(), amounts: [] }; row.cycles.add(index); row.amounts.push(tx.amount); groups.set(key, row); }));
  for (const [key, row] of groups) {
    if (row.cycles.size < 3 || scheduledNames.has(key)) continue;
    const med = quantile(row.amounts, .5); const steady = row.amounts.filter(a => Math.abs(a - med) <= med * .15).length >= row.cycles.size;
    if (!steady || row.amounts.length > row.cycles.size * 2) continue;
    recurring.push({ id: `repeat-${key}`, tone: 'info', stat: { label: 'Nominal biasanya', value: shortRp(med), note: `muncul di ${row.cycles.size} siklus` }, title: `“${row.label}” muncul tiap siklus`, detail: `Tercatat di **${row.cycles.size} siklus** dengan nominal sekitar **${rp(med)}**. ==Jadikan jadwal rutin== agar masuk perkiraan dan tidak terlewat.`, target: { view: 'recurring' } });
  }

  // 7. Obligations: debts, receivables, goals.
  const openDebts = data.debts.filter(d => d.status !== 'paid' && d.outstandingAmount > 0);
  const installments = sum(openDebts.map(d => d.installmentAmount || 0));
  const dsr = avgIncome ? installments / avgIncome : 0;
  if (openDebts.length) {
    const order = [...openDebts].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0) || a.outstandingAmount - b.outstandingAmount);
    const first = order[0];
    obligations.push({ id: 'debt', tone: dsr > .4 ? 'bad' : dsr > .3 ? 'warn' : 'info', stat: installments && avgIncome ? { label: 'Cicilan / pemasukan', value: pct(dsr), note: 'batas sehat 30%', progress: Math.min(1, dsr / .3) } : { label: 'Sisa utang', value: shortRp(sum(openDebts.map(d => d.outstandingAmount))), note: `${openDebts.length} utang aktif` }, title: installments ? `Cicilan ${pct(dsr)} dari pemasukan` : `${openDebts.length} utang aktif`, detail: `${openDebts.length} utang aktif, sisa **${rp(sum(openDebts.map(d => d.outstandingAmount)))}**. ${!installments ? 'Nominal cicilan per bulan belum diisi, jadi bebannya belum bisa dihitung. ' : !avgIncome ? '' : dsr > .3 ? '**Di atas batas sehat 30%** — ==hindari utang baru dulu==. ' : 'Masih di bawah batas sehat 30%. '} ==Prioritaskan melunasi “${first.name}”==${first.interestRate ? ` (bunga ${first.interestRate}%)` : ' (sisa terkecil)'} lebih cepat.`, target: { view: 'debts' } });
  }
  const overdue = data.receivables.filter(r => r.remainingAmount > 0 && r.dueDate && r.dueDate < today);
  if (overdue.length) obligations.push({ id: 'receivable', tone: 'warn', stat: { label: 'Belum kembali', value: shortRp(sum(overdue.map(r => r.remainingAmount))), note: `${overdue.length} orang` }, title: `${overdue.length} piutang lewat jatuh tempo`, detail: `Total **${rp(sum(overdue.map(r => r.remainingAmount)))} belum kembali**, termasuk dari ${overdue.slice(0, 3).map(r => r.person).join(', ')}. ==Tagih pelan-pelan sekarang==, sebelum makin lama.`, target: { view: 'receivables' } });
  const monthlySurplus = Math.max(0, avgIncome - avgExpense);
  // Emergency funds are covered by the emergency-fund card (with its own target), so they are not repeated here.
  for (const fund of data.funds.filter(f => !f.isArchived && !isEmergencyFund(f))) {
    const plan = savingsPlan(fund, today);
    if (plan.status === 'behind' || plan.status === 'overdue') obligations.push({ id: `fund-${fund.id}`, tone: plan.status === 'overdue' ? 'bad' : 'warn', stat: { label: 'Setoran dibutuhkan', value: plan.status === 'overdue' ? shortRp(plan.remaining) : `${shortRp(plan.perMonth)}/bln`, note: plan.status === 'overdue' ? 'masih kurang, tenggat lewat' : fund.monthlyContribution ? `rencana ${shortRp(fund.monthlyContribution)}/bln` : 'belum ada rencana setoran', progress: fund.targetAmount ? Math.min(1, (fund.currentAmount || 0) / fund.targetAmount) : undefined, progressLabel: fund.targetAmount ? `${pct(Math.min(1, (fund.currentAmount || 0) / fund.targetAmount))} terkumpul` : undefined }, title: plan.status === 'overdue' ? `Tenggat “${fund.name}” sudah lewat` : `Tujuan “${fund.name}” tertinggal`, detail: plan.status === 'overdue' ? `Tenggatnya sudah lewat dan masih kurang **${rp(plan.remaining)}**. ==Tetapkan tenggat baru== yang realistis, atau kecilkan targetnya.` : `Perlu **${rp(plan.perMonth)} per bulan** agar tepat waktu, ${fund.monthlyContribution ? `rencana saat ini ${rp(fund.monthlyContribution)}` : 'belum ada rencana setoran'}. ${plan.perMonth <= monthlySurplus ? `==Naikkan setoran ke ${rp(plan.perMonth)} per bulan== — masih muat dari rata-rata sisa uang ${rp(monthlySurplus)}.` : `Sisa uang rata-rata **hanya ${rp(monthlySurplus)}** — ==mundurkan tenggat atau kecilkan target==.`}`, target: { view: 'funds' } });
  }

  // 8. Alerts: unusually large spends this cycle, and whether cash lasts until payday.
  // Spending without a category can't be judged as a need or a want: ask to categorise it instead of guessing.
  const uncategorized = currentSlices.get('uncategorized')?.amount || 0, uncategorizedAvg = mean(perCycle.map(map => map.get('uncategorized')?.amount || 0));
  if (uncategorized >= 100_000 || avgExpense && uncategorizedAvg >= avgExpense * .05) alerts.push({ id: 'uncategorized', tone: 'info', stat: { label: 'Tanpa kategori', value: shortRp(uncategorized || uncategorizedAvg), note: uncategorized ? 'siklus ini' : 'rata-rata per siklus' }, title: 'Ada pengeluaran tanpa kategori', detail: `Pengeluaran tanpa kategori tidak ikut dinilai sebagai kebutuhan atau keinginan, jadi sarannya kurang tepat. ==Beri kategori== pada transaksinya.`, target: { view: 'transactions', focus: `category:uncategorized@${current.start}..${current.end}` } });
  for (const tx of currentItems) {
    const spend = transactionExpense(tx); if (spend < 100_000) continue;
    const peers = cycleItems.flat().filter(o => o.categoryId === tx.categoryId && transactionExpense(o) > 0).map(transactionExpense);
    const med = quantile(peers, .5);
    if (peers.length >= 5 && spend > med * 4) alerts.push({ id: `odd-${tx.id}`, tone: 'warn', stat: { label: 'Nominal', value: shortRp(spend), note: `${Math.round(spend / med)}× biasanya` }, title: `Transaksi tidak biasa: ${tx.description || tx.merchant || categories.find(c => c.id === tx.categoryId)?.name || 'pengeluaran'}`, detail: `**${rp(spend)}** pada ${parse(tx.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} — **${Math.round(spend / med)}× dari biasanya** di kategori ini. ==Pastikan nominalnya benar==.`, target: { view: 'transactions', focus: tx.id } });
  }
  const safetyBuffer = Math.max(0, input.safetyBuffer || 0);
  const available = input.stat.free - input.committed - safetyBuffer;
  const needUntilPayday = Math.max(0, projectedSpend - currentExpense);
  if (daysLeft > 0 && needUntilPayday > available) alerts.unshift({ id: 'runway', tone: 'bad', stat: { label: 'Jatah harian aman', value: shortRp(Math.max(0, available) / daysLeft), note: `${daysLeft} hari sampai gajian` }, title: 'Uang tersedia diperkirakan kurang sampai gajian', detail: `Dengan laju sekarang, ${daysLeft} hari ke depan butuh sekitar **${rp(needUntilPayday)}**, sedangkan uang tersedia **${rp(Math.max(0, available))}**. ==Batasi belanja harian ke ${rp(Math.max(0, available) / daysLeft)}== agar cukup.` });

  // Liquid reserve for emergencies: Tabungan wallets (falls back to all Disimpan wallets).
  const liveWallets = data.wallets.filter(w => !w.isArchived && w.type !== 'credit');
  // Kantong group wallets for one purpose; their money is set aside and never counted as daily or free savings.
  const funds = data.funds, inKantong = kantongWalletIds(funds);
  const savingsWallets = liveWallets.filter(w => walletGroup(w) === 'savings' && !inKantong.has(w.id));
  // Older Tujuan dana without wallets record an amount inside a savings wallet: that part is set aside too.
  // An emergency fund (kantong or not) is the emergency fund; the rest of the savings is unallocated.
  const inSavings = funds.filter(f => !f.isArchived && !isKantong(f) && savingsWallets.some(w => w.id === f.linkedWalletId));
  const earmarked = sum(inSavings.filter(f => !isEmergencyFund(f)).map(f => Math.max(0, f.currentAmount || 0)));
  const pocketsEmergency = emergencyPockets(funds);
  const unallocatedSavings = Math.max(0, sum(savingsWallets.map(w => Math.max(0, w.cachedBalance))) - sum(inSavings.map(f => Math.max(0, f.currentAmount || 0))));
  // Without Tabungan wallets, the "Disimpan" wallets are the reserve (not goal amounts, which are set aside for their goals).
  const liquidReserve = savingsWallets.length || inKantong.size ? sum(savingsWallets.map(w => Math.max(0, w.cachedBalance))) : sum(liveWallets.filter(w => w.isReserved && !inKantong.has(w.id)).map(w => Math.max(0, w.cachedBalance)));
  const emergencyCash = pocketsEmergency ? pocketsEmergency.total : Math.max(0, liquidReserve - earmarked);
  // What a month of living really costs. With little history (few cycles, or spending not recorded)
  // the average is far too low and everything would look idle, so fall back to salary minus the savings target.
  const incomeBase = avgIncome || input.monthlySalary || 0;
  const salaryEstimate = incomeBase ? incomeBase * (1 - me.savingsTarget) : 0;
  const expenseReliable = enoughHistory && (!incomeBase || avgExpense >= incomeBase * .2);
  const monthlyNeed = me.monthlyNeed || (expenseReliable ? avgExpense : Math.max(avgExpense, salaryEstimate));
  const needSource: IdleInfo['needSource'] = me.monthlyNeed ? 'profile' : expenseReliable ? 'history' : salaryEstimate ? 'salary' : avgExpense ? 'history' : 'none';
  const needNote = needSource === 'profile' ? 'kamu tentukan sendiri di Personalisasi Insight' : needSource === 'salary' ? `perkiraan: gaji ${rp(incomeBase)} − target tabungan ${pct(me.savingsTarget)}, karena riwayat pengeluaran belum cukup` : needSource === 'history' ? `rata-rata pengeluaran ${covered.length} siklus terakhir` : 'belum ada data';
  // Emergency-fund target, one source of truth: a target set on the emergency kantong wins; otherwise the
  // Insight profile (a fixed amount, or months of the monthly need).
  const pocketTarget = pocketsEmergency?.target || 0;
  const targetSource: 'kantong' | 'amount' | 'months' = pocketTarget ? 'kantong' : me.emergencyMode === 'amount' ? 'amount' : 'months';
  const emergencyTarget = targetSource === 'kantong' ? pocketTarget : targetSource === 'amount' ? me.emergencyAmount : monthlyNeed * me.emergencyMonths;
  const emergencyShortfall = Math.max(0, emergencyTarget - emergencyCash);
  const emergencyRatio = emergencyTarget > 0 ? emergencyCash / emergencyTarget : 1;
  const emergencyMonths = monthlyNeed ? emergencyCash / monthlyNeed : 0;
  const monthsText = (value: number) => `${(Math.round(value * 10) / 10).toString().replace('.', ',')} bulan`;
  const targetText = targetSource === 'months' ? `${me.emergencyMonths} bulan` : rp(emergencyTarget);
  // The emergency target may sit on a kantong or on an older Tujuan dana without wallets.
  const targetHome = pocketsEmergency?.list.some(isKantong) ? 'kantong' : 'tujuan dana';
  const targetWhere = targetSource === 'kantong' ? `target di ${targetHome} dana darurat` : targetSource === 'amount' ? 'nominal pilihanmu' : `${me.emergencyMonths} bulan kebutuhan`;
  const lastUsage = budgetStats.filter(b => b.usage.length).map(b => b.usage[b.usage.length - 1]);
  const adherence = lastUsage.length ? lastUsage.filter(u => u <= 1).length / lastUsage.length : 1;
  const runwayRatio = needUntilPayday > 0 ? Math.max(0, available) / needUntilPayday : 1.5;
  const trendRatio = expenses.length >= 3 && mean(expenses.slice(0, -1)) ? expenses[expenses.length - 1] / mean(expenses.slice(0, -1)) : 1;
  const parts: HealthPart[] = [
    { key: 'savings', label: 'Rasio menabung', weight: 25, score: clamp(savingsRate >= me.savingsTarget ? 100 : savingsRate <= 0 ? Math.max(0, 30 + savingsRate * 100) : 30 + savingsRate / me.savingsTarget * 70), value: pct(savingsRate), hint: `Targetmu ≥ ${pct(me.savingsTarget)} pemasukan tersisa tiap siklus` },
    { key: 'emergency', label: 'Dana darurat', weight: 20, score: clamp(emergencyRatio >= 1 ? 100 : emergencyRatio * 85), value: monthlyNeed ? monthsText(emergencyMonths) : shortRp(emergencyCash), hint: emergencyTarget ? `${pct(Math.min(1, emergencyRatio))} dari target ${rp(emergencyTarget)} (${targetWhere})` : 'Belum ada target' },
    { key: 'debt', label: 'Beban cicilan', weight: 15, score: clamp(dsr <= 0 ? 100 : dsr <= .3 ? 100 - dsr / .3 * 40 : Math.max(0, 60 - (dsr - .3) / .2 * 60)), value: pct(dsr), hint: 'Ideal di bawah 30% pemasukan' },
    { key: 'budget', label: 'Disiplin anggaran', weight: 15, score: clamp(adherence * 100), value: lastUsage.length ? `${Math.round(adherence * lastUsage.length)}/${lastUsage.length} aman` : 'Belum ada', hint: 'Anggaran yang tidak terlampaui di periode terakhir' },
    { key: 'runway', label: 'Bekal sampai gajian', weight: 15, score: clamp(runwayRatio >= 1.2 ? 100 : runwayRatio * 80), value: shortRp(Math.max(0, available)), hint: 'Uang tersedia dibanding perkiraan belanja sampai gajian' },
    { key: 'trend', label: 'Tren pengeluaran', weight: 10, score: clamp(trendRatio <= 1 ? 100 : 100 - (trendRatio - 1) * 200), value: trendRatio === 1 ? 'Stabil' : `${trendRatio > 1 ? '+' : ''}${pct(trendRatio - 1)}`, hint: 'Siklus terakhir dibanding rata-rata sebelumnya' },
  ];
  const score = Math.round(sum(parts.map(p => p.score * p.weight)) / sum(parts.map(p => p.weight)));
  const verdictTone: Tone = score >= 75 ? 'good' : score >= 55 ? 'info' : score >= 40 ? 'warn' : 'bad';
  const verdict = score >= 75 ? 'Keuanganmu sehat. Pertahankan kebiasaan baik dan arahkan sisa uang ke tujuan jangka panjang.' : score >= 55 ? 'Cukup baik, tapi ada beberapa hal yang bisa dirapikan untuk menambah tabungan.' : score >= 40 ? 'Perlu perhatian. Fokus ke rencana aksi di bawah untuk menambah ruang napas.' : 'Waspada. Kurangi pengeluaran tidak penting dulu dan amankan kebutuhan sampai gajian.';

  // Emergency fund and saving rate as findings too (the emergency card is added once the paycheck plan is known).
  const emergencyAt = obligations.length;
  if (enoughHistory && savingsRate < me.savingsTarget * .5) obligations.push({ id: 'saving-rate', tone: savingsRate < 0 ? 'bad' : 'warn', stat: { label: 'Sisa per siklus', value: pct(Math.max(0, savingsRate)), note: `targetmu ${pct(me.savingsTarget)}` }, title: savingsRate < 0 ? 'Pengeluaran melebihi pemasukan' : 'Tabungan jauh di bawah target', detail: `Rata-rata hanya **${pct(Math.max(0, savingsRate))} pemasukan tersisa** per siklus${savingsRate < 0 ? ` (**defisit ${rp(avgExpense - avgIncome)}**)` : ''}, targetmu ${pct(me.savingsTarget)}. ==Pangkas ${rp(Math.max(0, avgExpense - avgIncome * (1 - me.savingsTarget)))} per bulan== dari pos yang tidak penting.` });

  // Needs / wants / saved split, and the paycheck plan's numbers. Computed once here so the emergency card,
  // the "wants too big" card, the monthly-investing card and the paycheck plan all show the same amounts.
  const needs = sum(categoryStats.filter(c => c.kind === 'need').map(c => c.avg)), wants = sum(categoryStats.filter(c => c.kind === 'want').map(c => c.avg));
  const base = avgIncome || needs + wants;
  const split = base ? { needs: needs / base, wants: wants / base, saved: Math.max(0, 1 - (needs + wants) / base) } : { needs: 0, wants: 0, saved: 0 };
  const wishes = (data.wishlist || []).filter(w => w.status === 'active');
  // Monthly need of the goals (the emergency fund has its own row, so it isn't counted twice).
  const activeGoals = data.funds.filter(f => !f.isArchived && !isEmergencyFund(f) && savingsPlan(f, today).status !== 'reached');
  const goalNeeds = sum(activeGoals.map(f => { const plan = savingsPlan(f, today); return Math.max(plan.perMonth || 0, f.monthlyContribution || 0); }));
  // Cicilan is not an expense in the ledger, so it gets its own row on top of everyday needs and bills.
  const needsBudget = Math.max(needs, fixedMonthly);
  const saveTarget = avgIncome * me.savingsTarget;
  const room = Math.max(0, avgIncome - needsBudget - installments);
  const saveAmount = Math.min(saveTarget, room);
  const left = Math.max(0, avgIncome - needsBudget - installments - saveAmount);
  const wantsBudget = Math.min(left, avgIncome * limits.wants), extra = left - wantsBudget;
  // Wish-list set-asides come out of the wants allowance.
  const wishMonthly = Math.min(wantsBudget, sum(wishes.filter(w => (w.saved || 0) < w.price).map(w => w.monthly || 0)));
  // Emergency fund first and fast: up to 60% of each month's saving until it is full.
  const toEmergency = emergencyShortfall > 0 ? Math.round(Math.min(saveAmount * .6, emergencyShortfall) / 10_000) * 10_000 : 0;
  const toGoals = Math.min(goalNeeds, saveAmount - toEmergency);
  const toInvest = Math.max(0, saveAmount - toEmergency - toGoals);

  const haveRows: CalcRow[] = pocketsEmergency ? pocketsEmergency.list.map(f => ({ label: `Kantong ${f.name}`, amount: Math.max(0, f.currentAmount || 0), note: isKantong(f) ? `saldo ${kantongWallets(f, data.wallets).map(w => w.name).join(' + ')}` : 'tujuan dana darurat' })) : [{ label: 'Saldo dompet Tabungan', amount: liquidReserve }, ...(earmarked ? [{ op: '-' as const, label: 'Sudah dipakai untuk tujuan dana', amount: earmarked }] : [])];
  if (emergencyTarget > 0 && emergencyShortfall > 0) {
    const targetRows: CalcRow[] = targetSource === 'kantong' ? [{ label: `Target di ${targetHome} dana darurat`, amount: pocketTarget }, { op: '=', label: 'Target dana darurat', amount: emergencyTarget }]
      : targetSource === 'amount' ? [{ label: 'Target dana darurat (nominal pilihanmu)', amount: emergencyTarget, note: monthlyNeed ? `setara ${monthsText(emergencyTarget / monthlyNeed)} kebutuhan` : undefined }, { op: '=', label: 'Target dana darurat', amount: emergencyTarget }]
      : [{ label: 'Kebutuhan hidup per bulan', amount: monthlyNeed, note: needNote }, { op: '×', label: 'Target dana darurat', amount: 0, text: `${me.emergencyMonths} bulan` }, { op: '=', label: 'Target dana darurat', amount: emergencyTarget }];
    // The monthly amount is the paycheck plan's emergency row; without income data, spread over a year.
    const monthly = toEmergency || friendlyRound(emergencyShortfall / 12), months = Math.ceil(emergencyShortfall / monthly);
    const autoBigger = targetSource === 'months' && me.income === 'variable' && !input.profile?.emergencyMonths;
    const plan = avgIncome && !saveAmount ? `Saat ini pemasukan habis untuk kebutuhan${installments ? ' dan cicilan' : ''}, jadi belum ada yang bisa disisihkan — ==kurangi pengeluaran dulu==, lalu isi dana darurat.` : `==Sisihkan ${rp(monthly)} per bulan==${toEmergency ? ' (bagian dana darurat di rencana gajian)' : ''} — penuh dalam **±${months} bulan**.`;
    obligations.splice(emergencyAt, 0, { calc: [...targetRows, ...haveRows, { op: '=', label: 'Dana darurat yang ada', amount: emergencyCash }, { op: '=', label: 'Masih kurang', amount: emergencyShortfall }], id: 'emergency', tone: emergencyRatio < 1 / 3 ? 'bad' : 'warn', stat: { label: 'Dana darurat', value: monthlyNeed ? monthsText(emergencyMonths) : shortRp(emergencyCash), note: `targetmu ${targetText}`, progress: Math.min(1, emergencyRatio), progressLabel: `${pct(Math.min(1, emergencyRatio))} dari target` }, title: 'Dana darurat belum cukup', detail: `Dana daruratmu **${rp(emergencyCash)}**${monthlyNeed ? ` (setara **${monthsText(emergencyMonths)}** kebutuhan)` : ''}. Target ${targetSource === 'months' ? `${me.emergencyMonths} bulan = ${rp(emergencyTarget)}` : `${rp(emergencyTarget)} (${targetWhere})`}${autoBigger ? ', lebih besar karena penghasilan tidak tetap' : ''}; **kurang ${rp(emergencyShortfall)}**. ${plan}`, target: { view: 'wallets' } });
  }

  // Wants above what is left after needs, cicilan and the savings target.
  const wantsOver = avgIncome ? wants - wantsBudget : 0, wantsTooBig = Boolean(avgIncome) && wantsOver >= Math.max(100_000, wantsBudget * .1);
  if (enoughHistory && wantsTooBig) reduce.push({ id: 'split', tone: 'warn', stat: { label: 'Keinginan per bulan', value: shortRp(wants), note: `batas aman ${shortRp(wantsBudget)}` }, title: 'Porsi keinginan terlalu besar', detail: `Keinginan (jajan, hiburan, belanja) rata-rata **${rp(wants)}** per siklus (${pct(split.wants)} pemasukan). Setelah kebutuhan${installments ? ', cicilan' : ''} dan target tabungan ${pct(me.savingsTarget)}, batas amannya **${rp(wantsBudget)}**. ==Kurangi sekitar ${rp(wantsOver)} per bulan==.`, saving: Math.round(wantsOver / 1000) * 1000 });

  // 9. Idle money and where it could work harder, tuned to the risk profile.
  const wealth: Finding[] = [];
  // Daily money: Operasional wallets that are not marked "Disimpan" and not in a kantong.
  const opWallets = liveWallets.filter(w => walletGroup(w) === 'operational' && !w.isReserved && !inKantong.has(w.id));
  // Tujuan dana (without a kantong) that keep their money inside these wallets.
  const opGoals = sum(funds.filter(f => !f.isArchived && !isKantong(f) && opWallets.some(w => w.id === f.linkedWalletId)).map(f => Math.max(0, f.currentAmount || 0)));
  const operationalBalance = sum(opWallets.map(w => Math.max(0, w.cachedBalance)));
  // Money already spoken for this cycle, so it is never called idle:
  // unspent budgets (or the spending forecast, whichever is larger), bills and plans, goal and wish-list set-asides.
  const inCycle = (date: string) => inRange(date, current);
  // A category budget and its subcategory budgets overlap: count the parent only, as the Anggaran page does.
  const activeBudgets = data.budgets.filter(b => b.active);
  const budgetReserve = sum(activeBudgets.filter(b => !b.subcategoryId || !activeBudgets.some(parent => parent.categoryId === b.categoryId && !parent.subcategoryId)).map(b => { const status = budgetCurrent(b, history, categories, parse(today), salaryDay); return status.end > today ? Math.max(0, status.remaining) : 0; }));
  const forecastLeft = Math.round((expenseReliable ? needUntilPayday : Math.max(needUntilPayday, monthlyNeed * daysLeft / total)) / 1000) * 1000;
  const spendReserve = Math.max(forecastLeft, budgetReserve);
  const fundsDue = sum(data.funds.filter(f => !f.isArchived && (f.monthlyContribution || 0) > 0).map(f => { if (savingsPlan(f, today).status === 'reached') return 0; const paid = sum(history.filter(tx => tx.fundId === f.id && tx.type === 'fund_contribution' && inCycle(tx.date)).map(tx => tx.amount)); return Math.max(0, (f.monthlyContribution || 0) - paid); }));
  const wishSaved = sum(wishes.map(w => Math.max(0, w.saved || 0)));
  const wishDue = sum(wishes.map(w => { const monthly = w.monthly || 0; if (!monthly || (w.saved || 0) >= w.price) return 0; const done = sum((w.history || []).filter(h => inCycle(h.date)).map(h => h.amount)); return Math.max(0, Math.min(monthly - done, w.price - (w.saved || 0))); }));
  // One cushion for surprises: Insight's own estimate, or the user's Cadangan aman when that is larger (never both).
  const ownBuffer = Math.round(monthlyNeed * me.buffer / 1000) * 1000, buffer = Math.max(ownBuffer, safetyBuffer);
  const operationalNeed = spendReserve + input.committed + fundsDue + wishDue + buffer + opGoals;
  const rawOperational = needSource === 'none' ? 0 : Math.max(0, operationalBalance - operationalNeed);
  // Money set aside for wishes sits in these wallets too: take it out of "idle" first.
  const wishFromOp = Math.min(wishSaved, rawOperational), idleOperational = rawOperational - wishFromOp;
const savingsExcess = pocketsEmergency ? Math.max(0, unallocatedSavings + Math.max(0, emergencyCash - emergencyTarget) - (wishSaved - wishFromOp)) : Math.max(0, emergencyCash - emergencyTarget - (wishSaved - wishFromOp));
  const spendLabel = spendReserve === budgetReserve && budgetReserve > 0 ? 'Sisa anggaran periode ini' : expenseReliable ? 'Perkiraan belanja sampai gajian' : 'Perkiraan belanja sampai gajian (dari gaji)';
  const spendNote = spendReserve === budgetReserve && budgetReserve > 0 ? `sisa ${activeBudgets.length} anggaran aktif` : expenseReliable ? `laju belanja siklus ini, ${daysLeft} hari lagi` : `${rp(monthlyNeed)}/bln × ${daysLeft} dari ${total} hari`;
  const opCalc: CalcRow[] = [
    { label: 'Saldo dompet Operasional', amount: operationalBalance, note: opWallets.map(w => w.name).join(', ') },
    { op: '-', label: spendLabel, amount: spendReserve, note: spendNote },
    ...(input.committed ? [{ op: '-' as const, label: 'Tagihan & rencana belum dibayar', amount: input.committed }] : []),
    ...(fundsDue ? [{ op: '-' as const, label: 'Setoran tujuan dana bulan ini', amount: fundsDue }] : []),
    ...(opGoals ? [{ op: '-' as const, label: 'Sudah terkumpul untuk tujuan dana', amount: opGoals, note: 'disimpan di dompet ini' }] : []),
    ...(wishDue ? [{ op: '-' as const, label: 'Sisihan wish list bulan ini', amount: wishDue }] : []),
    safetyBuffer > ownBuffer ? { op: '-', label: 'Cadangan aman', amount: buffer, note: 'diatur di Pengaturan → Kontrol keuangan' } : { op: '-', label: `Cadangan tak terduga (${pct(me.buffer)})`, amount: buffer, note: `${pct(me.buffer)} × kebutuhan ${rp(monthlyNeed)}/bln` },
    ...(wishFromOp ? [{ op: '-' as const, label: 'Uang yang sudah disisihkan untuk wish list', amount: wishFromOp }] : []),
    { op: '=', label: 'Menganggur di dompet harian', amount: idleOperational },
  ];
  const savingsCalc: CalcRow[] = pocketsEmergency ? [{ label: 'Tabungan di luar kantong', amount: unallocatedSavings }, { op: '+', label: 'Kelebihan kantong dana darurat', amount: Math.max(0, emergencyCash - emergencyTarget), note: `di atas target ${targetText}` }, ...(wishSaved - wishFromOp > 0 ? [{ op: '-' as const, label: 'Disisihkan untuk wish list', amount: wishSaved - wishFromOp }] : []), { op: '=', label: 'Kelebihan tabungan', amount: savingsExcess }] : [...haveRows, { op: '=', label: 'Dana darurat yang ada', amount: emergencyCash }, { op: '-', label: `Target dana darurat (${targetText})`, amount: emergencyTarget, note: targetSource === 'months' ? needNote : targetWhere }, ...(wishSaved - wishFromOp > 0 ? [{ op: '-' as const, label: 'Disisihkan untuk wish list', amount: wishSaved - wishFromOp }] : []), { op: '=', label: 'Kelebihan tabungan', amount: savingsExcess }];
  const invested = sum(liveWallets.filter(w => walletGroup(w) === 'investment').map(w => Math.max(0, w.cachedBalance)));
  const lastUse = new Map<string, string>();
  for (const tx of history) for (const id of [tx.walletId, tx.destinationWalletId]) if (id && (!lastUse.has(id) || tx.date > lastUse.get(id)!)) lastUse.set(id, tx.date);
  const dormant = opWallets.filter(w => w.cachedBalance >= 1_000_000).map(w => { const last = lastUse.get(w.id); const idleDays = last ? Math.round((parse(today).getTime() - parse(last).getTime()) / DAY) : null; return { id: w.id, name: w.name, balance: w.cachedBalance, days: idleDays }; }).filter(w => w.days === null || w.days >= 60);
  const runwayShort = alerts.some(a => a.id === 'runway');
  const idleTotal = idleOperational + savingsExcess;
  const highDebts = openDebts.filter(d => (d.interestRate || 0) >= 8);
  const afterEmergency = Math.max(0, idleTotal - emergencyShortfall);
  const debtFirst = Math.min(afterEmergency, sum(highDebts.map(d => d.outstandingAmount)));
  const investable = runwayShort ? 0 : Math.max(0, afterEmergency - debtFirst);
  const idleCalc: CalcRow[] = [{ label: 'Menganggur di dompet harian', amount: idleOperational }, { op: '+', label: 'Kelebihan tabungan', amount: savingsExcess }, { op: '=', label: 'Total uang menganggur', amount: idleTotal }, ...(emergencyShortfall ? [{ op: '-' as const, label: 'Disarankan untuk dana darurat dulu', amount: Math.min(idleTotal, emergencyShortfall), note: 'sebelum berinvestasi' }] : []), ...(debtFirst ? [{ op: '-' as const, label: 'Dipakai melunasi utang berbunga ≥ 8%', amount: debtFirst }] : []), ...(runwayShort ? [{ op: '-' as const, label: 'Ditahan: uang tersedia kurang sampai gajian', amount: afterEmergency - debtFirst }] : []), { op: '=', label: 'Siap diinvestasikan', amount: investable }];
  const savingsLabel = pocketsEmergency ? 'Tabungan di luar kantong' : 'Tabungan di atas dana darurat';
  const savingsNote = pocketsEmergency ? `belum punya tujuan${Math.max(0, emergencyCash - emergencyTarget) ? ` · + lebih kantong darurat ${shortRp(Math.max(0, emergencyCash - emergencyTarget))}` : ''}` : `tabungan ${shortRp(liquidReserve)} · target ${shortRp(emergencyTarget)}`;
  const idle: IdleInfo = { held: runwayShort && afterEmergency - debtFirst > 0, emergencyTargetText: targetSource === 'kantong' ? `${rp(emergencyTarget)} (dari ${targetHome})` : targetText, emergencySource: targetSource, savingsLabel, savingsNote, calc: idleCalc, opCalc, savingsCalc, needSource, monthlyNeed, budgetReserve, fundsDue, wishReserve: wishSaved + wishDue, operational: idleOperational, operationalBalance, operationalNeed, savingsExcess, liquidReserve, emergencyTarget, emergencyShortfall, debtFirst, invested, total: idleTotal, investable, dormant, inflationLoss: Math.round(idleTotal * INFLATION) };
  const riskName = riskLabels[me.risk].label;

  // Regular investing is the paycheck plan's investment row, so both always agree. Not while spending exceeds income.
  const monthlyInvest = enoughHistory && savingsRate < 0 ? 0 : Math.round(toInvest / 10_000) * 10_000;
  let invest: InvestPlan | null = null;
  const minIdle = me.idleMinimum;
  if (investable >= Math.max(1, minIdle) || monthlyInvest >= 100_000) {
    const items = allocation(me.risk, me.horizon, me.experience, investable, { syariah: me.syariah, excluded: me.excluded });
    const r = blendedReturn(items);
    const stocks = items.find(i => i.key === 'saham');
    invest = { amount: Math.round(investable / 1000) * 1000, monthly: monthlyInvest, items, expectedReturn: r,
      sectors: stocks ? equitySectors.map(s => ({ ...s, amount: Math.round(stocks.amount * s.share / 100 / 1000) * 1000 })) : null,
      projection: [1, 3, 5, 10].map(years => ({ years, invested: futureValue(investable, monthlyInvest, r, years), idle: realValueIdle(investable + monthlyInvest * 12 * years, years), lump: futureValue(investable, 0, r, years), lumpIdle: realValueIdle(investable, years) })) };
  }
  // Never call daily money idle while the runway alert says it may not last until payday.
  if (!runwayShort && idleOperational >= Math.max(1, minIdle)) wealth.push({ id: 'idle-operational', calc: opCalc, tone: 'good', stat: { label: 'Menganggur di dompet harian', value: shortRp(idleOperational), note: `di atas kebutuhan ${daysLeft} hari ke depan` }, title: 'Ada uang menganggur di dompet harian', detail: `Saldo dompet operasional **${rp(operationalBalance)}**, sedangkan yang sudah terpakai rencana sampai gajian (${spendReserve === budgetReserve && budgetReserve > 0 ? 'sisa anggaran' : 'perkiraan belanja'}, tagihan, setoran tujuan${wishSaved || wishDue ? ', wish list' : ''}, plus ${safetyBuffer > ownBuffer ? 'cadangan aman' : `cadangan ${pct(me.buffer)}`}) sekitar **${rp(operationalNeed + wishFromOp)}**.${needSource === 'salary' ? ' Karena riwayat pengeluaran belum cukup, kebutuhan diperkirakan dari gajimu.' : ''} ${emergencyShortfall > 0 ? `==Pindahkan ${rp(Math.min(idleOperational, emergencyShortfall))} ke dana darurat== dulu, sisanya bisa diinvestasikan.` : `==Pindahkan sekitar ${rp(idleOperational)}== ke instrumen yang sesuai profil ${riskName}-mu.`}`, target: { view: 'wallets' } });
  // With kantong, savings outside every kantong simply have no purpose yet: never assume they belong to the emergency fund.
  const spareOutside = pocketsEmergency ? Math.max(0, unallocatedSavings - (wishSaved - wishFromOp)) : 0, emergencySurplus = Math.max(0, emergencyCash - emergencyTarget);
  if (savingsExcess >= Math.max(1, minIdle)) wealth.push(pocketsEmergency ? { id: 'idle-savings', calc: savingsCalc, tone: 'good', stat: { label: spareOutside ? 'Tabungan di luar kantong' : 'Kantong dana darurat berlebih', value: shortRp(savingsExcess), note: spareOutside ? 'belum masuk kantong mana pun' : `di atas target ${targetText}` }, title: spareOutside ? 'Ada tabungan yang belum punya tujuan' : 'Dana darurat melebihi target', detail: `${spareOutside ? `**${rp(spareOutside)}** di dompet Tabungan tidak masuk kantong mana pun.` : ''}${emergencySurplus ? ` Kantong dana darurat **${rp(emergencySurplus)}** di atas targetmu (${rp(emergencyTarget)}).` : ''} ${runwayShort ? ' Uang tersedia diperkirakan kurang sampai gajian, jadi ==jangan diinvestasikan dulu==; pakai seperlunya untuk menutup kekurangan, lalu beri tujuan setelah gajian.' : ' Dibiarkan mengendap, nilai riilnya **turun sekitar ' + rp(savingsExcess * INFLATION) + ' per tahun** karena inflasi. ==Beri tujuan==: masukkan ke kantong yang kamu mau, atau investasikan sesuai rencana di bawah — kamu yang menentukan.'}`.trim(), target: { view: 'wallets' } } : { id: 'idle-savings', calc: savingsCalc, tone: 'good', stat: { label: 'Tabungan di atas dana darurat', value: shortRp(savingsExcess), note: `dana darurat ${targetText} sudah aman` }, title: 'Tabungan melebihi kebutuhan dana darurat', detail: `Dana darurat ${targetText} (**${rp(emergencyTarget)}**) sudah terpenuhi, masih ada kelebihan **${rp(savingsExcess)}** yang hanya mengendap.${runwayShort ? ' Uang tersedia diperkirakan kurang sampai gajian, jadi ==jangan diinvestasikan dulu==.' : ` Dibiarkan, nilai riilnya **turun sekitar ${rp(savingsExcess * INFLATION)} per tahun** karena inflasi. ==Investasikan kelebihannya== sesuai rencana di bawah.`}`, target: { view: 'wallets' } });
  if (dormant.length) wealth.push({ id: 'dormant', tone: 'info', stat: { label: 'Saldo mengendap', value: shortRp(sum(dormant.map(d => d.balance))), note: `${dormant.length} dompet tanpa transaksi ≥ 60 hari` }, title: 'Dompet yang lama tidak bergerak', detail: `${dormant.map(d => `**${d.name}** (${rp(d.balance)}${d.days === null ? ', belum pernah dipakai' : `, ${d.days} hari`})`).join(', ')}. Kalau memang disimpan, ==pertimbangkan pindah ke RDPU atau deposito== agar tetap berbunga dan mudah dicairkan.`, target: { view: 'wallets' } });
  if (debtFirst > 0) wealth.push({ id: 'debt-first', tone: 'warn', stat: { label: 'Utang berbunga tinggi', value: shortRp(debtFirst), note: `bunga ≥ 8% per tahun` }, title: 'Lunasi utang berbunga tinggi sebelum investasi', detail: `Bunga ${highDebts.map(d => `“${d.name}” ${d.interestRate}%`).join(', ')} lebih tinggi dari rata-rata imbal hasil investasi yang aman. ==Pakai ${rp(debtFirst)} dari uang menganggur untuk melunasinya== — itu "imbal hasil" pasti.`, target: { view: 'debts' } });
  if (invest && invest.amount >= Math.max(1, minIdle)) {
    const top = invest.items.slice(0, 3).map(i => `${i.name} ${i.share}%`).join(', ');
    wealth.push({ id: 'invest', calc: idleCalc, tone: 'good', stat: { label: `Siap diinvestasikan · profil ${riskName}`, value: shortRp(invest.amount), note: `perkiraan ±${(invest.expectedReturn * 100).toFixed(1).replace('.', ',')}% per tahun` }, title: `Investasikan ${shortRp(invest.amount)} sesuai profil ${riskName}`, detail: `Setelah dana darurat${debtFirst ? ' dan utang berbunga tinggi' : ''} aman, **${rp(invest.amount)}** bisa mulai bekerja. Susunan yang cocok: ${top}. Dalam 5 tahun bisa menjadi sekitar **${rp(invest.projection[2].lump)}**, sedangkan bila didiamkan nilai riilnya tinggal **${rp(invest.projection[2].lumpIdle)}**. ==Lihat pembagian lengkapnya== di bagian Uang menganggur & investasi.` });
  }
  if (invest && invest.monthly >= 100_000) wealth.push({ id: 'invest-monthly', tone: 'info', stat: { label: 'Investasi rutin', value: `${shortRp(invest.monthly)}/bln`, note: 'setelah dana darurat & tujuan' }, title: 'Mulai investasi rutin tiap gajian', detail: `Dari targetmu menabung ${pct(me.savingsTarget)}, setelah dana darurat dan tujuan dana, masih ada sekitar **${rp(invest.monthly)} per bulan**. ==Atur autodebet di hari gajian== ke instrumen sesuai profil ${riskName} — rutin lebih penting daripada menebak waktu.` });
  if (monthlyNeed && emergencyCash >= monthlyNeed * 2) wealth.push({ id: 'emergency-yield', tone: 'info', stat: { label: 'Dana darurat', value: shortRp(Math.min(emergencyCash, emergencyTarget || emergencyCash)), note: 'bisa tetap berbunga' }, title: 'Dana darurat bisa lebih produktif', detail: `Simpan **1 bulan kebutuhan (${rp(monthlyNeed)})** di rekening yang bisa ditarik kapan saja, ==sisanya taruh di reksa dana pasar uang== — tetap cair dalam 1–2 hari kerja tapi imbal hasilnya di atas tabungan biasa.` });

  // 10. Paycheck plan: how the next salary could be split for this profile (numbers worked out above).
  const share = (v: number) => avgIncome ? v / avgIncome : 0;
  const paycheck: PaycheckRow[] = avgIncome ? [
    { key: 'needs', label: 'Kebutuhan pokok & tagihan', amount: needsBudget, share: share(needsBudget), note: `rata-rata kebutuhanmu, termasuk tagihan rutin`, tone: (share(needsBudget) > limits.needs ? 'warn' : 'info') as Tone },
    ...(installments ? [{ key: 'debt', label: 'Cicilan utang', amount: installments, share: share(installments), note: `${openDebts.length} utang aktif`, tone: (dsr > .3 ? 'warn' : 'info') as Tone }] : []),
    ...(toEmergency ? [{ key: 'emergency', label: 'Dana darurat', amount: toEmergency, share: share(toEmergency), note: `sampai target ${rp(emergencyTarget)} terkumpul · ±${Math.ceil(emergencyShortfall / toEmergency)} bulan`, tone: 'good' as Tone }] : []),
    ...(toGoals ? [{ key: 'goals', label: 'Tujuan dana', amount: toGoals, share: share(toGoals), note: `${activeGoals.length} tujuan aktif`, tone: 'good' as Tone }] : []),
    ...(toInvest ? [{ key: 'invest', label: `Investasi (profil ${riskName})`, amount: toInvest, share: share(toInvest), note: 'autodebet di hari gajian', tone: 'good' as Tone }] : []),
    ...(extra >= 50_000 ? [{ key: 'extra', label: 'Sisa lebih → tambah tabungan', amount: extra, share: share(extra), note: 'di luar target, bisa menambah investasi atau tujuan', tone: 'good' as Tone }] : []),
    ...(wishMonthly ? [{ key: 'wish', label: 'Wish list', amount: wishMonthly, share: share(wishMonthly), note: `${wishes.filter(w => (w.monthly || 0) > 0 && (w.saved || 0) < w.price).length} impian yang sedang ditabung`, tone: 'good' as Tone }] : []),
    { key: 'wants', label: 'Keinginan (batas aman)', amount: wantsBudget - wishMonthly, share: share(wantsBudget - wishMonthly), note: wantsTooBig ? `sekarang ${rp(wants)} — perlu dikurangi ${rp(wantsOver)}` : wantsOver > 0 ? `sekarang ${rp(wants)} — sedikit di atas batas` : `sekarang ${rp(wants)} — masih aman`, tone: (wantsTooBig ? 'warn' : 'info') as Tone },
  ].map(row => ({ ...row, amount: Math.round(row.amount / 1000) * 1000 })) : [];

  // Action plan: the most valuable steps first.
  // The user's main priority lifts matching steps up the plan.
  const boost: Record<InsightProfile['priority'], RegExp> = { emergency: /^(emergency|idle-)/, debt: /^(debt|debt-first)$/, invest: /^(invest|idle-|dormant|emergency-yield)/, home: /^(fund-|invest)/, education: /^fund-/, retire: /^(invest|fund-)/, travel: /^fund-/ };
  const rank = (f: Finding) => (f.tone === 'bad' ? 3e9 : f.tone === 'warn' ? 2e9 : 1e9) + (boost[me.priority].test(f.id) ? 1.5e9 : 0) + (f.saving || 0);
  const actions = [...alerts.filter(a => a.id === 'runway'), ...reduce, ...budgetTips.filter(b => b.id.startsWith('shrink') || b.id.startsWith('tight') || b.id.startsWith('new')), ...habits, ...obligations, ...wealth.filter(w => /^(idle-|invest$|debt-first)/.test(w.id))]
    .sort((a, b) => rank(b) - rank(a)).filter((f, i, list) => list.findIndex(x => x.id === f.id) === i).slice(0, 6);

  return {
    enoughHistory, cyclesUsed: covered.length, score, verdict, verdictTone, parts,
    summary: { avgIncome, avgExpense, savingsRate, emergencyMonths, dsr, available, daysLeft, projectedSpend },
    cycles: covered.map((c, i) => ({ label: cycleLabels[i], income: incomes[i], expense: expenses[i] })).concat([{ label: 'Kini', income: incomeOf(currentItems), expense: currentExpense }]),
    categories: categoryStats, budgets: budgetStats, actions, reduce, loose, budgetTips, habits, recurring, obligations, alerts: alerts.filter(a => a.id !== 'runway' || !actions.some(x => x.id === 'runway')), split,
    personal: me, wealth, idle, invest, paycheck, limits: { ...limits, wants: avgIncome ? wantsBudget / avgIncome : limits.wants },
    impact: (() => { const monthly = potentialSaving(actions); const r = invest?.expectedReturn || .05; return { monthly, yearly: monthly * 12, grown: futureValue(0, monthly, r, 5), years: 5 }; })(),
  };
}
