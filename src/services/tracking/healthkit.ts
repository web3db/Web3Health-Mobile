// src/services/tracking/healthkit.ts
import type {
  CategoryTypeIdentifier,
  QuantityTypeIdentifier,
  SampleTypeIdentifier
} from "@kingstinct/react-native-healthkit";
import { Linking, Platform } from "react-native";

/** ───────────────────────── Logger ───────────────────────── */
const TAG = "[HK]";
const LOG_CAP = 300;
const HK_LOGS: Array<{ ts: string; msg: string }> = [];
export function getHKLogs() {
  return [...HK_LOGS];
}
export function clearHKLogs() {
  HK_LOGS.length = 0;
}
function pushLog(msg: string) {
  HK_LOGS.push({ ts: new Date().toISOString(), msg });
  if (HK_LOGS.length > LOG_CAP) HK_LOGS.shift();
}
const log = (...a: any[]) => {
  console.log(TAG, ...a);
  try {
    pushLog(
      a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")
    );
  } catch {}
};
const logErr = (label: string, e: unknown, extra?: any) => {
  console.log(TAG, `${label}:`, (e as any)?.message ?? e, extra ?? "");
  try {
    pushLog(`${label}: ${(e as any)?.message ?? e}`);
  } catch {}
};

function logRows(label: string, rows: Bucket[]) {
  const head = rows.slice(0, 3);
  const tail = rows.slice(-3);
  const sum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  log(`${label} rows=${rows.length} sum=${sum}`, { head, tail });
}

/** ───────────────────────── Shared types (parity with HC) ───────────────────────── */
export type Bucket = { start: string; end?: string; value: number };
export type MetricKey =
  | "steps"
  | "floors"
  | "distance"
  | "activeCalories"
  | "heartRate"
  | "weight"
  | "sleep"
  | "respiratoryRate";

export type TimezoneInfo = {
  iana?: string;
  offsetMinutes: number; // minutes east of UTC
  offsetStr: string; // e.g., "UTC-04:00"
  label: string; // e.g., "America/New_York (UTC-04:00)"
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

/** ───────────────────────── HealthKit type map ─────────────────────────
 */
export const HK_TYPES = {
  steps: "HKQuantityTypeIdentifierStepCount",
  floors: "HKQuantityTypeIdentifierFlightsClimbed",
  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  activeCalories: "HKQuantityTypeIdentifierActiveEnergyBurned",
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  weight: "HKQuantityTypeIdentifierBodyMass",
  sleep: "HKCategoryTypeIdentifierSleepAnalysis",
  respiratoryRate: "HKQuantityTypeIdentifierRespiratoryRate",
} as const;

type QtyId =
  | typeof HK_TYPES.steps
  | typeof HK_TYPES.floors
  | typeof HK_TYPES.distance
  | typeof HK_TYPES.activeCalories
  | typeof HK_TYPES.heartRate
  | typeof HK_TYPES.weight
  | typeof HK_TYPES.respiratoryRate;

type CatId = typeof HK_TYPES.sleep;

/** Read-only for Phase 1 */
const READ_QTY: readonly QuantityTypeIdentifier[] = [
  HK_TYPES.steps,
  HK_TYPES.floors,
  HK_TYPES.distance,
  HK_TYPES.activeCalories,
  HK_TYPES.heartRate,
  HK_TYPES.weight,
  HK_TYPES.respiratoryRate,
] as const;

const READ_CAT: readonly CategoryTypeIdentifier[] = [HK_TYPES.sleep] as const;

const READ_TYPES: readonly SampleTypeIdentifier[] = [
  ...READ_QTY,
  ...READ_CAT,
] as const;

const WRITE_TYPES: readonly [] = [] as const;

/** ───────────────────────── Availability & Permissions ───────────────────────── */
export async function hkIsAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const { isHealthDataAvailable } = await import(
      "@kingstinct/react-native-healthkit"
    );
    const ok = isHealthDataAvailable();
    log("isHealthDataAvailable →", ok);
    return ok;
  } catch (e) {
    logErr("hkIsAvailable import/exec failed", e);
    return false;
  }
}

function arrifyStats(stat: "cumulativeSum" | "discreteAverage" | "mostRecent") {
  // Native expects an array of statistics options; weight/mostRecent won't use stats-collection anyway.
  if (stat === "mostRecent") return [];
  return [stat];
}

