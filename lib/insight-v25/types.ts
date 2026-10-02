/**
 * Insight V2.5 — the shape of an explainable signal.
 *
 * A signal is one fact the engine noticed ("Makan & Minum naik 38%"), with the numbers behind it, how sure the
 * engine is, why it happened (drivers), and where it sits in its life (new, worsening, resolved…). Signals are
 * computed fresh from the ledger every time; only their lifecycle is remembered (lib/insight-v25/lifecycle.ts).
 */
import type { Apply, CalcRow, Finding, Target } from '../advisor.ts';

export type Domain = 'spending' | 'merchant' | 'budget' | 'cashflow' | 'income' | 'claims' | 'receivable' | 'debt' | 'goals' | 'recurring' | 'prices' | 'behavior' | 'data' | 'wealth' | 'health';
/** How a signal is shown: good news, plain information, something to keep an eye on, or something to act on. */
export type Status = 'positive' | 'neutral' | 'watch' | 'important';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
/** Never shown as a percentage: only the label and the reasons. */
export type Confidence = { level: ConfidenceLevel; label: string; score: number; reasons: string[] };
export type LifecycleState = 'NEW' | 'ACTIVE' | 'WORSENING' | 'IMPROVING' | 'RESOLVED' | 'SNOOZED' | 'DISMISSED';
export type DeepDive = 'spending' | 'cashflow' | 'duty' | 'goals' | 'wealth' | 'habits' | 'prices';
export type Unit = 'money' | 'count' | 'percent' | 'days';

/** One fact behind a signal; `txIds` lets the evidence drawer list the transactions. */
export type Evidence = { label: string; value: string; note?: string; txIds?: string[] };

/**
 * One branch of "why": category → subcategory → merchant → transactions. Children always add up to their parent
 * (an "Lainnya" branch takes the rest). For spending, the change splits into "more often" and "pricier each time".
 */
export type Driver = {
  id: string; label: string; level: 'category' | 'subcategory' | 'merchant' | 'other' | 'transaction';
  current: number; baseline: number; delta: number;
  count?: { current: number; baseline: number };
  frequencyEffect?: number; ticketEffect?: number;
  children?: Driver[]; txIds?: string[];
};

export type InsightAction = { label: string; target?: Target; apply?: Apply };

export type InsightSignal = {
  id: string;
  /** Stable across runs: "spending:category:food", "claims:outstanding". */
  signature: string;
  domain: Domain; type: string;
  title: string; summary: string;
  tone: Status;
  /** 0–1: how serious the fact is for the user's money (not how sure the engine is). */
  severity: number;
  confidence: Confidence;
  /** 0–1, set by the lifecycle: new and worsening facts are fresh, repeated ones fade. */
  novelty: number;
  unit: Unit;
  current?: number; baseline?: number; delta?: number;
  evidence: Evidence[];
  drivers: Driver[];
  lifecycleState: LifecycleState;
  action?: InsightAction;
  generatedAt: string;
  /** Monthly money effect, for ranking and "dampak" (never added across a story twice). */
  impact: number;
  /** 0–1: how soon it matters (due dates, money running out before payday). */
  urgency: number;
  actionable: boolean;
  /** A material change is big and sure enough to be called "berubah". */
  material: boolean;
  /** The signal this one explains part of ("merchant:grabfood" → "spending:subcategory:food-delivery"). */
  parent?: string;
  /** Things that limit the reading ("18% pengeluaran belum memiliki kategori"). */
  caveats: string[];
  calc?: CalcRow[];
  series?: { labels: string[]; values: number[] };
  deepDive: DeepDive;
  /** The Advisor card this signal reuses (its apply/target/calc stay the source). */
  finding?: Finding;
  /** Short line for the timeline and the brief. */
  headline?: string;
};

/** A root cause with the signals it explains, told as what / why / evidence / impact / action. */
export type Story = {
  id: string; signature: string; root: InsightSignal; members: InsightSignal[];
  title: string; what: string; why: string[]; evidence: Evidence[]; impact: number; action?: InsightAction;
  tone: Status; state: LifecycleState; priority: number; confidence: Confidence; deepDive: DeepDive;
};
