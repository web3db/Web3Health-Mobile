// src/background/shareTask.ts
import { ensureInitialized } from "@/src/services/tracking/healthconnect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { getSessionByPosting } from "@/src/services/sharing/api";
// import { checkMetricPermissionsForMap } from "@/src/services/sharing/summarizer";
import { isShareReady, useShareStore } from "@/src/store/useShareStore";

import {
  ensureNotifPermission,
  sendOpenAppNudge,
} from "@/src/services/notifications";
import { getShareRuntimeConfig } from "@/src/services/sharing/constants";

export const SHARE_BG_TASK = "SHARE_BACKGROUND_TICK";
// export const SHARE_BG_TASK = "edu.uga.sensorweb.web3health.share-bg";

// Breadcrumb keys
// const KEY_LAST_RUN = 'bg.lastRunAt';
// const KEY_SEGMENTS = 'bg.segmentsSent';
// // NEW nudge keys + thresholds
// const KEY_LAST_NUDGE = 'bg.lastNudgeAt';
const STALE_MS = 24 * 60 * 60 * 1000; // 24h
const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h

export const KEY_LAST_RUN = "bg.lastRunAt";
export const KEY_SEGMENTS = "bg.segmentsSent";
export const KEY_LAST_NUDGE = "bg.lastNudgeAt";
export const KEY_LAST_SNAPSHOT = "bg.lastSnapshotJson";

async function maybeNudgeIfStale(now = Date.now()) {
  const lastRunISO = await AsyncStorage.getItem(KEY_LAST_RUN);
  const lastRun = lastRunISO ? Date.parse(lastRunISO) : undefined;

  const lastNudgeISO = await AsyncStorage.getItem(KEY_LAST_NUDGE);
  const lastNudge = lastNudgeISO ? Date.parse(lastNudgeISO) : 0;

  const isStale = !lastRun || now - lastRun >= STALE_MS;
  const cooledDown = now - lastNudge >= NUDGE_COOLDOWN_MS;
  if (!isStale || !cooledDown) return;

  // Optional: be smarter near the end of the current window
  const { DAY_LENGTH_MS } = getShareRuntimeConfig();
  const dayStart = Math.floor(now / DAY_LENGTH_MS) * DAY_LENGTH_MS;
  const millisIntoDay = now - dayStart;
  const nearEnd = millisIntoDay > DAY_LENGTH_MS * 0.9;

  const allowed = await ensureNotifPermission();
  if (!allowed) return;

  const body = nearEnd
    ? "Today’s sharing window is ending soon. Open Web3Health to sync now."
    : "Open Web3Health to sync your data. Your sharing session needs an app open to catch up.";

  await sendOpenAppNudge("Open Web3Health to sync", body);
  await AsyncStorage.setItem(KEY_LAST_NUDGE, new Date(now).toISOString());

  if (__DEV__)
    console.log("[BG] nudge sent (stale/cooldown/nearEnd):", {
      isStale,
      cooledDown,
      nearEnd,
    });
}

// --- wait for hydration ---
async function waitForShareStoreHydration(timeoutMs = 2500) {
  const p = (useShareStore as any)?.persist;
  if (p?.hasHydrated?.()) return;
  await new Promise<void>((resolve) => {
    const off = p?.onFinishHydration?.(() => {
      off?.();
      resolve();
    });
    setTimeout(() => {
      off?.();
      resolve();
    }, timeoutMs);
  });
}

// --- Snapshot util for breadcrumbs ---
async function writeBgSnapshot(label: string, extra: Record<string, any> = {}) {
  try {
    const s = useShareStore.getState();
    const eng = s.engine;
    const snap = {
      at: new Date().toISOString(),
      label,
      ready: isShareReady(),
      storeStatus: s.status,
      sessionId: s.sessionId ?? null,
      postingId: s.postingId ?? null,
      userId: s.userId ?? null,
      segmentsExpected: s.segmentsExpected ?? 0,
      metricMapKeys: Object.keys(s.metricMap ?? {}),
      lastDiag: s.lastWindowDiag ?? null,
      engine: eng && {
        status: eng.status,
        mode: eng.mode,
        cycleAnchorUtc: eng.cycleAnchorUtc,
        lastSentDayIndex: eng.lastSentDayIndex,
        segmentsSent: eng.segmentsSent,
        currentDueDayIndex: eng.currentDueDayIndex,
        noDataRetryCount: eng.noDataRetryCount,
        nextRetryAtUtc: eng.nextRetryAtUtc,
        graceAppliedForDay: eng.graceAppliedForDay,
      },
      ...extra,
    };
    await AsyncStorage.setItem(KEY_LAST_SNAPSHOT, JSON.stringify(snap));
    if (__DEV__) console.log("[BG] snapshot", snap);
  } catch {}
}

