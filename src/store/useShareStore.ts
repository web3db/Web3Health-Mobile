// src/store/useShareStore.ts
// Orchestrates Apply → session → planner+producer engine (real HC, mock HTTP uploader)
// with persisted state (AsyncStorage via zustand/middleware)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cancelShareSession, createSession, getSessionByPosting } from '@/src/services/sharing/api';

import {
  computeWindowForDayIndex,
  isWindowPastGrace,
  planCatchUpWindows,
  planDay0Window,
  planNextDueWindow,
  planSimulatedWindow,
  type PlannerContext,
} from '@/src/services/sharing/planner';

import { processDueWindow } from '@/src/services/sharing/producer';
import type { MetricCode } from '@/src/services/sharing/summarizer';

import {
  ensureInitialized,
  getLocalTimezoneInfo,
  requestAllReadPermissions,
} from '@/src/services/tracking/healthconnect';

import { testFlags } from '@/src/config/featureFlags';
import { GRACE_WAIT_MS, getShareRuntimeConfig } from '@/src/services/sharing/constants';
import type { ShareSessionState, ShareStatus } from '@/src/services/sharing/types';

const TAG = '[SHARE][Store]';

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
  cycleAnchorUtc?: string;     // UTC ISO string for planner
  originalCycleAnchorUtc?: string; // UTC ISO string at session start (for Test Mode)
  joinTimezone?: string;       // 'America/New_York'
  joinTimeLocalISO?: string;   // local ISO with offset at join

  // engine state (persisted) — mirrors ShareSessionState
  engine: ShareSessionState;

  // ephemeral (not persisted)
  pendingWindow?: WindowRef;

  // metric map (MetricCode -> MetricId)
  metricMap: Partial<Record<MetricCode, number>>;

  // actions
  startSession: (
    postingId: number,
    userId: number,
    metricMap: Partial<Record<MetricCode, number>>,
    segmentsExpected?: number
  ) => Promise<void>;

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
};

const nowISO = () => new Date().toISOString();
const nowMs = () => Date.now();

/** Build UTC ISO for local midnight using the offset embedded in joinLocalISO. */
function localMidnightUTCFromJoinLocalISO(joinLocalISO: string): string {
  const datePart = joinLocalISO.slice(0, 10); // 'YYYY-MM-DD'
  const plus = joinLocalISO.lastIndexOf('+');
  const minus = joinLocalISO.lastIndexOf('-');
  const offIdx = Math.max(plus, minus);
  const offset = offIdx > 10 ? joinLocalISO.slice(offIdx) : 'Z';
  return new Date(`${datePart}T00:00:00${offset}`).toISOString();
}

function notifyInfo(message: string) {
  const isActive = AppState.currentState === 'active';
  if (!isActive) return;

  if (Platform.OS === 'android') {
    try {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } catch {
      try { Alert.alert('', message); } catch { }
    }
  } else {
    try { Alert.alert('', message); } catch { }
  }
}

