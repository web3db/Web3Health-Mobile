// src/background/shareTask.ts
import { getSessionSnapshot } from "@/src/services/sharing/api";
import { ensureInitialized } from "@/src/services/tracking/healthconnect";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
// import { checkMetricPermissionsForMap } from "@/src/services/sharing/summarizer";
import {
  ensureNotifPermission,
  sendOpenAppNudge,
} from "@/src/services/notifications";
import { getShareRuntimeConfig } from "@/src/services/sharing/constants";
import { isShareReady, useShareStore } from "@/src/store/useShareStore";

export const SHARE_BG_TASK = "SHARE_BACKGROUND_TICK";
// export const SHARE_BG_TASK = "edu.uga.sensorweb.web3health.share-bg";

// Breadcrumb keys
// const KEY_LAST_RUN = 'bg.lastRunAt';
// const KEY_SEGMENTS = 'bg.segmentsSent';
// // NEW nudge keys + thresholds
// const KEY_LAST_NUDGE = 'bg.lastNudgeAt';
const STALE_MS = 24 * 60 * 60 * 1000; // 24h
const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h

// Breadcrumbs
// KEY_LAST_RUN should mean: last time we actually progressed (uploaded a segment)
export const KEY_LAST_RUN = "bg.lastRunAt";
export const KEY_LAST_ATTEMPT = "bg.lastAttemptAt";
export const KEY_SEGMENTS = "bg.segmentsSent";
export const KEY_LAST_NUDGE = "bg.lastNudgeAt";
export const KEY_LAST_SNAPSHOT = "bg.lastSnapshotJson";

// Per-posting keys (avoid cross-posting contamination)
const keyForPosting = (base: string, postingId?: number) =>
  postingId ? `${base}.${postingId}` : base;

