// src/services/sharing/summarizer.ts
// Summarizes Health Connect data for an arbitrary [fromUtc, toUtc) window (UTC ISO).
// Real data only. No mocks. Works with producer’s hasData logic.
// Window semantics: inclusive start, exclusive end.

import {
  ensureInitialized,
  hasReadPermission,
  hcReadHeartRateInWindow,
  hcReadHourlyBucketsInWindow,
  hcReadSleepMinutesInWindow,
  hcReadSumInWindow,
  type Window as HCWindow,
} from "@/src/services/tracking/healthconnect";
import {
  hkIsMetricEffectivelyReadable,
  hkReadHeartRateInWindow,
  hkReadHeartRateLatest,
  hkReadHourlyBucketsInWindow,
  hkReadSleepMinutesInWindow,
  hkReadSumInWindow,
  type Window as HKWindow,
  type MetricKey as IOSMetricKey,
} from "@/src/services/tracking/healthkit";

import { Platform } from "react-native";
const TAG = "[SHARE][Sum]";

export type MetricCode =
  | "STEPS"
  | "FLOORS"
  | "DISTANCE"
  | "KCAL"
  | "HR"
  | "SLEEP";

// Map our summarizer MetricCode → iOS HealthKit MetricKey
const IOS_METRIC_MAP: Record<MetricCode, IOSMetricKey> = {
  STEPS: "steps",
  FLOORS: "floors",
  DISTANCE: "distance",
  KCAL: "activeCalories",
  HR: "heartRate",
  SLEEP: "sleep",
};

export type MetricSummary = {
  metricCode: MetricCode;
  unitCode: "COUNT" | "M" | "KCAL" | "BPM" | "MIN";
  totalValue?: number | null;
  avgValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  samplesCount?: number | null;
  computedJson?: any;
};

type Between = { operator: "between"; startTime: string; endTime: string };

type HRComputedBucket = {
  start: string;
  end: string;
  value: number;
  min?: number;
  max?: number;
  count?: number;
};

// ---------- helpers ----------

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const metersOf = (r: any) => {
  const d = r?.distance;
  if (typeof d === "number") return d;
  return (
    toNum(d?.inMeters?.value) ||
    toNum(d?.inMeters) ||
    toNum(d?.inKilometers) * 1000 ||
    toNum(d?.value) ||
    0
  );
};

const kcalOf = (r: any) => {
  const e = r?.energy;
  if (typeof e === "number") return e;
  return (
    toNum(e?.inKilocalories?.value) ||
    toNum(e?.inKilocalories) ||
    toNum(e?.inCalories) / 1000 ||
    toNum(e?.value) ||
    toNum(r?.calories) ||
    0
  );
};

// async function permissionOk(metric: MetricCode): Promise<boolean> {
//   if (Platform.OS === "android") {
//     const map: Record<MetricCode, string> = {
//       STEPS: "steps",
//       FLOORS: "floors",
//       DISTANCE: "distance",
//       KCAL: "activeCalories",
//       HR: "heartRate",
//       SLEEP: "sleep",
//     };

//     return hasReadPermission(map[metric] as any);
//   }
//   if (Platform.OS === "ios") {
//     // iOS: silent availability/authorization probe (no prompt here)
//     const res = await iosEnsureAuthorized();
//     if (!res.available || !res.granted) return false;

//     // All metrics we summarize are supported in Phase-1
//     // (fine-grained checks can be added later if needed)
//     return true;
//   }

//   return false;
// }

async function permissionOk(metric: MetricCode): Promise<boolean> {
  if (Platform.OS === "android") {
    const map: Record<MetricCode, string> = {
      STEPS: "steps",
      FLOORS: "floors",
      DISTANCE: "distance",
      KCAL: "activeCalories",
      HR: "heartRate",
      SLEEP: "sleep",
    };
    return hasReadPermission(map[metric] as any);
  }

  if (Platform.OS === "ios") {
    const key = IOS_METRIC_MAP[metric];
    if (!key) {
      return false;
    }

    // Data-based probe from healthkit.ts:
    // - true  → HealthKit available and metric appears readable (non-zero data in probe window)
    // - false → either unavailable, denied, or effectively zero-data
    return hkIsMetricEffectivelyReadable(key);
  }

  // Other platforms (or unexpected path)
  return false;
}
// ---------- main ----------

