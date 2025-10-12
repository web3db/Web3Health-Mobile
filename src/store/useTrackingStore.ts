// src/store/useTrackingStore.ts
import { fxAssets, fxGoals, fxInsights, fxPermissions, fxStreakDays } from '@/src/data/fixtures/tracking';
import { Asset, AssetPermission, GoalStatus, Insight } from '@/src/services/tracking/types';
import { create } from 'zustand';

import {
  ensureInitialized,
  listGrantedMetricKeys,
  openHealthConnectSettings,
  read24hBuckets,
  read30dBuckets,
  read7dBuckets,
  read90dBuckets,
  readHeartRateDailyBuckets,
  readHeartRateHourly24,
  readHeartRateLatest,
  readSleepDailyBuckets,
  readSleepHourlyBuckets24,
  readTodaySleepTotalMinutes,
  requestAllReadPermissions,
  type Bucket as HCBucket
} from '@/src/services/tracking/healthconnect';

type Status = 'idle' | 'loading' | 'success' | 'error';

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

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

// ---------------- HC slice ----------------
export type WindowKey = '24h' | '7d' | '30d' | '90d';
export type MetricKey = 'steps' | 'floors' | 'distance' | 'activeCalories' | 'heartRate' | 'sleep';

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
  trend?: { dir: 'up' | 'down' | 'flat'; pct: number | null };
  meta?: {
    avgPerNight?: number;     // sleep
    minBpm?: number;          // heart-rate
    maxBpm?: number;          // heart-rate
    latestAgeSec?: number;    // heart-rate
    coverageCount?: number;   // hours-with-data (24h) or days-with-data (7/30/90)
    coverageTotal?: number;   // 24 (hours) or N (days) for the window
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
};

type HCActions = {
  hcInitialize: () => Promise<void>;
  hcGrantAll: () => Promise<void>;
  hcRefresh: () => Promise<void>;
  hcSetWindow: (w: WindowKey) => Promise<void>;
  hcOpenSettings: () => void;
};


const HC_LABEL: Record<MetricKey, string> = {
  steps: 'Steps',
  floors: 'Floors climbed',
  distance: 'Distance',
  activeCalories: 'Active calories',
  heartRate: 'Heart rate',
  sleep: 'Sleep',
};
const HC_UNIT: Record<MetricKey, string> = {
  steps: 'steps',
  floors: 'floors',
  distance: 'm',
  activeCalories: 'kcal',
  heartRate: 'bpm',
  sleep: 'min',
};
const HC_ORDER: MetricKey[] = ['steps', 'floors', 'distance', 'activeCalories', 'heartRate', 'sleep'];

const LOG = '[Store/HC]';
const log = (...a: any[]) => console.log(LOG, ...a);
const logE = (m: string, e: unknown) => console.log(LOG, m, (e as any)?.message ?? e);

// ---------------- Combined store ----------------
type Store = BaseState & BaseActions & HCState & HCActions;

// ---- Trend helpers (7d only for now) ----
type TrendDir = 'up' | 'down' | 'flat';
function pctChange(newV: number, oldV: number) {
  if (!Number.isFinite(newV) || !Number.isFinite(oldV) || oldV === 0) return 0;
  return ((newV - oldV) / oldV) * 100;
}



/**
 * For a 7d window with daily buckets, estimate trend by comparing
 * the sum of the last 3 full days vs the prior 3 full days.
 * If we have fewer than 6 data points >0, return flat.
 */
function compute7dTrend(buckets: { value: number }[], upDownThresholdPct = 5): { dir: TrendDir; pct: number | null } {
  if (!Array.isArray(buckets) || buckets.length < 6) return { dir: 'flat', pct: null };

  // keep numeric values only
  const vals = buckets.map(b => Number(b.value || 0));

  // Use last 6 buckets: [.., d-5, d-4, d-3, d-2, d-1, d0]
  // Compare last 3 full days vs prior 3. If the most recent bucket is partial, this still works OK.
  const last3 = vals.slice(-3).reduce((s, v) => s + v, 0);
  const prev3 = vals.slice(-6, -3).reduce((s, v) => s + v, 0);

  // Require at least some coverage
  const haveEnough = [last3, prev3].every(v => v > 0);
  if (!haveEnough) return { dir: 'flat', pct: null };

  const pct = pctChange(last3, prev3);
  if (pct >= upDownThresholdPct) return { dir: 'up', pct };
  if (pct <= -upDownThresholdPct) return { dir: 'down', pct };
  return { dir: 'flat', pct: Math.abs(pct) < 0.1 ? 0 : pct };
}


