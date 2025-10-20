import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type AuthState = {
  // data
  userId: number | null;
  email: string | null;

  // lifecycle
  _hasHydrated: boolean;

  // actions
  setAuth: (p: { userId: number | null; email?: string | null }) => void;
  setUserId: (id: number | null) => void; // backward compat
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: null,
      email: null,
      _hasHydrated: false,

      setAuth: ({ userId, email = get().email }) =>
        set((s) => {
          const nextUserId = userId;
          const nextEmail = email ?? null;
          const same =
            s.userId === nextUserId &&
            (s.email ?? null) === (nextEmail ?? null);
          return same ? s : { userId: nextUserId, email: nextEmail };
        }),

      // ✅ keep old callers working
      setUserId: (id) =>
        set((s) => (s.userId === id ? s : { userId: id })),

      clear: () =>
        set((s) =>
          s.userId == null && (s.email == null || s.email === '')
            ? s
            : { userId: null, email: null }
        ),
    }),
    {
      name: 'auth:v2', // bump version because we added "email"
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      partialize: (state) => ({ userId: state.userId, email: state.email }),

      onRehydrateStorage:
        () =>
        () => {
          useAuthStore.setState({ _hasHydrated: true }, false);
          if (__DEV__) console.log('[auth] hydrated');
        },

      migrate: (persisted: any, fromVersion) => {
        switch (fromVersion) {
          // v1 → v2: ensure email exists
          case 1:
            return { email: null, ...persisted };
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
export const selectIsRegistered = (s: AuthState) => s.userId != null;
export const selectHydrated = (s: AuthState) => s._hasHydrated;
