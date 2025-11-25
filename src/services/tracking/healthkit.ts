// src/services/tracking/healthkit.ts

import type {
  IntervalComponents,
  QuantityTypeIdentifier,
  QueryStatisticsResponse,
  SampleTypeIdentifier,
  StatisticsOptions,
  StatisticsQueryOptions,
} from "@kingstinct/react-native-healthkit";

import { Linking, Platform } from "react-native";
import { makeDailyEdges, makeHourlyEdges24 } from "./bucketing";
/**
 * HealthKit wiring for iOS (Web3Health).
 *
 * Primary responsibilities:
 * - hkIsAvailable()
 * - hkGetReadRequestStatus()
 * - hkRequestReadAuthorization()
 * - hkOpenAppSettings()
 * - hkGetAuthorizationSnapshot()
 * - hkRead24hBuckets()
 * - hkRead7dBuckets() / hkRead30dBuckets() / hkRead90dBuckets()
 * - hkReadHeartRateLatest()
 * - hkReadHeartRateInWindow()
 * - hkReadHeartRateDailyBuckets()
 * - hkReadSleep7dBuckets()
 * - hkReadSleepDailyBuckets()
 * - hkReadSleepMinutesInWindow()
 * - hkHasDataInRange()
 * - hkReadSumInWindow()
 *
 * Below that, LEGACY section:
 * - Old names as no-ops / thin wrappers so imports don’t crash.
 * - Do NOT use legacy APIs for new flows.
 */

/** ───────────────────────── Logger (with in-memory buffer) ───────────────────────── */

const TAG = "[HK]";
const LOG_CAP = 300;
const HK_LOGS: Array<{ ts: string; msg: string }> = [];

function pushLog(msg: string) {
  HK_LOGS.push({ ts: new Date().toISOString(), msg });
  if (HK_LOGS.length > LOG_CAP) HK_LOGS.shift();
}

function log(...args: any[]) {
  try {
    // Always keep buffer; gate console noise in production.
    const line = args
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .join(" ");
    pushLog(line);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(TAG, ...args);
    }
  } catch {
    // best-effort only
  }
}

function logError(label: string, error: unknown) {
  const msg = (error as any)?.message ?? String(error);
  log(`${label}: ${msg}`);
}

/** Public log helpers (used by debug screens) */

export function getHKLogs() {
  return [...HK_LOGS];
}

export function clearHKLogs() {
  HK_LOGS.length = 0;
}

/** ───────────────────────── Shared app types ───────────────────────── */

export type MetricKey =
  | "steps"
  | "floors"
  | "distance"
  | "activeCalories"
  | "heartRate"
  // | "weight"
  | "sleep";
// | "respiratoryRate";

export type Bucket = {
  start: string;
  end: string;
  value: number;
};

export type Window = { fromUtc: string; toUtc: string };
export type SeriesPoint = { ts: string; value: number };

export type TimezoneInfo = {
  iana?: string;
  offsetMinutes: number; // minutes east of UTC
  offsetStr: string; // e.g. "UTC+05:30"
  label: string; // e.g. "America/New_York (UTC-04:00)"
};

export function getLocalTimezoneInfo(d: Date = new Date()): TimezoneInfo {
  const iana = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const offsetStr = `UTC${sign}${hh}:${mm}`;
  const label = `${iana ?? "Local"} (${offsetStr})`;
  log("[TZ]", label);
  return { iana, offsetMinutes, offsetStr, label };
}

// ───────────────────────── HK types ─────────────────────────

export const HK_TYPES: Record<MetricKey, SampleTypeIdentifier> = {
  steps: "HKQuantityTypeIdentifierStepCount",
  floors: "HKQuantityTypeIdentifierFlightsClimbed",
  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  activeCalories: "HKQuantityTypeIdentifierActiveEnergyBurned",
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  // weight: "HKQuantityTypeIdentifierBodyMass",
  sleep: "HKCategoryTypeIdentifierSleepAnalysis",
  // respiratoryRate: "HKQuantityTypeIdentifierRespiratoryRate",
};

const READ_TYPES: readonly SampleTypeIdentifier[] = [
  HK_TYPES.steps,
  HK_TYPES.floors,
  HK_TYPES.distance,
  HK_TYPES.activeCalories,
  HK_TYPES.heartRate,
  // HK_TYPES.weight,
  HK_TYPES.sleep,
  // HK_TYPES.respiratoryRate,
] as const;

type QuantMetricKey = Extract<
  MetricKey,
  "steps" | "floors" | "distance" | "activeCalories"
>;

// Quantity metric → HK stats mode.
// cumulativeSum for additive metrics, discreteAverage for HR-style.
// (Matches your QTY_TYPE_MAP idea; weight/resp not wired here.)
const QTY_TYPE_MAP: Record<
  QuantMetricKey | "heartRate",
  { typeId: QuantityTypeIdentifier; stats: readonly StatisticsOptions[] }
> = {
  steps: {
    typeId: HK_TYPES.steps as QuantityTypeIdentifier,
    stats: ["cumulativeSum"],
  },
  floors: {
    typeId: HK_TYPES.floors as QuantityTypeIdentifier,
    stats: ["cumulativeSum"],
  },
  distance: {
    typeId: HK_TYPES.distance as QuantityTypeIdentifier,
    stats: ["cumulativeSum"],
  },
  activeCalories: {
    typeId: HK_TYPES.activeCalories as QuantityTypeIdentifier,
    stats: ["cumulativeSum"],
  },
  heartRate: {
    typeId: HK_TYPES.heartRate as QuantityTypeIdentifier,
    stats: ["discreteAverage"],
  },
};

/** ───────────────────────── HK module loader ───────────────────────── */

type HKModule = typeof import("@kingstinct/react-native-healthkit");

let hkModule: HKModule | null = null;

async function getHK(): Promise<HKModule> {
  if (Platform.OS !== "ios") {
    throw new Error("HealthKit is only available on iOS");
  }
  if (!hkModule) {
    // Dynamic import per library docs / examples.
    hkModule = await import("@kingstinct/react-native-healthkit");
  }
  return hkModule;
}

/** ───────────────────────── Helpers: UTC dates for simple bucketing ───────────────────────── */

function daysAgoUtc(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function addUtcDays(d: Date, n: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n)
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function parseIso(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ───────────────────────── Low-level query normalizers ─────────────────────────
 *
 * The library’s README for anchors notes that "most queries now return an object
 * containing samples", while older shapes could be bare arrays. We support both.
 * :contentReference[oaicite:2]{index=2}
 */

type HKQuantitySample = {
  startDate: Date;
  endDate: Date;
  quantity?: number;
  value?: number;
};

type HKCategorySample = {
  startDate: Date;
  endDate: Date;
  value?: number;
};

async function queryQuantitySamplesNormalized(
  id: QuantityTypeIdentifier,
  options?: {
    from?: Date;
    to?: Date;
    limit?: number;
    ascending?: boolean;
  }
): Promise<HKQuantitySample[]> {
  try {
    const HK = await getHK();
    const fn = (HK as any).queryQuantitySamples;
    if (typeof fn !== "function") {
      log("[Q] queryQuantitySamples not available");
      return [];
    }
    const res = await fn(id, options);

    if (!res) return [];
    if (Array.isArray(res)) return res as HKQuantitySample[];
    if (Array.isArray(res.samples)) return res.samples as HKQuantitySample[];

    log("[Q] Unexpected queryQuantitySamples result shape");
    return [];
  } catch (e) {
    logError("[Q] queryQuantitySamplesNormalized failed", e);
    return [];
  }
}

async function queryCategorySamplesNormalized(
  id: SampleTypeIdentifier,
  options?: {
    from?: Date;
    to?: Date;
    limit?: number;
    ascending?: boolean;
  }
): Promise<HKCategorySample[]> {
  try {
    const HK = await getHK();
    const queryCategory = (HK as any).queryCategorySamples;
    const getSleepSamples = (HK as any).getSleepSamples;

    let res: any;

    if (typeof queryCategory === "function") {
      res = await queryCategory(id, options);
    } else if (typeof getSleepSamples === "function") {
      // For older versions that expose getSleepSamples for sleep analysis.
      res = await getSleepSamples(options);
    } else {
      log("[C] no category query API available");
      return [];
    }

    if (!res) return [];
    if (Array.isArray(res)) return res as HKCategorySample[];
    if (Array.isArray(res.samples)) return res.samples as HKCategorySample[];

    log("[C] Unexpected category samples result shape");
    return [];
  } catch (e) {
    logError("[C] queryCategorySamplesNormalized failed", e);
    return [];
  }
}
// ───────────────────────── Low-level statistics query wrappers ─────────────────────────
async function hkQueryStatisticsForQuantity(
  id: QuantityTypeIdentifier,
  statistics: readonly StatisticsOptions[],
  options?: StatisticsQueryOptions
): Promise<QueryStatisticsResponse | null> {
  try {
    const HK = await getHK();
    const fn = (HK as any).queryStatisticsForQuantity as
      | ((
          identifier: QuantityTypeIdentifier,
          stats: readonly StatisticsOptions[],
          opts?: StatisticsQueryOptions
        ) => Promise<QueryStatisticsResponse>)
      | undefined;

    if (typeof fn !== "function") {
      log("[Q][Stats] queryStatisticsForQuantity not available");
      return null;
    }

    // Pass filter through in the library's expected JS shape.
    // If caller provided ISO/number, normalize to Date objects.
    let opts = options;
    if (options?.filter) {
      const f: any = options.filter;
      const start =
        f.startDate instanceof Date
          ? f.startDate
          : f.startDate
            ? new Date(f.startDate)
            : undefined;
      const end =
        f.endDate instanceof Date
          ? f.endDate
          : f.endDate
            ? new Date(f.endDate)
            : undefined;

      opts = {
        ...options,
        filter: {
          ...f,
          startDate: start,
          endDate: end,
        },
      } as any;
    }

    const res = await fn(id, statistics, {
      ...(id === "HKQuantityTypeIdentifierDistanceWalkingRunning"
        ? { unit: "m" }
        : {}),

      ...opts,
    });

    return res ?? null;
  } catch (e) {
    logError("[Q][Stats] hkQueryStatisticsForQuantity failed", e);
    return null;
  }
}

async function hkQueryStatisticsCollectionForQuantity(
  id: QuantityTypeIdentifier,
  statistics: readonly StatisticsOptions[],
  anchorDate: Date,
  interval: IntervalComponents,
  options?: StatisticsQueryOptions
): Promise<QueryStatisticsResponse[]> {
  try {
    const HK = await getHK();
    const fn = (HK as any).queryStatisticsCollectionForQuantity as
      | ((
          identifier: QuantityTypeIdentifier,
          stats: readonly StatisticsOptions[],
          anchorIso: string,
          intervalComponents: IntervalComponents,
          opts?: StatisticsQueryOptions
        ) => Promise<QueryStatisticsResponse[]>)
      | undefined;

    if (typeof fn !== "function") {
      log("[Q][Stats] queryStatisticsCollectionForQuantity not available");
      return [];
    }

    // Pass filter through in the library's expected JS shape.
    // If caller provided ISO/number, normalize to Date objects.
    let opts = options;
    if (options?.filter) {
      const f: any = options.filter;
      const start =
        f.startDate instanceof Date
          ? f.startDate
          : f.startDate
            ? new Date(f.startDate)
            : undefined;
      const end =
        f.endDate instanceof Date
          ? f.endDate
          : f.endDate
            ? new Date(f.endDate)
            : undefined;

      opts = {
        ...options,
        filter: {
          ...f,
          startDate: start,
          endDate: end,
        },
      } as any;
    }

    const anchorIso = anchorDate.toISOString().replace(/\.\d{3}Z$/, "Z");

    const res = await fn(id, statistics, anchorIso, interval, {
      ...(id === "HKQuantityTypeIdentifierDistanceWalkingRunning"
        ? { unit: "m" }
        : {}),

      ...opts,
    });

    return Array.isArray(res) ? res : [];
  } catch (e) {
    logError("[Q][Stats] hkQueryStatisticsCollectionForQuantity failed", e);
    return [];
  }
}

/** ───────────────────────── Generic bucketing helpers ───────────────────────── */

function makeFixedBuckets(
  from: Date,
  to: Date,
  bucketSizeMs: number
): Bucket[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!(toMs > fromMs) || bucketSizeMs <= 0) return [];

  const bucketCount = Math.ceil((toMs - fromMs) / bucketSizeMs);
  const buckets: Bucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const startMs = fromMs + i * bucketSizeMs;
    const endMs = clamp(startMs + bucketSizeMs, fromMs, toMs);
    buckets.push({
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      value: 0,
    });
  }

  return buckets;
}