// MUST be module scope
TaskManager.defineTask(SHARE_BG_TASK, async () => {
  try {
    if (Platform.OS === "android") {
      try {
        await ensureInitialized();
      } catch (e) {
        if (__DEV__) console.log("[BG] ensureInitialized (android) failed", e);
      }
    }

    // Ensure store is hydrated before reading values
    await waitForShareStoreHydration();

    // Initial breadcrumbs
    const nowISO = new Date().toISOString();
    await AsyncStorage.setItem(KEY_LAST_RUN, nowISO);

    // Snapshot (pre-flight)
    await writeBgSnapshot("preflight");

    const s = useShareStore.getState();

    // Optional: if sessionId missing but we have postingId+userId, try resolver once
    if (!s.sessionId && s.postingId && s.userId) {
      try {
        const resolved = await getSessionByPosting(s.postingId, s.userId);
        if (resolved && resolved.sessionId) {
          useShareStore.setState((prev) => ({
            sessionId: resolved.sessionId,
            segmentsExpected: Number(
              resolved.segmentsExpected ?? prev.segmentsExpected ?? 0
            ),
            status: "ACTIVE",
            engine: { ...prev.engine, status: "ACTIVE" },

            // Optional (only if missing); safe defaults
            cycleAnchorUtc: prev.cycleAnchorUtc ?? new Date().toISOString(),
            originalCycleAnchorUtc:
              prev.originalCycleAnchorUtc ?? new Date().toISOString(),
          }));

          // Pull canonical server snapshot so planner uses server truth in this same run
          await useShareStore
            .getState()
            .fetchSessionSnapshot(
              useShareStore.getState().userId!,
              useShareStore.getState().postingId!
            );

          // Align planner anchors to the canonical server anchor right away
          {
            const snap = useShareStore.getState().snapshot;
            if (snap?.cycleAnchorUtc) {
              useShareStore.setState((prev) => ({
                cycleAnchorUtc: snap.cycleAnchorUtc, // planner ISO used by planner/tick
                engine: {
                  ...prev.engine,
                  // engine.cycleAnchorUtc is stored in ms (number)
                  cycleAnchorUtc: new Date(snap.cycleAnchorUtc).getTime(),
                },
              }));
              if (typeof snap?.segmentsExpected === "number") {
                useShareStore.setState((prev) => ({
                  segmentsExpected: snap.segmentsExpected,
                  engine: {
                    ...prev.engine,
                    segmentsExpected: snap.segmentsExpected,
                  },
                }));
              }
            }
          }

          if (__DEV__)
            console.log(
              "[BG] session resolved via resolver",
              resolved.sessionId
            );
        }
      } catch (e) {
        if (__DEV__) console.log("[BG] resolver failed (non-fatal)", e);
      }
    }

    // Re-read after possible resolver update
    const st = useShareStore.getState();

    // Gate: no ACTIVE session or readiness
    const active =
      !!st.sessionId &&
      st.status === "ACTIVE" &&
      st.engine?.status === "ACTIVE";
    const ready = isShareReady();

    const mode = st.engine?.mode;
    if (mode !== "NORMAL") {
      await writeBgSnapshot("skip-non-normal", { mode });
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Quick health + metric gate to avoid “idle” runs
    const metricKeys = Object.keys(st.metricMap ?? {});

    const healthPlatform =
      (st as any).healthPlatform ?? (Platform.OS === "ios" ? "ios" : "android");
    const healthAvailable = (st as any).healthAvailable ?? true;
    const healthGranted = (st as any).healthGranted ?? true;

    // Write a decision snapshot
    await writeBgSnapshot("gate", {
      active,
      ready,
      metricKeysCount: metricKeys.length,
      healthPlatform,
      healthAvailable,
      healthGranted,
    });

    if (!active || !ready) {
      if (__DEV__)
        console.log("[BG] skip: inactive or not ready", { active, ready });
      await AsyncStorage.setItem(
        KEY_SEGMENTS,
        String(st.engine?.segmentsSent ?? 0)
      );
      await maybeNudgeIfStale(Date.parse(nowISO));
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Short-circuit if health platform isn’t usable or we have nothing mapped to share.
    if (
      (healthPlatform === "ios" || healthPlatform === "android") &&
      (!healthAvailable || !healthGranted || metricKeys.length === 0)
    ) {
      if (__DEV__)
        console.log(
          "[BG] skip: missing health availability/permissions or metric map",
          {
            healthPlatform,
            healthAvailable,
            healthGranted,
            metricKeysCount: metricKeys.length,
          }
        );

      await AsyncStorage.setItem(
        KEY_SEGMENTS,
        String(st.engine?.segmentsSent ?? 0)
      );
      await writeBgSnapshot("health-missing", {
        healthPlatform,
        healthAvailable,
        healthGranted,
      });
      await maybeNudgeIfStale(Date.parse(nowISO));
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Proceed to tick + sweep backlog (handles multiple overdue days)
    const before = st.engine?.segmentsSent ?? 0;
    if (__DEV__) console.log("[BG] tick() start", { before });

    await st.tick();
    await useShareStore.getState().catchUpIfNeeded(); // ensure we process all due windows

    const after = useShareStore.getState().engine?.segmentsSent ?? 0;
    if (__DEV__)
      console.log("[BG] tick() done", { after, changed: after > before });

    await AsyncStorage.setItem(KEY_SEGMENTS, String(after));
    await writeBgSnapshot("post-tick", {
      before,
      after,
      changed: after > before,
    });

    // Refresh server snapshot so UI shows the latest timing on next launch
    {
      const stateAfter = useShareStore.getState();
      if (stateAfter.userId && stateAfter.postingId) {
        void stateAfter.fetchSessionSnapshot(
          stateAfter.userId,
          stateAfter.postingId
        );
      }
    }

    // If still stale, consider nudging
    await maybeNudgeIfStale(Date.parse(nowISO));

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e: any) {
    console.warn("[BG] task error:", e?.message ?? e);
    await writeBgSnapshot("error", { error: String(e?.message ?? e) });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }

  //   if (!s.sessionId || s.status !== 'ACTIVE') {
  //     if (__DEV__) console.log('[BG] skip: no active session');
  //     await AsyncStorage.setItem(KEY_LAST_RUN, nowISO);
  //     await AsyncStorage.setItem(KEY_SEGMENTS, String(s.engine?.segmentsSent ?? 0));
  //     // Even when inactive, consider nudging if somehow very stale (rare, but harmless)
  //     await maybeNudgeIfStale(Date.parse(nowISO));
  //     return BackgroundTask.BackgroundTaskResult.Success;
  //   }

  //   const before = s.engine?.segmentsSent ?? 0;
  //   if (__DEV__) console.log('[BG] tick() start', { before });

  //   await s.tick();

  //   const after = useShareStore.getState().engine?.segmentsSent ?? 0;

  //   if (__DEV__) console.log('[BG] tick() done', { after, changed: after > before });

  //   // Write breadcrumbs
  //   await AsyncStorage.setItem(KEY_LAST_RUN, nowISO);
  //   await AsyncStorage.setItem(KEY_SEGMENTS, String(after));

  //   // If we *still* look stale (e.g., tick did nothing), consider a nudge
  //   await maybeNudgeIfStale(Date.parse(nowISO));

  //   return BackgroundTask.BackgroundTaskResult.Success;
  // } catch (e: any) {
  //   console.warn('[BG] task error:', e?.message ?? e);
  //   return BackgroundTask.BackgroundTaskResult.Failed;
  // }
});

export async function registerShareBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (__DEV__) {
      const map = BackgroundTask.BackgroundTaskStatus as any;
      const statusName =
        Object.keys(map).find((k) => map[k] === status) ?? String(status);
      console.log("[BG] getStatusAsync →", status, `(${statusName})`);
    }
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      console.warn(
        "[BG] Background task not available; relying on foreground polling."
      );
      return;
    }

    const already = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
    if (already) {
      if (__DEV__) console.log("[BG] task already registered");
      return;
    }

    await BackgroundTask.registerTaskAsync(SHARE_BG_TASK, {
      minimumInterval: __DEV__ ? 15 : 30, // minutes; OS treats as minimum
    });

    if (__DEV__) console.log("[BG] registerTaskAsync → success");
  } catch (e: any) {
    console.warn("[BG] registerTaskAsync → error:", e?.message ?? e);
    throw e;
  }
}

export async function unregisterShareBackgroundTask() {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
    if (already) {
      await BackgroundTask.unregisterTaskAsync(SHARE_BG_TASK);
      if (__DEV__) console.log("[BG] unregisterTaskAsync → success");
    }
  } catch (e: any) {
    console.warn(
      "[BG] unregisterShareBackgroundTask → error:",
      e?.message ?? e
    );
  }
}

// DEV-only helper to force immediate run (Android dev client supported)
export async function triggerShareBackgroundTaskForTesting() {
  if (!__DEV__) return;
  try {
    await BackgroundTask.triggerTaskWorkerForTestingAsync();
    console.log("[BG] triggerTaskWorkerForTestingAsync → invoked");
  } catch (e: any) {
    console.warn(
      "[BG] triggerTaskWorkerForTestingAsync → error:",
      e?.message ?? e
    );
  }
}
