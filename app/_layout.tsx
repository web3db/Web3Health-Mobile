// app/_layout.tsx
import '@/src/background/shareTask';
import { registerShareBackgroundTask } from '@/src/background/shareTask';
import { useAppFocusSharingTick } from '@/src/hooks/useAppFocus';
import { initNotifications } from '@/src/services/notifications';
import { getShareRuntimeConfig } from '@/src/services/sharing/constants';
import { useTrackingStore } from '@/src/store/useTrackingStore';
import { ThemeControllerProvider, useThemeController } from '@/src/theme/ThemeController';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as NavigationBar from 'expo-navigation-bar';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AppShell() {
  const { resolvedScheme } = useThemeController();
  const c = useThemeColors();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
    // tick on focus + every 60s while foregrounded)
 useAppFocusSharingTick(__DEV__ ? 5 : 60);
 console.log('[SHARE][Config]', getShareRuntimeConfig());
  const { hcInitialize, hcInitialized } = useTrackingStore();

useEffect(() => {
  (async () => {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        await initNotifications();
        await registerShareBackgroundTask();
        if (__DEV__) console.log('[BG] registerShareBackgroundTask → ok');
      } catch (e: any) {
        console.warn('[BG] registerShareBackgroundTask → error', e?.message ?? e);
      }
    } else {
      if (__DEV__) console.log('[BG] background tasks not supported on this platform');
    }
  })();
}, []);

useEffect(() => {
  if (Platform.OS === 'android') {
    // Make the system nav bar push content up (not overlay)
    NavigationBar.setPositionAsync('relative');
    // Gestures behave nicely with insets
    NavigationBar.setBehaviorAsync('inset-swipe').catch(() => {});
    // Optional: match your theme background
    // NavigationBar.setBackgroundColorAsync('#00000000'); // transparent if you like
  }
}, []);



  useEffect(() => {
    if (!loaded) return;
    if (Platform.OS !== 'android') return;
    if (hcInitialized) return; 

    (async () => {
      try {
        await hcInitialize(); 
      } catch {
        
      }
    })();
  }, [loaded, hcInitialized, hcInitialize]);

  if (!loaded) return null; 

  const isDark = resolvedScheme === 'dark';

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Drawer
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          drawerPosition: 'right',
          drawerStyle: { backgroundColor: c.surface, width: 300 },
          drawerActiveTintColor: c.text.primary,
          drawerInactiveTintColor: c.text.secondary,
        }}
      >

        <Drawer.Screen name="(tabs)" options={{ drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="+not-found" options={{ drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="opportunities/index" options={{ drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="opportunities/[id]" options={{ drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="data-assets" options={{ drawerItemStyle: { display: 'none' } }} />

        <Drawer.Screen
          name="profile"
          options={{
            title: 'Profile',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="person-circle-outline" color={color} size={size ?? 20} />
            ),
          }}
        />
        <Drawer.Screen
          name="settings"
          options={{
            title: 'Settings',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" color={color} size={size ?? 20} />
            ),
          }}
        />
      </Drawer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeControllerProvider>
        <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </ThemeControllerProvider>
  );
}
