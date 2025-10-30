// app/data-assets/index.tsx
import DataWindowSelector from "@/src/components/composite/assets/DataWindowSelector";
import MetricCard from "@/src/components/composite/assets/MetricCard";
import BackButton from "@/src/components/ui/BackButton";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, RefreshControl, ScrollView, Text, View } from "react-native";
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
    probeHealthPlatform, // kicks off HK auth check/prompt + observers
    hkRefresh,
    hkOpenSettings,

    // cross-platform flags managed by store
    healthAvailable,
    healthGranted,
  } = useTrackingStore();

  const [pulling, setPulling] = useState(false);

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
      // Probe once; this silently checks availability and may prompt if needed later from CTA.
      (async () => {
        try {
          await probeHealthPlatform();
        } catch {
          /* flags will reflect failure */
        }
      })();
    }
  }, [hcInitialize, hcInitialized, probeHealthPlatform]);

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
            await hkRefresh();
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
      hkRefresh,
    ])
  );

  /** ───────────────────────── Availability / gating ───────────────────────── */
  const isAndroid = Platform.OS === "android";
  const isIOS = Platform.OS === "ios";

  const hasPerms = isAndroid
    ? (hcGrantedKeys?.length ?? 0) > 0
    : !!healthGranted;
  const refreshing = pulling || (isAndroid ? !!hcLoading : false);

  const available = isAndroid ? hcAvailable : healthAvailable;
  const initialized = isAndroid ? hcInitialized : true; // iOS doesn't use a separate "initialized" gate

  // Any dataset with any data in current window?
  const hasData = useMemo(
    () =>
      Array.isArray(hcDatasets) &&
      hcDatasets.some((d) => {
        const anyBucket =
          d.buckets?.some((b) => Number(b.value || 0) > 0) ?? false;
        const isHR = d.id === "heartRate";
        const hasLatest = isHR
          ? d.latest != null && Number(d.latest) > 0
          : false;
        const sumTotal = Number(d.total || 0);
        return anyBucket || hasLatest || sumTotal > 0;
      }),
    [hcDatasets]
  );

  const onPullRefresh = useCallback(async () => {
    setPulling(true);
    try {
      if (Platform.OS === "android") {
        if (!hcInitialized) await hcInitialize();
        if (hasPerms) await hcRefresh();
      } else if (Platform.OS === "ios") {
        // If we haven't granted yet, re-probe (may remain silent), else just refresh
        if (!healthGranted) {
          await probeHealthPlatform();
        } else {
          await hkRefresh();
        }
      }
    } finally {
      setPulling(false);
    }
  }, [
    hcInitialize,
    hcRefresh,
    hcInitialized,
    hasPerms,
    hkRefresh,
    probeHealthPlatform,
    healthGranted,
  ]);

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
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <BackButton />
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
          }
        >
          <Header title="Data Assets" subtitle={subtitle} />
          <EmptyState
            mode="unavailable"
            errorText={hcError}
            onGrantAll={isAndroid ? hcGrantAll : probeHealthPlatform}
            onOpenSettings={isAndroid ? hcOpenSettings : hkOpenSettings}
            onRefresh={isAndroid ? hcRefresh : hkRefresh}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Missing perms CTA (both platforms share hcGrantedKeys list)
  if (!hasPerms) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <BackButton />
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
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
            errorText={hcError}
            onGrantAll={isAndroid ? hcGrantAll : probeHealthPlatform}
            onOpenSettings={isAndroid ? hcOpenSettings : hkOpenSettings}
            onRefresh={isAndroid ? hcRefresh : hkRefresh}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  /** ───────────────────────── Normal view ───────────────────────── */
  return (
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
            {hcDatasets.map((d) => {
              // Coverage (prefer meta from store)
              const coverageTotal =
                hcWindow === "24h"
                  ? 24
                  : hcWindow === "7d"
                    ? 7
                    : hcWindow === "30d"
                      ? 30
                      : 90;
              const coverageCount =
                d.meta?.coverageCount != null
                  ? d.meta.coverageCount
                  : computeCoverage(d.buckets, hcWindow);

              // Headline rules:
              const isHeartRate = d.id === "heartRate";
              const headlineNumber = isHeartRate
                ? d.latest != null
                  ? Number(d.latest)
                  : 0
                : Math.round(Number(d.total || 0));

              const hasAnyDataInWindow = isHeartRate
                ? (d.latest != null && Number(d.latest) > 0) ||
                  d.buckets.some((b) => Number(b.value || 0) > 0)
                : d.buckets.some((b) => Number(b.value || 0) > 0);

              const primarySafe = hasAnyDataInWindow ? headlineNumber : 0;
              const primaryValueText = `${primarySafe} ${d.unit}`;

              // Sublabel
              const sublabel = isHeartRate
                ? d.latest != null && Number(d.latest) > 0
                  ? "last sample"
                  : "no samples in window"
                : hcWindow === "24h"
                  ? "today (sum of buckets)"
                  : `last ${hcWindow} (sum)`;

              // Freshness
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
        ) : hcLoading ? (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Text style={{ color: c.text.secondary }}>Loading…</Text>
          </View>
        ) : (
          <EmptyState
            mode="no-data"
            errorText={hcError}
            onGrantAll={isAndroid ? hcGrantAll : probeHealthPlatform}
            onOpenSettings={isAndroid ? hcOpenSettings : hkOpenSettings}
            onRefresh={isAndroid ? hcRefresh : hkRefresh}
          />
        )}
      </ScrollView>
    </SafeAreaView>
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
        : "Choose which metrics you allow us to read. You can revoke anytime in iOS Settings › Health."
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
