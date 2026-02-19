// src/store/useShareStore.ts
// Orchestrates Apply → session → planner+producer engine (real HC, mock HTTP uploader)
// with persisted state (AsyncStorage via zustand/middleware)

import {
  sendSegmentSuccess,
  sendSessionCancelled,
  sendSessionCompleted,
  sendSessionStarted,
} from "@/src/services/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, AppState, Platform, ToastAndroid } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  cancelShareSession,
  createSession,
  getActiveShareSessions,
  getRewardsSummary,
  getSessionByPosting,
  getSessionSnapshot,
  getSharingDashboard,
} from "@/src/services/sharing/api";

import {
  planSimulatedWindow,
  type PlannerContext,
} from "@/src/services/sharing/planner";

import { processDueWindow } from "@/src/services/sharing/producer";
import type { MetricCode } from "@/src/services/sharing/summarizer";

import {
  ensureInitialized,
  getLocalTimezoneInfo,
  listGrantedMetricKeys as hcListGrantedMetricKeys,
  requestAllReadPermissions,
} from "@/src/services/tracking/healthconnect";

import { testFlags } from "@/src/config/featureFlags";
import type { UserLoginShareHydrationResponse } from "@/src/services/auth/api";
import { getShareRuntimeConfig } from "@/src/services/sharing/constants";
import type { TRewardsSummaryRes } from "@/src/services/sharing/schema";
import type {
  ActiveShareSessionDto,
  ShareSessionState,
  ShareStatus,
} from "@/src/services/sharing/types";
import { useTrackingStore } from "@/src/store/useTrackingStore";

const TAG = "[SHARE][Store]";

// Debug gating (silent by default)
const SHARE_DEBUG = __DEV__ && process.env.EXPO_PUBLIC_SHARE_DEBUG === "1";

// Global readiness switch (set true post-login, set false on sign-out)
// const isShareReady = () => (globalThis as any).__SHARE_READY__ === true;

type WindowRef = { dayIndex: number; fromUtc: string; toUtc: string };

type PostingContext = {
  sessionId?: number;
  postingId: number;
  userId?: number;
  segmentsExpected?: number;
  status: ShareStatus;

  cycleAnchorUtc?: string;
  originalCycleAnchorUtc?: string;
  joinTimezone?: string;
  joinTimeLocalISO?: string;

  engine: ShareSessionState;

  // Per-posting metric map (prevents cross-posting contamination)
  metricMap?: Partial<Record<MetricCode, number>>;

  pendingWindow?: WindowRef;

  snapshot?: StoreState["snapshot"] | null;

  catchUpStatus?: {
    missedCount: number;
    nextWindow: WindowRef | null;
    nextLabel: string | null;
  };

  lastWindowDiag?: {
    dayIndex: number;
    unavailable: MetricCode[];
    zeroData: MetricCode[];
    hadAnyData: boolean;
  };
};

type StoreState = {
  contexts: Record<number, PostingContext>;
  activePostingId?: number;

  // cancel action (resolver-backed)
  cancelCurrentSession: () => Promise<void>;

  // timing/meta used by planner
  // cycleAnchorUtc?: string; // UTC ISO string for planner
  // originalCycleAnchorUtc?: string; // UTC ISO string at session start (for Test Mode)
  // joinTimezone?: string; // 'America/New_York'
  // joinTimeLocalISO?: string; // local ISO with offset at join

  // engine state (persisted) — mirrors ShareSessionState
  // engine: ShareSessionState;

  // ephemeral (not persisted)
  // pendingWindow?: WindowRef;

  // metric map (MetricCode -> MetricId)
  metricMap: Partial<Record<MetricCode, number>>;

  dashboard?: {
    userId: number;
    userDisplayName: string | null;
    sharedPostingsCount: number;
    activeCount: number;
    completedCount: number;
    cancelledCount: number;
  };
  fetchDashboard: (userId: number) => Promise<void>;

  // snapshot from backend (not persisted)
  snapshot?: {
    sessionId: number;
    postingId: number;
    userId: number;
    statusCode: string | null;
    statusName: string | null;
    segmentsExpected: number;
    segmentsSent: number;
    lastSentDayIndex: number | null;
    cycleAnchorUtc: string;
    joinTimeLocalISO: string;
    joinTimezone: string;

    // NEW (calendar day model)
    joinLocalDate: string | null;
    graceMinutes?: number;
    // nextDue?: {
    //   dayIndex: number;
    //   fromUtc: string;
    //   toUtc: string;
    //   eligibleAtUtc: string;
    //   isEligible: boolean;
    // } | null;

    // lastUploadedAt: string | null;
    nextDue?: {
      dayIndex: number;
      fromUtc: string;
      toUtc: string;
      eligibleAtUtc: string;
      isEligible: boolean;
    } | null;

    catchUp?: {
      countEligibleNow: number;
      next: {
        dayIndex: number;
        fromUtc: string;
        toUtc: string;
        eligibleAtUtc: string;
        isEligible: boolean;
      } | null;
    } | null;

    wakeAtUtc?: string | null;

    lastUploadedAt: string | null;

    lastWindowFromUtc: string | null;
    lastWindowToUtc: string | null;
  } | null;

  // === [STORE_REWARDS_SHAPE] rewards summary
  rewards?: TRewardsSummaryRes | null;
  fetchRewards: (userId: number) => Promise<void>;

  // Active sharing sessions from Edge Function
  activeSessions?: ActiveShareSessionDto[] | null;
  fetchActiveSessions: (userId: number) => Promise<void>;

  // // actions
  // fetchSessionSnapshot: (userId: number, postingId: number) => Promise<void>;
  // restoreAnchorAtExit?: number;

  // actions
  fetchSessionSnapshot: (userId: number, postingId: number) => Promise<void>;
  getContext: (postingId: number) => PostingContext | undefined;
  setContext: (postingId: number, patch: Partial<PostingContext>) => void;
  setActivePosting: (postingId: number) => void;

  // NEW: hydrate live timeline + engine from backend snapshot
  hydrateFromSessionSnapshot: (
    snap: NonNullable<StoreState["snapshot"]>,
  ) => void;

  restoreAnchorAtExit?: number;

  // actions
  startSession: (
    postingId: number,
    userId: number,
    metricMap: Partial<Record<MetricCode, number>>,
    segmentsExpected?: number,
  ) => Promise<void>;

  shareEnabled: boolean; // <— PERSISTED readiness gate
  setShareEnabled: (v: boolean) => void; // <— optional setter

  // optional helpers
  sendFirstSegment: () => Promise<void>;
  sendNextIfDue: () => Promise<void>;
  catchUpIfNeeded: () => Promise<void>;
  sendNextIfDueForPosting: (postingId: number) => Promise<void>;
  // Catch-up UI support (derived from planner + engine snapshot)
  catchUpStatus?: {
    missedCount: number;
    nextWindow: WindowRef | null;
    nextLabel: string | null; // e.g., "Jan 26"
  };
  refreshCatchUpStatus: () => void;

  // Single-step catch-up (processes exactly ONE missed day per call)
  catchUpNextOne: () => Promise<void>;

  // NEW: manual "Sync now" (nextDue-only; must stay hidden/blocked when backlog exists)
  syncNow: () => Promise<void>;

  // cadence brain (call on focus/interval or background fetch)
  tick: () => Promise<void>;

  // NEW: background-safe loop over all posting contexts
  tickAll: () => Promise<void>;
  // Test Mode helpers
  setBackdatedAnchorTestOnly: (anchorIsoUtc: string) => void;

  // NEW — Simulation control (invoked from app/opportunities/[id].tsx)
  enterSimulation: () => void;
  simulateNextDay: () => Promise<void>;
  exitSimulation: () => void;

  // last diagnostics from producer for the most recent window (not persisted)
  lastWindowDiag?: {
    dayIndex: number;
    unavailable: MetricCode[];
    zeroData: MetricCode[];
    hadAnyData: boolean;
  };

  //ios healthkit permission request

  // platform health capability (ephemeral; not persisted)
  healthPlatform?: "android" | "ios";
  healthAvailable?: boolean; // HealthConnect / HealthKit available on device
  healthGranted?: boolean; // user granted at least one read permission
  healthAskedBefore?: boolean; // whether user has been prompted before (iOS)

  // optional one-shot probe
  probeHealthPlatform: () => Promise<void>;
  requestHealthPermissions?: () => Promise<void>;
  // logout + login hydration helpers
  resetForLogout: () => void;
  hydrateFromServer: (payload: UserLoginShareHydrationResponse) => void;
};

const nowISO = () => new Date().toISOString();
const nowMs = () => Date.now();

/** Compute next window from anchor + nextIdx (24h rules). */
export function computeNextWindowFromSnapshot(
  cycleAnchorUtc: string,
  lastSentDayIndex: number | null,
  segmentsExpected: number,
): { nextIdx: number; fromUtc: string; toUtc: string } | null {
  if (!segmentsExpected) return null;
  const prevIdx = lastSentDayIndex ?? 0; // Day-0 is index 0
  const nextIdx = Math.min(prevIdx + 1, segmentsExpected);
  if (nextIdx <= 0) return null;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const t0 = Date.parse(cycleAnchorUtc);
  const toMs = t0 + nextIdx * ONE_DAY_MS; // [ (idx-1)*24h → idx*24h ]
  const fromMs = toMs - ONE_DAY_MS;
  return {
    nextIdx,
    fromUtc: new Date(fromMs).toISOString(),
    toUtc: new Date(toMs).toISOString(),
  };
}

/** Human label for time left until `toUtc`. */
export function formatTimeLeftLabel(
  toUtcISO: string,
  now = Date.now(),
): string {
  const delta = Date.parse(toUtcISO) - now;
  const abs = Math.abs(delta);
  const mm = Math.floor(abs / 60000) % 60;
  const hh = Math.floor(abs / 3600000);
  const part = `${hh > 0 ? `${hh}h ` : ""}${mm}m`;
  if (delta > 60 * 1000) return `in ${part}`; // > 1 min
  if (delta >= -60 * 1000 && delta <= 60 * 1000) return "due now";
  return `${part} overdue`;
}

/** Build UTC ISO for local midnight using the offset embedded in joinLocalISO. */
// function localMidnightUTCFromJoinLocalISO(joinLocalISO: string): string {
//   const datePart = joinLocalISO.slice(0, 10); // 'YYYY-MM-DD'
//   const plus = joinLocalISO.lastIndexOf("+");
//   const minus = joinLocalISO.lastIndexOf("-", 19);
//   const offIdx = Math.max(plus, minus);

//   const offset = joinLocalISO.endsWith("Z")
//     ? "Z"
//     : offIdx >= 19
//       ? joinLocalISO.slice(offIdx)
//       : "Z";

//   return new Date(`${datePart}T00:00:00${offset}`).toISOString();
// }

function localMidnightUTCFromJoinLocalISO(joinLocalISO: string): string {
  const datePart = joinLocalISO.slice(0, 10); // 'YYYY-MM-DD'
  if (!/[+-]\d{2}:\d{2}$/.test(joinLocalISO)) {
    throw new Error(
      `${TAG} localMidnightUTCFromJoinLocalISO: joinLocalISO must include offset (±HH:MM). Got: ${joinLocalISO}`,
    );
  }
  const offset = joinLocalISO.slice(-6);
  return new Date(`${datePart}T00:00:00${offset}`).toISOString();
}

