// src/services/sharing/types.ts

export type ApplicationStatus = 'APPLIED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface ShareChannel {
  id: string;
  label: string;
  scope: 'READ' | 'WRITE';
}

export interface ActiveShare {
  id: string;
  studyId: string;
  studyTitle: string;
  channels: ShareChannel[];
  sinceISO: string;
}

export interface Application {
  id: string;
  studyId: string;
  studyTitle: string;
  appliedAtISO: string;
  status: ApplicationStatus;
  note?: string;
}

export interface Badge {
  id: string;
  name: string;
  icon?: string;       // keep for future; not rendered if absent
  earnedAtISO: string;
  valueUSD?: number;   // optional; not shown in UI
}

export interface EarningsSummary {
  badgesCount: number;
  activeSharesCount: number;
  apps: { applied: number; pending: number; accepted: number; rejected: number; };
}

export interface ShareState {
  applications: Application[];
  activeShares: ActiveShare[];
  badges: Badge[];
  earnings: EarningsSummary;
}

// ====================
// New sharing/session types
// ====================

/**
 * Overall session lifecycle for a single study’s multi-day upload.
 * - ACTIVE: can summarize/upload
 * - PAUSED: planner runs for logs but no uploads
 * - CANCELLED: terminal (e.g., 3 no-data retries exhausted)
 * - COMPLETE: terminal (final day uploaded)
 */
export type ShareStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETE';

/** Engine run-mode (dev simulation vs normal autonomous). */
export type ShareEngineMode = 'NORMAL' | 'SIM';

/** Used only if you later add separate policies for different retry causes. */
export type RetryKind = 'NO_DATA'; // can extend with 'UPLOAD_FAIL' later

/** Planner output for the next due window (pure math). */
export interface PlannedWindow {
  dayIdx: number;
  startUtc: number; // inclusive (ms)
  endUtc: number;   // exclusive (ms)
  due: boolean;
}

/** Minimal shape for real-data summaries from Health Connect. */
export interface SummaryResult {
  hasData: boolean;
  sampleCount?: number;                 // total samples counted inside [start,end)
  metrics?: Record<string, unknown>;    // e.g., { HR: {...}, KCAL: {...} }
}

/** Upload API result envelope (keep it tiny). */
export interface UploadResult {
  ok: boolean;
  status?: 'ACTIVE' | 'COMPLETE';       // server-reported segment status
  error?: string;                       // error message on failure
}

/**
 * Per-study session state that powers planner/producer.
 * This is the state your store will keep and mutate on each tick().
 * NOTE: We include mode/locks here so tick() can gate behavior deterministically.
 */
export interface ShareSessionState {
  /** Session status gate for producer behavior. */
  status: ShareStatus;

  /** Engine mode: NORMAL (autonomous) vs SIM (dev-stepped). */
  mode: ShareEngineMode;

  /** While true: simulation step in progress; tick/planner must be passive. */
  simulationLock: boolean;

  /** UTC ms when Day 1 starts (anchor for day windows). */
  cycleAnchorUtc: number;

  /** Original (real) anchor to restore when exiting SIM. */
  restoreAnchorAtExit?: number;

  /** Human/UI context (not required by producer, but useful to log/preview). */
  joinTimeLocalISO?: string;
  joinTimezone?: string; // e.g., 'America/New_York'

  /** Expected total segments (from posting). */
  segmentsExpected: number;

  /** Last successfully sent day index (hasData=true upload). */
  lastSentDayIndex: number | null;

  /** Count of successful uploads (hasData=true). */
  segmentsSent: number;

  // ----- Retry & grace bookkeeping -----

  /** The day currently being worked on (when due). */
  currentDueDayIndex: number | null;

  /** Number of no-data retries attempted for the current due day. */
  noDataRetryCount: number;

  /**
   * Next absolute UTC time when producer may try again.
   * If now < nextRetryAtUtc, producer must skip work.
   */
  nextRetryAtUtc: number | null;

  /**
   * One-time grace per new due day to absorb Health Connect write latency.
   * When equal to dayIdx, grace has already been applied for that day.
   */
  graceAppliedForDay: number | null;

  /** Identifiers for logs/diagnostics (optional but helpful). */
  postingId?: number;
  sessionId?: number;
  userId?: number;
}

/**
 * Optional: a tiny runtime config snapshot for logging/diagnostics.
 * (Populated by constants/config module; not required by the producer.)
 */
export interface ShareRuntimeConfig {
  DAY_LENGTH_MS: number;
  RETRY_INTERVAL_MS: number;
  MAX_RETRIES: number;          // fixed at 3 for your plan
  GRACE_WAIT_MS: number;        // DEV-only grace to absorb provider latency
  TEST_MODE?: boolean;          // expose for logs/UI
  DAY_LENGTH_SOURCE?: 'fixed_24h' | 'sim_env';
  __DEV__: boolean;
  EXPO_PUBLIC_SIM_DAY_MS?: string;
  EXPO_PUBLIC_RETRY_INTERVAL_MS?: string;
  EXPO_PUBLIC_GRACE_WAIT_MS?: string;
}

/**
 * The minimal payload the producer sends to the upload API.
 * We keep it compact; the server can reshape/validate as needed.
 */
export interface UploadSegmentInput {
  dayIndex: number;
  startUtc: number; // ms since epoch (UTC)
  endUtc: number;   // ms since epoch (UTC)
  metrics: Record<string, unknown>;
}

/**
 * Alias the upload API response used by the producer.
 * Matches what producer.ts expects to import.
 */
export type UploadSegmentResult = UploadResult;

/**
 * Snapshot shape for logging in tick/planner/dev panel.
 * This mirrors what you were already printing in logs, but typed.
 */
export interface ShareEngineSnapshot {
  mode: ShareEngineMode;
  status: ShareStatus;

  /** True only during a running simulation step. */
  simulationLock: boolean;

  /** Human-friendly ISO for debugging/DevPanel. */
  cycleAnchorUtcISO: string;

  /** Progress counters. */
  lastSentDayIndex: number | null;
  segmentsSent: number;
  segmentsExpected: number;

  /** Planner and retry fields exposed as readable strings. */
  currentDueDayIndex: number | null;
  graceAppliedForDay: number | null;
  nextRetryAtISO: string | null;

  /** Optional ids for context. */
  postingId?: number;
  sessionId?: number;
  userId?: number;
}
