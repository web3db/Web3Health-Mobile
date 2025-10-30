// src/store/useTrackingStore.ts
import {
  fxAssets,
  fxGoals,
  fxInsights,
  fxPermissions,
  fxStreakDays,
} from "@/src/data/fixtures/tracking";
// import {
//   ensureInitialized,
//   getLocalTimezoneInfo,
//   listGrantedMetricKeys,
//   openHealthConnectSettings,
//   read24hBuckets,
//   read30dBuckets,
//   read7dBuckets,
//   read90dBuckets,
//   readHeartRateDailyBuckets,
//   readHeartRateHourly24,
//   readHeartRateLatest,
//   readSleepDailyBuckets,
//   readSleepHourlyBuckets24,
//   readTodaySleepTotalMinutes,
//   requestAllReadPermissions,
//   type Bucket as HCBucket
// } from '@/src/services/tracking/healthconnect';
//android
import {
  ensureInitialized as hcEnsureInitialized,
  getLocalTimezoneInfo as hcGetLocalTimezoneInfo,
  listGrantedMetricKeys as hcListGrantedMetricKeys,
  read24hBuckets as hcRead24hBuckets,
  read30dBuckets as hcRead30dBuckets,
  read7dBuckets as hcRead7dBuckets,
  read90dBuckets as hcRead90dBuckets,
  readHeartRateDailyBuckets as hcReadHeartRateDailyBuckets,
  readHeartRateHourly24 as hcReadHeartRateHourly24,
  readHeartRateLatest as hcReadHeartRateLatest,
  readSleepDailyBuckets as hcReadSleepDailyBuckets,
  readSleepHourlyBuckets24 as hcReadSleepHourlyBuckets24,
  readTodaySleepTotalMinutes as hcReadTodaySleepTotalMinutes,
  requestAllReadPermissions as hcRequestAllReadPermissions,
  openHealthConnectSettings,
  type Bucket as HCBucket,
} from "@/src/services/tracking/healthconnect";

//ios

import {
  ensureHealthKitAuthorized,
  hkDebugRaw,
  listGrantedMetricKeys as hkListGrantedMetricKeys,
  openHealthSettings as hkOpenHealthSettings,
  read24hBuckets as hkRead24hBuckets,
  read30dBuckets as hkRead30dBuckets,
  read7dBuckets as hkRead7dBuckets,
  read90dBuckets as hkRead90dBuckets,
  readHeartRateDailyBuckets as hkReadHeartRateDailyBuckets,
  readHeartRateHourly24 as hkReadHeartRateHourly24,
  readSleepDailyBuckets as hkReadSleepDailyBuckets,
  readSleepHourlyBuckets24 as hkReadSleepHourlyBuckets24,
  readTodaySleepTotalMinutes as hkReadTodaySleepTotalMinutes,
} from "@/src/services/tracking/healthkit";

import {
  Asset,
  AssetPermission,
  GoalStatus,
  Insight,
} from "@/src/services/tracking/types";
import { Platform } from "react-native";
import { create } from "zustand";

type Status = "idle" | "loading" | "success" | "error";

type BaseState = {
  status: Status;
  error?: string;

  assets: Asset[];
  permissions: AssetPermission[];
  goals: GoalStatus[];
  streakDays: number;
  insights: Insight[];
  tileOrder: string[];
  lastSyncedAt?: string;
};

type BaseActions = {
  requestPermissions: (ids?: string[]) => Promise<void>;
  syncToday: () => Promise<void>;
  setGoal: (id: string, target?: number) => void;
  setTileOrder: (order: string[]) => void;
};

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ---------------- HC slice ----------------
export type WindowKey = "24h" | "7d" | "30d" | "90d";
export type MetricKey =
  | "steps"
  | "floors"
  | "distance"
  | "activeCalories"
  | "heartRate"
  | "sleep";

type NumBucket = { start: string; end?: string; value: number };

export type DatasetBucket = { start: string; end?: string; value: number };
export type HCDataset = {
  id: MetricKey;
  label: string;
  unit: string;
  buckets: DatasetBucket[];
  total: number;
  latest?: number | null;
  freshnessISO?: string;
  trend?: { dir: "up" | "down" | "flat"; pct: number | null };
  meta?: {
    avgPerNight?: number; // sleep
    minBpm?: number; // heart-rate
    maxBpm?: number; // heart-rate
    latestAgeSec?: number; // heart-rate
    coverageCount?: number; // hours-with-data (24h) or days-with-data (7/30/90)
    coverageTotal?: number; // 24 (hours) or N (days) for the window
  };
};

type HCState = {
  hcWindow: WindowKey;
  hcDatasets: HCDataset[];
  hcGrantedKeys: MetricKey[];
  hcError?: string;
  hcLoading: boolean;
  hcInitialized: boolean;
  hcAvailable: boolean;
  hcRunId: number;
  hcTimezoneLabel?: string;
};

