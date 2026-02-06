// src/hooks/useShareSyncMonitor.ts
import {
  ensureNotifPermission,
  sendOpenAppNudge,
} from "@/src/services/notifications";
import {
  computeNextWindowFromSnapshot,
  useShareStore,
} from "@/src/store/useShareStore";

import {
  getCatchUpStatus as plannerGetCatchUpStatus,
  type PlannerContext,
} from "@/src/services/sharing/planner";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

const KEY_LAST_RUN = "bg.lastRunAt";
const KEY_LAST_ATTEMPT = "bg.lastAttemptAt";
const KEY_SEGMENTS = "bg.segmentsSent";
const KEY_LAST_NUDGE = "bg.lastNudgeAt";

type SyncState = {
  // bg task executed (wake)
  lastAttemptAtISO?: string;

  // bg task made progress (uploaded a segment)
  lastRunAtISO?: string;

  segmentsSent?: number;

  // stale logic
  isStale24h: boolean;

  // next due window (for “sync now” / timeline visibility)
  nextWindowStartUtcISO: string;
  nextWindowEndUtcISO: string;

  // catch-up preview (manual only; never auto-triggered by monitor)
  missedCount?: number;
  nextCatchUpFromUtcISO?: string;
  nextCatchUpToUtcISO?: string;
};

