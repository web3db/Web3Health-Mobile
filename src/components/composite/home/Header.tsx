// Header.tsx
import SettingsCoach from "@/src/components/overlay/SettingsCoach";
import Avatar from "@/src/components/ui/Avatar";
import { openAppSettings } from "@/src/services/navigation/linking";
import {
  selectEmail as selectAuthEmail,
  selectName as selectAuthName,
  selectIsRegistered,
  useAuthStore,
} from "@/src/store/useAuthStore";
import { useProfileStore } from "@/src/store/useProfileStore";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";

export default function Header() {
  const c = useThemeColors();
  const router = useRouter();
  const [showCoach, setShowCoach] = React.useState(false);

  // Auth/profile
  const authName = useAuthStore(selectAuthName);
  const authEmail = useAuthStore(selectAuthEmail);
  const rawName = useProfileStore((s) => s.profile?.Name ?? null);
  const rawEmail = useProfileStore((s) => s.profile?.Email ?? null);
  const isRegistered = useAuthStore(selectIsRegistered);

  const welcomeLine = useMemo(() => {
    const primary =
      (authName && authName.trim()) || (rawName && rawName.trim()) || null;
    if (primary) {
      const first = primary.split(/\s+/)[0];
      return `Welcome, ${first}`;
    }
    const email = authEmail || rawEmail || null;
    if (email && email.includes("@")) return `Welcome, ${email.split("@")[0]}`;
    return "Welcome";
  }, [authName, authEmail, rawName, rawEmail]);

  // Tracking store wiring
  const {
    // Cross-platform/platform flags
    healthPlatform,

    // iOS HealthKit surface
    hkAvailable,
    hkStatus, // "unknown" | "shouldRequest" | "unnecessary" | null
    hkLoading,
    hkError,
    hkHasAnyData,
    hkActiveMetrics,
    isHealthKitConnected, // selector-style helper from store

    // Android Health Connect surface (unchanged)
    hcInitialized,
    hcAvailable,
    hcGrantedKeys,
    hcLoading,
    hcError,

    // Actions
    probeHealthPlatform,
    initHealthKitIfNeeded,
    handleHealthPermissionPress,
    handleHealthSettingsReturn,
    refreshHealthKitData,
    hcRefresh,
    hcGrantAll,
    hcOpenSettings,
  } = useTrackingStore();

  // On mount: one-time silent init per platform (no UI)
  React.useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "ios") {
          if (!isRegistered) return;
          await initHealthKitIfNeeded();
        } else if (Platform.OS === "android") {
          await probeHealthPlatform();
        }
      } catch (e) {
        console.log(
          "[Header] initial health init failed",
          (e as any)?.message ?? e
        );
      }
    })();
  }, [initHealthKitIfNeeded, probeHealthPlatform]);

  // On app foreground: let store re-evaluate
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        if (Platform.OS === "ios") {
          if (!isRegistered) return;
          setShowCoach(false);
          await handleHealthSettingsReturn();
        } else if (Platform.OS === "android") {
          // Re-snapshot HC permissions + timezone, then refresh datasets.
          await probeHealthPlatform();
          await hcRefresh();
        }
      } catch (e) {
        console.log(
          "[Header] foreground health check failed",
          (e as any)?.message ?? e
        );
      }
    });

    return () => sub.remove();
  }, [handleHealthSettingsReturn, probeHealthPlatform, hcRefresh]);

  // Status line model (kept intentionally simple)
  const status = useMemo((): { label: string; tint: string } => {
    // iOS: HealthKit
    if (Platform.OS === "ios" && healthPlatform === "ios") {
      if (hkAvailable === false) {
        return { label: "Health data not supported", tint: c.warning };
      }

      if (hkLoading) {
        return { label: "Checking Apple Health…", tint: c.text.secondary };
      }

      const connected =
        typeof isHealthKitConnected === "function"
          ? isHealthKitConnected()
          : !!hkHasAnyData;

      const activeCount = hkActiveMetrics?.length ?? 0;
      const totalTrackable = 6; // steps, floors, distance, activeCalories, heartRate, weight, sleep, respiratoryRate(excluded weight ad RR for this version)

      if (connected) {
        if (activeCount > 0 && activeCount < totalTrackable) {
          return {
            label: "Apple Health: Some data connected",
            tint: c.success,
          };
        }
        return { label: "Apple Health: Connected", tint: c.success };
      }

      // We’re not connected:
      // If the system says "unnecessary", it means decisions are final for this set.
      // At this point, guidance must go through Settings.
      if (hkStatus === "unnecessary") {
        return {
          label: "Manage Apple Health in Settings",
          tint: c.warning,
        };
      }

      // Default: available but not yet authorized / first-time / unknown
      return { label: "Connect Apple Health", tint: c.warning };
    }

    // Android: Health Connect (existing behavior, simplified)
    if (Platform.OS === "android" && healthPlatform === "android") {
      if (!hcInitialized) {
        return {
          label: "Preparing Health Connect…",
          tint: c.text.secondary,
        };
      }
      if (hcAvailable === false) {
        return {
          label: "Health Connect not available",
          tint: c.warning,
        };
      }
      const hasPerms = (hcGrantedKeys?.length ?? 0) > 0;
      if (!hasPerms) {
        return {
          label: "Connect Health Connect",
          tint: c.warning,
        };
      }
      if (hcLoading) {
        return { label: "Syncing…", tint: c.text.secondary };
      }
      if (hcError) {
        return { label: "Health Connect error", tint: c.warning };
      }
      return {
        label: "Health Connect: Connected",
        tint: c.success,
      };
    }

    // Fallback: non-health platforms
    return { label: "Health not supported", tint: c.text.muted };
  }, [
    c,
    healthPlatform,
    hkAvailable,
    hkStatus,
    hkLoading,
    hkHasAnyData,
    hkActiveMetrics,
    isHealthKitConnected,
    hcInitialized,
    hcAvailable,
    hcGrantedKeys,
    hcLoading,
    hcError,
  ]);

  // Refresh button: delegates to store, no custom heuristics
  const onPressRefresh = useCallback(async () => {
    try {
      if (Platform.OS === "ios" && healthPlatform === "ios") {
        console.log("[Header] onPressRefresh: iOS");
        await refreshHealthKitData();
      } else if (Platform.OS === "android" && healthPlatform === "android") {
        console.log("[Header] onPressRefresh: Android");
        // Permissions + timezone are already tracked in the store;
        // hcRefresh will no-op if there are no granted keys.
        await hcRefresh();
      }
    } catch (e) {
      console.log("[Header] refresh failed", (e as any)?.message ?? e);
    }
  }, [healthPlatform, refreshHealthKitData, hcRefresh]);

  // Permissions button: single entrypoint per platform
  // const onPressPermissions = useCallback(async () => {
  //   try {
  //     if (Platform.OS === "ios" && healthPlatform === "ios") {
  //       // Delegate all HealthKit logic to the store.
  //       await handleHealthPermissionPress();

  //       // After the store updates:
  //       // - If HK says "unnecessary" (no more sheets for this config)
  //       // - AND we still have no data,
  //       // then guide the user with the Settings coach.
  //       const { hkStatus: latestStatus, hkHasAnyData: latestHasData } =
  //         useTrackingStore.getState();

  //       if (latestStatus === "unnecessary" ) {
  //         setShowCoach(true);
  //       }

  //       return;
  //     }

  //     if (Platform.OS === "android" && healthPlatform === "android") {
  //       const hasPerms =
  //         (useTrackingStore.getState().hcGrantedKeys?.length ?? 0) > 0;
  //       if (!hasPerms) {
  //         await hcGrantAll();
  //       } else {
  //         hcOpenSettings?.();
  //       }
  //       return;
  //     }
  //   } catch (e) {
  //     console.log(
  //       "[Header] permissions press failed",
  //       (e as any)?.message ?? e
  //     );
  //   }
  // }, [healthPlatform, handleHealthPermissionPress, hcGrantAll, hcOpenSettings]);

  const onPressPermissions = useCallback(async () => {
    try {
      if (Platform.OS === "ios" && healthPlatform === "ios") {
        // Snapshot BEFORE we do anything, to detect the "no more sheets" state.
        const { hkStatus: statusBefore } = useTrackingStore.getState();

        // If iOS already says "unnecessary" (no more sheets possible),
        // go straight to Settings via the coach.
        if (statusBefore === "unnecessary") {
          setShowCoach(true);
          return;
        }

        // Otherwise, delegate to the store to show the Apple sheet.
        await handleHealthPermissionPress();

        // After the attempt, re-check the snapshot.
        const { hkStatus: latestStatus } = useTrackingStore.getState();

        // If we ended up in "unnecessary" after this tap, always guide to Settings.
        if (latestStatus === "unnecessary") {
          setShowCoach(true);
        }

        return;
      }

      if (Platform.OS === "android" && healthPlatform === "android") {
        const hasPerms =
          (useTrackingStore.getState().hcGrantedKeys?.length ?? 0) > 0;
        if (!hasPerms) {
          await hcGrantAll();
        } else {
          hcOpenSettings?.();
        }
        return;
      }
    } catch (e) {
      console.log(
        "[Header] permissions press failed",
        (e as any)?.message ?? e
      );
    }
  }, [healthPlatform, handleHealthPermissionPress, hcGrantAll, hcOpenSettings]);

  const date = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      {/* iOS helper overlay when we know we must guide user into Settings */}
      <SettingsCoach
        visible={Platform.OS === "ios" && showCoach}
        onRequestClose={() => setShowCoach(false)}
        onOpen={async () => {
          try {
            const ok = await openAppSettings();
            if (!ok) {
              setShowCoach(false);
            }
          } catch {
            setShowCoach(false);
          }
        }}
        autoOpen={false}
        appDisplayName="Web3Health"
      />

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ color: c.text.secondary, fontSize: 12 }}>{date}</Text>
          <Text
            style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}
          >
            {welcomeLine}
          </Text>

          {/* Status line */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <Dot color={status.tint} />
            <Text style={{ color: c.text.muted, fontSize: 11 }}>
              {status.label}
            </Text>
          </View>

          {/* Optional subtle error text for iOS */}
          {Platform.OS === "ios" && hkError && (
            <Text
              style={{
                marginTop: 2,
                color: c.warning,
                fontSize: 10,
              }}
            >
              {hkError}
            </Text>
          )}
        </View>

        {/* Actions + avatar */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* Refresh */}
          <Pressable
            onPress={onPressRefresh}
            hitSlop={8}
            style={{ padding: 4 }}
            accessibilityLabel="Refresh health data"
          >
            <Ionicons
              name="refresh-outline"
              size={20}
              color={c.text.secondary}
            />
          </Pressable>

          {/* Permissions / connect */}
          <Pressable
            onPress={onPressPermissions}
            hitSlop={8}
            style={{ padding: 4 }}
            accessibilityLabel="Open health permissions"
          >
            <Ionicons
              name={Platform.OS === "ios" ? "pulse-outline" : "key-outline"}
              size={20}
              color={c.text.secondary}
            />
          </Pressable>

          <Avatar onPress={() => router.push("/profile")} />
        </View>
      </View>
    </>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
      }}
    />
  );
}
