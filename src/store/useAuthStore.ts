// src/store/useAuthStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type AuthState = {
  // data
  userId: number | null;
  email: string | null;
  name: string | null;     

  // lifecycle
  _hasHydrated: boolean;

  // actions
  setAuth: (p: { userId: number | null; email?: string | null; name?: string | null }) => void; // UPDATED
  setUserId: (id: number | null) => void;  // backward compat
  setName: (name: string | null) => void;  // optional helper
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: null,
      email: null,
      name: null,
      _hasHydrated: false,

      setAuth: ({ userId, email = get().email, name = get().name }) =>
        set((s) => {
          const next = {
            userId,
            email: email ?? null,
            name: name ?? null,
          };
          const same =
            s.userId === next.userId &&
            (s.email ?? null) === (next.email ?? null) &&
            (s.name ?? null) === (next.name ?? null);
          return same ? s : next;
        }),

      
      setUserId: (id) =>
        set((s) => (s.userId === id ? s : { userId: id })),

      
      setName: (name) =>
        set((s) => ((s.name ?? null) === (name ?? null) ? s : { name })),

      clear: () =>
        set((s) =>
          s.userId == null && (s.email == null || s.email === '') && (s.name == null || s.name === '')
            ? s
            : { userId: null, email: null, name: null }
        ),
    }),
    {
      name: 'auth:v3',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      partialize: (state) => ({
        userId: state.userId,
        email: state.email,
        name: state.name, // persist name
      }),

      onRehydrateStorage:
        () =>
        () => {
          useAuthStore.setState({ _hasHydrated: true }, false);
          if (__DEV__) console.log('[auth] hydrated');
        },

      migrate: (persisted: any, fromVersion) => {
        switch (fromVersion) {
          // v1 → v2 introduced email; keep as-is
          case 1:
            return { email: null, name: null, ...persisted };
          // v2 → v3 introduces name
          case 2:
            return { name: null, ...persisted };
          default:
            return persisted;
        }
      },
    }
  )
);

// Selectors
export const selectUserId = (s: AuthState) => s.userId;
export const selectEmail = (s: AuthState) => s.email;
export const selectName  = (s: AuthState) => s.name;
export const selectIsRegistered = (s: AuthState) => s.userId != null;
export const selectHydrated = (s: AuthState) => s._hasHydrated;
