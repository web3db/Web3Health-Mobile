// app/_layout.tsx
import { useTrackingStore } from '@/src/store/useTrackingStore';
import { ThemeControllerProvider, useThemeController } from '@/src/theme/ThemeController';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

function AppShell() {
  const { resolvedScheme } = useThemeController();
  const c = useThemeColors();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const { hcInitialize, hcInitialized } = useTrackingStore();

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
        <Drawer.Screen name="StudyDetails" options={{ drawerItemStyle: { display: 'none' } }} />
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
      <AppShell />
    </ThemeControllerProvider>
  );
}
