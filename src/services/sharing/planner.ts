// src/services/sharing/planner.ts
// Plans Day-0 and subsequent windows anchored to the join instant.
// All returned boundaries are UTC ISO strings. Window semantics: [fromUtc, toUtc)

import { DAY_LENGTH_MS as DAY_MS, GRACE_WAIT_MS } from './constants';

const TAG = '[SHARE][Planner]';

export type Window = { fromUtc: string; toUtc: string; dayIndex: number };

export type PlannerContext = {
  joinTimeLocalISO: string;          // e.g. '2025-10-15T15:12:00-04:00' (has offset)
  joinTimezone: string;              // e.g. 'America/New_York' (for logs / future use)
  cycleAnchorUtc: string;            // e.g. '2025-10-15T19:12:00Z' (join instant, UTC)
  segmentsExpected: number;          // N days required
  alreadySentDayIndices: number[];   // e.g. [0,1]

  // NEW (optional) — lets planner cooperate with engine mode/locks without breaking callers
  mode?: 'NORMAL' | 'SIM';
  simulationLock?: boolean;          // when true, tick/planner should be passive (SIM step owns progression)
  lastSentDayIndex?: number | null;  // authoritative progression index if present
};
export type Day0ProbeFn = (range: { fromUtc: string; toUtc: string }) => Promise<boolean>;

// ANCHOR: day0-window-async
/**
 * Convenience: compute Day-0 decision using a supplied probe callback (platform-specific).
 * - The callback should return true if *any* meaningful data exists in [localMidnight -> join].
 * - Falls back to the same Day-0 rules as planDay0Window().
 */
export async function planDay0WindowAsync(
  ctx: PlannerContext,
  probe: Day0ProbeFn
): Promise<Window | null> {
  const already = new Set(ctx.alreadySentDayIndices);

  // Build Day-0 candidate boundaries
  const fromUtc = localMidnightISOOf(ctx.joinTimeLocalISO);
  const toUtc = new Date(ctx.cycleAnchorUtc).toISOString();

  const hasData = await probe({ fromUtc, toUtc });

  if (hasData) {
    if (already.has(0)) return null;
    console.log(TAG, 'Day0 (async) → hasData=true', { fromUtc, toUtc });
    return { fromUtc, toUtc, dayIndex: 0 };
  }

  // no Day-0 segment; first due is a full day
  if (already.has(1)) return null;
  const w1 = computeWindowForDayIndex(ctx.cycleAnchorUtc, 1);
  console.log(TAG, 'Day0 (async) → hasData=false; first=DayIndex 1', w1);
  return { ...w1, dayIndex: 1 };
}
// ─────────────────────────────────────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the UTC ISO for *local midnight in the same offset as the join instant*.
 * We do not rely on JS runtime timezone; we reuse the offset in `joinLocalISO`.
 * Example:
 *   joinLocalISO = '2025-10-15T15:12:00-04:00'
 *   → midnight (local w/ same offset) = '2025-10-15T00:00:00-04:00' → to UTC ISO.
 */
function localMidnightISOOf(joinLocalISO: string): string {
  const datePart = joinLocalISO.slice(0, 10); // 'YYYY-MM-DD'
  const plus = joinLocalISO.lastIndexOf('+');
  const minus = joinLocalISO.lastIndexOf('-');
  const offIdx = Math.max(plus, minus);
  const offset = offIdx > 10 ? joinLocalISO.slice(offIdx) : 'Z'; // default to UTC if missing
  const midnightWithOffset = `${datePart}T00:00:00${offset}`;
  return new Date(midnightWithOffset).toISOString();
}

// Tick boundary (exclusive end) at a given day index from the anchor.
// dayIdx: 0 at anchor (end == anchor), 1 at anchor+DAY_MS, etc.
function tickUtcAtDayIndex(anchorUtcISO: string, dayIdx: number): string {
  const anchorMs = new Date(anchorUtcISO).getTime();
  return new Date(anchorMs + dayIdx * DAY_MS).toISOString();
}

