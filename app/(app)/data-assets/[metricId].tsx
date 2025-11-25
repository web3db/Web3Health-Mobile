// app/data-assets/[metricId].tsx
import DataWindowSelector from "@/src/components/composite/assets/DataWindowSelector";
import MetricChart from "@/src/components/composite/assets/MetricChart";
import SettingsCoach from "@/src/components/overlay/SettingsCoach";
import { openAppSettings } from "@/src/services/navigation/linking";
import { useTrackingStore, type MetricKey } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MetricDetails() {
  const { metricId } = useLocalSearchParams<{ metricId?: string | string[] }>();
  const key = decodeURIComponent(
    Array.isArray(metricId) ? (metricId?.[0] ?? "") : (metricId ?? "")
  );

  const c = useThemeColors();
  const {
    // Android (HC)
    hcDatasets,
    hcWindow,
    hcLoading,
    hcSetWindow,
    hcError,
    hcInitialized,
    hcAvailable,
    hcGrantedKeys,
    hcTimezoneLabel,
    hcRefresh,
    hcOpenSettings,

    // iOS (HK)
    hkDatasets,
    hkActiveMetrics,
    hkAvailable,
    hkError,
    hkLoading,
    hkStatus,
    initHealthKitIfNeeded,
    refreshHealthKitData,
    handleHealthPermissionPress,
    handleHealthSettingsReturn,
  } = useTrackingStore();

  const isAndroid = Platform.OS === "android";
  const isIOS = Platform.OS === "ios";

  const [showCoach, setShowCoach] = useState(false);

  // iOS: silent init on mount (no prompts), then hydrate data
  useEffect(() => {
    if (!isIOS) return;
    (async () => {
      try {
        await initHealthKitIfNeeded();
        await refreshHealthKitData();
      } catch {}
    })();
  }, [isIOS, initHealthKitIfNeeded, refreshHealthKitData]);


  const onWindowChange = useCallback(
    async (w: "24h" | "7d" | "30d" | "90d") => {
      if (w === hcWindow) return;

      // hcSetWindow handles the platform-specific refresh:
      // - Android: calls hcRefresh()
      // - iOS: calls refreshHealthKitData()
      await hcSetWindow(w);
    },
    [hcSetWindow, hcWindow]
  );

  /** ───────────────────────── Availability & gating ───────────────────────── */
  const available = isAndroid ? hcAvailable : hkAvailable;
  const initialized = isAndroid ? hcInitialized : true; // iOS no separate init screen
  const hasPerms = isAndroid
    ? (hcGrantedKeys?.length ?? 0) > 0
    : (hkActiveMetrics?.length ?? 0) > 0;

  const datasets = isAndroid ? hcDatasets : hkDatasets;
  const loading = isAndroid ? !!hcLoading : !!hkLoading;
  const errorText = isAndroid ? hcError : hkError;

  // Android-only init screen
  if (isAndroid && !initialized) {
    return (
      <SafeAreaView
        // edges={["top", "bottom"]}
        edges={["bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <Text style={{ color: c.text.primary, padding: 16 }}>
          Initializing Health Connect…
        </Text>
        {hcError ? (
          <Text style={{ color: "tomato", paddingHorizontal: 16 }}>
            Error: {hcError}
          </Text>
        ) : null}
      </SafeAreaView>
    );
  }

  // Not available
  if (available === false) {
    return (
      <>
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
        <SafeAreaView
          // edges={["top", "bottom"]}
          edges={["bottom"]}
          style={{ flex: 1, backgroundColor: c.bg }}
        >
          <View style={{ padding: 16 }}>
            <Text
              style={{ color: c.text.primary, fontSize: 18, fontWeight: "800" }}
            >
              {isAndroid
                ? "Health Connect not available"
                : "Apple Health not available"}
            </Text>
            <Text style={{ color: c.text.secondary, marginTop: 8 }}>
              {isAndroid
                ? "Install/enable Health Connect and connect a source (Google Fit, Samsung Health…), then try again."
                : "Ensure Apple Health is installed and has sources (e.g., Apple Watch) writing data."}
            </Text>
            <Pressable
              onPress={isAndroid ? hcRefresh : refreshHealthKitData}
              style={{
                alignSelf: "flex-start",
                marginTop: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
              }}
            >
              <Text style={{ color: c.text.primary, fontWeight: "800" }}>
                Refresh
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Missing permissions
  if (!hasPerms) {
    return (
      <>
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
        <SafeAreaView
          // edges={["top", "bottom"]}
          edges={["bottom"]}
          style={{ flex: 1, backgroundColor: c.bg }}
        >
          <View style={{ padding: 16 }}>
            <Text
              style={{ color: c.text.primary, fontSize: 18, fontWeight: "800" }}
            >
              {isAndroid
                ? "Grant access to Health Connect"
                : "Grant access to Apple Health"}
            </Text>
            <Text style={{ color: c.text.secondary, marginTop: 8 }}>
              To show your data here, allow Web3Health to read this metric in{" "}
              {isAndroid ? "Health Connect" : "Apple Health"}. You can change
              this anytime in{" "}
              {isAndroid ? "Health Connect" : "iOS Settings › Health"}.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <ChipButton
                label="Grant all"
                onPress={
                  isAndroid
                    ? hcRefresh // lightweight no-op; see below, we'll prefer opening HC directly
                    : async () => {
                        try {
                          await handleHealthPermissionPress();
                          const { hkStatus: latestStatus } =
                            useTrackingStore.getState();

                          if (latestStatus === "unnecessary") {
                            // System says there is nothing more to request, but we still don't have usable data.
                            // Route the user to Settings via the coach.
                            setShowCoach(true);
                          }
                          // Otherwise, rely on the store's HealthKit pipeline to have refreshed datasets.
                        } catch {}
                      }
                }
              />
              <ChipButton
                label={isAndroid ? "Open HC" : "Open Health"}
                onPress={
                  isAndroid ? hcOpenSettings : async () => setShowCoach(true)
                }
              />
              <ChipButton
                label="Refresh"
                onPress={isAndroid ? hcRefresh : refreshHealthKitData}
              />
            </View>
            {errorText ? (
              <Text style={{ color: "tomato", marginTop: 8 }}>
                Error: {errorText}
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </>
    );
  }

  /** ───────────────────────── Find dataset ───────────────────────── */
  const d = useMemo(
    () => (datasets ?? []).find((x) => x.id === (key as MetricKey)),
    [datasets, key]
  );

  // Still loading or no datasets yet
  if (!datasets || datasets.length === 0) {
    return (
      <SafeAreaView
        // edges={["top", "bottom"]}
        edges={["bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <Text style={{ color: c.text.primary, padding: 16 }}>
          Loading dataset…
        </Text>
        {errorText ? (
          <Text style={{ color: "tomato", paddingHorizontal: 16 }}>
            Error: {errorText}
          </Text>
        ) : null}
      </SafeAreaView>
    );
  }

  // Not found
  if (!d) {
    return (
      <SafeAreaView
        // edges={["top", "bottom"]}
        edges={["bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <Text style={{ color: c.text.primary, padding: 16 }}>
          Dataset not found for “{key}”.
        </Text>
      </SafeAreaView>
    );
  }

  /** ───────────────────────── Render dataset ───────────────────────── */
  const isDistanceMetric = d.id === "distance";

  const numericBuckets = useMemo(
    () =>
      d.buckets.map((b) => {
        const raw = Number(b.value ?? 0) || 0;
        return { ...b, value: raw };
      }),
    [d.buckets]
  );

  const isHourly = hcWindow === "24h";

  const tzLabel = useMemo(() => {
    if (hcTimezoneLabel) return hcTimezoneLabel;
    try {
      const offsetMinutes = -new Date().getTimezoneOffset(); // minutes east of UTC
      const sign = offsetMinutes >= 0 ? "+" : "-";
      const abs = Math.abs(offsetMinutes);
      const hh = String(Math.floor(abs / 60)).padStart(2, "0");
      const mm = String(abs % 60).padStart(2, "0");
      return `Local time (UTC${sign}${hh}:${mm})`;
    } catch {
      return "Local time";
    }
  }, [hcTimezoneLabel]);

  const breakdownRows = useMemo(() => {
    const rows = [...numericBuckets].sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );
    return rows;
  }, [numericBuckets]);

  const PAGE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const hasMore = breakdownRows.length > visibleCount;
  const showMore = () =>
    setVisibleCount((c) => Math.min(c + PAGE, breakdownRows.length));

  const coverageTotal = useMemo(() => {
    const baseTotal =
      hcWindow === "24h"
        ? 24
        : hcWindow === "7d"
          ? 7
          : hcWindow === "30d"
            ? 30
            : 90;

    if (d.id === "heartRate" && hcWindow === "24h") {
      if (typeof d.meta?.hoursTotal === "number") {
        return d.meta.hoursTotal;
      }
    }

    return baseTotal;
  }, [d.id, d.meta?.hoursTotal, hcWindow]);

  const coverageCount = useMemo(() => {
    const isHeartRateMetric = d.id === "heartRate";

    let count =
      d.meta?.coverageCount != null
        ? d.meta.coverageCount
        : numericBuckets.filter((b) => (Number(b.value) || 0) > 0).length;

    if (isHeartRateMetric && hcWindow === "24h") {
      if (typeof d.meta?.hoursWithData === "number") {
        count = d.meta.hoursWithData;
      }
    }

    return Math.min(count, coverageTotal);
  }, [
    d.id,
    d.meta?.coverageCount,
    d.meta?.hoursWithData,
    numericBuckets,
    hcWindow,
    coverageTotal,
  ]);

  const isHeartRate = d.id === "heartRate";
  const isSleep = d.id === "sleep";
  const unitLabel = d.unit;

  let headlineNumber = 0;

  if (isHeartRate) {
    const latestValue = d.latest != null ? Number(d.latest) || 0 : 0;

    let hrValue = latestValue > 0 ? latestValue : 0;

    headlineNumber = hrValue > 0 ? Math.round(hrValue) : 0;
  } else if (isDistanceMetric) {
    // Distance → total meters as whole number
    headlineNumber = Math.round(Number(d.total || 0) || 0);
  } else {
    // Steps, floors, activeCalories, sleep etc.
    headlineNumber = Math.round(Number(d.total || 0) || 0);
  }

  const hasAnyDataInWindow = isHeartRate
    ? headlineNumber > 0 || numericBuckets.some((b) => Number(b.value) > 0)
    : numericBuckets.some((b) => Number(b.value) > 0) ||
      (isSleep && Number(d.total || 0) > 0);

  const headlineSafe = hasAnyDataInWindow ? headlineNumber : 0;
  const primaryValueText = headlineSafe.toString();
  const primaryText = `${primaryValueText} ${unitLabel}`;

  const trendLabel =
    d.trend && typeof d.trend.pct === "number"
      ? `${d.trend.pct > 0 ? "+" : ""}${Math.round(d.trend.pct)}%`
      : "-";

  const freshnessLabel = formatFreshness(d.freshnessISO);

  const primaryLabel = isHeartRate
    ? "Heart rate"
    : isSleep
      ? "Total sleep"
      : `Total ${d.label.toLowerCase()}`;

  return (
    <>
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
      <SafeAreaView
        // edges={["top", "bottom"]}
        edges={["bottom"]}
        style={{ flex: 1, backgroundColor: c.bg }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Header */}
          <View
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}
          >
            <Text
              style={{ color: c.text.primary, fontSize: 22, fontWeight: "900" }}
            >
              {d.label}
            </Text>
            <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 12,
                  fontWeight: "700",
                  marginBottom: 4,
                }}
              >
                Time range
              </Text>
              <DataWindowSelector value={hcWindow} onChange={onWindowChange} />
              <Text
                style={{
                  color: c.text.secondary,
                  opacity: 0.7,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                All stats and charts below use this time range.
              </Text>
            </View>
            <Text
              accessibilityLabel="Current time zone"
              style={{
                color: c.text.secondary,
                opacity: 0.7,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              Time zone: {tzLabel}
            </Text>
          </View>

          {/* Optional error banner */}
          {errorText ? (
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <Text style={{ color: "tomato" }}>Error: {errorText}</Text>
            </View>
          ) : null}

          {/* Hero tiles */}
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: 10,
                rowGap: 10,
              }}
            >
              <View style={{ flexBasis: "48%", flexGrow: 1 }}>
                <Stat label={primaryLabel} value={primaryText} highlight />
              </View>
              <View style={{ flexBasis: "48%", flexGrow: 1 }}>
                <Stat
                  label={
                    hcWindow === "24h" ? "Hours recorded" : "Days recorded"
                  }
                  value={`${coverageCount} / ${coverageTotal}`}
                  highlight
                />
              </View>
              <View style={{ flexBasis: "48%", flexGrow: 1 }}>
                <Stat label="Trend (vs prev.)" value={trendLabel} highlight />
              </View>
              <View style={{ flexBasis: "48%", flexGrow: 1 }}>
                <Stat label="Last updated" value={freshnessLabel} highlight/>
              </View>
            </View>

            {/* Time zone as a subtle label below the grid */}
            {/* <View style={{ marginTop: 8 }}>
              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                Time zone: {tzLabel}
              </Text>
            </View> */}
          </View>

          {/* Chart */}
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <MetricChart
              buckets={numericBuckets}
              granularity={hcWindow === "24h" ? "hourly" : "daily"}
              unit={unitLabel}
              emptyLabel={loading ? "Loading…" : "No data in this window"}
            />
          </View>

          {/* Breakdown */}
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Text
              style={{
                color: c.text.secondary,
                opacity: 0.7,
                fontSize: 12,
                marginBottom: 2,
              }}
            >
              Detailed history
            </Text>
            <Text
              style={{
                color: c.text.secondary,
                opacity: 0.7,
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              Each row shows the value for one hour/day in your selected time
              range. Times shown in {tzLabel}.
            </Text>
            {breakdownRows.slice(0, visibleCount).map((b, i) => {
              const v = Number(b.value || 0) || 0;
              const valueText = Math.round(v).toString();
              const stamp = formatBucketStamp(b.start, isHourly);

              return (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  }}
                >
                  <Text style={{ color: c.text.secondary }}>{stamp}</Text>
                  <Text
                    style={{
                      color: c.text.primary,
                      fontWeight: "700",
                    }}
                  >
                    {valueText} {unitLabel}
                  </Text>
                </View>
              );
            })}

            {hasMore && (
              <Pressable
                onPress={showMore}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.surface,
                }}
              >
                <Text style={{ color: c.text.primary, fontWeight: "800" }}>
                  Load {Math.min(PAGE, breakdownRows.length - visibleCount)}{" "}
                  more
                </Text>
              </Pressable>
            )}

            {!hasMore && breakdownRows.length > 0 && (
              <Text
                style={{
                  color: c.text.muted ?? c.text.secondary,
                  marginTop: 8,
                }}
              >
                End of list · {breakdownRows.length}{" "}
                {isHourly ? "hours" : "days"}
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const c = useThemeColors();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color: c.text.secondary,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: c.text.primary,
          fontWeight: "800",
          fontSize: highlight ? 21 : 18,
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </View>
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

function formatBucketStamp(iso: string, isHourly: boolean) {
  const d = new Date(iso);
  if (isHourly) {
    return d.toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString([], { month: "short", day: "2-digit" });
}

function ChipButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void | Promise<void>;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={() => void onPress?.()}
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
      }}
    >
      <Text style={{ color: c.text.primary, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
