import { Platform } from 'react-native';
import {
  aggregateGroupByDuration,
  aggregateRecord,
  getGrantedPermissions,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  type Permission
} from 'react-native-health-connect';
import { makeDailyEdges, makeHourlyEdges24, overlappedMs } from './bucketing';
/** ───────────────────────── Logger ───────────────────────── */
const TAG = '[HC]';
const LOG_CAP = 500;
const HC_LOGS: Array<{ ts: string; msg: string }> = [];
export function getHCLogs() { return [...HC_LOGS]; }
export function clearHCLogs() { HC_LOGS.length = 0; }
function pushLog(msg: string) {
  HC_LOGS.push({ ts: new Date().toISOString(), msg });
  if (HC_LOGS.length > LOG_CAP) HC_LOGS.shift();
}
const log = (...a: any[]) => { console.log(TAG, ...a); try { pushLog(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); } catch { } };
const logErr = (label: string, e: unknown, extra?: any) => { console.log(TAG, `${label}:`, (e as any)?.message ?? e, extra ?? ''); try { pushLog(`${label}: ${(e as any)?.message ?? e}`); } catch { } };




/** ───────────────────────── Time helpers ───────────────────────── */
type Between = { operator: 'between'; startTime: string; endTime: string };

// function todayRange(): Between {
//   const now = new Date();
//   const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
//   return { operator: 'between', startTime: start.toISOString(), endTime: now.toISOString() };
// }

/** 7 full days ending now (used for daily buckets). */
function lastNDays(days: number): Between {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
}

/** ───────────────────────── Metric config ─────────────────────────
 * Keep recordType strings explicit so we never pass a generic string.
 * For aggregate keys, we prefer the HC aggregator first (if supported),
 * and fallback to raw-record summation if the aggregator returns empty/0.
 */
type HCRecordType =
  | 'Steps'
  | 'FloorsClimbed'
  | 'Distance'
  | 'HeartRate'
  | 'ActiveCaloriesBurned'
  | 'Weight'
  | 'SleepSession';


type MetricKey =
  | 'steps'
  | 'floors'
  | 'distance'
  | 'activeCalories'
  | 'heartRate'
  | 'weight'
  | 'sleep';


  /** ───────────────────────── Window & Series types (parity with HK) ───────────────────────── */
export type Window = { fromUtc: string; toUtc: string };
export type SeriesPoint = { ts: string; value: number };


type MetricDef = {
  label: string;
  recordType: HCRecordType;
  /** Aggregation key if HC exposes a numeric total; else we'll fall back to raw records */
  aggregateKey?:
  | 'COUNT_TOTAL'            // Steps
  | 'FLOORS_CLIMBED_TOTAL'   // Floors
  | 'DISTANCE_TOTAL'         // Distance (meters)
  | 'ACTIVE_CALORIES_TOTAL'; // Active cals (kcal)
  /** Read permission for this record type */
  permission: Permission;
};

const METRICS: Record<MetricKey, MetricDef> = {
  steps: {
    label: 'Steps',
    recordType: 'Steps',
    aggregateKey: 'COUNT_TOTAL',
    permission: { accessType: 'read', recordType: 'Steps' },
  },
  floors: {
    label: 'Floors climbed',
    recordType: 'FloorsClimbed',
    aggregateKey: 'FLOORS_CLIMBED_TOTAL',
    permission: { accessType: 'read', recordType: 'FloorsClimbed' },
  },
  distance: {
    label: 'Distance',
    recordType: 'Distance',
    aggregateKey: 'DISTANCE_TOTAL',
    permission: { accessType: 'read', recordType: 'Distance' },
  },
  activeCalories: {
    label: 'Active calories',
    recordType: 'ActiveCaloriesBurned',
    aggregateKey: 'ACTIVE_CALORIES_TOTAL',
    permission: { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  },
  heartRate: {
    label: 'Heart rate',
    recordType: 'HeartRate',
    permission: { accessType: 'read', recordType: 'HeartRate' },
  },
  weight: {
    label: 'Weight',
    recordType: 'Weight',
    permission: { accessType: 'read', recordType: 'Weight' },
  },
  sleep: {
    label: 'Sleep',
    recordType: 'SleepSession',
    permission: { accessType: 'read', recordType: 'SleepSession' },
  },
};

const ALL_READ_PERMS: Permission[] = Object.values(METRICS).map(m => m.permission);

/** ───────────────────────── Init & Permissions ───────────────────────── */
export async function ensureInitialized(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    log('initialize() → calling');
    await initialize();
    log('initialize() → success');
  } catch (e) {
    logErr('initialize() failed', e);
    // Surface the real failure to caller if needed, but generally we keep UI resilient.
    throw e;
  }
}

/** Ask for *all* read permissions we support right now. */
export async function requestAllReadPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    log('requestPermission(all) →', ALL_READ_PERMS.map(p => (p as any).recordType));
    await requestPermission(ALL_READ_PERMS);
    log('requestPermission(all) → ok');
  } catch (e) {
    logErr('requestPermission(all) failed', e);
    throw e;
  }
}

/** Whether a specific metric’s read permission is granted. */
export async function hasReadPermission(metric: MetricKey): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await getGrantedPermissions();
    // @ts-ignore union shares accessType/recordType at runtime
    const ok = granted.some(p => p.accessType === 'read' && p.recordType === METRICS[metric].recordType);
    log('hasReadPermission()', metric, '→', ok);
    return ok;
  } catch (e) {
    logErr('getGrantedPermissions() failed', e);
    return false;
  }
}

/** List of metric keys that currently have read access */
export async function listGrantedMetricKeys(): Promise<MetricKey[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const granted = await getGrantedPermissions();
    // @ts-ignore
    const rtSet = new Set(granted.filter(p => p.accessType === 'read').map(p => p.recordType));
    const keys = (Object.keys(METRICS) as MetricKey[]).filter(k => rtSet.has(METRICS[k].recordType));
    log('listGrantedMetricKeys() →', keys);
    return keys;
  } catch (e) {
    logErr('listGrantedMetricKeys() error', e);
    return [];
  }
}

