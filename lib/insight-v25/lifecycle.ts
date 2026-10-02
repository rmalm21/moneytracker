/**
 * Insight V2.5 — lifecycle memory: what Insight remembers between visits, and nothing more.
 *
 * Insight memory is not a second ledger: it keeps no amounts of transactions, only per signal a reference size,
 * when it was first seen, its last transition, dismiss/snooze choices, and a few health-score snapshots. It lives
 * in the user's own profile document (profile.insightMemory), so it is per user and follows them across devices.
 *
 * States: NEW (first 3 days), ACTIVE, WORSENING / IMPROVING (3 days after a material move of ≥ 15% against the
 * reference), RESOLVED (gone while its domain was still checked), SNOOZED (until a date), DISMISSED (by the user).
 * Dismiss is not resolve: a dismissed signal stays hidden until it worsens materially (≥ 25% or a severity jump),
 * then it resurfaces as WORSENING. Fatigue: an ACTIVE signal's novelty drops every day it is shown again.
 * Running it twice on the same day with its own output changes nothing (idempotent), so it never write-loops.
 */
import { daysBetween } from './context.ts';
import type { Domain, InsightSignal, LifecycleState, Status } from './types.ts';

export type SignalMemory = {
  /** active | resolved | dismissed */
  st: 'active' | 'resolved' | 'dismissed';
  /** Title when last seen (for progress / timeline after it is gone). */
  t: string; tone: Status; dm: Domain;
  /** First seen, last seen, cycle it belongs to ('' = not cycle-bound). */
  f: string; l: string; c: string;
  /** Reference size and severity, updated only at a transition. */
  v: number; sv: number;
  /** Last transition and its date. */
  tr?: 'worse' | 'better'; td?: string;
  /** Days shown (fatigue) and the last day it was counted. */
  n: number; sd?: string;
  /** Dismissed on / reference size then / snoozed until / resolved on. */
  dd?: string; dv?: number; dsv?: number; su?: string; r?: string;
};
export type ScoreSnapshot = { d: string; c: string; s: number; p: Record<string, number> };
export type TimelineEntry = { d: string; k: string; e: 'new' | 'worse' | 'better' | 'resolved' | 'resurfaced'; t: string; tone: Status };
export type InsightMemory = { v: 1; s: Record<string, SignalMemory>; h: ScoreSnapshot[]; tl: TimelineEntry[]; hidden?: string[] };

export const emptyMemory = (): InsightMemory => ({ v: 1, s: {}, h: [], tl: [] });
export function readMemory(value: unknown): InsightMemory {
  const m = value as Partial<InsightMemory> | null | undefined;
  if (!m || m.v !== 1 || typeof m.s !== 'object') return emptyMemory();
  return { v: 1, s: { ...(m.s || {}) }, h: Array.isArray(m.h) ? m.h.slice(-24) : [], tl: Array.isArray(m.tl) ? m.tl.slice(-40) : [], ...(Array.isArray(m.hidden) ? { hidden: m.hidden.filter(x => typeof x === 'string').slice(0, 100) } : {}) };
}

const negative = (tone: Status) => tone === 'watch' || tone === 'important';
const CYCLE_DOMAINS = new Set<Domain>(['spending', 'merchant', 'budget', 'cashflow', 'behavior']);
/** The size a signal is compared on: its change when it has one, otherwise its amount, otherwise its severity. */
export const magnitude = (s: InsightSignal) => Math.abs(s.delta ?? s.current ?? 0) || s.severity;
const fresh = (date: string | undefined, today: string, days = 3) => Boolean(date && daysBetween(date, today) < days);

export type ResolvedItem = { signature: string; title: string; date: string; tone: Status };
export type LifecycleResult = { signals: InsightSignal[]; resolved: ResolvedItem[]; memory: InsightMemory; changed: boolean };

/**
 * `evaluated`: domains that were really checked this run — a signal of a domain that was skipped (too early in the
 * cycle, not enough history) is not called resolved just because it is missing.
 */