function trendFrom7dDaily(buckets: { value: number }[], thresholdPct = 5) {
  if (!Array.isArray(buckets) || buckets.length < 6) return { dir: 'flat' as TrendDir, pct: null };
  const vals = buckets.map(b => Number(b.value || 0));
  const last3 = vals.slice(-3).reduce((s, v) => s + v, 0);
  const prev3 = vals.slice(-6, -3).reduce((s, v) => s + v, 0);
  if (last3 <= 0 || prev3 <= 0) return { dir: 'flat' as TrendDir, pct: null };
  const pct = pctChange(last3, prev3);
  if (pct >= thresholdPct) return { dir: 'up' as TrendDir, pct };
  if (pct <= -thresholdPct) return { dir: 'down' as TrendDir, pct };
  return { dir: 'flat' as TrendDir, pct: Math.abs(pct) < 0.1 ? 0 : pct };
}

/**
 * 30d/90d daily buckets → compare last 7 days vs previous 7 days.
 */
function trendFromNDaysDaily(buckets: { value: number }[], thresholdPct = 5) {
  if (!Array.isArray(buckets) || buckets.length < 14) return { dir: 'flat' as TrendDir, pct: null };
  const vals = buckets.map(b => Number(b.value || 0));
  const last7 = vals.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = vals.slice(-14, -7).reduce((s, v) => s + v, 0);
  if (last7 <= 0 || prev7 <= 0) return { dir: 'flat' as TrendDir, pct: null };
  const pct = pctChange(last7, prev7);
  if (pct >= thresholdPct) return { dir: 'up' as TrendDir, pct };
  if (pct <= -thresholdPct) return { dir: 'down' as TrendDir, pct };
  return { dir: 'flat' as TrendDir, pct: Math.abs(pct) < 0.1 ? 0 : pct };
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
  const bucketable = metric !== 'heartRate' && metric !== 'sleep';
  if (!bucketable) return undefined;

  switch (window) {
    case '7d':
      return trendFrom7dDaily(buckets);
    case '30d':
    case '90d':
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
    if (inc > 0) { cumul += inc; changeHours += 1; }
    series.push({ ...b, value: cumul });
  }
  const last = series.length ? Number(series[series.length - 1].value) || 0 : 0;
  const events = cumulativeToChangeEvents(series);
  return { series, last, changeHours, events };
}

/** Replace 0/empty values with last non-zero (used for HR gaps). */
function forwardFill(buckets: NumBucket[]) {
  let lastSeen: number | null = null;
  return buckets.map(b => {
    const v = Number(b.value || 0);
    if (v > 0) { lastSeen = v; return { ...b, value: v }; }
    return lastSeen != null ? { ...b, value: lastSeen } : b;
  });
}