/** NOTE: background access is a separate permission flow; *don’t* include it here.
 * If you need it later, request it via the lib’s dedicated API (not mixed into read perms).
 */
export { openHealthConnectSettings };

/** ───────────────────────── Helpers for raw fallbacks ───────────────────────── */



function unwrapAggregateValue(metric: MetricKey, raw: any): number {
  if (raw == null) return 0;

  if (metric === 'distance') {
    if (typeof raw === 'number') return raw;
    const n = Number(raw?.inMeters?.value ?? raw?.inMeters ?? (raw?.inKilometers ? raw.inKilometers * 1000 : undefined) ?? raw?.value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  if (metric === 'activeCalories') {
    if (typeof raw === 'number') return raw;
    const n = Number(raw?.inKilocalories?.value ?? raw?.inKilocalories ?? (raw?.inCalories ? raw.inCalories / 1000 : undefined) ?? raw?.value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  // steps/floors already numeric
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}



async function sumStepsFromRecords(range: Between): Promise<number> {
  try {
    const out = await readRecords('Steps', { timeRangeFilter: range, pageSize: 500, ascendingOrder: true });
    const total = (out.records ?? []).reduce((s, r: any) => s + (Number(r.count ?? 0) || 0), 0);
    return total;
  } catch (e) {
    logErr('sumStepsFromRecords() error', e);
    return 0;
  }
}

async function sumFloorsFromRecords(range: Between): Promise<number> {
  try {
    const out = await readRecords('FloorsClimbed', { timeRangeFilter: range, pageSize: 500, ascendingOrder: true });
    const recs = out.records ?? [];
    log('[Floors] raw record count =', recs.length);
    const total = recs.reduce((s, r: any) => s + (Number(r?.floors?.value ?? r?.floors ?? 0) || 0), 0);
    log('[Floors] sum from raw =', total);
    return total;
  } catch (e) {
    logErr('sumFloorsFromRecords() error', e);
    return 0;
  }
}
async function sumDistanceFromRecords(range: Between): Promise<number> {
  try {
    const out = await readRecords('Distance', { timeRangeFilter: range, pageSize: 500, ascendingOrder: true });
    const recs = out.records ?? [];
    log('[Distance] raw record count =', recs.length);
    let total = 0;
    for (let i = 0; i < recs.length; i++) {
      const m = toMeters(recs[i]);
      if (!Number.isFinite(m)) {
        log('[Distance] unexpected shape:', recs[i]);
      }
      total += m || 0;
    }
    log('[Distance] sum from raw meters =', total);
    return total;
  } catch (e) {
    logErr('sumDistanceFromRecords() error', e);
    return 0;
  }
}
async function sumActiveCalsFromRecords(range: Between): Promise<number> {
  try {
    const out = await readRecords('ActiveCaloriesBurned', { timeRangeFilter: range, pageSize: 500, ascendingOrder: true });
    const recs = out.records ?? [];
    log('[ActiveCals] raw record count =', recs.length);
    let total = 0;
    for (let i = 0; i < recs.length; i++) {
      const kcal = toKilocalories(recs[i]);
      if (!Number.isFinite(kcal)) {
        log('[ActiveCals] unexpected shape:', recs[i]);
      }
      total += kcal || 0;
    }
    log('[ActiveCals] sum from raw kcal =', total);
    return total;
  } catch (e) {
    logErr('sumActiveCalsFromRecords() error', e);
    return 0;
  }
}

async function sumTotalCalsFromRecords(range: Between): Promise<number> {
  try {
    const out = await readRecords('TotalCaloriesBurned' as any, { timeRangeFilter: range, pageSize: 500, ascendingOrder: true });
    const recs = out.records ?? [];
    let total = 0;
    for (const r of recs) total += toKilocalories(r) || 0;
    log('[TotalCals] sum from raw kcal =', total);
    return total;
  } catch (e) {
    return 0;
  }
}

// Sleep
/** Sleep → daily buckets in minutes (local days), newest last. */


export async function readSleepDailyBuckets(days: 7 | 30 | 90): Promise<Bucket[]> {
  const range = lastNDays(days);
  const out = await readRecords('SleepSession', { timeRangeFilter: range, pageSize: 2000, ascendingOrder: true });
  const recs = (out.records ?? []) as any[];
  log('[Sleep][daily] recs=', recs.length, 'days=', days);

  const edges = makeDailyEdges(days);
  const vals = new Array(edges.length).fill(0);

  for (const r of recs) {
    const s = new Date(r.startTime);
    const e = new Date(r.endTime);
    for (let i = 0; i < edges.length; i++) {
      const ms = overlappedMs(s, e, edges[i].start, edges[i].end);
      if (ms > 0) vals[i] += ms;
    }
  }

  // convert ms→minutes
  const buckets: Bucket[] = edges.map(({ start, end }, i) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    value: Math.round(vals[i] / 60000)
  }));

  const sum = buckets.reduce((s, b) => s + (b.value || 0), 0);
  log('[Sleep][daily] bucketLen=', buckets.length, 'sumMin=', sum);
  return buckets;
}


/** Sum duration (ms) of SleepSession overlapping the range; returns ms */
async function sumSleepDurationMs(range: Between): Promise<number> {
  try {
    const out = await readRecords('SleepSession', { timeRangeFilter: range, pageSize: 200, ascendingOrder: true });
    const startRange = new Date(range.startTime).getTime();
    const endRange = new Date(range.endTime).getTime();
    const totalMs = (out.records ?? []).reduce((acc, r: any) => {
      const s = new Date(r.startTime).getTime();
      const e = new Date(r.endTime).getTime();
      // clip to [startRange, endRange]
      const start = Math.max(s, startRange);
      const end = Math.min(e, endRange);
      return acc + Math.max(0, end - start);
    }, 0);
    return totalMs;
  } catch (e) {
    logErr('sumSleepDurationMs() error', e);
    return 0;
  }
}

/** Latest weight in kg (if available) */
async function latestWeightKg(): Promise<number | null> {
  try {
    const out = await readRecords('Weight', { timeRangeFilter: lastNDays(365), pageSize: 1, ascendingOrder: false });
    const r = out.records?.[0] as any | undefined;
    if (!r) return null;
    const kg = typeof r.weight === 'number' ? r.weight : Number(r.weight?.inKilograms ?? r.weight?.inKg ?? 0);
    return Number.isFinite(kg) ? kg : null;
  } catch (e) {
    logErr('latestWeightKg() error', e);
    return null;
  }
}


/** Sleep sessions list (start/end/minutes) for a window. */
export async function readSleepSessions(days: 7 | 30 | 90): Promise<Array<{ start: string; end: string; minutes: number }>> {
  if (Platform.OS !== 'android') return [];
  if (!(await hasReadPermission('sleep'))) return [];

  try {
    const range = lastNDays(days);
    const out = await readRecords('SleepSession', {
      timeRangeFilter: range,
      pageSize: 2000,
      ascendingOrder: false, // newest first
    });

    const recs = (out.records ?? []) as any[];
    log('[Sleep][sessions] raw sessions count =', recs.length);
    const rows = recs.map(r => {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      return { start: start.toISOString(), end: end.toISOString(), minutes };
    });

    // keep sensible sessions (>= 10 minutes), newest first
    const filtered = rows.filter(r => r.minutes >= 10).sort((a, b) => b.start.localeCompare(a.start));
    log('[Sleep][sessions]', 'days=', days, 'count=', filtered.length);
    return filtered;
  } catch (e) {
    logErr('readSleepSessions() error', e);
    return [];
  }
}

/** Sleep → 24 hourly buckets in minutes (local hourly edges), newest last. */
export async function readSleepHourlyBuckets24(): Promise<Bucket[]> {
  const end = new Date();
  const start = new Date(end);
  start.setHours(end.getHours() - 24);

  const out = await readRecords('SleepSession', {
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    pageSize: 2000,
    ascendingOrder: true,
  });

  const recs = (out.records ?? []) as Array<{ startTime: string; endTime: string }>;
  const edges = makeHourlyEdges24();
  const mins = new Array(edges.length).fill(0);

  for (const r of recs) {
    const s = new Date(r.startTime);
    const e = new Date(r.endTime);
    for (let i = 0; i < edges.length; i++) {
      const ms = overlappedMs(s, e, edges[i].start, edges[i].end);
      if (ms > 0) mins[i] += ms;
    }
  }

  return edges.map(({ start, end }, i) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    value: Math.round(mins[i] / 60000),
  }));
}



