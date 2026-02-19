// src/hooks/useShareSyncMonitor.ts
import {
  ensureNotifPermission,
  sendOpenAppNudge,
} from "@/src/services/notifications";
import { useShareStore } from "@/src/store/useShareStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

const KEY_LAST_RUN = "bg.lastRunAt";
const KEY_LAST_ATTEMPT = "bg.lastAttemptAt";
const KEY_SEGMENTS = "bg.segmentsSent";

const keyForPosting = (base: string, postingId?: number) =>
  postingId ? `${base}.${postingId}` : base;

const KEY_LAST_NUDGE = "bg.lastNudgeAt";
const KEY_LAST_MONITOR_SNAPSHOT_PULL = "bg.monitorLastSnapshotPullAt";

type SyncState = {
  // bg task executed (wake)
  lastAttemptAtISO?: string;

  // bg task made progress (uploaded a segment)
  lastRunAtISO?: string;

  segmentsSent?: number;

  // stale logic
  isStale24h: boolean;

  // next due window (for “sync now” / timeline visibility)
  nextWindowStartUtcISO?: string;
  nextWindowEndUtcISO?: string;

  // catch-up preview (manual only; never auto-triggered by monitor)
  missedCount?: number;
  nextCatchUpFromUtcISO?: string;
  nextCatchUpToUtcISO?: string;
};