// function accumulateSleepIntoBucketsByMinutes(
//   samples: HKCategorySample[],
//   buckets: Bucket[]
// ) {
//   if (!samples?.length || !buckets.length) return;

//   const rangeStart = new Date(buckets[0].start).getTime();
//   const rangeEnd = new Date(buckets[buckets.length - 1].end).getTime();

//   for (const s of samples) {
//     let segStart = s.startDate?.getTime();
//     let segEnd = s.endDate?.getTime();
//     if (!segStart || !segEnd || segEnd <= segStart) continue;

//     if (segEnd <= rangeStart || segStart >= rangeEnd) continue;
//     segStart = Math.max(segStart, rangeStart);
//     segEnd = Math.min(segEnd, rangeEnd);

//     for (const b of buckets) {
//       const bs = new Date(b.start).getTime();
//       const be = new Date(b.end).getTime();
//       const is = Math.max(segStart, bs);
//       const ie = Math.min(segEnd, be);
//       if (ie > is) {
//         const minutes = (ie - is) / (1000 * 60);
//         b.value += minutes;
//       }
//     }
//   }
// }
function accumulateSleepIntoBucketsByMinutes(
  samples: HKCategorySample[],
  buckets: Bucket[]
) {
  if (!samples?.length || !buckets.length) return;

  // Buckets assumed sorted ascending by start time.
  const rangeStart = new Date(buckets[0].start).getTime();
  const rangeEnd = new Date(buckets[buckets.length - 1].end).getTime();

  let bi = 0;

  for (const s of samples) {
    const rawStart = s.startDate?.getTime();
    const rawEnd = s.endDate?.getTime();
    if (!rawStart || !rawEnd || rawEnd <= rawStart) continue;

    // Skip segments completely outside bucket range.
    if (rawEnd <= rangeStart || rawStart >= rangeEnd) continue;

    // Clamp segment to bucket range.
    let segStart = Math.max(rawStart, rangeStart);
    let segEnd = Math.min(rawEnd, rangeEnd);
    if (segEnd <= segStart) continue;

    // Advance bucket pointer to first bucket that could overlap.
    while (bi < buckets.length) {
      const be = new Date(buckets[bi].end).getTime();
      if (be > segStart) break;
      bi++;
    }

    // Walk only overlapping buckets.
    let j = bi;
    while (j < buckets.length) {
      const bs = new Date(buckets[j].start).getTime();
      const be = new Date(buckets[j].end).getTime();

      if (bs >= segEnd) break;

      const overlapMs = Math.min(segEnd, be) - Math.max(segStart, bs);
      if (overlapMs > 0) {
        buckets[j].value += overlapMs / (1000 * 60);
      }
      j++;
    }
  }
}

/** ───────────────────────── NEW: Availability ─────────────────────────
 * Uses isHealthDataAvailable() → HKHealthStore.isHealthDataAvailable().
 */

export async function hkIsAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const HK = await getHK();
    const fn = (HK as any).isHealthDataAvailable as (() => boolean) | undefined;
    const available = !!fn?.();
    log("isHealthDataAvailable →", available);
    return available;
  } catch (e) {
    logError("hkIsAvailable failed", e);
    return false;
  }
}

/** ───────────────────────── NEW: Request status for our read set ─────────────────────────
 *
 * Uses getRequestStatusForAuthorization(readTypes, writeTypes?)
 * where available (Apple: HKAuthorizationRequestStatus).
 *
 * 0 / "unknown"      → unknown
 * 1 / "shouldRequest"→ shouldRequest
 * 2 / "unnecessary"  → unnecessary (no sheet; already determined)
 */

export type HKReadRequestStatus = "unknown" | "shouldRequest" | "unnecessary";

export async function hkGetReadRequestStatus(): Promise<HKReadRequestStatus> {
  if (Platform.OS !== "ios") return "unknown";

  const available = await hkIsAvailable();
  if (!available) return "unknown";

  try {
    const HK = await getHK();
    const fn = (HK as any).getRequestStatusForAuthorization as
      | ((
          writeTypes: readonly SampleTypeIdentifier[],
          readTypes?: readonly SampleTypeIdentifier[]
        ) => Promise<number | string>)
      | ((opts: {
          writeTypes?: readonly SampleTypeIdentifier[];
          readTypes?: readonly SampleTypeIdentifier[];
        }) => Promise<number | string>)
      | undefined;

    if (!fn) {
      log("[HK] [AUTH] getRequestStatusForAuthorization not available");
      return "unknown";
    }

    const readTypes = READ_TYPES as readonly SampleTypeIdentifier[];
    const emptyWrite: readonly SampleTypeIdentifier[] = [];

    log(
      "[HK] [AUTH] hkGetReadRequestStatus: intending READ-ONLY",
      "readTypes=",
      readTypes,
      "fn.length=",
      fn.length
    );

    let raw: number | string;

    // If API looks like options-object (length <= 1), send explicit readTypes/writeTypes.
    if (fn.length <= 1) {
      raw = await (fn as any)({
        writeTypes: emptyWrite,
        readTypes,
      });
      log(
        "[HK] [AUTH] getRequestStatusForAuthorization({ writeTypes: [], readTypes }) →",
        raw
      );
    } else {
      // Positional form: treat first param as writeTypes, second as readTypes.
      raw = await (fn as any)(emptyWrite, readTypes);
      log("[HK] [AUTH] getRequestStatusForAuthorization([], readTypes) →", raw);
    }

    if (raw === 1 || raw === "shouldRequest") return "shouldRequest";
    if (raw === 2 || raw === "unnecessary") return "unnecessary";
    if (raw === 0 || raw === "unknown") return "unknown";

    // Defensive fallback
    return "unknown";
  } catch (e) {
    logError("hkGetReadRequestStatus failed", e);
    return "unknown";
  }
}

/** ───────────────────────── Request read authorization ─────────────────────────
 *
 * Uses requestAuthorization(readTypes, writeTypes?) as documented.
 * IMPORTANT:
 * - We ONLY request READ permissions for our READ_TYPES set.
 * - We NEVER request WRITE permissions here.
 * - Different library versions support:
 *     - requestAuthorization(readTypes, writeTypes?)
 *     - requestAuthorization({ read: [...], write: [...] })
 *   We detect the signature at runtime and always pass an empty write set.
 */

export async function hkRequestReadAuthorization(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  const available = await hkIsAvailable();
  if (!available) {
    log("[AUTH] hkRequestReadAuthorization: HealthKit not available");
    return false;
  }

  try {
    const HK = await getHK();
    const requestAuthorization = (HK as any).requestAuthorization as
      | ((opts: {
          toRead: readonly SampleTypeIdentifier[];
          toWrite?: readonly SampleTypeIdentifier[];
        }) => Promise<boolean>)
      | undefined;

    if (typeof requestAuthorization !== "function") {
      log("[AUTH] requestAuthorization not available on HK module");
      return false;
    }

    const readTypes = READ_TYPES as readonly SampleTypeIdentifier[];

    log("[AUTH] requestAuthorization({ toRead }) readTypes=", readTypes);
    const ok = !!(await requestAuthorization({ toRead: readTypes }));
    log("[AUTH] requestAuthorization →", ok);
    return ok;
  } catch (e) {
    logError("hkRequestReadAuthorization failed", e);
    return false;
  }
}

/** ───────────────────────── NEW: Open app settings ─────────────────────────
 * Uses Linking.openSettings() which opens the app's settings page.
 */

export async function hkOpenAppSettings(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    await Linking.openSettings();
    log("[AUTH] Opened app settings");
  } catch (e) {
    logError("hkOpenAppSettings failed", e);
  }
}

/** Legacy alias for callers still using old name. */
export async function openHealthSettings(): Promise<void> {
  log("[LEGACY] openHealthSettings → hkOpenAppSettings()");
  return hkOpenAppSettings();
}

/** ─────────────────────────  Snapshot helper ─────────────────────────
 * Semantics:
 * - available:
 *     true  → HealthKit is supported on this device.
 *     false → HealthKit not supported.
 * - status:
 *     "shouldRequest" → System is willing to show an authorization sheet
 *                       for our READ_TYPES on next request.
 *     "unnecessary"  → System reports that the request for this read set
 *                      is already determined (may be granted or denied);
 *                      it will not show a new sheet for this configuration.
 *     "unknown"      → Fallback / inconclusive; caller may attempt once,
 *                      then rely on data / future snapshots.
 *
 * IMPORTANT:
 * This does NOT tell you "granted vs denied" definitively.
 * Callers must infer connectivity from actual data reads.
 */

export type HKAuthorizationSnapshot = {
  available: boolean;
  status: HKReadRequestStatus;
};

export async function hkGetAuthorizationSnapshot(): Promise<HKAuthorizationSnapshot> {
  const available = await hkIsAvailable();
  if (!available) {
    return { available: false, status: "unknown" };
  }
  const status = await hkGetReadRequestStatus();
  return { available: true, status };
}

