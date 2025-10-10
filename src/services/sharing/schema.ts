import { z } from 'zod';

export const ApplicationStatus = z.enum(['APPLIED', 'PENDING', 'ACCEPTED', 'REJECTED']);

export const ShareChannel = z.object({
  id: z.string(),
  label: z.string(),
  scope: z.enum(['READ', 'WRITE']),
});

export const ActiveShare = z.object({
  id: z.string(),
  studyId: z.string(),
  studyTitle: z.string(),
  channels: z.array(ShareChannel),
  sinceISO: z.string(), // ISO date
});

export const Application = z.object({
  id: z.string(),
  studyId: z.string(),
  studyTitle: z.string(),
  appliedAtISO: z.string(),
  status: ApplicationStatus,
  note: z.string().optional(),
});

export const Badge = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  earnedAtISO: z.string(),
  valueUSD: z.number(),
});

export const EarningsSummary = z.object({
  totalUSD: z.number(),
  badgesCount: z.number(),
});

export const ShareState = z.object({
  applications: z.array(Application),
  activeShares: z.array(ActiveShare),
  badges: z.array(Badge),
  earnings: EarningsSummary,
});

export type TShareState = z.infer<typeof ShareState>;
