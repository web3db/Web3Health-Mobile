import { create } from 'zustand';

// Transient register form state (no persistence)
export type RegisterFormState = {
  // Required
  name: string;
  birthYear: number | null;

  // Optional
  clerkId: string | null;
  email: string | null;

  raceId: number | null;
  sexId: number | null;

  heightNum: number | null;
  heightUnitId: number | null;

  weightNum: number | null;
  weightUnitId: number | null;

  measurementSystemId: number | null;

  roleId: number | null; // single role

  healthConditionIds: number[]; // multi-select

  // Actions
  setField: <K extends keyof Omit<RegisterFormState, 'setField' | 'toggleHealthCondition' | 'setHealthConditionIds' | 'reset'>>(
    key: K,
    value: RegisterFormState[K]
  ) => void;

  toggleHealthCondition: (id: number) => void;
  setHealthConditionIds: (ids: number[]) => void;
  reset: () => void;
};

const initialState = (): Omit<
  RegisterFormState,
  'setField' | 'toggleHealthCondition' | 'setHealthConditionIds' | 'reset'
> => ({
  name: '',
  birthYear: null,

  clerkId: null,
  email: null,

  raceId: null,
  sexId: null,

  heightNum: null,
  heightUnitId: null,

  weightNum: null,
  weightUnitId: null,

  measurementSystemId: null,

  roleId: null,

  healthConditionIds: [],
});

export const useRegisterStore = create<RegisterFormState>((set, get) => ({
  ...initialState(),

  setField: (key, value) => set({ [key]: value } as any),

  toggleHealthCondition: (id) => {
    const cur = get().healthConditionIds;
    if (cur.includes(id)) {
      set({ healthConditionIds: cur.filter((x) => x !== id) });
    } else {
      set({ healthConditionIds: [...cur, id] });
    }
  },

  setHealthConditionIds: (ids) => set({ healthConditionIds: Array.from(new Set(ids)) }),

  reset: () => set(initialState()),
}));