export function useShareSyncMonitor() {
  const status = useShareStore((s) => s.status);
  const engine = useShareStore((s) => s.engine);
  const tick = useShareStore((s) => s.tick);

  const cycleAnchorUtc = useShareStore((s) => s.cycleAnchorUtc);
  const segmentsExpected = useShareStore((s) => s.segmentsExpected);
  const snapshot = useShareStore((s) => s.snapshot);

  const userId = useShareStore((s) => s.userId);
  const postingId = useShareStore((s) => s.postingId);
  const fetchSessionSnapshot = useShareStore((s) => s.fetchSessionSnapshot);

  const [lastAttemptAtISO, setLastAttemptAtISO] = useState<
    string | undefined
  >();
  const [lastRunAtISO, setLastRunAtISO] = useState<string | undefined>();
  const [segmentsSent, setSegmentsSent] = useState<number | undefined>();

  // Read breadcrumbs that the bg task writes
  async function refreshBreadcrumbs() {
    const attemptISO = await AsyncStorage.getItem(KEY_LAST_ATTEMPT);
    const runISO = await AsyncStorage.getItem(KEY_LAST_RUN);
    const seg = await AsyncStorage.getItem(KEY_SEGMENTS);

    setLastAttemptAtISO(attemptISO ?? undefined);
    setLastRunAtISO(runISO ?? undefined);
    setSegmentsSent(seg ? Number(seg) : undefined);
  }

  useEffect(() => {
    // refresh on mount and whenever engine changes (optional)
    refreshBreadcrumbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine?.segmentsSent]);

  // Compute windows using your runtime config
  // const state: SyncState = useMemo(() => {
  //   const { DAY_LENGTH_MS } = getShareRuntimeConfig(); // 86_400_000 in prod; shorter in test mode
  //   const now = Date.now();

  //   // NEXT window: [floor(now/DAY)*DAY, +DAY] — or use your own anchor if you have one
  //   const dayStart = Math.floor(now / DAY_LENGTH_MS) * DAY_LENGTH_MS;
  //   const nextStart = dayStart;           // current window start
  //   const nextEnd = dayStart + DAY_LENGTH_MS;

  //   const last = lastRunAtISO ? Date.parse(lastRunAtISO) : undefined;
  //   const isStale24h = last ? (now - last) >= (24 * 60 * 60 * 1000) : true;

  //   return {
  //     lastRunAtISO: lastRunAtISO,
  //     segmentsSent: segmentsSent,
  //     isStale24h,
  //     nextWindowStartUtcISO: new Date(nextStart).toISOString(),
  //     nextWindowEndUtcISO: new Date(nextEnd).toISOString(),
  //   };
  // }, [lastRunAtISO, segmentsSent]);

  const state: SyncState = useMemo(() => {
    const now = Date.now();

    const anchor = cycleAnchorUtc;
    const expected = segmentsExpected ?? 0;

    const next =
      anchor && expected
        ? computeNextWindowFromSnapshot(
            anchor,
            engine?.lastSentDayIndex ?? null,
            expected,
          )
        : null;

    // Prefer real backend activity; fall back to bg breadcrumb
    const lastActivityISO =
      snapshot?.lastUploadedAt ?? lastRunAtISO ?? undefined;

    const last = lastActivityISO ? Date.parse(lastActivityISO) : undefined;
    const isStale24h = last ? now - last >= 24 * 60 * 60 * 1000 : true;

    // Catch-up preview should be derived from server truth when available.
    // We DO NOT trigger catch-up here; this is display-only state.
    let missedCount: number | undefined;
    let nextCatchUpFromUtcISO: string | undefined;
    let nextCatchUpToUtcISO: string | undefined;

    if (
      snapshot?.cycleAnchorUtc &&
      snapshot?.joinTimeLocalISO &&
      typeof snapshot?.segmentsExpected === "number"
    ) {
      const lastSent =
        snapshot.lastSentDayIndex == null
          ? 0
          : Number(snapshot.lastSentDayIndex);

      const ctx: PlannerContext = {
        joinTimeLocalISO: snapshot.joinTimeLocalISO,
        joinTimezone: snapshot.joinTimezone ?? "Local",
        cycleAnchorUtc: snapshot.cycleAnchorUtc,
        segmentsExpected: Number(snapshot.segmentsExpected ?? 0),
        alreadySentDayIndices: lastSent >= 1 ? [lastSent] : [],
        lastSentDayIndex: lastSent,
        mode: "NORMAL",
      };

      const r = plannerGetCatchUpStatus(
        ctx,
        lastSent,
        new Date(now).toISOString(),
      );
      missedCount = r.count;
      nextCatchUpFromUtcISO = r.next?.fromUtc;
      nextCatchUpToUtcISO = r.next?.toUtc;
    }

    return {
      lastAttemptAtISO,
      lastRunAtISO,
      segmentsSent,
      isStale24h,
      nextWindowStartUtcISO: next?.fromUtc ?? "",
      nextWindowEndUtcISO: next?.toUtc ?? "",
      missedCount,
      nextCatchUpFromUtcISO,
      nextCatchUpToUtcISO,
    };
  }, [
    lastAttemptAtISO,
    lastRunAtISO,
    segmentsSent,
    cycleAnchorUtc,
    segmentsExpected,
    engine?.lastSentDayIndex,
    snapshot?.lastUploadedAt,
  ]);

  // Nudge user if stale for >24h and session is ACTIVE
  // useEffect(() => {
  //   if (status === 'ACTIVE' && state.isStale24h) {
  //     (async () => {
  //       const ok = await ensureNotifPermission();
  //       if (!ok) return;
  //       await sendOpenAppNudge(
  //         'Open Web3Health to sync',
  //         'Your sharing session needs an app open to catch up. Tap to sync now.'
  //       );
  //     })();
  //   }
  // }, [status, state.isStale24h]);

  useEffect(() => {
    const shouldConsider =
      status === "ACTIVE" &&
      engine?.status === "ACTIVE" &&
      engine?.mode !== "SIM" &&
      state.isStale24h;

    if (!shouldConsider) return;

    (async () => {
      // throttle: at most once per 24h while stale
      const last = await AsyncStorage.getItem(KEY_LAST_NUDGE);
      const lastMs = last ? Date.parse(last) : NaN;
      const nowMs = Date.now();

      if (Number.isFinite(lastMs) && nowMs - lastMs < 24 * 60 * 60 * 1000) {
        return;
      }

      const ok = await ensureNotifPermission();
      if (!ok) return;

      await sendOpenAppNudge(
        "Open Web3Health to sync",
        "Your sharing session needs an app open to catch up. Tap to sync now.",
      );

      await AsyncStorage.setItem(KEY_LAST_NUDGE, new Date(nowMs).toISOString());
    })();
  }, [status, engine?.status, engine?.mode, state.isStale24h]);

  // Manual “Sync Now” (foreground tick)
  // async function syncNow() {
  //   await tick();
  //   await refreshBreadcrumbs();
  // }

  async function syncNow() {
    await tick();
    await refreshBreadcrumbs();

    if (userId && postingId) {
      await fetchSessionSnapshot(userId, postingId);
    }
  }

  return { state, syncNow, refreshBreadcrumbs };
}
