// src/services/sharing/summarizer.ts
// Summarizes Health Connect data for an arbitrary [fromUtc, toUtc) window (UTC ISO).
// Real data only. No mocks. Works with producer’s hasData logic.
// Window semantics: inclusive start, exclusive end.

import { ensureInitialized, hasReadPermission } from '@/src/services/tracking/healthconnect';
import { Platform } from 'react-native';
import { aggregateRecord, readRecords } from 'react-native-health-connect';

const TAG = '[SHARE][Sum]';

export type MetricCode = 'STEPS' | 'FLOORS' | 'DISTANCE' | 'KCAL' | 'HR' | 'SLEEP';

export type MetricSummary = {
  metricCode: MetricCode;
  unitCode: 'COUNT' | 'M' | 'KCAL' | 'BPM' | 'MIN';
  totalValue?: number | null;
  avgValue?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  samplesCount?: number | null;
  computedJson?: any;
};

type Between = { operator: 'between'; startTime: string; endTime: string };

// ---------- helpers ----------

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const metersOf = (r: any) => {
  const d = r?.distance;
  if (typeof d === 'number') return d;
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
  if (typeof e === 'number') return e;
  return (
    toNum(e?.inKilocalories?.value) ||
    toNum(e?.inKilocalories) ||
    toNum(e?.inCalories) / 1000 ||
    toNum(e?.value) ||
    toNum(r?.calories) ||
    0
  );
};