/** ───────────────────────── Core windowed readers ─────────────────────────
 *
 * These are the source of truth for Data Assets & trends.
 * All are read-only and do NOT trigger prompts.
 */

/** 24h buckets (hourly) for quantity metrics */
// export async function hkRead24hBuckets(
//   metric: QuantMetricKey
// ): Promise<Bucket[]> {
//   if (Platform.OS !== "ios") return [];

//   const t0 = Date.now();
//   try {
//     const typeId = HK_TYPES[metric] as QuantityTypeIdentifier;
//     const edges = makeHourlyEdges24(); // local-time 24h buckets
//     const samplesRaw = await queryQuantitySamplesNormalized(typeId, {
//       from: edges[0].start,
//       to: edges[edges.length - 1].end,
//       limit: 0,
//       ascending: true,
//     });

//     const samples = await normalizeQuantitySamplesToMetersIfDistance(
//       metric,
//       samplesRaw
//     );

//     const buckets: Bucket[] = edges.map((r) => ({
//       start: r.start.toISOString(),
//       end: r.end.toISOString(),
//       value: 0,
//     }));

//     accumulateQuantityIntoBuckets(samples, buckets);
//     const result = buckets.map((b) => ({
//       ...b,
//       value: Math.max(0, Math.round(b.value)),
//     }));
//     log(
//       "[TIME] hkRead24hBuckets",
//       metric,
//       "→",
//       result.length,
//       "buckets in",
//       Date.now() - t0,
//       "ms"
//     );
//     return result;
//   } catch (e) {
//     logError(`hkRead24hBuckets(${metric}) failed`, e);
//     log(
//       "[TIME] hkRead24hBuckets",
//       metric,
//       "errored after",
//       Date.now() - t0,
//       "ms"
//     );
//     return [];
//   }
// }

export async function hkRead24hBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  if (Platform.OS !== "ios") return [];

  const t0 = Date.now();
  try {
    const edges = makeHourlyEdges24(); // local-time 24h buckets
    if (!edges.length) return [];

    const { typeId, stats } = QTY_TYPE_MAP[metric];
    const anchorDate = edges[0].start; // align to first bucket boundary
    const interval: IntervalComponents = { hour: 1 };

    const from = edges[0].start;
    const to = new Date();

    const statsRes = await hkQueryStatisticsCollectionForQuantity(
      typeId,
      stats,
      anchorDate,
      interval,
      {
        filter: {
          startDate: from,
          endDate: to,
        },
      }
    );

    // Key helper to match edges to stats intervals safely.
    const toKey = (d: any) => {
      const iso =
        d instanceof Date
          ? d.toISOString()
          : d
            ? new Date(d).toISOString()
            : "";
      return iso.replace(/\.\d{3}Z$/, "Z");
    };

    // Build map: intervalStartKey -> raw quantity
    const byStart = new Map<string, number>();
    for (const r of statsRes as any[]) {
      const k = toKey(r?.startDate ?? r?.from);
      const q =
        Number(r?.sumQuantity?.quantity) ||
        Number(r?.averageQuantity?.quantity) ||
        0;
      byStart.set(k, Number.isFinite(q) ? q : 0);
    }

    const buckets: Bucket[] = edges.map((e) => {
      const k = toKey(e.start);
      let v = byStart.get(k) ?? 0;

      return {
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        value: Math.max(0, Math.round(v)),
      };
    });

    log(
      "[TIME] hkRead24hBuckets(v4)",
      metric,
      "→",
      buckets.length,
      "buckets in",
      Date.now() - t0,
      "ms"
    );
    return buckets;
  } catch (e) {
    logError(`hkRead24hBuckets(${metric}) failed`, e);
    log(
      "[TIME] hkRead24hBuckets(v4)",
      metric,
      "errored after",
      Date.now() - t0,
      "ms"
    );
    return [];
  }
}

/** Generic daily buckets for quantity metrics.
 * - days local-day buckets from (today - days + 1) through today.
 * - Uses makeDailyEdges(...) so semantics match across platforms.
 */

// async function hkReadDailyBuckets(
//   metric: QuantMetricKey,
//   days: number
// ): Promise<Bucket[]> {
//   if (Platform.OS !== "ios") return [];

//   const t0 = Date.now();
//   try {
//     const typeId = HK_TYPES[metric] as QuantityTypeIdentifier;
//     const edges = makeDailyEdges(days); // local-day buckets, includes today
//     const from = edges[0].start;
//     const to = edges[edges.length - 1].end;

//     const samplesRaw = await queryQuantitySamplesNormalized(typeId, {
//       from,
//       to,
//       limit: 0,
//       ascending: true,
//     });

//     const samples = await normalizeQuantitySamplesToMetersIfDistance(
//       metric,
//       samplesRaw
//     );

//     const buckets: Bucket[] = edges.map((r) => ({
//       start: r.start.toISOString(),
//       end: r.end.toISOString(),
//       value: 0,
//     }));

//     accumulateQuantityIntoBuckets(samples, buckets);
//     const result = buckets.map((b) => ({
//       ...b,
//       value: Math.max(0, Math.round(b.value)),
//     }));
//     log(
//       "[TIME] hkReadDailyBuckets",
//       metric,
//       "days=",
//       days,
//       "→",
//       result.length,
//       "buckets in",
//       Date.now() - t0,
//       "ms"
//     );
//     return result;
//   } catch (e) {
//     logError(`hkReadDailyBuckets(${metric}, ${days}) failed`, e);
//     log(
//       "[TIME] hkReadDailyBuckets",
//       metric,
//       "days=",
//       days,
//       "errored after",
//       Date.now() - t0,
//       "ms"
//     );
//     return [];
//   }
// }

async function hkReadDailyBuckets(
  metric: QuantMetricKey,
  days: number
): Promise<Bucket[]> {
  if (Platform.OS !== "ios") return [];

  const t0 = Date.now();
  try {
    const edges = makeDailyEdges(days); // local-day buckets incl. today
    if (!edges.length) return [];

    const { typeId, stats } = QTY_TYPE_MAP[metric];
    const anchorDate = edges[0].start;
    const interval: IntervalComponents = { day: 1 };

    const from = edges[0].start;
    const to = edges[edges.length - 1].end;

    const statsRes = await hkQueryStatisticsCollectionForQuantity(
      typeId,
      stats,
      anchorDate,
      interval,
      {
        filter: {
          startDate: from,
          endDate: to,
        },
      }
    );

    const toKey = (d: any) => {
      const iso =
        d instanceof Date
          ? d.toISOString()
          : d
            ? new Date(d).toISOString()
            : "";
      return iso.replace(/\.\d{3}Z$/, "Z");
    };

    const byStart = new Map<string, number>();
    for (const r of statsRes as any[]) {
      const k = toKey(r?.startDate ?? r?.from);
      const q =
        Number(r?.sumQuantity?.quantity) ||
        Number(r?.averageQuantity?.quantity) ||
        0;
      byStart.set(k, Number.isFinite(q) ? q : 0);
    }

    const buckets: Bucket[] = edges.map((e) => {
      const k = toKey(e.start);
      let v = byStart.get(k) ?? 0;

      return {
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        value: Math.max(0, Math.round(v)),
      };
    });

    log(
      "[TIME] hkReadDailyBuckets(v4)",
      metric,
      "days=",
      days,
      "→",
      buckets.length,
      "buckets in",
      Date.now() - t0,
      "ms"
    );
    return buckets;
  } catch (e) {
    logError(`hkReadDailyBuckets(${metric}, ${days}) failed`, e);
    log(
      "[TIME] hkReadDailyBuckets(v4)",
      metric,
      "days=",
      days,
      "errored after",
      Date.now() - t0,
      "ms"
    );
    return [];
  }
}

/** 7d/30d/90d (daily) for quantity metrics */
export async function hkRead7dBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  return hkReadDailyBuckets(metric, 7);
}

export async function hkRead30dBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  return hkReadDailyBuckets(metric, 30);
}

export async function hkRead90dBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  return hkReadDailyBuckets(metric, 90);
}

/** ───────────────────────── NEW: 7-day buckets for core metrics ─────────────────────────
 *
 * - Read-only.
 * - No prompting.
 * - If denied, returns empty/zero buckets.
 * - Uses queryQuantitySamples from @kingstinct/react-native-healthkit.
 *   (Shape based on upstream docs; adjust if your installed version differs.)
 */

// export async function hkRead7dBuckets(
//   metric: Extract<MetricKey, "steps" | "floors" | "distance" | "activeCalories">
// ): Promise<Bucket[]> {
//   if (Platform.OS !== "ios") return [];

//   try {
//     const HK = await getHK();
//     const query = (HK as any).queryQuantitySamples as
//       | ((
//           id: QuantityTypeIdentifier,
//           options?: {
//             from?: Date;
//             to?: Date;
//             limit?: number;
//             ascending?: boolean;
//           }
//         ) => Promise<
//           Array<{
//             startDate: Date;
//             endDate: Date;
//             quantity?: number;
//             value?: number;
//           }>
//         >)
//       | undefined;

//     if (!query) {
//       log("queryQuantitySamples not available");
//       return [];
//     }

//     const typeId = HK_TYPES[metric] as QuantityTypeIdentifier;
//     const end = new Date();
//     const start = daysAgoUtc(7);

//     const samples = await query(typeId, {
//       from: start,
//       to: end,
//       limit: 0, // by convention = all; verify against your installed version
//       ascending: true,
//     });

//     // Initialize 7 UTC-aligned day buckets
//     const buckets: Bucket[] = [];
//     const base = startOfUtcDay(start);
//     for (let i = 0; i < 7; i++) {
//       const bStart = addUtcDays(base, i);
//       const bEnd = addUtcDays(base, i + 1);
//       buckets.push({
//         start: bStart.toISOString(),
//         end: bEnd.toISOString(),
//         value: 0,
//       });
//     }

//     for (const s of samples) {
//       const v = Number(s.quantity ?? s.value ?? 0) || 0;
//       if (v <= 0) continue;
//       const t = (s.endDate ?? s.startDate).getTime();
//       for (const b of buckets) {
//         const bs = new Date(b.start).getTime();
//         const be = new Date(b.end).getTime();
//         if (t >= bs && t < be) {
//           b.value += v;
//           break;
//         }
//       }
//     }

//     return buckets.map((b) => ({
//       start: b.start,
//       end: b.end,
//       value: Math.max(0, Math.round(b.value)),
//     }));
//   } catch (e) {
//     logError(`hkRead7dBuckets(${metric}) failed`, e);
//     return [];
//   }
// }

/** ─────────────────────────  Latest heart rate helper ─────────────────────────
 *
 * - Read-only.
 * - No prompting.
 * - Queries recent heart rate samples and returns the latest bpm, if any.
 * - If denied or no data, returns null.
 */

