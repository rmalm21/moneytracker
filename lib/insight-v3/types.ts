/**
 * Insight V3.0 — Financial Intelligence OS: shared types.
 * V3 builds on V2.5 (lib/insight-v25): every V2.5 signal stays as it is and gets a horizon and its place in the
 * impact graph; V3 adds world model, pressure, momentum, regimes, scenarios, decisions and outcomes on top.
 */
import type { InsightSignal, Status } from '../insight-v25/types.ts';

export type Horizon = 'IMMEDIATE' | 'CURRENT_CYCLE' | 'MULTI_CYCLE' | 'LONG_TERM';
export type Level = 'good' | 'stable' | 'watch' | 'pressure';
export const levelWord: Record<Level, string> = { good: 'Baik', stable: 'Stabil', watch: 'Pantau', pressure: 'Tertekan' };

/** A V2.5 signal seen by V3: with its horizon and the edges that leave it. */
export type SignalV3 = InsightSignal & { horizon: Horizon };

/**
 * Edges of the impact graph. `direct` = arithmetic that holds in the ledger (spending lowers what is left);
 * `estimated` = a projection under "if the pattern continues"; `associated` = moved together, no cause claimed.
 */
export type EdgeKind = 'contributes_to' | 'reduces' | 'increases' | 'funds' | 'delays' | 'settles' | 'explains' | 'associated_with' | 'estimated_to_affect';
export type EdgeBasis = 'direct' | 'estimated' | 'associated';
export type GraphNode = { id: string; label: string; kind: 'signal' | 'state'; status?: Status; value?: number };
export type GraphEdge = { from: string; to: string; kind: EdgeKind; basis: EdgeBasis; amount?: number; note: string };
export type ImpactGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type PressureDomain = 'liquidity' | 'budget' | 'debt' | 'goal' | 'claim' | 'receivable' | 'recurring';
export type Pressure = { domain: PressureDomain; label: string; level: Level; score: number; reasons: string[]; signature?: string };

export type MomentumState = 'IMPROVING' | 'STABLE' | 'MIXED' | 'UNDER_PRESSURE';
export type MomentumPart = { key: string; label: string; direction: 'up' | 'down' | 'flat'; good: boolean | null; detail: string };
export type Momentum = { state: MomentumState; label: string; parts: MomentumPart[]; enough: boolean };

export type Regime = { key: 'NORMAL' | 'TRAVEL_HEAVY' | 'LARGE_PURCHASE' | 'HIGH_CLAIM' | 'HIGH_INCOME' | 'LOW_INCOME'; label: string; evidence: string[] };
