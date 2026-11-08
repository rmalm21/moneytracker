/** 9.0 Ruang Bersama: the space document's shape, its record settings and the profile screens read in a space. */
import type { Profile } from './types';
import type { Timestamp } from 'firebase/firestore';

export const MAX_MEMBERS = 5, MAX_SPACES = 5, INVITE_HOURS = 24;
export type SpaceMember = { name: string; email?: string; joinedAt?: unknown };
/** The space document: who is in it, and the settings its records use (period, Beranda, Catat cepat…). */
export type Space = Partial<Pick<Profile, typeof SPACE_FIELDS[number]>> & {
  id: string; name: string; emoji?: string; color?: string; createdBy: string;
  memberIds: string[]; members: Record<string, SpaceMember>;
  formerMembers?: Record<string, { name: string; leftAt?: unknown }>;
  /** The invite waiting to be used, so every member sees it and can cancel it. */
  invite?: { code: string; expiresAt: Timestamp; by: string } | null;
  createdAt?: unknown; updatedAt?: unknown;
};
export type SpaceRequest = { uid: string; name: string; email: string; code: string; at?: Timestamp };
export type SpaceInvite = { code: string; spaceId: string; spaceName: string; inviterName: string; createdBy: string; expiresAt: Timestamp; usedBy?: string | null };

/** Settings that belong to the records (so the space has its own); the rest of the profile stays the person's own. */
export const SPACE_FIELDS = ['salaryCycleStartDay', 'monthlySalary', 'hideReserved', 'defaultExpenseWalletId', 'defaultIncomeWalletId', 'salaryIncomeCategoryId',
  'budgetWarningPercent', 'dashboardWidgets', 'freeMoneyBuffer', 'commitmentHorizon', 'dashboardWidgetsVersion', 'dashboardWidgetConfig', 'primaryMetric',
  'dashboardPeriod', 'dashboardCustom', 'analyticsPeriod', 'analyticsCustom', 'analyticsGranularity', 'quickActions', 'realisticMode',
  'largeTransactionThreshold', 'excludeCommittedFromAvailable', 'netWorthIncludesReceivables', 'syncMarks', 'defaultCategoryTemplateVersion'] as const;

/** The profile the screens read in a space: the person's own (name, look, PIN…) with the space's record settings. */
export function spaceProfile(personal: Profile, space: Space): Profile {
  const out: Record<string, unknown> = { ...personal, monthlySalary: 0, dashboardWidgets: [], onboardingDone: true };
  for (const field of SPACE_FIELDS) { if (field === 'monthlySalary' || field === 'dashboardWidgets') { if (space[field] !== undefined) out[field] = space[field]; } else out[field] = space[field]; }
  if (!out.salaryCycleStartDay) out.salaryCycleStartDay = personal.salaryCycleStartDay || 1;
  return out as Profile;
}

/** Shown as "ABCDE-FGHJK"; typed with or without the dash, in any case. */
export const formatCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;
export const cleanCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');