/** Current day index (floor) relative to anchor, where 0 means the join day (tick at anchor). */
export function currentDayIndexFrom(anchorUtcISO: string, nowUtcISO: string): number {
  const now = new Date(nowUtcISO).getTime();
  const anchor = new Date(anchorUtcISO).getTime();
  if (!Number.isFinite(now) || !Number.isFinite(anchor)) return 0;
  return Math.max(0, Math.floor((now - anchor) / DAY_MS));
}

/** Pure math: compute window in ms for a given anchor and day index. */
export function computeWindowMs(
  anchorMs: number,
  dayIdx: number,
  dayMs: number = DAY_MS,
): { fromMs: number; toMs: number } {
  if (dayIdx === 0) {
    // Day-0 is special (midnight→join), not a ticked window.
    throw new Error(`${TAG} computeWindowMs(0) invalid; use planDay0Window()`);
  }
  const toMs = anchorMs + dayIdx * dayMs;
  const fromMs = toMs - dayMs;
  return { fromMs, toMs };
}

/** Pure math: compute window ISO for a given anchor ISO and day index. */
export function computeWindowForDayIndex(
  anchorUtcISO: string,
  dayIdx: number,
): { fromUtc: string; toUtc: string } {
  if (dayIdx === 0) {
    throw new Error(`${TAG} computeWindowForDayIndex(0) invalid; use planDay0Window()`);
  }
  const anchorMs = new Date(anchorUtcISO).getTime();
  const { fromMs, toMs } = computeWindowMs(anchorMs, dayIdx, DAY_MS);
  return { fromUtc: new Date(fromMs).toISOString(), toUtc: new Date(toMs).toISOString() };
}

/** Given sent info, choose the next monotonic day index to process. */
export function nextDayIndex(
  lastSentDayIndex: number | null | undefined,
  alreadySentDayIndices: number[],
): number {
  if (lastSentDayIndex != null) return lastSentDayIndex + 1;
  // Fallback: derive from the set (handles older callers)
  const max = alreadySentDayIndices.length ? Math.max(...alreadySentDayIndices) : -1;
  return max + 1;
}

/**
 * Day-0 rule:
 *  - Probe [localMidnight -> join] for any data (caller provides result).
 *  - If has data -> DayIndex 0 is [localMidnight -> join] (send immediately; no grace).
 *  - Else first window is a full day: DayIndex 1 = [anchor -> anchor+DAY_MS].
 */
export function planDay0Window(
  ctx: PlannerContext,
  hasAnyDataBetweenMidnightAndJoin: boolean,
): Window | null {
  const already = new Set(ctx.alreadySentDayIndices);
  if (hasAnyDataBetweenMidnightAndJoin) {
    if (already.has(0)) return null;
    const fromUtc = localMidnightISOOf(ctx.joinTimeLocalISO); // local midnight (same offset) → UTC ISO
    const toUtc = new Date(ctx.cycleAnchorUtc).toISOString(); // join instant UTC
    console.log(TAG, 'Day0 → hasData=true', { fromUtc, toUtc });
    return { fromUtc, toUtc, dayIndex: 0 };
  } else {
    // no Day-0 segment; first due is DayIndex 1 (full day)
    if (already.has(1)) return null;
    const { fromUtc, toUtc } = computeWindowForDayIndex(ctx.cycleAnchorUtc, 1);
    console.log(TAG, 'Day0 → hasData=false; first=DayIndex 1', { fromUtc, toUtc });
    return { fromUtc, toUtc, dayIndex: 1 };
  }
}

/** Is the end of this window (toUtc) past grace? */
export function isWindowPastGrace(toUtcISO: string, nowUtcISO: string): boolean {
  const dueAt = new Date(toUtcISO).getTime() + GRACE_WAIT_MS;
  return new Date(nowUtcISO).getTime() >= dueAt;
}


