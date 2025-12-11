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
  getSharingDashboard,
} from "@/src/services/sharing/api";

import {
  computeWindowForDayIndex,
  isWindowPastGrace,
  planCatchUpWindows,
  planDay0Window,
  planNextDueWindow,
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
import {
  GRACE_WAIT_MS,
  getShareRuntimeConfig,
} from "@/src/services/sharing/constants";
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

type StoreState = {
  // session/meta
  sessionId?: number;
  postingId?: number;
  userId?: number;
  segmentsExpected?: number;
  status: ShareStatus;
  // cancel action (resolver-backed)
  cancelCurrentSession: () => Promise<void>;

  // timing/meta used by planner
  cycleAnchorUtc?: string; // UTC ISO string for planner
  originalCycleAnchorUtc?: string; // UTC ISO string at session start (for Test Mode)
  joinTimezone?: string; // 'America/New_York'
  joinTimeLocalISO?: string; // local ISO with offset at join

  // engine state (persisted) — mirrors ShareSessionState
  engine: ShareSessionState;

  // ephemeral (not persisted)
  pendingWindow?: WindowRef;

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

  // actions
  fetchSessionSnapshot: (userId: number, postingId: number) => Promise<void>;
  restoreAnchorAtExit?: number;

  // actions
  startSession: (
    postingId: number,
    userId: number,
    metricMap: Partial<Record<MetricCode, number>>,
    segmentsExpected?: number
  ) => Promise<void>;

  shareEnabled: boolean; // <— PERSISTED readiness gate
  setShareEnabled: (v: boolean) => void; // <— optional setter

  // optional helpers
  sendFirstSegment: () => Promise<void>;
  sendNextIfDue: () => Promise<void>;
  catchUpIfNeeded: () => Promise<void>;

  // cadence brain (call on focus/interval or background fetch)
  tick: () => Promise<void>;

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
  segmentsExpected: number
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
  now = Date.now()
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
function localMidnightUTCFromJoinLocalISO(joinLocalISO: string): string {
  const datePart = joinLocalISO.slice(0, 10); // 'YYYY-MM-DD'
  const plus = joinLocalISO.lastIndexOf("+");
  const minus = joinLocalISO.lastIndexOf("-");
  const offIdx = Math.max(plus, minus);
  const offset = offIdx > 10 ? joinLocalISO.slice(offIdx) : "Z";
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

const basePartialize = (s: StoreState): Partial<StoreState> => ({
  sessionId: s.sessionId,
  postingId: s.postingId,
  userId: s.userId,
  segmentsExpected: s.segmentsExpected,
  status: s.status,

  cycleAnchorUtc: s.cycleAnchorUtc,
  originalCycleAnchorUtc: s.originalCycleAnchorUtc,
  joinTimezone: s.joinTimezone,
  joinTimeLocalISO: s.joinTimeLocalISO,

  engine: s.engine,
  metricMap: s.metricMap,

  shareEnabled: s.shareEnabled,
});

const version = 2;

const migrate = (persisted: any, _from: number): any => {
  if (persisted?.engine) {
    if (typeof persisted.engine.cycleAnchorUtc !== "number") {
      const parsed = Number(persisted.engine.cycleAnchorUtc);
      persisted.engine.cycleAnchorUtc = isNaN(parsed) ? Date.now() : parsed;
    }
    if (
      persisted.engine.nextRetryAtUtc != null &&
      typeof persisted.engine.nextRetryAtUtc !== "number"
    ) {
      const parsed = Number(persisted.engine.nextRetryAtUtc);
      persisted.engine.nextRetryAtUtc = isNaN(parsed) ? null : parsed;
    }
    if (!persisted.engine.mode) persisted.engine.mode = "NORMAL";
    if (typeof persisted.engine.simulationLock !== "boolean") {
      persisted.engine.simulationLock = false;
    }
    if (typeof persisted.engine.segmentsExpected !== "number") {
      // fall back to top-level segmentsExpected if present, else 0
      persisted.engine.segmentsExpected =
        typeof persisted.segmentsExpected === "number"
          ? persisted.segmentsExpected
          : 0;
    }
  }
  return persisted;
};

// ---- Store ------------------------------------------------------------------

export const useShareStore = create<StoreState>()(
  persist(
    (set, get) => ({
      status: "PAUSED",
      metricMap: {},
      engine: { ...initialEngine },
      dashboard: undefined,
      snapshot: null,

      shareEnabled: true,
      setShareEnabled: (v) => set({ shareEnabled: !!v }),

      healthPlatform: Platform.OS === "ios" ? "ios" : "android",
      healthAvailable: undefined,
      healthGranted: undefined,

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
                "[SHARE][TestMode] ENABLED — backdated anchor simulations allowed."
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
                "Please enable Health data access from the Health Permissions banner before starting sharing."
              );
              return;
            }
          }

          // Build local ISO with device offset (used by Day-0 logic)
          const tz = getLocalTimezoneInfo();
          const now = new Date();
          const localIso = new Date(
            now.getTime() - now.getTimezoneOffset() * 60000
          )
            .toISOString()
            .replace("Z", tz.offsetStr.replace("UTC", ""));

          // Try to reuse an existing ACTIVE session for (postingId, userId) before creating a new one
          try {
            const resolved = await getSessionByPosting(postingId, userId);
            if (resolved && resolved.source === "ACTIVE") {
              const eng: ShareSessionState = {
                ...initialEngine,
                status: "ACTIVE",
                // Use "now" as the engine's numeric anchor; planner ISO is set below.
                cycleAnchorUtc: Date.now(),
                segmentsExpected: Number(resolved.segmentsExpected ?? 0),
                segmentsSent: Number(resolved.segmentsSent ?? 0),
              };

              set({
                sessionId: resolved.sessionId,
                postingId,
                userId,
                metricMap,
                segmentsExpected: eng.segmentsExpected,
                status: "ACTIVE",

                // Planner-facing ISO anchor (we don't get anchor from resolver; use now for UI/planner)
                cycleAnchorUtc: new Date().toISOString(),
                originalCycleAnchorUtc: new Date().toISOString(),
                joinTimezone: tz.iana || "Local",
                joinTimeLocalISO: localIso,

                engine: eng,

                shareEnabled: true,
              });

              if (__DEV__) {
                console.log(TAG, "startSession → reused ACTIVE session", {
                  sessionId: resolved.sessionId,
                  segmentsExpected: eng.segmentsExpected,
                  segmentsSent: eng.segmentsSent,
                });
              }

              // Continue with normal Day-0 behavior (no grace)
              try {
                await sendSessionStarted(postingId);
              } catch {}
              await get().sendFirstSegment();
              return;
            }
          } catch (e) {
            if (__DEV__)
              console.warn(
                `${TAG} resolver lookup failed — proceeding to create`,
                e
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

          set({
            sessionId: sess.sessionId,
            postingId,
            userId,
            metricMap,
            segmentsExpected: sess.segmentsExpected,
            status: "ACTIVE",

            cycleAnchorUtc: sess.cycleAnchorUtc, // ISO for planner
            originalCycleAnchorUtc: sess.cycleAnchorUtc,
            joinTimezone: sess.joinTimezone,
            joinTimeLocalISO: sess.joinTimeLocalISO,

            engine: eng,
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

      async sendFirstSegment() {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} sendFirstSegment → not ready; skipping`);
          return;
        }
        const st = get();
        if (
          !st.sessionId ||
          !st.postingId ||
          !st.userId ||
          !st.cycleAnchorUtc ||
          !st.joinTimeLocalISO
        )
          return;

        // In SIM mode: Day-0 is driven by simulateNextDay; do nothing here.
        if (st.engine.mode === "SIM") {
          if (__DEV__)
            console.log(`${TAG} sendFirstSegment → passive (SIM mode)`);
          return;
        }

        //  Test Mode Day-0 controls
        if (testFlags.TEST_MODE && testFlags.TEST_FORCE_SKIP_DAY0) {
          if (__DEV__)
            console.log(`${TAG} sendFirstSegment → TEST: skipping Day-0`);
          return;
        }

        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO,
          joinTimezone: st.joinTimezone || "Local",
          cycleAnchorUtc: st.cycleAnchorUtc,
          segmentsExpected: st.segmentsExpected ?? 0,
          alreadySentDayIndices: [],
          mode: "NORMAL",
        };

        // Day-0 probe using a “fast” metric if available (real data only)
        const want = st.metricMap as Partial<Record<MetricCode, number>>;
        const probeMetric: MetricCode | undefined = want.STEPS
          ? "STEPS"
          : want.KCAL
            ? "KCAL"
            : want.DISTANCE
              ? "DISTANCE"
              : want.FLOORS
                ? "FLOORS"
                : want.HR
                  ? "HR"
                  : want.SLEEP
                    ? "SLEEP"
                    : undefined;

        let hasDay0Data = false;
        try {
          if (probeMetric) {
            const midnightLocalUtcISO = localMidnightUTCFromJoinLocalISO(
              st.joinTimeLocalISO!
            );
            const probe = await import(
              "@/src/services/sharing/summarizer"
            ).then((m) =>
              m.summarizeWindow(
                probeMetric,
                midnightLocalUtcISO,
                st.cycleAnchorUtc!,
                { probeOnly: true }
              )
            );
            hasDay0Data = !!probe;

            if (__DEV__) {
              console.log("[SHARE][Store] Day0 probe", {
                probeMetric,
                midnightLocalUtcISO,
                joinUtc: st.cycleAnchorUtc,
                hasDay0Data,
              });
            }
          }
        } catch (e: any) {
          console.warn(
            `${TAG} sendFirstSegment → probe error`,
            e?.message ?? e
          );
        }

        // === [ANCHOR: DAY0-ALWAYS-QUEUE]
        let day0 = planDay0Window(
          ctx,
          hasDay0Data || (testFlags.TEST_MODE && testFlags.TEST_FORCE_DAY0)
        );

        // If planner declines Day-0 (likely no data yet), fall back to an explicit Day-0 window
        if (!day0) {
          day0 = buildDay0Window(st.joinTimeLocalISO!, st.cycleAnchorUtc!);
          if (__DEV__) {
            console.log(
              "[SHARE][Store] Day0 planner declined; using fallback window",
              day0
            );
          }
        }

        // Mark engine so tick()/producer can apply grace/retries for Day-0 if needed
        set((s) => ({
          pendingWindow: day0!,
          engine: {
            ...s.engine,
            currentDueDayIndex: 0,
            // don’t set nextRetryAtUtc here — let producer decide initial backoff based on data presence
            graceAppliedForDay: 0,
          },
        }));

        await tryProcessWindow(day0!);
      },

      async sendNextIfDue() {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} sendNextIfDue → not ready; skipping`);
          return;
        }

        const st = get();
        if (!st.sessionId || st.status !== "ACTIVE") return;

        // In SIM mode we are passive.
        if (st.engine.mode === "SIM") {
          if (__DEV__) console.log(`${TAG} sendNextIfDue → passive (SIM mode)`);
          return;
        }

        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO!,
          joinTimezone: st.joinTimezone || "Local",
          cycleAnchorUtc: st.cycleAnchorUtc!,
          segmentsExpected: st.segmentsExpected ?? 0,
          alreadySentDayIndices:
            st.engine.lastSentDayIndex != null
              ? [st.engine.lastSentDayIndex]
              : [],
          mode: "NORMAL",
        };

        const win = planNextDueWindow(ctx, nowISO());
        if (!win) return;

        // Grace on first see of a new day (only if not already applied)
        const alreadyAppliedFor = get().engine.graceAppliedForDay;
        const pastGrace = isWindowPastGrace(win.toUtc, nowISO());

        if (
          !pastGrace &&
          GRACE_WAIT_MS > 0 &&
          alreadyAppliedFor !== win.dayIndex
        ) {
          set((s) => ({
            pendingWindow: win, // stash exact window
            engine: {
              ...s.engine,
              currentDueDayIndex: win.dayIndex,
              nextRetryAtUtc: nowMs() + GRACE_WAIT_MS,
              graceAppliedForDay: win.dayIndex,
            },
          }));
          return; // wait for grace before processing
        }

        // If grace already passed (e.g., after backdating), process immediately.
        set((s) => ({
          pendingWindow: win,
          engine: {
            ...s.engine,
            currentDueDayIndex: win.dayIndex,
          },
        }));
        await tryProcessWindow(win);
      },

      async catchUpIfNeeded() {
        if (!isShareReady()) {
          if (SHARE_DEBUG)
            console.log(`${TAG} catchUpIfNeeded → not ready; skipping`);
          return;
        }

        const st = get();
        if (!st.sessionId || st.status !== "ACTIVE") return;

        if (st.engine.mode === "SIM") {
          if (__DEV__)
            console.log(`${TAG} catchUpIfNeeded → passive (SIM mode)`);
          return;
        }

        const last = st.engine.lastSentDayIndex ?? 0;

        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO!,
          joinTimezone: st.joinTimezone || "Local",
          cycleAnchorUtc: st.cycleAnchorUtc!,
          segmentsExpected: st.segmentsExpected ?? 0,
          alreadySentDayIndices: [last],
          lastSentDayIndex: last,
          mode: "NORMAL",
        };

        const windows = planCatchUpWindows(ctx, last, nowISO());
        for (const win of windows) {
          await tryProcessWindow(win);
          const cur = get();
          if (cur.status !== "ACTIVE") break; // CANCELLED/COMPLETE stops catch-up
        }
      },

      // Call this on focus + short interval (e.g., 5s in DEV, 60s in PROD)
      async tick() {
        if (!isShareReady()) {
          if (SHARE_DEBUG) console.log(`${TAG} tick → not ready; skipping`);
          return;
        }

        const st = get();
        if (__DEV__)
          console.log(`${TAG} tick → engine gate`, {
            status: st.engine.status,
            storeStatus: st.status,
          });

        if (!st.sessionId) return;

        // Mirror engine status to store status and stop if terminal
        if (
          st.engine.status === "CANCELLED" ||
          st.engine.status === "COMPLETE" ||
          st.status !== "ACTIVE"
        ) {
          if (st.status !== st.engine.status) set({ status: st.engine.status });
          if (__DEV__)
            console.log(`${TAG} tick → stopping`, {
              engineStatus: st.engine.status,
            });
          return;
        }

        // SIM mode: passive; the dev button will drive simulateNextDay()
        if (st.engine.mode === "SIM") {
          if (__DEV__) console.log(`${TAG} tick → passive (SIM mode)`);
          return;
        }

        const now = Date.now();
        const eng = st.engine;

        // 1) If we’re already working a due day, handle grace/retry locally
        if (eng.currentDueDayIndex != null) {
          if (eng.nextRetryAtUtc && now < eng.nextRetryAtUtc) {
            if (__DEV__)
              console.log(`${TAG} tick → waiting`, {
                nextRetryAt: eng.nextRetryAtUtc,
              });
            return; // waiting
          }

          const pw = st.pendingWindow;
          const win: WindowRef =
            pw && pw.dayIndex === eng.currentDueDayIndex
              ? pw
              : (() => {
                  const { fromUtc, toUtc } = computeWindowForDayIndex(
                    st.cycleAnchorUtc!,
                    eng.currentDueDayIndex
                  );
                  if (__DEV__)
                    console.log(`${TAG} tick → new window`, {
                      dayIndex: eng.currentDueDayIndex,
                      fromUtc,
                      toUtc,
                    });
                  return { dayIndex: eng.currentDueDayIndex, fromUtc, toUtc };
                })();

          set((s) => ({
            pendingWindow: win,
            engine: {
              ...s.engine,
              currentDueDayIndex: win.dayIndex,
            },
          }));
          await tryProcessWindow(win);
          return;
        }

        if (__DEV__) console.log(`${TAG} tick → checking if new window due`);

        // 2) Otherwise, see if a NEW window is due
        await get().sendNextIfDue();
      },

      // Test Mode-only anchor backdate (atomic)
      setBackdatedAnchorTestOnly(anchorIsoUtc: string) {
        if (!testFlags.TEST_MODE) {
          console.warn(
            `${TAG} setBackdatedAnchorTestOnly ignored — not in Test Mode.`
          );
          return;
        }
        try {
          const ms = new Date(anchorIsoUtc).getTime();
          if (!Number.isFinite(ms)) {
            console.warn(
              `${TAG} setBackdatedAnchorTestOnly invalid ISO`,
              anchorIsoUtc
            );
            return;
          }
          set((s) => ({
            cycleAnchorUtc: anchorIsoUtc, // planner ISO
            engine: {
              ...s.engine,
              cycleAnchorUtc: ms, // engine numeric
              currentDueDayIndex: null, // reset per-day state
              noDataRetryCount: 0,
              nextRetryAtUtc: null,
              graceAppliedForDay: null,
            },
            pendingWindow: undefined,
          }));
          if (__DEV__) {
            console.log(`${TAG} setBackdatedAnchorTestOnly →`, {
              cycleAnchorUtc: anchorIsoUtc,
              engineCycleAnchorMs: ms,
            });
          }
        } catch (e: any) {
          console.warn(
            `${TAG} setBackdatedAnchorTestOnly error`,
            e?.message ?? e
          );
        }
      },

      // ── Simulation controls (used by UI in opportunities/[id].tsx) ─────────
      enterSimulation() {
        const st = get();
        if (!testFlags.TEST_MODE) {
          console.warn(`${TAG} enterSimulation ignored — not in Test Mode.`);
          return;
        }
        if (st.engine.mode === "SIM") return;

        set((s) => ({
          engine: {
            ...s.engine,
            mode: "SIM",
            simulationLock: false,
            currentDueDayIndex: null,
            noDataRetryCount: 0,
            nextRetryAtUtc: null,
            graceAppliedForDay: null,
          },
          restoreAnchorAtExit: s.engine.cycleAnchorUtc,
          pendingWindow: undefined,
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
        if (st.engine.mode !== "SIM") {
          console.warn(`${TAG} simulateNextDay ignored — mode != SIM`);
          return;
        }
        // Store-wide inactive — also bail
        if (st.status !== "ACTIVE") {
          if (__DEV__)
            console.log(
              `${TAG} simulateNextDay → store not ACTIVE (status=${st.status})`
            );
          return;
        }
        // If engine already finished/cancelled, bail out (keeps union for later checks)
        if (st.engine.status !== "ACTIVE") {
          if (__DEV__)
            console.log(
              `${TAG} simulateNextDay → nothing to do (engineStatus=${st.engine.status})`
            );
          return;
        }
        // Store-wide inactive — also bail
        if (st.status !== "ACTIVE") {
          if (__DEV__)
            console.log(
              `${TAG} simulateNextDay → store not ACTIVE (status=${st.status})`
            );
          return;
        }
        if (!st.sessionId || !st.postingId || !st.userId || !st.cycleAnchorUtc)
          return;

        // Do not run while in a backoff/grace wait
        if (st.engine.nextRetryAtUtc && nowMs() < st.engine.nextRetryAtUtc) {
          if (__DEV__)
            console.log(`${TAG} simulateNextDay → waiting backoff/grace`);
          return;
        }

        const segmentsExpected = st.segmentsExpected ?? 0;
        const nextIdx = (st.engine.lastSentDayIndex ?? -1) + 1;

        //  extra safety: stop when all segments are sent or nextIdx exceeds expected
        if (
          (segmentsExpected > 0 &&
            (st.engine.segmentsSent ?? 0) >= segmentsExpected) ||
          nextIdx > segmentsExpected
        ) {
          if (__DEV__)
            console.log(
              `${TAG} simulateNextDay → nothing to do (all segments sent)`
            );
          return;
        }

        // Use the immutable anchor captured at startSession (fallback to current if missing)
        const baseIso = st.originalCycleAnchorUtc ?? st.cycleAnchorUtc;
        if (!baseIso) {
          console.warn(
            `${TAG} simulateNextDay → no baseIso available (missing originalCycleAnchorUtc/cycleAnchorUtc)`
          );
          return;
        }

        // Compute exact simulated window from immutable base (passive w.r.t. "now")
        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO!,
          joinTimezone: st.joinTimezone || "Local",
          cycleAnchorUtc: baseIso, // <— CHANGED: pass immutable T₀
          segmentsExpected,
          alreadySentDayIndices:
            st.engine.lastSentDayIndex != null
              ? [st.engine.lastSentDayIndex]
              : [],
          lastSentDayIndex: st.engine.lastSentDayIndex ?? null, //
          mode: "SIM",
        };
        const win = planSimulatedWindow(ctx, nextIdx);

        // In SIM we bypass grace for that day (process immediately)
        set((s) => ({
          pendingWindow: win,
          engine: {
            ...s.engine,
            currentDueDayIndex: win.dayIndex,
            nextRetryAtUtc: null,
            graceAppliedForDay: win.dayIndex,
          },
        }));

        await tryProcessWindow(win);
      },

      exitSimulation() {
        const st = get();
        if (st.engine.mode !== "SIM") return;

        set((s) => ({
          engine: {
            ...s.engine,
            mode: "NORMAL",
            simulationLock: false,
            // Restore the real anchor if we had saved it; otherwise keep current
            cycleAnchorUtc: s.restoreAnchorAtExit ?? s.engine.cycleAnchorUtc,
            currentDueDayIndex: null,
            noDataRetryCount: 0,
            nextRetryAtUtc: null,
            graceAppliedForDay: null,
          },
          restoreAnchorAtExit: undefined,
          pendingWindow: undefined,
        }));

        if (__DEV__) console.log(`${TAG} exitSimulation → mode=NORMAL`);
      },

      async cancelCurrentSession() {
        const st = get();

        // Must know which (posting,user) to resolve a session for
        if (!st.postingId || !st.userId) {
          if (__DEV__)
            console.log(
              `${TAG} cancelCurrentSession → missing postingId/userId`
            );
          notifyInfo("Nothing to cancel.");
          return;
        }

        // Resolve a sessionId if not present in store
        let sid = st.sessionId;
        if (!sid) {
          try {
            const resolved = await getSessionByPosting(st.postingId, st.userId);
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
                e?.message ?? e
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
              status: "COMPLETE",
              engine: {
                ...s.engine,
                status: "COMPLETE",
                currentDueDayIndex: null,
                nextRetryAtUtc: null,
                graceAppliedForDay: null,
              },
              pendingWindow: undefined,
            }));
            notifyInfo("Session already completed.");
            return;
          }

          // Success → mark as CANCELLED locally and clear any pending work
          if (res.ok && res.status === "CANCELLED") {
            set((s) => ({
              status: "CANCELLED",
              engine: {
                ...s.engine,
                status: "CANCELLED",
                currentDueDayIndex: null,
                nextRetryAtUtc: null,
                graceAppliedForDay: null,
              },
              pendingWindow: undefined,
            }));
            notifyInfo("Sharing cancelled.");
            try {
              await sendSessionCancelled(st.postingId!, "Cancelled.");
            } catch {}
            return;
          }

          // Fallback: unexpected ACTIVE response or generic failure
          if (!res.ok) {
            if (__DEV__)
              console.warn(
                `${TAG} cancelCurrentSession → api error`,
                res.error
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

      async fetchSessionSnapshot(userId, postingId) {
        try {
          const { getSessionSnapshot } = await import(
            "@/src/services/sharing/api"
          );
          const res = await getSessionSnapshot(userId, postingId);
          const r = res.session;
          if (!r) {
            set({ snapshot: null });
            return;
          }
          set({
            snapshot: {
              sessionId: r.session_id,
              postingId: r.posting_id,
              userId: r.user_id,
              statusCode: r.status_code,
              statusName: r.status_name,
              segmentsExpected: r.segments_expected,
              segmentsSent: r.segments_sent,
              lastSentDayIndex: r.last_sent_day_index,
              cycleAnchorUtc: r.cycle_anchor_utc,
              joinTimeLocalISO: r.join_time_local_iso,
              joinTimezone: r.join_timezone,
              lastUploadedAt: r.last_uploaded_at,
              lastWindowFromUtc: r.last_window_from_utc,
              lastWindowToUtc: r.last_window_to_utc,
            },
          });

          if (__DEV__) {
            console.log("[ShareStore] fetchSessionSnapshot →", {
              sessionId: r.session_id,
              status: r.status_name ?? r.status_code,
              segments: `${r.segments_sent}/${r.segments_expected}`,
              lastWindow: [r.last_window_from_utc, r.last_window_to_utc],
              anchor: r.cycle_anchor_utc,
              lastUploadedAt: r.last_uploaded_at,
            });
          }
        } catch (e) {
          if (__DEV__)
            console.warn("[ShareStore] fetchSessionSnapshot error", e);
          set({ snapshot: null });
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
              "Please use the Health Permissions banner on the Home screen to grant Health access before sharing."
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
          // core session identity
          sessionId: undefined,
          postingId: undefined,
          userId: undefined,
          segmentsExpected: undefined,
          status: "PAUSED",

          // planner/meta
          cycleAnchorUtc: undefined,
          originalCycleAnchorUtc: undefined,
          joinTimezone: undefined,
          joinTimeLocalISO: undefined,

          // engine + pending window
          engine: { ...initialEngine },
          pendingWindow: undefined,

          // metric mapping + snapshots
          metricMap: {},
          snapshot: null,

          // simulation / diagnostics
          restoreAnchorAtExit: undefined,
          lastWindowDiag: undefined,

          // active sessions list
          activeSessions: null,
        }));
      },

      hydrateFromServer(payload: UserLoginShareHydrationResponse) {
        const sessions = payload.sessions ?? [];

        // If no active sessions, clear session-specific state and keep store in a clean PAUSED state.
        if (sessions.length === 0) {
          set(() => ({
            sessionId: undefined,
            postingId: undefined,
            userId: payload.userId ?? undefined,
            segmentsExpected: undefined,
            status: "PAUSED",

            cycleAnchorUtc: undefined,
            originalCycleAnchorUtc: undefined,
            joinTimezone: undefined,
            joinTimeLocalISO: undefined,

            engine: { ...initialEngine },
            pendingWindow: undefined,
            metricMap: {},
            snapshot: null,
            restoreAnchorAtExit: undefined,
            lastWindowDiag: undefined,
          }));
          return;
        }

        // For now, choose the first ACTIVE session as the "primary" one for the engine + snapshot.
        // Server already guarantees sessions are ACTIVE only.
        const primary = sessions[0];

        const engine: ShareSessionState = {
          ...initialEngine,
          status: "ACTIVE",
          cycleAnchorUtc: new Date(primary.cycleAnchorUtc).getTime(),
          segmentsExpected: primary.segmentsExpected ?? 0,
          segmentsSent: primary.segmentsSent ?? 0,
          lastSentDayIndex: primary.lastSentDayIndex ?? null,
        };

        set(() => ({
          // top-level session identity
          sessionId: primary.sessionId,
          postingId: primary.postingId,
          userId: primary.userId,
          segmentsExpected: primary.segmentsExpected,
          status: "ACTIVE",

          // planner/meta
          cycleAnchorUtc: primary.cycleAnchorUtc,
          originalCycleAnchorUtc: primary.cycleAnchorUtc,
          joinTimezone: primary.joinTimezone,
          joinTimeLocalISO: primary.joinTimeLocalISO,

          // engine and pending
          engine,
          pendingWindow: undefined,

          // metric map from backend (MetricCode → MetricId)
          metricMap: primary.metricMap as Partial<Record<MetricCode, number>>,

          // snapshot mirrors the session payload for UI / debug
          snapshot: {
            sessionId: primary.sessionId,
            postingId: primary.postingId,
            userId: primary.userId,
            statusCode: primary.statusCode,
            statusName: primary.statusName,
            segmentsExpected: primary.segmentsExpected,
            segmentsSent: primary.segmentsSent,
            lastSentDayIndex: primary.lastSentDayIndex,
            cycleAnchorUtc: primary.cycleAnchorUtc,
            joinTimeLocalISO: primary.joinTimeLocalISO,
            joinTimezone: primary.joinTimezone,
            lastUploadedAt: primary.lastUploadedAt,
            lastWindowFromUtc: primary.lastWindowFromUtc,
            lastWindowToUtc: primary.lastWindowToUtc,
          },

          // we leave rewards/dashboard as-is; they are managed by their own fetchers
          restoreAnchorAtExit: undefined,
          lastWindowDiag: undefined,
        }));
      },
    }),

    {
      name: STORE_NAME,
      version,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        ...basePartialize(s),
        dashboard: s.dashboard, // <-- persist dashboard too
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
              sessionId: s?.sessionId,
              status: s?.status,
              engine: s?.engine && {
                status: s.engine.status,
                mode: s.engine.mode,
                cycleAnchorUtc: s.engine.cycleAnchorUtc,
                lastSentDayIndex: s.engine.lastSentDayIndex,
                nextRetryAtUtc: s.engine.nextRetryAtUtc,
                noDataRetryCount: s.engine.noDataRetryCount,
                graceAppliedForDay: s.engine.graceAppliedForDay,
              },
              originalCycleAnchorUtc: s?.originalCycleAnchorUtc,
            });
          }

          // Backfill defaults for older persisted engines
          if (!s.engine.mode || typeof s.engine.simulationLock !== "boolean") {
            useShareStore.setState({
              engine: {
                ...s.engine,
                mode: s.engine.mode ?? "NORMAL",
                simulationLock:
                  typeof s.engine.simulationLock === "boolean"
                    ? s.engine.simulationLock
                    : false,
              },
            });
          }

          // If engine is ACTIVE but shareEnabled got lost (older versions), enable it.
          if (s.engine?.status === "ACTIVE" && s.shareEnabled !== true) {
            useShareStore.setState({ shareEnabled: true });
          }

          // If engine ACTIVE but missing meta, pause
          if (
            s.engine?.status === "ACTIVE" &&
            (!s.sessionId || !s.postingId || !s.userId || !s.cycleAnchorUtc)
          ) {
            useShareStore.setState({
              status: "PAUSED",
              engine: { ...s.engine, status: "PAUSED" },
            });
          }
        } catch (e: any) {
          console.warn(`${TAG} rehydrate → post-fix error`, e?.message ?? e);
        }
      },
    }
  )
);
export const isShareReady = () =>
  useShareStore.getState().shareEnabled === true;