/** Convert various date inputs to epoch milliseconds for the bridge */
function toMs(d: Date | string | number): number {
  if (typeof d === "number") return d;
  if (typeof d === "string") return new Date(d).getTime();
  return d.getTime();
}

/** Prompts for all Phase-1 reads. Returns true if authorized. */
export async function hkRequestAllReadPermissions(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    const { requestAuthorization } = await import(
      "@kingstinct/react-native-healthkit"
    );
    log("requestAuthorization(read)", READ_TYPES);
    let granted: any;

    // v11+: requestAuthorization(readTypes) OR legacy: (writeTypes, readTypes)
    if (requestAuthorization.length === 1) {
      granted = await (requestAuthorization as any)(READ_TYPES);
    } else {
      granted = await (requestAuthorization as any)(WRITE_TYPES, READ_TYPES);
    }

    log("requestAuthorization →", granted);
    _HK_STATE.granted = !!granted;
    return !!granted;
  } catch (e) {
    logErr("hkRequestAllReadPermissions failed", e);
    throw e;
  }
}

/** Simple local state to answer "what's granted?" at app runtime.
 * (HealthKit does not expose per-type status via this lib; Phase-1 uses this coarse flag.)
 */
const _HK_STATE: { granted: boolean } = { granted: false };

export type HKInitResult =
  | { available: false }
  | { available: true; granted: boolean };

export async function hkEnsureAuthorized(): Promise<HKInitResult> {
  const warm = await hkWarmAuthorizationCheck(); // ← silent check
  if (!warm.available) return { available: false };
  if (warm.granted) return { available: true, granted: true };

  // Not granted → only request when explicitly asked
  return { available: true, granted: false };
}

/** Back-compat name used by the store probe. */
export async function ensureHealthKitAuthorized(): Promise<HKInitResult> {
  return hkEnsureAuthorized();
}

/** Optional: open iOS app Settings so user can change Health access. */
export function openHealthSettings() {
  if (Platform.OS === "ios") Linking.openSettings().catch(() => {});
}

