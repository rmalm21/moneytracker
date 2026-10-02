/**
 * Insight V2.5 — what comes first.
 *
 * priority = 0.30·severity + 0.15·confidence + 0.20·impact + 0.15·urgency + 0.10·novelty + 0.05·profile + 0.05·actionable
 * (impact scaled to a tenth of the usual income). The Insight profile changes the order only (a "Melunasi utang"
 * priority lifts debt stories), never the facts. Pinned Advisor cards keep their place in the UI.
 */
import type { InsightProfile } from '../insight-profile.ts';
import type { Domain, Story } from './types.ts';

const boosts: Record<InsightProfile['priority'], Domain[]> = { emergency: ['goals', 'wealth', 'cashflow'], debt: ['debt'], invest: ['wealth'], home: ['goals'], education: ['goals'], retire: ['goals', 'wealth'], travel: ['goals'] };

export function priorityOf(story: Story, profile: InsightProfile, income: number) {
  const s = story.root;
  const impact = Math.min(1, Math.abs(story.impact) / Math.max(500_000, income * .1));
  const boost = boosts[profile.priority]?.includes(s.domain) || (profile.budgetStyle === 'strict' && (s.domain === 'spending' || s.domain === 'budget')) ? 1 : 0;
  return .3 * s.severity + .15 * s.confidence.score + .2 * impact + .15 * s.urgency + .1 * s.novelty + .05 * boost + .05 * (s.actionable ? 1 : 0);
}

export function rankStories(stories: Story[], profile: InsightProfile, income: number) {
  for (const story of stories) story.priority = priorityOf(story, profile, income);
  return stories.sort((a, b) => b.priority - a.priority || a.signature.localeCompare(b.signature));
}