/** Helper: hand a window to the engine and persist the updated engine state. */
async function tryProcessWindow(win: WindowRef) {
  const st = useShareStore.getState();
  const preEngine = { ...st.engine };
  const preSegmentsSent = preEngine.segmentsSent ?? 0;
  const preLastIdx = preEngine.lastSentDayIndex ?? null;

  if (__DEV__) {
    console.log(`${TAG} tryProcessWindow → start`, {
      dayIndex: win.dayIndex,
      fromUtc: win.fromUtc,
      toUtc: win.toUtc,
      eng: st.engine,
    });
  }

  const ctx = {
    sessionId: st.sessionId!,
    postingId: st.postingId!,
    userId: st.userId!,
    metricMap: st.metricMap as Record<MetricCode, number>,
  };

  try {
    // ⬇️ NEW: processDueWindow now returns { state, diag }
    const { state: nextState, diag } = await processDueWindow(
      win,
      ctx,
      st.engine
    );

    useShareStore.setState((s) => {
      const shouldDrop =
        nextState.status === "CANCELLED" ||
        nextState.status === "COMPLETE" ||
        (nextState.lastSentDayIndex != null &&
          nextState.lastSentDayIndex >= win.dayIndex);

      // Refresh session snapshot after processing
      try {
        const { userId, postingId } = useShareStore.getState();
        if (userId && postingId) {
          void useShareStore.getState().fetchSessionSnapshot(userId, postingId);
        }
      } catch (e) {
        if (__DEV__)
          console.warn("[ShareStore] post-window snapshot refresh failed", e);
      }

      if (__DEV__) {
        console.log(`${TAG} tryProcessWindow → done`, {
          dayIndex: win.dayIndex,
          updatedStatus: nextState.status,
          lastSentDayIndex: nextState.lastSentDayIndex,
          segmentsSent: nextState.segmentsSent,
          dropPending: shouldDrop,
          diag,
        });
      }

      return {
        engine: nextState,
        ...(shouldDrop ? { pendingWindow: undefined } : {}),
        ...(s.status !== nextState.status ? { status: nextState.status } : {}),
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
      };
    });

    // User notifications (lightweight toasts/alerts only when app is active)
    const after = useShareStore.getState();
    const afterEngine = after.engine;
    const postSegmentsSent = afterEngine?.segmentsSent ?? 0;

    const pid = after.postingId;
    if (pid != null) {
      // Fire per-day success only if the count increased and the processed day became (or is <=) the last sent
      if (
        postSegmentsSent > preSegmentsSent &&
        (afterEngine?.lastSentDayIndex ?? 0) >= win.dayIndex
      ) {
        try {
          await sendSegmentSuccess(pid, win.dayIndex);
        } catch {}
      }

      // Terminal states → one-shot notifications + backend sync
      if (after.status === "CANCELLED") {
        const diag = after.lastWindowDiag;
        const reason =
          (diag?.unavailable?.length ?? 0) > 0
            ? "Missing permission for some metrics."
            : diag?.hadAnyData
              ? "Sync stopped by system."
              : "No data found after multiple checks.";

        // NEW: attempt to sync auto-cancel to backend so server status matches engine
        try {
          let sid = after.sessionId;

          // Fallback resolver if sessionId is missing for some reason
          if (!sid && after.userId && pid != null) {
            try {
              const resolved = await getSessionByPosting(pid, after.userId);
              if (resolved) {
                sid = resolved.sessionId;
                if (__DEV__) {
                  console.log(
                    `${TAG} tryProcessWindow → auto cancel resolved sid=${sid}`
                  );
                }
              } else if (__DEV__) {
                console.warn(
                  `${TAG} tryProcessWindow → auto cancel resolver returned null`
                );
              }
            } catch (e: any) {
              if (__DEV__) {
                console.warn(
                  `${TAG} tryProcessWindow → auto cancel resolver error`,
                  e?.message ?? e
                );
              }
            }
          }

          if (sid) {
            try {
              const res = await cancelShareSession(sid);
              if (!res.ok) {
                if (__DEV__) {
                  console.warn(
                    `${TAG} tryProcessWindow → auto cancel backend error`,
                    res.error
                  );
                }
              } else if (__DEV__) {
                console.log(
                  `${TAG} tryProcessWindow → auto cancel synced to backend`,
                  { sessionId: sid, backendStatus: res.status }
                );
              }
            } catch (e: any) {
              if (__DEV__) {
                console.warn(
                  `${TAG} tryProcessWindow → auto cancel backend exception`,
                  e?.message ?? e
                );
              }
            }
          } else if (__DEV__) {
            console.warn(
              `${TAG} tryProcessWindow → auto cancel missing sessionId; backend not called`
            );
          }
        } finally {
          // Preserve existing behavior: always send the user-visible cancellation notification
          try {
            await sendSessionCancelled(pid, reason);
          } catch {}
        }

        return;
      } else if (after.status === "COMPLETE") {
        try {
          await sendSessionCompleted(pid);
        } catch {}
        return;
      }
    }

    // // Terminal statuses
    // if (after.status === "CANCELLED") {
    //   notifyInfo("No data after 3 checks. Sharing was cancelled.");
    //   return;
    // } else if (after.status === "COMPLETE") {
    //   notifyInfo("All segments sent. Sharing complete!");
    //   return;
    // }

    // Non-terminal diagnostic messages
    if (after.lastWindowDiag) {
      const { unavailable, zeroData, hadAnyData } = after.lastWindowDiag;

      // Permission/unavailable warning
      if (unavailable.length > 0) {
        const list = unavailable.map(labelOfMetric).join(", ");
        notifyInfo(
          `Not allowed to read: ${list}. Please grant Health permissions.`
        );
      }

      // Explicit “no data in window” message for specific metrics
      if (zeroData.length > 0) {
        const list = zeroData.map(labelOfMetric).join(", ");
        // If at least one metric had data, call it a partial sync; otherwise a no-data-yet info.
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