async function hkWarmAuthorizationCheck(): Promise<{
  available: boolean;
  granted: boolean;
}> {
  if (Platform.OS !== "ios") return { available: false, granted: false };
  const available = await hkIsAvailable();
  if (!available) return { available: false, granted: false };

  // Silent probe: no prompt. If authorized, this returns data or empty array.
  try {
    const { startISO, endISO } = last24hLocal();
    await getStatisticsCollection({
      metric: "steps",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    _HK_STATE.granted = true;
    return { available: true, granted: true };
  } catch (e: any) {
    // Most libraries throw a specific “not authorized / authorization denied” error.
    _HK_STATE.granted = false;
    return { available: true, granted: false };
  }
}

/** List of metric keys we will *attempt* to read given Phase-1 auth.
 * Phase-1: return all iOS metrics if user granted the sheet; else [].
 * (Fine-grained per-type checks can be added later if needed.)
 */
export async function listGrantedMetricKeys(): Promise<MetricKey[]> {
  if (Platform.OS !== "ios") return [];
  // If we haven't checked yet this session, do a silent warm check.
  if (_HK_STATE.granted === false) {
    const warm = await hkWarmAuthorizationCheck();
    if (!warm.available || !warm.granted) return [];
  }
  return _HK_STATE.granted
    ? ([
        "steps",
        "floors",
        "distance",
        "activeCalories",
        "heartRate",
        "weight",
        "sleep",
        "respiratoryRate",
      ] as MetricKey[])
    : [];
}

/** ───────────────────────── Date helpers (local time) ───────────────────────── */
const localMidnight = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function todayRangeLocal() {
  const now = new Date();
  const start = localMidnight(now);
  return { startISO: start.toISOString(), endISO: now.toISOString() };
}

export function lastNDaysLocal(days: number) {
  const end = localMidnight(); // today 00:00 local
  end.setDate(end.getDate() + 1); // tomorrow 00:00 local
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

// ───────────────────────── Helpers: HK import + units ─────────────────────────
type HKModule = typeof import("@kingstinct/react-native-healthkit");

let _hkModule: HKModule | null = null;

async function withHK<T>(fn: (HK: HKModule) => Promise<T>): Promise<T> {
  if (Platform.OS !== "ios")
    throw new Error("HealthKit not available on this platform");
  if (!_hkModule)
    _hkModule = await import("@kingstinct/react-native-healthkit");
  return fn(_hkModule);
}
// ───────────────────────── Quantity type units ─────────────────────────

const QTY_UNIT: Record<
  Extract<
    MetricKey,
    | "steps"
    | "floors"
    | "distance"
    | "activeCalories"
    | "heartRate"
    | "weight"
    | "respiratoryRate"
  >,
  string
> = {
  steps: "count",
  floors: "count",
  distance: "m", // meters
  activeCalories: "kcal", // kilocalories
  heartRate: "count/min", // bpm
  weight: "kg",
  respiratoryRate: "count/min",
};

function startOfHour(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addHours(d: Date, h: number) {
  const x = new Date(d);
  x.setHours(x.getHours() + h, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function iso(d: Date | string) {
  return typeof d === "string" ? d : d.toISOString();
}

function clamp(a: Date, min: Date, max: Date) {
  return new Date(
    Math.min(Math.max(a.getTime(), min.getTime()), max.getTime())
  );
}

function hoursBetween(start: Date, end: Date) {
  const out: Date[] = [];
  let cur = startOfHour(start);
  while (cur < end) {
    out.push(cur);
    cur = addHours(cur, 1);
  }
  return out;
}
function daysBetween(start: Date, end: Date) {
  const out: Date[] = [];
  let cur = startOfDay(start);
  while (cur < end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

// Map app metric key → HealthKit identifiers + statistic options
const QTY_TYPE_MAP: Record<
  Extract<
    MetricKey,
    | "steps"
    | "floors"
    | "distance"
    | "activeCalories"
    | "heartRate"
    | "weight"
    | "respiratoryRate"
  >,
  { typeId: QtyId; stats: "cumulativeSum" | "discreteAverage" }
> = {
  steps: { typeId: HK_TYPES.steps, stats: "cumulativeSum" },
  floors: { typeId: HK_TYPES.floors, stats: "cumulativeSum" },
  distance: { typeId: HK_TYPES.distance, stats: "cumulativeSum" },
  activeCalories: { typeId: HK_TYPES.activeCalories, stats: "cumulativeSum" },
  heartRate: { typeId: HK_TYPES.heartRate, stats: "discreteAverage" },
  weight: { typeId: HK_TYPES.weight, stats: "mostRecent" as any }, // handled via mostRecent sample
  respiratoryRate: {
    typeId: HK_TYPES.respiratoryRate,
    stats: "discreteAverage",
  },
};

// ───────────────────────── Generic Statistics Collection ─────────────────────────
// Try stats-collection first (hour/day), else fall back to raw samples we bin ourselves.

async function getStatisticsCollection(opts: {
  metric: keyof typeof QTY_TYPE_MAP;
  start: Date;
  end: Date;
  interval: "hour" | "day";
}): Promise<Bucket[]> {
  return withHK(async (HK) => {
    const { metric, start, end, interval } = opts;
    const { typeId } = QTY_TYPE_MAP[metric];
    const unit = QTY_UNIT[metric];

    const qqs = (HK as any).queryQuantitySamples;
    if (!qqs) return [];

    let samples: any[] = [];
    try {
      samples = await qqs(typeId, {
        unit,
        startDate: start,
        endDate: end,
        
      });
    } catch (e) {
      logErr(`[HK] queryQuantitySamples failed for ${metric}/${interval}`, e);
      return [];
    }
    if (!Array.isArray(samples)) return [];

    const toBuckets = (edges: Date[], stepTo: (d: Date) => Date) =>
      edges.map((d) => ({
        start: new Date(d),
        end: stepTo(d),
        value: 0 as number,
      }));

    const bins =
      interval === "hour"
        ? toBuckets(hoursBetween(start, end), (h) => addHours(h, 1))
        : toBuckets(daysBetween(start, end), (d) => addDays(d, 1));

    for (const s of samples) {
      const sStart = new Date(
        typeof s.startDate === "number" ? s.startDate : s.startDate
      );
      const sEndRaw =
        typeof s.endDate === "number" ? s.endDate : (s.endDate ?? s.startDate);
      const sEnd = new Date(sEndRaw);
      const v = Number(s.quantity ?? s.value ?? 0) || 0;

      // 🔧 Handle point samples (start == end): drop into the containing bin
      if (sEnd.getTime() === sStart.getTime()) {
        for (let i = 0; i < bins.length; i++) {
          const b = bins[i];
          // Treat bins as [start, end); include exact start, exclude exact end
          const t = sStart.getTime();
          const bStart = (b.start as Date).getTime();
          const bEnd = (b.end as Date).getTime();
          if (t >= bStart && t < bEnd) {
            if (QTY_TYPE_MAP[metric].stats === "cumulativeSum") {
              bins[i].value += v;
            } else {
              bins[i].value += v;
              (bins[i] as any).__count = ((bins[i] as any).__count ?? 0) + 1;
            }
            break;
          }
        }
        continue;
      }

      // ⬇️ Existing interval-overlap logic for duration samples
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        const overlapStart = clamp(sStart, b.start as Date, b.end! as Date);
        const overlapEnd = clamp(sEnd, b.start as Date, b.end! as Date);
        if (overlapEnd > overlapStart) {
          if (QTY_TYPE_MAP[metric].stats === "cumulativeSum") {
            const sDur = Math.max(1, sEnd.getTime() - sStart.getTime());
            const segDur = overlapEnd.getTime() - overlapStart.getTime();
            bins[i].value += v * (segDur / sDur);
          } else {
            bins[i].value += v;
            (bins[i] as any).__count = ((bins[i] as any).__count ?? 0) + 1;
          }
        }
      }
    }

    if (QTY_TYPE_MAP[metric].stats !== "cumulativeSum") {
      for (const b of bins as any[]) {
        const c = b.__count ?? 0;
        b.value = c ? b.value / c : 0;
        delete b.__count;
      }
    }

    return bins.map((b) => ({
      start: iso(b.start),
      end: iso(b.end!),
      value: Math.max(0, Math.round(b.value)),
    }));
  });
}

// ───────────────────────── Today totals & latests ─────────────────────────
export async function readTodayStepsTotal(): Promise<number> {
  const { startISO, endISO } = todayRangeLocal();
  try {
    const rows = await getStatisticsCollection({
      metric: "steps",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows("[HK] today steps rows →", rows);
    return Math.round(rows.reduce((s, r) => s + (r.value || 0), 0));
  } catch (e) {
    logErr("[HK] readTodayStepsTotal", e);
    return 0;
  }
}

export async function readTodayFloorsTotal(): Promise<number> {
  const { startISO, endISO } = todayRangeLocal();
  try {
    const rows = await getStatisticsCollection({
      metric: "floors",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows("[HK] today floors rows →", rows);
    return Math.round(rows.reduce((s, r) => s + (r.value || 0), 0));
  } catch (e) {
    logErr("[HK] readTodayFloorsTotal", e);
    return 0;
  }
}

export async function readTodayDistanceMeters(): Promise<number> {
  const { startISO, endISO } = todayRangeLocal();
  try {
    const rows = await getStatisticsCollection({
      metric: "distance",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows("[HK] today distance rows →", rows);
    return Math.round(rows.reduce((s, r) => s + (r.value || 0), 0));
  } catch (e) {
    logErr("[HK] readTodayDistanceMeters", e);
    return 0;
  }
}

export async function readTodayActiveCaloriesKcal(): Promise<number> {
  const { startISO, endISO } = todayRangeLocal();
  try {
    const rows = await getStatisticsCollection({
      metric: "activeCalories",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows("[HK] today activeCalories rows →", rows);
    return Math.round(rows.reduce((s, r) => s + (r.value || 0), 0));
  } catch (e) {
    logErr("[HK] readTodayActiveCaloriesKcal", e);
    return 0;
  }
}

export async function readTodayHeartRateLatestBpm(): Promise<number | null> {
  try {
    return withHK(async (HK) => {
      // Prefer mostRecent quantity sample for HR
      if ((HK as any).getMostRecentQuantitySample) {
        const s = await (HK as any).getMostRecentQuantitySample(
          HK_TYPES.heartRate,
          QTY_UNIT.heartRate
        );
        const raw =
          (s &&
            (("quantity" in s && s.quantity) || ("value" in s && s.value))) ??
          null;
        const bpm = raw ? Number(raw) : 0;
        log("[HK] latest heartRate →", bpm ?? "null");
        return bpm > 0 ? bpm : null;
      }
      // Fallback: query last hour average and take last value > 0
      const { startISO, endISO } = last24hLocal();
      const rows = await getStatisticsCollection({
        metric: "heartRate",
        start: new Date(startISO),
        end: new Date(endISO),
        interval: "hour",
      });
      for (let i = rows.length - 1; i >= 0; i--) {
        const v = Number(rows[i].value || 0);
        if (v > 0) return Math.round(v);
      }
      return null;
    });
  } catch (e) {
    logErr("[HK] readTodayHeartRateLatestBpm", e);
    return null;
  }
}

export async function readLatestWeightKg(): Promise<number | null> {
  try {
    return withHK(async (HK) => {
      if ((HK as any).getMostRecentQuantitySample) {
        const s = await (HK as any).getMostRecentQuantitySample(
          HK_TYPES.weight,
          QTY_UNIT.weight
        );
        const kg = Number(s?.quantity ?? s?.value ?? 0) || 0;
        log("[HK] latest weight →", kg ?? "null");
        return kg > 0 ? kg : null;
      }
      // Fallback: query recent samples and take most recent
      const end = new Date();
      const start = addDays(end, -30);
      const arr = await (HK as any).queryQuantitySamples?.(HK_TYPES.weight, {
        unit: QTY_UNIT.weight,
        startDate: start,
        endDate: end,
        limit: 1,
        ascending: false,
      });

      const v = Number(arr?.[0]?.quantity ?? arr?.[0]?.value ?? 0) || 0;
      return v > 0 ? v : null;
    });
  } catch (e) {
    logErr("[HK] readLatestWeightKg", e);
    return null;
  }
}

export async function readRespiratoryRateLatest(): Promise<number | null> {
  try {
    return withHK(async (HK) => {
      if ((HK as any).getMostRecentQuantitySample) {
        const s = await (HK as any).getMostRecentQuantitySample(
          HK_TYPES.respiratoryRate,
          QTY_UNIT.respiratoryRate
        );
        const rr = Number(s?.quantity ?? s?.value ?? 0) || 0;
        log("[HK] latest respiratoryRate →", rr ?? "null");
        return rr > 0 ? rr : null;
      }
      // Fallback to daily average today
      const { startISO, endISO } = todayRangeLocal();
      const rows = await getStatisticsCollection({
        metric: "respiratoryRate",
        start: new Date(startISO),
        end: new Date(endISO),
        interval: "day",
      });
      const v = rows.length ? Number(rows[rows.length - 1].value || 0) : 0;
      return v > 0 ? Math.round(v) : null;
    });
  } catch (e) {
    logErr("[HK] readRespiratoryRateLatest", e);
    return null;
  }
}

// ───────────────────────── Buckets (24h → hourly; 7/30/90 → daily) ─────────────────────────
export async function read24hBuckets(
  metric: Extract<MetricKey, "steps" | "floors" | "distance" | "activeCalories">
): Promise<Bucket[]> {
  try {
    const { startISO, endISO } = last24hLocal();
    const rows = await getStatisticsCollection({
      metric,
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "hour",
    });
    return rows.map((r) => ({
      start: r.start,
      end: r.end,
      value: Math.max(0, Math.round(r.value)),
    }));
  } catch (e) {
    logErr(`[HK] read24hBuckets(${metric})`, e);
    return [];
  }
}

export async function read7dBuckets(
  metric: Extract<MetricKey, "steps" | "floors" | "distance" | "activeCalories">
): Promise<Bucket[]> {
  try {
    const { startISO, endISO } = lastNDaysLocal(7);
    const rows = await getStatisticsCollection({
      metric,
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    const last = rows[rows.length - 1];
    log(`[HK] last daily bucket for ${metric} →`, last);
    logRows(`[HK] 7d ${metric} buckets →`, rows);
    if (rows.length) {
      const last = rows[rows.length - 1];
      log("[HK] 7d last bin window:", last.start, "→", last.end);
    }

    return rows.map((r) => ({
      start: r.start,
      end: r.end,
      value: Math.max(0, Math.round(r.value)),
    }));
  } catch (e) {
    logErr(`[HK] read7dBuckets(${metric})`, e);
    return [];
  }
}

export async function read30dBuckets(
  metric: Extract<MetricKey, "steps" | "floors" | "distance" | "activeCalories">
): Promise<Bucket[]> {
  try {
    const { startISO, endISO } = lastNDaysLocal(30);
    const rows = await getStatisticsCollection({
      metric,
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows(`[HK] 30d ${metric} buckets →`, rows);
    return rows.map((r) => ({
      start: r.start,
      end: r.end,
      value: Math.max(0, Math.round(r.value)),
    }));
  } catch (e) {
    logErr(`[HK] read30dBuckets(${metric})`, e);
    return [];
  }
}

export async function read90dBuckets(
  metric: Extract<MetricKey, "steps" | "floors" | "distance" | "activeCalories">
): Promise<Bucket[]> {
  try {
    const { startISO, endISO } = lastNDaysLocal(90);
    const rows = await getStatisticsCollection({
      metric,
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows(`[HK] 90d ${metric} buckets →`, rows);
    return rows.map((r) => ({
      start: r.start,
      end: r.end,
      value: Math.max(0, Math.round(r.value)),
    }));
  } catch (e) {
    logErr(`[HK] read90dBuckets(${metric})`, e);
    return [];
  }
}

// ───────────────────────── Heart Rate ─────────────────────────
export async function readHeartRateHourly24(): Promise<Bucket[]> {
  try {
    const { startISO, endISO } = last24hLocal();
    const rows = await getStatisticsCollection({
      metric: "heartRate",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "hour",
    });
    logRows(`[HK] 24h heartRate buckets →`, rows);
    // average bpm per hour
    return rows.map((r) => ({
      start: r.start,
      end: r.end,
      value: Math.round(r.value || 0),
    }));
  } catch (e) {
    logErr("[HK] readHeartRateHourly24", e);
    return [];
  }
}

export async function readHeartRateDailyBuckets(
  days: 7 | 30 | 90
): Promise<Bucket[]> {
  try {
    const { startISO, endISO } = lastNDaysLocal(days);
    const rows = await getStatisticsCollection({
      metric: "heartRate",
      start: new Date(startISO),
      end: new Date(endISO),
      interval: "day",
    });
    logRows(`[HK] ${days}d heartRate buckets →`, rows);
    return rows.map((r) => ({
      start: r.start,
      end: r.end,
      value: Math.round(r.value || 0),
    }));
  } catch (e) {
    logErr("[HK] readHeartRateDailyBuckets", e);
    return [];
  }
}

// ───────────────────────── Sleep (minutes) ─────────────────────────
// We treat all non-“inBed only” categories as sleep minutes. If your data model
// needs only “asleep” phases, filter values accordingly.

const SLEEP_TYPE = HK_TYPES.sleep;

async function querySleepCategorySamples(daysBack: number) {
  return withHK(async (HK) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = addDays(startOfDay(new Date()), -daysBack);

    const qcs = (HK as any).queryCategorySamples;
    if (!qcs) return [];

    try {
      const arr = await qcs(SLEEP_TYPE, {
        startDate: start,
        endDate: end,
      });
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      logErr("[HK] queryCategorySamples failed", e);
      return [];
    }
  });
}

export async function readTodaySleepTotalMinutes(): Promise<number> {
  try {
    const samples = await querySleepCategorySamples(1);
    const today0 = startOfDay(new Date());
    const tomorrow0 = addDays(today0, 1);
    let minutes = 0;
    for (const s of samples) {
      // Typical structure: { startDate, endDate, value } where value indicates phase
      const sStart = new Date(s.startDate);
      const sEnd = new Date(s.endDate ?? s.startDate);
      const overlapStart = clamp(sStart, today0, tomorrow0);
      const overlapEnd = clamp(sEnd, today0, tomorrow0);
      if (overlapEnd > overlapStart) {
        // If you want ONLY “asleep” (not inBed), filter value here:
        // e.g., if (s.value !== HK.sleepValueAsleep) continue;
        minutes += Math.round(
          (overlapEnd.getTime() - overlapStart.getTime()) / 60000
        );
      }
    }
    return Math.max(0, minutes);
  } catch (e) {
    logErr("[HK] readTodaySleepTotalMinutes", e);
    return 0;
  }
}

export async function readSleepHourlyBuckets24(): Promise<Bucket[]> {
  try {
    const end = new Date();
    const start = addHours(end, -24);
    const hours = hoursBetween(start, end);
    const bins = hours.map((h) => ({
      start: h,
      end: addHours(h, 1),
      value: 0,
    }));

    const samples = await querySleepCategorySamples(2); // include spillover
    for (const s of samples) {
      const sStart = new Date(s.startDate);
      const sEnd = new Date(s.endDate ?? s.startDate);
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        const overlapStart = clamp(sStart, b.start, b.end);
        const overlapEnd = clamp(sEnd, b.start, b.end);
        if (overlapEnd > overlapStart) {
          // (Optionally filter by category value if needed)
          const mins = Math.round(
            (overlapEnd.getTime() - overlapStart.getTime()) / 60000
          );
          bins[i].value += mins;
        }
      }
    }
    return bins.map((b) => ({
      start: iso(b.start),
      end: iso(b.end!),
      value: Math.max(0, b.value),
    }));
  } catch (e) {
    logErr("[HK] readSleepHourlyBuckets24", e);
    return [];
  }
}

export async function readSleepDailyBuckets(
  days: 7 | 30 | 90
): Promise<Bucket[]> {
  try {
    const samples = await querySleepCategorySamples(days);
    const { startISO, endISO } = lastNDaysLocal(days);
    const start = new Date(startISO);
    const end = new Date(endISO);
    const daysArr = daysBetween(start, end);
    const bins = daysArr.map((d) => ({
      start: d,
      end: addDays(d, 1),
      value: 0,
    }));

    for (const s of samples) {
      const sStart = new Date(s.startDate);
      const sEnd = new Date(s.endDate ?? s.startDate);
      for (let i = 0; i < bins.length; i++) {
        const b = bins[i];
        const overlapStart = clamp(sStart, b.start, b.end);
        const overlapEnd = clamp(sEnd, b.start, b.end);
        if (overlapEnd > overlapStart) {
          const mins = Math.round(
            (overlapEnd.getTime() - overlapStart.getTime()) / 60000
          );
          bins[i].value += mins;
        }
      }
    }
    return bins.map((b) => ({
      start: iso(b.start),
      end: iso(b.end!),
      value: Math.max(0, b.value),
    }));
  } catch (e) {
    logErr("[HK] readSleepDailyBuckets", e);
    return [];
  }
}

export async function readSleepSessions(
  days: 7 | 30 | 90
): Promise<Array<{ start: string; end: string; minutes: number }>> {
  try {
    const samples = await querySleepCategorySamples(days);
    const out: Array<{ start: string; end: string; minutes: number }> = [];
    for (const s of samples) {
      const sStart = new Date(s.startDate);
      const sEnd = new Date(s.endDate ?? s.startDate);
      const minutes = Math.max(
        0,
        Math.round((sEnd.getTime() - sStart.getTime()) / 60000)
      );
      out.push({
        start: sStart.toISOString(),
        end: sEnd.toISOString(),
        minutes,
      });
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  } catch (e) {
    logErr("[HK] readSleepSessions", e);
    return [];
  }
}

// --- Quick raw-sample and latest-value probe ---
export async function hkDebugRaw() {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 7);

    // helper to peek raw quantity samples
    async function peekQty(label: string, typeId: any, unit: string) {
      const HK = await import("@kingstinct/react-native-healthkit");
      const qqs = (HK as any).queryQuantitySamples;
      if (!qqs) {
        log(`[HK] ${label}: queryQuantitySamples missing`);
        return;
      }
      const rows = await qqs(typeId, {
        unit,
        startDate: start,
        endDate: end,
        limit: 5,
        ascending: false,
      });
      log(
        `[HK] RAW ${label} → count=${Array.isArray(rows) ? rows.length : 0} head=${JSON.stringify(rows?.slice(0, 2) ?? [])}`
      );
    }

    await peekQty("steps", HK_TYPES.steps, "count");
    await peekQty("floors", HK_TYPES.floors, "count");
    await peekQty("distance", HK_TYPES.distance, "m");
    await peekQty("activeCalories", HK_TYPES.activeCalories, "kcal");
    await peekQty("heartRate", HK_TYPES.heartRate, "count/min");
    await peekQty("weight", HK_TYPES.weight, "kg");
    await peekQty("respiratoryRate", HK_TYPES.respiratoryRate, "count/min");

    // category (sleep)
    const HK = await import("@kingstinct/react-native-healthkit");
    const qcs = (HK as any).queryCategorySamples;
    if (qcs) {
      const sleep = await qcs(HK_TYPES.sleep, {
        startDate: start,
        endDate: end,
        limit: 5,
        ascending: false,
      });
      log(
        `[HK] RAW sleep → count=${Array.isArray(sleep) ? sleep.length : 0} head=${JSON.stringify(sleep?.slice(0, 2) ?? [])}`
      );
    }

    // “latest” helpers (where supported)
    if ((HK as any).getMostRecentQuantitySample) {
      const latestHR = await (HK as any).getMostRecentQuantitySample(
        HK_TYPES.heartRate,
        "count/min"
      );
      const latestW = await (HK as any).getMostRecentQuantitySample(
        HK_TYPES.weight,
        "kg"
      );
      const latestRR = await (HK as any).getMostRecentQuantitySample(
        HK_TYPES.respiratoryRate,
        "count/min"
      );
      log(
        `[HK] LATEST hr=${latestHR?.quantity ?? latestHR?.value ?? null} @ ${latestHR?.endDate ?? latestHR?.startDate ?? "—"}`
      );
      log(
        `[HK] LATEST weight=${latestW?.quantity ?? latestW?.value ?? null} @ ${latestW?.endDate ?? latestW?.startDate ?? "—"}`
      );
      log(
        `[HK] LATEST rr=${latestRR?.quantity ?? latestRR?.value ?? null} @ ${latestRR?.endDate ?? latestRR?.startDate ?? "—"}`
      );
    }
  } catch (e) {
    logErr("[HK] hkDebugRaw failed", e);
  }
}

// ───────────────────────── Background observers (HKObserverQuery + delivery) ─────────────────────────

let _hkBgRemovers: Array<() => void> = [];
let _hkBgActive = false;

export async function hkStartBackgroundObservers(
  onChange?: (id: SampleTypeIdentifier) => void
) {
  if (Platform.OS !== "ios") return false;
  if (_hkBgActive) return true;

  try {
    const HK = await import("@kingstinct/react-native-healthkit");

    const typeIds: SampleTypeIdentifier[] = [
      HK_TYPES.steps,
      HK_TYPES.floors,
      HK_TYPES.distance,
      HK_TYPES.activeCalories,
      HK_TYPES.heartRate,
      HK_TYPES.weight,
      HK_TYPES.respiratoryRate,
      HK_TYPES.sleep,
    ];

    function makeDebounced(fn: (id: SampleTypeIdentifier) => void, ms = 800) {
      let timer: any;
      return (id: SampleTypeIdentifier) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(id), ms);
      };
    }

    const localOnChange = makeDebounced(
      onChange ?? ((id) => log("[HK][BG] change for", id)),
      800
    );

    // 1) Ask iOS to wake us when data changes
    for (const t of typeIds) {
      try {
        if ((HK as any).enableBackgroundDelivery) {
          try {
            await (HK as any).enableBackgroundDelivery(
              t,
              HK.UpdateFrequency.immediate
            );
          } catch (e) {
            logErr("[HK][BG] enableBackgroundDelivery failed", e, t);
          }
        } else {
          log("[HK][BG] enableBackgroundDelivery unavailable for", t);
        }
      } catch (e) {
        logErr("[HK][BG] enableBackgroundDelivery failed", e, t);
      }
    }

    // 2) Subscribe → returns a string id; store a remover that calls unsubscribeQuery(id)
    _hkBgRemovers = [];
    for (const t of typeIds) {
      try {
        const id: string = HK.subscribeToChanges(t, () => {
          try {
            localOnChange(t);
          } catch {}
        });
        _hkBgRemovers.push(() => {
          try {
            (HK as any).unsubscribeQuery?.(id);
          } catch {}
        });
      } catch (e) {
        logErr("[HK][BG] subscribeToChanges failed", e, t);
      }
    }

    _hkBgActive = true;
    log("[HK][BG] observers active for", _hkBgRemovers.length, "types");
    return true;
  } catch (e) {
    logErr("[HK][BG] start failed", e);
    return false;
  }
}

export async function hkStopBackgroundObservers() {
  if (Platform.OS !== "ios") return true;
  try {
    const HK = await import("@kingstinct/react-native-healthkit");

    // remove JS-level subscriptions (calls unsubscribeQuery on each id)
    for (const rm of _hkBgRemovers) {
      try {
        rm();
      } catch {}
    }
    _hkBgRemovers = [];

    // and stop background delivery
    try {
      await HK.disableAllBackgroundDelivery();
    } catch {}

    _hkBgActive = false;
    log("[HK][BG] observers stopped");
    return true;
  } catch (e) {
    logErr("[HK][BG] stop failed", e);
    return false;
  }
}