/** ───────────────────────── Heart Rate ───────────────────────── */

/** Heart-rate → 24 hourly buckets of avg BPM, newest last. */
export async function readHeartRateHourly24(): Promise<Bucket[]> {
  const end = new Date();
  end.setSeconds(0, 0);
  const start = new Date(end);
  start.setHours(end.getHours() - 24);

  const tr: Between = {
    operator: 'between',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };

  const out = await readRecords('HeartRate', {
    timeRangeFilter: tr,
    pageSize: 2000,
    ascendingOrder: true,
  });

  const recs = (out.records ?? []) as any[];
  const edges = makeHourlyEdges24();
  const sums = new Array(edges.length).fill(0);
  const counts = new Array(edges.length).fill(0);

  for (const r of recs) {
    const samples = Array.isArray(r?.samples) ? r.samples : [];
    for (const s of samples) {
      const t = new Date(s.time).getTime();
      for (let i = 0; i < edges.length; i++) {
        const S = edges[i].start.getTime(), E = edges[i].end.getTime();
        if (t >= S && t < E) {
          const bpm = Number(s.beatsPerMinute);
          if (Number.isFinite(bpm)) { sums[i] += bpm; counts[i] += 1; }
          break;
        }
      }
    }
  }

  const buckets: Bucket[] = edges.map(({ start, end }, i) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    value: counts[i] > 0 ? Math.round(sums[i] / counts[i]) : 0,
  }));

  log('[HR][24h] buckets=', buckets.length, 'nonZero=', buckets.filter(b => b.value > 0).length);
  return buckets;
}


async function latestHeartRateSample(): Promise<{ bpm: number | null; atISO?: string }> {
  try {
    const out = await readRecords('HeartRate', { timeRangeFilter: todayRangeLocal(), pageSize: 1, ascendingOrder: false });
    const rec: any = out.records?.[0];
    const lastSample = Array.isArray(rec?.samples) ? rec.samples[rec.samples.length - 1] : undefined;
    const bpm = Number(lastSample?.beatsPerMinute);
    const atISO = lastSample?.time ?? rec?.endTime ?? rec?.startTime;
    return { bpm: Number.isFinite(bpm) ? bpm : null, atISO };
  } catch (e) {
    logErr('latestHeartRateSample() error', e);
    return { bpm: null, atISO: undefined };
  }
}

/** Heart-rate → N daily buckets (avg BPM per local day), newest last. */
export async function readHeartRateDailyBuckets(days: 7 | 30 | 90): Promise<Bucket[]> {
  const range = lastNDays(days);
  const out = await readRecords('HeartRate', {
    timeRangeFilter: range,
    pageSize: 2000,
    ascendingOrder: true,
  });

  const recs = (out.records ?? []) as any[];
  const edges = makeDailyEdges(days);
  const sums = new Array(edges.length).fill(0);
  const counts = new Array(edges.length).fill(0);

  // Each HeartRate record has samples: [{ time, beatsPerMinute }, ...]
  for (const r of recs) {
    const samples = Array.isArray(r?.samples) ? r.samples : [];
    for (const s of samples) {
      const t = new Date(s.time).getTime();
      const bpm = Number(s.beatsPerMinute);
      if (!Number.isFinite(bpm)) continue;
      // bin sample into its day bucket
      for (let i = 0; i < edges.length; i++) {
        const S = edges[i].start.getTime(), E = edges[i].end.getTime();
        if (t >= S && t < E) { sums[i] += bpm; counts[i] += 1; break; }
      }
    }
  }

  const buckets: Bucket[] = edges.map(({ start, end }, i) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    value: counts[i] > 0 ? Math.round(sums[i] / counts[i]) : 0,
  }));

  log('[HR][daily]', 'days=', days, 'bucketLen=', buckets.length, 'nonZero=', buckets.filter(b => b.value > 0).length);
  return buckets;
}


