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

import { uploadSegment } from "./api";
import {
  GRACE_WAIT_MS,
  MAX_RETRIES,
  RETRY_INTERVAL_MS,
  getShareRuntimeConfig,
} from "./constants";
import { summarizeWindow, type MetricCode } from "./summarizer";
import type { ShareSessionState, UploadSegmentResult } from "./types";

const TAG = "[SHARE][Producer]";

const DEFAULT_UNIT: Record<
  MetricCode,
  SegmentPayload["metrics"][number]["unitCode"]
> = {
  STEPS: "COUNT",
  FLOORS: "COUNT",
  DISTANCE: "M",
  KCAL: "KCAL",
  HR: "BPM",
  SLEEP: "MIN",
};

export type WindowDiagnostics = {
  unavailable: MetricCode[]; // permission missing or read error
  zeroData: MetricCode[]; // readable, but no data in [from,to)
  hadAnyData: boolean; // at least one metric had meaningful data
};

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

/** ───────────────────────── Utilities ───────────────────────── */
// ★ Jitter helper: spreads calls a bit to avoid thundering herd
function withJitter(baseMs: number, spreadRatio = 0.1): number {
  if (!baseMs || baseMs <= 0) return 0;
  const spread = Math.max(0, Math.floor(baseMs * spreadRatio));
  const delta = Math.floor(Math.random() * (2 * spread + 1)) - spread; // [-spread, +spread]
  return Math.max(0, baseMs + delta);
}

// ★ Window validator: prevent accidental bad windows
function windowLooksValid(fromIso: string, toIso: string): boolean {
  const s = Date.parse(fromIso);
  const e = Date.parse(toIso);
  return Number.isFinite(s) && Number.isFinite(e) && s < e;
}

