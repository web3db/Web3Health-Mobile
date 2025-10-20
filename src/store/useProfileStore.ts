import {
  getUserProfile,
  patchUser,
  ProfileEditSchema,
  type ProfileEdit,
  type UserProfile,
} from '@/src/services/profile/api';
import { selectUserId, useAuthStore } from '@/src/store/useAuthStore';
import { create } from 'zustand';

// ───────── helpers
function shallowEqual<T extends Record<string, any>>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function arrayEqualShallow(a?: any[], b?: any[]) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

type State = {
  loading: boolean;
  error?: string | null;

  profile: UserProfile | null;
  edits: ProfileEdit;

  // non-blocking UI validation output (display in UI, but still allow PATCH)
  validationWarnings: string[];
};

type Actions = {
  fetch: () => Promise<void>;
  /** New: hydrate directly after login → getUserProfile already called in the screen */
  setProfile: (user: UserProfile | null) => void;
  update: (fields: Partial<UserProfile>) => void; // legacy (optional)
  updateLocal: (patch: Partial<ProfileEdit>) => void;
  persist: () => Promise<boolean>; // returns success; does NOT block on client validation
  reset: () => Promise<void>;
};

export const useProfileStore = create<State & Actions>((set, get) => ({
  loading: false,
  error: null,

  profile: null,
  edits: {},
  validationWarnings: [],

  fetch: async () => {
    const s0 = get();
    if (!s0.loading) set({ loading: true, error: null });

    try {
      const auth = useAuthStore.getState();
      const userId = Number(selectUserId(auth) ?? 0);
      if (!Number.isFinite(userId) || userId <= 0) {
        throw new Error('No userId in auth store');
      }

      const user = await getUserProfile(userId);

      const nextEdits: ProfileEdit = {
        Name: user.Name,
        Email: user.Email ?? null,
        BirthYear: user.BirthYear,
        RaceId: user.RaceId ?? null,
        SexId: user.SexId ?? null,
        HeightNum: user.HeightNum ?? null,
        HeightUnitId: user.HeightUnitId ?? null,
        WeightNum: user.WeightNum ?? null,
        WeightUnitId: user.WeightUnitId ?? null,
        MeasurementSystemId: user.MeasurementSystemId ?? null,
        RoleId: user.RoleId ?? null,
        selectedHealthConditionIds: (user.HealthConditions ?? []).map((h) => h.HealthConditionId),
      };

      const s1 = get();
      const editsChanged =
        !shallowEqual(
          { ...s1.edits, selectedHealthConditionIds: undefined } as any,
          { ...nextEdits, selectedHealthConditionIds: undefined } as any
        ) ||
        !arrayEqualShallow(
          s1.edits.selectedHealthConditionIds ?? [],
          nextEdits.selectedHealthConditionIds ?? []
        );

      const profileChanged = s1.profile !== user;

      if (editsChanged || profileChanged || s1.loading || s1.error) {
        set({
          profile: user,
          edits: nextEdits,
          validationWarnings: [], // fresh load clears warnings
          loading: false,
          error: null,
        });
      } else if (s1.loading) {
        set({ loading: false });
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const s1 = get();
      if (!s1.error || s1.error !== msg || s1.loading) {
        set({ loading: false, error: msg });
      } else if (s1.loading) {
        set({ loading: false });
      }
    }
  },

  // NEW: direct hydration helper used by login flow
  setProfile: (user) => {
    if (!user) {
      // clearing
      set((s) => (s.profile == null && s.edits && Object.keys(s.edits).length === 0 ? s : { profile: null, edits: {}, validationWarnings: [] }));
      return;
    }

    const nextEdits: ProfileEdit = {
      Name: user.Name,
      Email: user.Email ?? null,
      BirthYear: user.BirthYear,
      RaceId: user.RaceId ?? null,
      SexId: user.SexId ?? null,
      HeightNum: user.HeightNum ?? null,
      HeightUnitId: user.HeightUnitId ?? null,
      WeightNum: user.WeightNum ?? null,
      WeightUnitId: user.WeightUnitId ?? null,
      MeasurementSystemId: user.MeasurementSystemId ?? null,
      RoleId: user.RoleId ?? null,
      selectedHealthConditionIds: (user.HealthConditions ?? []).map((h) => h.HealthConditionId),
    };

    set((s) => {
      const editsChanged =
        !shallowEqual(
          { ...s.edits, selectedHealthConditionIds: undefined } as any,
          { ...nextEdits, selectedHealthConditionIds: undefined } as any
        ) ||
        !arrayEqualShallow(
          s.edits.selectedHealthConditionIds ?? [],
          nextEdits.selectedHealthConditionIds ?? []
        );

      const profileChanged = s.profile !== user;

      if (!editsChanged && !profileChanged) return s;
      return {
        profile: user,
        edits: nextEdits,
        validationWarnings: [],
        loading: false,
        error: null,
      };
    });
  },

  // legacy helper for components still mutating profile directly
  update: (fields) => {
    const curr = get().profile;
    if (!curr) return;
    const next = { ...curr, ...fields } as UserProfile;
    if (next !== curr) set({ profile: next });
  },

  updateLocal: (patch) => {
    set((s) => {
      const next = { ...s.edits, ...patch };
      const hcSame = arrayEqualShallow(
        s.edits.selectedHealthConditionIds ?? [],
        next.selectedHealthConditionIds ?? []
      );
      const shallowSame = shallowEqual(
        { ...s.edits, selectedHealthConditionIds: undefined } as any,
        { ...next, selectedHealthConditionIds: undefined } as any
      );
      if (shallowSame && hcSame) return s; // no-op
      return { edits: next };
    });
  },

  persist: async () => {
    const s = get();
    const p = s.profile;
    if (!p) return false;

    // 1) Soft validate (do not block); surface warnings to UI
    const parsed = ProfileEditSchema.safeParse(s.edits);
    const warnings: string[] = [];
    if (!parsed.success) {
      for (const issue of parsed.error.issues) warnings.push(issue.message);
    }

    if (!arrayEqualShallow(s.validationWarnings, warnings)) {
      set({ validationWarnings: warnings });
    }

    // 2) Build PATCH body (A1 semantics for HealthConditions)
    const body: any = { userId: p.UserId };
    const keys: (keyof ProfileEdit)[] = [
      'Name',
      'Email',
      'BirthYear',
      'RaceId',
      'SexId',
      'HeightNum',
      'HeightUnitId',
      'WeightNum',
      'WeightUnitId',
      'MeasurementSystemId',
      'RoleId',
      'selectedHealthConditionIds',
    ];
    for (const k of keys) {
      const v = s.edits[k];
      if (v !== undefined) {
        if (k === 'selectedHealthConditionIds') body.HealthConditions = v; // [] clears
        else body[k] = v;
      }
    }

    // 3) Send PATCH regardless of warnings; backend is source of truth
    try {
      if (!s.loading) set({ loading: true, error: null });

      const updated = await patchUser(body);

      const nextEdits: ProfileEdit = {
        Name: updated.Name,
        Email: updated.Email ?? null,
        BirthYear: updated.BirthYear,
        RaceId: updated.RaceId ?? null,
        SexId: updated.SexId ?? null,
        HeightNum: updated.HeightNum ?? null,
        HeightUnitId: updated.HeightUnitId ?? null,
        WeightNum: updated.WeightNum ?? null,
        WeightUnitId: updated.WeightUnitId ?? null,
        MeasurementSystemId: updated.MeasurementSystemId ?? null,
        RoleId: updated.RoleId ?? null,
        selectedHealthConditionIds: (updated.HealthConditions ?? []).map((h) => h.HealthConditionId),
      };

      const s2 = get();

      const editsChanged =
        !shallowEqual(
          { ...s2.edits, selectedHealthConditionIds: undefined } as any,
          { ...nextEdits, selectedHealthConditionIds: undefined } as any
        ) ||
        !arrayEqualShallow(
          s2.edits.selectedHealthConditionIds ?? [],
          nextEdits.selectedHealthConditionIds ?? []
        );

      const profileChanged = s2.profile !== updated;
      const warningsChanged = !arrayEqualShallow(s2.validationWarnings, warnings);

      if (editsChanged || profileChanged || warningsChanged || s2.loading) {
        set({
          profile: updated,
          edits: nextEdits,
          validationWarnings: warnings,
          loading: false,
        });
      } else if (s2.loading) {
        set({ loading: false });
      }

      return true;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const s2 = get();
      if (!s2.error || s2.error !== msg || s2.loading) {
        set({ loading: false, error: msg });
      } else if (s2.loading) {
        set({ loading: false });
      }
      return false;
    }
  },

  reset: async () => {
    await get().fetch();
  },
}));

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

export function computeBMI(
  heightValue: number | null,
  heightUnit: 'cm' | 'in',
  weightValue: number | null,
  weightUnit: 'kg' | 'lb'
): number | null {
  if (heightValue == null || weightValue == null) return null;

  if (heightUnit === 'cm' && weightUnit === 'kg') {
    const meters = heightValue / 100;
    if (meters <= 0) return null;
    return Number((weightValue / (meters * meters)).toFixed(1));
  }

  if (heightUnit === 'in' && weightUnit === 'lb') {
    if (heightValue <= 0) return null;
    return Number(((703 * weightValue) / (heightValue * heightValue)).toFixed(1));
  }

  // Mixed: convert to metric for a consistent calculation
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
