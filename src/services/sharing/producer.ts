// src/services/sharing/producer.ts
// Builds a segment payload for a given window and drives upload with retries.
//
// Real data only (Health Connect / HealthKit). No mocks here.
//
// Engine behavior:
// • One-time GRACE wait at the start of a new due day to absorb provider write latency.
// • If payload.hasData === false → schedule retry (up to MAX_RETRIES).
// • After 3 consecutive no-data retries on the same day → status = CANCELLED.
// • On successful upload → clear retries, advance lastSentDayIndex, increment segmentsSent.

import { uploadSegment } from './api';
import {
  GRACE_WAIT_MS,
  MAX_RETRIES,
  RETRY_INTERVAL_MS,
  getShareRuntimeConfig,
} from './constants';
import { summarizeWindow, type MetricCode } from './summarizer';
import type {
  ShareSessionState,
  UploadSegmentResult,
} from './types';

const TAG = '[SHARE][Producer]';

// ─────────────────────────────────────────────────────────────────────────────
// Segment payload building (per your existing structure)
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentPayload = {
  sessionId: number;
  postingId: number;
  userId: number;
  dayIndex: number;
  fromUtc: string;
  toUtc: string;
  hasData: boolean;
  metrics: Array<{
    metricId: number;
    unitCode: string;
    totalValue?: number | null;
    avgValue?: number | null;
    minValue?: number | null;
    maxValue?: number | null;
    samplesCount?: number | null;
    computedJson?: any;
  }>;
};

/**
 * Build a segment payload by summarizing each requested metric inside [fromUtc, toUtc).
 * Uses REAL device data only. If any metric shows a meaningful value (total>0 or samples>0),
 * the segment is considered hasData=true.
 */