/** Latest heart-rate BPM today */
async function latestHeartRateBpm(): Promise<number | null> {
  try {
    const out = await readRecords('HeartRate', { timeRangeFilter: todayRangeLocal(), pageSize: 1, ascendingOrder: false });
    const rec: any = out.records?.[0];
    const last = rec?.samples?.[rec.samples.length - 1]?.beatsPerMinute;
    return Number.isFinite(last) ? last : null;
  } catch (e) {
    logErr('latestHeartRateBpm() error', e);
    return null;
  }
}

/** Latest respiratory rate (breaths per minute) if present */
async function latestRespiratoryRate(): Promise<number | null> {
  try {
    const out = await readRecords('RespiratoryRate', { timeRangeFilter: lastNDays(7), pageSize: 1, ascendingOrder: false });
    const rec: any = out.records?.[0];
    // Record shape varies by source; try common fields:
    const val =
      typeof rec?.rate === 'number'
        ? rec.rate
        : typeof rec?.samples?.[0]?.rate === 'number'
          ? rec.samples[0].rate
          : null;
    return Number.isFinite(val) ? val : null;
  } catch (e) {
    logErr('latestRespiratoryRate() error', e);
    return null;
  }
}

/** ───────────────────────── Public readers (Today) ───────────────────────── */
export async function readTodayStepsTotal(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  if (!(await hasReadPermission('steps'))) return 0;
  const range = todayRangeLocal();
  try {
    const res = await aggregateRecord({ recordType: 'Steps', timeRangeFilter: range });
    const total = (res as any)?.result?.COUNT_TOTAL ?? 0;
    if (Number.isFinite(total) && total > 0) return total;
    // fallback to raw
    const fb = await sumStepsFromRecords(range);
    log('readTodayStepsTotal() fallback →', fb);
    return fb;
  } catch (e) {
    logErr('readTodayStepsTotal() aggregate error → fallback', e);
    return await sumStepsFromRecords(range);
  }
}

export async function readTodayFloorsTotal(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  if (!(await hasReadPermission('floors'))) return 0;
  const range = todayRangeLocal();
  try {
    const res = await aggregateRecord({ recordType: 'FloorsClimbed', timeRangeFilter: range });
    const total = (res as any)?.result?.FLOORS_CLIMBED_TOTAL ?? 0;
    if (Number.isFinite(total) && total > 0) return total;
    const fb = await sumFloorsFromRecords(range);
    log('readTodayFloorsTotal() fallback →', fb);
    return fb;
  } catch (e) {
    logErr('readTodayFloorsTotal() aggregate error → fallback', e);
    return await sumFloorsFromRecords(range);
  }
}

function toMeters(r: any): number {
  // r.distance could be:
  // - number (meters)
  // - { inMeters?: number, inKilometers?: number, inMeters?: { value }, value?: number }
  const d = r?.distance;
  if (typeof d === 'number') return d;

  // common object shapes
  const meters =
    Number(d?.inMeters?.value) ||      // { inMeters: { value } }
    Number(d?.inMeters) ||             // { inMeters }
    (Number(d?.inKilometers) * 1000) ||// { inKilometers }
    Number(d?.value) ||                // { value } (assume meters)
    0;

  return Number.isFinite(meters) ? meters : 0;
}

function toKilocalories(r: any): number {
  // r.energy could be:
  // - number (kcal)
  // - { inKilocalories?: number, inCalories?: number, value?: number }
  const e = r?.energy;
  if (typeof e === 'number') return e;

  const kcal =
    Number(e?.inKilocalories?.value) || // { inKilocalories: { value } }
    Number(e?.inKilocalories) ||        // { inKilocalories }
    (Number(e?.inCalories) / 1000) ||   // { inCalories }
    Number(e?.value) ||                 // { value } (assume kcal)
    Number(r?.calories) ||              // some sources use top-level calories
    0;

  return Number.isFinite(kcal) ? kcal : 0;
}

export async function readTodayDistanceMeters(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  if (!(await hasReadPermission('distance'))) { log('[Distance] permission not granted'); return 0; }
  const range = todayRangeLocal();
  log('readTodayDistanceMeters() called');
  try {
    log('[Distance] calling aggregate');
    const res = await aggregateRecord({ recordType: 'Distance', timeRangeFilter: range });
    log('[Distance] aggregate result =', (res as any)?.result);
    const total = unwrapAggregateValue('distance', (res as any)?.result?.DISTANCE_TOTAL);
    if (total > 0) { log('[Distance] aggregate meters =', total); return total; }
    const fb = await sumDistanceFromRecords(range);
    log('readTodayDistanceMeters() fallback →', fb);
    return fb;
  } catch (e) {
    logErr('readTodayDistanceMeters() aggregate error → fallback', e);
    return await sumDistanceFromRecords(range);
  }
}
/** Raw → daily buckets fallback for Distance (meters). */
async function rawDailyDistanceBuckets(days: number): Promise<Bucket[]> {
  const range = lastNDays(Math.max(days, 1));
  const out = await readRecords('Distance', { timeRangeFilter: range, pageSize: 1000, ascendingOrder: true });
  const recs = (out.records ?? []) as any[];

  log('[Distance][rawDaily] recs=', recs.length, 'days=', days);

  const edges = makeDailyEdges(days);
  const sums = new Array(edges.length).fill(0);

  // simple binning by record startTime → bucket index
  for (const r of recs) {
    const t = new Date(r.startTime).getTime();
    for (let i = 0; i < edges.length; i++) {
      const s = edges[i].start.getTime();
      const e = edges[i].end.getTime();
      if (t >= s && t < e) {
        sums[i] += toMeters(r) || 0;
        break;
      }
    }
  }

  const buckets: Bucket[] = edges.map(({ start, end }, i) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    value: sums[i],
  }));

  const total = sums.reduce((a, b) => a + b, 0);
  log('[Distance][rawDaily] bucketSum=', total, 'nonZeroBuckets=', sums.filter(x => x > 0).length);
  return buckets;
}