type HCActions = {
  hcInitialize: () => Promise<void>;
  hcGrantAll: () => Promise<void>;
  hcRefresh: () => Promise<void>;
  hcSetWindow: (w: WindowKey) => Promise<void>;
  hcOpenSettings: () => void;

  // iOS (HealthKit) counterparts
  hkRefresh: () => Promise<void>;
  hkSetWindow: (w: WindowKey) => Promise<void>;
  hkOpenSettings: () => void;

  hkTearDown: () => Promise<void>;
};

type CrossHealthState = {
  healthPlatform: "ios" | "android" | "none";
  healthAvailable?: boolean; // undefined until probed
  healthGranted?: boolean; // undefined until probed
};
type CrossHealthActions = {
  /** One-tap probe:
   *  iOS → authorize HealthKit (read Steps/HR/Sleep) and set flags
   *  Android → initialize HC, request all reads, set flags from granted keys
   */
  probeHealthPlatform: () => Promise<void>;
};

const HC_LABEL: Record<MetricKey, string> = {
  steps: "Steps",
  floors: "Floors climbed",
  distance: "Distance",
  activeCalories: "Active calories",
  heartRate: "Heart rate",
  sleep: "Sleep",
};
const HC_UNIT: Record<MetricKey, string> = {
  steps: "steps",
  floors: "floors",
  distance: "m",
  activeCalories: "kcal",
  heartRate: "bpm",
  sleep: "min",
};
const HC_ORDER: MetricKey[] = [
  "steps",
  "floors",
  "distance",
  "activeCalories",
  "heartRate",
  "sleep",
];

const LOG = "[Store/HC]";
const log = (...a: any[]) => console.log(LOG, ...a);
const logE = (m: string, e: unknown) =>
  console.log(LOG, m, (e as any)?.message ?? e);

// ---------------- Combined store ----------------
type Store = BaseState &
  BaseActions &
  HCState &
  HCActions &
  CrossHealthState &
  CrossHealthActions;

// ---- Trend helpers (7d only for now) ----
type TrendDir = "up" | "down" | "flat";
function pctChange(newV: number, oldV: number) {
  if (!Number.isFinite(newV) || !Number.isFinite(oldV) || oldV === 0) return 0;
  return ((newV - oldV) / oldV) * 100;
}

/**
 * For a 7d window with daily buckets, estimate trend by comparing
 * the sum of the last 3 full days vs the prior 3 full days.
 * If we have fewer than 6 data points >0, return flat.
 */
function compute7dTrend(
  buckets: { value: number }[],
  upDownThresholdPct = 5
): { dir: TrendDir; pct: number | null } {
  if (!Array.isArray(buckets) || buckets.length < 6)
    return { dir: "flat", pct: null };

  // keep numeric values only
  const vals = buckets.map((b) => Number(b.value || 0));

  // Use last 6 buckets: [.., d-5, d-4, d-3, d-2, d-1, d0]
  // Compare last 3 full days vs prior 3. If the most recent bucket is partial, this still works OK.
  const last3 = vals.slice(-3).reduce((s, v) => s + v, 0);
  const prev3 = vals.slice(-6, -3).reduce((s, v) => s + v, 0);

  // Require at least some coverage
  const haveEnough = [last3, prev3].every((v) => v > 0);
  if (!haveEnough) return { dir: "flat", pct: null };

  const pct = pctChange(last3, prev3);
  if (pct >= upDownThresholdPct) return { dir: "up", pct };
  if (pct <= -upDownThresholdPct) return { dir: "down", pct };
  return { dir: "flat", pct: Math.abs(pct) < 0.1 ? 0 : pct };
}

function trendFrom7dDaily(buckets: { value: number }[], thresholdPct = 5) {
  if (!Array.isArray(buckets) || buckets.length < 6)
    return { dir: "flat" as TrendDir, pct: null };
  const vals = buckets.map((b) => Number(b.value || 0));
  const last3 = vals.slice(-3).reduce((s, v) => s + v, 0);
  const prev3 = vals.slice(-6, -3).reduce((s, v) => s + v, 0);
  if (last3 <= 0 || prev3 <= 0) return { dir: "flat" as TrendDir, pct: null };
  const pct = pctChange(last3, prev3);
  if (pct >= thresholdPct) return { dir: "up" as TrendDir, pct };
  if (pct <= -thresholdPct) return { dir: "down" as TrendDir, pct };
  return { dir: "flat" as TrendDir, pct: Math.abs(pct) < 0.1 ? 0 : pct };
}

/**
 * 30d/90d daily buckets → compare last 7 days vs previous 7 days.
 */