async function permissionOk(metric: MetricCode): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const map: Record<MetricCode, string> = {
    STEPS: 'steps',
    FLOORS: 'floors',
    DISTANCE: 'distance',
    KCAL: 'activeCalories',
    HR: 'heartRate',
    SLEEP: 'sleep',
  };
  return hasReadPermission(map[metric] as any);
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
  opts?: { probeOnly?: boolean }
): Promise<MetricSummary | null> {
  await ensureInitialized();

  if (!(await permissionOk(metric))) {
    console.log(TAG, metric, 'permission=false');
    return null;
  }

  const startMs = new Date(fromUtcISO).getTime();
  const endMs = new Date(toUtcISO).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    console.log(TAG, metric, 'invalid range', { fromUtcISO, toUtcISO });
    return null;
  }
  if (__DEV__) {
  console.log(TAG, 'range', {
    metric,
    fromUtcISO,
    toUtcISO,
    startMs,
    endMs,
    spanMin: Math.round((endMs - startMs) / 60000),
  });
}

  // Health Connect filter; API treats this as an interval—HC handles borders internally.
  // We still clamp manually where we iterate raw samples (HR / SLEEP) to enforce [start, end).
  const range: Between = { operator: 'between', startTime: fromUtcISO, endTime: toUtcISO };

  try {
    switch (metric) {
      case 'STEPS': {
        // Prefer aggregate; fallback to raw.
        let total = 0;
        try {
          const a = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: range });
          total = toNum((a as any)?.result?.COUNT_TOTAL);
        } catch {}
        if (total <= 0) {
          const out = await readRecords('Steps', {
            timeRangeFilter: range,
            pageSize: 1000,
            ascendingOrder: true,
          });
          total = (out.records ?? []).reduce((s: number, r: any) => s + toNum(r?.count), 0);
        }
        const ms: MetricSummary = { metricCode: 'STEPS', unitCode: 'COUNT', totalValue: total };
        console.log(TAG, 'STEPS', fromUtcISO, '→', toUtcISO, 'total=', total);
        return opts?.probeOnly ? (total > 0 ? ms : null) : ms;
      }

      case 'FLOORS': {
        let total = 0;
        try {
          const a = await aggregateRecord({ recordType: 'FloorsClimbed', timeRangeFilter: range });
          total = toNum((a as any)?.result?.FLOORS_CLIMBED_TOTAL);
        } catch {}
        if (total <= 0) {
          const out = await readRecords('FloorsClimbed', {
            timeRangeFilter: range,
            pageSize: 1000,
            ascendingOrder: true,
          });
          total = (out.records ?? []).reduce(
            (s: number, r: any) => s + toNum(r?.floors?.value ?? r?.floors),
            0,
          );
        }
        const ms: MetricSummary = { metricCode: 'FLOORS', unitCode: 'COUNT', totalValue: total };
        console.log(TAG, 'FLOORS total=', total);
        return opts?.probeOnly ? (total > 0 ? ms : null) : ms;
      }

      case 'DISTANCE': {
        let meters = 0;
        try {
          const a = await aggregateRecord({ recordType: 'Distance', timeRangeFilter: range });
          const v = (a as any)?.result?.DISTANCE_TOTAL;
          meters = toNum(v?.inMeters?.value) || toNum(v?.inMeters) || toNum(v);
        } catch {}
        if (meters <= 0) {
          const out = await readRecords('Distance', {
            timeRangeFilter: range,
            pageSize: 1000,
            ascendingOrder: true,
          });
          meters = (out.records ?? []).reduce((s: number, r: any) => s + metersOf(r), 0);
        }
        const ms: MetricSummary = { metricCode: 'DISTANCE', unitCode: 'M', totalValue: meters };
        console.log(TAG, 'DISTANCE meters=', meters);
        return opts?.probeOnly ? (meters > 0 ? ms : null) : ms;
      }

      case 'KCAL': {
        let kcal = 0;
        try {
          const a = await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range });
          const v = (a as any)?.result?.ACTIVE_CALORIES_TOTAL;
          kcal = toNum(v?.inKilocalories?.value) || toNum(v?.inKilocalories) || toNum(v?.value);
        } catch {}
        if (kcal <= 0) {
          const out = await readRecords('ActiveCaloriesBurned', {
            timeRangeFilter: range,
            pageSize: 1000,
            ascendingOrder: true,
          });
          kcal = (out.records ?? []).reduce((s: number, r: any) => s + kcalOf(r), 0);
        }
        const ms: MetricSummary = { metricCode: 'KCAL', unitCode: 'KCAL', totalValue: kcal };
        console.log(TAG, 'KCAL=', kcal);
        return opts?.probeOnly ? (kcal > 0 ? ms : null) : ms;
      }

      case 'SLEEP': {
        const out = await readRecords('SleepSession', {
          timeRangeFilter: range,
          pageSize: 2000,
          ascendingOrder: true,
        });
        if (__DEV__) console.log(TAG, 'SLEEP sessions=', out.records?.length ?? 0);
        const minutes = Math.round(
          ((out.records ?? []).reduce((acc: number, r: any) => {
            const s = new Date(r.startTime).getTime();
            const e = new Date(r.endTime).getTime();
            // clamp to [startMs, endMs)
            const clipped = Math.max(0, Math.min(e, endMs) - Math.max(s, startMs));
            return acc + clipped;
          }, 0)) / 60000,
        );
        const ms: MetricSummary = { metricCode: 'SLEEP', unitCode: 'MIN', totalValue: minutes };
        console.log(TAG, 'SLEEP minutes=', minutes);
        return opts?.probeOnly ? (minutes > 0 ? ms : null) : ms;
      }

      case 'HR': {
        const out = await readRecords('HeartRate', {
          timeRangeFilter: range,
          pageSize: 2000,
          ascendingOrder: true,
        });
        if (__DEV__) console.log(TAG, 'HR readRecords count=', out.records?.length ?? 0);
        let sum = 0;
        let count = 0;
        let min = Infinity;
        let max = -Infinity;

        for (const r of (out.records ?? []) as any[]) {
          const samples = Array.isArray(r?.samples) ? r.samples : [];
          for (const s of samples) {
            const t = new Date(s.time).getTime();
            // Enforce [start, end)
            if (t >= startMs && t < endMs) {
              const bpm = toNum(s.beatsPerMinute, NaN);
              if (!Number.isFinite(bpm)) continue;
              sum += bpm;
              count += 1;
              if (bpm < min) min = bpm;
              if (bpm > max) max = bpm;
            }
          }
        }

        if (count === 0) {
          console.log(TAG, 'HR no samples');
          const empty: MetricSummary = {
            metricCode: 'HR',
            unitCode: 'BPM',
            avgValue: null,
            minValue: null,
            maxValue: null,
            samplesCount: 0,
          };
          return opts?.probeOnly ? null : empty;
        }

        const avg = Math.round((sum / count) * 10) / 10;
        const ms: MetricSummary = {
          metricCode: 'HR',
          unitCode: 'BPM',
          avgValue: avg,
          minValue: min,
          maxValue: max,
          samplesCount: count,
        };
        console.log(TAG, 'HR avg/min/max/samples=', avg, min, max, count);
        if (__DEV__) console.log(TAG, 'HR samples counted=', count);
        return ms;
      }
    }
  } catch (e: any) {
    console.log(TAG, metric, 'error:', e?.message ?? e);
    return null;
  }
}

export async function checkMetricPermissionsForMap(
  metricMap: Partial<Record<MetricCode, number>>
): Promise<{ ok: boolean; missing: MetricCode[] }> {
  const present = (Object.keys(metricMap ?? {}) as MetricCode[]).filter(Boolean);
  const missing: MetricCode[] = [];
  for (const m of present) {
    if (!(await permissionOk(m))) missing.push(m);
  }
  return { ok: missing.length === 0, missing };
}
