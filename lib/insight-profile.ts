/**
 * Personal settings that tune Insight: risk profile, savings target, emergency-fund size,
 * household, income stability, investment horizon, main priority and budget style.
 * Everything has a sensible default so Insight works before the user fills anything in.
 */
export type RiskProfile = 'konservatif' | 'moderat' | 'agresif';
export type Horizon = 'short' | 'mid' | 'long';
export type Household = 'single' | 'couple' | 'family';
export type IncomeKind = 'fixed' | 'variable';
export type Priority = 'emergency' | 'debt' | 'invest' | 'home' | 'education' | 'retire' | 'travel';
export type BudgetStyle = 'strict' | 'balanced' | 'relaxed';
export type Experience = 'none' | 'basic' | 'experienced';

export type InsightProfile = {
  risk: RiskProfile; riskScore?: number; horizon: Horizon; savingsTarget: number; emergencyMonths: number;
  household: Household; dependants: number; income: IncomeKind; priority: Priority; budgetStyle: BudgetStyle; experience: Experience;
  /** Emergency fund as months of spending, or a fixed amount the user chose. */
  emergencyMode: 'months' | 'amount'; emergencyAmount: number;
  /** Optional overrides: monthly living cost and income used by Insight (0 = work it out). */
  monthlyNeed: number; monthlyIncome: number;
  /** Share of a month's needs kept aside for surprises before money counts as idle (0–0.5). */
  buffer: number;
  /** Limits for needs / wants as a share of income (0 = automatic from household and budget style). */
  needsLimit: number; wantsLimit: number;
  /** Money below this is never called idle. */
  idleMinimum: number;
  /** Investment preferences. */
  syariah: boolean; excluded: string[];
  /** True once the user saved the profile themselves. */
  personalized?: boolean; updatedAt?: string;
};

export const riskLabels: Record<RiskProfile, { label: string; hint: string }> = {
  konservatif: { label: 'Konservatif', hint: 'Utamakan nilai uang aman, pertumbuhan pelan tidak masalah.' },
  moderat: { label: 'Moderat', hint: 'Siap naik-turun sedang demi pertumbuhan yang lebih baik.' },
  agresif: { label: 'Agresif', hint: 'Siap naik-turun besar demi pertumbuhan jangka panjang.' },
};
export const horizonLabels: Record<Horizon, string> = { short: 'Di bawah 1 tahun', mid: '1–5 tahun', long: 'Lebih dari 5 tahun' };
export const householdLabels: Record<Household, string> = { single: 'Lajang', couple: 'Menikah, belum ada anak', family: 'Berkeluarga dengan tanggungan' };
export const incomeLabels: Record<IncomeKind, string> = { fixed: 'Tetap (gaji bulanan)', variable: 'Tidak tetap (freelance, usaha, komisi)' };
export const priorityLabels: Record<Priority, string> = { emergency: 'Membangun dana darurat', debt: 'Melunasi utang', invest: 'Mengembangkan investasi', home: 'Beli rumah / DP', education: 'Pendidikan', retire: 'Pensiun', travel: 'Liburan / barang impian' };
export const budgetStyleLabels: Record<BudgetStyle, { label: string; hint: string }> = {
  strict: { label: 'Ketat', hint: 'Anggaran ditekan agar tabungan maksimal.' },
  balanced: { label: 'Seimbang', hint: 'Hemat tapi tetap realistis.' },
  relaxed: { label: 'Santai', hint: 'Longgar, yang penting tidak jebol.' },
};
export const experienceLabels: Record<Experience, string> = { none: 'Belum pernah investasi', basic: 'Pernah (deposito, reksa dana, emas)', experienced: 'Berpengalaman (saham, obligasi)' };

/** Emergency fund size that fits the household: more people or an irregular income need a bigger cushion. */
export function suggestedEmergencyMonths(p: Pick<InsightProfile, 'household' | 'dependants' | 'income'>) {
  const base = p.household === 'single' ? 3 : p.household === 'couple' ? 6 : 6 + Math.min(3, Math.max(0, p.dependants));
  return Math.min(12, base + (p.income === 'variable' ? 3 : 0));
}

export const defaultInsightProfile: InsightProfile = { risk: 'moderat', horizon: 'mid', savingsTarget: .2, emergencyMonths: 3, household: 'single', dependants: 0, income: 'fixed', priority: 'emergency', budgetStyle: 'balanced', experience: 'basic', emergencyMode: 'months', emergencyAmount: 0, monthlyNeed: 0, monthlyIncome: 0, buffer: .15, needsLimit: 0, wantsLimit: 0, idleMinimum: 500_000, syariah: false, excluded: [] };

/** Fill missing fields with defaults and keep numbers in range. */
export function resolveInsightProfile(saved?: Partial<InsightProfile> | null): InsightProfile {
  const merged = { ...defaultInsightProfile, ...(saved || {}) } as InsightProfile;
  if (!saved?.emergencyMonths) merged.emergencyMonths = suggestedEmergencyMonths(merged);
  merged.savingsTarget = Math.min(.8, Math.max(.01, Number(merged.savingsTarget) || .2));
  merged.emergencyMonths = Math.min(24, Math.max(1, Math.round(Number(merged.emergencyMonths) || 3)));
  merged.dependants = Math.min(10, Math.max(0, Math.round(Number(merged.dependants) || 0)));
  const money = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  merged.emergencyAmount = money(merged.emergencyAmount); merged.monthlyNeed = money(merged.monthlyNeed); merged.monthlyIncome = money(merged.monthlyIncome); merged.idleMinimum = money(merged.idleMinimum ?? 500_000);
  if (merged.emergencyMode !== 'amount' || !merged.emergencyAmount) merged.emergencyMode = 'months';
  merged.buffer = Math.min(.5, Math.max(0, Number(merged.buffer ?? .15)));
  merged.needsLimit = Math.min(.9, Math.max(0, Number(merged.needsLimit) || 0)); merged.wantsLimit = Math.min(.8, Math.max(0, Number(merged.wantsLimit) || 0));
  merged.syariah = Boolean(merged.syariah); merged.excluded = Array.isArray(merged.excluded) ? merged.excluded.filter(x => typeof x === 'string') : [];
  merged.personalized = Boolean(saved?.personalized);
  return merged;
}

/** Three-question risk quiz. Each answer scores 1 (careful) to 3 (bold). */
export const riskQuestions: { id: string; question: string; options: [string, number][] }[] = [
  { id: 'drop', question: 'Investasimu turun 20% dalam sebulan. Kamu…', options: [['Jual, takut rugi lagi', 1], ['Diamkan saja', 2], ['Beli lagi selagi murah', 3]] },
  { id: 'when', question: 'Uangnya kira-kira dipakai…', options: [['< 1 tahun lagi', 1], ['1–5 tahun lagi', 2], ['> 5 tahun lagi', 3]] },
  { id: 'share', question: 'Porsi tabungan yang siap naik-turun…', options: [['< 10%', 1], ['10–30%', 2], ['> 30%', 3]] },
];

/** Turn quiz answers into a risk profile, plus the horizon and experience they imply. */
export function scoreRiskQuiz(answers: Record<string, number>) {
  const score = riskQuestions.reduce((n, q) => n + (answers[q.id] || 2), 0);
  const risk: RiskProfile = score <= 4 ? 'konservatif' : score <= 7 ? 'moderat' : 'agresif';
  const horizon: Horizon = answers.when === 1 ? 'short' : answers.when === 3 ? 'long' : 'mid';
  return { score, max: riskQuestions.length * 3, risk, horizon };
}