// NOTE: ShareSessionState.cycleAnchorUtc is a NUMBER (ms) by design.
// We keep planner-facing cycleAnchorUtc (string ISO) separately.
const initialEngine: ShareSessionState = {
  status: 'PAUSED',
  mode: 'NORMAL',
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

const STORE_NAME = 'share-store-v2';

const partialize = (s: StoreState): Partial<StoreState> => ({
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
});

const version = 2; // bump when changing migrate()
const migrate = (persisted: any, _from: number): any => {
  if (persisted?.engine) {
    if (typeof persisted.engine.cycleAnchorUtc !== 'number') {
      const parsed = Number(persisted.engine.cycleAnchorUtc);
      persisted.engine.cycleAnchorUtc = isNaN(parsed) ? Date.now() : parsed;
    }
    if (
      persisted.engine.nextRetryAtUtc != null &&
      typeof persisted.engine.nextRetryAtUtc !== 'number'
    ) {
      const parsed = Number(persisted.engine.nextRetryAtUtc);
      persisted.engine.nextRetryAtUtc = isNaN(parsed) ? null : parsed;
    }
    if (!persisted.engine.mode) persisted.engine.mode = 'NORMAL';
    if (typeof persisted.engine.simulationLock !== 'boolean') {
      persisted.engine.simulationLock = false;
    }
    if (typeof persisted.engine.segmentsExpected !== 'number') {
      // fall back to top-level segmentsExpected if present, else 0
      persisted.engine.segmentsExpected = typeof persisted.segmentsExpected === 'number'
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
      status: 'PAUSED',
      metricMap: {},
      engine: { ...initialEngine },

      async startSession(postingId, userId, metricMap, segmentsExpected) {
        try {
          console.log(TAG, 'startSession → begin', { postingId, userId, segmentsExpected, metricMap });

          // One-time config banner (shows Test Mode & timings)
          if (!(global as any).__SHARE_CONFIG_LOGGED__) {
            (global as any).__SHARE_CONFIG_LOGGED__ = true;
            console.log('[SHARE][Config]', getShareRuntimeConfig());
            if (testFlags.TEST_MODE) {
              console.warn('[SHARE][TestMode] ENABLED — backdated anchor simulations allowed.');
            }
          }

          // Init HC + permissions
          await ensureInitialized();
          await requestAllReadPermissions();

          // Build local ISO with device offset (used by Day-0 logic)
          const tz = getLocalTimezoneInfo();
          const now = new Date();
          const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .replace('Z', tz.offsetStr.replace('UTC', ''));

          // Try to reuse an existing ACTIVE session for (postingId, userId) before creating a new one
          try {
            const resolved = await getSessionByPosting(postingId, userId);
            if (resolved && resolved.source === 'ACTIVE') {
              const eng: ShareSessionState = {
                ...initialEngine,
                status: 'ACTIVE',
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
                status: 'ACTIVE',

                // Planner-facing ISO anchor (we don't get anchor from resolver; use now for UI/planner)
                cycleAnchorUtc: new Date().toISOString(),
                originalCycleAnchorUtc: new Date().toISOString(),
                joinTimezone: tz.iana || 'Local',
                joinTimeLocalISO: localIso,

                engine: eng,
              });

              if (__DEV__) {
                console.log(TAG, 'startSession → reused ACTIVE session', {
                  sessionId: resolved.sessionId,
                  segmentsExpected: eng.segmentsExpected,
                  segmentsSent: eng.segmentsSent,
                });
              }

              // Continue with normal Day-0 behavior (no grace)
              await get().sendFirstSegment();
              return;
            }
          } catch (e) {
            if (__DEV__) console.warn(`${TAG} resolver lookup failed — proceeding to create`, e);
          }

          // Create server session (stores cycleAnchorUtc + join local ISO)
          const sess = await createSession(postingId, userId, {
            segmentsExpected,
            joinTimeLocalISO: localIso,
            joinTimezone: tz.iana || 'Local',
            cycleAnchorUtc: new Date().toISOString(),
          });

          // Seed engine state
          const eng: ShareSessionState = {
            status: 'ACTIVE',
            mode: 'NORMAL',
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
            status: 'ACTIVE',

            cycleAnchorUtc: sess.cycleAnchorUtc, // ISO for planner
            originalCycleAnchorUtc: sess.cycleAnchorUtc,
            joinTimezone: sess.joinTimezone,
            joinTimeLocalISO: sess.joinTimeLocalISO,

            engine: eng,
          });

          console.log(TAG, 'startSession →', {
            sessionId: sess.sessionId,
            postingId,
            userId,
            segmentsExpected: sess.segmentsExpected,
            cycleAnchorUtc: sess.cycleAnchorUtc,
            joinTimezone: sess.joinTimezone,
            joinTimeLocalISO: sess.joinTimeLocalISO,
          });

          // Optionally kick Day-0 immediately
          await get().sendFirstSegment();
        } catch (e: any) {
          console.log(TAG, 'startSession error', e?.message ?? e, e);
          notifyInfo(String(e?.message ?? e));
        }
      },

      async sendFirstSegment() {
        const st = get();
        if (!st.sessionId || !st.postingId || !st.userId || !st.cycleAnchorUtc || !st.joinTimeLocalISO) return;

        // In SIM mode: Day-0 is driven by simulateNextDay; do nothing here.
        if (st.engine.mode === 'SIM') {
          if (__DEV__) console.log(`${TAG} sendFirstSegment → passive (SIM mode)`);
          return;
        }

        //  Test Mode Day-0 controls
        if (testFlags.TEST_MODE && testFlags.TEST_FORCE_SKIP_DAY0) {
          if (__DEV__) console.log(`${TAG} sendFirstSegment → TEST: skipping Day-0`);
          return;
        }

        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO,
          joinTimezone: st.joinTimezone || 'Local',
          cycleAnchorUtc: st.cycleAnchorUtc,
          segmentsExpected: st.segmentsExpected ?? 0,
          alreadySentDayIndices: [],
          mode: 'NORMAL',
        };

        // Day-0 probe using a “fast” metric if available (real data only)
        const want = st.metricMap as Partial<Record<MetricCode, number>>;
        const probeMetric: MetricCode | undefined =
          (want.STEPS ? 'STEPS' :
            want.KCAL ? 'KCAL' :
              want.DISTANCE ? 'DISTANCE' :
                want.FLOORS ? 'FLOORS' :
                  want.HR ? 'HR' :
                    want.SLEEP ? 'SLEEP' :
                      undefined);

        let hasDay0Data = false;
        try {
          if (probeMetric) {
            const midnightLocalUtcISO = localMidnightUTCFromJoinLocalISO(st.joinTimeLocalISO!);
            const probe = await import('@/src/services/sharing/summarizer').then((m) =>
              m.summarizeWindow(probeMetric, midnightLocalUtcISO, st.cycleAnchorUtc!, { probeOnly: true })
            );
            hasDay0Data = !!probe;

            if (__DEV__) {
              console.log('[SHARE][Store] Day0 probe', {
                probeMetric,
                midnightLocalUtcISO,
                joinUtc: st.cycleAnchorUtc,
                hasDay0Data,
              });
            }
          }
        } catch (e: any) {
          console.warn(`${TAG} sendFirstSegment → probe error`, e?.message ?? e);
        }

        const day0 = planDay0Window(ctx, hasDay0Data || (testFlags.TEST_MODE && testFlags.TEST_FORCE_DAY0));
        if (!day0) return;

        // Day-0 should be sent immediately (no grace)
        set(() => ({ pendingWindow: day0 }));
        await tryProcessWindow(day0);
      },

      async sendNextIfDue() {
        const st = get();
        if (!st.sessionId || st.status !== 'ACTIVE') return;

        // In SIM mode we are passive.
        if (st.engine.mode === 'SIM') {
          if (__DEV__) console.log(`${TAG} sendNextIfDue → passive (SIM mode)`);
          return;
        }

        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO!,
          joinTimezone: st.joinTimezone || 'Local',
          cycleAnchorUtc: st.cycleAnchorUtc!,
          segmentsExpected: st.segmentsExpected ?? 0,
          alreadySentDayIndices: st.engine.lastSentDayIndex != null ? [st.engine.lastSentDayIndex] : [],
          mode: 'NORMAL',
        };

        const win = planNextDueWindow(ctx, nowISO());
        if (!win) return;

        // Grace on first see of a new day (only if not already applied)
        const alreadyAppliedFor = get().engine.graceAppliedForDay;
        const pastGrace = isWindowPastGrace(win.toUtc, nowISO());

        if (!pastGrace && GRACE_WAIT_MS > 0 && alreadyAppliedFor !== win.dayIndex) {
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
        set({ pendingWindow: win });
        await tryProcessWindow(win);
      },

      async catchUpIfNeeded() {
        const st = get();
        if (!st.sessionId || st.status !== 'ACTIVE') return;

        if (st.engine.mode === 'SIM') {
          if (__DEV__) console.log(`${TAG} catchUpIfNeeded → passive (SIM mode)`);
          return;
        }

        const last = st.engine.lastSentDayIndex ?? 0;

        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO!,
          joinTimezone: st.joinTimezone || 'Local',
          cycleAnchorUtc: st.cycleAnchorUtc!,
          segmentsExpected: st.segmentsExpected ?? 0,
          alreadySentDayIndices: [last],
          lastSentDayIndex: last,
          mode: 'NORMAL',
        };

        const windows = planCatchUpWindows(ctx, last, nowISO());
        for (const win of windows) {
          await tryProcessWindow(win);
          const cur = get();
          if (cur.status !== 'ACTIVE') break; // CANCELLED/COMPLETE stops catch-up
        }
      },

      // Call this on focus + short interval (e.g., 5s in DEV, 60s in PROD)
      async tick() {
        const st = get();
        if (__DEV__) console.log(`${TAG} tick → engine gate`, { status: st.engine.status, storeStatus: st.status });

        if (!st.sessionId) return;

        // Mirror engine status to store status and stop if terminal
        if (st.engine.status === 'CANCELLED' || st.engine.status === 'COMPLETE' || st.status !== 'ACTIVE') {
          if (st.status !== st.engine.status) set({ status: st.engine.status });
          if (__DEV__) console.log(`${TAG} tick → stopping`, { engineStatus: st.engine.status });
          return;
        }

        // SIM mode: passive; the dev button will drive simulateNextDay()
        if (st.engine.mode === 'SIM') {
          if (__DEV__) console.log(`${TAG} tick → passive (SIM mode)`);
          return;
        }

        const now = Date.now();
        const eng = st.engine;

        // 1) If we’re already working a due day, handle grace/retry locally
        if (eng.currentDueDayIndex != null) {
          if (eng.nextRetryAtUtc && now < eng.nextRetryAtUtc) {
            if (__DEV__) console.log(`${TAG} tick → waiting`, { nextRetryAt: eng.nextRetryAtUtc });
            return; // waiting
          }

          const pw = st.pendingWindow;
          const win: WindowRef = (pw && pw.dayIndex === eng.currentDueDayIndex)
            ? pw
            : (() => {
              const { fromUtc, toUtc } = computeWindowForDayIndex(st.cycleAnchorUtc!, eng.currentDueDayIndex);
              if (__DEV__) console.log(`${TAG} tick → new window`, { dayIndex: eng.currentDueDayIndex, fromUtc, toUtc });
              return { dayIndex: eng.currentDueDayIndex, fromUtc, toUtc };
            })();

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
          console.warn(`${TAG} setBackdatedAnchorTestOnly ignored — not in Test Mode.`);
          return;
        }
        try {
          const ms = new Date(anchorIsoUtc).getTime();
          if (!Number.isFinite(ms)) {
            console.warn(`${TAG} setBackdatedAnchorTestOnly invalid ISO`, anchorIsoUtc);
            return;
          }
          set((s) => ({
            cycleAnchorUtc: anchorIsoUtc,       // planner ISO
            engine: {
              ...s.engine,
              cycleAnchorUtc: ms,               // engine numeric
              currentDueDayIndex: null,         // reset per-day state
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
          console.warn(`${TAG} setBackdatedAnchorTestOnly error`, e?.message ?? e);
        }
      },

      // ── Simulation controls (used by UI in opportunities/[id].tsx) ─────────
      enterSimulation() {
        const st = get();
        if (!testFlags.TEST_MODE) {
          console.warn(`${TAG} enterSimulation ignored — not in Test Mode.`);
          return;
        }
        if (st.engine.mode === 'SIM') return;

        set((s) => ({
          engine: {
            ...s.engine,
            mode: 'SIM',
            simulationLock: false,
            restoreAnchorAtExit: s.engine.cycleAnchorUtc, // remember real anchor ms
            currentDueDayIndex: null,
            noDataRetryCount: 0,
            nextRetryAtUtc: null,
            graceAppliedForDay: null,
          },
          pendingWindow: undefined,
        }));
        if (__DEV__) console.log(`${TAG} enterSimulation → mode=SIM`);
      },

      async simulateNextDay() {
        const st = get();
        if (!testFlags.TEST_MODE) return;
        if (st.engine.mode !== 'SIM') {
          console.warn(`${TAG} simulateNextDay ignored — mode != SIM`);
          return;
        }
        // Store-wide inactive — also bail
        if (st.status !== 'ACTIVE') {
          if (__DEV__) console.log(`${TAG} simulateNextDay → store not ACTIVE (status=${st.status})`);
          return;
        }
        // If engine already finished/cancelled, bail out (keeps union for later checks)
        if (st.engine.status !== 'ACTIVE') {
          if (__DEV__) console.log(`${TAG} simulateNextDay → nothing to do (engineStatus=${st.engine.status})`);
          return;
        }
        // Store-wide inactive — also bail
        if (st.status !== 'ACTIVE') {
          if (__DEV__) console.log(`${TAG} simulateNextDay → store not ACTIVE (status=${st.status})`);
          return;
        }
        if (!st.sessionId || !st.postingId || !st.userId || !st.cycleAnchorUtc) return;

        // Do not run while in a backoff/grace wait
        if (st.engine.nextRetryAtUtc && nowMs() < st.engine.nextRetryAtUtc) {
          if (__DEV__) console.log(`${TAG} simulateNextDay → waiting backoff/grace`);
          return;
        }

        const segmentsExpected = st.segmentsExpected ?? 0;
        const nextIdx = (st.engine.lastSentDayIndex ?? -1) + 1;

        //  extra safety: stop when all segments are sent or nextIdx exceeds expected
        if (
          (segmentsExpected > 0 && (st.engine.segmentsSent ?? 0) >= segmentsExpected) ||
          nextIdx > segmentsExpected
        ) {
          if (__DEV__) console.log(`${TAG} simulateNextDay → nothing to do (all segments sent)`);
          return;
        }



        // Use the immutable anchor captured at startSession (fallback to current if missing)
        const baseIso = st.originalCycleAnchorUtc ?? st.cycleAnchorUtc;
        if (!baseIso) {
          console.warn(`${TAG} simulateNextDay → no baseIso available (missing originalCycleAnchorUtc/cycleAnchorUtc)`);
          return;
        }

        // Compute exact simulated window from immutable base (passive w.r.t. "now")
        const ctx: PlannerContext = {
          joinTimeLocalISO: st.joinTimeLocalISO!,
          joinTimezone: st.joinTimezone || 'Local',
          cycleAnchorUtc: baseIso,           // <— CHANGED: pass immutable T₀
          segmentsExpected,
          alreadySentDayIndices: st.engine.lastSentDayIndex != null ? [st.engine.lastSentDayIndex] : [],
          lastSentDayIndex: st.engine.lastSentDayIndex ?? null, //
          mode: 'SIM',
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
        if (st.engine.mode !== 'SIM') return;

        set((s) => ({
          engine: {
            ...s.engine,
            mode: 'NORMAL',
            simulationLock: false,
            // Restore the real anchor if we had saved it; otherwise keep current
            cycleAnchorUtc: s.engine.restoreAnchorAtExit ?? s.engine.cycleAnchorUtc,
            restoreAnchorAtExit: undefined,
            currentDueDayIndex: null,
            noDataRetryCount: 0,
            nextRetryAtUtc: null,
            graceAppliedForDay: null,
          },
          pendingWindow: undefined,
        }));
        if (__DEV__) console.log(`${TAG} exitSimulation → mode=NORMAL`);
      },

      async cancelCurrentSession() {
        const st = get();

        // Must know which (posting,user) to resolve a session for
        if (!st.postingId || !st.userId) {
          if (__DEV__) console.log(`${TAG} cancelCurrentSession → missing postingId/userId`);
          notifyInfo('Nothing to cancel.');
          return;
        }

        // Resolve a sessionId if not present in store
        let sid = st.sessionId;
        if (!sid) {
          try {
            const resolved = await getSessionByPosting(st.postingId, st.userId);
            if (!resolved) {
              notifyInfo('No session found to cancel.');
              return;
            }
            sid = resolved.sessionId;
            if (__DEV__) console.log(`${TAG} cancelCurrentSession → resolved sid=${sid}`);
          } catch (e: any) {
            if (__DEV__) console.warn(`${TAG} cancelCurrentSession resolver error`, e?.message ?? e);
            notifyInfo('Unable to resolve session to cancel.');
            return;
          }
        }

        try {
          const res = await cancelShareSession(sid!);

          // Server says: cannot cancel because it's already COMPLETED
          if (!res.ok && res.error === 'COMPLETED') {
            set((s) => ({
              status: 'COMPLETE',
              engine: { ...s.engine, status: 'COMPLETE', currentDueDayIndex: null, nextRetryAtUtc: null, graceAppliedForDay: null },
              pendingWindow: undefined,
            }));
            notifyInfo('Session already completed.');
            return;
          }

          // Success → mark as CANCELLED locally and clear any pending work
          if (res.ok && res.status === 'CANCELLED') {
            set((s) => ({
              status: 'CANCELLED',
              engine: { ...s.engine, status: 'CANCELLED', currentDueDayIndex: null, nextRetryAtUtc: null, graceAppliedForDay: null },
              pendingWindow: undefined,
            }));
            notifyInfo('Sharing cancelled.');
            return;
          }

          // Fallback: unexpected ACTIVE response or generic failure
          if (!res.ok) {
            if (__DEV__) console.warn(`${TAG} cancelCurrentSession → api error`, res.error);
            notifyInfo('Could not cancel the session. Please try again.');
          }
        } catch (e: any) {
          if (__DEV__) console.warn(`${TAG} cancelCurrentSession error`, e?.message ?? e);
          notifyInfo('Cancel failed. Please try again.');
        }
      },

    }),

    {
      name: STORE_NAME,
      version,
      storage: createJSONStorage(() => AsyncStorage),
      partialize,
      migrate,
      onRehydrateStorage: () => (_rehydratedState, error) => {
        if (error) {
          console.warn(`${TAG} rehydrate error`, error);
          return;
        }

        try {
          const s = useShareStore.getState();
          if (__DEV__) {
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

          if (
            s.engine?.status === 'ACTIVE' &&
            (!s.sessionId || !s.postingId || !s.userId || !s.cycleAnchorUtc)
          ) {
            console.warn(`${TAG} rehydrate → missing meta for ACTIVE engine; pausing engine`);
            useShareStore.setState({
              status: 'PAUSED' as ShareStatus,
              engine: { ...s.engine, status: 'PAUSED' as ShareStatus },
            });
          }

          // Backfill defaults if older persisted engine lacks them
          if (!s.engine.mode || typeof s.engine.simulationLock !== 'boolean') {
            useShareStore.setState({
              engine: {
                ...s.engine,
                mode: s.engine.mode ?? 'NORMAL',
                simulationLock: typeof s.engine.simulationLock === 'boolean' ? s.engine.simulationLock : false,
              },
            });
          }
        } catch (e: any) {
          console.warn(`${TAG} rehydrate → post-fix error`, e?.message ?? e);
        }
      },
    }
  )
);

/** Helper: hand a window to the engine and persist the updated engine state. */
async function tryProcessWindow(win: WindowRef) {
  const st = useShareStore.getState();

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
    const updated = await processDueWindow(win, ctx, st.engine);

    useShareStore.setState((s) => {
      const shouldDrop =
        updated.status === 'CANCELLED' ||
        updated.status === 'COMPLETE' ||
        (updated.lastSentDayIndex != null && updated.lastSentDayIndex >= win.dayIndex);

      if (__DEV__) {
        console.log(`${TAG} tryProcessWindow → done`, {
          dayIndex: win.dayIndex,
          updatedStatus: updated.status,
          lastSentDayIndex: updated.lastSentDayIndex,
          segmentsSent: updated.segmentsSent,
          dropPending: shouldDrop,
        });
      }

      return {
        engine: updated,
        ...(shouldDrop ? { pendingWindow: undefined } : {}),
        ...(s.status !== updated.status ? { status: updated.status } : {}),
      };
    });

    const after = useShareStore.getState();
    if (after.status === 'CANCELLED') {
      notifyInfo('No data after 3 checks. Sharing was cancelled.');
    } else if (after.status === 'COMPLETE') {
      notifyInfo('All segments sent. Sharing complete!');
    }

  } catch (e: any) {
    console.warn(`${TAG} tryProcessWindow → error`, e?.message ?? e, e);
  }
}
