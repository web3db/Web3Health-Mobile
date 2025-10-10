import type { Profile } from '@/src/services/profile/types';

export const profileSeed: Profile = {
  id: 'local-user',
  displayName: 'Your Name',
  email: 'you@example.com',
  sexAtBirth: 'prefer_not_to_say',
  genderIdentity: '',
  birthYear: 1999,
  birthDate: undefined,
  height: { value: 175, unit: 'cm' },
  weight: { value: 72, unit: 'kg' },
  units: 'metric',
  avatarUrl: undefined,
  updatedAtISO: new Date().toISOString(),
};