/** Raw → hourly (last 24h) buckets fallback for Distance (meters). */
async function rawHourlyDistanceBuckets24(): Promise<Bucket[]> {
  const range = todayRangeLocal();// good enough; records “today”
  const out = await readRecords('Distance', { timeRangeFilter: range, pageSize: 1000, ascendingOrder: true });
  const recs = (out.records ?? []) as any[];

  log('[Distance][rawHourly] recs=', recs.length);

  const edges = makeHourlyEdges24();
  const sums = new Array(edges.length).fill(0);

  for (const r of recs) {
    const t = new Date(r.startTime).getTime();
    for (let i = 0; i < edges.length; i++) {
      const s = edges[i].start.getTime();
      const e = edges[i].end.getTime();
      if (t >= s && t < e) {
        sums[i] += toMeters(r) || 0;
        break;
      }
    }
  }

  const buckets: Bucket[] = edges.map(({ start, end }, i) => ({
    start: start.toISOString(),
    end: end.toISOString(),
    value: sums[i],
  }));

  const total = sums.reduce((a, b) => a + b, 0);
  log('[Distance][rawHourly] bucketSum=', total, 'nonZeroBuckets=', sums.filter(x => x > 0).length);
  return buckets;
}



export async function readTodayActiveCaloriesKcal(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  if (!(await hasReadPermission('activeCalories'))) { log('[ActiveCals] permission not granted'); return 0; }
  const range = todayRangeLocal();
  log('readTodayActiveCaloriesKcal() called');
  try {
    log('[ActiveCals] calling aggregate');
    const res = await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range });
    log('[ActiveCals] aggregate result =', (res as any)?.result);
    const total = unwrapAggregateValue('activeCalories', (res as any)?.result?.ACTIVE_CALORIES_TOTAL);
    if (total > 0) { log('[ActiveCals] aggregate kcal =', total); return total; }
    const fb = await sumActiveCalsFromRecords(range);
    if (fb > 0) {
      log('readTodayActiveCaloriesKcal() fallback →', fb);
      return fb;
    }
    const fb2 = await sumTotalCalsFromRecords(range);
    return fb2;
  } catch (e) {
    logErr('readTodayActiveCaloriesKcal() aggregate error → fallback', e);
    return await sumActiveCalsFromRecords(range);
  }
}


export async function readTodayHeartRateLatestBpm(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  if (!(await hasReadPermission('heartRate'))) return null;
  const { bpm } = await latestHeartRateSample();
  return bpm;
}

export async function readHeartRateLatest(): Promise<{ bpm: number | null; atISO?: string }> {
  if (Platform.OS !== 'android') return { bpm: null };
  if (!(await hasReadPermission('heartRate'))) return { bpm: null };
  return latestHeartRateSample();
}


export async function readLatestWeightKg(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  if (!(await hasReadPermission('weight'))) return null;
  return await latestWeightKg();
}

export async function readTodaySleepTotalMinutes(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  if (!(await hasReadPermission('sleep'))) return 0;
  const ms = await sumSleepDurationMs(todayRangeLocal());
  return Math.round(ms / 60000);
}

export async function readRespiratoryRateLatest(): Promise<number | null> {
  try {
    // typed as any on purpose; older RNHC versions don't expose the literal type
    const out = await (readRecords as any)('RespiratoryRate', {
      timeRangeFilter: { operator: 'between', startTime: new Date(Date.now() - 7 * 864e5).toISOString(), endTime: new Date().toISOString() },
      pageSize: 1,
      ascendingOrder: false,
    });
    const rec = out?.records?.[0];
    const val = typeof rec?.rate === 'number'
      ? rec.rate
      : typeof rec?.samples?.[0]?.rate === 'number'
        ? rec.samples[0].rate
        : null;
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

/** Optional: seven daily buckets for Steps/Distance/Cals/Floors */
export type Bucket = { start: string; end: string; value: number };
export async function read7dBuckets(
  metric: Exclude<MetricKey, 'heartRate' | 'weight' | 'sleep' | 'respiratoryRate'>
): Promise<Bucket[]> {
  if (Platform.OS !== 'android') return [];
  if (!(await hasReadPermission(metric))) return [];

  const m = METRICS[metric];
  try {
    const endLocal = new Date();
    endLocal.setSeconds(0, 0);
    const startLocal = new Date(endLocal);
    startLocal.setDate(endLocal.getDate() - 7);

    const rows = await aggregateGroupByDuration({
      recordType: m.recordType,
      timeRangeFilter: lastNDaysLocal(7),
      timeRangeSlicer: { duration: 'DAYS', length: 1 },
    });

    const key = m.aggregateKey!;
    let buckets = rows.map(b => ({
      start: b.startTime,
      end: b.endTime,
      value: unwrapAggregateValue(metric as MetricKey, (b as any)?.result?.[key]),
    }));

    const sum = buckets.reduce((s, x) => s + (x.value || 0), 0);
    log('[Buckets][agg]', metric, '7d len=', buckets.length, 'sum=', sum);

    if (metric === 'distance' && (buckets.length === 0 || sum === 0)) {
      log('[Buckets][distance] falling back to rawDailyDistanceBuckets(7)');
      buckets = await rawDailyDistanceBuckets(7);
    }

    return buckets;
  } catch (e) {
    logErr(`read7dBuckets(${metric}) error`, e);
    if (metric === 'distance') return await rawDailyDistanceBuckets(7);
    return [];
  }
}


/** ───────────────────────── Window helpers ───────────────────────── */
function parseIso(i: string) { return new Date(i); }

function pickStatsInterval(win: Window): 'hour' | 'day' {
  const s = parseIso(win.fromUtc).getTime();
  const e = parseIso(win.toUtc).getTime();
  const hours = Math.max(0, (e - s) / 3_600_000);
  return hours <= 36 ? 'hour' : 'day';
}

function toBetween(win: Window): Between {
  return {
    operator: 'between',
    startTime: parseIso(win.fromUtc).toISOString(),
    endTime: parseIso(win.toUtc).toISOString(),
  };
}

// Build hourly/day edges for arbitrary window (end-exclusive), aligned to local hour/day starts.
function startOfHour(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0); }
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }

