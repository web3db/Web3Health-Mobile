// app/data-assets/index.tsx
import DataWindowSelector from "@/src/components/composite/assets/DataWindowSelector";
import MetricCard from "@/src/components/composite/assets/MetricCard";
import SettingsCoach from "@/src/components/overlay/SettingsCoach";
import BackButton from "@/src/components/ui/BackButton";
import { openAppSettings } from "@/src/services/navigation/linking";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DataAssetsIndex() {
  const c = useThemeColors();
  const router = useRouter();

  const {
    // datasets + window (shared across platforms)
    hcDatasets,
    hcWindow,
    hcSetWindow,

    // ANDROID (Health Connect)
    hcInitialize,
    hcRefresh,
    hcGrantAll,
    hcOpenSettings,
    hcGrantedKeys,
    hcLoading,
    hcError,
    hcInitialized,
    hcAvailable,

    // iOS (HealthKit)
    probeHealthPlatform,
    refreshHealthKitData,
    handleHealthPermissionPress,
    hkDatasets,
    hkLoading,
    hkError,
    initHealthKitIfNeeded,
    handleHealthSettingsReturn,
    hkStatus,
    hkAvailable,
    hkActiveMetrics,

    // cross-platform flags
    healthAvailable,
    healthGranted,
  } = useTrackingStore();

  const [pulling, setPulling] = useState(false);
  const [showCoach, setShowCoach] = useState(false);

  /** ───────────────────────── Mount/init per platform ───────────────────────── */
  useEffect(() => {
    if (Platform.OS === "android") {
      if (hcInitialized) return;
      (async () => {
        try {
          await hcInitialize();
        } catch {
          /* error surfaced via hcError */
        }
      })();
      return;
    }

    if (Platform.OS === "ios") {
      (async () => {
        try {
          await initHealthKitIfNeeded();
        } catch {
          /* flags will reflect failure */
        }
      })();
    }
  }, [hcInitialize, hcInitialized, initHealthKitIfNeeded]);

  /** ───────────────────────── Foreground return (iOS Settings) ───────────────────────── */
  // Old way that caused issues with multiple listeners
  // useEffect(() => {
  //   const sub = AppState.addEventListener("change", async (state) => {
  //     if (state !== "active") return;
  //     if (Platform.OS !== "ios") return;
  //     try {
  //       setShowCoach(false);
  //       await handleHealthSettingsReturn();
  //     } catch {}
  //   });
  //   return () => sub.remove();
  // }, [handleHealthSettingsReturn]);

  /** ───────────────────────── Focus refresh ───────────────────────── */
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "android") {
        if (!hcInitialized) return;
        if ((hcGrantedKeys?.length ?? 0) === 0) return;
        (async () => {
          try {
            await hcRefresh();
          } catch {
            /* via hcError */
          }
        })();
        return;
      }

      if (Platform.OS === "ios") {
        if (!healthAvailable) return;
        if (!healthGranted) return;
        (async () => {
          try {
            await refreshHealthKitData();
          } catch {
            /* via hcError */
          }
        })();
      }
    }, [
      hcInitialized,
      hcGrantedKeys,
      hcRefresh,
      healthAvailable,
      healthGranted,
      refreshHealthKitData,
    ])
  );

  /** ───────────────────────── Availability / gating ───────────────────────── */
  const isAndroid = Platform.OS === "android";
  const isIOS = Platform.OS === "ios";

  const hasPerms = isAndroid
    ? (hcGrantedKeys?.length ?? 0) > 0
    : (hkActiveMetrics?.length ?? 0) > 0;

  const datasets = isAndroid ? hcDatasets : hkDatasets;
  const loading = isAndroid ? !!hcLoading : !!hkLoading;
  const errorText = isAndroid ? hcError : hkError;
  // const refreshing = pulling || (isAndroid ? !!hcLoading : !!hkLoading);
  const refreshing = pulling;
  const available = isAndroid ? hcAvailable : hkAvailable;
  const initialized = isAndroid ? hcInitialized : true; // iOS doesn't use a separate "initialized" gate

  // Any dataset with any data in current window?
  const hasData = useMemo(
    () =>
      Array.isArray(datasets) &&
      datasets.some((d) => {
        const anyBucket =
          d.buckets?.some((b) => Number(b.value || 0) > 0) ?? false;
        const isHR = d.id === "heartRate";
        const hasLatest = isHR
          ? d.latest != null && Number(d.latest) > 0
          : false;
        const sumTotal = Number(d.total || 0);
        return anyBucket || hasLatest || sumTotal > 0;
      }),
    [datasets]
  );

  const onPullRefresh = useCallback(async () => {
    setPulling(true);
    try {
      if (Platform.OS === "android") {
        if (!hcInitialized) await hcInitialize();
        if (hasPerms) await hcRefresh();
      } else if (Platform.OS === "ios") {
        await refreshHealthKitData();
      }
    } finally {
      setPulling(false);
    }
  }, [hcInitialize, hcRefresh, hcInitialized, hasPerms, refreshHealthKitData]);
  //old that made code slow
  // const onIOSRequestAccess = useCallback(async () => {
  //   try {
  //     await handleHealthPermissionPress();
  //     const { hkStatus: latestStatus } = useTrackingStore.getState();
  //     if (latestStatus === "unnecessary") {
  //       setShowCoach(true);
  //     } else {
  //       try {
  //         await refreshHealthKitData();
  //       } catch {}
  //     }
  //   } catch {}
  // }, [handleHealthPermissionPress, refreshHealthKitData]);

  const onIOSRequestAccess = useCallback(async () => {
    try {
      await handleHealthPermissionPress();
      const { hkStatus: latestStatus } = useTrackingStore.getState();

      if (latestStatus === "unnecessary") {
        // System says there is nothing more to request, but we still don't have usable data.
        // Route the user to Settings via the coach.
        setShowCoach(true);
      }
      // Otherwise, trust the store's HealthKit pipeline to have refreshed datasets.
    } catch {
      // Errors are surfaced via hkError / header status; no-op here.
    }
  }, [handleHealthPermissionPress]);

  const onOpenSettingsIOS = useCallback(async () => {
    try {
      const ok = await openAppSettings();
      if (!ok) setShowCoach(false);
    } catch {
      setShowCoach(false);
    }
  }, []);

  const onWindowChange = useCallback(
    async (w: "24h" | "7d" | "30d" | "90d") => {
      if (w === hcWindow) return; // no-op if same
      await hcSetWindow(w); // store routes to hkRefresh on iOS automatically
    },
    [hcSetWindow, hcWindow]
  );

  // Loading / availability (Android init screen)
  if (isAndroid && !initialized) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <BackButton />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Header title="Data Assets" subtitle="Preparing Health Connect…" />
          <Text style={{ color: c.text.secondary, marginTop: 8 }}>
            Initializing…
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Not available
  if (available === false) {
    const subtitle = isAndroid
      ? "Health Connect not available"
      : "Apple Health not available";
    return (
      <>
        <SettingsCoach
          visible={Platform.OS === "ios" && showCoach}
          onRequestClose={() => setShowCoach(false)}
          onOpen={onOpenSettingsIOS}
          autoOpen={false}
          appDisplayName="Web3Health"
        />
        <SafeAreaView
          edges={["top", "bottom"]}
          style={{ flex: 1, backgroundColor: c.bg }}
        >
          <BackButton />
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
              />
            }
          >
            <Header title="Data Assets" subtitle={subtitle} />
            <EmptyState
              mode="unavailable"
              errorText={errorText}
              onGrantAll={isAndroid ? hcGrantAll : onIOSRequestAccess}
              onOpenSettings={isAndroid ? hcOpenSettings : onOpenSettingsIOS}
              onRefresh={isAndroid ? hcRefresh : refreshHealthKitData}
            />
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  // Missing perms CTA (both platforms share hcGrantedKeys list)
  if (!hasPerms) {
    return (
      <>
        <SettingsCoach
          visible={Platform.OS === "ios" && showCoach}
          onRequestClose={() => setShowCoach(false)}
          onOpen={onOpenSettingsIOS}
          autoOpen={false}
          appDisplayName="Web3Health"
        />
        <SafeAreaView
          edges={["top", "bottom"]}
          style={{ flex: 1, backgroundColor: c.bg }}
        >
          <BackButton />
          <ScrollView
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
              />
            }
          >
            <Header
              title="Data Assets"
              subtitle={
                isAndroid
                  ? "Choose what to share from Health Connect"
                  : "Allow Web3Health to read Apple Health data"
              }
            />
            <EmptyState
              mode="no-permissions"
              errorText={errorText}
              onGrantAll={isAndroid ? hcGrantAll : onIOSRequestAccess}
              onOpenSettings={isAndroid ? hcOpenSettings : onOpenSettingsIOS}
              onRefresh={isAndroid ? hcRefresh : refreshHealthKitData}
            />
          </ScrollView>
        </SafeAreaView>
      </>
    );
  }

  /** ───────────────────────── Normal view ───────────────────────── */
  return (
    <>
      <SettingsCoach
        visible={Platform.OS === "ios" && showCoach}
        onRequestClose={() => setShowCoach(false)}
        onOpen={onOpenSettingsIOS}
        autoOpen={false}
        appDisplayName="Web3Health"
      />
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <BackButton />
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
          }
        >
          <Header
            title="Data Assets"
            subtitle="Your health signals packaged as sellable datasets."
          />

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <DataWindowSelector value={hcWindow} onChange={onWindowChange} />
          </View>

          {hasData ? (
            <View
              style={{
                paddingHorizontal: 12,
                marginTop: 12,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              {datasets.map((d) => {
                const isHeartRate = d.id === "heartRate";
                const isDistance = d.id === "distance";
                const isSleep = d.id === "sleep";

                // Coverage (prefer metric-specific meta when provided)
                const defaultCoverageTotal =
                  hcWindow === "24h"
                    ? 24
                    : hcWindow === "7d"
                      ? 7
                      : hcWindow === "30d"
                        ? 30
                        : 90;

                const defaultCoverageCount = computeCoverage(
                  d.buckets,
                  hcWindow
                );

                let coverageTotal = defaultCoverageTotal;
                let coverageCount = defaultCoverageCount;

                if (isHeartRate && hcWindow === "24h") {
                  if (typeof d.meta?.hoursTotal === "number") {
                    coverageTotal = d.meta.hoursTotal;
                  }
                  if (typeof d.meta?.hoursWithData === "number") {
                    coverageCount = d.meta.hoursWithData;
                  }
                } else if (d.meta?.coverageCount != null) {
                  coverageCount = d.meta.coverageCount;
                }

                const rawTotal = Number(d.total || 0) || 0;
                let unitLabel = d.unit;
                let headlineNumber = 0;

                // Heart rate:
                // - Prefer dataset.latest (window-level BPM).
                // - If latest is 0/null but buckets have values, fall back to average of bucket values.
                if (isHeartRate) {
                  const latestValue =
                    d.latest != null ? Number(d.latest) || 0 : 0;
                  let hrValue = latestValue > 0 ? latestValue : 0;

                  if (
                    hrValue <= 0 &&
                    Array.isArray(d.buckets) &&
                    d.buckets.length > 0
                  ) {
                    const values = d.buckets
                      .map((b) => Number(b.value || 0))
                      .filter((v) => v > 0);
                    if (values.length > 0) {
                      const sum = values.reduce((sum, v) => sum + v, 0);
                      const avg = sum / values.length;
                      if (avg > 0) {
                        hrValue = avg;
                      }
                    }
                  }

                  headlineNumber = hrValue > 0 ? Math.round(hrValue) : 0;
                } else if (isDistance) {
                  // Distance → total meters, shown as whole meters.
                  headlineNumber = Math.round(rawTotal);
                } else {
                  // Steps, floors, activeCalories, sleep etc. as whole numbers.
                  headlineNumber = Math.round(rawTotal);
                }

                const hasAnyDataInWindow = isHeartRate
                  ? headlineNumber > 0 ||
                    d.buckets.some((b) => Number(b.value || 0) > 0)
                  : d.buckets.some((b) => Number(b.value || 0) > 0) ||
                    Number(d.total || 0) > 0;

                const primarySafe = hasAnyDataInWindow ? headlineNumber : 0;
                const primaryValueText = `${primarySafe} ${unitLabel}`;

                // Sublabel
                let sublabel: string;

                if (isHeartRate) {
                  if (primarySafe > 0) {
                    sublabel =
                      hcWindow === "24h"
                        ? "last 24 hours"
                        : `avg over last ${hcWindow}`;
                  } else {
                    sublabel = "no samples in window";
                  }
                } else if (hcWindow === "24h") {
                  sublabel = isSleep
                    ? "last 24 hours"
                    : "today (sum of buckets)";
                } else {
                  sublabel = `last ${hcWindow} (sum)`;
                }

                const freshnessText = formatFreshness(d.freshnessISO);

                return (
                  <MetricCard
                    key={d.id}
                    id={d.id}
                    title={d.label}
                    primaryValueText={primaryValueText}
                    sublabel={sublabel}
                    coverageCount={coverageCount}
                    coverageTotal={coverageTotal}
                    trend={d.trend ?? { dir: "flat", pct: null }}
                    freshnessText={freshnessText}
                    badges={[hcWindow, hcWindow === "24h" ? "Hourly" : "Daily"]}
                    permissionState="granted"
                    style={{ width: "47.5%" }}
                    onPress={() =>
                      router.push(`/data-assets/${encodeURIComponent(d.id)}`)
                    }
                  />
                );
              })}
            </View>
          ) : loading ? (
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <Text style={{ color: c.text.secondary }}>Loading…</Text>
            </View>
          ) : (
            <EmptyState
              mode="no-data"
              errorText={errorText}
              onGrantAll={isAndroid ? hcGrantAll : onIOSRequestAccess}
              onOpenSettings={isAndroid ? hcOpenSettings : onOpenSettingsIOS}
              onRefresh={isAndroid ? hcRefresh : refreshHealthKitData}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function computeCoverage(
  buckets: { value: number | null }[],
  window: "24h" | "7d" | "30d" | "90d"
) {
  const count = buckets.filter((b) => Number(b.value || 0) > 0).length;
  return Math.min(
    count,
    window === "24h" ? 24 : window === "7d" ? 7 : window === "30d" ? 30 : 90
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const c = useThemeColors();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}>
      <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: "900" }}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: c.text.secondary, marginTop: 4 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function EmptyState({
  mode,
  errorText,
  onGrantAll,
  onOpenSettings,
  onRefresh,
}: {
  mode: "no-permissions" | "no-data" | "unavailable";
  errorText?: string;
  onGrantAll: () => Promise<void>;
  onOpenSettings: () => void;
  onRefresh: () => Promise<void>;
}) {
  const c = useThemeColors();
  const isAndroid = Platform.OS === "android";

  const title =
    mode === "no-permissions"
      ? isAndroid
        ? "Grant access to Health Connect"
        : "Grant access to Apple Health"
      : mode === "unavailable"
        ? isAndroid
          ? "Health Connect not available"
          : "Apple Health not available"
        : "No data yet";

  const subtitle =
    mode === "no-permissions"
      ? isAndroid
        ? "Choose which metrics you allow us to read. You can revoke anytime in Health Connect settings."
        : "Choose which metrics you allow us to read. You can revoke anytime in iOS Settings › Privacy & Security > Health > Apps."
      : mode === "unavailable"
        ? isAndroid
          ? "Install/enable Health Connect and connect a source like Google Fit, then try again."
          : "Install/enable Apple Health and ensure sources (e.g., Apple Watch) are writing data, then try again."
        : isAndroid
          ? "Connect a source (Google Fit, Samsung Health, Strava …) that writes to Health Connect, then refresh."
          : "Ensure Apple Health has recent data from your devices, then refresh.";

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        padding: 16,
      }}
    >
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "800" }}>
        {title}
      </Text>
      <Text style={{ color: c.text.secondary, marginTop: 6 }}>{subtitle}</Text>

      <View
        style={{
          flexDirection: "row",
          gap: 10,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        {mode !== "unavailable" ? (
          <PrimaryButton label="Grant all" onPress={onGrantAll} />
        ) : null}
        <GhostButton
          label={isAndroid ? "Open HC" : "Open Health"}
          onPress={onOpenSettings}
        />
        <GhostButton label="Refresh" onPress={onRefresh} />
      </View>

      {errorText ? (
        <Text style={{ color: "tomato", marginTop: 8 }}>
          Error: {errorText}
        </Text>
      ) : null}
    </View>
  );
}

// Allow async onPress nicely (no type grumble)
type PressHandler = () => void | Promise<void>;

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: PressHandler;
}) {
  const c = useThemeColors();
  return (
    <Text
      onPress={() => void onPress()}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: c.primary,
        color: c.text.inverse,
        fontWeight: "800",
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}

function GhostButton({
  label,
  onPress,
}: {
  label: string;
  onPress: PressHandler;
}) {
  const c = useThemeColors();
  return (
    <Text
      onPress={() => void onPress()}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        color: c.text.primary,
        fontWeight: "800",
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}

// Simple freshness formatter
function formatFreshness(iso?: string) {
  if (!iso) return "—";
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const deltaSec = Math.max(0, Math.floor((now - t) / 1000));
    if (deltaSec < 60) return "Just now";
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
