//app/(app)/(tabs)/index.tsx
import SettingsCoach from "@/src/components/overlay/SettingsCoach";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// ===== Tracking =====
import Header from "@/src/components/composite/home/Header";
import TrackerCarousel from "@/src/components/composite/home/TrackerCarousel";
import { openAppSettings } from "@/src/services/navigation/linking";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useFocusEffect } from "@react-navigation/native";
// ===== Marketplace rows =====
import AllRow from "@/src/components/composite/opportunities/AllRow";
import { selectIsRegistered, useAuthStore } from "@/src/store/useAuthStore";

export default function HomeScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [showCoach, setShowCoach] = useState(false);
const isRegistered = useAuthStore(selectIsRegistered);

  const {
    // Android / Health Connect
    hcDatasets,
    hcLoading,
    hcGrantedKeys,
    hcInitialized,
    hcWindow,
    hcInitialize,
    hcRefresh,
    hcGrantAll,
    hcOpenSettings,

    // iOS / HealthKit
    hkDatasets,
    hkActiveMetrics,
    hkHasAnyData,
    hkLoading,
    initHealthKitIfNeeded,
    refreshHealthKitData,
    handleHealthPermissionPress,
  } = useTrackingStore();

  // Initialize + refresh on Android
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        if (!hcInitialized) {
          await hcInitialize();
        }
        // Probe-style: only refresh if we already have at least one permission granted.
        const hasAny = (hcGrantedKeys?.length ?? 0) > 0;
        if (hasAny) {
          await hcRefresh();
        }
      } catch (e) {
        // errors are surfaced via store.hcError / header status
        console.log(
          "[Home] Android init/refresh error",
          (e as any)?.message ?? e
        );
      }
    })();
    // include hcGrantedKeys so if user just granted, we refresh on the next render
  }, [hcInitialized, hcInitialize, hcRefresh, hcGrantedKeys]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (!isRegistered) return;
    (async () => {
      try {
        // 1) Snapshot availability / status (no UI)
        await initHealthKitIfNeeded();
        // 2) Read data for configured metrics (no prompt)
        await refreshHealthKitData();
      } catch (e) {
        console.log("[Home] iOS mount refresh error", (e as any)?.message ?? e);
      }
    })();
  }, [initHealthKitIfNeeded, refreshHealthKitData]);

  // On focus:
  // - Android: quick read-only refresh if we already have grants.
  // - iOS: reconcile after returning from Settings, then refresh data.
  // old code that made app slow
  // useFocusEffect(
  //   useCallback(() => {
  //     (async () => {
  //       try {
  //         if (Platform.OS === "android") {
  //           const hasAny =
  //             (useTrackingStore.getState().hcGrantedKeys?.length ?? 0) > 0;
  //           if (hasAny) await hcRefresh();
  //           return;
  //         }

  //         if (Platform.OS === "ios") {
  //           if (!isRegistered) return;
  //           // Re-snapshot after potential Settings changes and refresh datasets
  //           await useTrackingStore.getState().handleHealthSettingsReturn();
  //           await refreshHealthKitData();
  //           return;
  //         }
  //       } catch (e) {
  //         console.log("[Home] focus refresh error", (e as any)?.message ?? e);
  //       }
  //     })();
  //   }, [hcRefresh, refreshHealthKitData])
  // );

    // On focus:
  // - Android: quick read-only refresh if we already have grants.
  // - iOS: foreground health reconciliation is handled by the Header AppState listener.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          if (Platform.OS === "android") {
            const hasAny =
              (useTrackingStore.getState().hcGrantedKeys?.length ?? 0) > 0;
            if (hasAny) {
              await hcRefresh();
            }
          }
        } catch (e) {
          console.log("[Home] focus refresh error", (e as any)?.message ?? e);
        }
      })();
    }, [hcRefresh])
  );


  // Map HCDataset -> TrackerCard[] with "true-zero-only" policy
  const cards = useMemo(() => {
    // Helper to map a dataset -> card
    const toCard = (d: any, source: "healthkit" | "healthconnect") => {
      const isHR = d.id === "heartRate";
      const anyBucket =
        d.buckets?.some((b: any) => Number(b.value || 0) > 0) ?? false;
      const hasLatestHR = isHR
        ? d.latest != null && Number(d.latest) > 0
        : false;
      const hasAnyDataInWindow = isHR ? anyBucket || hasLatestHR : anyBucket;

      const headline = isHR
        ? d.latest != null
          ? Number(d.latest)
          : 0
        : Math.round(Number(d.total || 0));

      const valueToday = hasAnyDataInWindow ? headline : 0;
      const emptyWindow = !hasAnyDataInWindow;

      return {
        id: d.id,
        name: d.label,
        unit: d.unit as any,
        valueToday,
        trend: d.trend?.dir ?? "flat",
        trendPct: typeof d.trend?.pct === "number" ? d.trend.pct : undefined,
        freshness: d.freshnessISO,
        source,
        state: "ok" as const,
        emptyWindow,
      };
    };

    if (Platform.OS === "android") {
      const grantedSet = new Set(hcGrantedKeys ?? []);
      const source = hcDatasets ?? [];

      // Only show datasets for granted metrics (defensive; hcDatasets should already match)
      const visible = source.filter((d) =>
        grantedSet.size > 0 ? grantedSet.has(d.id as any) : true
      );

      return visible.map((d) => toCard(d, "healthconnect"));
    }

    if (Platform.OS === "ios") {
      const source = hkDatasets ?? [];
      const activeSet = new Set(hkActiveMetrics ?? []);
      const hasAnyActive = activeSet.size > 0;

      const visible = source.filter((d) => {
        // Preferred: only metrics we detected as active
        if (hasAnyActive) {
          return activeSet.has(d.id as any);
        }

        // Fallback: if no active metrics recorded yet,
        // show only datasets that actually have non-zero data.
        const isHR = d.id === "heartRate";
        const anyBucket =
          d.buckets?.some((b: any) => Number(b.value || 0) > 0) ?? false;
        const hasLatestHR = isHR
          ? d.latest != null && Number(d.latest) > 0
          : false;
        return anyBucket || hasLatestHR;
      });

      return visible.map((d) => toCard(d, "healthkit"));
    }

    // Non-health platforms
    return [];
  }, [hcDatasets, hcGrantedKeys, hkDatasets, hkActiveMetrics]);

  const hasPerms =
    Platform.OS === "ios"
      ? (hkActiveMetrics?.length ?? 0) > 0 || !!hkHasAnyData
      : (hcGrantedKeys?.length ?? 0) > 0;

  const onRefresh = Platform.OS === "ios" ? refreshHealthKitData : hcRefresh;

  // iOS "Grant all" flow (same behavior as Data Assets):
  // 1) Try to request via HealthKit sheet.
  // 2) Read the latest hkStatus. If "unnecessary", show SettingsCoach to route to Settings.
  // 3) Otherwise, refresh HK datasets.

  //old that made code slow