// === [ANCHOR: DAY0-FALLBACK-HELPER]
function buildDay0Window(joinLocalISO: string, anchorIsoUtc: string) {
  const midnightLocalUtcISO = localMidnightUTCFromJoinLocalISO(joinLocalISO);
  return {
    dayIndex: 0,
    fromUtc: midnightLocalUtcISO,
    toUtc: anchorIsoUtc,
  };
}

function notifyInfo(message: string) {
  const isActive = AppState.currentState === "active";
  if (!isActive) return;

  if (Platform.OS === "android") {
    try {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } catch {
      try {
        Alert.alert("", message);
      } catch {}
    }
  } else {
    try {
      Alert.alert("", message);
    } catch {}
  }
}

function formatCatchUpLabel(fromUtcISO: string): string {
  // Uses device locale + timezone (simple + consistent for UI)
  // If you later want "joinTimezone" specifically, we can add Intl.DateTimeFormat with timeZone.
  const d = new Date(fromUtcISO);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// function computeCatchUpStatusFromState(st: {
//   status: ShareStatus;
//   engine: ShareSessionState;
//   cycleAnchorUtc?: string;
//   joinTimeLocalISO?: string;
//   joinTimezone?: string;
//   segmentsExpected?: number;
// }): {
//   missedCount: number;
//   nextWindow: WindowRef | null;
//   nextLabel: string | null;
// } {
//   // Only meaningful while ACTIVE and not SIM
//   if (st.status !== "ACTIVE") {
//     return { missedCount: 0, nextWindow: null, nextLabel: null };
//   }
//   if (st.engine?.mode === "SIM") {
//     return { missedCount: 0, nextWindow: null, nextLabel: null };
//   }
//   if (!st.cycleAnchorUtc || !st.joinTimeLocalISO) {
//     return { missedCount: 0, nextWindow: null, nextLabel: null };
//   }

//   const last = st.engine.lastSentDayIndex ?? 0;

//   const ctx: PlannerContext = {
//     joinTimeLocalISO: st.joinTimeLocalISO,
//     joinTimezone: st.joinTimezone || "Local",
//     cycleAnchorUtc: st.cycleAnchorUtc,
//     segmentsExpected: st.segmentsExpected ?? 0,
//     alreadySentDayIndices: [last],
//     lastSentDayIndex: last,
//     mode: "NORMAL",
//   };

//   const windows = planCatchUpWindows(ctx, last, nowISO());
//   const next = windows.length ? windows[0] : null;

//   return {
//     missedCount: windows.length,
//     nextWindow: next
//       ? { dayIndex: next.dayIndex, fromUtc: next.fromUtc, toUtc: next.toUtc }
//       : null,
//     nextLabel: next ? formatCatchUpLabel(next.fromUtc) : null,
//   };
// }

function computeCatchUpStatusFromState(st: {
  status: ShareStatus;
  engine: ShareSessionState;
  snapshot?: StoreState["snapshot"] | null;
}): {
  missedCount: number;
  nextWindow: WindowRef | null;
  nextLabel: string | null;
} {
  // Only meaningful while ACTIVE and not SIM
  if (st.status !== "ACTIVE") {
    return { missedCount: 0, nextWindow: null, nextLabel: null };
  }
  if (st.engine?.mode === "SIM") {
    return { missedCount: 0, nextWindow: null, nextLabel: null };
  }

  const cu = st.snapshot?.catchUp ?? null;
  const next = cu?.next ?? null;

  return {
    // Per contract: server returns how many are eligible now (not total missing).
    missedCount: cu?.countEligibleNow ?? 0,
    nextWindow: next
      ? { dayIndex: next.dayIndex, fromUtc: next.fromUtc, toUtc: next.toUtc }
      : null,
    nextLabel: next ? formatCatchUpLabel(next.fromUtc) : null,
  };
}

const labelOfMetric = (m: MetricCode) => {
  switch (m) {
    case "STEPS":
      return "Steps";
    case "FLOORS":
      return "Floors";
    case "DISTANCE":
      return "Distance";
    case "KCAL":
      return "Active Calories";
    case "HR":
      return "Heart Rate";
    case "SLEEP":
      return "Sleep";
    default:
      return String(m);
  }
};

// NOTE: ShareSessionState.cycleAnchorUtc is a NUMBER (ms) by design.
// We keep planner-facing cycleAnchorUtc (string ISO) separately.
const initialEngine: ShareSessionState = {
  status: "PAUSED",
  mode: "NORMAL",
  simulationLock: false,
  cycleAnchorUtc: Date.now(),
  segmentsExpected: 0,
  lastSentDayIndex: null,
  segmentsSent: 0,
  currentDueDayIndex: null,
  noDataRetryCount: 0,
  nextRetryAtUtc: null,
  graceAppliedForDay: null,
};

// ---- Persistence glue -------------------------------------------------------

const STORE_NAME = "share-store-v2";

const basePartialize = (s: StoreState): Partial<StoreState> => {
  const cleaned: Record<number, PostingContext> = {};

  for (const [k, c] of Object.entries(s.contexts ?? {})) {
    const postingId = Number(k);
    if (!Number.isFinite(postingId) || !c) continue;

    // Persist only stable per-posting state.
    // Do NOT persist server snapshots or transient “in-flight” windows.
    cleaned[postingId] = {
      sessionId: c.sessionId,
      postingId: c.postingId,
      userId: c.userId,
      segmentsExpected: c.segmentsExpected,
      status: c.status,

      cycleAnchorUtc: c.cycleAnchorUtc,
      originalCycleAnchorUtc: c.originalCycleAnchorUtc,
      joinTimezone: c.joinTimezone,
      joinTimeLocalISO: c.joinTimeLocalISO,

      engine: c.engine,
      metricMap: c.metricMap ?? {},

      // explicitly drop ephemeral fields:
      pendingWindow: undefined,
      snapshot: null,
      catchUpStatus: undefined,
      lastWindowDiag: undefined,
    };
  }

  return {
    contexts: cleaned,
    activePostingId: s.activePostingId,
    metricMap: s.metricMap,
    shareEnabled: s.shareEnabled,
  };
};

const version = 2;

const migrate = (persisted: any, _from: number): any => {
  const out = persisted ?? {};
  const ctxs = out?.contexts;

  if (ctxs && typeof ctxs === "object") {
    for (const k of Object.keys(ctxs)) {
      const c = ctxs[k];
      if (!c) continue;

      // Ensure engine exists + has required fields
      if (!c.engine) c.engine = { ...initialEngine };

      // cycleAnchorUtc must be number in engine
      if (typeof c.engine.cycleAnchorUtc !== "number") {
        const parsed = Number(c.engine.cycleAnchorUtc);
        c.engine.cycleAnchorUtc = isNaN(parsed) ? Date.now() : parsed;
      }

      if (
        c.engine.nextRetryAtUtc != null &&
        typeof c.engine.nextRetryAtUtc !== "number"
      ) {
        const parsed = Number(c.engine.nextRetryAtUtc);
        c.engine.nextRetryAtUtc = isNaN(parsed) ? null : parsed;
      }

      if (!c.engine.mode) c.engine.mode = "NORMAL";
      if (typeof c.engine.simulationLock !== "boolean")
        c.engine.simulationLock = false;

      if (typeof c.engine.segmentsExpected !== "number") {
        c.engine.segmentsExpected =
          typeof c.segmentsExpected === "number" ? c.segmentsExpected : 0;
      }

      // Context defaults
      if (!c.status) c.status = "PAUSED";
      if (typeof c.postingId !== "number") c.postingId = Number(k);

      // Backfill per-posting metricMap (older versions stored it at root)
      if (!c.metricMap || typeof c.metricMap !== "object") {
        c.metricMap =
          out?.metricMap && typeof out.metricMap === "object"
            ? out.metricMap
            : {};
      }

      // Drop ephemeral fields if an older persisted store accidentally kept them.
      if ("snapshot" in c) c.snapshot = null;
      if ("pendingWindow" in c) c.pendingWindow = undefined;
      if ("catchUpStatus" in c) c.catchUpStatus = undefined;
      if ("lastWindowDiag" in c) c.lastWindowDiag = undefined;
    }
  }

  return out;
};

// ---- Store ------------------------------------------------------------------

export const useShareStore = create<StoreState>()(
  persist(
    (set, get) => ({
      contexts: {},
      activePostingId: undefined,

      metricMap: {},
      dashboard: undefined,

      shareEnabled: false,
      setShareEnabled: (v) => set({ shareEnabled: !!v }),

      healthPlatform: Platform.OS === "ios" ? "ios" : "android",
      healthAvailable: undefined,
      healthGranted: undefined,

      getContext(postingId: number) {
        return get().contexts[postingId];
      },

      setContext(postingId: number, patch: Partial<PostingContext>) {
        set((state) => ({
          contexts: {
            ...state.contexts,
            [postingId]: {
              ...(state.contexts[postingId] ?? {
                postingId,
                status: "PAUSED",
                engine: { ...initialEngine },
                metricMap: {},
              }),
              ...patch,
            },
          },
        }));
      },

      setActivePosting(postingId: number) {
        set({ activePostingId: postingId });
      },

      async startSession(postingId, userId, metricMap, segmentsExpected) {
        try {
          console.log(TAG, "startSession → begin", {
            postingId,
            userId,
            segmentsExpected,
            metricMap,
          });

          // One-time config banner (shows Test Mode & timings)
          if (!(global as any).__SHARE_CONFIG_LOGGED__) {
            (global as any).__SHARE_CONFIG_LOGGED__ = true;
            console.log("[SHARE][Config]", getShareRuntimeConfig());
            if (testFlags.TEST_MODE) {
              console.warn(
                "[SHARE][TestMode] ENABLED — backdated anchor simulations allowed.",
              );
            }
          }

          // Init HC + permissions
          if (Platform.OS === "android") {
            await ensureInitialized();
            await requestAllReadPermissions();
            const hcKeys = (await hcListGrantedMetricKeys()) ?? [];
            set({
              healthPlatform: "android",
              healthAvailable: true,
              healthGranted: hcKeys.length > 0,
            });
          } else if (Platform.OS === "ios") {
            // Mirror current HealthKit snapshot from tracking store.
            // We do NOT talk to HealthKit directly here anymore.
            const ts = useTrackingStore.getState();

            const hkAvailable = (ts as any).hkAvailable ?? false;
            const hkStatus = (ts as any).hkStatus ?? "unknown";
            const hkHasAnyData = (ts as any).hkHasAnyData ?? false;
            const hkActiveMetrics = Array.isArray((ts as any).hkActiveMetrics)
              ? (ts as any).hkActiveMetrics
              : [];

            const inferredGranted =
              hkHasAnyData || (hkActiveMetrics?.length ?? 0) > 0;

            set({
              healthPlatform: "ios",
              healthAvailable: hkAvailable,
              healthGranted: inferredGranted,
              healthAskedBefore: hkStatus !== "unknown",
            });

            if (!hkAvailable) {
              notifyInfo("HealthKit is not available on this device.");
              // Do not start sharing if HK is not supported.
              return;
            }

            // If system says we should request, and we see no usable data yet,
            // ask the user to fix permissions via the main permissions UI
            // (Header / Tracking tab) instead of prompting here.
            if (hkStatus === "shouldRequest" && !hkHasAnyData) {
              notifyInfo(
                "Please enable Health data access from the Health Permissions banner before starting sharing.",
              );
              return;
            }
          }

          // Build joinTimeLocalISO as ISO *with numeric offset* (±HH:MM).
          // IMPORTANT: must not be missing offset, otherwise planner SIM will hard-fail.
          const tz = getLocalTimezoneInfo();
          const now = new Date();

          const pad2 = (n: number) =>
            String(Math.trunc(Math.abs(n))).padStart(2, "0");

          // JS: getTimezoneOffset() is minutes *behind* UTC (NY winter: 300). We want "-05:00".
          const offsetMinutes = -now.getTimezoneOffset();
          const sign = offsetMinutes >= 0 ? "+" : "-";
          const hh = pad2(Math.floor(Math.abs(offsetMinutes) / 60));
          const mm = pad2(Math.abs(offsetMinutes) % 60);
          const offset = `${sign}${hh}:${mm}`;

          // Local wall-clock components (no UTC conversion)
          const y = now.getFullYear();
          const mo = pad2(now.getMonth() + 1);
          const d = pad2(now.getDate());
          const h = pad2(now.getHours());
          const mi = pad2(now.getMinutes());
          const s = pad2(now.getSeconds());
          const ms = String(now.getMilliseconds()).padStart(3, "0");

          const localIso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${offset}`;

          // Guard: must end in ±HH:MM
          if (!/[+-]\d{2}:\d{2}$/.test(localIso)) {
            throw new Error(
              `${TAG} startSession: joinTimeLocalISO missing numeric offset: ${localIso}`,
            );
          }

          // // Try to reuse an existing ACTIVE session for (postingId, userId) before creating a new one
          // try {
          //   const resolved = await getSessionByPosting(postingId, userId);
          //   if (resolved && resolved.source === "ACTIVE") {
          //     const eng: ShareSessionState = {
          //       ...initialEngine,
          //       status: "ACTIVE",
          //       // Use "now" as the engine's numeric anchor; planner ISO is set below.
          //       cycleAnchorUtc: Date.now(),
          //       segmentsExpected: Number(resolved.segmentsExpected ?? 0),
          //       segmentsSent: Number(resolved.segmentsSent ?? 0),
          //     };

          //     set({
          //       sessionId: resolved.sessionId,
          //       postingId,
          //       userId,
          //       metricMap,
          //       segmentsExpected: eng.segmentsExpected,
          //       status: "ACTIVE",

          //       // Planner-facing ISO anchor (we don't get anchor from resolver; use now for UI/planner)
          //       cycleAnchorUtc: new Date().toISOString(),
          //       originalCycleAnchorUtc: new Date().toISOString(),
          //       joinTimezone: tz.iana || "Local",
          //       joinTimeLocalISO: localIso,

          //       engine: eng,

          //       shareEnabled: true,
          //     });

          //     if (__DEV__) {
          //       console.log(TAG, "startSession → reused ACTIVE session", {
          //         sessionId: resolved.sessionId,
          //         segmentsExpected: eng.segmentsExpected,
          //         segmentsSent: eng.segmentsSent,
          //       });
          //     }

          //     // Continue with normal Day-0 behavior (no grace)
          //     try {
          //       await sendSessionStarted(postingId);
          //     } catch {}
          //     await get().sendFirstSegment();
          //     return;
          //   }
          // } catch (e) {
          //   if (__DEV__)
          //     console.warn(
          //       `${TAG} resolver lookup failed — proceeding to create`,
          //       e,
          //     );
          // }
          // Try to reuse an existing ACTIVE session for (postingId, userId) before creating a new one
          try {
            const resolved = await getSessionByPosting(postingId, userId);

            if (resolved && resolved.source === "ACTIVE") {
              // Pull the authoritative session snapshot (anchor, join times, lastSent, etc.)
              const snap = await getSessionSnapshot(userId, postingId);
              const r = snap?.session;

              if (!r) {
                // If snapshot is unavailable, fall back to creating a new session
                // (better than re-anchoring from device time).
                throw new Error(
                  "ACTIVE resolver returned, but snapshot.session was null",
                );
              }

              // Build engine directly from server snapshot
              const eng: ShareSessionState = {
                ...initialEngine,
                status: "ACTIVE",
                mode: "NORMAL",
                simulationLock: false,

                // IMPORTANT: anchor comes from server (stable across restarts)
                cycleAnchorUtc: new Date(r.cycle_anchor_utc).getTime(),

                segmentsExpected: Number(r.segments_expected ?? 0),
                segmentsSent: Number(r.segments_sent ?? 0),
                lastSentDayIndex:
                  r.last_sent_day_index == null
                    ? null
                    : Number(r.last_sent_day_index),

                // Clear per-day transient state on reuse
                currentDueDayIndex: null,
                noDataRetryCount: 0,
                nextRetryAtUtc: null,
                graceAppliedForDay: null,
              };

              const computedSnapshot = {
                sessionId: r.session_id,
                postingId: r.posting_id,
                userId: r.user_id,
                statusCode: r.status_code,
                statusName: r.status_name,
                segmentsExpected: r.segments_expected,
                segmentsSent: r.segments_sent,
                lastSentDayIndex: r.last_sent_day_index,
                cycleAnchorUtc: r.cycle_anchor_utc,
                joinTimezone: r.join_timezone,
                joinTimeLocalISO: (() => {
                  const j = r.join_time_local_iso;
                  if (typeof j !== "string" || j.length < 10) {
                    throw new Error(
                      `${TAG} reuse ACTIVE: invalid join_time_local_iso from server`,
                    );
                  }
                  if (!/[+-]\d{2}:\d{2}$/.test(j)) {
                    throw new Error(
                      `${TAG} reuse ACTIVE: join_time_local_iso missing numeric offset (±HH:MM): ${j}`,
                    );
                  }
                  return j;
                })(),

                // NEW (calendar day model)
                joinLocalDate: (r as any).join_local_date ?? null,
                graceMinutes: (r as any).grace_minutes ?? undefined,
                nextDue: (r as any).next_due
                  ? {
                      dayIndex: (r as any).next_due.day_index,
                      fromUtc: (r as any).next_due.from_utc,
                      toUtc: (r as any).next_due.to_utc,
                      eligibleAtUtc: (r as any).next_due.eligible_at_utc,
                      isEligible: (r as any).next_due.is_eligible,
                    }
                  : null,
                catchUp: (r as any).catch_up
                  ? {
                      countEligibleNow: Number(
                        (r as any).catch_up.count_eligible_now ?? 0,
                      ),
                      next: (r as any).catch_up.next
                        ? {
                            dayIndex: (r as any).catch_up.next.day_index,
                            fromUtc: (r as any).catch_up.next.from_utc,
                            toUtc: (r as any).catch_up.next.to_utc,
                            eligibleAtUtc: (r as any).catch_up.next
                              .eligible_at_utc,
                            isEligible: (r as any).catch_up.next.is_eligible,
                          }
                        : null,
                    }
                  : null,

                wakeAtUtc: (r as any).wake_at_utc ?? null,

                lastUploadedAt: r.last_uploaded_at,
                lastWindowFromUtc: r.last_window_from_utc,
                lastWindowToUtc: r.last_window_to_utc,
              } satisfies NonNullable<StoreState["snapshot"]>;

              get().setContext(postingId, {
                sessionId: r.session_id,
                postingId,
                userId,
                segmentsExpected: eng.segmentsExpected,
                status: "ACTIVE",
                cycleAnchorUtc: r.cycle_anchor_utc,
                originalCycleAnchorUtc: r.cycle_anchor_utc,
                joinTimezone: r.join_timezone,
                joinTimeLocalISO: computedSnapshot.joinTimeLocalISO,
                engine: eng,
                snapshot: computedSnapshot,
                metricMap, // <-- store per-posting
                catchUpStatus: computeCatchUpStatusFromState({
                  status: "ACTIVE",
                  engine: eng,
                  snapshot: computedSnapshot,
                }),
              });

              set({
                activePostingId: postingId,
                metricMap, // keep as fallback (optional)
                shareEnabled: true,
              });

              if (__DEV__) {
                console.log(
                  TAG,
                  "startSession → reused ACTIVE session (server snapshot)",
                  {
                    sessionId: r.session_id,
                    segmentsExpected: eng.segmentsExpected,
                    segmentsSent: eng.segmentsSent,
                    lastSentDayIndex: eng.lastSentDayIndex,
                    anchor: r.cycle_anchor_utc,
                  },
                );
              }

              try {
                await sendSessionStarted(postingId);
              } catch {}

              // IMPORTANT: only do Day-0 if nothing has been sent yet.
              if (eng.lastSentDayIndex == null) {
                await get().sendFirstSegment();
              } else {
                await get().sendNextIfDue();
                // (catch-up remains user-driven / separate; we’ll wire that next)
              }

              return;
            }
          } catch (e) {
            if (__DEV__)
              console.warn(
                `${TAG} resolver/snapshot reuse failed — proceeding to create`,
                e,
              );
          }

          // Create server session (stores cycleAnchorUtc + join local ISO)
          const sess = await createSession(postingId, userId, {
            segmentsExpected,
            joinTimeLocalISO: localIso,
            joinTimezone: tz.iana || "Local",
            cycleAnchorUtc: new Date().toISOString(),
          });

          // Seed engine state
          const eng: ShareSessionState = {
            status: "ACTIVE",
            mode: "NORMAL",
            simulationLock: false,
            cycleAnchorUtc: new Date(sess.cycleAnchorUtc).getTime(),
            segmentsExpected: sess.segmentsExpected ?? 0,
            lastSentDayIndex: null,
            segmentsSent: 0,
            currentDueDayIndex: null,
            noDataRetryCount: 0,
            nextRetryAtUtc: null,
            graceAppliedForDay: null,
          };

          get().setContext(postingId, {
            sessionId: sess.sessionId,
            postingId,
            userId,
            segmentsExpected: sess.segmentsExpected,
            status: "ACTIVE",
            cycleAnchorUtc: sess.cycleAnchorUtc,
            originalCycleAnchorUtc: sess.cycleAnchorUtc,
            joinTimezone: sess.joinTimezone,
            joinTimeLocalISO: sess.joinTimeLocalISO,
            engine: eng,
            metricMap, // <-- store per-posting
          });

          set({
            activePostingId: postingId,
            metricMap, // keep as fallback (optional)
            shareEnabled: true,
          });

          console.log(TAG, "startSession →", {
            sessionId: sess.sessionId,
            postingId,
            userId,
            segmentsExpected: sess.segmentsExpected,
            cycleAnchorUtc: sess.cycleAnchorUtc,
            joinTimezone: sess.joinTimezone,
            joinTimeLocalISO: sess.joinTimeLocalISO,
          });

          // Optionally kick Day-0 immediately
          try {
            await sendSessionStarted(postingId);
          } catch {}
          await get().sendFirstSegment();
        } catch (e: any) {
          console.log(TAG, "startSession error", e?.message ?? e, e);
          notifyInfo(String(e?.message ?? e));
        }
      },

      // async sendFirstSegment() {
      //   if (!isShareReady()) {
      //     if (SHARE_DEBUG)
      //       console.log(`${TAG} sendFirstSegment → not ready; skipping`);
      //     return;
      //   }
      //   const st = get();
      //   if (
      //     !st.sessionId ||
      //     !st.postingId ||
      //     !st.userId ||
      //     !st.cycleAnchorUtc ||
      //     !st.joinTimeLocalISO
      //   )
      //     return;

      //   // In SIM mode: Day-0 is driven by simulateNextDay; do nothing here.
      //   if (st.engine.mode === "SIM") {
      //     if (__DEV__)
      //       console.log(`${TAG} sendFirstSegment → passive (SIM mode)`);
      //     return;
      //   }

      //   //  Test Mode Day-0 controls
      //   if (testFlags.TEST_MODE && testFlags.TEST_FORCE_SKIP_DAY0) {
      //     if (__DEV__)
      //       console.log(`${TAG} sendFirstSegment → TEST: skipping Day-0`);
      //     return;
      //   }

      //   const ctx: PlannerContext = {
      //     joinTimeLocalISO: st.joinTimeLocalISO,
      //     joinTimezone: st.joinTimezone || "Local",
      //     cycleAnchorUtc: st.cycleAnchorUtc,
      //     segmentsExpected: st.segmentsExpected ?? 0,
      //     alreadySentDayIndices: [],
      //     mode: "NORMAL",
      //   };

      //   // Day-0 probe using a “fast” metric if available (real data only)
      //   const want = st.metricMap as Partial<Record<MetricCode, number>>;
      //   const probeMetric: MetricCode | undefined = want.STEPS
      //     ? "STEPS"
      //     : want.KCAL
      //       ? "KCAL"
      //       : want.DISTANCE
      //         ? "DISTANCE"
      //         : want.FLOORS
      //           ? "FLOORS"
      //           : want.HR
      //             ? "HR"
      //             : want.SLEEP
      //               ? "SLEEP"
      //               : undefined;

      //   let hasDay0Data = false;
      //   try {
      //     if (probeMetric) {
      //       const midnightLocalUtcISO = localMidnightUTCFromJoinLocalISO(
      //         st.joinTimeLocalISO!,
      //       );
      //       const mod = await import("@/src/services/sharing/summarizer");
      //       const probe = await mod.summarizeWindow(
      //         probeMetric,
      //         midnightLocalUtcISO,
      //         st.cycleAnchorUtc!,
      //         { probeOnly: true },
      //       );

      //       hasDay0Data = !!probe;

      //       if (__DEV__) {
      //         console.log("[SHARE][Store] Day0 probe", {
      //           probeMetric,
      //           midnightLocalUtcISO,
      //           joinUtc: st.cycleAnchorUtc,
      //           hasDay0Data,
      //         });
      //       }
      //     }
      //   } catch (e: any) {
      //     console.warn(
      //       `${TAG} sendFirstSegment → probe error`,
      //       e?.message ?? e,
      //     );
      //   }

      //   // === [ANCHOR: DAY0-ALWAYS-QUEUE]
      //   let day0 = planDay0Window(
      //     ctx,
      //     hasDay0Data || (testFlags.TEST_MODE && testFlags.TEST_FORCE_DAY0),
      //   );

      //   // If planner declines Day-0 (likely no data yet), fall back to an explicit Day-0 window
      //   if (!day0) {
      //     day0 = buildDay0Window(st.joinTimeLocalISO!, st.cycleAnchorUtc!);
      //     if (__DEV__) {
      //       console.log(
      //         "[SHARE][Store] Day0 planner declined; using fallback window",
      //         day0,
      //       );
      //     }
      //   }

      //   // Mark engine so tick()/producer can apply grace/retries for Day-0 if needed
      //   set((s) => ({
      //     pendingWindow: day0!,
      //     engine: {
      //       ...s.engine,
      //       currentDueDayIndex: day0!.dayIndex,
      //       // keep grace bookkeeping aligned with the actual due window
      //       graceAppliedForDay: day0!.dayIndex,
      //     },
      //   }));

      //   await tryProcessWindow(day0!);
      // },
      // new code for the day logic revamp (no special Day-0 handling in planner/producer; just "send if due")
      async sendFirstSegment() {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} sendFirstSegment → not ready; skipping`);
          return;
        }

        const st = get();
        const pid = st.activePostingId;
        if (!pid) return;

        const ctx = st.contexts[pid];
        if (!ctx?.sessionId || !ctx?.userId) return;

        // In SIM mode: Day progression is driven by simulateNextDay(); do nothing here.
        if (ctx.engine.mode === "SIM") {
          if (__DEV__)
            console.log(`${TAG} sendFirstSegment → passive (SIM mode)`);
          return;
        }

        // Test Mode control remains: if you explicitly skip "first send", respect it.
        if (testFlags.TEST_MODE && testFlags.TEST_FORCE_SKIP_DAY0) {
          if (__DEV__)
            console.log(
              `${TAG} sendFirstSegment → TEST: skipping initial send`,
            );
          return;
        }

        // New model: “first segment” is simply “send next if due”.
        await get().sendNextIfDue();
      },

      // async sendNextIfDue() {
      //   if (!isShareReady()) {
      //     if (SHARE_DEBUG)
      //       console.log(`${TAG} sendNextIfDue → not ready; skipping`);
      //     return;
      //   }

      //   const st = get();
      //   if (!st.sessionId || st.status !== "ACTIVE") return;

      //   // In SIM mode we are passive.
      //   if (st.engine.mode === "SIM") {
      //     if (__DEV__) console.log(`${TAG} sendNextIfDue → passive (SIM mode)`);
      //     return;
      //   }

      //   const ctx: PlannerContext = {
      //     joinTimeLocalISO: st.joinTimeLocalISO!,
      //     joinTimezone: st.joinTimezone || "Local",
      //     cycleAnchorUtc: st.cycleAnchorUtc!,
      //     segmentsExpected: st.segmentsExpected ?? 0,
      //     alreadySentDayIndices:
      //       st.engine.lastSentDayIndex != null
      //         ? [st.engine.lastSentDayIndex]
      //         : [],
      //     mode: "NORMAL",
      //   };

      //   const win = planNextDueWindow(ctx, nowISO());
      //   if (!win) return;

      //   // Grace on first see of a new day (only if not already applied)
      //   const alreadyAppliedFor = get().engine.graceAppliedForDay;
      //   const pastGrace = isWindowPastGrace(win.toUtc, nowISO());

      //   if (
      //     !pastGrace &&
      //     GRACE_WAIT_MS > 0 &&
      //     alreadyAppliedFor !== win.dayIndex
      //   ) {
      //     set((s) => ({
      //       pendingWindow: win, // stash exact window
      //       engine: {
      //         ...s.engine,
      //         currentDueDayIndex: win.dayIndex,
      //         nextRetryAtUtc: nowMs() + GRACE_WAIT_MS,
      //         graceAppliedForDay: win.dayIndex,
      //       },
      //     }));
      //     return; // wait for grace before processing
      //   }

      //   // If grace already passed (e.g., after backdating), process immediately.
      //   set((s) => ({
      //     pendingWindow: win,
      //     engine: {
      //       ...s.engine,
      //       currentDueDayIndex: win.dayIndex,
      //     },
      //   }));
      //   await tryProcessWindow(win);
      // },

      // async catchUpIfNeeded() {
      //   if (!isShareReady()) {
      //     if (SHARE_DEBUG)
      //       console.log(`${TAG} catchUpIfNeeded → not ready; skipping`);
      //     return;
      //   }

      //   const st = get();
      //   if (!st.sessionId || st.status !== "ACTIVE") return;

      //   if (st.engine.mode === "SIM") {
      //     if (__DEV__)
      //       console.log(`${TAG} catchUpIfNeeded → passive (SIM mode)`);
      //     return;
      //   }

      //   const last = st.engine.lastSentDayIndex ?? 0;

      //   const ctx: PlannerContext = {
      //     joinTimeLocalISO: st.joinTimeLocalISO!,
      //     joinTimezone: st.joinTimezone || "Local",
      //     cycleAnchorUtc: st.cycleAnchorUtc!,
      //     segmentsExpected: st.segmentsExpected ?? 0,
      //     alreadySentDayIndices: [last],
      //     lastSentDayIndex: last,
      //     mode: "NORMAL",
      //   };

      //   const windows = planCatchUpWindows(ctx, last, nowISO());
      //   for (const win of windows) {
      //     await tryProcessWindow(win);
      //     const cur = get();
      //     if (cur.status !== "ACTIVE") break; // CANCELLED/COMPLETE stops catch-up
      //   }
      // },

      // Per-posting worker (safe for background loops)

      async sendNextIfDueForPosting(postingId: number) {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} sendNextIfDueForPosting → not ready; skipping`);
          return;
        }

        const st = get();
        const ctx = st.contexts[postingId];
        if (!ctx?.sessionId || !ctx?.userId) return;
        if (ctx.status !== "ACTIVE") return;

        // In SIM mode we are passive.
        if (ctx.engine.mode === "SIM") {
          if (__DEV__)
            console.log(`${TAG} sendNextIfDueForPosting → passive (SIM mode)`);
          return;
        }

        // Ensure snapshot exists (server is authoritative for next_due + catch_up + wake_at_utc)
        const snap0 = ctx.snapshot ?? null;
        const missingServerFields =
          !snap0 ||
          snap0.catchUp === undefined ||
          snap0.wakeAtUtc === undefined ||
          snap0.nextDue === undefined;

        if (missingServerFields) {
          await get().fetchSessionSnapshot(ctx.userId!, postingId);
        }

        const snap = get().contexts[postingId]?.snapshot ?? null;
        const nd = snap?.nextDue ?? null;

        // Auto sending must only use nextDue (catch-up remains user-driven).
        if (!nd || nd.isEligible !== true) {
          const wakeIso = snap?.wakeAtUtc ?? null;
          const wakeMs = wakeIso ? Date.parse(wakeIso) : NaN;

          if (Number.isFinite(wakeMs)) {
            set((s) => ({
              contexts: {
                ...s.contexts,
                [postingId]: {
                  ...s.contexts[postingId],
                  engine: {
                    ...s.contexts[postingId].engine,
                    nextRetryAtUtc: wakeMs,
                  },
                },
              },
            }));
          }

          if (__DEV__) {
            console.log(`${TAG} sendNextIfDueForPosting → not eligible`, {
              postingId,
              nextDue: nd
                ? {
                    dayIndex: nd.dayIndex,
                    eligibleAtUtc: nd.eligibleAtUtc,
                    isEligible: nd.isEligible,
                  }
                : null,
              wakeAtUtc: wakeIso,
            });
          }
          return;
        }

        const win: WindowRef = {
          dayIndex: nd.dayIndex,
          fromUtc: nd.fromUtc,
          toUtc: nd.toUtc,
        };

        // Stash exact window and mark engine as working this day.
        set((s) => ({
          contexts: {
            ...s.contexts,
            [postingId]: {
              ...s.contexts[postingId],
              pendingWindow: win,
              engine: {
                ...s.contexts[postingId].engine,
                currentDueDayIndex: win.dayIndex,
                nextRetryAtUtc: null,
                graceAppliedForDay: win.dayIndex,
              },
            },
          },
        }));

        await tryProcessWindow(postingId, win);
      },

      // Active-posting wrapper (UI behavior unchanged)
      async sendNextIfDue() {
        const st = get();
        const pid = st.activePostingId;
        if (!pid) return;
        await get().sendNextIfDueForPosting(pid);
      },

      // async catchUpIfNeeded() {
      //   if (!isShareReady()) {
      //     if (SHARE_DEBUG)
      //       console.log(`${TAG} catchUpIfNeeded → not ready; skipping`);
      //     return;
      //   }

      //   const st = get();
      //   if (!st.sessionId || st.status !== "ACTIVE") return;

      //   if (st.engine.mode === "SIM") {
      //     if (__DEV__)
      //       console.log(`${TAG} catchUpIfNeeded → passive (SIM mode)`);
      //     return;
      //   }

      //   const last = st.engine.lastSentDayIndex ?? 0;

      //   const ctx: PlannerContext = {
      //     joinTimeLocalISO: st.joinTimeLocalISO!,
      //     joinTimezone: st.joinTimezone || "Local",
      //     cycleAnchorUtc: st.cycleAnchorUtc!,
      //     segmentsExpected: st.segmentsExpected ?? 0,
      //     alreadySentDayIndices: [last],
      //     lastSentDayIndex: last,
      //     mode: "NORMAL",
      //   };

      //   const windows = planCatchUpWindows(ctx, last, nowISO());
      //   const win = windows.length ? windows[0] : null;
      //   if (!win) {
      //     get().refreshCatchUpStatus();
      //     return;
      //   }

      //   await tryProcessWindow(win);
      //   get().refreshCatchUpStatus();
      // },

      async catchUpIfNeeded() {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} catchUpIfNeeded → not ready; skipping`);
          return;
        }

        const st = get();
        const pid = st.activePostingId;
        if (!pid) return;

        const ctx = st.contexts[pid];
        if (!ctx?.sessionId || !ctx?.userId) return;
        if (ctx.status !== "ACTIVE") return;

        if (ctx.engine.mode === "SIM") {
          if (__DEV__)
            console.log(`${TAG} catchUpIfNeeded → passive (SIM mode)`);
          return;
        }

        // Server is authoritative for snapshot. Catch-up remains user-driven.
        await get().sendNextIfDue();
        get().refreshCatchUpStatus();
      },

      refreshCatchUpStatus() {
        const st = get();
        // const s = computeCatchUpStatusFromState(st);
        const pid = st.activePostingId;
        if (!pid) return;
        const ctx = st.contexts[pid];
        if (!ctx) return;

        const s = computeCatchUpStatusFromState({
          status: ctx.status,
          engine: ctx.engine,
          snapshot: ctx.snapshot,
        });

        set((state) => ({
          contexts: {
            ...state.contexts,
            [pid]: {
              ...state.contexts[pid],
              catchUpStatus: s,
            },
          },
        }));
      },

      async syncNow() {
        if (!isShareReady()) {
          if (__DEV__) console.log(`${TAG} syncNow → not ready`);
          return;
        }

        const st0 = get();
        const pid = st0.activePostingId;
        if (!pid) {
          if (__DEV__) console.log(`${TAG} syncNow → no activePostingId`);
          return;
        }

        const ctx0 = st0.contexts[pid];
        if (!ctx0) {
          if (__DEV__) console.log(`${TAG} syncNow → missing context`, { pid });
          return;
        }

        if (!ctx0.sessionId || !ctx0.userId) {
          if (__DEV__)
            console.log(`${TAG} syncNow → missing identity fields`, {
              pid,
              ctxSessionId: ctx0.sessionId ?? null,
              ctxUserId: ctx0.userId ?? null,
              snapSessionId: ctx0.snapshot?.sessionId ?? null,
              snapUserId: ctx0.snapshot?.userId ?? null,
            });
          return;
        }

        if (ctx0.status !== "ACTIVE") {
          if (__DEV__)
            console.log(`${TAG} syncNow → not ACTIVE`, {
              pid,
              status: ctx0.status,
            });
          return;
        }

        if (ctx0.engine.mode === "SIM") {
          if (__DEV__)
            console.log(`${TAG} syncNow → blocked (SIM mode)`, { pid });
          return;
        }

        // Manual press must always use a fresh server snapshot (server-authoritative)
        notifyInfo("Refreshing session…");
        await get().fetchSessionSnapshot(ctx0.userId!, pid);

        const snap = get().contexts[pid]?.snapshot ?? null;
        if (!snap) {
          notifyInfo("Couldn’t refresh session state from server.");
          return;
        }

        const cu = snap.catchUp ?? null;

        // Backlog rule: if ANY catch-up backlog exists, manual "Sync now" must do nothing.
        const backlogExists = !!cu?.next || (cu?.countEligibleNow ?? 0) > 0;
        if (backlogExists) {
          if (__DEV__) {
            console.log(`${TAG} syncNow → blocked (backlog exists)`, {
              countEligibleNow: cu?.countEligibleNow ?? 0,
              hasNext: !!cu?.next,
            });
          }
          return;
        }

        const nd = snap?.nextDue ?? null;
        if (!nd) return;

        if (!nd.isEligible) {
          // Not eligible yet: honor server wake hint (store this on the active context engine)
          const wakeIso = snap?.wakeAtUtc ?? null;
          const wakeMs = wakeIso ? Date.parse(wakeIso) : NaN;
          if (Number.isFinite(wakeMs)) {
            set((s) => ({
              contexts: {
                ...s.contexts,
                [pid]: {
                  ...s.contexts[pid],
                  engine: {
                    ...s.contexts[pid].engine,
                    nextRetryAtUtc: wakeMs,
                  },
                },
              },
            }));
          }
          return;
        }

        const win: WindowRef = {
          dayIndex: nd.dayIndex,
          fromUtc: nd.fromUtc,
          toUtc: nd.toUtc,
        };

        // Mark engine as working this day + stash window for retry safety (on the active context)
        set((s) => ({
          contexts: {
            ...s.contexts,
            [pid]: {
              ...s.contexts[pid],
              pendingWindow: win,
              engine: {
                ...s.contexts[pid].engine,
                currentDueDayIndex: win.dayIndex,
                nextRetryAtUtc: null,
                graceAppliedForDay: win.dayIndex,
              },
            },
          },
        }));

        await tryProcessWindow(pid, win);

        // Refresh snapshot + derived status so UI updates immediately
        try {
          const st1 = get();
          const ctx1 = st1.contexts[pid];
          if (ctx1?.userId) {
            await get().fetchSessionSnapshot(ctx1.userId, pid);
          }
        } finally {
          get().refreshCatchUpStatus();
        }
      },

      async catchUpNextOne() {
        if (!isShareReady()) return;

        const st0 = get();
        const pid = st0.activePostingId;
        if (!pid) return;

        const ctx0 = st0.contexts[pid];
        if (!ctx0?.sessionId || !ctx0?.userId) return;
        if (ctx0.status !== "ACTIVE") return;
        if (ctx0.engine.mode === "SIM") return;

        // Manual press must always use a fresh server snapshot (server-authoritative)
        notifyInfo("Refreshing session…");
        await get().fetchSessionSnapshot(ctx0.userId, pid);

        const snap = get().contexts[pid]?.snapshot ?? null;
        if (!snap) {
          notifyInfo("Couldn’t refresh session state from server.");
          return;
        }

        const cuNext = snap.catchUp?.next ?? null;

        // Update derived UI status first (even if not eligible)
        get().refreshCatchUpStatus();

        // Catch-up button must never send nextDue.
        if (!cuNext || cuNext.isEligible !== true) {
          if (__DEV__) {
            console.log(`${TAG} catchUpNextOne → not eligible/no next`, {
              hasNext: !!cuNext,
              isEligible: cuNext?.isEligible ?? null,
              eligibleAtUtc: cuNext?.eligibleAtUtc ?? null,
            });
          }
          return;
        }

        const win: WindowRef = {
          dayIndex: cuNext.dayIndex,
          fromUtc: cuNext.fromUtc,
          toUtc: cuNext.toUtc,
        };

        // Mark engine as working this day + stash window for retry safety (on the active context)
        set((s) => ({
          contexts: {
            ...s.contexts,
            [pid]: {
              ...s.contexts[pid],
              pendingWindow: win,
              engine: {
                ...s.contexts[pid].engine,
                currentDueDayIndex: win.dayIndex,
                nextRetryAtUtc: null,
                graceAppliedForDay: win.dayIndex,
              },
            },
          },
        }));

        await tryProcessWindow(pid, win);

        // Refresh snapshot + derived status so UI advances immediately
        try {
          const st1 = get();
          const ctx1 = st1.contexts[pid];
          if (ctx1?.userId) {
            await get().fetchSessionSnapshot(ctx1.userId, pid);
          }
        } finally {
          get().refreshCatchUpStatus();
        }
      },

      // Call this on focus + short interval (e.g., 5s in DEV, 60s in PROD)
      async tick() {
        if (!isShareReady()) {
          if (SHARE_DEBUG) console.log(`${TAG} tick → not ready; skipping`);
          return;
        }

        const st = get();
        const pid = st.activePostingId;
        if (!pid) return;

        const ctx = st.contexts[pid];
        if (!ctx?.sessionId) return;

        if (__DEV__) {
          console.log(`${TAG} tick → engine gate`, {
            postingId: pid,
            engineStatus: ctx.engine.status,
            ctxStatus: ctx.status,
          });
        }

        // Stop if terminal or not ACTIVE
        if (
          ctx.engine.status === "CANCELLED" ||
          ctx.engine.status === "COMPLETE" ||
          ctx.status !== "ACTIVE"
        ) {
          if (__DEV__) {
            console.log(`${TAG} tick → stopping`, {
              engineStatus: ctx.engine.status,
              ctxStatus: ctx.status,
            });
          }
          return;
        }

        // SIM mode: passive
        if (ctx.engine.mode === "SIM") {
          if (__DEV__) console.log(`${TAG} tick → passive (SIM mode)`);
          return;
        }

        const now = Date.now();
        const eng = ctx.engine;

        // 1) If we’re already working a due day, retry using the stashed pendingWindow ONLY
        if (eng.currentDueDayIndex != null) {
          if (eng.nextRetryAtUtc && now < eng.nextRetryAtUtc) {
            if (__DEV__)
              console.log(`${TAG} tick → waiting`, {
                nextRetryAt: eng.nextRetryAtUtc,
              });
            return;
          }

          const pw = ctx.pendingWindow;
          const dueIdx = eng.currentDueDayIndex;

          if (!pw || pw.dayIndex !== dueIdx) {
            if (__DEV__)
              console.warn(`${TAG} tick → missing stashed pendingWindow`, {
                postingId: pid,
                dueIdx,
                pendingWindowDayIndex: pw?.dayIndex ?? null,
              });

            // Safety reset: clear in-flight state on this context only
            set((s) => ({
              contexts: {
                ...s.contexts,
                [pid]: {
                  ...s.contexts[pid],
                  pendingWindow: undefined,
                  engine: {
                    ...s.contexts[pid].engine,
                    currentDueDayIndex: null,
                    nextRetryAtUtc: null,
                    graceAppliedForDay: null,
                    noDataRetryCount: 0,
                  },
                },
              },
            }));
            return;
          }

          const win: WindowRef = pw;

          // keep pendingWindow + due index consistent
          set((s) => ({
            contexts: {
              ...s.contexts,
              [pid]: {
                ...s.contexts[pid],
                pendingWindow: win,
                engine: {
                  ...s.contexts[pid].engine,
                  currentDueDayIndex: win.dayIndex,
                },
              },
            },
          }));

          await tryProcessWindow(pid, win);
          return;
        }

        if (__DEV__) console.log(`${TAG} tick → checking if new window due`);

        // Honor server wake hint (stored on this context’s engine)
        if (eng.nextRetryAtUtc && now < eng.nextRetryAtUtc) {
          if (__DEV__)
            console.log(`${TAG} tick → sleeping until wake`, {
              wakeAtMs: eng.nextRetryAtUtc,
              msLeft: eng.nextRetryAtUtc - now,
            });
          return;
        }

        // 2) Otherwise, see if a NEW window is due (server snapshot decides)
        await get().sendNextIfDueForPosting(pid);
      },

      // NEW: background-safe loop across all posting contexts
      async tickAll() {
        if (!isShareReady()) return;

        const st = get();
        const now = Date.now();

        const entries = Object.entries(st.contexts ?? {});
        for (const [k, ctx] of entries) {
          const postingId = Number(k);
          if (!Number.isFinite(postingId)) continue;
          if (!ctx?.sessionId) continue;

          // Skip if not ACTIVE
          if (ctx.status !== "ACTIVE") continue;

          // Skip terminal
          if (
            ctx.engine.status === "CANCELLED" ||
            ctx.engine.status === "COMPLETE"
          ) {
            continue;
          }

          // Skip SIM
          if (ctx.engine.mode === "SIM") continue;

          const eng = ctx.engine;

          // Retry path: only use stashed pendingWindow for this posting
          if (eng.currentDueDayIndex != null) {
            if (eng.nextRetryAtUtc && now < eng.nextRetryAtUtc) continue;

            const pw = ctx.pendingWindow;
            const dueIdx = eng.currentDueDayIndex;

            if (!pw || pw.dayIndex !== dueIdx) {
              // Safety reset for this posting
              set((s) => ({
                contexts: {
                  ...s.contexts,
                  [postingId]: {
                    ...s.contexts[postingId],
                    pendingWindow: undefined,
                    engine: {
                      ...s.contexts[postingId].engine,
                      currentDueDayIndex: null,
                      nextRetryAtUtc: null,
                      graceAppliedForDay: null,
                      noDataRetryCount: 0,
                    },
                  },
                },
              }));
              continue;
            }

            await tryProcessWindow(postingId, pw);
            continue;
          }

          // Wake gating
          if (eng.nextRetryAtUtc && now < eng.nextRetryAtUtc) continue;

          // New-work path: per-posting worker
          await get().sendNextIfDueForPosting(postingId);
        }
      },

      // Test Mode-only anchor backdate (atomic)
      setBackdatedAnchorTestOnly(anchorIsoUtc: string) {
        if (!testFlags.TEST_MODE) {
          console.warn(
            `${TAG} setBackdatedAnchorTestOnly ignored — not in Test Mode.`,
          );
          return;
        }

        const pid = get().activePostingId;
        if (!pid) return;

        const c = get().contexts[pid];
        if (!c) return;

        const ms = new Date(anchorIsoUtc).getTime();
        if (!Number.isFinite(ms)) {
          console.warn(
            `${TAG} setBackdatedAnchorTestOnly invalid ISO`,
            anchorIsoUtc,
          );
          return;
        }

        set((s) => ({
          contexts: {
            ...s.contexts,
            [pid]: {
              ...s.contexts[pid],
              cycleAnchorUtc: anchorIsoUtc,
              originalCycleAnchorUtc: anchorIsoUtc,
              pendingWindow: undefined,
              engine: {
                ...s.contexts[pid].engine,
                cycleAnchorUtc: ms,
                currentDueDayIndex: null,
                noDataRetryCount: 0,
                nextRetryAtUtc: null,
                graceAppliedForDay: null,
              },
            },
          },
        }));
      },

      // ── Simulation controls (used by UI in opportunities/[id].tsx) ─────────
      enterSimulation() {
        const st = get();
        if (!testFlags.TEST_MODE) {
          console.warn(`${TAG} enterSimulation ignored — not in Test Mode.`);
          return;
        }

        const pid = st.activePostingId;
        if (!pid) return;

        const ctx = st.contexts[pid];
        if (!ctx) return;

        if (ctx.engine.mode === "SIM") return;

        set((s) => ({
          contexts: {
            ...s.contexts,
            [pid]: {
              ...s.contexts[pid],
              engine: {
                ...s.contexts[pid].engine,
                mode: "SIM",
                simulationLock: false,
                currentDueDayIndex: null,
                noDataRetryCount: 0,
                nextRetryAtUtc: null,
                graceAppliedForDay: null,
              },
              pendingWindow: undefined,
            },
          },
          restoreAnchorAtExit: s.contexts[pid].engine.cycleAnchorUtc,
        }));

        if (__DEV__) console.log(`${TAG} enterSimulation → mode=SIM`);
      },

      async simulateNextDay() {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} simulateNextDay → not ready; skipping`);
          return;
        }

        const st = get();
        if (!testFlags.TEST_MODE) return;

        const pid = st.activePostingId;
        if (!pid) return;

        const ctx = st.contexts[pid];
        if (!ctx) return;

        if (ctx.engine.mode !== "SIM") {
          console.warn(`${TAG} simulateNextDay ignored — mode != SIM`);
          return;
        }

        if (ctx.status !== "ACTIVE") return;
        if (ctx.engine.status !== "ACTIVE") return;

        if (ctx.engine.nextRetryAtUtc && nowMs() < ctx.engine.nextRetryAtUtc)
          return;

        const segmentsExpected = ctx.segmentsExpected ?? 0;

        const nextIdxRaw = (ctx.engine.lastSentDayIndex ?? 0) + 1;
        const nextIdx = Math.max(1, nextIdxRaw);

        if (
          segmentsExpected > 0 &&
          ((ctx.engine.segmentsSent ?? 0) >= segmentsExpected ||
            nextIdx > segmentsExpected)
        ) {
          return;
        }

        if (!ctx.joinTimeLocalISO) return;
        if (!/[+-]\d{2}:\d{2}$/.test(ctx.joinTimeLocalISO)) return;

        const baseIso = ctx.originalCycleAnchorUtc ?? ctx.cycleAnchorUtc;
        if (!baseIso) return;

        const plannerCtx: PlannerContext = {
          joinTimeLocalISO: ctx.joinTimeLocalISO,
          joinTimezone: ctx.joinTimezone || "Local",
          cycleAnchorUtc: baseIso,
          segmentsExpected,
          alreadySentDayIndices:
            ctx.engine.lastSentDayIndex != null
              ? [ctx.engine.lastSentDayIndex]
              : [],
          lastSentDayIndex: ctx.engine.lastSentDayIndex ?? null,
          mode: "SIM",
        };

        const win = planSimulatedWindow(plannerCtx, nextIdx);

        set((s) => ({
          contexts: {
            ...s.contexts,
            [pid]: {
              ...s.contexts[pid],
              pendingWindow: win,
              engine: {
                ...s.contexts[pid].engine,
                currentDueDayIndex: win.dayIndex,
                nextRetryAtUtc: null,
                graceAppliedForDay: win.dayIndex,
              },
            },
          },
        }));

        await tryProcessWindow(pid, win);
      },

      exitSimulation() {
        const st = get();
        const pid = st.activePostingId;
        if (!pid) return;

        const ctx = st.contexts[pid];
        if (!ctx) return;

        if (ctx.engine.mode !== "SIM") return;

        set((s) => ({
          contexts: {
            ...s.contexts,
            [pid]: {
              ...s.contexts[pid],
              engine: {
                ...s.contexts[pid].engine,
                mode: "NORMAL",
                simulationLock: false,
                cycleAnchorUtc:
                  s.restoreAnchorAtExit ??
                  s.contexts[pid].engine.cycleAnchorUtc,
                currentDueDayIndex: null,
                noDataRetryCount: 0,
                nextRetryAtUtc: null,
                graceAppliedForDay: null,
              },
              pendingWindow: undefined,
            },
          },
          restoreAnchorAtExit: undefined,
        }));

        if (__DEV__) console.log(`${TAG} exitSimulation → mode=NORMAL`);
      },

      async cancelCurrentSession() {
        const st = get();
        const pid = st.activePostingId;
        if (!pid) {
          notifyInfo("Nothing to cancel.");
          return;
        }

        const ctx = st.contexts[pid];
        if (!ctx?.userId) {
          notifyInfo("Nothing to cancel.");
          return;
        }

        // Resolve a sessionId if not present in store
        let sid = ctx.sessionId;
        if (!sid) {
          try {
            const resolved = await getSessionByPosting(pid, ctx.userId);
            if (!resolved) {
              notifyInfo("No session found to cancel.");
              return;
            }
            sid = resolved.sessionId;
            if (__DEV__)
              console.log(`${TAG} cancelCurrentSession → resolved sid=${sid}`);
          } catch (e: any) {
            if (__DEV__)
              console.warn(
                `${TAG} cancelCurrentSession resolver error`,
                e?.message ?? e,
              );
            notifyInfo("Unable to resolve session to cancel.");
            return;
          }
        }

        try {
          const res = await cancelShareSession(sid!);

          // Server says: cannot cancel because it's already COMPLETED
          if (!res.ok && res.error === "COMPLETED") {
            set((s) => ({
              contexts: {
                ...s.contexts,
                [pid]: {
                  ...s.contexts[pid],
                  status: "COMPLETE",
                  pendingWindow: undefined,
                  engine: {
                    ...s.contexts[pid].engine,
                    status: "COMPLETE",
                    currentDueDayIndex: null,
                    nextRetryAtUtc: null,
                    graceAppliedForDay: null,
                  },
                },
              },
            }));

            notifyInfo("Session already completed.");
            return;
          }

          // Success → mark as CANCELLED locally and clear any pending work
          if (res.ok && res.status === "CANCELLED") {
            set((s) => ({
              contexts: {
                ...s.contexts,
                [pid]: {
                  ...s.contexts[pid],
                  status: "CANCELLED",
                  pendingWindow: undefined,
                  engine: {
                    ...s.contexts[pid].engine,
                    status: "CANCELLED",
                    currentDueDayIndex: null,
                    nextRetryAtUtc: null,
                    graceAppliedForDay: null,
                  },
                },
              },
            }));

            notifyInfo("Sharing cancelled.");
            try {
              await sendSessionCancelled(pid, "Cancelled.");
            } catch (e) {
              if (__DEV__)
                console.warn(
                  `${TAG} cancelCurrentSession sendSessionCancelled error`,
                  e,
                );
            }
            return;
          }

          // Fallback: unexpected ACTIVE response or generic failure
          if (!res.ok) {
            if (__DEV__)
              console.warn(
                `${TAG} cancelCurrentSession → api error`,
                res.error,
              );
            notifyInfo("Could not cancel the session. Please try again.");
          }
        } catch (e: any) {
          if (__DEV__)
            console.warn(`${TAG} cancelCurrentSession error`, e?.message ?? e);
          notifyInfo("Cancel failed. Please try again.");
        }
      },

      async fetchDashboard(userId: number) {
        try {
          const data = await getSharingDashboard(userId);
          set({
            dashboard: {
              userId: data.userId,
              userDisplayName: data.userDisplayName ?? null,
              sharedPostingsCount: data.sharedPostingsCount ?? 0,
              activeCount: data.activeCount ?? 0,
              completedCount: data.completedCount ?? 0,
              cancelledCount: data.cancelledCount ?? 0,
            },
          });
        } catch (e) {
          console.warn("[Sharing][Dashboard] load error", e);
          // optional: set({ dashboard: undefined })
        }
      },

      hydrateFromSessionSnapshot: (snap) => {
        const postingId = snap.postingId;
        if (!postingId) return;

        const st = get();
        const cur = st.contexts[postingId];
        if (!cur) return;

        const isSim = cur.engine?.mode === "SIM";

        const serverStatus =
          snap.statusCode === "ACTIVE" ||
          snap.statusCode === "PAUSED" ||
          snap.statusCode === "CANCELLED" ||
          snap.statusCode === "COMPLETE"
            ? (snap.statusCode as ShareStatus)
            : null;

        set((s) => {
          const c = s.contexts[postingId];
          if (!c) return s;

          const nextCtxStatus = (serverStatus ?? c.status) as ShareStatus;

          const nextEngine: ShareSessionState = {
            ...c.engine,

            // IMPORTANT: keep engine.status aligned with ctx/server status so producer gates match
            status: nextCtxStatus,

            cycleAnchorUtc: new Date(snap.cycleAnchorUtc).getTime(),
            segmentsExpected: Number(snap.segmentsExpected ?? 0),
            segmentsSent: Number(snap.segmentsSent ?? 0),
            lastSentDayIndex:
              snap.lastSentDayIndex == null
                ? null
                : Number(snap.lastSentDayIndex),
          };

          if (isSim) {
            nextEngine.mode = c.engine.mode;
            nextEngine.simulationLock = c.engine.simulationLock;
          } else {
            nextEngine.mode = c.engine.mode ?? "NORMAL";
            nextEngine.simulationLock =
              typeof c.engine.simulationLock === "boolean"
                ? c.engine.simulationLock
                : false;
          }

          const shouldClearPending =
            nextCtxStatus === "CANCELLED" || nextCtxStatus === "COMPLETE";

          const joinTimeLocalISO = (() => {
            const j = snap.joinTimeLocalISO;
            if (!/[+-]\d{2}:\d{2}$/.test(j)) {
              throw new Error(
                `${TAG} hydrateFromSessionSnapshot: joinTimeLocalISO missing numeric offset (±HH:MM): ${j}`,
              );
            }
            return j;
          })();

          const computedCatchUp = computeCatchUpStatusFromState({
            status: nextCtxStatus,
            engine: nextEngine,
            snapshot: snap,
          });

          return {
            ...s,
            contexts: {
              ...s.contexts,
              [postingId]: {
                ...c,

                sessionId: snap.sessionId,
                userId: snap.userId,

                cycleAnchorUtc: snap.cycleAnchorUtc,
                joinTimezone: snap.joinTimezone,
                joinTimeLocalISO,
                segmentsExpected: Number(snap.segmentsExpected ?? 0),
                snapshot: snap,
                engine: nextEngine,
                ...(c.status !== nextCtxStatus
                  ? { status: nextCtxStatus }
                  : {}),
                ...(shouldClearPending ? { pendingWindow: undefined } : {}),
                catchUpStatus: computedCatchUp,
              },
            },
          };
        });
      },

      // async fetchSessionSnapshot(userId, postingId) {
      //   try {
      //     const res = await getSessionSnapshot(userId, postingId);
      //     const r = res.session;
      //     if (!r) {
      //       set({ snapshot: null });
      //       return;
      //     }
      //     set({
      //       snapshot: {
      //         sessionId: r.session_id,
      //         postingId: r.posting_id,
      //         userId: r.user_id,
      //         statusCode: r.status_code,
      //         statusName: r.status_name,
      //         segmentsExpected: r.segments_expected,
      //         segmentsSent: r.segments_sent,
      //         lastSentDayIndex: r.last_sent_day_index,
      //         cycleAnchorUtc: r.cycle_anchor_utc,
      //         joinTimeLocalISO: r.join_time_local_iso,
      //         joinTimezone: r.join_timezone,
      //         lastUploadedAt: r.last_uploaded_at,
      //         lastWindowFromUtc: r.last_window_from_utc,
      //         lastWindowToUtc: r.last_window_to_utc,
      //       },
      //     });

      //     if (__DEV__) {
      //       console.log("[ShareStore] fetchSessionSnapshot →", {
      //         sessionId: r.session_id,
      //         status: r.status_name ?? r.status_code,
      //         segments: `${r.segments_sent}/${r.segments_expected}`,
      //         lastWindow: [r.last_window_from_utc, r.last_window_to_utc],
      //         anchor: r.cycle_anchor_utc,
      //         lastUploadedAt: r.last_uploaded_at,
      //       });
      //     }
      //   } catch (e) {
      //     if (__DEV__)
      //       console.warn("[ShareStore] fetchSessionSnapshot error", e);
      //     set({ snapshot: null });
      //   }
      // },

      async fetchSessionSnapshot(userId, postingId) {
        try {
          const res = await getSessionSnapshot(userId, postingId);
          const r = res.session;

          if (!r) {
            get().setContext(postingId, { snapshot: null });
            return;
          }

          const snap = {
            sessionId: r.session_id,
            postingId: r.posting_id,
            userId: r.user_id,
            statusCode: r.status_code,
            statusName: r.status_name,
            segmentsExpected: r.segments_expected,
            segmentsSent: r.segments_sent,
            lastSentDayIndex: r.last_sent_day_index,
            cycleAnchorUtc: r.cycle_anchor_utc,
            joinTimezone: r.join_timezone,
            joinTimeLocalISO: (() => {
              const j = r.join_time_local_iso;
              if (typeof j !== "string" || j.length < 10) {
                throw new Error(
                  `${TAG} reuse ACTIVE: invalid join_time_local_iso from server`,
                );
              }
              if (!/[+-]\d{2}:\d{2}$/.test(j)) {
                throw new Error(
                  `${TAG} reuse ACTIVE: join_time_local_iso missing numeric offset (±HH:MM): ${j}`,
                );
              }
              return j;
            })(),

            // NEW (calendar day model)
            joinLocalDate: (r as any).join_local_date ?? null,
            graceMinutes: (r as any).grace_minutes ?? undefined,
            // nextDue: (r as any).next_due
            //   ? {
            //       dayIndex: (r as any).next_due.day_index,
            //       fromUtc: (r as any).next_due.from_utc,
            //       toUtc: (r as any).next_due.to_utc,
            //       eligibleAtUtc: (r as any).next_due.eligible_at_utc,
            //       isEligible: (r as any).next_due.is_eligible,
            //     }
            //   : null,

            // lastUploadedAt: r.last_uploaded_at,
            nextDue: (r as any).next_due
              ? {
                  dayIndex: (r as any).next_due.day_index,
                  fromUtc: (r as any).next_due.from_utc,
                  toUtc: (r as any).next_due.to_utc,
                  eligibleAtUtc: (r as any).next_due.eligible_at_utc,
                  isEligible: (r as any).next_due.is_eligible,
                }
              : null,

            catchUp: (r as any).catch_up
              ? {
                  countEligibleNow: Number(
                    (r as any).catch_up.count_eligible_now ?? 0,
                  ),
                  next: (r as any).catch_up.next
                    ? {
                        dayIndex: (r as any).catch_up.next.day_index,
                        fromUtc: (r as any).catch_up.next.from_utc,
                        toUtc: (r as any).catch_up.next.to_utc,
                        eligibleAtUtc: (r as any).catch_up.next.eligible_at_utc,
                        isEligible: (r as any).catch_up.next.is_eligible,
                      }
                    : null,
                }
              : null,

            wakeAtUtc: (r as any).wake_at_utc ?? null,

            lastUploadedAt: r.last_uploaded_at,

            lastWindowFromUtc: r.last_window_from_utc,
            lastWindowToUtc: r.last_window_to_utc,
          } satisfies NonNullable<StoreState["snapshot"]>;

          // 1) store snapshot + identity fields onto this posting context
          get().setContext(postingId, {
            snapshot: snap,
            sessionId: snap.sessionId,
            userId: snap.userId,
            segmentsExpected: Number(snap.segmentsExpected ?? 0),
            // keep status aligned as best-effort; hydrateFromSessionSnapshot will finalize it
            status:
              snap.statusCode === "ACTIVE" ||
              snap.statusCode === "PAUSED" ||
              snap.statusCode === "CANCELLED" ||
              snap.statusCode === "COMPLETE"
                ? (snap.statusCode as ShareStatus)
                : "PAUSED",
          });

          // 2) hydrate live timeline + engine (single source of truth)
          get().hydrateFromSessionSnapshot(snap);

          if (__DEV__) {
            console.log("[ShareStore] fetchSessionSnapshot →", {
              sessionId: snap.sessionId,
              status: snap.statusName ?? snap.statusCode,
              segments: `${snap.segmentsSent}/${snap.segmentsExpected}`,
              lastWindow: [snap.lastWindowFromUtc, snap.lastWindowToUtc],
              anchor: snap.cycleAnchorUtc,
              lastSentDayIndex: snap.lastSentDayIndex,
              lastUploadedAt: snap.lastUploadedAt,
            });
          }
        } catch (e) {
          if (__DEV__)
            console.warn("[ShareStore] fetchSessionSnapshot error", e);
          get().setContext(postingId, { snapshot: null });
        }
      },

      async probeHealthPlatform() {
        if (Platform.OS === "android") {
          try {
            await ensureInitialized(); // silent init
            const hcKeys = (await hcListGrantedMetricKeys()) ?? [];
            set({
              healthPlatform: "android",
              healthAvailable: true,
              healthGranted: hcKeys.length > 0,
            });
          } catch {
            set({
              healthPlatform: "android",
              healthAvailable: true,
              healthGranted: false,
            });
          }
          return;
        }

        if (Platform.OS === "ios") {
          try {
            const ts = useTrackingStore.getState();

            const hkAvailable = (ts as any).hkAvailable ?? false;
            const hkStatus = (ts as any).hkStatus ?? "unknown";
            const hkHasAnyData = (ts as any).hkHasAnyData ?? false;
            const hkActiveMetrics = Array.isArray((ts as any).hkActiveMetrics)
              ? (ts as any).hkActiveMetrics
              : [];

            const inferredGranted =
              hkHasAnyData || (hkActiveMetrics?.length ?? 0) > 0;

            set({
              healthPlatform: "ios",
              healthAvailable: hkAvailable,
              healthGranted: inferredGranted,
              healthAskedBefore: hkStatus !== "unknown",
            });
          } catch {
            set({
              healthPlatform: "ios",
              healthAvailable: false,
              healthGranted: false,
              healthAskedBefore: false,
            });
          }
          return;
        }
      },

      requestHealthPermissions: async () => {
        if (Platform.OS !== "ios") return;

        // Share store no longer requests HealthKit authorization directly.
        // Permissions are handled via the main Health permissions UI
        // (Header / Tracking tab). We just mirror whatever that flow sets.
        try {
          const ts = useTrackingStore.getState();

          const hkAvailable = (ts as any).hkAvailable ?? false;
          const hkStatus = (ts as any).hkStatus ?? "unknown";
          const hkHasAnyData = (ts as any).hkHasAnyData ?? false;
          const hkActiveMetrics = Array.isArray((ts as any).hkActiveMetrics)
            ? (ts as any).hkActiveMetrics
            : [];

          const inferredGranted =
            hkHasAnyData || (hkActiveMetrics?.length ?? 0) > 0;

          useShareStore.setState({
            healthPlatform: "ios",
            healthAvailable: hkAvailable,
            healthGranted: inferredGranted,
            healthAskedBefore: hkStatus !== "unknown",
          });

          if (!hkAvailable) {
            notifyInfo("HealthKit is not available on this device.");
            return;
          }

          // If we reach here and still have no data / no clear grant,
          // point the user to the centralized permissions flow.
          if (!inferredGranted || hkStatus === "shouldRequest") {
            notifyInfo(
              "Please use the Health Permissions banner on the Home screen to grant Health access before sharing.",
            );
          }
        } catch {
          useShareStore.setState({
            healthPlatform: "ios",
            healthAvailable: false,
            healthGranted: false,
            healthAskedBefore: false,
          });
        }
      },

      // === [STORE_REWARDS_INIT]
      rewards: null,

      async fetchRewards(userId: number) {
        try {
          const data = await getRewardsSummary(userId);
          set({ rewards: data });
        } catch (e) {
          console.warn("[Sharing][Rewards] load error", e);
          set({ rewards: null });
        }
      },
      // Active sessions list for Sharing tab
      activeSessions: null,

      async fetchActiveSessions(userId: number) {
        try {
          const sessions = await getActiveShareSessions(userId);
          set({ activeSessions: sessions });
        } catch (e) {
          console.warn("[Sharing][ActiveSessions] load error", e);
          set({ activeSessions: null });
        }
      },
      // ────────────────────────────────────────────────────────────
      // Logout + login hydration helpers
      // ────────────────────────────────────────────────────────────

      resetForLogout() {
        set(() => ({
          contexts: {},
          activePostingId: undefined,
          metricMap: {},
          dashboard: undefined,
          rewards: null,
          activeSessions: null,
          shareEnabled: false,
          restoreAnchorAtExit: undefined,
        }));
      },

      hydrateFromServer(payload: UserLoginShareHydrationResponse) {
        const sessions = payload.sessions ?? {};

        const newContexts: Record<number, PostingContext> = {};

        for (const primary of sessions) {
          const engine: ShareSessionState = {
            ...initialEngine,
            status: "ACTIVE",
            cycleAnchorUtc: new Date(primary.cycleAnchorUtc).getTime(),
            segmentsExpected: primary.segmentsExpected ?? 0,
            segmentsSent: primary.segmentsSent ?? 0,
            lastSentDayIndex: primary.lastSentDayIndex ?? null,
          };

          newContexts[primary.postingId] = {
            sessionId: primary.sessionId,
            postingId: primary.postingId,
            userId: primary.userId,
            segmentsExpected: primary.segmentsExpected,
            status: "ACTIVE",
            cycleAnchorUtc: primary.cycleAnchorUtc,
            originalCycleAnchorUtc: primary.cycleAnchorUtc,
            joinTimezone: primary.joinTimezone,
            joinTimeLocalISO: primary.joinTimeLocalISO,
            engine,
            metricMap: {}, // explicit: prevents accidental undefined fallthrough
            snapshot: null,
          };
        }

        set({
          contexts: newContexts,
          activePostingId:
            sessions.length > 0 ? sessions[0].postingId : undefined,
          shareEnabled: sessions.length > 0, // IMPORTANT: enable readiness after login hydration
        });
      },
    }),
    {
      name: STORE_NAME,
      version,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        ...basePartialize(s),
      }),

      migrate,
      onRehydrateStorage: () => (_rehydratedState, error) => {
        if (error) {
          console.warn(`${TAG} rehydrate error`, error);
          return;
        }

        try {
          const s = useShareStore.getState();

          if (SHARE_DEBUG) {
            console.log(`${TAG} rehydrated`, {
              ok: true,
              activePostingId: s?.activePostingId,
              contextsCount: s?.contexts ? Object.keys(s.contexts).length : 0,
            });
          }

          // Backfill defaults for older persisted engines (ALL postings)
          try {
            const ctxs = s.contexts ?? {};
            for (const [k, c] of Object.entries(ctxs)) {
              const pid = Number(k);
              if (!Number.isFinite(pid) || !c?.engine) continue;

              const e = c.engine;
              const needs =
                !e.mode ||
                typeof e.simulationLock !== "boolean" ||
                typeof e.cycleAnchorUtc !== "number" ||
                (e.nextRetryAtUtc != null &&
                  typeof e.nextRetryAtUtc !== "number");

              if (!needs) continue;

              useShareStore.setState((st) => {
                const cur = st.contexts?.[pid];
                if (!cur?.engine) return st;

                const nextRetry =
                  cur.engine.nextRetryAtUtc != null &&
                  typeof cur.engine.nextRetryAtUtc !== "number"
                    ? null
                    : cur.engine.nextRetryAtUtc;

                return {
                  contexts: {
                    ...st.contexts,
                    [pid]: {
                      ...cur,
                      engine: {
                        ...cur.engine,
                        mode: cur.engine.mode ?? "NORMAL",
                        simulationLock:
                          typeof cur.engine.simulationLock === "boolean"
                            ? cur.engine.simulationLock
                            : false,
                        cycleAnchorUtc:
                          typeof cur.engine.cycleAnchorUtc === "number"
                            ? cur.engine.cycleAnchorUtc
                            : Date.now(),
                        nextRetryAtUtc: nextRetry,
                      },
                    },
                  },
                };
              });
            }
          } catch {}

          // Enable only if we have at least one ACTIVE context after rehydrate.
          const hasActive =
            !!s.contexts &&
            Object.values(s.contexts).some((c) => c?.status === "ACTIVE");

          if (hasActive && s.shareEnabled !== true) {
            useShareStore.setState({ shareEnabled: true });
          }
          if (!hasActive && s.shareEnabled === true) {
            useShareStore.setState({ shareEnabled: false });
          }

          // If engine ACTIVE but missing meta, pause
          // if (
          //   s.engine?.status === "ACTIVE" &&
          //   (!s.sessionId || !s.postingId || !s.userId || !s.cycleAnchorUtc)
          // ) {
          //   useShareStore.setState({
          //     status: "PAUSED",
          //     engine: { ...s.engine, status: "PAUSED" },
          //   });
          // }
        } catch (e: any) {
          console.warn(`${TAG} rehydrate → post-fix error`, e?.message ?? e);
        }
      },
    },
  ),
);
export const isShareReady = () =>
  useShareStore.getState().shareEnabled === true;

/** Helper: hand a window to the engine and persist the updated engine state. */
async function tryProcessWindow(postingId: number, win: WindowRef) {
  const st = useShareStore.getState();

  const pid = postingId;
  if (!pid) return;

  const pctx = st.contexts[pid];
  if (!pctx?.sessionId || !pctx?.userId) return;

  const preEngine = { ...pctx.engine };
  const preSegmentsSent = preEngine.segmentsSent ?? 0;
  const preLastIdx = preEngine.lastSentDayIndex ?? null;

  if (__DEV__) {
    console.log(`${TAG} tryProcessWindow → start`, {
      postingId: pid,
      dayIndex: win.dayIndex,
      fromUtc: win.fromUtc,
      toUtc: win.toUtc,
      eng: pctx.engine,
    });
  }

  const ctx = {
    sessionId: pctx.sessionId,
    postingId: pid,
    userId: pctx.userId,
    metricMap: (pctx.metricMap ?? st.metricMap) as Record<MetricCode, number>,
  };

  try {
    const { state: nextState, diag } = await processDueWindow(
      win,
      ctx,
      pctx.engine,
    );

    useShareStore.setState((s) => {
      const shouldDrop =
        nextState.status === "CANCELLED" ||
        nextState.status === "COMPLETE" ||
        (nextState.lastSentDayIndex != null &&
          nextState.lastSentDayIndex >= win.dayIndex);
      // // Refresh server snapshot for THIS posting/user (async fire-and-forget)
      // try {
      //   const st2 = useShareStore.getState();
      //   const c2 = st2.contexts[pid];
      //   if (c2?.userId) {
      //     void st2.fetchSessionSnapshot(c2.userId, pid);
      //   }
      // } catch (e) {
      //   if (__DEV__)
      //     console.warn("[ShareStore] post-window snapshot refresh failed", e);
      // }

      if (__DEV__) {
        console.log(`${TAG} tryProcessWindow → done`, {
          postingId: pid,
          dayIndex: win.dayIndex,
          updatedStatus: nextState.status,
          lastSentDayIndex: nextState.lastSentDayIndex,
          segmentsSent: nextState.segmentsSent,
          dropPending: shouldDrop,
          diag,
        });
      }

      return {
        contexts: {
          ...s.contexts,
          [pid]: {
            ...s.contexts[pid],

            // Always commit engine
            engine: {
              ...nextState,

              // Defensive: ensure we do not remain "in-flight" after a successful send for this window.
              // If processDueWindow already clears these, this is harmless.
              ...(nextState.lastSentDayIndex != null &&
              nextState.lastSentDayIndex >= win.dayIndex
                ? {
                    currentDueDayIndex: null,
                    nextRetryAtUtc: null,
                  }
                : {}),
            },

            // Clear stashed window if terminal OR if we successfully advanced past this day
            ...(shouldDrop ? { pendingWindow: undefined } : {}),
            ...(nextState.lastSentDayIndex != null &&
            nextState.lastSentDayIndex >= win.dayIndex
              ? { pendingWindow: undefined }
              : {}),

            ...(s.contexts[pid].status !== nextState.status
              ? { status: nextState.status }
              : {}),

            ...(diag
              ? {
                  lastWindowDiag: {
                    dayIndex: win.dayIndex,
                    unavailable: diag.unavailable ?? [],
                    zeroData: diag.zeroData ?? [],
                    hadAnyData: !!diag.hadAnyData,
                  },
                }
              : {}),
          },
        },
      };
    });

    // Refresh server snapshot for THIS posting/user (async fire-and-forget)
    try {
      const st2 = useShareStore.getState();
      const c2 = st2.contexts[pid];
      if (c2?.userId) {
        void st2.fetchSessionSnapshot(c2.userId, pid);
      }
    } catch (e) {
      if (__DEV__)
        console.warn("[ShareStore] post-window snapshot refresh failed", e);
    }

    // --- notifications strictly follow the posting that was processed ---
    const after = useShareStore.getState();

    const ctx2 = after.contexts[pid];
    if (!ctx2) return;

    const afterEngine = ctx2.engine;
    const postSegmentsSent = afterEngine?.segmentsSent ?? 0;

    if (
      postSegmentsSent > preSegmentsSent &&
      (afterEngine?.lastSentDayIndex ?? 0) >= win.dayIndex
    ) {
      try {
        await sendSegmentSuccess(pid, win.dayIndex);
      } catch {}
    }

    if (ctx2.status === "CANCELLED") {
      const diag2 = after.contexts[pid]?.lastWindowDiag;

      const reason =
        (diag2?.unavailable?.length ?? 0) > 0
          ? "Missing permission for some metrics."
          : diag2?.hadAnyData
            ? "Sync stopped by system."
            : "No data found after multiple checks.";

      try {
        let sid = ctx2.sessionId;

        if (!sid && ctx2.userId != null) {
          try {
            const resolved = await getSessionByPosting(pid, ctx2.userId);
            if (resolved) sid = resolved.sessionId;
          } catch {}
        }

        if (sid) {
          try {
            const res = await cancelShareSession(sid);
            if (!res.ok && __DEV__) {
              console.warn(
                `${TAG} tryProcessWindow → auto cancel backend error`,
                res.error,
              );
            }
          } catch {}
        }
      } finally {
        try {
          await sendSessionCancelled(pid, reason);
        } catch {}
      }

      return;
    } else if (ctx2.status === "COMPLETE") {
      try {
        await sendSessionCompleted(pid);
      } catch {}
      return;
    }

    if (after.contexts[pid]?.lastWindowDiag) {
      const { unavailable, zeroData, hadAnyData } =
        after.contexts[pid].lastWindowDiag;

      if (unavailable.length > 0) {
        const list = unavailable.map(labelOfMetric).join(", ");
        notifyInfo(
          `Not allowed to read: ${list}. Please grant Health permissions.`,
        );
      }

      if (zeroData.length > 0) {
        const list = zeroData.map(labelOfMetric).join(", ");
        if (hadAnyData) {
          notifyInfo(`Synced. No data in this window for: ${list}`);
        } else {
          notifyInfo(`No data in this window yet for: ${list}. Will retry.`);
        }
      }
    }
  } catch (e: any) {
    console.warn(`${TAG} tryProcessWindow → error`, e?.message ?? e, e);
  }
}