/** Compute the due-at timestamp (end+grace) for a window. */
export function dueAtMs(toUtcISO: string): number {
  return new Date(toUtcISO).getTime() + GRACE_WAIT_MS;
}

/** Earliest next wake-up (ISO) when *any* unsent window becomes due (end+grace) */
export function computeEarliestNextDueAtISO(ctx: PlannerContext, nowUtcISO: string): string | null {
  const now = new Date(nowUtcISO).getTime();
  const anchor = new Date(ctx.cycleAnchorUtc).getTime();
  if (Number.isNaN(now) || Number.isNaN(anchor)) return null;

  const sent = new Set(ctx.alreadySentDayIndices);
  let earliest: number | null = null;

  for (let dayIdx = 1; dayIdx <= ctx.segmentsExpected; dayIdx++) {
    if (sent.has(dayIdx)) continue;
    const { toUtc } = computeWindowForDayIndex(ctx.cycleAnchorUtc, dayIdx);
    const d = dueAtMs(toUtc);
    if (d > now) earliest = (earliest == null) ? d : Math.min(earliest, d);
  }

  return earliest != null ? new Date(earliest).toISOString() : null;
}
/**
 * Return a window only if its end+grace has passed (NORMAL mode).
 * Otherwise return { nextDueAtISO } so the caller can schedule a wake-up.
 * This is useful for “sleep until next due” behavior.
 */
export function planNextDueWindowWithGrace(
  ctx: PlannerContext,
  nowUtcISO: string,
): Window | { nextDueAtISO: string } | null {
  // In SIM mode, planner is passive; a simulate step owns the exact index/window.
  if (ctx.mode === 'SIM') {
    console.log(TAG, 'Passive in SIM (withGrace)');
    return null;
  }

  const now = new Date(nowUtcISO).getTime();
  const anchor = new Date(ctx.cycleAnchorUtc).getTime();
  if (Number.isNaN(now) || Number.isNaN(anchor)) return null;

  const sent = new Set(ctx.alreadySentDayIndices);
  let earliestNextDueAt: number | null = null;

  // Day-0 is decided by probe; start from 1.
  for (let dayIdx = 1; dayIdx <= ctx.segmentsExpected; dayIdx++) {
    if (sent.has(dayIdx)) continue;
    const { fromUtc, toUtc } = computeWindowForDayIndex(ctx.cycleAnchorUtc, dayIdx);
    const dueAt = new Date(toUtc).getTime() + GRACE_WAIT_MS;

    if (now >= dueAt) {
      console.log(TAG, 'Next due window (grace passed)', { dayIdx, fromUtc, toUtc, now: nowUtcISO });
      return { fromUtc, toUtc, dayIndex: dayIdx };
    } else {
      earliestNextDueAt = earliestNextDueAt == null ? dueAt : Math.min(earliestNextDueAt, dueAt);
    }
  }

  if (earliestNextDueAt != null) {
    const nextDueAtISO = new Date(earliestNextDueAt).toISOString();
    console.log(TAG, 'No window due yet; next due at (end+grace)', { nextDueAtISO });
    return { nextDueAtISO };
  }

  console.log(TAG, 'No window due at this time.');
  return null;
}

/**
 * NORMAL mode: Returns the next single due window at/after now, skipping ones already sent (excludes Day-0 decision).
 * NOTE: Only returns windows whose tick has already passed (i.e., not future).
 */
