// import { useColorScheme as useSystemScheme } from '@/hooks/useColorScheme';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// type AppearanceOverride = 'system' | 'light' | 'dark';

// type ThemeControllerState = {
//   appearanceOverride: AppearanceOverride;
//   setAppearanceOverride: (mode: AppearanceOverride) => void;
//   resolvedScheme: 'light' | 'dark'; // what the app actually uses right now
// };

// const ThemeControllerCtx = createContext<ThemeControllerState | null>(null);

// export function ThemeControllerProvider({ children }: { children: React.ReactNode }) {
//   const system = useSystemScheme(); // 'light' | 'dark' from device
//   const [appearanceOverride, setAppearanceOverride] = useState<AppearanceOverride>('system');

//   // Load saved override once
//   useEffect(() => {
//     (async () => {
//       try {
//         const saved = await AsyncStorage.getItem('@appearanceOverride');
//         if (saved === 'light' || saved === 'dark' || saved === 'system') {
//           setAppearanceOverride(saved);
//         }
//       } catch {}
//     })();
//   }, []);

//   // Persist override
//   useEffect(() => {
//     AsyncStorage.setItem('@appearanceOverride', appearanceOverride).catch(() => {});
//   }, [appearanceOverride]);

//   const resolvedScheme: 'light' | 'dark' = useMemo(() => {
//     if (appearanceOverride === 'system') return system === 'dark' ? 'dark' : 'light';
//     return appearanceOverride;
//   }, [appearanceOverride, system]);

//   const value = useMemo(
//     () => ({ appearanceOverride, setAppearanceOverride, resolvedScheme }),
//     [appearanceOverride, resolvedScheme]
//   );

//   return <ThemeControllerCtx.Provider value={value}>{children}</ThemeControllerCtx.Provider>;
// }

// export function useThemeController() {
//   const ctx = useContext(ThemeControllerCtx);
//   if (!ctx) throw new Error('useThemeController must be used within ThemeControllerProvider');
//   return ctx;
// }

// src/theme/ThemeController.tsx
import { useColorScheme as useSystemScheme } from '@/hooks/useColorScheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ColorSchemeName } from 'react-native';

type AppearanceOverride = 'system' | 'light' | 'dark';
type ThemeControllerState = {
  appearanceOverride: AppearanceOverride;
  setAppearanceOverride: (mode: AppearanceOverride) => void;
  resolvedScheme: 'light' | 'dark';
};

const STORAGE_KEY = '@appearanceOverride';
const ThemeControllerCtx = createContext<ThemeControllerState | null>(null);

export function ThemeControllerProvider({ children }: { children: React.ReactNode }) { // 'light' | 'dark' from device
  const systemRaw: ColorSchemeName = useSystemScheme();
  const system: 'light' | 'dark' = systemRaw === 'dark' ? 'dark' : 'light';
  const [appearanceOverride, setAppearanceOverrideRaw] =
    useState<AppearanceOverride>('system');

  // Track mount + loaded state to prevent writes before first read
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mountedRef.current) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setAppearanceOverrideRaw((prev) => (prev === saved ? prev : saved));
        }
      } catch {
        // noop
      } finally {
        loadedRef.current = true;
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Only persist *after* initial load, and only on real changes
  useEffect(() => {
    if (!loadedRef.current) return;
    (async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, appearanceOverride);
      } catch {
        // noop
      }
    })();
  }, [appearanceOverride]);

  // Setter that ignores identical values (prevents churn)
  const setAppearanceOverride = useCallback((mode: AppearanceOverride) => {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return;
    setAppearanceOverrideRaw((prev) => (prev === mode ? prev : mode));
  }, []);

  // Compute effective scheme; no state updates here (pure)
  const resolvedScheme: 'light' | 'dark' = useMemo(() => {
    return appearanceOverride === 'system' ? system : appearanceOverride;
  }, [appearanceOverride, system]);

  const value = useMemo<ThemeControllerState>(
    () => ({ appearanceOverride, setAppearanceOverride, resolvedScheme }),
    [appearanceOverride, setAppearanceOverride, resolvedScheme]
  );

  return <ThemeControllerCtx.Provider value={value}>{children}</ThemeControllerCtx.Provider>;
}

export function useThemeController() {
  const ctx = useContext(ThemeControllerCtx);
  if (!ctx) throw new Error('useThemeController must be used within ThemeControllerProvider');
  return ctx;
}
