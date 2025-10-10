export type SexAtBirth = 'female' | 'male' | 'intersex' | 'prefer_not_to_say';
export type UnitSystem = 'metric' | 'imperial';

export interface MeasureHeight {
  value: number | null;
  unit: 'cm' | 'in';
}
export interface MeasureWeight {
  value: number | null;
  unit: 'kg' | 'lb';
}

export interface Profile {
  id: string;
  displayName?: string;
  email: string;
  sexAtBirth: SexAtBirth;
  genderIdentity?: string;
  birthYear: number;
  birthDate?: string;
  height: MeasureHeight;     // ← narrowed
  weight: MeasureWeight;     // ← narrowed
  units: UnitSystem;
  avatarUrl?: string;
  updatedAtISO: string;
}