function makeEdgesForWindow(win: Window, interval: 'hour' | 'day'): Array<{ start: Date; end: Date }> {
  const s0 = parseIso(win.fromUtc);
  const e0 = parseIso(win.toUtc);
  let cur = interval === 'hour' ? startOfHour(s0) : startOfDay(s0);
  const step = interval === 'hour' ? 1 : 24;

  const edges: Array<{ start: Date; end: Date }> = [];
  while (cur < e0) {
    const next = new Date(cur);
    next.setHours(cur.getHours() + step, 0, 0, 0);
    const start = cur < s0 ? s0 : cur;
    const end = next > e0 ? e0 : next;
    if (end > start) edges.push({ start, end });
    cur = next;
  }
  return edges;
}



/** Local timezone helpers (handles DST because offset is read at that instant) */
function tzOffsetHHMM(d: Date) {
  const mins = -d.getTimezoneOffset();
  const sign = mins >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(mins) / 60)).padStart(2, '0');
  const mm = String(Math.abs(mins) % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}
export function localTzLabel() {
  const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${z} (${tzOffsetHHMM(new Date())})`;
}

/** local midnight helper */
const localMidnight = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** [local midnight → now] */
function todayRangeLocal(): Between {
  const now = new Date();
  const start = localMidnight(now);
  return { operator: 'between', startTime: start.toISOString(), endTime: now.toISOString() };
}

/** [local midnight N days ago → local midnight tomorrow]  (used for 7/30/90 daily buckets) */
function lastNDaysLocal(days: number): Between {
  const end = localMidnight();  // today 00:00 local
  end.setDate(end.getDate() + 1); // tomorrow 00:00 local
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
}

/** [now-24h → now] rounded to minute (used for 24H hourly buckets) */
function last24hLocal(): Between {
  const end = new Date(); end.setSeconds(0, 0);
  const start = new Date(end); start.setHours(end.getHours() - 24);
  return { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
}

/** Convert HC’s UTC boundaries back to local ISO (for display & bucketing in UI) */
function toLocalFromUTCISO(iso: string) {
  const d = new Date(iso);                   // parses as UTC
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString();
}


/** ───────────────────── Local timezone info (for UI/logs) ───────────────────── */
export type TimezoneInfo = {
  iana?: string;          // e.g., "America/New_York"
  offsetMinutes: number;  // minutes east of UTC (NY in summer = +240)
  offsetStr: string;      // e.g., "UTC-04:00"
  label: string;          // e.g., "America/New_York (UTC-04:00)"
};

export function getLocalTimezoneInfo(d: Date = new Date()): TimezoneInfo {
  const iana = Intl.DateTimeFormat().resolvedOptions().timeZone; // best effort
  const offsetMinutes = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const offsetStr = `UTC${sign}${hh}:${mm}`;
  const label = `${iana ?? 'Local'} (${offsetStr})`;
  log('[TZ] Using timezone:', label);
  return { iana, offsetMinutes, offsetStr, label };
}


export async function read24hBuckets(
  metric: Exclude<MetricKey, 'heartRate' | 'weight' | 'sleep' | 'respiratoryRate'>
): Promise<Bucket[]> {
  try {
    const m = METRICS[metric];

    // Anchor to the current minute boundary
    const endLocal = new Date();
    endLocal.setSeconds(0, 0);
    const startLocal = new Date(endLocal);
    startLocal.setHours(endLocal.getHours() - 24);

    // Shift the *range* into UTC so 1-hour slices align to local clock hours
    const rows = await aggregateGroupByDuration({
      recordType: m.recordType,
      timeRangeFilter: last24hLocal(),
      timeRangeSlicer: { duration: 'HOURS', length: 1 },
    });

    const key = m.aggregateKey!;
    let buckets = rows.map(b => ({
      start: b.startTime,
      end: b.endTime,
      value: unwrapAggregateValue(metric as MetricKey, (b as any)?.result?.[key]),
    }));

    const sum = buckets.reduce((s, x) => s + (x.value || 0), 0);
    log('[Buckets][agg]', metric, '24h len=', buckets.length, 'sum=', sum);

    if (metric === 'distance' && (buckets.length === 0 || sum === 0)) {
      log('[Buckets][distance] falling back to rawHourlyDistanceBuckets24()');
      buckets = await rawHourlyDistanceBuckets24();
    }

    return buckets;
  } catch (e) {
    logErr(`read24hBuckets(${metric}) error`, e);
    if (metric === 'distance') {
      log('[Buckets][distance] agg failed → raw fallback 24h');
      return await rawHourlyDistanceBuckets24();
    }
    return [];
  }
}


// Daily buckets for the last 30 days
export async function read30dBuckets(
  metric: Exclude<MetricKey, 'heartRate' | 'weight' | 'sleep' | 'respiratoryRate'>
): Promise<Bucket[]> {
  try {
    const m = METRICS[metric];
    const endLocal = new Date(); endLocal.setSeconds(0, 0);
    const startLocal = new Date(endLocal); startLocal.setDate(endLocal.getDate() - 30);

    const rows = await aggregateGroupByDuration({
      recordType: m.recordType,
      timeRangeFilter: lastNDaysLocal(30),
      timeRangeSlicer: { duration: 'DAYS', length: 1 },
    });

    const key = m.aggregateKey!;
    let buckets = rows.map(b => ({
      start: b.startTime,
      end: b.endTime,
      value: unwrapAggregateValue(metric as MetricKey, (b as any)?.result?.[key]),
    }));

    const sum = buckets.reduce((s, x) => s + (x.value || 0), 0);
    log('[Buckets][agg]', metric, '30d len=', buckets.length, 'sum=', sum);

    if (metric === 'distance' && (buckets.length === 0 || sum === 0)) {
      log('[Buckets][distance] fallback rawDaily 30d');
      buckets = await rawDailyDistanceBuckets(30);
    }
    return buckets;
  } catch (e) {
    logErr(`read30dBuckets(${metric}) error`, e);
    if (metric === 'distance') return await rawDailyDistanceBuckets(30);
    return [];
  }
}



// Daily buckets for the last 90 days
export async function read90dBuckets(
  metric: Exclude<MetricKey, 'heartRate' | 'weight' | 'sleep' | 'respiratoryRate'>
): Promise<Bucket[]> {
  try {
    const m = METRICS[metric];
    const endLocal = new Date(); endLocal.setSeconds(0, 0);
    const startLocal = new Date(endLocal); startLocal.setDate(endLocal.getDate() - 90);

    const rows = await aggregateGroupByDuration({
      recordType: m.recordType,
      timeRangeFilter: lastNDaysLocal(90),
      timeRangeSlicer: { duration: 'DAYS', length: 1 },
    });

    const key = m.aggregateKey!;
    let buckets = rows.map(b => ({
      start: b.startTime,
      end: b.endTime,
      value: unwrapAggregateValue(metric as MetricKey, (b as any)?.result?.[key]),
    }));

    const sum = buckets.reduce((s, x) => s + (x.value || 0), 0);
    log('[Buckets][agg]', metric, '90d len=', buckets.length, 'sum=', sum);

    if (metric === 'distance' && (buckets.length === 0 || sum === 0)) {
      log('[Buckets][distance] fallback rawDaily 90d');
      buckets = await rawDailyDistanceBuckets(90);
    }
    return buckets;
  } catch (e) {
    logErr(`read90dBuckets(${metric}) error`, e);
    if (metric === 'distance') return await rawDailyDistanceBuckets(90);
    return [];
  }
}



/** ───────────────────────── One-shot “read everything today” ─────────────────────────
 * Returns safe defaults if a permission is missing or a source has no data.
 */
export type TodaySnapshot = {
  steps: number;
  floors: number;
  distanceMeters: number;
  activeCaloriesKcal: number;
  heartRateBpm: number | null;
  weightKg: number | null;
  sleepMinutes: number;
  respiratoryRate: number | null;
};

// ── Compatibility helpers (shims) ──────────────────────────
export async function debugDumpStepsToday(): Promise<number> {
  await ensureInitialized();
  const n = await readTodayStepsTotal();
  return n;
}

export async function hasStepsPermission(): Promise<boolean> {
  return hasReadPermission('steps');
}

export async function requestStepsPermission(): Promise<void> {
  await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
}

function toLocalDateTimeString(d: Date) {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.` +
    `${pad3(d.getMilliseconds())}`
  );
}