export function planNextDueWindow(ctx: PlannerContext, nowUtcISO: string): Window | null {
  // In SIM mode, planner is passive; simulate step provides exact index/window.
  if (ctx.mode === 'SIM') {
    console.log(TAG, 'Passive in SIM (planNextDueWindow)');
    return null;
  }

  const now = new Date(nowUtcISO).getTime();
  const anchor = new Date(ctx.cycleAnchorUtc).getTime();
  if (Number.isNaN(now) || Number.isNaN(anchor)) return null;

  // Only allow windows whose end has ticked (no future).
  const lastTickIdx = Math.max(0, Math.floor((now - anchor) / DAY_MS));

  const sent = new Set(ctx.alreadySentDayIndices);
  const startIdx = Math.max(1, nextDayIndex(ctx.lastSentDayIndex ?? null, ctx.alreadySentDayIndices));

  for (let dayIdx = startIdx; dayIdx <= ctx.segmentsExpected; dayIdx++) {
    if (sent.has(dayIdx)) continue;
    if (dayIdx <= lastTickIdx) {
      const { fromUtc, toUtc } = computeWindowForDayIndex(ctx.cycleAnchorUtc, dayIdx);
      console.log(TAG, 'Next due window', { dayIdx, fromUtc, toUtc, now: nowUtcISO });
      return { fromUtc, toUtc, dayIndex: dayIdx };
    }
  }

  console.log(TAG, 'No window due at this time.');
  return null;
}

/**
 * SIMULATION helper: return the exact window for a specific target day index,
 * ignoring "now". The caller (simulate step) must guarantee the index is valid
 * and not already sent.
 */
export function planSimulatedWindow(
  ctx: PlannerContext,
  targetDayIndex: number
): Window {
  if (!Number.isFinite(targetDayIndex) || targetDayIndex < 1) {
    throw new Error(`${TAG} planSimulatedWindow: targetDayIndex must be ≥ 1`);
  }
  if (ctx.segmentsExpected > 0 && targetDayIndex > ctx.segmentsExpected) {
    throw new Error(`${TAG} planSimulatedWindow: targetDayIndex > segmentsExpected`);
  }

  const t0 = new Date(ctx.cycleAnchorUtc).getTime(); // ORIGINAL join instant (UTC)
  if (!Number.isFinite(t0)) {
    throw new Error(`${TAG} planSimulatedWindow: invalid cycleAnchorUtc`);
  }

  // [T₀ − n·24h → T₀ − (n−1)·24h)
  const endMs = t0 - (targetDayIndex - 1) * DAY_MS;
  const startMs = endMs - DAY_MS;

  const fromUtc = new Date(startMs).toISOString();
  const toUtc = new Date(endMs).toISOString();

  console.log(TAG, 'Sim window', {
    dayIndex: targetDayIndex,
    fromUtc,
    toUtc,
    t0ISO: new Date(t0).toISOString(),
  });

  return { fromUtc, toUtc, dayIndex: targetDayIndex };
}

/** Generate all missing windows up to now (for catch-up), excluding Day-0. */
export function planCatchUpWindows(
  ctx: PlannerContext,
  lastSentDayIndex: number,
  nowUtcISO: string,
): Window[] {
  // Catch-up is meaningful in NORMAL mode only.
  if (ctx.mode === 'SIM') {
    console.log(TAG, 'Passive in SIM (catch-up)');
    return [];
  }

  const out: Window[] = [];
  const now = new Date(nowUtcISO).getTime();
  const anchor = new Date(ctx.cycleAnchorUtc).getTime();

  // Only include windows whose end+grace is in the past.
  const lastTickIdxPastGrace = Math.max(
    0,
    Math.floor((now - anchor - GRACE_WAIT_MS) / DAY_MS),
  );

  for (
    let dayIdx = Math.max(1, lastSentDayIndex + 1);
    dayIdx <= Math.min(lastTickIdxPastGrace, ctx.segmentsExpected);
    dayIdx++
  ) {
    const { fromUtc, toUtc } = computeWindowForDayIndex(ctx.cycleAnchorUtc, dayIdx);
    out.push({ dayIndex: dayIdx, fromUtc, toUtc });
  }
  if (out.length) console.log(TAG, 'Catch-up windows', out.map((w) => w.dayIndex));
  else console.log(TAG, 'Catch-up windows: none');
  return out;
}