export function useShareSyncMonitor() {
  const syncNowAction = useShareStore((s) => s.syncNow);
  const fetchSessionSnapshot = useShareStore((s) => s.fetchSessionSnapshot);

  const activePostingId = useShareStore((s) => s.activePostingId);
  const ctx = useShareStore((s) =>
    s.activePostingId ? (s as any).contexts?.[s.activePostingId] : undefined,
  );

  const status = ctx?.status;
  const engine = ctx?.engine;
  const snapshot = ctx?.snapshot;

  const userId = ctx?.userId;

  const postingIdRaw = activePostingId ?? ctx?.postingId;
  const postingId =
    typeof postingIdRaw === "number" && Number.isFinite(postingIdRaw)
      ? postingIdRaw
      : undefined;

  const hasPosting = postingId != null;

  const [lastAttemptAtISO, setLastAttemptAtISO] = useState<
    string | undefined
  >();
  const [lastRunAtISO, setLastRunAtISO] = useState<string | undefined>();
  const [segmentsSent, setSegmentsSent] = useState<number | undefined>();

  // Read breadcrumbs that the bg task writes
  async function refreshBreadcrumbs() {
    if (!hasPosting) {
      setLastAttemptAtISO(undefined);
      setLastRunAtISO(undefined);
      setSegmentsSent(undefined);
      return;
    }

    const [attemptISO, runISO, seg] = await Promise.all([
      AsyncStorage.getItem(keyForPosting(KEY_LAST_ATTEMPT, postingId)),
      AsyncStorage.getItem(keyForPosting(KEY_LAST_RUN, postingId)),
      AsyncStorage.getItem(keyForPosting(KEY_SEGMENTS, postingId)),
    ]);

    const segNum = seg == null ? undefined : Number(seg);
    setLastAttemptAtISO(attemptISO ?? undefined);
    setLastRunAtISO(runISO ?? undefined);
    setSegmentsSent(Number.isFinite(segNum as number) ? segNum : undefined);
  }

  useEffect(() => {
    // refresh on mount, when active posting changes, and when engine progress changes
    refreshBreadcrumbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePostingId, engine?.segmentsSent]);

  useEffect(() => {
    if (!hasPosting) return;
    if (userId == null || postingId == null) return;
    if (status !== "ACTIVE") return;

    (async () => {
      const key = keyForPosting(KEY_LAST_MONITOR_SNAPSHOT_PULL, postingId);
      const lastISO = await AsyncStorage.getItem(key);
      const lastMs = lastISO ? Date.parse(lastISO) : NaN;
      const nowMs = Date.now();

      // 5 min is enough to keep "stale" logic accurate without being noisy
      if (Number.isFinite(lastMs) && nowMs - lastMs < 5 * 60 * 1000) return;

      await AsyncStorage.setItem(key, new Date(nowMs).toISOString());
      await fetchSessionSnapshot(userId, postingId);
    })().catch(() => {});
  }, [hasPosting, userId, postingId, status, fetchSessionSnapshot]);

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

  // const state: SyncState = useMemo(() => {
  //   const now = Date.now();

  //   const anchor = cycleAnchorUtc;
  //   const expected = segmentsExpected ?? 0;

  //   const next =
  //     anchor && expected
  //       ? computeNextWindowFromSnapshot(
  //           anchor,
  //           engine?.lastSentDayIndex ?? null,
  //           expected,
  //         )
  //       : null;

  //   // Prefer real backend activity; fall back to bg breadcrumb
  //   const lastActivityISO =
  //     snapshot?.lastUploadedAt ?? lastRunAtISO ?? undefined;

  //   const last = lastActivityISO ? Date.parse(lastActivityISO) : undefined;
  //   const isStale24h = last ? now - last >= 24 * 60 * 60 * 1000 : true;

  //   // Catch-up preview should be derived from server truth when available.
  //   // We DO NOT trigger catch-up here; this is display-only state.
  //   let missedCount: number | undefined;
  //   let nextCatchUpFromUtcISO: string | undefined;
  //   let nextCatchUpToUtcISO: string | undefined;

  //   if (
  //     snapshot?.cycleAnchorUtc &&
  //     snapshot?.joinTimeLocalISO &&
  //     typeof snapshot?.segmentsExpected === "number"
  //   ) {
  //     const lastSent =
  //       snapshot.lastSentDayIndex == null
  //         ? 0
  //         : Number(snapshot.lastSentDayIndex);

  //     const ctx: PlannerContext = {
  //       joinTimeLocalISO: snapshot.joinTimeLocalISO,
  //       joinTimezone: snapshot.joinTimezone ?? "Local",
  //       cycleAnchorUtc: snapshot.cycleAnchorUtc,
  //       segmentsExpected: Number(snapshot.segmentsExpected ?? 0),
  //       alreadySentDayIndices: lastSent >= 1 ? [lastSent] : [],
  //       lastSentDayIndex: lastSent,
  //       mode: "NORMAL",
  //     };

  //     const r = plannerGetCatchUpStatus(
  //       ctx,
  //       lastSent,
  //       new Date(now).toISOString(),
  //     );
  //     missedCount = r.count;
  //     nextCatchUpFromUtcISO = r.next?.fromUtc;
  //     nextCatchUpToUtcISO = r.next?.toUtc;
  //   }

  //   return {
  //     lastAttemptAtISO,
  //     lastRunAtISO,
  //     segmentsSent,
  //     isStale24h,
  //     nextWindowStartUtcISO: next?.fromUtc ?? "",
  //     nextWindowEndUtcISO: next?.toUtc ?? "",
  //     missedCount,
  //     nextCatchUpFromUtcISO,
  //     nextCatchUpToUtcISO,
  //   };
  // }, [
  //   lastAttemptAtISO,
  //   lastRunAtISO,
  //   segmentsSent,
  //   cycleAnchorUtc,
  //   segmentsExpected,
  //   engine?.lastSentDayIndex,
  //   snapshot?.lastUploadedAt,
  // ]);

  const state: SyncState = useMemo(() => {
    const now = Date.now();

    // Prefer real backend activity; fall back to bg breadcrumb
    const lastActivityISO =
      snapshot?.lastUploadedAt ?? lastRunAtISO ?? undefined;

    const lastMs = lastActivityISO ? Date.parse(lastActivityISO) : NaN;
    const isStale24h =
      !Number.isFinite(lastMs) || now - lastMs >= 24 * 60 * 60 * 1000;

    // Display-only catch-up preview derived from server snapshot.
    const missedCount = snapshot?.catchUp?.countEligibleNow;
    const nextCatchUpFromUtcISO = snapshot?.catchUp?.next?.fromUtc;
    const nextCatchUpToUtcISO = snapshot?.catchUp?.next?.toUtc;

    return {
      lastAttemptAtISO,
      lastRunAtISO,
      segmentsSent,
      isStale24h,
      nextWindowStartUtcISO: snapshot?.nextDue?.fromUtc ?? undefined,
      nextWindowEndUtcISO: snapshot?.nextDue?.toUtc ?? undefined,
      missedCount,
      nextCatchUpFromUtcISO,
      nextCatchUpToUtcISO,
    };
  }, [
    lastAttemptAtISO,
    lastRunAtISO,
    segmentsSent,
    snapshot?.lastUploadedAt,
    snapshot?.nextDue?.fromUtc,
    snapshot?.nextDue?.toUtc,
    snapshot?.catchUp?.countEligibleNow,
    snapshot?.catchUp?.next?.fromUtc,
    snapshot?.catchUp?.next?.toUtc,
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
    const wakeMs = snapshot?.wakeAtUtc ? Date.parse(snapshot.wakeAtUtc) : NaN;
    const wakeSoon =
      Number.isFinite(wakeMs) && wakeMs - Date.now() <= 30 * 60 * 1000; // 30 min

    const shouldConsider =
      status === "ACTIVE" &&
      snapshot != null &&
      engine?.mode !== "SIM" &&
      state.isStale24h &&
      !wakeSoon;

    if (!shouldConsider) return;

    (async () => {
      if (!hasPosting) return;

      // throttle: at most once per 12h while stale

      const last = await AsyncStorage.getItem(
        keyForPosting(KEY_LAST_NUDGE, postingId),
      );

      const lastMs = last ? Date.parse(last) : NaN;
      const nowMs = Date.now();

      if (Number.isFinite(lastMs) && nowMs - lastMs < 12 * 60 * 60 * 1000) {
        return;
      }

      const ok = await ensureNotifPermission();
      if (!ok) return;

      await sendOpenAppNudge(
        "Open Web3Health to sync",
        "Your sharing session needs an app open to catch up. Tap to sync now.",
      );

      await AsyncStorage.setItem(
        keyForPosting(KEY_LAST_NUDGE, postingId),
        new Date(nowMs).toISOString(),
      );
    })();
  }, [
    status,
    engine?.status,
    engine?.mode,
    state.isStale24h,
    snapshot?.wakeAtUtc,
    postingId,
  ]);

  // Manual “Sync Now” (foreground tick)
  // async function syncNow() {
  //   await tick();
  //   await refreshBreadcrumbs();
  // }

  async function syncNow() {
    await syncNowAction();
    await refreshBreadcrumbs();

    if (userId && postingId) {
      await fetchSessionSnapshot(userId, postingId);
    }
  }

  return { state, syncNow, refreshBreadcrumbs };
}
