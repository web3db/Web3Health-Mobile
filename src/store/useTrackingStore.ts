// src/store/useTrackingStore.ts

import {
  fxAssets,
  fxGoals,
  fxInsights,
  fxPermissions,
  fxStreakDays,
} from "@/src/data/fixtures/tracking";

// Android / Health connect
import {
  ensureInitialized as hcEnsureInitialized,
  getLocalTimezoneInfo as hcGetLocalTimezoneInfo,
  hcIsInitialized,
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

// iOS / HealthKit:
import {
  hkDetectActiveReadMetrics,
  hkGetAuthorizationSnapshot,
  hkRead24hBuckets,
  hkRead30dBuckets,
  hkRead7dBuckets,
  hkRead90dBuckets,
  hkReadHeartRateDailyBuckets,
  hkReadHeartRateHourly24,
  hkReadHeartRateInWindow,
  hkReadHeartRateLatest,
  hkReadSleepDailyBuckets,
  hkReadSleepHourly24,
  hkRequestReadAuthorization,
  type HKAuthorizationSnapshot,
  type Bucket as HKBucket,
  type MetricKey as HKMetricKey,
  type HKReadRequestStatus,
} from "@/src/services/tracking/healthkit";

import {
  Asset,
  AssetPermission,
  GoalStatus,
  Insight,
} from "@/src/services/tracking/types";
import { Platform } from "react-native";
import { create } from "zustand";

/** ───────────────────────── Base types ───────────────────────── */

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

/** ───────────────────────── Shared metric model ───────────────────────── */

export type MetricKey = HKMetricKey;

export type WindowKey = "24h" | "7d" | "30d" | "90d";

export type DatasetBucket = { start: string; end?: string; value: number };

export type Dataset = {
  id: MetricKey;
  label: string;
  unit: string;
  buckets: DatasetBucket[];
  total: number;
  latest?: number | null;
  freshnessISO?: string;
  trend?: { dir: "up" | "down" | "flat"; pct: number | null };
  meta?: Record<string, any>;
};

const LABEL: Record<MetricKey, string> = {
  steps: "Steps",
  floors: "Floors climbed",
  distance: "Distance",
  activeCalories: "Active calories",
  heartRate: "Heart rate",
  // weight: "Weight",
  sleep: "Sleep",
  // respiratoryRate: "Respiratory rate",
};

const UNIT: Record<MetricKey, string> = {
  steps: "steps",
  floors: "floors",
  distance: "m",
  activeCalories: "kcal",
  heartRate: "bpm",
  // weight: "kg",
  sleep: "min",
  // respiratoryRate: "breaths/min",
};

const METRIC_ORDER: MetricKey[] = [
  "steps",
  "floors",
  "distance",
  "activeCalories",
  "heartRate",
  // "weight",
  "sleep",
  // "respiratoryRate",
];

const REQUESTED_METRIC_KEYS: MetricKey[] = METRIC_ORDER;

/** ───────────────────────── Android / HC slice ───────────────────────── */

type HCState = {
  hcWindow: WindowKey;
  hcDatasets: Dataset[];
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
};

/** ───────────────────────── iOS / HealthKit ─────────────────────────*/
type IOSHealthState = {
  hkAvailable: boolean | null;
  hkStatus: HKReadRequestStatus | null;
  hkActiveMetrics: MetricKey[];
  hkHasAnyData: boolean;
  hkDatasets: Dataset[];
  hkLoading: boolean;
  hkBusy: boolean;
  hkError?: string;
};

type IOSHealthActions = {
  initHealthKitIfNeeded: () => Promise<void>;
  refreshHealthKitData: () => Promise<void>;
  handleHealthPermissionPress: () => Promise<void>;
  handleHealthSettingsReturn: () => Promise<void>;
  isHealthKitConnected: () => boolean;
};

/** ───────────────────────── Cross-platform health flags ───────────────────────── */

type CrossHealthState = {
  healthPlatform: "ios" | "android" | "none";
  healthAvailable?: boolean;
  healthGranted?: boolean;
};

type CrossHealthActions = {
  probeHealthPlatform: () => Promise<void>;
};

/** ───────────────────────── Utils ───────────────────────── */

type TrendDir = "up" | "down" | "flat";

function pctChange(newV: number, oldV: number) {
  if (!Number.isFinite(newV) || !Number.isFinite(oldV) || oldV === 0) return 0;
  return ((newV - oldV) / oldV) * 100;
}

function trendFrom7dDaily(
  buckets: { value: number }[],
  thresholdPct = 5
): { dir: TrendDir; pct: number | null } {
  if (!Array.isArray(buckets) || buckets.length < 6)
    return { dir: "flat", pct: null };
  const vals = buckets.map((b) => Number(b.value || 0));
  const last3 = vals.slice(-3).reduce((s, v) => s + v, 0);
  const prev3 = vals.slice(-6, -3).reduce((s, v) => s + v, 0);
  if (last3 <= 0 || prev3 <= 0) return { dir: "flat", pct: null };
  const pct = pctChange(last3, prev3);
  if (pct >= thresholdPct) return { dir: "up", pct };
  if (pct <= -thresholdPct) return { dir: "down", pct };
  return { dir: "flat", pct: Math.abs(pct) < 0.1 ? 0 : pct };
}

function compute7dTrendFor(metric: MetricKey, buckets: { value: number }[]) {
  if (metric === "heartRate" || metric === "sleep") {
    return undefined;
  }
  return trendFrom7dDaily(buckets);
}

type NumBucket = { start: string; end?: string; value: number };

/** Compact the cumulative 24h series into change events only. */
function cumulativeToChangeEvents(series: NumBucket[]) {
  const out: Array<{ at: string; delta: number; total: number }> = [];
  let prev = 0;
  for (const b of series) {
    const cur = Number(b.value || 0);
    const inc = cur - prev;
    if (inc > 0) {
      out.push({
        at: b.end ?? b.start,
        delta: inc,
        total: cur,
      });
    }
    prev = cur;
  }
  return out;
}

/** Convert raw increment buckets into a cumulative, forward-filled series plus event log. */
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

/**
 * 30d/90d daily buckets → compare last 7 days vs previous 7 days.
 * Mirrors the old HC trend behavior.
 */
function trendFromNDaysDaily(
  buckets: { value: number }[],
  thresholdPct = 5
): { dir: TrendDir; pct: number | null } {
  if (!Array.isArray(buckets) || buckets.length < 14)
    return { dir: "flat", pct: null };

  const vals = buckets.map((b) => Number(b.value || 0));
  const last7 = vals.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = vals.slice(-14, -7).reduce((s, v) => s + v, 0);

  if (last7 <= 0 || prev7 <= 0) return { dir: "flat", pct: null };

  const pct = pctChange(last7, prev7);
  if (pct >= thresholdPct) return { dir: "up", pct };
  if (pct <= -thresholdPct) return { dir: "down", pct };
  return { dir: "flat", pct: Math.abs(pct) < 0.1 ? 0 : pct };
}

/**
 * General trend selector by window + metric.
 * - 7d: uses 3-day vs previous 3-day (trendFrom7dDaily)
 * - 30d/90d: uses 7-day vs previous 7-day (trendFromNDaysDaily)
 * - 24h: no trend
 * - heartRate/sleep: no trend
 */
function computeTrendForWindow(
  window: WindowKey,
  metric: MetricKey,
  buckets: { value: number }[]
): { dir: TrendDir; pct: number | null } | undefined {
  const bucketable = metric !== "heartRate" && metric !== "sleep";
  if (!bucketable) return undefined;

  switch (window) {
    case "7d":
      return trendFrom7dDaily(buckets);
    case "30d":
    case "90d":
      return trendFromNDaysDaily(buckets);
    default:
      // 24h: skip trend
      return undefined;
  }
}

/** ───────────────────────── Store type ───────────────────────── */

type Store = BaseState &
  BaseActions &
  HCState &
  HCActions &
  IOSHealthState &
  IOSHealthActions &
  CrossHealthState &
  CrossHealthActions;

/** ───────────────────────── Logging ───────────────────────── */

const LOG = "[TrackingStore]";
const log = (...a: any[]) => {
  if (__DEV__) {
    console.log(LOG, ...a);
  }
};
const logE = (m: string, e: unknown) => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(LOG, m, (e as any)?.message ?? e);
  }
};

