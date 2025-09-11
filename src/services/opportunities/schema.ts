// src/services/opportunities/schema.ts
import { z } from 'zod';

export const RewardSchema = z
  .object({
    amount: z.number().nonnegative(),
    currency: z.enum(['USD', 'POINTS']),
    kind: z.enum(['one_time', 'per_day']),
  })
  .optional();

export const OpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  sponsor: z.string(),
  sponsorLogoUrl: z.string().url().optional(),
  reward: RewardSchema,
  estimatedTimeMins: z.number().int().positive().optional(),
  status: z.enum(['open', 'closed', 'upcoming']),
  tags: z.array(z.string()).optional(),
  dataTypes: z.array(z.string()).min(1),
  eligibility: z
    .object({
      minAge: z.number().int().positive().optional(),
      regions: z.array(z.string()).optional(),
      devices: z.array(z.string()).optional(),
    })
    .optional(),
  applyUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  startDate: z.string().optional(), // ISO 8601
  endDate: z.string().optional(),   // ISO 8601 (application close)
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  description: z.string().optional(),
  privacyNotes: z.array(z.string()).optional(),
  howItWorks: z.array(z.string()).optional(),
  location: z.enum(['remote', 'onsite', 'hybrid']).optional(),
});

export type OpportunityValidated = z.infer<typeof OpportunitySchema>;