export function applyLifecycle(signals: InsightSignal[], memory: InsightMemory, today: string, cycleStart: string, evaluated: Set<Domain>): LifecycleResult {
  const before = JSON.stringify(memory);
  const next: InsightMemory = { v: 1, s: Object.fromEntries(Object.entries(memory.s).map(([k, v]) => [k, { ...v }])), h: [...memory.h], tl: [...memory.tl], ...(memory.hidden ? { hidden: [...memory.hidden] } : {}) };
  const log = (k: string, e: TimelineEntry['e'], t: string, tone: Status) => { if (!next.tl.some(x => x.k === k && x.e === e && x.d === today)) next.tl.push({ d: today, k, e, t, tone }); };
  const present = new Set<string>();
  const out = signals.map(s => {
    present.add(s.signature);
    const mag = magnitude(s), track = s.material || s.actionable;
    let rec = next.s[s.signature];
    let state: LifecycleState;
    if (!rec || rec.st === 'resolved') {
      if (!track) return { ...s, lifecycleState: 'NEW' as LifecycleState, novelty: 1 };
      rec = { st: 'active', t: s.title, tone: s.tone, dm: s.domain, f: today, l: today, c: CYCLE_DOMAINS.has(s.domain) ? cycleStart : '', v: mag, sv: s.severity, n: 0 };
      next.s[s.signature] = rec;
      if (s.material) log(s.signature, 'new', s.headline || s.title, s.tone);
    }
    rec.t = s.title; rec.tone = s.tone; rec.l = today; if (rec.c) rec.c = cycleStart;
    if (rec.dd) {
      const worse = s.severity >= (rec.dsv ?? 1) + .15 || mag >= (rec.dv ?? Infinity) * 1.25 && negative(s.tone);
      if (worse) { delete rec.dd; delete rec.dv; delete rec.dsv; rec.st = 'active'; rec.tr = 'worse'; rec.td = today; rec.v = mag; rec.sv = s.severity; log(s.signature, 'resurfaced', s.headline || s.title, s.tone); }
      else if (daysBetween(rec.dd, today) > 60) { delete rec.dd; delete rec.dv; delete rec.dsv; rec.st = 'active'; }
    }
    if (rec.dd) state = 'DISMISSED';
    else if (rec.su && rec.su > today && s.severity < rec.sv + .25) state = 'SNOOZED';
    else {
      if (rec.su && rec.su <= today) delete rec.su;
      if (negative(s.tone) && rec.v > 0 && rec.td !== today) {
        const ratio = mag / rec.v;
        if (ratio >= 1.15 || s.severity >= rec.sv + .15) { rec.tr = 'worse'; rec.td = today; rec.v = mag; rec.sv = s.severity; if (s.material) log(s.signature, 'worse', s.headline || s.title, s.tone); }
        else if (ratio <= .85) { rec.tr = 'better'; rec.td = today; rec.v = mag; rec.sv = s.severity; if (s.material) log(s.signature, 'better', s.headline || s.title, 'positive'); }
      }
      state = rec.td && fresh(rec.td, today) ? (rec.tr === 'worse' ? 'WORSENING' : 'IMPROVING') : fresh(rec.f, today) ? 'NEW' : 'ACTIVE';
    }
    const visible = state !== 'DISMISSED' && state !== 'SNOOZED';
    if (visible && rec.sd !== today) { rec.n += 1; rec.sd = today; }
    const novelty = state === 'NEW' ? 1 : state === 'WORSENING' ? .85 : state === 'IMPROVING' ? .6 : visible ? Math.max(.1, 1 - .12 * Math.max(0, rec.n - 1)) : 0;
    return { ...s, lifecycleState: state, novelty };
  });
  const resolved: ResolvedItem[] = [];
  for (const [k, rec] of Object.entries(next.s)) {
    if (present.has(k)) continue;
    if (rec.st === 'active' && !rec.dd && evaluated.has(rec.dm)) {
      // A cycle-bound signal from an earlier cycle simply ended with its cycle: forget it quietly.
      if (rec.c && rec.c < cycleStart) { delete next.s[k]; continue; }
      rec.st = 'resolved'; rec.r = today;
      if (negative(rec.tone)) log(k, 'resolved', rec.t, 'positive');
    }
    if (rec.st === 'resolved' && rec.r && daysBetween(rec.r, today) <= 30 && negative(rec.tone)) resolved.push({ signature: k, title: rec.t, date: rec.r, tone: rec.tone });
    // Prune: resolved for over 45 days, or not seen for 120 days (dismissals expire with it).
    if (rec.st === 'resolved' && rec.r && daysBetween(rec.r, today) > 45 || daysBetween(rec.l, today) > 120) delete next.s[k];
  }
  // Keep the memory small: the 80 most recently seen.
  const keys = Object.keys(next.s);
  if (keys.length > 80) for (const k of keys.sort((a, b) => next.s[b].l.localeCompare(next.s[a].l)).slice(80)) delete next.s[k];
  next.tl = next.tl.slice(-40);
  return { signals: out, resolved, memory: next, changed: JSON.stringify(next) !== before };
}

/** User choices; each returns new memory (written through the normal profile save). */
export function dismiss(memory: InsightMemory, s: InsightSignal, today: string): InsightMemory {
  const next = readMemory(JSON.parse(JSON.stringify(memory)));
  const rec = next.s[s.signature] || { st: 'active', t: s.title, tone: s.tone, dm: s.domain, f: today, l: today, c: '', v: magnitude(s), sv: s.severity, n: 0 } as SignalMemory;
  next.s[s.signature] = { ...rec, st: 'dismissed', dd: today, dv: magnitude(s), dsv: s.severity };
  return next;
}
export function snooze(memory: InsightMemory, s: InsightSignal, until: string, today: string): InsightMemory {
  const next = readMemory(JSON.parse(JSON.stringify(memory)));
  const rec = next.s[s.signature] || { st: 'active', t: s.title, tone: s.tone, dm: s.domain, f: today, l: today, c: '', v: magnitude(s), sv: s.severity, n: 0 } as SignalMemory;
  next.s[s.signature] = { ...rec, su: until };
  return next;
}
export function restoreAll(memory: InsightMemory): InsightMemory {
  const next = readMemory(JSON.parse(JSON.stringify(memory)));
  for (const rec of Object.values(next.s)) { delete rec.dd; delete rec.dv; delete rec.dsv; delete rec.su; if (rec.st === 'dismissed') rec.st = 'active'; }
  delete next.hidden;
  return next;
}
