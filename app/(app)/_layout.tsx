// app/(app)/_layout.tsx
import { useAppFocusSharingTick } from "@/src/hooks/useAppFocus";
import { getShareRuntimeConfig } from "@/src/services/sharing/constants";
import { selectUserId, useAuthStore } from "@/src/store/useAuthStore";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useAuth } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import { Drawer } from "expo-router/drawer";
import React from "react";
import { Platform } from "react-native";

// import {
//   hkBootstrapBackgroundObservers,
//   hkGetAuthorizationStatus,
//   hkIsBackgroundObserversActive
// } from "@/src/services/tracking/healthkit";

let __bgBootedOnce = false;

// === [ANCHOR: COMPONENT-FOREGROUND-TICK]
function ForegroundTicker() {
  // 5s in DEV, 60s in PROD
  useAppFocusSharingTick(__DEV__ ? 5 : 60);
  return null;
}

function BackgroundBootWhenSignedIn() {
  const { isSignedIn } = useAuth();
  const userId = useAuthStore(selectUserId);
  const { hcInitialize, hcInitialized } = useTrackingStore();

  const [fontsLoaded] = useFonts({
    SpaceMono: require("../../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // Ready when: Clerk session + backend userId + fonts
  const ready = isSignedIn && userId != null && fontsLoaded;

  // Expose “ready” to any eager modules (sharing engine, etc.)
  React.useEffect(() => {
    if (!ready) return;
    (globalThis as any).__SHARE_READY__ = true;
    if (__DEV__)
      console.log("[APP BOOT] ready; config=", getShareRuntimeConfig());
    return () => {
      (globalThis as any).__SHARE_READY__ = false;
    };
  }, [ready]);

  // Background tasks + notifications (lazy import AFTER ready, register once)
  React.useEffect(() => {
    if (!ready) return;
    (async () => {
      if (Platform.OS === "android" || Platform.OS === "ios") {
        try {
          if (!__bgBootedOnce) {
            __bgBootedOnce = true; // === [ANCHOR: BOOT-ONCE-GUARD-SET]
            const { initNotifications } = await import(
              "@/src/services/notifications"
            );
            const { registerShareBackgroundTask } = await import(
              "@/src/background/shareTask"
            );
            await initNotifications();
            await registerShareBackgroundTask();
            if (__DEV__) console.log("[BG] registerShareBackgroundTask → ok");
          } else if (__DEV__) {
            console.log("[BG] skipped re-register (already booted)");
          }
        } catch (e: any) {
          console.warn(
            "[BG] registerShareBackgroundTask → error",
            e?.message ?? e
          );
        }
      }
    })();
  }, [ready]);

  // Optional: nav bar tweaks (Android only)
  React.useEffect(() => {
    if (!ready || Platform.OS !== "android") return;
    (async () => {
      try {
        await NavigationBar.setPositionAsync("relative");
        await NavigationBar.setBehaviorAsync("inset-swipe");
      } catch {
        // ignore if edge-to-edge conflicts
      }
    })();
  }, [ready]);

  // Health Connect init once we’re ready
  React.useEffect(() => {
    if (!ready || Platform.OS !== "android" || hcInitialized) return;
    (async () => {
      try {
        await hcInitialize();
        if (__DEV__) console.log("[HC] initialize → success");
      } catch (e) {
        if (__DEV__) console.warn("[HC] initialize → error", e);
      }
    })();
  }, [ready, hcInitialized, hcInitialize]);

  // [HK][BG][BOOT] mount-time bootstrap (iOS)
  // useEffect(() => {
  //   if (!ready) return;
  //   if (Platform.OS !== "ios") return;

  //   (async () => {
  //     try {
  //       const stx = await hkGetAuthorizationStatus(); // { available, granted }

  //       if (stx.available !== true) {
  //         if (__DEV__) console.log("[HK][BG] skipped boot (HK not available)");
  //         return;
  //       }
  //       if (!stx.granted) {
  //         if (__DEV__)
  //           console.log("[HK][BG] skipped boot (permissions not granted)");
  //         return;
  //       }
  //       // if (hkIsBackgroundObserversActive()) {
  //       //   if (__DEV__) console.log("[HK][BG] already active");
  //       //   return;
  //       // }

  //       // await hkBootstrapBackgroundObservers();
  //       if (__DEV__) console.log("[HK][BG] bootstrapped observers (mount)");
  //     } catch (e: any) {
  //       console.log("[HK][BG] bootstrap mount error", e?.message ?? e);
  //     }
  //   })();
  // }, [ready]);

  // [HK][BG][BOOT] resume-on-foreground (iOS)
  // useEffect(() => {
  //   if (!ready) return;
  //   if (Platform.OS !== "ios") return;

  //   const last = { state: AppState.currentState };

  //   const sub = AppState.addEventListener("change", async (state) => {
  //     const prev = last.state;
  //     last.state = state;

  //     if (
  //       (prev === "background" || prev === "inactive") &&
  //       state === "active"
  //     ) {
  //       try {
  //         // ✅ Passive check: does NOT show the permission sheet
  //         const stx = await hkGetAuthorizationStatus(); // { available, granted }

  //         if (stx.available !== true) return;
  //         if (!stx.granted) return;
  //         if (hkIsBackgroundObserversActive()) return;

  //         // await hkBootstrapBackgroundObservers();
  //         // if (__DEV__)
  //         //   console.log("[HK][BG] bootstrapped observers (foreground)");
  //       } catch (e: any) {
  //         console.log("[HK][BG] bootstrap foreground error", e?.message ?? e);
  //       }
  //     }
  //   });

  //   return () => {
  //     try {
  //       sub?.remove?.();
  //     } catch {}
  //   };
  // }, [ready]);

  return ready ? <ForegroundTicker /> : null;
}

export default function AppGroupLayout() {
  const c = useThemeColors();

  return (
    <>
      {/* Boot background/HC only after login + backend registration */}
      <BackgroundBootWhenSignedIn />

      <Drawer
        screenOptions={{
          headerShown: false,
          drawerType: "front",
          drawerPosition: "right",
          drawerStyle: { backgroundColor: c.surface, width: 300 },
          drawerActiveTintColor: c.text.primary,
          drawerInactiveTintColor: c.text.secondary,
        }}
      >
        {/* Tabs entry point (hidden) */}
        <Drawer.Screen
          name="(tabs)"
          options={{ drawerItemStyle: { display: "none" } }}
        />

        {/* Routable but hidden */}
        <Drawer.Screen
          name="data-assets"
          options={{ drawerItemStyle: { display: "none" } }}
        />
        <Drawer.Screen
          name="opportunities/index"
          options={{ drawerItemStyle: { display: "none" } }}
        />
        <Drawer.Screen
          name="opportunities/[id]"
          options={{ drawerItemStyle: { display: "none" } }}
        />
        <Drawer.Screen
          name="auth/login"
          options={{ drawerItemStyle: { display: "none" } }}
        />
        <Drawer.Screen
          name="auth/register"
          options={{ drawerItemStyle: { display: "none" } }}
        />
        <Drawer.Screen
          name="background"
          options={{ drawerItemStyle: { display: "none" } }}
        />

        {/* Drawer items */}
        <Drawer.Screen
          name="profile"
          options={{
            title: "Profile",
            drawerIcon: ({ color, size }) => (
              <Ionicons
                name="person-circle-outline"
                color={color}
                size={size ?? 20}
              />
            ),
          }}
        />
        <Drawer.Screen
          name="settings"
          options={{
            title: "Settings",
            drawerIcon: ({ color, size }) => (
              <Ionicons
                name="settings-outline"
                color={color}
                size={size ?? 20}
              />
            ),
          }}
        />
        <Drawer.Screen
          name="about"
          options={{
            title: "About",
            drawerIcon: ({ color, size }) => (
              <Ionicons
                name="information-circle-outline"
                color={color}
                size={size ?? 20}
              />
            ),
          }}
        />
      </Drawer>
    </>
  );
}