async function maybeNudgeIfStale(postingId?: number, now = Date.now()) {
  const lastRunISO = await AsyncStorage.getItem(
    keyForPosting(KEY_LAST_RUN, postingId),
  );
  const lastRun = lastRunISO ? Date.parse(lastRunISO) : undefined;

  const lastNudgeISO = await AsyncStorage.getItem(
    keyForPosting(KEY_LAST_NUDGE, postingId),
  );
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
  await AsyncStorage.setItem(
    keyForPosting(KEY_LAST_NUDGE, postingId),
    new Date(now).toISOString(),
  );

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
    const pid = s.activePostingId;
    const ctx = pid ? s.contexts?.[pid] : undefined;
    const eng = ctx?.engine;

    const snap = {
      at: new Date().toISOString(),
      label,
      ready: isShareReady(),
      activePostingId: pid ?? null,

      storeStatus: ctx?.status ?? null,
      sessionId: ctx?.sessionId ?? null,
      postingId: pid ?? ctx?.postingId ?? null,
      userId: ctx?.userId ?? null,
      segmentsExpected: ctx?.segmentsExpected ?? 0,
      metricMapKeys: Object.keys(ctx?.metricMap ?? s.metricMap ?? {}),
      lastDiag: ctx?.lastWindowDiag ?? null,

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

async function updateLastRunBreadcrumbFromServer(
  postingId: number,
  nowIso: string,
) {
  try {
    const s = useShareStore.getState();
    const ctx = s.contexts?.[postingId];

    const serverLast = ctx?.snapshot?.lastUploadedAt ?? null;

    const prevIso = await AsyncStorage.getItem(
      keyForPosting(KEY_LAST_RUN, postingId),
    );

    const prevMs = prevIso ? Date.parse(prevIso) : NaN;
    const serverMs = serverLast ? Date.parse(serverLast) : NaN;

    // Choose the newest valid timestamp
    const bestMs = Math.max(
      Number.isFinite(prevMs) ? prevMs : 0,
      Number.isFinite(serverMs) ? serverMs : 0,
    );

    if (bestMs > 0) {
      await AsyncStorage.setItem(
        keyForPosting(KEY_LAST_RUN, postingId),
        new Date(bestMs).toISOString(),
      );
    } else {
      // If we have nothing, keep it unset (stale logic will treat as stale)
      // (No write)
    }

    if (__DEV__) {
      console.log("[BG] KEY_LAST_RUN updated from server snapshot", {
        postingId,
        prevIso: prevIso ?? null,
        serverLast: serverLast ?? null,
        chosen: bestMs > 0 ? new Date(bestMs).toISOString() : null,
      });
    }
  } catch (e) {
    if (__DEV__)
      console.log("[BG] updateLastRunBreadcrumbFromServer failed", e);
  }
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

    // Breadcrumbs:
    // - attempt: task executed
    // - run: only updated when we actually upload/progress
    const nowISO = new Date().toISOString();

    // Write attempt breadcrumbs per ACTIVE posting (multi-session safe)
    {
      const st0 = useShareStore.getState();
      const entries0 = Object.entries(st0.contexts ?? {});
      for (const [k, ctx] of entries0) {
        const postingId = Number(k);
        if (!Number.isFinite(postingId)) continue;
        if (!ctx?.sessionId) continue;
        if (ctx.status !== "ACTIVE") continue;
        await AsyncStorage.setItem(
          keyForPosting(KEY_LAST_ATTEMPT, postingId),
          nowISO,
        );
      }
    }

    // Snapshot (pre-flight)
    await writeBgSnapshot("preflight");

    const s = useShareStore.getState();

    // Optional: if sessionId missing but we have postingId+userId, try resolver once
    // if (!s.sessionId && s.postingId && s.userId) {
    //   try {
    //     const resolved = await getSessionByPosting(s.postingId, s.userId);
    //     if (resolved && resolved.sessionId) {
    // useShareStore.setState((prev) => ({
    //   sessionId: resolved.sessionId,
    //   segmentsExpected: Number(
    //     resolved.segmentsExpected ?? prev.segmentsExpected ?? 0
    //   ),
    //   status: "ACTIVE",
    //   engine: { ...prev.engine, status: "ACTIVE" },

    //   // Optional (only if missing); safe defaults
    //   cycleAnchorUtc: prev.cycleAnchorUtc ?? new Date().toISOString(),
    //   originalCycleAnchorUtc:
    //     prev.originalCycleAnchorUtc ?? new Date().toISOString(),
    // }));

    // useShareStore.setState((prev) => ({
    //   sessionId: resolved.sessionId,
    //   segmentsExpected: Number(
    //     resolved.segmentsExpected ?? prev.segmentsExpected ?? 0,
    //   ),
    //   status: "ACTIVE",
    //   engine: { ...(prev.engine ?? {}), status: "ACTIVE" },

    //   // IMPORTANT: do not invent anchors here.
    //   // We will pull the canonical server snapshot below and then align anchors from it.
    // }));

    // // Pull canonical server snapshot so planner uses server truth in this same run
    // await useShareStore
    //   .getState()
    //   .fetchSessionSnapshot(
    //     useShareStore.getState().userId!,
    //     useShareStore.getState().postingId!,
    //   );

    // // Align planner anchors to the canonical server anchor right away
    // {
    //   const snap = useShareStore.getState().snapshot;
    //   if (snap?.cycleAnchorUtc) {
    //     useShareStore.setState((prev) => ({
    //       cycleAnchorUtc: snap.cycleAnchorUtc, // planner ISO used by planner/tick
    //       engine: {
    //         ...prev.engine,
    //         // engine.cycleAnchorUtc is stored in ms (number)
    //         cycleAnchorUtc: new Date(snap.cycleAnchorUtc).getTime(),
    //       },
    //     }));
    //     if (typeof snap?.segmentsExpected === "number") {
    //       useShareStore.setState((prev) => ({
    //         segmentsExpected: snap.segmentsExpected,
    //         engine: {
    //           ...prev.engine,
    //           segmentsExpected: snap.segmentsExpected,
    //         },
    //       }));
    //     }
    //   }
    // }

    // if (__DEV__)
    //   console.log(
    //     "[BG] session resolved via resolver",
    //     resolved.sessionId,
    //   );

    // Minimal local activation (do NOT invent anchors here)
    //

    // Recovery: if we have postingId+userId but sessionId is missing, use the authoritative snapshot.
    // This avoids resolver-based reuse and avoids inventing anchors.
    // Recovery (multi-posting): if any ACTIVE context is missing sessionId, pull authoritative snapshot
    {
      const stR = useShareStore.getState();
      const entriesR = Object.entries(stR.contexts ?? {});
      for (const [k, ctx] of entriesR) {
        const postingId = Number(k);
        if (!Number.isFinite(postingId)) continue;
        if (!ctx?.userId) continue;
        if (ctx.sessionId) continue; // already has one
        if (ctx.status !== "ACTIVE") continue;

        try {
          const snapRes = await getSessionSnapshot(ctx.userId, postingId);
          const r = snapRes?.session;

          if (r?.session_id) {
            useShareStore.getState().setContext(postingId, {
              sessionId: r.session_id,
              status: "ACTIVE",
              engine: { ...(ctx.engine ?? {}), status: "ACTIVE" } as any,
            });

            await useShareStore
              .getState()
              .fetchSessionSnapshot(ctx.userId, postingId);

            if (__DEV__)
              console.log("[BG] session recovered via snapshot", {
                postingId,
                sessionId: r.session_id,
              });
          }
        } catch (e) {
          if (__DEV__)
            console.log(
              "[BG] snapshot recovery failed (non-fatal)",
              { postingId },
              e,
            );
        }
      }
    }

    // // Re-read after possible resolver update

    // const st = useShareStore.getState();
    // const pid1 = st.activePostingId;
    // const ctx1 = pid1 ? st.contexts?.[pid1] : undefined;

    // // If we already have an ACTIVE session, refresh snapshot once so planning uses server truth
    // if (pid1 && ctx1?.sessionId && ctx1?.userId) {
    //   try {
    //     await useShareStore.getState().fetchSessionSnapshot(ctx1.userId, pid1);
    //   } catch {}
    // }

    // // Gate: no ACTIVE session or readiness
    // const pid2 = st.activePostingId;
    // const ctx2 = pid2 ? st.contexts?.[pid2] : undefined;

    // const active =
    //   !!pid2 &&
    //   !!ctx2?.sessionId &&
    //   ctx2.status === "ACTIVE" &&
    //   ctx2.engine?.status === "ACTIVE";

    // const ready = isShareReady();

    // // const mode = st.engine?.mode;
    // // if (mode !== "NORMAL") {
    // //   await writeBgSnapshot("skip-non-normal", { mode });
    // //   return BackgroundTask.BackgroundTaskResult.Success;
    // // }
    // const mode = ctx2?.engine?.mode;
    // const simulationLock = (ctx2?.engine as any)?.simulationLock === true;

    // if (mode !== "NORMAL" || simulationLock) {
    //   await writeBgSnapshot("skip-non-normal", { mode, simulationLock });
    //   return BackgroundTask.BackgroundTaskResult.Success;
    // }

    // // Quick health + metric gate to avoid “idle” runs
    // const metricKeys = Object.keys(ctx2?.metricMap ?? st.metricMap ?? {});

    // const healthPlatform =
    //   (st as any).healthPlatform ?? (Platform.OS === "ios" ? "ios" : "android");
    // const healthAvailable = (st as any).healthAvailable ?? true;
    // const healthGranted = (st as any).healthGranted ?? true;

    // // Write a decision snapshot
    // await writeBgSnapshot("gate", {
    //   active,
    //   ready,
    //   metricKeysCount: metricKeys.length,
    //   healthPlatform,
    //   healthAvailable,
    //   healthGranted,
    // });

    // if (!active || !ready) {
    //   if (__DEV__)
    //     console.log("[BG] skip: inactive or not ready", { active, ready });
    //   const pid = useShareStore.getState().activePostingId;
    //   const ctx = pid ? useShareStore.getState().contexts?.[pid] : undefined;

    //   await AsyncStorage.setItem(
    //     keyForPosting(KEY_SEGMENTS, pid),
    //     String(ctx?.engine?.segmentsSent ?? 0),
    //   );
    //   await maybeNudgeIfStale(pid, Date.parse(nowISO));
    //   return BackgroundTask.BackgroundTaskResult.Success;
    // }

    // // Server-driven sleep: if the store already has a wake time and we are idle, do not run.
    // // (wake time is set from snapshot.wake_at_utc by store logic)
    // const nowMs = Date.now();
    // const pid3 = useShareStore.getState().activePostingId;
    // const ctx3 = pid3 ? useShareStore.getState().contexts?.[pid3] : undefined;
    // const eng = ctx3?.engine;

    // if (
    //   eng?.currentDueDayIndex == null &&
    //   eng?.nextRetryAtUtc &&
    //   nowMs < eng.nextRetryAtUtc
    // ) {
    //   await writeBgSnapshot("sleep-until-wake", {
    //     wakeAtMs: eng.nextRetryAtUtc,
    //     msLeft: eng.nextRetryAtUtc - nowMs,
    //   });
    //   return BackgroundTask.BackgroundTaskResult.Success;
    // }

    // // Short-circuit if health platform isn’t usable or we have nothing mapped to share.
    // if (
    //   (healthPlatform === "ios" || healthPlatform === "android") &&
    //   (!healthAvailable || !healthGranted || metricKeys.length === 0)
    // ) {
    //   if (__DEV__)
    //     console.log(
    //       "[BG] skip: missing health availability/permissions or metric map",
    //       {
    //         healthPlatform,
    //         healthAvailable,
    //         healthGranted,
    //         metricKeysCount: metricKeys.length,
    //       },
    //     );

    //   const pid = useShareStore.getState().activePostingId;
    //   const ctx = pid ? useShareStore.getState().contexts?.[pid] : undefined;

    //   await AsyncStorage.setItem(
    //     keyForPosting(KEY_SEGMENTS, pid),
    //     String(ctx?.engine?.segmentsSent ?? 0),
    //   );
    //   await writeBgSnapshot("health-missing", {
    //     healthPlatform,
    //     healthAvailable,
    //     healthGranted,
    //   });
    //   await maybeNudgeIfStale(pid, Date.parse(nowISO));
    //   return BackgroundTask.BackgroundTaskResult.Success;
    // }

    // // Proceed to tick + sweep backlog (handles multiple overdue days)
    // // const before = st.engine?.segmentsSent ?? 0;
    // // if (__DEV__) console.log("[BG] tick() start", { before });

    // // await st.tick();
    // // await useShareStore.getState().catchUpIfNeeded(); // ensure we process all due windows

    // // const after = useShareStore.getState().engine?.segmentsSent ?? 0;
    // // if (__DEV__)
    // //   console.log("[BG] tick() done", { after, changed: after > before });

    // // Proceed to one-step processing (contract: one day at a time, ordered).
    // // tick() will:
    // // - retry an in-flight window if needed (pendingWindow)
    // // - otherwise fetch snapshot and process exactly ONE eligible window

    // // Proceed to tick (one-day-per-run contract; no batching)

    // const pidRun = useShareStore.getState().activePostingId;
    // const ctxBefore = pidRun
    //   ? useShareStore.getState().contexts?.[pidRun]
    //   : undefined;
    // const before = ctxBefore?.engine?.segmentsSent ?? 0;

    // if (__DEV__) console.log("[BG] tick() start", { before });

    // await st.tick();

    // const ctxAfter = pidRun
    //   ? useShareStore.getState().contexts?.[pidRun]
    //   : undefined;
    // const after = ctxAfter?.engine?.segmentsSent ?? 0;

    // if (__DEV__)
    //   console.log("[BG] tick() done", { after, changed: after > before });

    // // await AsyncStorage.setItem(KEY_SEGMENTS, String(after));
    // // await writeBgSnapshot("post-tick", {
    // //   before,
    // //   after,
    // //   changed: after > before,
    // // });

    // await AsyncStorage.setItem(
    //   keyForPosting(KEY_SEGMENTS, pidRun),
    //   String(after),
    // );

    // // If we actually progressed in this BG run, record "now" as a strong signal.
    // if (after > before) {
    //   await AsyncStorage.setItem(
    //     keyForPosting(KEY_LAST_RUN, pidRun),
    //     new Date().toISOString(),
    //   );
    // }

    // await writeBgSnapshot("post-tick", {
    //   before,
    //   after,
    //   changed: after > before,
    // });

    // // Refresh server snapshot (await it) so:
    // // - UI shows the latest timing on next launch
    // // - stale detection can use authoritative lastUploadedAt
    // {
    //   const stateAfter = useShareStore.getState();
    //   const pid = stateAfter.activePostingId;
    //   const ctx = pid ? stateAfter.contexts?.[pid] : undefined;

    //   if (ctx?.userId && pid) {
    //     try {
    //       await stateAfter.fetchSessionSnapshot(ctx.userId, pid);
    //     } catch (e) {
    //       if (__DEV__)
    //         console.log(
    //           "[BG] fetchSessionSnapshot post-tick failed (non-fatal)",
    //           e,
    //         );
    //     }
    //   }
    // }

    // // Update KEY_LAST_RUN from authoritative server snapshot if it’s newer.
    // await updateLastRunBreadcrumbFromServer(nowISO);

    // // If still stale, consider nudging
    // await maybeNudgeIfStale(
    //   useShareStore.getState().activePostingId,
    //   Date.parse(nowISO),
    // );

    // return BackgroundTask.BackgroundTaskResult.Success;
    // Re-read after possible recovery update
    const st = useShareStore.getState();

    // Gate 0: global readiness
    if (!isShareReady()) {
      await writeBgSnapshot("skip-not-ready");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // Gate 1: keep your SIM guard based on the *active* posting (same behavior as today)
    {
      const pid = st.activePostingId;
      const ctx = pid ? st.contexts?.[pid] : undefined;
      const mode = ctx?.engine?.mode;
      const simulationLock = (ctx?.engine as any)?.simulationLock === true;

      if (mode !== "NORMAL" || simulationLock) {
        await writeBgSnapshot("skip-non-normal", { mode, simulationLock });
        return BackgroundTask.BackgroundTaskResult.Success;
      }
    }

    // Pre-snapshot decision info (active posting only; debug breadcrumb)
    await writeBgSnapshot("gate-multi", {
      contextsCount: Object.keys(st.contexts ?? {}).length,
      activePostingId: st.activePostingId ?? null,
    });

    // Capture "before" segmentsSent for each ACTIVE posting
    const beforeMap: Record<number, number> = {};
    {
      const entries = Object.entries(st.contexts ?? {});
      for (const [k, ctx] of entries) {
        const postingId = Number(k);
        if (!Number.isFinite(postingId)) continue;
        if (!ctx?.sessionId) continue;
        if (ctx.status !== "ACTIVE") continue;
        if (ctx.engine?.status !== "ACTIVE") continue;
        if (ctx.engine?.mode === "SIM") continue;
        beforeMap[postingId] = ctx.engine?.segmentsSent ?? 0;
      }
    }

    // Nothing ACTIVE to process
    if (Object.keys(beforeMap).length === 0) {
      await writeBgSnapshot("skip-no-active-contexts");
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    if (__DEV__)
      console.log("[BG] tickAll() start", {
        activePostings: Object.keys(beforeMap).map(Number),
      });

    // ✅ Process all ACTIVE posting contexts (ShareStore already implements this correctly)
    await useShareStore.getState().tickAll();

    if (__DEV__) console.log("[BG] tickAll() done");

    // After: write per-posting breadcrumbs, per-posting nudges
    const afterState = useShareStore.getState();
    const afterEntries = Object.entries(afterState.contexts ?? {});

    for (const [k, ctx] of afterEntries) {
      const postingId = Number(k);
      if (!Number.isFinite(postingId)) continue;
      if (!ctx?.sessionId) continue;
      if (ctx.status !== "ACTIVE") continue;

      const after = ctx.engine?.segmentsSent ?? 0;
      const before = beforeMap[postingId] ?? after;

      // Track segments per posting
      await AsyncStorage.setItem(
        keyForPosting(KEY_SEGMENTS, postingId),
        String(after),
      );

      // Update last-run only when progress happened
      if (after > before) {
        await AsyncStorage.setItem(
          keyForPosting(KEY_LAST_RUN, postingId),
          new Date().toISOString(),
        );
      }

      // Nudge staleness per posting
      await maybeNudgeIfStale(postingId, Date.parse(nowISO));
    }

    // Active-posting debug snapshot
    await writeBgSnapshot("post-tickAll", {
      postingsProcessed: Object.keys(beforeMap).length,
    });

    // Keep your active-posting “authoritative server lastUploadedAt” sync
    for (const k of Object.keys(beforeMap)) {
      const postingId = Number(k);
      if (Number.isFinite(postingId)) {
        await updateLastRunBreadcrumbFromServer(postingId, nowISO);
      }
    }

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
  //     await maybeNudgeIfStale(useShareStore.getState().activePostingId, Date.parse(nowISO));

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
  //   await maybeNudgeIfStale(useShareStore.getState().activePostingId, Date.parse(nowISO));

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
        "[BG] Background task not available; relying on foreground polling.",
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
      e?.message ?? e,
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
      e?.message ?? e,
    );
  }
}