/**
 * Summarize a single metric over [fromUtcISO, toUtcISO) in UTC.
 * - Returns null if permission missing or underlying read fails (logged).
 * - When opts.probeOnly, returns null for zero data (so Day-0 decision can short-circuit).
 */
export async function summarizeWindow(
  metric: MetricCode,
  fromUtcISO: string,
  toUtcISO: string,
  opts?: { probeOnly?: boolean; bucketMinutes?: number },
): Promise<MetricSummary | null> {
  if (Platform.OS === "android") {
    await ensureInitialized();
  }

  if (!(await permissionOk(metric))) {
    console.log(TAG, metric, "permission=false");
    return null;
  }

  const startMs = new Date(fromUtcISO).getTime();
  const endMs = new Date(toUtcISO).getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    console.log(TAG, metric, "invalid range", { fromUtcISO, toUtcISO });
    return null;
  }
  if (__DEV__) {
    console.log(TAG, "range", {
      metric,
      fromUtcISO,
      toUtcISO,
      startMs,
      endMs,
      spanMin: Math.round((endMs - startMs) / 60000),
    });
  }

  // Bucket sizing:
  // - Default remains hourly (60) unless caller explicitly requests smaller buckets.
  // - Sharing pipeline will pass 5; other app features can keep hourly by not passing it.
  const bucketMinutes = Number.isFinite(Number(opts?.bucketMinutes))
    ? Math.max(1, Math.floor(Number(opts?.bucketMinutes)))
    : 60;

  const useHourlyShape = bucketMinutes === 60;

  // Health Connect filter; API treats this as an interval—HC handles borders internally.
  // We still clamp manually where we iterate raw samples (HR / SLEEP) to enforce [start, end).
  const range: Between = {
    operator: "between",
    startTime: fromUtcISO,
    endTime: toUtcISO,
  };

  // iOS path: use HealthKit helpers, return same MetricSummary shape
  if (Platform.OS === "ios") {
    const win: HKWindow = { fromUtc: fromUtcISO, toUtc: toUtcISO };

    switch (metric) {
      case "STEPS": {
        const { sum } = await hkReadSumInWindow("steps", win);
        const buckets = await hkReadHourlyBucketsInWindow(
          "steps",
          win,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "STEPS",
          unitCode: "COUNT",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthkit", hourlyBuckets: buckets }
            : { source: "healthkit", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "FLOORS": {
        const { sum } = await hkReadSumInWindow("floors", win);
        const buckets = await hkReadHourlyBucketsInWindow(
          "floors",
          win,
          bucketMinutes,
        );
        const ms: MetricSummary = {
          metricCode: "FLOORS",
          unitCode: "COUNT",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthkit", hourlyBuckets: buckets }
            : { source: "healthkit", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "DISTANCE": {
        const { sum } = await hkReadSumInWindow("distance", win);
        const buckets = await hkReadHourlyBucketsInWindow(
          "distance",
          win,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "DISTANCE",
          unitCode: "M",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthkit", hourlyBuckets: buckets }
            : { source: "healthkit", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "KCAL": {
        const { sum } = await hkReadSumInWindow("activeCalories", win);
        const buckets = await hkReadHourlyBucketsInWindow(
          "activeCalories",
          win,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "KCAL",
          unitCode: "KCAL",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthkit", hourlyBuckets: buckets }
            : { source: "healthkit", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "SLEEP": {
        const { minutes } = await hkReadSleepMinutesInWindow(win);
        const buckets = await hkReadHourlyBucketsInWindow(
          "sleep",
          win,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "SLEEP",
          unitCode: "MIN",
          totalValue: minutes,
          computedJson: useHourlyShape
            ? { source: "healthkit", hourlyBuckets: buckets }
            : { source: "healthkit", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (minutes > 0 ? ms : null) : ms;
      }

      // case "HR": {
      //   const { avgBpm, minBpm, maxBpm, points } =
      //     await hkReadHeartRateInWindow(win);
      //   const count = Array.isArray(points) ? points.length : undefined;
      //   const empty = !avgBpm && !minBpm && !maxBpm && !count;

      //   if (opts?.probeOnly && empty) return null;

      //   const ms: MetricSummary = {
      //     metricCode: "HR",
      //     unitCode: "BPM",
      //     avgValue: avgBpm ?? null,
      //     minValue: minBpm ?? null,
      //     maxValue: maxBpm ?? null,
      //     samplesCount: count ?? null,
      //   };
      //   return ms;
      // }

      case "HR": {
        const { avgBpm, minBpm, maxBpm } = await hkReadHeartRateInWindow(win);

        // If stats query returns empty for this window, fall back to the latest sample
        // (only if it is inside [fromUtcISO, toUtcISO)).
        let avg = avgBpm;
        let min = minBpm;
        let max = maxBpm;
        let samplesCount: number | null = null;

        const statsEmpty = !Number.isFinite(Number(avg)) || Number(avg) <= 0;

        if (statsEmpty) {
          const latest = await hkReadHeartRateLatest(); // { bpm, atISO? }
          const bpm = latest?.bpm ?? null;
          const atISO = latest?.atISO;

          if (bpm != null && Number.isFinite(bpm) && bpm > 0 && atISO) {
            const t = new Date(atISO).getTime();
            if (Number.isFinite(t) && t >= startMs && t < endMs) {
              avg = bpm;
              min = bpm;
              max = bpm;
              samplesCount = 1;
            }
          }
        }

        const hasAny =
          (avg != null && Number.isFinite(avg) && avg > 0) ||
          (min != null && Number.isFinite(min) && min > 0) ||
          (max != null && Number.isFinite(max) && max > 0) ||
          (samplesCount ?? 0) > 0;

        if (opts?.probeOnly && !hasAny) return null;

        const buckets = await hkReadHourlyBucketsInWindow(
          "heartRate",
          win,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "HR",
          unitCode: "BPM",
          avgValue: avg != null && Number.isFinite(avg) ? avg : null,
          minValue: min != null && Number.isFinite(min) ? min : null,
          maxValue: max != null && Number.isFinite(max) ? max : null,
          samplesCount,
          computedJson: useHourlyShape
            ? {
                source: statsEmpty ? "latestSampleFallback" : "statistics",
                hourlyBuckets: buckets,
              }
            : {
                source: statsEmpty ? "latestSampleFallback" : "statistics",
                bucketMinutes,
                buckets,
              },
        };

        return ms;
      }
    }
  }

  // try {
  //   switch (metric) {
  //     case "STEPS": {
  //       // Prefer aggregate; fallback to raw.
  //       let total = 0;
  //       try {
  //         const a = await aggregateRecord({
  //           recordType: "Steps",
  //           timeRangeFilter: range,
  //         });
  //         total = toNum((a as any)?.result?.COUNT_TOTAL);
  //       } catch {}
  //       if (total <= 0) {
  //         const out = await readRecords("Steps", {
  //           timeRangeFilter: range,
  //           pageSize: 1000,
  //           ascendingOrder: true,
  //         });
  //         total = (out.records ?? []).reduce(
  //           (s: number, r: any) => s + toNum(r?.count),
  //           0
  //         );
  //       }
  //       const ms: MetricSummary = {
  //         metricCode: "STEPS",
  //         unitCode: "COUNT",
  //         totalValue: total,
  //       };
  //       console.log(TAG, "STEPS", fromUtcISO, "→", toUtcISO, "total=", total);
  //       return opts?.probeOnly ? (total > 0 ? ms : null) : ms;
  //     }

  //     case "FLOORS": {
  //       let total = 0;
  //       try {
  //         const a = await aggregateRecord({
  //           recordType: "FloorsClimbed",
  //           timeRangeFilter: range,
  //         });
  //         total = toNum((a as any)?.result?.FLOORS_CLIMBED_TOTAL);
  //       } catch {}
  //       if (total <= 0) {
  //         const out = await readRecords("FloorsClimbed", {
  //           timeRangeFilter: range,
  //           pageSize: 1000,
  //           ascendingOrder: true,
  //         });
  //         total = (out.records ?? []).reduce(
  //           (s: number, r: any) => s + toNum(r?.floors?.value ?? r?.floors),
  //           0
  //         );
  //       }
  //       const ms: MetricSummary = {
  //         metricCode: "FLOORS",
  //         unitCode: "COUNT",
  //         totalValue: total,
  //       };
  //       console.log(TAG, "FLOORS total=", total);
  //       return opts?.probeOnly ? (total > 0 ? ms : null) : ms;
  //     }

  //     case "DISTANCE": {
  //       let meters = 0;
  //       try {
  //         const a = await aggregateRecord({
  //           recordType: "Distance",
  //           timeRangeFilter: range,
  //         });
  //         const v = (a as any)?.result?.DISTANCE_TOTAL;
  //         meters = toNum(v?.inMeters?.value) || toNum(v?.inMeters) || toNum(v);
  //       } catch {}
  //       if (meters <= 0) {
  //         const out = await readRecords("Distance", {
  //           timeRangeFilter: range,
  //           pageSize: 1000,
  //           ascendingOrder: true,
  //         });
  //         meters = (out.records ?? []).reduce(
  //           (s: number, r: any) => s + metersOf(r),
  //           0
  //         );
  //       }
  //       const ms: MetricSummary = {
  //         metricCode: "DISTANCE",
  //         unitCode: "M",
  //         totalValue: meters,
  //       };
  //       console.log(TAG, "DISTANCE meters=", meters);
  //       return opts?.probeOnly ? (meters > 0 ? ms : null) : ms;
  //     }

  //     case "KCAL": {
  //       let kcal = 0;
  //       try {
  //         const a = await aggregateRecord({
  //           recordType: "ActiveCaloriesBurned",
  //           timeRangeFilter: range,
  //         });
  //         const v = (a as any)?.result?.ACTIVE_CALORIES_TOTAL;
  //         kcal =
  //           toNum(v?.inKilocalories?.value) ||
  //           toNum(v?.inKilocalories) ||
  //           toNum(v?.value);
  //       } catch {}
  //       if (kcal <= 0) {
  //         const out = await readRecords("ActiveCaloriesBurned", {
  //           timeRangeFilter: range,
  //           pageSize: 1000,
  //           ascendingOrder: true,
  //         });
  //         kcal = (out.records ?? []).reduce(
  //           (s: number, r: any) => s + kcalOf(r),
  //           0
  //         );
  //       }
  //       const ms: MetricSummary = {
  //         metricCode: "KCAL",
  //         unitCode: "KCAL",
  //         totalValue: kcal,
  //       };
  //       console.log(TAG, "KCAL=", kcal);
  //       return opts?.probeOnly ? (kcal > 0 ? ms : null) : ms;
  //     }

  //     case "SLEEP": {
  //       const out = await readRecords("SleepSession", {
  //         timeRangeFilter: range,
  //         pageSize: 2000,
  //         ascendingOrder: true,
  //       });
  //       if (__DEV__)
  //         console.log(TAG, "SLEEP sessions=", out.records?.length ?? 0);
  //       const minutes = Math.round(
  //         (out.records ?? []).reduce((acc: number, r: any) => {
  //           const s = new Date(r.startTime).getTime();
  //           const e = new Date(r.endTime).getTime();
  //           // clamp to [startMs, endMs)
  //           const clipped = Math.max(
  //             0,
  //             Math.min(e, endMs) - Math.max(s, startMs)
  //           );
  //           return acc + clipped;
  //         }, 0) / 60000
  //       );
  //       const ms: MetricSummary = {
  //         metricCode: "SLEEP",
  //         unitCode: "MIN",
  //         totalValue: minutes,
  //       };
  //       console.log(TAG, "SLEEP minutes=", minutes);
  //       return opts?.probeOnly ? (minutes > 0 ? ms : null) : ms;
  //     }

  //     case "HR": {
  //       const out = await readRecords("HeartRate", {
  //         timeRangeFilter: range,
  //         pageSize: 2000,
  //         ascendingOrder: true,
  //       });
  //       if (__DEV__)
  //         console.log(TAG, "HR readRecords count=", out.records?.length ?? 0);
  //       let sum = 0;
  //       let count = 0;
  //       let min = Infinity;
  //       let max = -Infinity;

  //       for (const r of (out.records ?? []) as any[]) {
  //         const samples = Array.isArray(r?.samples) ? r.samples : [];
  //         for (const s of samples) {
  //           const t = new Date(s.time).getTime();
  //           // Enforce [start, end)
  //           if (t >= startMs && t < endMs) {
  //             const bpm = toNum(s.beatsPerMinute, NaN);
  //             if (!Number.isFinite(bpm)) continue;
  //             sum += bpm;
  //             count += 1;
  //             if (bpm < min) min = bpm;
  //             if (bpm > max) max = bpm;
  //           }
  //         }
  //       }

  //       if (count === 0) {
  //         console.log(TAG, "HR no samples");
  //         const empty: MetricSummary = {
  //           metricCode: "HR",
  //           unitCode: "BPM",
  //           avgValue: null,
  //           minValue: null,
  //           maxValue: null,
  //           samplesCount: 0,
  //         };
  //         return opts?.probeOnly ? null : empty;
  //       }

  //       const avg = Math.round((sum / count) * 10) / 10;
  //       const ms: MetricSummary = {
  //         metricCode: "HR",
  //         unitCode: "BPM",
  //         avgValue: avg,
  //         minValue: min,
  //         maxValue: max,
  //         samplesCount: count,
  //       };
  //       console.log(TAG, "HR avg/min/max/samples=", avg, min, max, count);
  //       if (__DEV__) console.log(TAG, "HR samples counted=", count);
  //       return ms;
  //     }
  //   }
  // } catch (e: any) {
  //   console.log(TAG, metric, "error:", e?.message ?? e);
  //   return null;
  // }

  try {
    const winAndroid: HCWindow = { fromUtc: fromUtcISO, toUtc: toUtcISO };

    switch (metric) {
      case "STEPS": {
        const { sum } = await hcReadSumInWindow("steps", winAndroid);
        const buckets = await hcReadHourlyBucketsInWindow(
          "steps",
          winAndroid,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "STEPS",
          unitCode: "COUNT",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthconnect", hourlyBuckets: buckets }
            : { source: "healthconnect", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "FLOORS": {
        const { sum } = await hcReadSumInWindow("floors", winAndroid);
        const buckets = await hcReadHourlyBucketsInWindow(
          "floors",
          winAndroid,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "FLOORS",
          unitCode: "COUNT",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthconnect", hourlyBuckets: buckets }
            : { source: "healthconnect", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "DISTANCE": {
        const { sum } = await hcReadSumInWindow("distance", winAndroid);
        const buckets = await hcReadHourlyBucketsInWindow(
          "distance",
          winAndroid,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "DISTANCE",
          unitCode: "M",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthconnect", hourlyBuckets: buckets }
            : { source: "healthconnect", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "KCAL": {
        const { sum } = await hcReadSumInWindow("activeCalories", winAndroid);
        const buckets = await hcReadHourlyBucketsInWindow(
          "activeCalories",
          winAndroid,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "KCAL",
          unitCode: "KCAL",
          totalValue: sum,
          computedJson: useHourlyShape
            ? { source: "healthconnect", hourlyBuckets: buckets }
            : { source: "healthconnect", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (sum > 0 ? ms : null) : ms;
      }

      case "SLEEP": {
        const { minutes } = await hcReadSleepMinutesInWindow(winAndroid);
        const buckets = await hcReadHourlyBucketsInWindow(
          "sleep",
          winAndroid,
          bucketMinutes,
        );

        const ms: MetricSummary = {
          metricCode: "SLEEP",
          unitCode: "MIN",
          totalValue: minutes,
          computedJson: useHourlyShape
            ? { source: "healthconnect", hourlyBuckets: buckets }
            : { source: "healthconnect", bucketMinutes, buckets },
        };

        return opts?.probeOnly ? (minutes > 0 ? ms : null) : ms;
      }

      case "HR": {
        const { avgBpm, minBpm, maxBpm } =
          await hcReadHeartRateInWindow(winAndroid);

        const rawBuckets = await hcReadHourlyBucketsInWindow(
          "heartRate",
          winAndroid,
          bucketMinutes,
        );

        const hrBuckets: HRComputedBucket[] = (rawBuckets ?? []).map(
          (b: any) => ({
            start: b.start,
            end: b.end,
            value: Number(b.value || 0),
            min: Number(b.min || 0),
            max: Number(b.max || 0),
            count: Number(b.count || 0),
          }),
        );

        const samplesCount = hrBuckets.reduce(
          (sum, b) => sum + Math.max(0, Number(b.count || 0)),
          0,
        );

        const bucketsWithData = hrBuckets.filter(
          (b) => Number(b.count || 0) > 0,
        ).length;

        const hasAny =
          (avgBpm != null && Number.isFinite(avgBpm) && avgBpm > 0) ||
          (minBpm != null && Number.isFinite(minBpm) && minBpm > 0) ||
          (maxBpm != null && Number.isFinite(maxBpm) && maxBpm > 0) ||
          samplesCount > 0 ||
          bucketsWithData > 0;

        if (opts?.probeOnly && !hasAny) return null;

        if (__DEV__) {
          console.log(TAG, "HR android summary", {
            fromUtcISO,
            toUtcISO,
            bucketMinutes,
            avgBpm,
            minBpm,
            maxBpm,
            samplesCount,
            bucketsWithData,
            bucketCount: hrBuckets.length,
          });
        }

        const ms: MetricSummary = {
          metricCode: "HR",
          unitCode: "BPM",
          avgValue: avgBpm ?? null,
          minValue: minBpm ?? null,
          maxValue: maxBpm ?? null,
          samplesCount,
          computedJson: useHourlyShape
            ? {
                source: "healthconnect",
                hourlyBuckets: hrBuckets,
              }
            : {
                source: "healthconnect",
                bucketMinutes,
                buckets: hrBuckets,
              },
        };

        return ms;
      }
    }
  } catch (e: any) {
    console.log(TAG, metric, "error:", e?.message ?? e);
    return null;
  }
}

export async function checkMetricPermissionsForMap(
  metricMap: Partial<Record<MetricCode, number>>,
): Promise<{ ok: boolean; missing: MetricCode[] }> {
  const present = (Object.keys(metricMap ?? {}) as MetricCode[]).filter(
    Boolean,
  );
  const missing: MetricCode[] = [];
  for (const m of present) {
    if (!(await permissionOk(m))) missing.push(m);
  }
  return { ok: missing.length === 0, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Data presence probes (24h window / arbitrary window)
// Notes:
// - This is intentionally separate from permissionOk() because iOS permissionOk()
//   currently uses hkIsMetricEffectivelyReadable (data-based), which would make
//   a "data check" redundant/circular.
// - These probes do NOT prompt. They only attempt reads and interpret results.
// - If a read throws (denied/unavailable/etc.), we treat it as "no data" and capture the error.
// ─────────────────────────────────────────────────────────────────────────────

export type MetricDataProbeResult = {
  ok: boolean;
  missingData: MetricCode[];
  presentData: MetricCode[];
  window: { fromUtcISO: string; toUtcISO: string };
  details: Partial<
    Record<
      MetricCode,
      { hasData: boolean; reason?: "NO_DATA" | "READ_ERROR"; error?: string }
    >
  >;
};

async function probeMetricHasDataInWindow(
  metric: MetricCode,
  fromUtcISO: string,
  toUtcISO: string,
): Promise<{
  hasData: boolean;
  reason?: "NO_DATA" | "READ_ERROR";
  error?: string;
}> {
  const startMs = new Date(fromUtcISO).getTime();
  const endMs = new Date(toUtcISO).getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return { hasData: false, reason: "READ_ERROR", error: "invalid window" };
  }

  try {
    if (Platform.OS === "android") {
      await ensureInitialized();

      // On Android we can do a true permission check before reading.
      const map: Record<MetricCode, string> = {
        STEPS: "steps",
        FLOORS: "floors",
        DISTANCE: "distance",
        KCAL: "activeCalories",
        HR: "heartRate",
        SLEEP: "sleep",
      };
      const hasPerm = await hasReadPermission(map[metric] as any);
      if (!hasPerm) {
        return {
          hasData: false,
          reason: "READ_ERROR",
          error: "permission=false",
        };
      }

      const winAndroid: HCWindow = { fromUtc: fromUtcISO, toUtc: toUtcISO };

      switch (metric) {
        case "STEPS": {
          const { sum } = await hcReadSumInWindow("steps", winAndroid);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "FLOORS": {
          const { sum } = await hcReadSumInWindow("floors", winAndroid);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "DISTANCE": {
          const { sum } = await hcReadSumInWindow("distance", winAndroid);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "KCAL": {
          const { sum } = await hcReadSumInWindow("activeCalories", winAndroid);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "SLEEP": {
          const { minutes } = await hcReadSleepMinutesInWindow(winAndroid);
          return minutes > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "HR": {
          const { avgBpm, minBpm, maxBpm } =
            await hcReadHeartRateInWindow(winAndroid);

          const rawBuckets = await hcReadHourlyBucketsInWindow(
            "heartRate",
            winAndroid,
            60,
          );

          const hrBuckets: HRComputedBucket[] = (rawBuckets ?? []).map(
            (b: any) => ({
              start: b.start,
              end: b.end,
              value: Number(b.value || 0),
              min: Number(b.min || 0),
              max: Number(b.max || 0),
              count: Number(b.count || 0),
            }),
          );

          const samplesCount = hrBuckets.reduce(
            (sum, b) => sum + Math.max(0, Number(b.count || 0)),
            0,
          );

          const hasAny =
            (avgBpm != null && Number.isFinite(avgBpm) && avgBpm > 0) ||
            (minBpm != null && Number.isFinite(minBpm) && minBpm > 0) ||
            (maxBpm != null && Number.isFinite(maxBpm) && maxBpm > 0) ||
            samplesCount > 0;

          return hasAny
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
      }
    }

    if (Platform.OS === "ios") {
      const win: HKWindow = { fromUtc: fromUtcISO, toUtc: toUtcISO };

      switch (metric) {
        case "STEPS": {
          const { sum } = await hkReadSumInWindow("steps", win);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "FLOORS": {
          const { sum } = await hkReadSumInWindow("floors", win);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "DISTANCE": {
          const { sum } = await hkReadSumInWindow("distance", win);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "KCAL": {
          const { sum } = await hkReadSumInWindow("activeCalories", win);
          return sum > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "SLEEP": {
          const { minutes } = await hkReadSleepMinutesInWindow(win);
          return minutes > 0
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
        case "HR": {
          const { avgBpm, minBpm, maxBpm } = await hkReadHeartRateInWindow(win);

          let avg = avgBpm;
          let min = minBpm;
          let max = maxBpm;
          let samplesCount = 0;

          const statsEmpty = !Number.isFinite(Number(avg)) || Number(avg) <= 0;
          if (statsEmpty) {
            const latest = await hkReadHeartRateLatest(); // { bpm, atISO? }
            const bpm = latest?.bpm ?? null;
            const atISO = latest?.atISO;
            if (bpm != null && Number.isFinite(bpm) && bpm > 0 && atISO) {
              const t = new Date(atISO).getTime();
              if (Number.isFinite(t) && t >= startMs && t < endMs) {
                avg = bpm;
                min = bpm;
                max = bpm;
                samplesCount = 1;
              }
            }
          }

          const hasAny =
            (avg != null && Number.isFinite(avg) && avg > 0) ||
            (min != null && Number.isFinite(min) && min > 0) ||
            (max != null && Number.isFinite(max) && max > 0) ||
            samplesCount > 0;

          return hasAny
            ? { hasData: true }
            : { hasData: false, reason: "NO_DATA" };
        }
      }
    }

    return {
      hasData: false,
      reason: "READ_ERROR",
      error: "unsupported platform",
    };
  } catch (e: any) {
    return {
      hasData: false,
      reason: "READ_ERROR",
      error: e?.message ?? String(e),
    };
  }
}

/**
 * Probe whether each metric has any data in [fromUtcISO, toUtcISO).
 * - Does NOT prompt.
 * - Treats read errors as missing data (and returns error details for diagnostics).
 */
export async function checkMetricDataInWindow(
  metrics: MetricCode[],
  fromUtcISO: string,
  toUtcISO: string,
): Promise<MetricDataProbeResult> {
  const uniq = Array.from(new Set((metrics ?? []).filter(Boolean)));

  const details: MetricDataProbeResult["details"] = {};
  const presentData: MetricCode[] = [];
  const missingData: MetricCode[] = [];

  for (const m of uniq) {
    const r = await probeMetricHasDataInWindow(m, fromUtcISO, toUtcISO);
    details[m] = r;
    if (r.hasData) presentData.push(m);
    else missingData.push(m);
  }

  return {
    ok: missingData.length === 0,
    missingData,
    presentData,
    window: { fromUtcISO, toUtcISO },
    details,
  };
}

/**
 * Convenience: last-24h probe ending "now".
 * Uses UTC ISO window: [now-24h, now).
 */
export async function checkMetricDataLast24Hours(
  metrics: MetricCode[],
  nowMs: number = Date.now(),
): Promise<MetricDataProbeResult> {
  const toUtcISO = new Date(nowMs).toISOString();
  const fromUtcISO = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  return checkMetricDataInWindow(metrics, fromUtcISO, toUtcISO);
}