// export async function hkReadHeartRateLatest(): Promise<number | null> {
//   if (Platform.OS !== "ios") return null;

//   try {
//     const HK = await getHK();
//     const query = (HK as any).queryQuantitySamples as
//       | ((
//           id: QuantityTypeIdentifier,
//           options?: {
//             from?: Date;
//             to?: Date;
//             limit?: number;
//             ascending?: boolean;
//           }
//         ) => Promise<
//           Array<{
//             startDate: Date;
//             endDate: Date;
//             quantity?: number;
//             value?: number;
//           }>
//         >)
//       | undefined;

//     if (!query) {
//       log("[HR] queryQuantitySamples not available for heartRate");
//       return null;
//     }

//     const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;

//     const now = new Date();
//     const from = new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24h

//     const samples = await query(typeId, {
//       from,
//       to: now,
//       limit: 1, // latest only
//       ascending: false, // assume supported: newest first
//     });

//     if (!samples || samples.length === 0) {
//       log("[HR] no heartRate samples in last 24h");
//       return null;
//     }

//     const s = samples[0];
//     const v = Number(s.quantity ?? s.value ?? 0) || 0;
//     const bpm = v > 0 ? v : 0;

//     log("[HR] latest heartRate sample →", bpm);
//     return bpm > 0 ? bpm : null;
//   } catch (e) {
//     logError("[HR] hkReadHeartRateLatest failed", e);
//     return null;
//   }
// }

export async function hkReadHeartRateLatest(): Promise<number | null> {
  if (Platform.OS !== "ios") return null;

  try {
    const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const samples = await queryQuantitySamplesNormalized(typeId, {
      from,
      to: now,
      limit: 1,
      ascending: false,
    });

    if (!samples || samples.length === 0) {
      log("[HR] no heartRate samples in last 24h");
      return null;
    }

    const s = samples[0];
    const v = Number(s.quantity ?? s.value ?? 0) || 0;
    const bpm = v > 0 ? v : 0;

    log("[HR] latest heartRate sample →", bpm);
    return bpm > 0 ? bpm : null;
  } catch (e) {
    logError("[HR] hkReadHeartRateLatest failed", e);
    return null;
  }
}

// /** Heart rate in arbitrary window: stats + series */
// export async function hkReadHeartRateInWindow(win: Window): Promise<{
//   avgBpm?: number;
//   minBpm?: number;
//   maxBpm?: number;
//   points?: SeriesPoint[];
// }> {
//   if (Platform.OS !== "ios") return {};

//   try {
//     const from = parseIso(win.fromUtc);
//     const to = parseIso(win.toUtc);
//     if (!from || !to || !(to.getTime() > from.getTime())) {
//       log("[HR] hkReadHeartRateInWindow invalid window", win);
//       return {};
//     }

//     const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;
//     const samples = await queryQuantitySamplesNormalized(typeId, {
//       from,
//       to,
//       limit: 0,
//       ascending: true,
//     });

//     if (!samples.length) return {};

//     const points: SeriesPoint[] = [];
//     let min = Number.POSITIVE_INFINITY;
//     let max = 0;
//     let sum = 0;
//     let count = 0;

//     for (const s of samples) {
//       const v = Number(s.quantity ?? s.value ?? 0) || 0;
//       if (v <= 0) continue;

//       const ts = (s.endDate ?? s.startDate).toISOString();
//       points.push({ ts, value: v });
//       if (v < min) min = v;
//       if (v > max) max = v;
//       sum += v;
//       count += 1;
//     }

//     if (!count) return {};

//     return {
//       avgBpm: sum / count,
//       minBpm: min,
//       maxBpm: max,
//       points,
//     };
//   } catch (e) {
//     logError("[HR] hkReadHeartRateInWindow failed", e);
//     return {};
//   }
// }

/** Heart rate in arbitrary window: stats only */
export async function hkReadHeartRateInWindow(win: Window): Promise<{
  avgBpm?: number;
  minBpm?: number;
  maxBpm?: number;
  points?: SeriesPoint[];
}> {
  if (Platform.OS !== "ios") return {};

  try {
    const from = parseIso(win.fromUtc);
    const to = parseIso(win.toUtc);
    if (!from || !to || !(to.getTime() > from.getTime())) {
      log("[HR] hkReadHeartRateInWindow invalid window", win);
      return {};
    }

    const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;

    const statsRes = await hkQueryStatisticsForQuantity(
      typeId,
      ["discreteAverage"],
      {
        filter: {
          startDate: from,
          endDate: to,
        },
      }
    );

    if (!statsRes) return {};

    const avg =
      Number((statsRes as any).averageQuantity?.quantity) ||
      Number((statsRes as any).avgQuantity?.quantity) ||
      0;

    if (!(Number.isFinite(avg) && avg > 0)) return {};

    return { avgBpm: avg };
  } catch (e) {
    logError("[HR] hkReadHeartRateInWindow failed", e);
    return {};
  }
}



/** Heart rate hourly buckets over the last 24h (average bpm per hour) */

// export async function hkReadHeartRateHourly24(): Promise<Bucket[]> {
//   if (Platform.OS !== "ios") return [];

//   const t0 = Date.now();
//   try {
//     const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;
//     const edges = makeHourlyEdges24();
//     if (!edges.length) return [];

//     const from = edges[0].start;
//     const to = edges[edges.length - 1].end;

//     const samples = await queryQuantitySamplesNormalized(typeId, {
//       from,
//       to,
//       limit: 0,
//       ascending: true,
//     });

//     const buckets: Bucket[] = edges.map((r) => ({
//       start: r.start.toISOString(),
//       end: r.end.toISOString(),
//       value: 0,
//     }));

//     if (!samples.length) {
//       log("[HR] hkReadHeartRateHourly24 no samples in last 24h");
//       log(
//         "[TIME] hkReadHeartRateHourly24",
//         "no samples; finished in",
//         Date.now() - t0,
//         "ms"
//       );
//       return buckets;
//     }

//     const sums = new Array(buckets.length).fill(0);
//     const counts = new Array(buckets.length).fill(0);

//     for (const s of samples) {
//       const v = Number(s.quantity ?? s.value ?? 0) || 0;
//       if (v <= 0) continue;

//       const t = (s.endDate ?? s.startDate).getTime();

//       for (let i = 0; i < buckets.length; i++) {
//         const bs = new Date(buckets[i].start).getTime();
//         const be = new Date(buckets[i].end).getTime();
//         if (t >= bs && t < be) {
//           sums[i] += v;
//           counts[i] += 1;
//           break;
//         }
//       }
//     }

//     const out = buckets.map((b, i) => ({
//       start: b.start,
//       end: b.end,
//       value: counts[i] ? sums[i] / counts[i] : 0,
//     }));

//     const hoursWithData = counts.filter((c) => c > 0).length;
//     log(
//       "[HR] hkReadHeartRateHourly24 buckets=",
//       out.length,
//       "hoursWithData=",
//       hoursWithData
//     );
//     log(
//       "[TIME] hkReadHeartRateHourly24",
//       "→",
//       out.length,
//       "buckets in",
//       Date.now() - t0,
//       "ms"
//     );

//     return out;
//   } catch (e) {
//     logError("[HR] hkReadHeartRateHourly24 failed", e);
//     log(
//       "[TIME] hkReadHeartRateHourly24",
//       "errored after",
//       Date.now() - t0,
//       "ms"
//     );
//     return [];
//   }
// }

export async function hkReadHeartRateHourly24(): Promise<Bucket[]> {
  if (Platform.OS !== "ios") return [];

  const t0 = Date.now();
  try {
    const edges = makeHourlyEdges24();
    if (!edges.length) return [];

    const { typeId, stats } = QTY_TYPE_MAP.heartRate;
    const anchorDate = edges[0].start;
    const interval: IntervalComponents = { hour: 1 };

    const from = edges[0].start;
    const to = edges[edges.length - 1].end;

    const statsRes = await hkQueryStatisticsCollectionForQuantity(
      typeId,
      stats, // ["discreteAverage"]
      anchorDate,
      interval,
      { filter: { startDate: from, endDate: to } }
    );

    const toKey = (d: any) => {
      const iso =
        d instanceof Date
          ? d.toISOString()
          : d
            ? new Date(d).toISOString()
            : "";
      return iso.replace(/\.\d{3}Z$/, "Z");
    };

    const byStart = new Map<string, number>();
    for (const r of statsRes as any[]) {
      const k = toKey(r?.startDate ?? r?.from);
      // discreteAverage must be read via averageQuantity()
      const avg =
        Number(r?.averageQuantity?.quantity) ||
        Number(r?.avgQuantity?.quantity) ||
        0;
      byStart.set(k, Number.isFinite(avg) ? avg : 0);
    }

    const buckets: Bucket[] = edges.map((e) => {
      const k = toKey(e.start);
      const v = byStart.get(k) ?? 0;
      return {
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        value: v > 0 ? v : 0,
      };
    });

    log(
      "[TIME] hkReadHeartRateHourly24(v4-stats)",
      "→",
      buckets.length,
      "buckets in",
      Date.now() - t0,
      "ms"
    );

    return buckets;
  } catch (e) {
    logError("[HR] hkReadHeartRateHourly24 failed", e);
    log(
      "[TIME] hkReadHeartRateHourly24(v4-stats)",
      "errored after",
      Date.now() - t0,
      "ms"
    );
    return [];
  }
}

/** Heart rate daily buckets (7/30/90 days) based on averages per day */

// export async function hkReadHeartRateDailyBuckets(
//   days: 7 | 30 | 90
// ): Promise<Bucket[]> {
//   if (Platform.OS !== "ios") return [];

//   const t0 = Date.now();
//   try {
//     const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;
//     const edges = makeDailyEdges(days); // local-day buckets incl. today
//     const from = edges[0].start;
//     const to = edges[edges.length - 1].end;

//     const samples = await queryQuantitySamplesNormalized(typeId, {
//       from,
//       to,
//       limit: 0,
//       ascending: true,
//     });

//     const buckets: Bucket[] = edges.map((r) => ({
//       start: r.start.toISOString(),
//       end: r.end.toISOString(),
//       value: 0,
//     }));

//     const sums = new Array(buckets.length).fill(0);
//     const counts = new Array(buckets.length).fill(0);

//     for (const s of samples) {
//       const v = Number(s.quantity ?? s.value ?? 0) || 0;
//       if (v <= 0) continue;

//       const t = (s.endDate ?? s.startDate).getTime();

//       for (let i = 0; i < buckets.length; i++) {
//         const bs = new Date(buckets[i].start).getTime();
//         const be = new Date(buckets[i].end).getTime();
//         if (t >= bs && t < be) {
//           sums[i] += v;
//           counts[i] += 1;
//           break;
//         }
//       }
//     }