/** ───────────────────────── Store implementation ───────────────────────── */

export const useTrackingStore = create<Store>((set, get) => ({
  /** Base */
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
            status: "granted",
            lastPromptedAt: new Date().toISOString(),
          }
        : p
    );
    const assets: Asset[] = get().assets.map((a) =>
      target.has(a.id) && a.state === "permission_needed"
        ? { ...a, state: "ok" }
        : a
    );
    set({ permissions: updated, assets });
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

  /** Cross-platform flags */

  healthPlatform:
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "none",
  healthAvailable: undefined,
  healthGranted: undefined,

  /** Android / Health Connect state */

  hcWindow: "7d",
  hcDatasets: [],
  hcGrantedKeys: [],
  hcError: undefined,
  hcLoading: false,
  hcInitialized: false,
  hcAvailable: false,
  hcRunId: 0,
  hcTimezoneLabel: undefined,

  /** iOS / HealthKit state */

  hkAvailable: null,
  hkStatus: null,
  hkActiveMetrics: [],
  hkHasAnyData: false,
  hkDatasets: [],
  hkLoading: false,
  hkBusy: false,
  hkError: undefined,
  /** Cross-platform probe:
   * - Android: passive HC init + granted keys
   * - iOS: snapshot only (no prompts)
   */
  probeHealthPlatform: async () => {
    if (Platform.OS === "android") {
      // Avoid duplicating initialization logic here; reuse hcInitialize.
      await get().hcInitialize();
      return;
    }

    if (Platform.OS === "ios") {
      try {
        const snapshot: HKAuthorizationSnapshot =
          await hkGetAuthorizationSnapshot();
        set({
          hkAvailable: snapshot.available,
          hkStatus: snapshot.status,
          healthAvailable: snapshot.available,
        });
      } catch (e) {
        logE("HK probe failed", e);
        set({
          hkAvailable: false,
          hkStatus: "unknown",
          healthAvailable: false,
        });
      }
      return;
    }

    set({ healthAvailable: false, healthGranted: false });
  },

  /** Android / Health Connect: initialize */

  hcInitialize: async () => {
    if (Platform.OS !== "android") {
      set({ hcInitialized: false, hcAvailable: false });
      return;
    }
    try {
      if (!hcIsInitialized()) {
        await hcEnsureInitialized();
      }
      const keys = (await hcListGrantedMetricKeys()) as MetricKey[];
      const tz = hcGetLocalTimezoneInfo().label;
      log("initialize success; granted=", keys, "tz=", tz);
      set({
        hcGrantedKeys: keys,
        hcError: undefined,
        hcInitialized: true,
        hcAvailable: true,
        hcTimezoneLabel: tz,
        healthAvailable: true,
        healthGranted: keys.length > 0,
      });
    } catch (e) {
      logE("HC initialize failed", e);
      set({
        hcError: String((e as any)?.message ?? e),
        hcInitialized: true,
        hcAvailable: false,
        healthAvailable: false,
        healthGranted: false,
      });
    }
  },

  hcGrantAll: async () => {
    if (Platform.OS !== "android") return;
    try {
      await hcRequestAllReadPermissions();
      const keys = (await hcListGrantedMetricKeys()) as MetricKey[];
      set({
        hcGrantedKeys: keys,
        hcError: undefined,
        healthAvailable: true,
        healthGranted: keys.length > 0,
      });
      await get().hcRefresh();
    } catch (e) {
      logE("HC grantAll failed", e);
      set({ hcError: String((e as any)?.message ?? e) });
    }
  },

  hcRefresh: async () => {
    if (Platform.OS !== "android") return; // iOS uses HK path

    const { hcWindow, hcLoading, hcRunId, hcGrantedKeys, hcTimezoneLabel } =
      get();

    // prevent overlapping refreshes
    if (hcLoading) return;

    // If no granted keys, there is nothing to read.
    if (!hcGrantedKeys || hcGrantedKeys.length === 0) {
      set({
        hcDatasets: [],
        hcError: undefined,
        hcLoading: false,
        healthGranted: false,
      });
      return;
    }

    const myRun = hcRunId + 1;
    set({ hcLoading: true, hcError: undefined, hcRunId: myRun });

    const fetchedAtISO = new Date().toISOString();
    const tz = hcTimezoneLabel;
    log("[HC] Using timezone:", tz);

    try {
      const granted = hcGrantedKeys;
      log("[HC] refresh window=", hcWindow, "granted=", granted);

      const datasets: Dataset[] = [];

      for (const m of METRIC_ORDER) {
        if (!granted.includes(m)) continue;

        // ---- Movement metrics: steps / floors / distance / activeCalories ----
        if (
          m === "steps" ||
          m === "floors" ||
          m === "distance" ||
          m === "activeCalories"
        ) {
          let buckets: HCBucket[] = [];
          try {
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
          } catch (e) {
            logE(`[HC] bucket read failed for ${m} [${hcWindow}]`, e);
          }

          const uiBuckets: DatasetBucket[] = (buckets ?? []).map((b) => ({
            start: b.start,
            end: b.end,
            value: Number(b.value ?? 0) || 0,
          }));

          const coverageTotal =
            hcWindow === "24h"
              ? 24
              : hcWindow === "7d"
                ? 7
                : hcWindow === "30d"
                  ? 30
                  : 90;

          let total = 0;
          let latest: number | null | undefined = null;

          if (hcWindow === "24h") {
            // 24h → raw hourly increments (what we plot)
            // Build cumulative shadow series only for totals & event logs
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
              label: LABEL[m],
              unit: UNIT[m],

              // IMPORTANT: plot raw increments, NOT cumulative
              buckets: uiBuckets,

              total,
              latest,
              freshnessISO: fetchedAtISO,
              trend: undefined, // no trend for 24h
              meta: {
                coverageCount: changeHours,
                coverageTotal,
                events,
                cumulativeLast,
              },
            });
          } else {
            // 7d/30d/90d → raw per-day sums
            total = uiBuckets.reduce((s, b) => s + (Number(b.value) || 0), 0);
            latest = uiBuckets.length
              ? Number(uiBuckets[uiBuckets.length - 1].value) || 0
              : null;

            const trend = computeTrendForWindow(hcWindow, m, uiBuckets);

            datasets.push({
              id: m,
              label: LABEL[m],
              unit: UNIT[m],
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

        // ---- Heart rate ----
        if (m === "heartRate") {
          try {
            let ui: DatasetBucket[] = [];

            if (hcWindow === "24h") {
              const hrBuckets = await hcReadHeartRateHourly24();
              ui = hrBuckets.map((b) => ({
                start: b.start,
                end: b.end,
                value: Number(b.value || 0), // 0 = no sample
              }));
            } else {
              const days = hcWindow === "7d" ? 7 : hcWindow === "30d" ? 30 : 90;
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
            let latestAgeSec: number | undefined;

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
              label: LABEL[m],
              unit: UNIT[m],
              buckets: ui,
              total: 0, // HR total is not meaningful
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
            logE("[HC] hr read failed", e);
            datasets.push({
              id: m,
              label: LABEL[m],
              unit: UNIT[m],
              buckets: [],
              total: 0,
              latest: null,
              freshnessISO: new Date().toISOString(),
              trend: undefined,
            });
          }

          continue;
        }

        // ---- Sleep ----
        if (m === "sleep") {
          let total = 0;
          let latest: number | null = null;

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
              latest = ui.length ? ui[ui.length - 1].value : null;

              datasets.push({
                id: m,
                label: LABEL[m],
                unit: UNIT[m],
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
              logE("[HC] sleep 24h buckets fail", e);
              try {
                total = await hcReadTodaySleepTotalMinutes();
              } catch {
                // ignore; we still push an empty dataset so UI doesn't break
              }
              datasets.push({
                id: m,
                label: LABEL[m],
                unit: UNIT[m],
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
                label: LABEL[m],
                unit: UNIT[m],
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
              logE("[HC] sleep buckets fail", e);
              datasets.push({
                id: m,
                label: LABEL[m],
                unit: UNIT[m],
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

      // Only commit if still the latest run
      if (get().hcRunId === myRun) {
        const currentGranted = get().hcGrantedKeys;

        set({
          hcDatasets: datasets,
          hcTimezoneLabel: tz,
          healthAvailable: true,
          healthGranted: (currentGranted?.length ?? 0) > 0,
          hcLoading: false,
        });
      }

      log("[HC] refresh done datasets=", datasets.length);
    } catch (e) {
      logE("HC refresh failed", e);
      if (get().hcRunId === myRun) {
        set({
          hcError: String((e as any)?.message ?? e),
          hcLoading: false,
        });
      }
    }
  },


  hcSetWindow: async (w: WindowKey) => {
    const cur = get().hcWindow;
    if (cur === w) return;
    set({ hcWindow: w });

    if (Platform.OS === "android") {
      await get().hcRefresh();
    } else if (Platform.OS === "ios") {
      await get().refreshHealthKitData();
    }
  },

  hcOpenSettings: () => {
    if (Platform.OS === "android") {
      openHealthConnectSettings();
    }
  },

  /** iOS / HealthKit: init (no prompts) */

  initHealthKitIfNeeded: async () => {
    if (Platform.OS !== "ios") return;
    const { hkAvailable } = get();
    if (hkAvailable !== null) return;

    try {
      const snapshot = await hkGetAuthorizationSnapshot();
      set({
        hkAvailable: snapshot.available,
        hkStatus: snapshot.status,
        healthAvailable: snapshot.available,
      });
    } catch (e) {
      logE("HK init failed", e);
      set({
        hkAvailable: false,
        hkStatus: "unknown",
        healthAvailable: false,
      });
    }
  },

  /** iOS / HealthKit: windowed data for configured metrics (no prompts)
   *  Uses hcWindow as the selected range for both platforms.
   */
  refreshHealthKitData: async () => {
    if (Platform.OS !== "ios") return;

    const { hkAvailable, hkActiveMetrics, hcWindow, hkLoading } = get();

    if (!hkAvailable) {
      set({
        hkHasAnyData: false,
        hkActiveMetrics: [],
        hkDatasets: [],
        healthGranted: false,
      });
      return;
    }

    // Prevent overlapping dataset builds; UI "Refresh" or multiple callers
    // will just skip if a refresh is already in flight.
    if (hkLoading) {
      log("HK refreshHealthKitData skipped; already loading");
      return;
    }

    const windowKey: WindowKey = hcWindow ?? "7d";

    set({ hkLoading: true, hkError: undefined });

    try {
      const datasets: Dataset[] = [];

      // Prefer inferred active metrics; otherwise fall back to full configured order.
      const targetMetrics: MetricKey[] =
        hkActiveMetrics && hkActiveMetrics.length > 0
          ? hkActiveMetrics
          : METRIC_ORDER;

      for (const m of targetMetrics) {
        // Quantitative movement metrics
        if (
          m === "steps" ||
          m === "floors" ||
          m === "distance" ||
          m === "activeCalories"
        ) {
          let buckets: HKBucket[] = [];

          switch (windowKey) {
            case "24h":
              buckets = await hkRead24hBuckets(m);
              break;
            case "7d":
              buckets = await hkRead7dBuckets(m);
              break;
            case "30d":
              buckets = await hkRead30dBuckets(m);
              break;
            case "90d":
              buckets = await hkRead90dBuckets(m);
              break;
          }

          const uiBuckets: DatasetBucket[] = (buckets || []).map((b) => ({
            start: b.start,
            end: b.end,
            value: Number(b.value || 0),
          }));

          const total = uiBuckets.reduce(
            (sum, b) => sum + (Number(b.value) || 0),
            0
          );

          datasets.push({
            id: m,
            label: LABEL[m],
            unit: UNIT[m],
            buckets: uiBuckets,
            total,
            freshnessISO: new Date().toISOString(),
            trend:
              windowKey === "7d" ? compute7dTrendFor(m, uiBuckets) : undefined,
          });

          continue;
        }

        // Heart rate
        if (m === "heartRate") {
          if (windowKey === "24h") {
            // 24h:
            // - latest = hkReadHeartRateLatest() over last 24h
            // - buckets = hourly averages via hkReadHeartRateHourly24()
            const latest = await hkReadHeartRateLatest();
            const numeric = typeof latest === "number" ? Number(latest) : NaN;
            const hasLatest = Number.isFinite(numeric) && numeric > 0;

            const hrBuckets: HKBucket[] = await hkReadHeartRateHourly24();
            const uiBuckets: DatasetBucket[] = (hrBuckets || []).map((b) => ({
              start: b.start,
              end: b.end,
              value: Number(b.value || 0),
            }));

            const hoursWithData = uiBuckets.filter(
              (b) => Number(b.value) > 0
            ).length;

            datasets.push({
              id: m,
              label: LABEL[m],
              unit: UNIT[m], // bpm
              buckets: uiBuckets,
              // total is not meaningful for heart rate; use latest + buckets instead.
              total: 0,
              latest: hasLatest ? numeric : null,
              freshnessISO: new Date().toISOString(),
              meta: {
                ...(hoursWithData ? { hoursWithData } : {}),
                hoursTotal: uiBuckets.length,
              },
            });
          } else {
            // 7d/30d/90d:
            // - buckets = daily averages via hkReadHeartRateDailyBuckets(days)
            // - latest = window-level average bpm via hkReadHeartRateInWindow
            const days: 7 | 30 | 90 =
              windowKey === "7d" ? 7 : windowKey === "30d" ? 30 : 90;

            const buckets = await hkReadHeartRateDailyBuckets(days);

            const uiBuckets: DatasetBucket[] = (buckets || []).map((b) => ({
              start: b.start,
              end: b.end,
              value: Number(b.value || 0),
            }));

            let latest: number | null = null;

            if (uiBuckets.length > 0) {
              const fromUtc = uiBuckets[0].start;
              const lastBucket = uiBuckets[uiBuckets.length - 1];
              const toUtc = lastBucket.end ?? lastBucket.start;

              const stats = await hkReadHeartRateInWindow({
                fromUtc,
                toUtc,
              });

              const avg = typeof stats.avgBpm === "number" ? stats.avgBpm : NaN;
              if (Number.isFinite(avg) && avg > 0) {
                latest = Math.round(avg);
              }
            }

            datasets.push({
              id: m,
              label: LABEL[m],
              unit: UNIT[m],
              buckets: uiBuckets,
              // Keep total at 0 for HR; callers should use latest/window average instead.
              total: 0,
              latest,
              freshnessISO: new Date().toISOString(),
            });
          }

          continue;
        }

        // Sleep
        if (m === "sleep") {
          if (windowKey === "24h") {
            // Last 24h: hourly minutes distribution for the chart
            const buckets = await hkReadSleepHourly24();

            const uiBuckets: DatasetBucket[] = (buckets || []).map((b) => ({
              start: b.start,
              end: b.end,
              value: Number(b.value || 0), // minutes per hour
            }));

            const total = uiBuckets.reduce(
              (sum, b) => sum + (Number(b.value) || 0),
              0
            );

            const coverageCount = uiBuckets.filter(
              (b) => Number(b.value) > 0
            ).length;

            datasets.push({
              id: m,
              label: LABEL[m],
              unit: UNIT[m], // min
              buckets: uiBuckets,
              total,
              freshnessISO: new Date().toISOString(),
              meta: {
                coverageCount,
              },
            });
          } else {
            // 7d/30d/90d: daily minutes buckets
            const days: 7 | 30 | 90 =
              windowKey === "7d" ? 7 : windowKey === "30d" ? 30 : 90;

            const buckets = await hkReadSleepDailyBuckets(days);

            const uiBuckets: DatasetBucket[] = (buckets || []).map((b) => ({
              start: b.start,
              end: b.end,
              value: Number(b.value || 0), // minutes per day
            }));

            const total = uiBuckets.reduce(
              (sum, b) => sum + (Number(b.value) || 0),
              0
            );

            datasets.push({
              id: m,
              label: LABEL[m],
              unit: UNIT[m],
              buckets: uiBuckets,
              total,
              freshnessISO: new Date().toISOString(),
            });
          }

          continue;
        }

        // Future metrics / placeholders (weight, respiratory, etc.)
        datasets.push({
          id: m,
          label: LABEL[m],
          unit: UNIT[m],
          buckets: [],
          total: 0,
        });
      }

      // Detect if we have *any* data from resulting datasets
      const hasAny = datasets.some((d) => {
        const hasTotal = typeof d.total === "number" && d.total > 0;
        const hasLatest = typeof d.latest === "number" && d.latest > 0;
        const hasBuckets =
          Array.isArray(d.buckets) &&
          d.buckets.some((b) => Number(b.value) > 0);
        return hasTotal || hasLatest || hasBuckets;
      });

      // If hkActiveMetrics not yet set, infer them conservatively from datasets
      let nextActive = hkActiveMetrics;
      if (!nextActive || nextActive.length === 0) {
        nextActive = datasets
          .filter((d) => {
            const hasTotal = typeof d.total === "number" && d.total > 0;
            const hasLatest = typeof d.latest === "number" && d.latest > 0;
            const hasBuckets =
              Array.isArray(d.buckets) &&
              d.buckets.some((b) => Number(b.value) > 0);
            return hasTotal || hasLatest || hasBuckets;
          })
          .map((d) => d.id as MetricKey);
      }

      set({
        hkDatasets: datasets,
        hkHasAnyData: hasAny,
        hkActiveMetrics: nextActive,
        hkLoading: false,
        healthGranted: hasAny && (nextActive?.length ?? 0) > 0,
      });
    } catch (e) {
      logE("HK refreshHealthKitData failed", e);
      set({
        hkError: String((e as any)?.message ?? e),
        hkLoading: false,
      });
    }
  },

  /** iOS / HealthKit: header permission button */
  // old code that caused issues with multiple rapid taps
  // handleHealthPermissionPress: async () => {
  //   if (Platform.OS !== "ios") return;

  //   set({ hkError: undefined });

  //   // Ensure we have a snapshot before deciding.
  //   await get().initHealthKitIfNeeded();
  //   const { hkAvailable, hkStatus: statusBefore } = get();
  //   if (!hkAvailable) {
  //     set({
  //       hkAvailable: false,
  //       healthAvailable: false,
  //       healthGranted: false,
  //       hkActiveMetrics: [],
  //       hkHasAnyData: false,
  //       hkDatasets: [],
  //     });
  //     return;
  //   }

  //   // If the system already reports "unnecessary" BEFORE this tap,
  //   // treat this as "manage in Settings" and let the header coach handle UX.
  //   if (statusBefore === "unnecessary") {
  //     // await hkOpenAppSettings();
  //     return;
  //   }

  //   // For "shouldRequest" and "unknown": attempt a READ-ONLY authorization request.
  //   try {
  //     set({ hkLoading: true });
  //     await hkRequestReadAuthorization();
  //   } catch (e) {
  //     logE("HK requestReadAuthorization failed", e);
  //     set({
  //       hkError: String((e as any)?.message ?? e),
  //       hkLoading: false,
  //     });
  //     return;
  //   }

  //   // After the attempt:
  //   // - Refresh snapshot
  //   // - Detect active metrics based on actual readable data
  //   // - Hydrate datasets for those metrics
  //   try {
  //     const snapshot = await hkGetAuthorizationSnapshot();

  //     set({
  //       hkAvailable: snapshot.available,
  //       hkStatus: snapshot.status,
  //       healthAvailable: snapshot.available,
  //     });

  //     if (!snapshot.available) {
  //       set({
  //         hkActiveMetrics: [],
  //         hkHasAnyData: false,
  //         hkDatasets: [],
  //         healthGranted: false,
  //       });
  //     } else {
  //       const active = await hkDetectActiveReadMetrics(REQUESTED_METRIC_KEYS);
  //       const hasAny = active.length > 0;

  //       set({
  //         hkActiveMetrics: active,
  //         hkHasAnyData: hasAny,
  //         healthGranted: hasAny,
  //       });

  //       await get().refreshHealthKitData();
  //     }
  //   } catch (e) {
  //     logE("HK post-request snapshot/detect failed", e);
  //     set({
  //       hkError: String((e as any)?.message ?? e),
  //     });
  //   } finally {
  //     set({ hkLoading: false });
  //   }
  // },

  handleHealthPermissionPress: async () => {
    if (Platform.OS !== "ios") return;

    const { hkBusy } = get();
    if (hkBusy) {
      log("HK handleHealthPermissionPress skipped; busy");
      return;
    }

    set({ hkBusy: true, hkError: undefined });

    try {
      // Ensure we have a snapshot before deciding.
      await get().initHealthKitIfNeeded();
      const { hkAvailable, hkStatus: statusBefore } = get();
      if (!hkAvailable) {
        set({
          hkAvailable: false,
          healthAvailable: false,
          healthGranted: false,
          hkActiveMetrics: [],
          hkHasAnyData: false,
          hkDatasets: [],
        });
        return;
      }

      // If the system already reports "unnecessary" BEFORE this tap,
      // treat this as "manage in Settings" and let the header coach handle UX.
      if (statusBefore === "unnecessary") {
        return;
      }

      // For "shouldRequest" and "unknown": attempt a READ-ONLY authorization request.
      try {
        await hkRequestReadAuthorization();
      } catch (e) {
        logE("HK requestReadAuthorization failed", e);
        set({
          hkError: String((e as any)?.message ?? e),
        });
        return;
      }

      // After the attempt:
      // - Refresh snapshot
      // - Detect active metrics based on actual readable data
      // - Hydrate datasets for those metrics
      try {
        const snapshot = await hkGetAuthorizationSnapshot();

        set({
          hkAvailable: snapshot.available,
          hkStatus: snapshot.status,
          healthAvailable: snapshot.available,
        });

        if (!snapshot.available) {
          set({
            hkActiveMetrics: [],
            hkHasAnyData: false,
            hkDatasets: [],
            healthGranted: false,
          });
          return;
        }

        const active = await hkDetectActiveReadMetrics(REQUESTED_METRIC_KEYS);
        const hasAny = active.length > 0;

        set({
          hkActiveMetrics: active,
          hkHasAnyData: hasAny,
          healthGranted: hasAny,
        });

        await get().refreshHealthKitData();
      } catch (e) {
        logE("HK post-request snapshot/detect failed", e);
        set({
          hkError: String((e as any)?.message ?? e),
        });
      }
    } finally {
      set({ hkBusy: false });
    }
  },

  /** iOS / HealthKit: called when returning from Settings */
  // old code that caused issues with multiple rapid taps
  // handleHealthSettingsReturn: async () => {
  //   if (Platform.OS !== "ios") return;

  //   try {
  //     const snapshot = await hkGetAuthorizationSnapshot();

  //     // Always trust the latest snapshot for availability + status
  //     set({
  //       hkAvailable: snapshot.available,
  //       hkStatus: snapshot.status,
  //       healthAvailable: snapshot.available,
  //     });

  //     if (!snapshot.available) {
  //       // If HealthKit is not available, clear any local assumptions.
  //       set({
  //         hkActiveMetrics: [],
  //         hkHasAnyData: false,
  //         hkDatasets: [],
  //         healthGranted: false,
  //       });
  //       return;
  //     }

  //     // Re-detect active metrics based on data behavior and refresh datasets.
  //     const active = await hkDetectActiveReadMetrics(REQUESTED_METRIC_KEYS);
  //     const hasAny = active.length > 0;

  //     set({
  //       hkActiveMetrics: active,
  //       hkHasAnyData: hasAny,
  //       healthGranted: hasAny,
  //     });

  //     await get().refreshHealthKitData();
  //   } catch (e) {
  //     logE("HK handleHealthSettingsReturn failed", e);
  //     set({
  //       hkError: String((e as any)?.message ?? e),
  //     });
  //   }
  // },

  handleHealthSettingsReturn: async () => {
    if (Platform.OS !== "ios") return;

    const { hkBusy } = get();
    if (hkBusy) {
      log("HK handleHealthSettingsReturn skipped; busy");
      return;
    }

    set({ hkBusy: true });

    try {
      const snapshot = await hkGetAuthorizationSnapshot();

      // Always trust the latest snapshot for availability + status
      set({
        hkAvailable: snapshot.available,
        hkStatus: snapshot.status,
        healthAvailable: snapshot.available,
      });

      if (!snapshot.available) {
        // If HealthKit is not available, clear any local assumptions.
        set({
          hkActiveMetrics: [],
          hkHasAnyData: false,
          hkDatasets: [],
          healthGranted: false,
        });
        return;
      }

      // Re-detect active metrics based on data behavior and refresh datasets.
      const active = await hkDetectActiveReadMetrics(REQUESTED_METRIC_KEYS);
      const hasAny = active.length > 0;

      set({
        hkActiveMetrics: active,
        hkHasAnyData: hasAny,
        healthGranted: hasAny,
      });

      await get().refreshHealthKitData();
    } catch (e) {
      logE("HK handleHealthSettingsReturn failed", e);
      set({
        hkError: String((e as any)?.message ?? e),
      });
    } finally {
      set({ hkBusy: false });
    }
  },

  /** Derived helper for UI/Header */

  isHealthKitConnected: () => {
    const { hkAvailable, hkActiveMetrics, hkHasAnyData } = get();
    const hasActive = (hkActiveMetrics?.length ?? 0) > 0;
    return !!hkAvailable && (hasActive || !!hkHasAnyData);
  },
}));