export const useTrackingStore = create<Store>((set, get) => ({
  // ---- Base init (restores fields other screens rely on) ----
  status: 'idle',
  error: undefined,

  assets: fxAssets,
  permissions: fxPermissions,
  goals: fxGoals,
  streakDays: fxStreakDays,
  insights: fxInsights,
  tileOrder: ['steps', 'active', 'sleep', 'hr_rest', 'energy'],
  lastSyncedAt: undefined,

  async requestPermissions(ids) {
    const target = new Set(ids ?? get().permissions.map(p => p.id));

    const updated: AssetPermission[] = get().permissions.map(p =>
      target.has(p.id)
        ? { ...p, status: 'granted' as const, lastPromptedAt: new Date().toISOString() }
        : p
    );
    set({ permissions: updated });

    const assets: Asset[] = get().assets.map(a =>
      target.has(a.id) && a.state === 'permission_needed'
        ? { ...a, state: 'ok' as const }
        : a
    );
    set({ assets });
  },

  async syncToday() {
    set({ status: 'loading', error: undefined });
    try {
      await wait(250);
      const now = new Date().toISOString();
      const assets: Asset[] = get().assets.map(a => ({ ...a, freshness: now }));
      set({ assets, lastSyncedAt: now, status: 'success' });
    } catch (e: any) {
      set({ status: 'error', error: e?.message ?? 'Sync failed' });
    }
  },

  setGoal(id, target) {
    const goals = get().goals.map(g => (g.id === id ? { ...g, target } : g));
    set({ goals });
  },

  setTileOrder(order) {
    set({ tileOrder: order });
  },



  // ---- HC init ----
  hcWindow: '7d',
  hcDatasets: [],
  hcGrantedKeys: [],
  hcError: undefined,
  hcLoading: false,
  hcInitialized: false,
  hcAvailable: false,
  hcRunId: 0,

  hcInitialize: async () => {
    try {
      log('initialize start');
      await ensureInitialized();
      const keys = await listGrantedMetricKeys() as MetricKey[];
      log('initialize success; granted=', keys);
      set({ hcGrantedKeys: keys, hcError: undefined, hcInitialized: true, hcAvailable: true });
    } catch (e) {
      logE('initialize failed', e);
      set({
        hcError: String((e as any)?.message ?? e),
        hcInitialized: true,
        hcAvailable: false,
      });
    }
  },

  hcGrantAll: async () => {
    try {
      log('grantAll start');
      await requestAllReadPermissions();
      const keys = await listGrantedMetricKeys() as MetricKey[];
      log('grantAll success; granted=', keys);
      set({ hcGrantedKeys: keys, hcError: undefined });
      await get().hcRefresh();
    } catch (e) {
      logE('grantAll failed', e);
      set({ hcError: String((e as any)?.message ?? e) });
    }
  },


  hcRefresh: async () => {
    const { hcWindow, hcLoading, hcRunId } = get();

    // prevent overlapping refreshes
    if (hcLoading) return;

    const myRun = hcRunId + 1;
    set({ hcLoading: true, hcError: undefined, hcRunId: myRun });
    const fetchedAtISO = new Date().toISOString();
    try {
      const granted = await listGrantedMetricKeys() as MetricKey[];
      log('refresh window=', hcWindow, 'granted=', granted);

      const datasets: HCDataset[] = [];

      for (const m of HC_ORDER) {
        if (!granted.includes(m)) continue;
        // 1) Load buckets only for metrics that support them in this view
        let buckets: HCBucket[] = [];
        try {
          const bucketable = m !== 'sleep';
          if (bucketable) {
            switch (hcWindow) {
              case '24h':
                buckets = await read24hBuckets(m as any);
                break;
              case '7d':
                buckets = await read7dBuckets(m as any);
                break;
              case '30d':
                buckets = await read30dBuckets(m as any);
                break;
              case '90d':
                buckets = await read90dBuckets(m as any);
                break;
            }
          }
        } catch (e) {
          logE(`bucket read failed for ${m} [${hcWindow}]`, e);
        }


        // Map to UI buckets
        const uiBuckets: DatasetBucket[] =
          (buckets ?? []).map(b => ({ start: b.start, end: b.end, value: Number(b.value ?? 0) || 0 }));

        // 2) Compute latest & total per metric in a consistent way
        let total = 0;
        let latest: number | null | undefined = null;

        // 3) Compute trend if applicable
        const trend = computeTrendForWindow(hcWindow, m, uiBuckets);

        const sumFromBuckets = uiBuckets.reduce((s, b) => s + (Number(b.value) || 0), 0);
        log('[Buckets]', m, hcWindow, 'len=', uiBuckets.length, 'sum=', sumFromBuckets);
        const lastBucketValue = uiBuckets.length ? Number(uiBuckets[uiBuckets.length - 1].value) || 0 : null;

        switch (m) {
          case 'steps':
          case 'floors':
          case 'distance':
          case 'activeCalories': {
            // Headline should come from the selected window’s buckets only.
            const coverageTotal =
              hcWindow === '24h' ? 24 :
                hcWindow === '7d' ? 7 :
                  hcWindow === '30d' ? 30 : 90;



            if (hcWindow === '24h') {
              // uiBuckets = RAW hourly increments (what we PLOT)
              // Build a cumulative shadow series only for totals & event logs
              const { series: cumulative, last: cumulativeLast, changeHours, events } =
                toCumulativeForwardFill(uiBuckets as NumBucket[]);

              const sumFromRaw = uiBuckets.reduce((s, b) => s + (Number(b.value) || 0), 0);

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
              const sumFromBuckets = uiBuckets.reduce((s, b) => s + (Number(b.value) || 0), 0);
              total = sumFromBuckets;
              latest = uiBuckets.length ? Number(uiBuckets[uiBuckets.length - 1].value) || 0 : null;

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
                  coverageCount: uiBuckets.filter(b => (Number(b.value) || 0) > 0).length,
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

          case 'heartRate': {
            try {
              let ui: DatasetBucket[] = [];
              if (hcWindow === '24h') {
                const hrBuckets = await readHeartRateHourly24();
                ui = hrBuckets.map(b => ({ start: b.start, end: b.end, value: Number(b.value || 0) }));
                // forward-fill hourly gaps so you never see 0 bpm
                ui = forwardFill(ui);
              } else {
                const days = hcWindow === '7d' ? 7 : hcWindow === '30d' ? 30 : 90;
                const hrDaily = await readHeartRateDailyBuckets(days as 7 | 30 | 90);
                let tmp = hrDaily.map(b => ({ start: b.start, end: b.end, value: Number(b.value || 0) }));
                // forward-fill daily gaps too (per your "Yes")
                ui = forwardFill(tmp);
              }

              const values = ui.map(b => Number(b.value || 0)).filter(n => n > 0);
              const minBpm = values.length ? Math.min(...values) : undefined;
              const maxBpm = values.length ? Math.max(...values) : undefined;

              // primary/latest: prefer the live latest; else last bucket (already forward-filled)
              let latest: number | null = null;
              let latestAgeSec: number | undefined = undefined;
              try {
                const { bpm, atISO } = await readHeartRateLatest();
                latest = bpm ?? (ui.length ? ui[ui.length - 1].value : null);
                if (bpm != null && atISO) {
                  const t = new Date(atISO).getTime();
                  latestAgeSec = latest ? Math.round((Date.now() - t) / 1000) : undefined;
                }
              } catch {
                latest = ui.length ? ui[ui.length - 1].value : null;
              }

              datasets.push({
                id: m, label: HC_LABEL[m], unit: HC_UNIT[m],
                buckets: ui,
                total: 0,                   // HR has no "total"
                latest,
                freshnessISO: fetchedAtISO,
                trend: computeTrendForWindow(hcWindow, m, ui), // optional; ok to keep
                meta: { minBpm, maxBpm, latestAgeSec },
              });
            } catch (e) {
              logE('hr read failed', e);
              datasets.push({
                id: m, label: HC_LABEL[m], unit: HC_UNIT[m],
                buckets: [],
                total: 0,
                latest: null,
                freshnessISO: new Date().toISOString(),
                trend: undefined,
              });
            }
            continue;
          }

          case 'sleep': {
            if (hcWindow === '24h') {
              // 24h → hourly buckets (minutes per hour). Fallback to today's total if needed.
              try {
                const sleep24 = await readSleepHourlyBuckets24(); // <-- import this
                const ui = sleep24.map(b => ({ start: b.start, end: b.end, value: Number(b.value || 0) }));
                const sum = ui.reduce((s, b) => s + (b.value || 0), 0);
                total = sum;
                // show the last hour’s minutes as "latest" (consistent with other metrics)
                latest = ui.length ? ui[ui.length - 1].value : null;

                datasets.push({
                  id: m, label: HC_LABEL[m], unit: HC_UNIT[m],
                  buckets: ui,
                  total,
                  latest,
                  freshnessISO: fetchedAtISO,
                  trend: undefined, // we don't compute trend for 24h
                  meta: {
                    coverageCount: ui.filter(b => (Number(b.value) || 0) > 0).length,
                    coverageTotal: 24,
                  },
                });
              } catch (e) {
                logE('sleep 24h buckets fail', e);
                // Fallback: surface today's total so the screen still shows something
                try { total = await readTodaySleepTotalMinutes(); } catch { }
                datasets.push({
                  id: m, label: HC_LABEL[m], unit: HC_UNIT[m],
                  buckets: [],
                  total: 0,
                  latest: null,
                  freshnessISO: fetchedAtISO,
                  trend: undefined,
                });
              }
            } else {
              // 7d/30d/90d → daily buckets (minutes per day)
              const days = hcWindow === '7d' ? 7 : hcWindow === '30d' ? 30 : 90;
              try {
                const sleepBuckets = await readSleepDailyBuckets(days as 7 | 30 | 90);
                const ui = sleepBuckets.map(b => ({ start: b.start, end: b.end, value: Number(b.value || 0) }));
                const sum = ui.reduce((s, b) => s + (b.value || 0), 0);
                total = sum;
                latest = null;
                const avgPerNight = Math.round(sum / (ui.length || 1));

                datasets.push({
                  id: m, label: HC_LABEL[m], unit: HC_UNIT[m],
                  buckets: ui,
                  total,
                  latest,
                  freshnessISO: fetchedAtISO,
                  trend: computeTrendForWindow(hcWindow, m, ui), // returns undefined for sleep
                  meta: {
                    avgPerNight,
                    coverageCount: ui.filter(b => (Number(b.value) || 0) > 0).length,
                    coverageTotal: days,
                  },
                });
              } catch (e) {
                logE('sleep buckets fail', e);
                datasets.push({
                  id: m, label: HC_LABEL[m], unit: HC_UNIT[m],
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
        });
      }

      log('refresh done datasets=', datasets.length);

    } catch (e) {
      logE('refresh failed', e);
      if (get().hcRunId === myRun) {
        set({ hcError: String((e as any)?.message ?? e) });
      }
    } finally {
      if (get().hcRunId === myRun) {
        set({ hcLoading: false });
      }
    }
  },

  hcSetWindow: async (w) => {
    const cur = get().hcWindow;
    if (cur === w) return; // no-op if unchanged
    set({ hcWindow: w });
    log('setWindow', w);
    // Refresh datasets only
    await get().hcRefresh();
  },


  hcOpenSettings: () => {
    openHealthConnectSettings();
  },
}));