//     const result = buckets.map((b, i) => ({
//       start: b.start,
//       end: b.end,
//       value: counts[i] ? sums[i] / counts[i] : 0,
//     }));

//     log(
//       "[TIME] hkReadHeartRateDailyBuckets",
//       "days=",
//       days,
//       "→",
//       result.length,
//       "buckets in",
//       Date.now() - t0,
//       "ms"
//     );
//     return result;
//   } catch (e) {
//     logError("[HR] hkReadHeartRateDailyBuckets failed", e);
//     log(
//       "[TIME] hkReadHeartRateDailyBuckets",
//       "days=",
//       days,
//       "errored after",
//       Date.now() - t0,
//       "ms"
//     );
//     return [];
//   }
// }
export async function hkReadHeartRateDailyBuckets(
  days: 7 | 30 | 90
): Promise<Bucket[]> {
  if (Platform.OS !== "ios") return [];

  const t0 = Date.now();
  try {
    const edges = makeDailyEdges(days);
    if (!edges.length) return [];

    const { typeId, stats } = QTY_TYPE_MAP.heartRate;
    const anchorDate = edges[0].start;
    const interval: IntervalComponents = { day: 1 };

    const from = edges[0].start;
    const to = edges[edges.length - 1].end;

    const statsRes = await hkQueryStatisticsCollectionForQuantity(
      typeId,
      stats, // ["discreteAverage"]
      anchorDate,
      interval,
      { filter: { startDate: from, endDate: to } }
    );

    const toKey = (d: any) => {
      const iso =
        d instanceof Date
          ? d.toISOString()
          : d
            ? new Date(d).toISOString()
            : "";
      return iso.replace(/\.\d{3}Z$/, "Z");
    };

    const byStart = new Map<string, number>();
    for (const r of statsRes as any[]) {
      const k = toKey(r?.startDate ?? r?.from);
      const avg =
        Number(r?.averageQuantity?.quantity) ||
        Number(r?.avgQuantity?.quantity) ||
        0;
      byStart.set(k, Number.isFinite(avg) ? avg : 0);
    }

    const buckets: Bucket[] = edges.map((e) => {
      const k = toKey(e.start);
      const v = byStart.get(k) ?? 0;
      return {
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        value: v > 0 ? v : 0,
      };
    });

    log(
      "[TIME] hkReadHeartRateDailyBuckets(v4-stats)",
      "days=",
      days,
      "→",
      buckets.length,
      "buckets in",
      Date.now() - t0,
      "ms"
    );
    return buckets;
  } catch (e) {
    logError("[HR] hkReadHeartRateDailyBuckets failed", e);
    log(
      "[TIME] hkReadHeartRateDailyBuckets(v4-stats)",
      "days=",
      days,
      "errored after",
      Date.now() - t0,
      "ms"
    );
    return [];
  }
}

/** ───────────────────────── 7d buckets: sleep (minutes) ─────────────────────────
 *
 * - Read-only, no prompts.
 * - Aggregates total minutes of sleep per UTC day over the last 7 days.
 * - Uses queryCategorySamples if available; falls back to getSleepSamples if present.
 * - Counts all intervals; if you want to narrow to "asleep" only, add a value filter.
 */

// export async function hkReadSleep7dBuckets(): Promise<Bucket[]> {
//   if (Platform.OS !== "ios") return [];

//   try {
//     const HK = await getHK();

//     const queryCategory = (HK as any).queryCategorySamples as
//       | ((
//           id: SampleTypeIdentifier,
//           options?: {
//             from?: Date;
//             to?: Date;
//             limit?: number;
//             ascending?: boolean;
//           }
//         ) => Promise<
//           Array<{
//             startDate: Date;
//             endDate: Date;
//             value?: number;
//           }>
//         >)
//       | undefined;

//     const getSleepSamples = (HK as any).getSleepSamples as
//       | ((opts: {
//           from?: Date;
//           to?: Date;
//           limit?: number;
//           ascending?: boolean;
//         }) => Promise<
//           Array<{
//             startDate: Date;
//             endDate: Date;
//             value?: number;
//           }>
//         >)
//       | undefined;

//     const typeId = HK_TYPES.sleep as SampleTypeIdentifier;
//     const end = new Date();
//     const start = daysAgoUtc(7);

//     let samples:
//       | Array<{ startDate: Date; endDate: Date; value?: number }>
//       | undefined;

//     if (typeof queryCategory === "function") {
//       samples = await queryCategory(typeId, {
//         from: start,
//         to: end,
//         limit: 0,
//         ascending: true,
//       });
//       log("[SLP] queryCategorySamples →", samples?.length ?? 0);
//     } else if (typeof getSleepSamples === "function") {
//       samples = await getSleepSamples({
//         from: start,
//         to: end,
//         limit: 0,
//         ascending: true,
//       });
//       log("[SLP] getSleepSamples →", samples?.length ?? 0);
//     } else {
//       log("[SLP] no sleep query API available");
//       return [];
//     }

//     if (!samples || samples.length === 0) {
//       log("[SLP] no sleep samples in last 7d");
//       // still return 7 zeroed buckets for determinism
//     }

//     const buckets: Bucket[] = [];
//     const base = startOfUtcDay(start);
//     for (let i = 0; i < 7; i++) {
//       const bStart = addUtcDays(base, i);
//       const bEnd = addUtcDays(base, i + 1);
//       buckets.push({
//         start: bStart.toISOString(),
//         end: bEnd.toISOString(),
//         value: 0,
//       });
//     }

//     if (samples && samples.length > 0) {
//       const rangeStart = base.getTime();
//       const rangeEnd = addUtcDays(base, 7).getTime();

//       for (const s of samples) {
//         let segStart = s.startDate?.getTime();
//         let segEnd = s.endDate?.getTime();
//         if (!segStart || !segEnd || segEnd <= segStart) continue;

//         // Clamp to [rangeStart, rangeEnd]
//         if (segEnd <= rangeStart || segStart >= rangeEnd) continue;
//         segStart = Math.max(segStart, rangeStart);
//         segEnd = Math.min(segEnd, rangeEnd);

//         for (const b of buckets) {
//           const bs = new Date(b.start).getTime();
//           const be = new Date(b.end).getTime();
//           const is = Math.max(segStart, bs);
//           const ie = Math.min(segEnd, be);
//           if (ie > is) {
//             const minutes = (ie - is) / (1000 * 60);
//             b.value += minutes;
//           }
//         }
//       }
//     }

//     const normalized = buckets.map((b) => ({
//       start: b.start,
//       end: b.end,
//       value: Math.max(0, Math.round(b.value)),
//     }));

//     const total = normalized.reduce((sum, b) => sum + (b.value || 0), 0);
//     log("[SLP] 7d total minutes=", total);

//     return normalized;
//   } catch (e) {
//     logError("[SLP] hkReadSleep7dBuckets failed", e);
//     return [];
//   }
// }

/** Sleep 7d buckets: total minutes per day (previous 7 full days) */

export async function hkReadSleep7dBuckets(): Promise<Bucket[]> {
  return hkReadSleepDailyBuckets(7);
}

/** Sleep daily buckets (7/30/90) */

export async function hkReadSleepDailyBuckets(
  days: 7 | 30 | 90
): Promise<Bucket[]> {
  if (Platform.OS !== "ios") return [];

  const t0 = Date.now();
  try {
    const typeId = HK_TYPES.sleep as SampleTypeIdentifier;
    const edges = makeDailyEdges(days);
    const from = edges[0].start;
    const to = edges[edges.length - 1].end;

    const samples = await queryCategorySamplesNormalized(typeId, {
      from,
      to,
      limit: 0,
      ascending: true,
    });

    const buckets: Bucket[] = edges.map((e) => ({
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      value: 0,
    }));

    if (samples.length) {
      // Sweep-line: walk buckets forward as we scan each sleep segment.
      // Assumes edges are in ascending time order (true for makeDailyEdges).
      let bi = 0;

      for (const s of samples) {
        if (!s.startDate || !s.endDate) continue;

        let segStart = s.startDate.getTime();
        let segEnd = s.endDate.getTime();
        if (segEnd <= segStart) continue;

        // Fast-forward to first bucket that could overlap this segment.
        while (bi < edges.length && edges[bi].end.getTime() <= segStart) {
          bi++;
        }

        // Walk overlapping buckets only.
        let j = bi;
        while (j < edges.length) {
          const bStart = edges[j].start.getTime();
          const bEnd = edges[j].end.getTime();

          if (bStart >= segEnd) break; // buckets beyond this segment

          const overlapMs = Math.min(segEnd, bEnd) - Math.max(segStart, bStart);

          if (overlapMs > 0) {
            buckets[j].value += overlapMs / (1000 * 60);
          }
          j++;
        }
      }
    }

    const result = buckets.map((b) => ({
      start: b.start,
      end: b.end,
      value: Math.max(0, Math.round(b.value)),
    }));

    log(
      "[TIME] hkReadSleepDailyBuckets",
      "days=",
      days,
      "→",
      result.length,
      "buckets in",
      Date.now() - t0,
      "ms"
    );
    return result;
  } catch (e) {
    logError("[SLP] hkReadSleepDailyBuckets failed", e);
    log(
      "[TIME] hkReadSleepDailyBuckets",
      "days=",
      days,
      "errored after",
      Date.now() - t0,
      "ms"
    );
    return [];
  }
}

/** Sleep minutes in arbitrary window */

export async function hkReadSleepMinutesInWindow(
  win: Window
): Promise<{ minutes: number }> {
  if (Platform.OS !== "ios") return { minutes: 0 };

  try {
    const from = parseIso(win.fromUtc);
    const to = parseIso(win.toUtc);
    if (!from || !to || !(to.getTime() > from.getTime())) {
      log("[SLP] hkReadSleepMinutesInWindow invalid window", win);
      return { minutes: 0 };
    }

    const typeId = HK_TYPES.sleep as SampleTypeIdentifier;
    const samples = await queryCategorySamplesNormalized(typeId, {
      from,
      to,
      limit: 0,
      ascending: true,
    });

    if (!samples.length) return { minutes: 0 };

    const buckets = [
      {
        start: from.toISOString(),
        end: to.toISOString(),
        value: 0,
      },
    ];

    accumulateSleepIntoBucketsByMinutes(samples, buckets);

    return { minutes: Math.max(0, Math.round(buckets[0].value)) };
  } catch (e) {
    logError("[SLP] hkReadSleepMinutesInWindow failed", e);
    return { minutes: 0 };
  }
}

/** Sleep hourly buckets over the last 24h (minutes per hour) */

