import { z } from 'zod';
import type { Profile } from './types';

const currentYear = new Date().getFullYear();

export const SexAtBirth = z.enum(['female', 'male', 'intersex', 'prefer_not_to_say']);
export const UnitSystem = z.enum(['metric', 'imperial']);

export const MeasureHeight = z.object({
  value: z.number().nullable(),
  unit: z.enum(['cm','in']),
});
export const MeasureWeight = z.object({
  value: z.number().nullable(),
  unit: z.enum(['kg','lb']),
});

export const ProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().email(),
  sexAtBirth: SexAtBirth,
  genderIdentity: z.string().optional(),
  birthYear: z.number().int().min(1900).max(currentYear),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  height: MeasureHeight,   // ← narrowed
  weight: MeasureWeight,   // ← narrowed
  units: UnitSystem,
  avatarUrl: z.string().url().optional(),
  updatedAtISO: z.string(),
});

export type TProfile = z.infer<typeof ProfileSchema>;

export function validateProfile(p: Profile) {
  return ProfileSchema.safeParse(p);
}
