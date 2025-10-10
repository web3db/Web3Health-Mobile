import { getProfile, saveProfile } from '@/src/services/profile/mock';
import type { Profile, UnitSystem } from '@/src/services/profile/types';
import { create } from 'zustand';

type State = {
  profile: Profile | null;
  loading: boolean;
  error?: string;
};

type Actions = {
  fetch: () => Promise<void>;
  update: (fields: Partial<Profile>) => void;
  toggleUnits: (to: UnitSystem) => void;
  reset: () => Promise<void>;
  persist: () => Promise<boolean>; // returns success
};

export const useProfileStore = create<State & Actions>((set, get) => ({
  profile: null,
  loading: false,

  fetch: async () => {
    set({ loading: true, error: undefined });
    try {
      const p = await getProfile();
      set({ profile: p, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Failed to load profile' });
    }
  },

  update: (fields) => {
    const curr = get().profile;
    if (!curr) return;
    set({ profile: { ...curr, ...fields } as Profile });
  },

  toggleUnits: (to) => {
    const curr = get().profile;
    if (!curr || curr.units === to) return;

    const next = { ...curr, units: to };

    // convert measures safely
    if (to === 'metric') {
      // in -> cm; lb -> kg
      if (next.height.unit === 'in' && typeof next.height.value === 'number') {
        next.height = { value: Math.round(next.height.value * 2.54), unit: 'cm' };
      }
      if (next.weight.unit === 'lb' && typeof next.weight.value === 'number') {
        next.weight = { value: Math.round((next.weight.value / 2.20462) * 10) / 10, unit: 'kg' };
      }
    } else {
      // cm -> in; kg -> lb
      if (next.height.unit === 'cm' && typeof next.height.value === 'number') {
        next.height = { value: Math.round(next.height.value / 2.54), unit: 'in' };
      }
      if (next.weight.unit === 'kg' && typeof next.weight.value === 'number') {
        next.weight = { value: Math.round(next.weight.value * 2.20462), unit: 'lb' };
      }
    }

    set({ profile: next });
  },

  reset: async () => {
    await get().fetch();
  },

  persist: async () => {
    try {
      const p = get().profile;
      if (!p) return false;
      const saved = await saveProfile(p);
      set({ profile: saved });
      return true;
    } catch (e) {
      set({ error: (e as any)?.message ?? 'Failed to save' });
      return false;
    }
  },
}));

// --------- Derived helpers (export for UI) ---------
export function computeAge(birthYear: number, birthDate?: string): number | null {
  const now = new Date();
  if (birthDate) {
    const dob = new Date(birthDate);
    if (isNaN(dob.getTime())) return null;
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }
  if (!birthYear) return null;
  return now.getFullYear() - birthYear;
}

export function computeBMI(heightValue: number | null, heightUnit: 'cm'|'in', weightValue: number | null, weightUnit: 'kg'|'lb'): number | null {
  if (heightValue == null || weightValue == null) return null;
  if (heightUnit === 'cm' && weightUnit === 'kg') {
    const meters = heightValue / 100;
    if (meters <= 0) return null;
    return Number((weightValue / (meters * meters)).toFixed(1));
  }
  if (heightUnit === 'in' && weightUnit === 'lb') {
    if (heightValue <= 0) return null;
    return Number((703 * weightValue / (heightValue * heightValue)).toFixed(1));
  }
  // If mixed, convert to metric
  const cm = heightUnit === 'in' ? heightValue * 2.54 : heightValue;
  const kg = weightUnit === 'lb' ? weightValue / 2.20462 : weightValue;
  const meters = cm / 100;
  if (meters <= 0) return null;
  return Number((kg / (meters * meters)).toFixed(1));
}

export function bmiCategory(bmi: number | null): string {
  if (bmi == null) return '—';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}