function lastNDaysZ(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return {
    operator: 'between',
    startTime: start.toISOString(), // with Z
    endTime: end.toISOString(),
  } as const;
}

export async function readAllToday(): Promise<TodaySnapshot> {
  await ensureInitialized(); // safe to call repeatedly
  const [steps, floors, dist, cals, hr, wt, sleepMin, rr] = await Promise.all([
    readTodayStepsTotal(),
    readTodayFloorsTotal(),
    readTodayDistanceMeters(),
    readTodayActiveCaloriesKcal(),
    readTodayHeartRateLatestBpm(),
    readLatestWeightKg(),
    readTodaySleepTotalMinutes(),
    readRespiratoryRateLatest(),
  ]);
  log('readAllToday() →', { steps, floors, dist, cals, hr, wt, sleepMin, rr });
  return {
    steps,
    floors,
    distanceMeters: dist,
    activeCaloriesKcal: cals,
    heartRateBpm: hr,
    weightKg: wt,
    sleepMinutes: sleepMin,
    respiratoryRate: rr,
  };
}


/** ───────────────────────── Presence probe for apply-time checks ─────────────────────────
 * Supports: steps, floors, distance, activeCalories, heartRate, sleep
 */
export async function hcHasDataInRange(
  metric: 'steps' | 'floors' | 'distance' | 'activeCalories' | 'heartRate' | 'sleep',
  fromIso: string,
  toIso: string
): Promise<{ available: boolean; hasData: boolean; count?: number; sum?: number }> {
  if (Platform.OS !== 'android') return { available: false, hasData: false };
  if (!(await hasReadPermission(metric as any))) return { available: true, hasData: false };

  const win: Window = { fromUtc: fromIso, toUtc: toIso };
  const range = toBetween(win);

  try {
    if (metric === 'sleep') {
      const out = await readRecords('SleepSession', { timeRangeFilter: range, pageSize: 1, ascendingOrder: false });
      const hasData = (out.records?.length ?? 0) > 0;
      return { available: true, hasData, count: out.records?.length ?? 0 };
    }

    if (metric === 'heartRate') {
      const out = await readRecords('HeartRate', { timeRangeFilter: range, pageSize: 5, ascendingOrder: false });
      const recs = (out.records ?? []) as any[];
      let cnt = 0;
      for (const r of recs) {
        const samples = Array.isArray(r?.samples) ? r.samples : [];
        if (samples.some((s: any) => Number.isFinite(Number(s.beatsPerMinute)) && Number(s.beatsPerMinute) > 0)) {
          cnt++;
        }
      }
      return { available: true, hasData: cnt > 0, count: cnt };
    }

    // Sum-style metrics: prefer aggregate; fallback to raw
    const aggMap = {
      steps: { recordType: 'Steps' as const, key: 'COUNT_TOTAL' as const },
      floors: { recordType: 'FloorsClimbed' as const, key: 'FLOORS_CLIMBED_TOTAL' as const },
      distance: { recordType: 'Distance' as const, key: 'DISTANCE_TOTAL' as const },
      activeCalories: { recordType: 'ActiveCaloriesBurned' as const, key: 'ACTIVE_CALORIES_TOTAL' as const },
    } as const;

    const meta = aggMap[metric as keyof typeof aggMap];
    const res = await aggregateRecord({ recordType: meta.recordType, timeRangeFilter: range });
    const rawSum = (res as any)?.result?.[meta.key];
    let sum =
      metric === 'distance'
        ? unwrapAggregateValue('distance', rawSum)
        : metric === 'activeCalories'
          ? unwrapAggregateValue('activeCalories', rawSum)
          : Number(rawSum || 0);

    if (!Number.isFinite(sum) || sum <= 0) {
      // fallback to raw
      if (metric === 'steps') sum = await sumStepsFromRecords(range);
      else if (metric === 'floors') sum = await sumFloorsFromRecords(range);
      else if (metric === 'distance') sum = await sumDistanceFromRecords(range);
      else if (metric === 'activeCalories') sum = await sumActiveCalsFromRecords(range);
    }

    return { available: true, hasData: (sum || 0) > 0, sum: Math.round(sum || 0) };
  } catch (e) {
    logErr('[HC] hcHasDataInRange failed', e);
    return { available: true, hasData: false };
  }
}