export async function hkReadSleepHourly24(): Promise<Bucket[]> {
  if (Platform.OS !== "ios") return [];

  const t0 = Date.now();
  try {
    const typeId = HK_TYPES.sleep as SampleTypeIdentifier;
    const edges = makeHourlyEdges24();
    if (!edges.length) return [];

    const from = edges[0].start;
    const to = edges[edges.length - 1].end;

    const samples = await queryCategorySamplesNormalized(typeId, {
      from,
      to,
      limit: 0,
      ascending: true,
    });

    const buckets: Bucket[] = edges.map((e) => ({
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      value: 0,
    }));

    if (samples.length) {
      // Sweep-line over hourly buckets (edges are ascending).
      let bi = 0;

      for (const s of samples) {
        if (!s.startDate || !s.endDate) continue;

        let segStart = s.startDate.getTime();
        let segEnd = s.endDate.getTime();
        if (segEnd <= segStart) continue;

        while (bi < edges.length && edges[bi].end.getTime() <= segStart) {
          bi++;
        }

        let j = bi;
        while (j < edges.length) {
          const bStart = edges[j].start.getTime();
          const bEnd = edges[j].end.getTime();

          if (bStart >= segEnd) break;

          const overlapMs = Math.min(segEnd, bEnd) - Math.max(segStart, bStart);

          if (overlapMs > 0) {
            buckets[j].value += overlapMs / (1000 * 60);
          }
          j++;
        }
      }
    }

    const result = buckets.map((b) => ({
      start: b.start,
      end: b.end,
      value: Math.max(0, Math.round(b.value)),
    }));

    log(
      "[TIME] hkReadSleepHourly24",
      "→",
      result.length,
      "buckets in",
      Date.now() - t0,
      "ms"
    );
    return result;
  } catch (e) {
    logError("[SLP] hkReadSleepHourly24 failed", e);
    log("[TIME] hkReadSleepHourly24", "errored after", Date.now() - t0, "ms");
    return [];
  }
}

// ───────────────────────── Detect active read metrics ─────────────────────────

async function hkProbeMetricHasData(
  metric: MetricKey,
  opts?: { days?: number }
): Promise<boolean> {
  if (Platform.OS !== "ios") {
    return false;
  }

  const days = opts?.days && opts.days > 0 ? opts.days : 7;
  const { startISO, endISO } = lastNDaysLocal(days);
  const from = parseIso(startISO);
  const to = parseIso(endISO);

  if (!from || !to || !(to.getTime() > from.getTime())) {
    log(
      "[AUTH] [Probe] invalid range for",
      metric,
      "start=",
      startISO,
      "end=",
      endISO
    );
    return false;
  }

  try {
    if (metric === "sleep") {
      const typeId = HK_TYPES.sleep as SampleTypeIdentifier;
      const samples = await queryCategorySamplesNormalized(typeId, {
        from,
        to,
        limit: 1,
        ascending: false,
      });

      const hasData = Array.isArray(samples) && samples.length > 0;
      log("[AUTH] [Probe] sleep days=", days, "hasData=", hasData);
      return hasData;
    }

    // Quantity-style metrics (steps, floors, distance, activeCalories, heartRate)
    const typeId = HK_TYPES[metric] as QuantityTypeIdentifier;
    const samples = await queryQuantitySamplesNormalized(typeId, {
      from,
      to,
      limit: 1,
      ascending: false,
    });

    if (!samples || samples.length === 0) {
      log("[AUTH] [Probe]", metric, "days=", days, "no samples");
      return false;
    }

    const sample = samples[0];
    const v = Number(sample.quantity ?? sample.value ?? 0);
    const hasData = Number.isFinite(v) && v > 0;

    log(
      "[AUTH] [Probe]",
      metric,
      "days=",
      days,
      "value=",
      v,
      "hasData=",
      hasData
    );
    return hasData;
  } catch (e) {
    logError("[AUTH] [Probe] failed for " + metric, e);
    return false;
  }
}

type ActiveDetectCacheEntry = {
  active: boolean;
  checkedAt: number;
};

const ACTIVE_DETECT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVE_DETECT_CACHE: Partial<Record<MetricKey, ActiveDetectCacheEntry>> =
  {};

function isActiveCacheValid(metric: MetricKey): ActiveDetectCacheEntry | null {
  const entry = ACTIVE_DETECT_CACHE[metric];
  if (!entry) return null;
  const age = Date.now() - entry.checkedAt;
  if (age > ACTIVE_DETECT_CACHE_TTL_MS) return null;
  return entry;
}

function writeActiveCache(metric: MetricKey, active: boolean) {
  ACTIVE_DETECT_CACHE[metric] = {
    active,
    checkedAt: Date.now(),
  };
}
// old that creates significant delays during auth flow
// export async function hkDetectActiveReadMetrics(
//   metricKeys: MetricKey[]
// ): Promise<MetricKey[]> {
//   const startedAt = Date.now();

//   if (Platform.OS !== "ios") {
//     log("[AUTH] [Detect] hkDetectActiveReadMetrics: non-iOS platform");
//     return [];
//   }

//   const available = await hkIsAvailable();
//   if (!available) {
//     log("[AUTH] [Detect] hkDetectActiveReadMetrics: HealthKit not available");
//     return [];
//   }

//   const unique: MetricKey[] = Array.from(new Set(metricKeys || []));
//   const active: MetricKey[] = [];

//   log("[AUTH] [Detect] hkDetectActiveReadMetrics for", unique);

//   for (const metric of unique) {
//     try {
//       // 1) Check cache first to avoid redundant heavy reads.
//       const cached = isActiveCacheValid(metric);
//       if (cached) {
//         log("[AUTH] [Detect] cache hit for", metric, "active=", cached.active);
//         if (cached.active) {
//           active.push(metric);
//         }
//         continue;
//       }

//       // 2) No valid cache → do the real detection.
//       if (
//         metric === "steps" ||
//         metric === "floors" ||
//         metric === "distance" ||
//         metric === "activeCalories"
//       ) {
//         const buckets = await hkRead7dBuckets(metric);
//         const total = (buckets || []).reduce(
//           (sum, b) => sum + (Number(b.value) || 0),
//           0
//         );
//         const isActive = total > 0;
//         log("[AUTH] [Detect]", metric, "7d total=", total, "active=", isActive);
//         writeActiveCache(metric, isActive);
//         if (isActive) active.push(metric);
//       } else if (metric === "heartRate") {
//         const latest = await hkReadHeartRateLatest();
//         const isActive = typeof latest === "number" && latest > 0;
//         log("[AUTH] [Detect] heartRate latest=", latest, "active=", isActive);
//         writeActiveCache("heartRate", isActive);
//         if (isActive) active.push("heartRate");
//       } else if (metric === "sleep") {
//         const buckets = await hkReadSleep7dBuckets();
//         const total = (buckets || []).reduce(
//           (sum, b) => sum + (Number(b.value) || 0),
//           0
//         );
//         const isActive = total > 0;
//         log("[AUTH] [Detect] sleep 7d totalMin=", total, "active=", isActive);
//         writeActiveCache("sleep", isActive);
//         if (isActive) active.push("sleep");
//       } else {
//         log(
//           "[AUTH] [Detect]",
//           metric,
//           "not probed; treating as inactive for now"
//         );
//         writeActiveCache(metric, false);
//       }
//     } catch (e) {
//       logError(`[AUTH] [Detect] failed for ${metric}`, e);
//       // On error we don’t write cache, so next call can retry.
//     }
//   }

//   const deduped = Array.from(new Set(active));
//   const elapsedMs = Date.now() - startedAt;
//   log("[AUTH] [Detect] activeMetrics →", deduped, "elapsedMs=", elapsedMs);
//   return deduped;
// }

export async function hkDetectActiveReadMetrics(
  metricKeys: MetricKey[]
): Promise<MetricKey[]> {
  const startedAt = Date.now();

  if (Platform.OS !== "ios") {
    log("[AUTH] [Detect] hkDetectActiveReadMetrics: non-iOS platform");
    return [];
  }

  const available = await hkIsAvailable();
  if (!available) {
    log("[AUTH] [Detect] hkDetectActiveReadMetrics: HealthKit not available");
    return [];
  }

  const unique: MetricKey[] = Array.from(new Set(metricKeys || []));
  log("[AUTH] [Detect] hkDetectActiveReadMetrics for", unique);

  if (!unique.length) {
    log("[AUTH] [Detect] no metrics requested");
    return [];
  }

  // Run per-metric detection in parallel, while still honoring the cache.
  const tasks = unique.map(async (metric) => {
    try {
      const cached = isActiveCacheValid(metric);
      if (cached) {
        log("[AUTH] [Detect] cache hit for", metric, "active=", cached.active);
        return { metric, active: cached.active };
      }

      const hasData = await hkProbeMetricHasData(metric, { days: 7 });
      log("[AUTH] [Detect] probe", metric, "days=7 hasData=", hasData);
      writeActiveCache(metric, hasData);
      return { metric, active: hasData };
    } catch (e) {
      logError("[AUTH] [Detect] failed for " + metric, e);
      // On error we don’t write cache; caller can retry next time.
      return { metric, active: false };
    }
  });

  const results = await Promise.all(tasks);

  const activeMetrics = results.filter((r) => r.active).map((r) => r.metric);

  const deduped = Array.from(new Set(activeMetrics));
  const elapsedMs = Date.now() - startedAt;
  log("[AUTH] [Detect] activeMetrics →", deduped, "elapsedMs=", elapsedMs);
  return deduped;
}

/** ───────────────────────── Map MetricKey → HK read types (used in legacy shims) ───────────────────────── */

export function mapMetricKeysToHKReadTypes(
  metricKeys: MetricKey[]
): SampleTypeIdentifier[] {
  const map: Record<MetricKey, SampleTypeIdentifier> = {
    steps: HK_TYPES.steps,
    floors: HK_TYPES.floors,
    distance: HK_TYPES.distance,
    activeCalories: HK_TYPES.activeCalories,
    heartRate: HK_TYPES.heartRate,
    // weight: HK_TYPES.weight,
    sleep: HK_TYPES.sleep,
    // respiratoryRate: HK_TYPES.respiratoryRate,
  };
  const out = (metricKeys || [])
    .map((k) => map[k])
    .filter(Boolean) as SampleTypeIdentifier[];
  log("[MAP] metricKeys → HK types", metricKeys, "→", out);
  return out;
}

/** ───────────────────────── Range helpers for assets & trends ───────────────────────── */

// export async function hkHasDataInRange(
//   metric:
//     | "steps"
//     | "floors"
//     | "distance"
//     | "activeCalories"
//     | "heartRate"
//     | "sleep",
//   fromIso: string,
//   toIso: string
// ): Promise<{
//   available: boolean;
//   hasData: boolean;
//   count?: number;
//   sum?: number;
// }> {
//   if (Platform.OS !== "ios") {
//     return { available: false, hasData: false };
//   }

//   const available = await hkIsAvailable();
//   if (!available) return { available: false, hasData: false };

