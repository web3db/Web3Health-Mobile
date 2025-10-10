import { useColorScheme as useSystemScheme } from '@/hooks/useColorScheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AppearanceOverride = 'system' | 'light' | 'dark';

type ThemeControllerState = {
  appearanceOverride: AppearanceOverride;
  setAppearanceOverride: (mode: AppearanceOverride) => void;
  resolvedScheme: 'light' | 'dark'; // what the app actually uses right now
};

const ThemeControllerCtx = createContext<ThemeControllerState | null>(null);

export function ThemeControllerProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemScheme(); // 'light' | 'dark' from device
  const [appearanceOverride, setAppearanceOverride] = useState<AppearanceOverride>('system');

  // Load saved override once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('@appearanceOverride');
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setAppearanceOverride(saved);
        }
      } catch {}
    })();
  }, []);

  // Persist override
  useEffect(() => {
    AsyncStorage.setItem('@appearanceOverride', appearanceOverride).catch(() => {});
  }, [appearanceOverride]);

  const resolvedScheme: 'light' | 'dark' = useMemo(() => {
    if (appearanceOverride === 'system') return system === 'dark' ? 'dark' : 'light';
    return appearanceOverride;
  }, [appearanceOverride, system]);

  const value = useMemo(
    () => ({ appearanceOverride, setAppearanceOverride, resolvedScheme }),
    [appearanceOverride, resolvedScheme]
  );

  return <ThemeControllerCtx.Provider value={value}>{children}</ThemeControllerCtx.Provider>;
}

export function useThemeController() {
  const ctx = useContext(ThemeControllerCtx);
  if (!ctx) throw new Error('useThemeController must be used within ThemeControllerProvider');
  return ctx;
}