function trendFromNDaysDaily(buckets: { value: number }[], thresholdPct = 5) {
  if (!Array.isArray(buckets) || buckets.length < 14)
    return { dir: "flat" as TrendDir, pct: null };
  const vals = buckets.map((b) => Number(b.value || 0));
  const last7 = vals.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = vals.slice(-14, -7).reduce((s, v) => s + v, 0);
  if (last7 <= 0 || prev7 <= 0) return { dir: "flat" as TrendDir, pct: null };
  const pct = pctChange(last7, prev7);
  if (pct >= thresholdPct) return { dir: "up" as TrendDir, pct };
  if (pct <= -thresholdPct) return { dir: "down" as TrendDir, pct };
  return { dir: "flat" as TrendDir, pct: Math.abs(pct) < 0.1 ? 0 : pct };
}

/**
 * Decide trend method by window + metric.
 */
function computeTrendForWindow(
  window: WindowKey,
  metric: MetricKey,
  buckets: { value: number }[]
): { dir: TrendDir; pct: number | null } | undefined {
  // Only bucket-based metrics can have a trend right now.
  const bucketable = metric !== "heartRate" && metric !== "sleep";
  if (!bucketable) return undefined;

  switch (window) {
    case "7d":
      return trendFrom7dDaily(buckets);
    case "30d":
    case "90d":
      return trendFromNDaysDaily(buckets);
    default:
      // 24h: hourly buckets — skip trend for now (or add 6h vs 6h in the future)
      return undefined;
  }
}

/** Compact the cumulative 24h series into change events only. */
function cumulativeToChangeEvents(series: NumBucket[]) {
  const out: Array<{ at: string; delta: number; total: number }> = [];
  let prev = 0;
  for (const b of series) {
    const cur = Number(b.value || 0);
    const inc = cur - prev;
    if (inc > 0) out.push({ at: b.end ?? b.start, delta: inc, total: cur });
    prev = cur;
  }
  return out;
}

function toCumulativeForwardFill(buckets: NumBucket[]) {
  const sorted = [...buckets].sort((a, b) => a.start.localeCompare(b.start));
  let cumul = 0;
  const series: NumBucket[] = [];
  let changeHours = 0;
  for (const b of sorted) {
    const inc = Number(b.value || 0);
    if (inc > 0) {
      cumul += inc;
      changeHours += 1;
    }
    series.push({ ...b, value: cumul });
  }
  const last = series.length ? Number(series[series.length - 1].value) || 0 : 0;
  const events = cumulativeToChangeEvents(series);
  return { series, last, changeHours, events };
}

/** Replace 0/empty values with last non-zero (used for HR gaps). */
function forwardFill(buckets: NumBucket[]) {
  let lastSeen: number | null = null;
  return buckets.map((b) => {
    const v = Number(b.value || 0);
    if (v > 0) {
      lastSeen = v;
      return { ...b, value: v };
    }
    return lastSeen != null ? { ...b, value: lastSeen } : b;
  });
}