/** ───────────────────────── Window sum reader (steps/floors/distance/activeCalories) ───────────────────────── */
export async function hcReadSumInWindow(
  metric: 'steps' | 'floors' | 'distance' | 'activeCalories',
  win: Window
): Promise<{ sum: number }> {
  if (Platform.OS !== 'android') return { sum: 0 };
  if (!(await hasReadPermission(metric as any))) return { sum: 0 };

  const range = toBetween(win);
  try {
    const m = METRICS[metric];
    const res = await aggregateRecord({ recordType: m.recordType, timeRangeFilter: range });
    const key = m.aggregateKey!;
    let sum = unwrapAggregateValue(metric as any, (res as any)?.result?.[key]);

    if (!Number.isFinite(sum) || sum <= 0) {
      if (metric === 'steps') sum = await sumStepsFromRecords(range);
      else if (metric === 'floors') sum = await sumFloorsFromRecords(range);
      else if (metric === 'distance') sum = await sumDistanceFromRecords(range);
      else if (metric === 'activeCalories') sum = await sumActiveCalsFromRecords(range);
    }
    return { sum: Math.max(0, Math.round(sum || 0)) };
  } catch (e) {
    logErr(`[HC] hcReadSumInWindow(${metric}) failed`, e);
    // fallback
    if (metric === 'steps') return { sum: await sumStepsFromRecords(range) };
    if (metric === 'floors') return { sum: await sumFloorsFromRecords(range) };
    if (metric === 'distance') return { sum: await sumDistanceFromRecords(range) };
    if (metric === 'activeCalories') return { sum: await sumActiveCalsFromRecords(range) };
    return { sum: 0 };
  }
}

/** ───────────────────────── Window heart-rate reader ─────────────────────────
 * Returns avg/min/max and time-binned points (hourly ≤36h, else daily).
 */
export async function hcReadHeartRateInWindow(
  win: Window
): Promise<{ avgBpm?: number; minBpm?: number; maxBpm?: number; points?: SeriesPoint[] }> {
  if (Platform.OS !== 'android') return {};
  if (!(await hasReadPermission('heartRate'))) return {};

  const range = toBetween(win);
  const interval = pickStatsInterval(win);
  const edges = makeEdgesForWindow(win, interval);

  try {
    const out = await readRecords('HeartRate', {
      timeRangeFilter: range,
      pageSize: 2000,
      ascendingOrder: true,
    });
    const recs = (out.records ?? []) as any[];

    const sums = new Array(edges.length).fill(0);
    const counts = new Array(edges.length).fill(0);
    const allVals: number[] = [];

    for (const r of recs) {
      const samples = Array.isArray(r?.samples) ? r.samples : [];
      for (const s of samples) {
        const t = new Date(s.time).getTime();
        const bpm = Number(s.beatsPerMinute);
        if (!Number.isFinite(bpm) || bpm <= 0) continue;
        allVals.push(Math.round(bpm));
        for (let i = 0; i < edges.length; i++) {
          const S = edges[i].start.getTime(), E = edges[i].end.getTime();
          if (t >= S && t < E) { sums[i] += bpm; counts[i] += 1; break; }
        }
      }
    }

    if (allVals.length === 0) return { points: [] };

    const avg = Math.round(allVals.reduce((a, b) => a + b, 0) / allVals.length);
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);

    const points: SeriesPoint[] = edges.map((e, i) => ({
      ts: e.end.toISOString(),
      value: counts[i] > 0 ? Math.round(sums[i] / counts[i]) : 0,
    }));

    return { avgBpm: avg, minBpm: min, maxBpm: max, points };
  } catch (e) {
    logErr('[HC] hcReadHeartRateInWindow failed', e);
    return {};
  }
}

/** ───────────────────────── Window sleep-minutes reader ───────────────────────── */
export async function hcReadSleepMinutesInWindow(win: Window): Promise<{ minutes: number }> {
  if (Platform.OS !== 'android') return { minutes: 0 };
  if (!(await hasReadPermission('sleep'))) return { minutes: 0 };

  try {
    const range = toBetween(win);
    const out = await readRecords('SleepSession', {
      timeRangeFilter: range,
      pageSize: 2000,
      ascendingOrder: true,
    });
    const recs = (out.records ?? []) as Array<{ startTime: string; endTime: string }>;
    const wS = parseIso(win.fromUtc).getTime();
    const wE = parseIso(win.toUtc).getTime();

    let totalMs = 0;
    for (const r of recs) {
      const s = new Date(r.startTime).getTime();
      const e = new Date(r.endTime).getTime();
      const overlapStart = Math.max(s, wS);
      const overlapEnd = Math.min(e, wE);
      if (overlapEnd > overlapStart) totalMs += (overlapEnd - overlapStart);
    }
    return { minutes: Math.max(0, Math.round(totalMs / 60000)) };
  } catch (e) {
    logErr('[HC] hcReadSleepMinutesInWindow failed', e);
    return { minutes: 0 };
  }
}