export async function buildSegmentPayload(
  window: { fromUtc: string; toUtc: string; dayIndex: number },
  ctx: {
    sessionId: number;
    postingId: number;
    userId: number;
    metricMap: Record<MetricCode, number>; // e.g. { STEPS:101, HR:110, KCAL:140 }
    probeOnly?: boolean; // for Day-0 decisions, optional
  }
): Promise<SegmentPayload> {
  const { fromUtc, toUtc, dayIndex } = window;
  console.log(TAG, 'Building payload', { dayIndex, fromUtc, toUtc });

  const metricsOut: SegmentPayload['metrics'] = [];
  let anyData = false;

  for (const [code, metricId] of Object.entries(ctx.metricMap) as Array<[MetricCode, number]>) {
    const s = await summarizeWindow(code, fromUtc, toUtc, ctx.probeOnly ? { probeOnly: true } : undefined);
    if (!s) continue;

    const meaningful =
      (s.totalValue != null && Number(s.totalValue) > 0) ||
      (s.samplesCount != null && Number(s.samplesCount) > 0);
    anyData = anyData || meaningful;

    metricsOut.push({
      metricId,
      unitCode: s.unitCode,
      totalValue: s.totalValue ?? null,
      avgValue: s.avgValue ?? null,
      minValue: s.minValue ?? null,
      maxValue: s.maxValue ?? null,
      samplesCount: s.samplesCount ?? null,
      computedJson: s.computedJson ?? null,
    });
  }

  const payload: SegmentPayload = {
    sessionId: ctx.sessionId,
    postingId: ctx.postingId,
    userId: ctx.userId,
    dayIndex,
    fromUtc,
    toUtc,
    hasData: anyData,
    metrics: metricsOut,
  };

  console.log(TAG, 'hasData=', anyData, 'metrics=', metricsOut.length);
  // console.log(TAG, 'Payload ↓\n' + JSON.stringify(payload, null, 2));
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Producer engine (tick) — enforces grace wait, retries, cancel-after-3
// ─────────────────────────────────────────────────────────────────────────────

function iso(t: number | null | undefined) {
  return t == null ? null : new Date(t).toISOString();
}

/** Normalize whatever the API returns into an internal UploadSegmentResult shape. */
function normalizeUploadResult(raw: any): UploadSegmentResult {
  const hasOk = typeof raw?.ok === 'boolean';
  const ok = hasOk ? !!raw.ok : (!!raw?.status && !raw?.error);
  const status = typeof raw?.status === 'string' ? raw.status : undefined;
  const error = raw?.error ? String(raw.error) : undefined;
  return { ok, status, error };
}

/**
 * Process a single due window. Honors:
 *  - session.status (ACTIVE required)
 *  - GRACE_WAIT_MS (one-time per day)
 *  - NO_DATA retries up to MAX_RETRIES, spaced by RETRY_INTERVAL_MS
 *  - CANCELLED after 3 missed retries on that same day
 *
 * Returns the **updated** ShareSessionState for persistence in the store.
 */
export async function processDueWindow(
  window: { fromUtc: string; toUtc: string; dayIndex: number },
  ctx: {
    sessionId: number;
    postingId: number;
    userId: number;
    metricMap: Record<MetricCode, number>;
  },
  state: ShareSessionState,
  nowUtc: number = Date.now()
): Promise<ShareSessionState> {
  // One-time config banner per app lifetime
  if (!(global as any).__SHARE_CONFIG_LOGGED__) {
    (global as any).__SHARE_CONFIG_LOGGED__ = true;
    console.log('[SHARE][Config]', getShareRuntimeConfig());
  }

  if (state.status !== 'ACTIVE') {
    console.log(TAG, 'skip: status != ACTIVE', { status: state.status, dayIdx: window.dayIndex });
    return state;
  }

  // NEW: idempotency/duplicate-guard — never re-send an already-sent index
  if (state.lastSentDayIndex != null && window.dayIndex <= state.lastSentDayIndex) {
    console.log(TAG, 'skip: already sent', {
      requestedDayIdx: window.dayIndex,
      lastSentDayIndex: state.lastSentDayIndex,
    });
    return state;
  }

  if (state.currentDueDayIndex !== window.dayIndex) {
    state = {
      ...state,
      currentDueDayIndex: window.dayIndex,
      noDataRetryCount: 0,
      nextRetryAtUtc: null,      // clear any pending retry from prior day
      graceAppliedForDay: null,  // allow grace to apply once for this new day
    };
  }

  // Retry gate — if nextRetryAtUtc is in the future, wait.
  if (state.nextRetryAtUtc && nowUtc < state.nextRetryAtUtc) {
    console.log(TAG, 'retry-wait', {
      dayIdx: state.currentDueDayIndex ?? window.dayIndex,
      nowISO: new Date(nowUtc).toISOString(),
      nextRetryAtISO: iso(state.nextRetryAtUtc),
      secondsRemaining: Math.max(0, Math.ceil((state.nextRetryAtUtc - nowUtc) / 1000)),
      noDataRetryCount: state.noDataRetryCount,
    });
    return state;
  }

  // One-time grace per new due day to absorb provider write latency
  // IMPORTANT: do NOT apply grace to Day-0 (that window is midnight→join, not a tick)
  if (window.dayIndex !== 0 && GRACE_WAIT_MS > 0 && state.graceAppliedForDay !== window.dayIndex) {
    console.log(TAG, 'grace-wait', { dayIdx: window.dayIndex, ms: GRACE_WAIT_MS });
    return {
      ...state,
      currentDueDayIndex: window.dayIndex,
      nextRetryAtUtc: nowUtc + GRACE_WAIT_MS,
      graceAppliedForDay: window.dayIndex,
    };
  }

  // Build payload from REAL data
  const payload = await buildSegmentPayload(window, {
    sessionId: ctx.sessionId,
    postingId: ctx.postingId,
    userId: ctx.userId,
    metricMap: ctx.metricMap,
  });

  if (!payload.hasData) {
    const newCount = state.noDataRetryCount + 1;

    if (newCount >= MAX_RETRIES) {
      console.log(TAG, 'CANCELLED', {
        reason: 'NO_DATA_RETRIES_EXHAUSTED',
        failedDayIndex: window.dayIndex,
        retries: newCount,
      });
      return {
        ...state,
        status: 'CANCELLED',
        currentDueDayIndex: window.dayIndex,
        noDataRetryCount: newCount,
        nextRetryAtUtc: null,
      };
    }

    const nextRetryAtUtc = nowUtc + RETRY_INTERVAL_MS;
    console.log(TAG, 'no-data → retry', {
      dayIdx: window.dayIndex,
      noDataRetryCount: newCount,
      nextRetryAtISO: new Date(nextRetryAtUtc).toISOString(),
    });

    return {
      ...state,
      currentDueDayIndex: window.dayIndex,
      noDataRetryCount: newCount,
      nextRetryAtUtc,
    };
  }

  // Upload segment — pass the FULL SegmentPayload (matches your API expectation)
  const rawRes: any = await uploadSegment(payload as any);

  // Normalize to a stable shape the engine understands
  const res: UploadSegmentResult = normalizeUploadResult(rawRes);

  if (res.ok) {
    console.log('[SHARE][API] upload success', {
      dayIndex: payload.dayIndex,
      status: res.status ?? 'ACTIVE',
    });

    // Build next engine snapshot
    const next: ShareSessionState = {
      ...state,
      lastSentDayIndex: payload.dayIndex,
      segmentsSent: (state.segmentsSent ?? 0) + 1,
      currentDueDayIndex: null,
      noDataRetryCount: 0,
      nextRetryAtUtc: null,
      graceAppliedForDay: null,
    };

    // ✅ Normalize status to COMPLETE when done
    const expected = next.segmentsExpected ?? 0;
    const sent = next.segmentsSent ?? 0;
    if (res.status === 'COMPLETE' || (expected > 0 && sent >= expected)) {
      next.status = 'COMPLETE';
    } else {
      next.status = 'ACTIVE';
    }

    return next;
  } else {
    console.warn('[SHARE][API] upload failed', {
      dayIndex: payload.dayIndex,
      error: res.error,
    });
    // Upload errors can have their own retry policy; for now we keep state unchanged.
    return state;
  }
}