//   const onIOSRequestAccess = useCallback(async () => {
//   try {
//     await handleHealthPermissionPress();

//     const { hkStatus: latestStatus, hkHasAnyData: latestHasData } =
//       useTrackingStore.getState();

//     // If the system says "unnecessary" (no more sheets)
//     // BUT we still have no data, we must route user to Settings.
//     if (latestStatus === "unnecessary" && !latestHasData) {
//       setShowCoach(true);
//     } else {
//       // Otherwise (either we have data now, or status is still "shouldRequest"/"unknown"),
//       // just make sure datasets are in sync.
//       try {
//         await refreshHealthKitData();
//       } catch (e) {
//         console.log(
//           "[Home] onIOSRequestAccess refresh failed",
//           (e as any)?.message ?? e
//         );
//       }
//     }
//   } catch (e) {
//     console.log(
//       "[Home] onIOSRequestAccess failed",
//       (e as any)?.message ?? e
//     );
//   }
// }, [handleHealthPermissionPress, refreshHealthKitData]);

  const onIOSRequestAccess = useCallback(async () => {
    try {
      await handleHealthPermissionPress();

      const { hkStatus: latestStatus, hkHasAnyData: latestHasData } =
        useTrackingStore.getState();

      // If the system says "unnecessary" (no more sheets)
      // BUT we still have no data, we must route user to Settings.
      if (latestStatus === "unnecessary" && !latestHasData) {
        setShowCoach(true);
      }
      // Otherwise, the store’s HealthKit pipeline has already refreshed datasets.
    } catch (e) {
      console.log(
        "[Home] onIOSRequestAccess failed",
        (e as any)?.message ?? e
      );
    }
  }, [handleHealthPermissionPress]);

  const onGrantAll = Platform.OS === "ios" ? onIOSRequestAccess : hcGrantAll;

  const onOpenSettings =
    Platform.OS === "ios" ? () => openAppSettings() : hcOpenSettings;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "bottom"]}
    >
      <SettingsCoach
        visible={Platform.OS === "ios" && showCoach}
        onRequestClose={() => setShowCoach(false)}
        onOpen={async () => {
          try {
            await openAppSettings();
          } finally {
            setShowCoach(false);
          }
        }}
        autoOpen={false}
        appDisplayName="Web3Health"
      />

      <ScrollView
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        removeClippedSubviews={false}
      >
        {/* Header shows HC status (connected / needs perms / unavailable / etc.) */}
        <Header />

        {/* Tracking (Health Connect-backed) */}
        <View style={{ marginTop: 8 }}>
          <SectionTitle
            title="Your data assets"
            actionLabel="See all"
            onActionPress={() => router.push("/data-assets")}
          />
          <TrackerCarousel
            data={cards}
            loading={Platform.OS === "ios" ? hkLoading : hcLoading}
            hasPerms={hasPerms}
            onGrantAll={onGrantAll}
            onOpenSettings={onOpenSettings}
            onRefresh={onRefresh}
            windowKey={hcWindow}
            showViewAll={false}
          />
        </View>

        <AllRow />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({
  title,
  actionLabel,
  onActionPress,
}: {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        paddingHorizontal: 16,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: c.text.primary,
          fontSize: 18,
          fontWeight: "800",
          flex: 1,
        }}
      >
        {title}
      </Text>

      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            // subtle ghost style
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: (c as any).surface ?? "transparent",
          }}
        >
          <Text style={{ color: c.text.primary, fontWeight: "800" }}>
            {actionLabel}
          </Text>
          <Text style={{ color: c.text.muted, marginLeft: 4 }}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
