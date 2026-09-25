/**
 * Financial advisor: reads several salary cycles of history and turns them into a health
 * score, findings and a prioritised action plan. Pure and local — nothing leaves the device.
 */
import { budgetMonthly, budgetSpent, budgetWindow, salaryCycle, transactionExpense } from './accounting.ts';
import { categoryBreakdown } from './category-analytics.ts';
import { savingsPlan } from './savings.ts';
import type { Budget, Category, Data, LedgerTx } from './types';

export type Range = { start: string; end: string };
export type Tone = 'good' | 'warn' | 'bad' | 'info';
export type Target = { view: string; focus?: string };
export type Apply = { kind: 'set-budget'; budgetId: string; amount: number } | { kind: 'create-budget'; categoryId: string; name: string; amount: number };
/** `detail` may mark key facts as **bold** and the suggested step as ==highlight==. */
export type Finding = { id: string; tone: Tone; title: string; detail: string; saving?: number; target?: Target; apply?: Apply; series?: number[]; stat?: { label: string; value: string; note?: string; progress?: number; progressLabel?: string }; seriesLabels?: string[]; score?: number };
export type CategoryStat = { id: string; name: string; icon?: string; color?: string; kind: 'need' | 'want'; history: number[]; avg: number; median: number; p75: number; current: number; projected: number; trend: number; share: number };
export type BudgetStat = { budget: Budget; name: string; usage: number[]; avgUsage: number; overCount: number; windows: number; suggested: number; status: 'loose' | 'tight' | 'ok' | 'new' };
export type HealthPart = { key: string; label: string; score: number; weight: number; value: string; hint: string };
export type Advice = {
  enoughHistory: boolean; cyclesUsed: number; score: number; verdict: string; verdictTone: Tone; parts: HealthPart[];
  summary: { avgIncome: number; avgExpense: number; savingsRate: number; emergencyMonths: number; dsr: number; available: number; daysLeft: number; projectedSpend: number };
  cycles: { label: string; income: number; expense: number }[];
  categories: CategoryStat[]; budgets: BudgetStat[];
  actions: Finding[]; reduce: Finding[]; loose: Finding[]; budgetTips: Finding[]; habits: Finding[]; recurring: Finding[]; obligations: Finding[]; alerts: Finding[];
  split: { needs: number; wants: number; saved: number };
};
export type AdvisorInput = {
  data: Data; history: LedgerTx[]; today: string; salaryDay: number; monthlySalary: number; warnPercent: number;
  stat: { free: number; reserved: number; netWorth: number; liabilities: number }; committed: number;
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
export function categoryKind(name: string, parentName?: string): 'need' | 'want' {
  if (isGiving(name)) return 'need';
  if (WANT_WORDS.test(name) && !/dapur|sembako/i.test(name)) return 'want';
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

export function analyzeFinances(input: AdvisorInput): Advice {
  const { data, history, today, salaryDay, warnPercent } = input;
  const categories: Category[] = data.categories;
  const currentCycle = salaryCycle(parse(today), salaryDay); const current: Range = { start: currentCycle.start, end: currentCycle.end };
  const cycles = pastCycles(current, 6, salaryDay);
  const earliest = history.reduce((min, tx) => tx.date < min ? tx.date : min, today);
  // Only cycles the ledger actually covers count as history.
  const covered = cycles.filter(cycle => cycle.end > earliest && history.some(tx => inRange(tx.date, cycle)));
  const cycleItems = covered.map(cycle => history.filter(tx => inRange(tx.date, cycle)));
  const currentItems = history.filter(tx => inRange(tx.date, current));
  const incomeOf = (items: LedgerTx[]) => sum(items.filter(tx => tx.type === 'income').map(tx => tx.amount));
  const expenseOf = (items: LedgerTx[]) => sum(items.map(transactionExpense));
  const incomes = cycleItems.map(incomeOf), expenses = cycleItems.map(expenseOf);
  const avgIncome = mean(incomes.filter(v => v > 0)) || input.monthlySalary || 0;
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
  const categoryStats: CategoryStat[] = [...ids].filter(id => id !== 'none' && id !== 'other').map(id => {
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
    const windows = past.filter(w => w.end > earliest);
    const spent = windows.map(w => budgetSpent(budget, history.filter(tx => inRange(tx.date, w)), categories));
    const usage = spent.map(v => budget.amount ? v / budget.amount : 0);
    const withData = usage.length;
    const avgUsage = mean(usage), overCount = usage.slice(-3).filter(u => u > 1).length;
    const suggested = spent.length ? friendlyRound(quantile(spent, .75) * 1.05) : budget.amount;
    const status: BudgetStat['status'] = withData < 2 || fresh ? 'new' : avgUsage < .7 && usage.slice(-3).every(u => u < .85) ? 'loose' : overCount >= 2 ? 'tight' : 'ok';
    const cat = categories.find(c => c.id === (budget.subcategoryId || budget.categoryId));
    return { budget, name: budget.name || cat?.name || 'Anggaran', usage, avgUsage, overCount, windows: withData, suggested, status };
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
      budgetTips.push({ id: `tight-${b.budget.id}`, tone: 'bad', title: `Anggaran ${b.name} terlalu ketat`, detail: `**Terlampaui ${b.overCount} dari 3 periode terakhir** (rata-rata ${pct(b.avgUsage)}). Pilih salah satu: ==naikkan ke ${rp(b.suggested)}== agar realistis, atau ==pangkas pengeluarannya sekitar ${rp(Math.max(0, b.suggested - b.budget.amount))}== per periode.`, apply: b.suggested > b.budget.amount ? { kind: 'set-budget', budgetId: b.budget.id, amount: b.suggested } : undefined, series: b.usage.map(u => Math.round(u * 100)), seriesLabels: b.usage.map((_, i) => `P${i + 1}`) });
    }
    void monthlyAmount;
  }
  const budgeted = new Set(data.budgets.filter(b => b.active).flatMap(b => [b.categoryId, b.subcategoryId].filter(Boolean) as string[]));
  for (const c of categoryStats) {
    if (!enoughHistory || budgeted.has(c.id) || isGiving(c.name) || c.share < .06 || c.avg < 150_000) continue;
    const amount = friendlyRound(Math.min(c.median, c.avg) * .95);
    budgetTips.push({ id: `new-${c.id}`, tone: 'info', title: `Buat anggaran untuk ${c.name}`, detail: `Rata-rata **${rp(c.avg)}** per siklus (${pct(c.share)} pengeluaran) tapi **belum punya anggaran**. ==Mulai dari ${rp(amount)}== — sedikit di bawah biasanya agar ada dorongan berhemat.`, saving: Math.max(0, Math.round(c.avg - amount)), apply: { kind: 'create-budget', categoryId: c.id, name: c.name, amount }, series: c.history, seriesLabels: cycleLabels });
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
  const allExpenses = [...cycleItems.flat(), ...currentItems].filter(tx => transactionExpense(tx) > 0);
  const totalAll = sum(allExpenses.map(transactionExpense));
  if (totalAll > 0 && allExpenses.length >= 20) {
    const weekend = sum(allExpenses.filter(tx => [0, 6].includes(parse(tx.date).getDay())).map(transactionExpense));
    const weekendDaily = weekend / 2, weekdayDaily = (totalAll - weekend) / 5;
    if (weekendDaily > weekdayDaily * 1.6) habits.push({ id: 'weekend', tone: 'warn', stat: { label: 'Akhir pekan vs hari kerja', value: `+${pct(weekendDaily / weekdayDaily - 1)}`, note: 'belanja per hari' }, title: 'Akhir pekan paling boros', detail: `Per hari, belanja Sabtu–Minggu **${pct(weekendDaily / weekdayDaily - 1)} lebih tinggi** dari hari kerja. ==Tentukan batas akhir pekan==, misalnya **${rp(friendlyRound(weekdayDaily * 1.3 / Math.max(1, spanCycles * 4.3) * 2))}** per akhir pekan.` });
    const timed = allExpenses.filter(tx => /^\d{2}:\d{2}$/.test(tx.time || ''));
    const night = timed.filter(tx => { const h = Number(tx.time!.slice(0, 2)); return h >= 21 || h < 4; });
    const nightShare = timed.length ? sum(night.map(transactionExpense)) / sum(timed.map(transactionExpense)) : 0;
    if (timed.length >= 15 && nightShare >= .2) habits.push({ id: 'night', tone: 'warn', stat: { label: 'Belanja di atas pukul 21.00', value: pct(nightShare), note: 'dari pengeluaran berjam' }, title: 'Sering belanja larut malam', detail: `**${pct(nightShare)} pengeluaran** yang punya jam terjadi **di atas pukul 21.00** — biasanya pesan antar atau belanja impulsif. Coba aturan =="tunda sampai besok"== untuk belanja malam.` });
    const firstWeek = cycleItems.map((items, i) => { const start = covered[i].start; const cut = iso(new Date(parse(start).getTime() + 7 * DAY)); const e = expenseOf(items); return e ? expenseOf(items.filter(tx => tx.date < cut)) / e : 0; }).filter(v => v > 0);
    const payday = mean(firstWeek);
    if (firstWeek.length >= 2 && payday >= .4) habits.push({ id: 'payday', tone: 'warn', stat: { label: 'Habis di 7 hari pertama', value: pct(payday), note: 'normalnya sekitar 25%' }, title: 'Efek gajian terasa', detail: `**${pct(payday)} pengeluaran** siklus habis **di 7 hari pertama** setelah gajian (normalnya sekitar 25%). ==Pisahkan dulu tabungan di hari gajian== sebelum belanja.` });
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
    obligations.push({ id: 'debt', tone: dsr > .4 ? 'bad' : dsr > .3 ? 'warn' : 'info', stat: { label: 'Cicilan / pemasukan', value: pct(dsr), note: 'batas sehat 30%', progress: Math.min(1, dsr / .3) }, title: `Cicilan ${pct(dsr)} dari pemasukan`, detail: `${openDebts.length} utang aktif, sisa **${rp(sum(openDebts.map(d => d.outstandingAmount)))}**. ${dsr > .3 ? '**Di atas batas sehat 30%** — ==hindari utang baru dulu==.' : 'Masih di bawah batas sehat 30%.'} ==Prioritaskan melunasi “${first.name}”==${first.interestRate ? ` (bunga ${first.interestRate}%)` : ' (sisa terkecil)'} lebih cepat.`, target: { view: 'debts' } });
  }
  const overdue = data.receivables.filter(r => r.remainingAmount > 0 && r.dueDate && r.dueDate < today);
  if (overdue.length) obligations.push({ id: 'receivable', tone: 'warn', stat: { label: 'Belum kembali', value: shortRp(sum(overdue.map(r => r.remainingAmount))), note: `${overdue.length} orang` }, title: `${overdue.length} piutang lewat jatuh tempo`, detail: `Total **${rp(sum(overdue.map(r => r.remainingAmount)))} belum kembali**, termasuk dari ${overdue.slice(0, 3).map(r => r.person).join(', ')}. ==Tagih pelan-pelan sekarang==, sebelum makin lama.`, target: { view: 'receivables' } });
  const monthlySurplus = Math.max(0, avgIncome - avgExpense);
  for (const fund of data.funds.filter(f => !f.isArchived)) {
    const plan = savingsPlan(fund, today);
    if (plan.status === 'behind' || plan.status === 'overdue') obligations.push({ id: `fund-${fund.id}`, tone: plan.status === 'overdue' ? 'bad' : 'warn', stat: { label: 'Setoran dibutuhkan', value: `${shortRp(plan.perMonth)}/bln`, note: `rencana ${shortRp(fund.monthlyContribution || 0)}/bln`, progress: fund.targetAmount ? Math.min(1, (fund.currentAmount || 0) / fund.targetAmount) : undefined, progressLabel: fund.targetAmount ? `${pct(Math.min(1, (fund.currentAmount || 0) / fund.targetAmount))} terkumpul` : undefined }, title: `Tujuan “${fund.name}” tertinggal`, detail: `Perlu **${rp(plan.perMonth)} per bulan** agar tepat waktu, rencana saat ini ${rp(fund.monthlyContribution || 0)}. ${plan.perMonth <= monthlySurplus ? `==Naikkan setoran ke ${rp(plan.perMonth)} per bulan== — masih muat dari rata-rata sisa uang ${rp(monthlySurplus)}.` : `Sisa uang rata-rata **hanya ${rp(monthlySurplus)}** — ==mundurkan tenggat atau kecilkan target==.`}`, target: { view: 'funds' } });
  }

  // 8. Alerts: unusually large spends this cycle, and whether cash lasts until payday.
  for (const tx of currentItems) {
    const spend = transactionExpense(tx); if (spend < 100_000) continue;
    const peers = cycleItems.flat().filter(o => o.categoryId === tx.categoryId && transactionExpense(o) > 0).map(transactionExpense);
    const med = quantile(peers, .5);
    if (peers.length >= 5 && spend > med * 4) alerts.push({ id: `odd-${tx.id}`, tone: 'warn', stat: { label: 'Nominal', value: shortRp(spend), note: `${Math.round(spend / med)}× biasanya` }, title: `Transaksi tidak biasa: ${tx.description || tx.merchant || categories.find(c => c.id === tx.categoryId)?.name || 'pengeluaran'}`, detail: `**${rp(spend)}** pada ${parse(tx.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} — **${Math.round(spend / med)}× dari biasanya** di kategori ini. ==Pastikan nominalnya benar==.`, target: { view: 'transactions', focus: tx.id } });
  }
  const available = input.stat.free - input.committed;
  const needUntilPayday = Math.max(0, projectedSpend - currentExpense);
  if (daysLeft > 0 && needUntilPayday > available) alerts.unshift({ id: 'runway', tone: 'bad', stat: { label: 'Jatah harian aman', value: shortRp(Math.max(0, available) / daysLeft), note: `${daysLeft} hari sampai gajian` }, title: 'Uang tersedia diperkirakan kurang sampai gajian', detail: `Dengan laju sekarang, ${daysLeft} hari ke depan butuh sekitar **${rp(needUntilPayday)}**, sedangkan uang tersedia **${rp(Math.max(0, available))}**. ==Batasi belanja harian ke ${rp(Math.max(0, available) / daysLeft)}== agar cukup.` });

  // Health score.
  const emergencyMonths = avgExpense ? input.stat.reserved / avgExpense : 0;
  const lastUsage = budgetStats.filter(b => b.usage.length).map(b => b.usage[b.usage.length - 1]);
  const adherence = lastUsage.length ? lastUsage.filter(u => u <= 1).length / lastUsage.length : 1;
  const runwayRatio = needUntilPayday > 0 ? Math.max(0, available) / needUntilPayday : 1.5;
  const trendRatio = expenses.length >= 3 && mean(expenses.slice(0, -1)) ? expenses[expenses.length - 1] / mean(expenses.slice(0, -1)) : 1;
  const parts: HealthPart[] = [
    { key: 'savings', label: 'Rasio menabung', weight: 25, score: clamp(savingsRate >= .2 ? 100 : savingsRate <= 0 ? Math.max(0, 30 + savingsRate * 100) : 30 + savingsRate / .2 * 70), value: pct(savingsRate), hint: 'Ideal ≥ 20% pemasukan tersisa tiap siklus' },
    { key: 'emergency', label: 'Dana darurat', weight: 20, score: clamp(emergencyMonths >= 6 ? 100 : emergencyMonths >= 3 ? 70 + (emergencyMonths - 3) * 10 : emergencyMonths * 23), value: `${emergencyMonths.toFixed(1).replace('.', ',')} bulan`, hint: 'Ideal 3–6 bulan pengeluaran di dompet Disimpan' },
    { key: 'debt', label: 'Beban cicilan', weight: 15, score: clamp(dsr <= 0 ? 100 : dsr <= .3 ? 100 - dsr / .3 * 40 : Math.max(0, 60 - (dsr - .3) / .2 * 60)), value: pct(dsr), hint: 'Ideal di bawah 30% pemasukan' },
    { key: 'budget', label: 'Disiplin anggaran', weight: 15, score: clamp(adherence * 100), value: lastUsage.length ? `${Math.round(adherence * lastUsage.length)}/${lastUsage.length} aman` : 'Belum ada', hint: 'Anggaran yang tidak terlampaui di periode terakhir' },
    { key: 'runway', label: 'Bekal sampai gajian', weight: 15, score: clamp(runwayRatio >= 1.2 ? 100 : runwayRatio * 80), value: shortRp(Math.max(0, available)), hint: 'Uang tersedia dibanding perkiraan belanja sampai gajian' },
    { key: 'trend', label: 'Tren pengeluaran', weight: 10, score: clamp(trendRatio <= 1 ? 100 : 100 - (trendRatio - 1) * 200), value: trendRatio === 1 ? 'Stabil' : `${trendRatio > 1 ? '+' : ''}${pct(trendRatio - 1)}`, hint: 'Siklus terakhir dibanding rata-rata sebelumnya' },
  ];
  const score = Math.round(sum(parts.map(p => p.score * p.weight)) / sum(parts.map(p => p.weight)));
  const verdictTone: Tone = score >= 75 ? 'good' : score >= 55 ? 'info' : score >= 40 ? 'warn' : 'bad';
  const verdict = score >= 75 ? 'Keuanganmu sehat. Pertahankan kebiasaan baik dan arahkan sisa uang ke tujuan jangka panjang.' : score >= 55 ? 'Cukup baik, tapi ada beberapa hal yang bisa dirapikan untuk menambah tabungan.' : score >= 40 ? 'Perlu perhatian. Fokus ke rencana aksi di bawah untuk menambah ruang napas.' : 'Waspada. Kurangi pengeluaran tidak penting dulu dan amankan kebutuhan sampai gajian.';

  // Emergency fund and saving rate as findings too.
  if (avgExpense && emergencyMonths < 3) obligations.push({ id: 'emergency', tone: emergencyMonths < 1 ? 'bad' : 'warn', stat: { label: 'Dana darurat', value: `${emergencyMonths.toFixed(1).replace('.', ',')} bulan`, note: 'target minimal 3 bulan', progress: Math.min(1, emergencyMonths / 3), progressLabel: `${pct(Math.min(1, emergencyMonths / 3))} dari target` }, title: 'Dana darurat belum cukup', detail: `Dompet Disimpan setara **${emergencyMonths.toFixed(1).replace('.', ',')} bulan** pengeluaran. Target minimal 3 bulan = ${rp(avgExpense * 3)}; **kurang ${rp(avgExpense * 3 - input.stat.reserved)}**. ==Sisihkan ${rp(friendlyRound(Math.max(0, avgExpense * 3 - input.stat.reserved) / 12))} per bulan== untuk mencapainya dalam setahun.`, target: { view: 'wallets' } });
  if (enoughHistory && savingsRate < .1) obligations.push({ id: 'saving-rate', tone: savingsRate < 0 ? 'bad' : 'warn', stat: { label: 'Sisa per siklus', value: pct(Math.max(0, savingsRate)), note: 'target 10–20%' }, title: savingsRate < 0 ? 'Pengeluaran melebihi pemasukan' : 'Tabungan tipis', detail: `Rata-rata hanya **${pct(Math.max(0, savingsRate))} pemasukan tersisa** per siklus${savingsRate < 0 ? ` (**defisit ${rp(avgExpense - avgIncome)}**)` : ''}. Targetkan minimal 10–20%: ==pangkas ${rp(Math.max(0, avgExpense - avgIncome * .8))} per bulan== dari pos yang tidak penting.` });

  // Needs / wants / saved split (50/30/20 check).
  const needs = sum(categoryStats.filter(c => c.kind === 'need').map(c => c.avg)), wants = sum(categoryStats.filter(c => c.kind === 'want').map(c => c.avg));
  const base = avgIncome || needs + wants;
  const split = base ? { needs: needs / base, wants: wants / base, saved: Math.max(0, 1 - (needs + wants) / base) } : { needs: 0, wants: 0, saved: 0 };
  if (enoughHistory && base && split.wants > .35) reduce.push({ id: 'split', tone: 'warn', stat: { label: 'Porsi keinginan', value: pct(split.wants), note: 'maksimal 30%' }, title: 'Porsi keinginan terlalu besar', detail: `Keinginan (jajan, hiburan, belanja) memakan **${pct(split.wants)} pemasukan** — pedoman 50/30/20 menyarankan maksimal 30%. ==Kurangi sekitar ${rp((split.wants - .3) * base)} per bulan==.`, saving: Math.round((split.wants - .3) * base / 1000) * 1000 });

  // Action plan: the most valuable steps first.
  const rank = (f: Finding) => (f.tone === 'bad' ? 3e9 : f.tone === 'warn' ? 2e9 : 1e9) + (f.saving || 0);
  const actions = [...alerts.filter(a => a.id === 'runway'), ...reduce, ...budgetTips.filter(b => b.id.startsWith('shrink') || b.id.startsWith('tight') || b.id.startsWith('new')), ...habits, ...obligations]
    .sort((a, b) => rank(b) - rank(a)).filter((f, i, list) => list.findIndex(x => x.id === f.id) === i).slice(0, 6);

  return {
    enoughHistory, cyclesUsed: covered.length, score, verdict, verdictTone, parts,
    summary: { avgIncome, avgExpense, savingsRate, emergencyMonths, dsr, available, daysLeft, projectedSpend },
    cycles: covered.map((c, i) => ({ label: cycleLabels[i], income: incomes[i], expense: expenses[i] })).concat([{ label: 'Kini', income: incomeOf(currentItems), expense: currentExpense }]),
    categories: categoryStats, budgets: budgetStats, actions, reduce, loose, budgetTips, habits, recurring, obligations, alerts: alerts.filter(a => a.id !== 'runway' || !actions.some(x => x.id === 'runway')), split,
  };
}