export const useTrackingStore = create<Store>((set, get) => ({
  // ---- Base init (restores fields other screens rely on) ----
  status: "idle",
  error: undefined,

  assets: fxAssets,
  permissions: fxPermissions,
  goals: fxGoals,
  streakDays: fxStreakDays,
  insights: fxInsights,
  tileOrder: ["steps", "active", "sleep", "hr_rest", "energy"],
  lastSyncedAt: undefined,

  async requestPermissions(ids) {
    const target = new Set(ids ?? get().permissions.map((p) => p.id));

    const updated: AssetPermission[] = get().permissions.map((p) =>
      target.has(p.id)
        ? {
            ...p,
            status: "granted" as const,
            lastPromptedAt: new Date().toISOString(),
          }
        : p
    );
    set({ permissions: updated });

    const assets: Asset[] = get().assets.map((a) =>
      target.has(a.id) && a.state === "permission_needed"
        ? { ...a, state: "ok" as const }
        : a
    );
    set({ assets });
  },

  async syncToday() {
    set({ status: "loading", error: undefined });
    try {
      await wait(250);
      const now = new Date().toISOString();
      const assets: Asset[] = get().assets.map((a) => ({
        ...a,
        freshness: now,
      }));
      set({ assets, lastSyncedAt: now, status: "success" });
    } catch (e: any) {
      set({ status: "error", error: e?.message ?? "Sync failed" });
    }
  },

  setGoal(id, target) {
    const goals = get().goals.map((g) => (g.id === id ? { ...g, target } : g));
    set({ goals });
  },

  setTileOrder(order) {
    set({ tileOrder: order });
  },

  // ---- Cross-platform health flags ----
  healthPlatform:
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "none",
  healthAvailable: undefined,
  healthGranted: undefined,

  // ---- HC init ----
  hcWindow: "7d",
  hcDatasets: [],
  hcGrantedKeys: [],
  hcError: undefined,
  hcLoading: false,
  hcInitialized: false,
  hcAvailable: false,
  hcRunId: 0,

  // cross-platform probe (iOS HealthKit / Android HC)
  probeHealthPlatform: async () => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      set({ healthAvailable: false, healthGranted: false });
      return;
    }

    if (Platform.OS === "ios") {
      try {
        const res = await ensureHealthKitAuthorized(); // { available, granted }
        const keys =
          res.available && res.granted
            ? ((await hkListGrantedMetricKeys()) as MetricKey[])
            : [];
        set({
          healthAvailable: !!res.available,
          healthGranted: res.available ? !!res.granted : false,
          hcGrantedKeys: keys, // reuse same array for platform-agnostic UI gating
          hcTimezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        if (res.available && res.granted) {
          try {
            await hkDebugRaw();
            await get().hkRefresh();
            // 🔔 Begin observing background changes

            const HK = await import("@kingstinct/react-native-healthkit");
            log(
              "[HK] has subscribeToObserverQuery?",
              typeof (HK as any).subscribeToObserverQuery
            );
            log("[HK] UpdateFrequency enum:", (HK as any).UpdateFrequency);

            const { hkStartBackgroundObservers } = await import(
              "@/src/services/tracking/healthkit"
            );
            await hkStartBackgroundObservers(async () => {
              // minimal handler: refresh datasets when HK notifies us
              try {
                await get().hkRefresh();
              } catch {}
            });
          } catch {}
        }
      } catch {
        set({ healthAvailable: false, healthGranted: false });
      }
      return;
    }

    // Android (Health Connect) — reuse existing flow
    try {
      await hcEnsureInitialized();
      await hcRequestAllReadPermissions(); // symmetric to iOS ask
      const keys = (await hcListGrantedMetricKeys()) as MetricKey[];
      set({
        healthAvailable: true,
        healthGranted: keys.length > 0,
        hcGrantedKeys: keys, // keep HC slice in sync
      });
    } catch {
      set({ healthAvailable: false, healthGranted: false });
    }
  },

  hcInitialize: async () => {
    if (Platform.OS !== "android") {
      // iOS: HC not applicable; HealthKit is handled via probeHealthPlatform
      set({ hcInitialized: false, hcAvailable: false });
      return;
    }
    try {
      log("initialize start");
      await hcEnsureInitialized();
      const keys = (await hcListGrantedMetricKeys()) as MetricKey[];
      log("initialize success; granted=", keys);
      const tz = hcGetLocalTimezoneInfo().label;
      log("initialize success; granted=", keys, "tz=", tz);
      set({
        hcGrantedKeys: keys,
        hcError: undefined,
        hcInitialized: true,
        hcAvailable: true,
        hcTimezoneLabel: tz,
      });
    } catch (e) {
      logE("initialize failed", e);
      set({
        hcError: String((e as any)?.message ?? e),
        hcInitialized: true,
        hcAvailable: false,
      });
    }
  },

  hcGrantAll: async () => {
    if (Platform.OS !== "android") return; // iOS uses probeHealthPlatform
    try {
      log("grantAll start");
      await hcRequestAllReadPermissions();
      const keys = (await hcListGrantedMetricKeys()) as MetricKey[];
      log("grantAll success; granted=", keys);
      set({ hcGrantedKeys: keys, hcError: undefined });
      await get().hcRefresh();
    } catch (e) {
      logE("grantAll failed", e);
      set({ hcError: String((e as any)?.message ?? e) });
    }
  },

  hcRefresh: async () => {
    if (Platform.OS !== "android") return; // iOS has no HC datasets
    const { hcWindow, hcLoading, hcRunId } = get();

    // prevent overlapping refreshes
    if (hcLoading) return;

    const myRun = hcRunId + 1;
    set({ hcLoading: true, hcError: undefined, hcRunId: myRun });
    const fetchedAtISO = new Date().toISOString();
    const tz = hcGetLocalTimezoneInfo().label;
    log("[HC] Using timezone:", tz);
    try {
      const granted = (await hcListGrantedMetricKeys()) as MetricKey[];
      log("refresh window=", hcWindow, "granted=", granted);

      const datasets: HCDataset[] = [];

      for (const m of HC_ORDER) {
        if (!granted.includes(m)) continue;
        // 1) Load buckets only for metrics that support them in this view
        let buckets: HCBucket[] = [];
        try {
          const bucketable = m !== "sleep";
          if (bucketable) {
            switch (hcWindow) {
              case "24h":
                buckets = await hcRead24hBuckets(m as any);
                break;
              case "7d":
                buckets = await hcRead7dBuckets(m as any);
                break;
              case "30d":
                buckets = await hcRead30dBuckets(m as any);
                break;
              case "90d":
                buckets = await hcRead90dBuckets(m as any);
                break;
            }
          }
        } catch (e) {
          logE(`bucket read failed for ${m} [${hcWindow}]`, e);
        }

        // Map to UI buckets
        const uiBuckets: DatasetBucket[] = (buckets ?? []).map((b) => ({
          start: b.start,
          end: b.end,
          value: Number(b.value ?? 0) || 0,
        }));

        // 2) Compute latest & total per metric in a consistent way
        let total = 0;
        let latest: number | null | undefined = null;

        // 3) Compute trend if applicable
        const trend = computeTrendForWindow(hcWindow, m, uiBuckets);

        const sumFromBuckets = uiBuckets.reduce(
          (s, b) => s + (Number(b.value) || 0),
          0
        );
        log(
          "[Buckets]",
          m,
          hcWindow,
          "len=",
          uiBuckets.length,
          "sum=",
          sumFromBuckets
        );
        const lastBucketValue = uiBuckets.length
          ? Number(uiBuckets[uiBuckets.length - 1].value) || 0
          : null;

        switch (m) {
          case "steps":
          case "floors":
          case "distance":
          case "activeCalories": {
            // Headline should come from the selected window’s buckets only.
            const coverageTotal =
              hcWindow === "24h"
                ? 24
                : hcWindow === "7d"
                  ? 7
                  : hcWindow === "30d"
                    ? 30
                    : 90;

            if (hcWindow === "24h") {
              // uiBuckets = RAW hourly increments (what we PLOT)
              // Build a cumulative shadow series only for totals & event logs
              const {
                series: cumulative,
                last: cumulativeLast,
                changeHours,
                events,
              } = toCumulativeForwardFill(uiBuckets as NumBucket[]);

              const sumFromRaw = uiBuckets.reduce(
                (s, b) => s + (Number(b.value) || 0),
                0
              );

              // Headline should be the day total (sum == last cumulative)
              total = sumFromRaw;
              latest = cumulativeLast;

              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],

                // IMPORTANT: PLOT RAW increments, NOT cumulative
                buckets: uiBuckets,

                total,
                latest,
                freshnessISO: fetchedAtISO,
                trend: undefined, // no trend for 24h
                meta: {
                  // hours that actually had activity (non-zero raw)
                  coverageCount: changeHours,
                  coverageTotal, // 24
                  // compact event log for the UI to render (optional but useful)
                  // { at: ISO, delta: number, total: number }
                  events,
                  // optional: surface the last cumulative for debugging / UI badges
                  cumulativeLast,
                } as any,
              });
            } else {
              // (unchanged) 7d/30d/90d remain raw per-day sums
              const sumFromBuckets = uiBuckets.reduce(
                (s, b) => s + (Number(b.value) || 0),
                0
              );
              total = sumFromBuckets;
              latest = uiBuckets.length
                ? Number(uiBuckets[uiBuckets.length - 1].value) || 0
                : null;

              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: uiBuckets,
                total,
                latest,
                freshnessISO: fetchedAtISO,
                trend,
                meta: {
                  coverageCount: uiBuckets.filter(
                    (b) => (Number(b.value) || 0) > 0
                  ).length,
                  coverageTotal,
                },
              });
            }
            continue;
          }

          //     const sumFromBuckets = uiBuckets.reduce((s, b) => s + (Number(b.value) || 0), 0);
          //     const coverageCount = uiBuckets.filter(b => (Number(b.value) || 0) > 0).length;

          //     total = sumFromBuckets;                       // <- headline total from buckets
          //     latest = uiBuckets.length
          //       ? Number(uiBuckets[uiBuckets.length - 1].value) || 0
          //       : null;                                     // last slice if needed by UI; null if no buckets

          //     datasets.push({
          //       id: m,
          //       label: HC_LABEL[m],
          //       unit: HC_UNIT[m],
          //       buckets: uiBuckets,
          //       total,
          //       latest,
          //       freshnessISO: fetchedAtISO,
          //       trend,
          //       meta: {
          //         coverageCount,
          //         coverageTotal,
          //       },
          //     });
          //     continue; // handled and pushed
          // }

          case "heartRate": {
            try {
              let ui: DatasetBucket[] = [];
              if (hcWindow === "24h") {
                const hrBuckets = await hcReadHeartRateHourly24();
                ui = hrBuckets.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0), // 0 means "no sample" for this hour
                }));
              } else {
                const days =
                  hcWindow === "7d" ? 7 : hcWindow === "30d" ? 30 : 90;
                const hrDaily = await hcReadHeartRateDailyBuckets(
                  days as 7 | 30 | 90
                );
                ui = hrDaily.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
              }

              const values = ui
                .map((b) => Number(b.value || 0))
                .filter((n) => n > 0);
              const minBpm = values.length ? Math.min(...values) : undefined;
              const maxBpm = values.length ? Math.max(...values) : undefined;
              let latest: number | null = null;
              let latestAgeSec: number | undefined = undefined;
              try {
                const { bpm, atISO } = await hcReadHeartRateLatest();
                if (Number.isFinite(bpm as any) && (bpm as any) > 0) {
                  latest = bpm!;
                  if (atISO) {
                    const t = new Date(atISO).getTime();
                    latestAgeSec = Math.round((Date.now() - t) / 1000);
                  }
                }
              } catch {
                latest = ui.length ? ui[ui.length - 1].value : null;
              }

              if (latest == null || latest <= 0) {
                for (let i = ui.length - 1; i >= 0; i--) {
                  const v = Number(ui[i].value || 0);
                  if (v > 0) {
                    latest = v;
                    break;
                  }
                }
                if (latest == null) latest = null;
              }

              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: ui,
                total: 0,
                latest,
                freshnessISO: fetchedAtISO,
                trend: computeTrendForWindow(hcWindow, m, ui),
                meta: {
                  minBpm,
                  maxBpm,
                  latestAgeSec,
                  coverageCount: ui.filter((b) => (Number(b.value) || 0) > 0)
                    .length,
                  coverageTotal:
                    hcWindow === "24h"
                      ? 24
                      : hcWindow === "7d"
                        ? 7
                        : hcWindow === "30d"
                          ? 30
                          : 90,
                },
              });
            } catch (e) {
              logE("hr read failed", e);
              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: [],
                total: 0,
                latest: null,
                freshnessISO: new Date().toISOString(),
                trend: undefined,
              });
            }
            continue;
          }

          case "sleep": {
            if (hcWindow === "24h") {
              // 24h → hourly buckets (minutes per hour). Fallback to today's total if needed.
              try {
                const sleep24 = await hcReadSleepHourlyBuckets24();
                const ui = sleep24.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
                const sum = ui.reduce((s, b) => s + (b.value || 0), 0);
                total = sum;
                // show the last hour’s minutes as "latest" (consistent with other metrics)
                latest = ui.length ? ui[ui.length - 1].value : null;

                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: ui,
                  total,
                  latest,
                  freshnessISO: fetchedAtISO,
                  trend: undefined, // we don't compute trend for 24h
                  meta: {
                    coverageCount: ui.filter((b) => (Number(b.value) || 0) > 0)
                      .length,
                    coverageTotal: 24,
                  },
                });
              } catch (e) {
                logE("sleep 24h buckets fail", e);
                // Fallback: surface today's total so the screen still shows something
                try {
                  total = await hcReadTodaySleepTotalMinutes();
                } catch {}
                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: [],
                  total: 0,
                  latest: null,
                  freshnessISO: fetchedAtISO,
                  trend: undefined,
                });
              }
            } else {
              // 7d/30d/90d → daily buckets (minutes per day)
              const days = hcWindow === "7d" ? 7 : hcWindow === "30d" ? 30 : 90;
              try {
                const sleepBuckets = await hcReadSleepDailyBuckets(
                  days as 7 | 30 | 90
                );
                const ui = sleepBuckets.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
                const sum = ui.reduce((s, b) => s + (b.value || 0), 0);
                total = sum;
                latest = null;
                const avgPerNight = Math.round(sum / (ui.length || 1));

                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: ui,
                  total,
                  latest,
                  freshnessISO: fetchedAtISO,
                  trend: computeTrendForWindow(hcWindow, m, ui), // returns undefined for sleep
                  meta: {
                    avgPerNight,
                    coverageCount: ui.filter((b) => (Number(b.value) || 0) > 0)
                      .length,
                    coverageTotal: days,
                  },
                });
              } catch (e) {
                logE("sleep buckets fail", e);
                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: [],
                  total: 0,
                  latest: null,
                  freshnessISO: fetchedAtISO,
                  trend: undefined,
                });
              }
            }
            continue; // handled and pushed
          }
        }
      }

      // Only commit if still the latest run; also avoid churning hcGrantedKeys
      if (get().hcRunId === myRun) {
        const prev = get().hcGrantedKeys;
        const same =
          prev.length === granted.length &&
          prev.every((k, i) => k === granted[i]);

        set({
          hcDatasets: datasets,
          hcGrantedKeys: same ? prev : granted,
          hcTimezoneLabel: tz,
        });
      }

      log("refresh done datasets=", datasets.length);
    } catch (e) {
      logE("refresh failed", e);
      if (get().hcRunId === myRun) {
        set({ hcError: String((e as any)?.message ?? e) });
      }
    } finally {
      if (get().hcRunId === myRun) {
        set({ hcLoading: false });
      }
    }
  },

  // iOS (HealthKit) refresh — mirrors hcRefresh but uses HK readers
  hkRefresh: async () => {
    if (Platform.OS !== "ios") return;

    const { hcWindow, hcLoading, hcRunId } = get();
    if (hcLoading) return;

    const myRun = hcRunId + 1;
    set({ hcLoading: true, hcError: undefined, hcRunId: myRun });
    const fetchedAtISO = new Date().toISOString();
    const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;
    log("[HK] Using timezone:", tzLabel);

    try {
      const granted = (await hkListGrantedMetricKeys()) as MetricKey[];
      log("[HK] refresh window=", hcWindow, "granted=", granted);

      const datasets: HCDataset[] = [];

      for (const m of HC_ORDER) {
        if (!granted.includes(m)) continue;

        // 1) Buckets where applicable
        let buckets: Array<{ start: string; end?: string; value: number }> = [];
        try {
          const bucketable = m !== "sleep";
          if (bucketable) {
            switch (hcWindow) {
              case "24h":
                buckets = await hkRead24hBuckets(m as any);
                break;
              case "7d":
                buckets = await hkRead7dBuckets(m as any);
                break;
              case "30d":
                buckets = await hkRead30dBuckets(m as any);
                break;
              case "90d":
                buckets = await hkRead90dBuckets(m as any);
                break;
            }
          }
        } catch (e) {
          logE(`[HK] bucket read failed for ${m} [${hcWindow}]`, e);
        }

        const uiBuckets: DatasetBucket[] = (buckets ?? []).map((b) => ({
          start: b.start,
          end: b.end,
          value: Number(b.value ?? 0) || 0,
        }));

        if (m !== "sleep") {
          const sumFromBuckets = uiBuckets.reduce(
            (s, b) => s + (Number(b.value) || 0),
            0
          );
          log(
            "[HK][Buckets]",
            m,
            hcWindow,
            "len=",
            uiBuckets.length,
            "sum=",
            sumFromBuckets
          );
        }

        let total = 0;
        let latest: number | null | undefined = null;
        const trend = computeTrendForWindow(hcWindow, m, uiBuckets);

        switch (m) {
          case "steps":
          case "floors":
          case "distance":
          case "activeCalories": {
            const coverageTotal =
              hcWindow === "24h"
                ? 24
                : hcWindow === "7d"
                  ? 7
                  : hcWindow === "30d"
                    ? 30
                    : 90;

            if (hcWindow === "24h") {
              const {
                series: cumulative,
                last: cumulativeLast,
                changeHours,
                events,
              } = toCumulativeForwardFill(uiBuckets as NumBucket[]);
              const sumFromRaw = uiBuckets.reduce(
                (s, b) => s + (Number(b.value) || 0),
                0
              );

              total = sumFromRaw;
              latest = cumulativeLast;

              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: uiBuckets, // plot raw
                total,
                latest,
                freshnessISO: fetchedAtISO,
                trend: undefined,
                meta: {
                  coverageCount: changeHours,
                  coverageTotal,
                  events,
                  cumulativeLast,
                } as any,
              });
            } else {
              const sum = uiBuckets.reduce(
                (s, b) => s + (Number(b.value) || 0),
                0
              );
              total = sum;
              latest = uiBuckets.length
                ? Number(uiBuckets[uiBuckets.length - 1].value) || 0
                : null;

              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: uiBuckets,
                total,
                latest,
                freshnessISO: fetchedAtISO,
                trend,
                meta: {
                  coverageCount: uiBuckets.filter(
                    (b) => (Number(b.value) || 0) > 0
                  ).length,
                  coverageTotal,
                },
              });
            }
            continue;
          }

          case "heartRate": {
            try {
              let ui: DatasetBucket[] = [];
              if (hcWindow === "24h") {
                const hrBuckets = await hkReadHeartRateHourly24();
                ui = hrBuckets.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
              } else {
                const days =
                  hcWindow === "7d" ? 7 : hcWindow === "30d" ? 30 : 90;
                const hrDaily = await hkReadHeartRateDailyBuckets(
                  days as 7 | 30 | 90
                );
                ui = hrDaily.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
              }

              const values = ui
                .map((b) => Number(b.value || 0))
                .filter((n) => n > 0);
              const minBpm = values.length ? Math.min(...values) : undefined;
              const maxBpm = values.length ? Math.max(...values) : undefined;

              // Phase-1: we won’t fetch a “latest” separate endpoint for HK yet;
              // derive latest non-zero from buckets (same fallback as Android path).
              let latestHR: number | null = null;
              for (let i = ui.length - 1; i >= 0; i--) {
                const v = Number(ui[i].value || 0);
                if (v > 0) {
                  latestHR = v;
                  break;
                }
              }

              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: ui,
                total: 0,
                latest: latestHR,
                freshnessISO: fetchedAtISO,
                trend: computeTrendForWindow(hcWindow, m, ui),
                meta: {
                  minBpm,
                  maxBpm,
                  coverageCount: ui.filter((b) => (Number(b.value) || 0) > 0)
                    .length,
                  coverageTotal:
                    hcWindow === "24h"
                      ? 24
                      : hcWindow === "7d"
                        ? 7
                        : hcWindow === "30d"
                          ? 30
                          : 90,
                },
              });
            } catch (e) {
              logE("[HK] hr read failed", e);
              datasets.push({
                id: m,
                label: HC_LABEL[m],
                unit: HC_UNIT[m],
                buckets: [],
                total: 0,
                latest: null,
                freshnessISO: new Date().toISOString(),
                trend: undefined,
              });
            }
            continue;
          }

          case "sleep": {
            if (hcWindow === "24h") {
              try {
                const sleep24 = await hkReadSleepHourlyBuckets24();
                const ui = sleep24.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
                const sum = ui.reduce((s, b) => s + (b.value || 0), 0);
                total = sum;
                latest = ui.length ? ui[ui.length - 1].value : null;

                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: ui,
                  total,
                  latest,
                  freshnessISO: fetchedAtISO,
                  trend: undefined,
                  meta: {
                    coverageCount: ui.filter((b) => (Number(b.value) || 0) > 0)
                      .length,
                    coverageTotal: 24,
                  },
                });
              } catch (e) {
                logE("[HK] sleep 24h buckets fail", e);
                try {
                  total = await hkReadTodaySleepTotalMinutes();
                } catch {}
                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: [],
                  total: 0,
                  latest: null,
                  freshnessISO: fetchedAtISO,
                  trend: undefined,
                });
              }
            } else {
              const days = hcWindow === "7d" ? 7 : hcWindow === "30d" ? 30 : 90;
              try {
                const sleepBuckets = await hkReadSleepDailyBuckets(
                  days as 7 | 30 | 90
                );
                const ui = sleepBuckets.map((b) => ({
                  start: b.start,
                  end: b.end,
                  value: Number(b.value || 0),
                }));
                const sum = ui.reduce((s, b) => s + (b.value || 0), 0);
                total = sum;
                latest = null;
                const avgPerNight = Math.round(sum / (ui.length || 1));
                log(
                  "[HK][SleepBuckets]",
                  hcWindow,
                  "len=",
                  ui.length,
                  "sum=",
                  sum
                );
                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: ui,
                  total,
                  latest,
                  freshnessISO: fetchedAtISO,
                  trend: computeTrendForWindow(hcWindow, m, ui),
                  meta: {
                    avgPerNight,
                    coverageCount: ui.filter((b) => (Number(b.value) || 0) > 0)
                      .length,
                    coverageTotal: days,
                  },
                });
              } catch (e) {
                logE("[HK] sleep buckets fail", e);
                datasets.push({
                  id: m,
                  label: HC_LABEL[m],
                  unit: HC_UNIT[m],
                  buckets: [],
                  total: 0,
                  latest: null,
                  freshnessISO: fetchedAtISO,
                  trend: undefined,
                });
              }
            }
            continue;
          }
        }
      }

      if (get().hcRunId === myRun) {
        const prev = get().hcGrantedKeys;
        const same =
          prev.length === granted.length &&
          prev.every((k, i) => k === granted[i]);
        set({
          hcDatasets: datasets, // reuse same field cross-platform
          hcGrantedKeys: same ? prev : granted,
          hcTimezoneLabel: tzLabel,
        });
      }

      log("[HK] refresh done datasets=", datasets.length);
    } catch (e) {
      logE("[HK] refresh failed", e);
      if (get().hcRunId === myRun)
        set({ hcError: String((e as any)?.message ?? e) });
    } finally {
      if (get().hcRunId === myRun) set({ hcLoading: false });
    }
  },

  hcSetWindow: async (w) => {
    const cur = get().hcWindow;
    if (cur === w) return;
    set({ hcWindow: w });
    log("setWindow", w);

    if (Platform.OS === "android") {
      await get().hcRefresh();
    } else if (Platform.OS === "ios") {
      await get().hkRefresh();
    }
  },

  hkSetWindow: async (w) => {
    const cur = get().hcWindow;
    if (cur === w) return;
    set({ hcWindow: w });
    log("[HK] setWindow", w);
    await get().hkRefresh();
  },

  hcOpenSettings: () => {
    if (Platform.OS === "android") openHealthConnectSettings();
  },

  hkOpenSettings: () => {
    if (Platform.OS === "ios") hkOpenHealthSettings();
  },

  // iOS HealthKit teardown on sign-out (idempotent)
  hkTearDown: async () => {
    if (Platform.OS === "ios") {
      try {
        const { hkStopBackgroundObservers } = await import(
          "@/src/services/tracking/healthkit"
        );
        await hkStopBackgroundObservers(); // safe to call multiple times
      } catch {}
    }
    // Optional: clear local datasets/flags so UI snaps back to signed-out state
    set({
      hcDatasets: [],
      hcGrantedKeys: [],
      healthGranted: false,
    });
  },
}));