//   const from = parseIso(fromIso);
//   const to = parseIso(toIso);
//   if (!from || !to || !(to.getTime() > from.getTime())) {
//     return { available: false, hasData: false };
//   }

//   try {
//     if (
//       metric === "steps" ||
//       metric === "floors" ||
//       metric === "distance" ||
//       metric === "activeCalories"
//     ) {
//       // const typeId = HK_TYPES[metric] as QuantityTypeIdentifier;
//       // const samplesRaw = await queryQuantitySamplesNormalized(typeId, {
//       //   from,
//       //   to,
//       //   limit: 0,
//       //   ascending: true,
//       // });
//       // const samples = await normalizeQuantitySamplesToMetersIfDistance(
//       //   metric as QuantMetricKey,
//       //   samplesRaw
//       // );
//       // const count = samples.length;
//       // const sum = samples.reduce(
//       //   (acc, s) => acc + (Number(s.quantity ?? s.value ?? 0) || 0),
//       //   0
//       // );
//       // return {
//       //   available: true,
//       //   hasData: count > 0,
//       //   count,
//       //   sum,
//       // };
//       const m = metric as QuantMetricKey;
//       const { typeId, stats } = QTY_TYPE_MAP[m];

//       const res = await hkQueryStatisticsForQuantity(typeId, stats, {
//         filter: {
//           startDate: from,
//           endDate: to,
//         },
//       });

//       if (!res) {
//         return { available: true, hasData: false, count: 0, sum: 0 };
//       }

//       const raw =
//         Number((res as any).sumQuantity?.quantity) ||
//         Number((res as any).averageQuantity?.quantity) ||
//         0;

//       const sum = raw;

//       const hasData = Number.isFinite(sum) && sum > 0;

//       return {
//         available: true,
//         hasData,
//         count: hasData ? 1 : 0, // stats query is an aggregate, not sample list
//         sum: Number.isFinite(sum) ? sum : 0,
//       };
//     }

//     if (metric === "heartRate") {
//       const typeId = HK_TYPES.heartRate as QuantityTypeIdentifier;
//       const samples = await queryQuantitySamplesNormalized(typeId, {
//         from,
//         to,
//         limit: 0,
//         ascending: true,
//       });
//       const count = samples.length;
//       return {
//         available: true,
//         hasData: count > 0,
//         count,
//       };
//     }

//     if (metric === "sleep") {
//       const typeId = HK_TYPES.sleep as SampleTypeIdentifier;
//       const samples = await queryCategorySamplesNormalized(typeId, {
//         from,
//         to,
//         limit: 0,
//         ascending: true,
//       });
//       const count = samples.length;
//       const buckets = makeFixedBuckets(from, to, to.getTime() - from.getTime());
//       accumulateSleepIntoBucketsByMinutes(samples, buckets);
//       const sum = buckets[0]?.value || 0;
//       return {
//         available: true,
//         hasData: count > 0 && sum > 0,
//         count,
//         sum,
//       };
//     }

//     return { available: false, hasData: false };
//   } catch (e) {
//     logError("hkHasDataInRange failed", e);
//     return { available: false, hasData: false };
//   }
// }

// export async function hkReadSumInWindow(
//   metric: QuantMetricKey,
//   win: Window
// ): Promise<{ sum: number }> {
//   if (Platform.OS !== "ios") return { sum: 0 };

//   try {
//     const from = parseIso(win.fromUtc);
//     const to = parseIso(win.toUtc);
//     if (!from || !to || !(to.getTime() > from.getTime())) {
//       log("[SUM] hkReadSumInWindow invalid window", win);
//       return { sum: 0 };
//     }

//     const typeId = HK_TYPES[metric] as QuantityTypeIdentifier;
//     const samplesRaw = await queryQuantitySamplesNormalized(typeId, {
//       from,
//       to,
//       limit: 0,
//       ascending: true,
//     });

//     const samples = await normalizeQuantitySamplesToMetersIfDistance(
//       metric,
//       samplesRaw
//     );

//     const sum = samples.reduce(
//       (acc, s) => acc + (Number(s.quantity ?? s.value ?? 0) || 0),
//       0
//     );

//     return { sum };
//   } catch (e) {
//     logError("hkReadSumInWindow failed", e);
//     return { sum: 0 };
//   }
// }

export async function hkReadSumInWindow(
  metric: QuantMetricKey,
  win: Window
): Promise<{ sum: number }> {
  if (Platform.OS !== "ios") return { sum: 0 };

  try {
    const from = parseIso(win.fromUtc);
    const to = parseIso(win.toUtc);
    if (!from || !to || !(to.getTime() > from.getTime())) {
      log("[SUM] hkReadSumInWindow invalid window", win);
      return { sum: 0 };
    }

    const { typeId, stats } = QTY_TYPE_MAP[metric];

    // Options shape for time window is not documented in your file,
    // so we do not pass a speculative filter object.
    const res = await hkQueryStatisticsForQuantity(typeId, stats, {
      filter: {
        startDate: from,
        endDate: to,
      },
    });

    if (!res) return { sum: 0 };

    const raw =
      Number((res as any).sumQuantity?.quantity) ||
      Number((res as any).averageQuantity?.quantity) ||
      0;

    const sum = raw;

    return { sum: Number.isFinite(sum) ? sum : 0 };
  } catch (e) {
    logError("hkReadSumInWindow failed", e);
    return { sum: 0 };
  }
}

/** ───────────────────────── Effective readability helpers ─────────────────────────
 *
 * These helpers answer "is this metric effectively usable?" based only on data
 * and availability, not on per-type authorization flags that Apple does not expose.
 */

// old that creates delays during auth flow in background
// export async function hkIsMetricEffectivelyReadable(
//   metric: MetricKey
// ): Promise<boolean> {
//   if (Platform.OS !== "ios") {
//     return false;
//   }

//   const available = await hkIsAvailable();
//   if (!available) {
//     return false;
//   }

//   if (
//     metric === "steps" ||
//     metric === "floors" ||
//     metric === "distance" ||
//     metric === "activeCalories"
//   ) {
//     const range = lastNDaysLocal(7);
//     const result = await hkHasDataInRange(metric, range.startISO, range.endISO);
//     return result.available && result.hasData;
//   }

//   if (metric === "heartRate") {
//     const latest = await hkReadHeartRateLatest();
//     return typeof latest === "number" && latest > 0;
//   }

//   if (metric === "sleep") {
//     const buckets = await hkReadSleep7dBuckets();
//     if (!buckets || buckets.length === 0) {
//       return false;
//     }
//     const total = buckets.reduce((sum, bucket) => {
//       const value = Number(bucket.value) || 0;
//       return sum + value;
//     }, 0);
//     return total > 0;
//   }

//   return false;
// }

export async function hkIsMetricEffectivelyReadable(
  metric: MetricKey
): Promise<boolean> {
  if (Platform.OS !== "ios") {
    return false;
  }

  const available = await hkIsAvailable();
  if (!available) {
    return false;
  }

  // Guard future MetricKey extensions explicitly.
  if (
    metric !== "steps" &&
    metric !== "floors" &&
    metric !== "distance" &&
    metric !== "activeCalories" &&
    metric !== "heartRate" &&
    metric !== "sleep"
  ) {
    return false;
  }

  const hasData = await hkProbeMetricHasData(metric, { days: 7 });
  log("[AUTH] [Readable]", metric, "days=7 hasData=", hasData);
  return hasData;
}

export async function hkGetEffectivelyReadableMetrics(
  metricKeys: MetricKey[]
): Promise<MetricKey[]> {
  if (!metricKeys || metricKeys.length === 0) {
    return [];
  }

  if (Platform.OS !== "ios") {
    return [];
  }

  const available = await hkIsAvailable();
  if (!available) {
    return [];
  }

  const startedAt = Date.now();

  // Deduplicate and drop falsy entries defensively
  const uniqueSet = new Set<MetricKey>();
  for (const metric of metricKeys) {
    if (!metric) continue;
    uniqueSet.add(metric);
  }
  const unique: MetricKey[] = Array.from(uniqueSet);

  if (!unique.length) {
    const elapsedEmpty = Date.now() - startedAt;
    log(
      "[AUTH] [Readable] hkGetEffectivelyReadableMetrics → [] (no unique metrics)",
      "elapsedMs=",
      elapsedEmpty
    );
    return [];
  }

  // Run all per-metric checks in parallel, reusing hkIsMetricEffectivelyReadable.
  const tasks = unique.map(async (metric) => {
    try {
      const isReadable = await hkIsMetricEffectivelyReadable(metric);
      return { metric, isReadable };
    } catch (e) {
      logError("[AUTH] [Readable] failed for " + metric, e);
      return { metric, isReadable: false };
    }
  });

  const results = await Promise.all(tasks);

  const readable = results.filter((r) => r.isReadable).map((r) => r.metric);

  const elapsedMs = Date.now() - startedAt;
  log(
    "[AUTH] [Readable] hkGetEffectivelyReadableMetrics →",
    readable,
    "elapsedMs=",
    elapsedMs
  );

  return readable;
}

/** ───────────────────────── Background observers (best-effort) ─────────────────────────
 *
 * Uses subscribeToChanges(typeIdentifier, callback) as documented.
 * This only triggers refetches; no direct writes or assumptions about reliability.
 * :contentReference[oaicite:3]{index=3}
 */

let _hkBgActive = false;
let _hkUnsubscribes: Array<() => void> = [];

export async function hkStartBackgroundObservers(): Promise<boolean> {
  if (Platform.OS !== "ios") {
    log("[BG] not iOS; skip");
    return false;
  }

  const available = await hkIsAvailable();
  if (!available) {
    log("[BG] HealthKit not available");
    return false;
  }

  try {
    const HK = await getHK();
    const subscribe = (HK as any).subscribeToChanges as
      | ((id: SampleTypeIdentifier, cb: () => void) => () => void)
      | undefined;

    if (typeof subscribe !== "function") {
      log("[BG] subscribeToChanges not available");
      return false;
    }

    // Stop any existing
    for (const u of _hkUnsubscribes) {
      try {
        u();
      } catch {}
    }
    _hkUnsubscribes = [];

    const typesToObserve: SampleTypeIdentifier[] = READ_TYPES.slice();

    for (const t of typesToObserve) {
      try {
        const unsub = subscribe(t, () => {
          // Callers should listen to window readers; we only log here.
          log("[BG] change detected for", t);
        });
        if (typeof unsub === "function") {
          _hkUnsubscribes.push(unsub);
        }
      } catch (e) {
        logError("[BG] subscribeToChanges failed for " + t, e);
      }
    }

    _hkBgActive = _hkUnsubscribes.length > 0;
    log("[BG] observers active =", _hkBgActive);
    return _hkBgActive;
  } catch (e) {
    logError("hkStartBackgroundObservers failed", e);
    return false;
  }
}