/** ───────────────────────── Segment Payload Builder ───────────────────────── */
/**
 * Build a segment payload by summarizing each requested metric inside [fromUtc, toUtc).
 * - Always includes ALL requested metricIds in the payload.
 * - Marks payload.hasData=true if ANY metric has meaningful data (total>0 or samples>0).
 * - Returns diagnostics so the caller can message the user.
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
): Promise<{ payload: SegmentPayload; diag: WindowDiagnostics }> {
  const { fromUtc, toUtc, dayIndex } = window;
  console.log(TAG, "Building payload", { dayIndex, fromUtc, toUtc });

  const metricsOut: SegmentPayload["metrics"] = [];
  let anyData = false;

  const diag: WindowDiagnostics = {
    unavailable: [],
    zeroData: [],
    hadAnyData: false,
  };

  for (const [code, metricId] of Object.entries(ctx.metricMap) as Array<
    [MetricCode, number]
  >) {
    const s = await summarizeWindow(
      code,
      fromUtc,
      toUtc,
      ctx.probeOnly ? { probeOnly: true } : undefined
    );

    // Unreadable metric (no permission / read error) → include placeholder row
    if (!s) {
      diag.unavailable.push(code);
      metricsOut.push({
        metricId,
        unitCode: DEFAULT_UNIT[code],
        totalValue: null,
        avgValue: null,
        minValue: null,
        maxValue: null,
        samplesCount: 0,
        computedJson: { status: "UNAVAILABLE" },
      });
      continue;
    }

    // Readable metric: decide if it has meaningful data
    const meaningful =
      (s.totalValue != null && Number(s.totalValue) > 0) ||
      (s.samplesCount != null && Number(s.samplesCount) > 0);

    if (!meaningful) {
      diag.zeroData.push(code);
    } else {
      anyData = true;
    }

    metricsOut.push({
      metricId,
      unitCode: s.unitCode,
      totalValue: s.totalValue ?? null,
      avgValue: s.avgValue ?? null,
      minValue: s.minValue ?? null,
      maxValue: s.maxValue ?? null,
      samplesCount: s.samplesCount ?? null,
      computedJson: {
        ...(s.computedJson ?? {}),
        status: meaningful ? "OK" : "NO_DATA",
      },
    });
  }

  diag.hadAnyData = anyData;

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

  console.log(TAG, "hasData=", anyData, "metrics=", metricsOut.length);
  return { payload, diag };
}

// ─────────────────────────────────────────────────────────────────────────────
// Producer engine (tick) — enforces grace wait, retries, cancel-after-3
// ─────────────────────────────────────────────────────────────────────────────

function iso(t: number | null | undefined) {
  return t == null ? null : new Date(t).toISOString();
}

/** Normalize whatever the API returns into an internal UploadSegmentResult shape. */
function normalizeUploadResult(raw: any): UploadSegmentResult {
  const hasOk = typeof raw?.ok === "boolean";
  const ok = hasOk ? !!raw.ok : !!raw?.status && !raw?.error;
  const status = typeof raw?.status === "string" ? raw.status : undefined;
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
 * Returns { state, diag } so the caller can message the user.
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
): Promise<{ state: ShareSessionState; diag?: WindowDiagnostics }> {
  // One-time config banner per app lifetime
  if (!(global as any).__SHARE_CONFIG_LOGGED__) {
    (global as any).__SHARE_CONFIG_LOGGED__ = true;
    console.log("[SHARE][Config]", getShareRuntimeConfig());
  }

  //  Validate window early
  if (!windowLooksValid(window.fromUtc, window.toUtc)) {
    console.warn(TAG, "skip: invalid window", window);
    return { state };
  }

  if (state.status !== "ACTIVE") {
    console.log(TAG, "skip: status != ACTIVE", {
      status: state.status,
      dayIdx: window.dayIndex,
    });
    return { state };
  }

  // Idempotency — never re-send an already-sent index
  if (
    state.lastSentDayIndex != null &&
    window.dayIndex <= state.lastSentDayIndex
  ) {
    console.log(TAG, "skip: already sent", {
      requestedDayIdx: window.dayIndex,
      lastSentDayIndex: state.lastSentDayIndex,
    });
    return { state };
  }

  if (state.currentDueDayIndex !== window.dayIndex) {
    state = {
      ...state,
      currentDueDayIndex: window.dayIndex,
      noDataRetryCount: 0,
      nextRetryAtUtc: null, // clear any pending retry from prior day
      graceAppliedForDay: null, // allow grace to apply once for this new day
    };
  }

  // Retry gate — if nextRetryAtUtc is in the future, wait.
  if (state.nextRetryAtUtc && nowUtc < state.nextRetryAtUtc) {
    console.log(TAG, "retry-wait", {
      dayIdx: state.currentDueDayIndex ?? window.dayIndex,
      nowISO: new Date(nowUtc).toISOString(),
      nextRetryAtISO: iso(state.nextRetryAtUtc),
      secondsRemaining: Math.max(
        0,
        Math.ceil((state.nextRetryAtUtc - nowUtc) / 1000)
      ),
      noDataRetryCount: state.noDataRetryCount,
    });
    return { state };
  }
  // ★ Day-0: fast probe-first path (avoid heavy compute when clearly no data yet)
  if (window.dayIndex === 0) {
    const { payload: probePayload, diag: probeDiag } =
      await buildSegmentPayload(window, { ...ctx, probeOnly: true });
    if (!probePayload.hasData) {
      const nextRetryAtUtc =
        nowUtc + withJitter(GRACE_WAIT_MS || RETRY_INTERVAL_MS); // prefer grace, fallback to retry interval
      console.log(TAG, "day0-probe no-data → short-wait", {
        dayIdx: window.dayIndex,
        nextRetryAtISO: new Date(nextRetryAtUtc).toISOString(),
        diag: probeDiag,
      });
      return {
        state: {
          ...state,
          currentDueDayIndex: window.dayIndex,
          noDataRetryCount: (state.noDataRetryCount ?? 0) + 1, // count toward retries, but still gentle on day-0
          nextRetryAtUtc,
        },
        diag: probeDiag,
      };
    }
    // If probe found data, continue to full build below.
  }

  // One-time grace per new due day to absorb provider write latency (not for Day-0)
  if (
    window.dayIndex !== 0 &&
    GRACE_WAIT_MS > 0 &&
    state.graceAppliedForDay !== window.dayIndex
  ) {
    const waitMs = withJitter(GRACE_WAIT_MS);
    console.log(TAG, "grace-wait", { dayIdx: window.dayIndex, ms: waitMs });
    return {
      state: {
        ...state,
        currentDueDayIndex: window.dayIndex,
        nextRetryAtUtc: nowUtc + waitMs,
        graceAppliedForDay: window.dayIndex,
      },
    };
  }

  // Build payload from REAL data (now returns { payload, diag })
  const { payload, diag } = await buildSegmentPayload(window, {
    sessionId: ctx.sessionId,
    postingId: ctx.postingId,
    userId: ctx.userId,
    metricMap: ctx.metricMap,
  });

  if (!payload.hasData) {
    const newCount = state.noDataRetryCount + 1;

    if (newCount >= MAX_RETRIES) {
      console.log(TAG, "CANCELLED", {
        reason: "NO_DATA_RETRIES_EXHAUSTED",
        failedDayIndex: window.dayIndex,
        retries: newCount,
        diag,
      });
      return {
        state: {
          ...state,
          status: "CANCELLED",
          currentDueDayIndex: window.dayIndex,
          noDataRetryCount: newCount,
          nextRetryAtUtc: null,
        },
        diag,
      };
    }

    const nextRetryAtUtc = nowUtc + withJitter(RETRY_INTERVAL_MS);
    console.log(TAG, "no-data → retry", {
      dayIdx: window.dayIndex,
      noDataRetryCount: newCount,
      nextRetryAtISO: new Date(nextRetryAtUtc).toISOString(),
      diag,
    });

    return {
      state: {
        ...state,
        currentDueDayIndex: window.dayIndex,
        noDataRetryCount: newCount,
        nextRetryAtUtc,
      },
      diag,
    };
  }

  // Upload segment — pass the FULL SegmentPayload
  // const rawRes: any = await uploadSegment(payload as any);
  //   const res: UploadSegmentResult = normalizeUploadResult(rawRes);

  //   if (res.ok) {
  //     console.log('[SHARE][API] upload success', {
  //       dayIndex: payload.dayIndex,
  //       status: res.status ?? 'ACTIVE',
  //       diag,
  //     });

  //     const next: ShareSessionState = {
  //       ...state,
  //       lastSentDayIndex: payload.dayIndex,
  //       segmentsSent: (state.segmentsSent ?? 0) + 1,
  //       currentDueDayIndex: null,
  //       noDataRetryCount: 0,
  //       nextRetryAtUtc: null,
  //       graceAppliedForDay: null,
  //     };

  //     const expected = next.segmentsExpected ?? 0;
  //     const sent = next.segmentsSent ?? 0;
  //     next.status = (res.status === 'COMPLETE' || (expected > 0 && sent >= expected)) ? 'COMPLETE' : 'ACTIVE';

  //     return { state: next, diag };
  //   } else {
  //     console.warn('[SHARE][API] upload failed', {
  //       dayIndex: payload.dayIndex,
  //       error: res.error,
  //       diag,
  //     });
  //     // Keep state unchanged; caller can decide UX
  //     return { state, diag };
  //   }
  // }

  let res: UploadSegmentResult;
  try {
    const rawRes: any = await uploadSegment(payload as any);
    res = normalizeUploadResult(rawRes);
  } catch (e: any) {
    // ★ Transport errors become a normalized failure
    console.warn("[SHARE][API] upload threw", {
      dayIndex: payload.dayIndex,
      err: String(e?.message ?? e),
    });
    res = { ok: false, error: String(e?.message ?? e) };
  }

  if (res.ok) {
    console.log("[SHARE][API] upload success", {
      dayIndex: payload.dayIndex,
      status: res.status ?? "ACTIVE",
      diag,
    });

    const next: ShareSessionState = {
      ...state,
      lastSentDayIndex: payload.dayIndex,
      segmentsSent: (state.segmentsSent ?? 0) + 1,
      currentDueDayIndex: null,
      noDataRetryCount: 0,
      nextRetryAtUtc: null,
      graceAppliedForDay: null,
    };

    const expected = next.segmentsExpected ?? 0;
    const sent = next.segmentsSent ?? 0;
    next.status =
      res.status === "COMPLETE" || (expected > 0 && sent >= expected)
        ? "COMPLETE"
        : "ACTIVE";

    return { state: next, diag };
  } else {
    console.warn("[SHARE][API] upload failed", {
      dayIndex: payload.dayIndex,
      error: res.error,
      diag,
    });
    // Keep state unchanged; caller can decide UX
    return { state, diag };
  }
}
