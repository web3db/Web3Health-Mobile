import { ThemeControllerProvider, useThemeController } from '@/src/theme/ThemeController';
import { ClerkLoaded, ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Slot, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
if (!CLERK_PUBLISHABLE_KEY) throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

// Clerk token cache
const memoryCache = new Map<string, string>();
const tokenCache = {
  getToken: async (k: string) => (Platform.OS === 'web' ? memoryCache.get(k) ?? null : SecureStore.getItemAsync(k)),
  saveToken: async (k: string, v: string | null) => {
    if (Platform.OS === 'web') { v == null ? memoryCache.delete(k) : memoryCache.set(k, v!); return; }
    if (v == null) await SecureStore.deleteItemAsync(k); else await SecureStore.setItemAsync(k, v);
  },
};

function ThemeFrame({ children }: { children: React.ReactNode }) {
  const { resolvedScheme } = useThemeController();
  const isDark = resolvedScheme === 'dark';
  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      {children}
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const isAuthRoute = useMemo(() => pathname?.startsWith('/auth/'), [pathname]);
  const isLoginRoute = pathname === '/auth/login';
  // Allow register while signed-in (first-time backend user creation)
  // const isRegisterRoute = pathname === '/auth/register';

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ThemeControllerProvider>
        <SafeAreaProvider>
          <ThemeFrame>
            <ClerkLoaded>
              <SignedIn>
                {/* If a signed-in user somehow hits /auth/login, send them home. 
                    Note: DO NOT block /auth/register here; first-time users need it. */}
                {isLoginRoute ? <Redirect href="/" /> : <Slot />}
              </SignedIn>

              <SignedOut>
                {/* When signed out, render any /auth/* page directly; otherwise, go to /auth/login */}
                {isAuthRoute ? <Slot /> : <Redirect href="/auth/login" />}
              </SignedOut>
            </ClerkLoaded>
          </ThemeFrame>
        </SafeAreaProvider>
      </ThemeControllerProvider>
    </ClerkProvider>
  );
}