export function hkIsBackgroundObserversActive(): boolean {
  return _hkBgActive;
}

export async function hkStopBackgroundObservers(): Promise<boolean> {
  try {
    for (const u of _hkUnsubscribes) {
      try {
        u();
      } catch {}
    }
    _hkUnsubscribes = [];
    _hkBgActive = false;
    log("[BG] observers stopped");
    return true;
  } catch (e) {
    logError("hkStopBackgroundObservers failed", e);
    return false;
  }
}

export async function hkBootstrapBackgroundObservers(): Promise<void> {
  // Intentionally does not auto-start; call explicitly from app bootstrap if desired.
  log("[BG] hkBootstrapBackgroundObservers (no-op, explicit start required)");
}

export async function hkBackgroundSelfTest() {
  const snap = await hkGetAuthorizationSnapshot();
  return {
    available: snap.available,
    granted: snap.status === "unnecessary",
    active: _hkBgActive,
    steps24: 0, // Left as diagnostic; real values should call hkRead24hBuckets.
  };
}

/** ───────────────────────── LEGACY API SHIMS ─────────────────────────
 *
 * Everything below exists ONLY to keep old imports compiling.
 * They are intentionally:
 * - side-effect free (no surprise prompts / background observers),
 * - conservative (mostly "no data"/"not authorized"),
 * - or thin wrappers over the new primitives.
 *
 * New flows MUST use the new API above.
 */

function legacyWarn(name: string) {
  log(`[LEGACY] ${name} called`);
}

/** Legacy auth status */

export type HKInitResult =
  | { available: false }
  | { available: true; granted: boolean };

export async function hkGetAuthorizationStatus(): Promise<{
  available: boolean;
  granted: boolean;
  askedBefore: boolean;
}> {
  legacyWarn("hkGetAuthorizationStatus");
  const snap = await hkGetAuthorizationSnapshot();
  return {
    available: snap.available,
    granted: snap.status === "unnecessary",
    askedBefore: snap.status !== "unknown",
  };
}

export async function hkDebugAuthStatus() {
  legacyWarn("hkDebugAuthStatus");
  const base = await hkGetAuthorizationStatus();
  // We cannot reliably infer per-metric grants; expose empty list.
  return { ...base, grantedKeys: [] as MetricKey[] };
}

export async function hkRequestAllReadPermissions(): Promise<boolean> {
  legacyWarn("hkRequestAllReadPermissions");
  return hkRequestReadAuthorization();
}

export async function hkEnsureAuthorized(): Promise<HKInitResult> {
  legacyWarn("hkEnsureAuthorized");
  const snap = await hkGetAuthorizationSnapshot();
  if (!snap.available) return { available: false };
  return { available: true, granted: snap.status === "unnecessary" };
}

export async function ensureHealthKitAuthorized(): Promise<HKInitResult> {
  legacyWarn("ensureHealthKitAuthorized");
  return hkEnsureAuthorized();
}

export async function listGrantedMetricKeys(): Promise<MetricKey[]> {
  legacyWarn("listGrantedMetricKeys");
  const snap = await hkGetAuthorizationSnapshot();
  if (!snap.available) return [];
  if (snap.status === "unnecessary") {
    // Still conservative; treat all as potentially usable.
    return [
      "steps",
      "floors",
      "distance",
      "activeCalories",
      "heartRate",
      "sleep",
    ];
  }
  return [];
}

/** Date helpers (unchanged semantics) */

export function todayRangeLocal() {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  return { startISO: start.toISOString(), endISO: now.toISOString() };
}

export function lastNDaysLocal(days: number) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1); // tomorrow 00:00
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function last24hLocal() {
  const end = new Date();
  end.setSeconds(0, 0);
  const start = new Date(end);
  start.setHours(end.getHours() - 24);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** Legacy readers now delegate to new primitives */

export async function read24hBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  legacyWarn("read24hBuckets → hkRead24hBuckets");
  return hkRead24hBuckets(metric);
}

export async function read7dBuckets(metric: QuantMetricKey): Promise<Bucket[]> {
  legacyWarn("read7dBuckets → hkRead7dBuckets");
  return hkRead7dBuckets(metric);
}

export async function read30dBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  legacyWarn("read30dBuckets → hkRead30dBuckets");
  return hkRead30dBuckets(metric);
}

export async function read90dBuckets(
  metric: QuantMetricKey
): Promise<Bucket[]> {
  legacyWarn("read90dBuckets → hkRead90dBuckets");
  return hkRead90dBuckets(metric);
}

export async function readHeartRateHourly24(): Promise<Bucket[]> {
  legacyWarn("readHeartRateHourly24 → hkReadHeartRateHourly24");
  return hkReadHeartRateHourly24();
}

export async function readHeartRateDailyBuckets(
  days: 7 | 30 | 90
): Promise<Bucket[]> {
  legacyWarn("readHeartRateDailyBuckets → hkReadHeartRateDailyBuckets");
  return hkReadHeartRateDailyBuckets(days);
}

export async function readTodayStepsTotal(): Promise<number> {
  legacyWarn("readTodayStepsTotal");
  const { startISO, endISO } = todayRangeLocal();
  const { sum } = await hkReadSumInWindow("steps", {
    fromUtc: startISO,
    toUtc: endISO,
  });
  return sum;
}

export async function readTodayFloorsTotal(): Promise<number> {
  legacyWarn("readTodayFloorsTotal");
  const { startISO, endISO } = todayRangeLocal();
  const { sum } = await hkReadSumInWindow("floors", {
    fromUtc: startISO,
    toUtc: endISO,
  });
  return sum;
}

export async function readTodayDistanceMeters(): Promise<number> {
  legacyWarn("readTodayDistanceMeters");
  const { startISO, endISO } = todayRangeLocal();
  const { sum } = await hkReadSumInWindow("distance", {
    fromUtc: startISO,
    toUtc: endISO,
  });
  return sum;
}

export async function readTodayActiveCaloriesKcal(): Promise<number> {
  legacyWarn("readTodayActiveCaloriesKcal");
  const { startISO, endISO } = todayRangeLocal();
  const { sum } = await hkReadSumInWindow("activeCalories", {
    fromUtc: startISO,
    toUtc: endISO,
  });
  return sum;
}

export async function readTodayHeartRateLatestBpm(): Promise<number | null> {
  legacyWarn("readTodayHeartRateLatestBpm → hkReadHeartRateLatest");
  return hkReadHeartRateLatest();
}

export async function readLatestWeightKg(): Promise<number | null> {
  legacyWarn("readLatestWeightKg");
  // No weight wired yet.
  return null;
}

export async function readRespiratoryRateLatest(): Promise<number | null> {
  legacyWarn("readRespiratoryRateLatest");
  return null;
}

/** Legacy sleep helpers */

export async function readTodaySleepTotalMinutes(): Promise<number> {
  legacyWarn("readTodaySleepTotalMinutes");
  const { startISO, endISO } = todayRangeLocal();
  const { minutes } = await hkReadSleepMinutesInWindow({
    fromUtc: startISO,
    toUtc: endISO,
  });
  return minutes;
}

export async function readSleepHourlyBuckets24(): Promise<Bucket[]> {
  legacyWarn("readSleepHourlyBuckets24 → hkReadSleepHourly24");
  return hkReadSleepHourly24();
}

export async function readSleepDailyBuckets(
  days: 7 | 30 | 90
): Promise<Bucket[]> {
  legacyWarn("readSleepDailyBuckets → hkReadSleepDailyBuckets");
  return hkReadSleepDailyBuckets(days);
}

export async function readSleepSessions(_days: 7 | 30 | 90): Promise<
  Array<{
    start: string;
    end: string;
    minutes: number;
  }>
> {
  legacyWarn("readSleepSessions");
  return [];
}

/** Legacy HK debug APIs */

export async function hkDebugRaw() {
  legacyWarn("hkDebugRaw");
}

/** Legacy auth helpers */

export async function requestAuthorizationForTypes(
  readTypes: string[]
): Promise<boolean> {
  legacyWarn("requestAuthorizationForTypes");
  if (!readTypes || readTypes.length === 0) return false;
  return hkRequestReadAuthorization();
}

export async function hkIsMetricAuthorized(
  _metric: MetricKey
): Promise<boolean> {
  legacyWarn("hkIsMetricAuthorized");
  // Library + Apple docs do not allow reliable per-type grant checks here.
  return false;
}

export async function hkCheckAndMaybePrompt(
  metricKeys: MetricKey[],
  opts?: { prompt?: boolean }
): Promise<{
  authorizedKeys: MetricKey[];
  deniedKeys: MetricKey[];
  undeterminedTypes: string[];
  prompted: boolean;
}> {
  legacyWarn("hkCheckAndMaybePrompt");

  const out = {
    authorizedKeys: [] as MetricKey[],
    deniedKeys: [] as MetricKey[],
    undeterminedTypes: [] as string[],
    prompted: false,
  };

  if (!metricKeys?.length) return out;

  const snap = await hkGetAuthorizationSnapshot();

  if (snap.status === "unknown") {
    out.undeterminedTypes = mapMetricKeysToHKReadTypes(metricKeys);
    if (opts?.prompt) {
      out.prompted = await hkRequestReadAuthorization();
    }
  } else if (snap.status === "unnecessary") {
    out.authorizedKeys = [...metricKeys];
  }

  return out;
}

export async function getUndeterminedReadTypes(
  metricKeys: MetricKey[]
): Promise<SampleTypeIdentifier[]> {
  legacyWarn("getUndeterminedReadTypes");
  const snap = await hkGetAuthorizationSnapshot();
  if (snap.status !== "shouldRequest") return [];
  return mapMetricKeysToHKReadTypes(metricKeys);
}

export async function hkGetPerTypeStatus(metricKeys: MetricKey[]): Promise<{
  authorizedKeys: MetricKey[];
  shouldRequestTypes: string[];
  deniedKeys: string[];
}> {
  legacyWarn("hkGetPerTypeStatus");

  const snap = await hkGetAuthorizationSnapshot();

  if (!metricKeys?.length) {
    return { authorizedKeys: [], shouldRequestTypes: [], deniedKeys: [] };
  }

  if (!snap.available) {
    return { authorizedKeys: [], shouldRequestTypes: [], deniedKeys: [] };
  }

  if (snap.status === "shouldRequest") {
    return {
      authorizedKeys: [],
      shouldRequestTypes: mapMetricKeysToHKReadTypes(metricKeys),
      deniedKeys: [],
    };
  }

  if (snap.status === "unnecessary") {
    return {
      authorizedKeys: [...metricKeys],
      shouldRequestTypes: [],
      deniedKeys: [],
    };
  }

  return {
    authorizedKeys: [],
    shouldRequestTypes: mapMetricKeysToHKReadTypes(metricKeys),
    deniedKeys: [],
  };
}
