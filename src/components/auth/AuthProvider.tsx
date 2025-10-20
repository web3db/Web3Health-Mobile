import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { create } from 'zustand';

type User = { id: number; email: string; displayName?: string | null } | null;

type AuthState = {
  user: User;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;   // stub for now
  register: (email: string, password: string, displayName?: string) => Promise<void>; // stub
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

const STORAGE_KEY = 'session.v1';

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { user, token } = JSON.parse(raw);
        set({ user, token, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },
  // TEMP STUBS — will call Edge Functions later
  login: async (email, _password) => {
    // TODO: replace with POST /auth_login
    const fakeUser = { id: 1, email, displayName: 'You' };
    const fakeToken = 'dev.fake.token';
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: fakeUser, token: fakeToken }));
    set({ user: fakeUser, token: fakeToken });
  },
  register: async (email, _password, displayName) => {
    // TODO: replace with POST /auth_register
    const fakeUser = { id: 1, email, displayName: displayName ?? null };
    const fakeToken = 'dev.fake.token';
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: fakeUser, token: fakeToken }));
    set({ user: fakeUser, token: fakeToken });
  },
  logout: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ user: null, token: null });
  },
}));

const AuthContext = createContext<ReturnType<typeof useAuthStore> | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const store = useAuthStore();
  useEffect(() => { store.hydrate(); }, []);
  const value = useMemo(() => store, [store]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
