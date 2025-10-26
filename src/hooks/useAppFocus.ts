// src/hooks/useAppFocus.ts
import { getShareRuntimeConfig } from "@/src/services/sharing/constants";
import { useShareStore } from "@/src/store/useShareStore";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

const TAG = "[SHARE][Focus]";

/**
 * Polls tick() only while sharing is ACTIVE and engine is in NORMAL mode.
 * - NORMAL: tick on focus + foreground + interval (fast in DEV, slower in PROD)
 * - SIM or simulationLock: NO auto-interval and NO auto-tick on focus/foreground
 */
export function useAppFocusSharingTick(
  activePollSeconds: number = __DEV__ ? 5 : 60
) {
  // Read the *function* once per call; use getState() inside effects to avoid dep churn.
  const tickFn = useShareStore((s) => s.tick);

  // In React Native, setInterval returns a number
  const intervalRef = useRef<number | null>(null);

  // One-time runtime banner so you know sim knobs are set right
  useEffect(() => {
    if (!(global as any).__SHARE_FOCUS_BANNER__) {
      (global as any).__SHARE_FOCUS_BANNER__ = true;
      console.log(`${TAG} runtime`, getShareRuntimeConfig());
    }
  }, []);

  // Pure guard: evaluate on demand (NO state subscriptions here)
  const canAutoTick = useCallback(() => {
    const s = useShareStore.getState();
    const eng = s.engine;
    const isStoreActive = !!s.sessionId && s.status === "ACTIVE";
    const isNormalMode = eng?.mode === "NORMAL" && !eng?.simulationLock;
    return isStoreActive && isNormalMode;
  }, []);

  const logStateSnapshot = useCallback(() => {
    if (!__DEV__) return;
    const s = useShareStore.getState();
    const eng = s.engine;
    console.log(TAG, canAutoTick() ? "snapshot (active)" : "snapshot (idle)", {
      status: s.status,
      sessionId: s.sessionId,
      postingId: s.postingId,
      userId: s.userId,
      segmentsExpected: s.segmentsExpected,
      engine: eng && {
        status: eng.status,
        mode: eng.mode,
        simulationLock: !!eng.simulationLock,
        cycleAnchorUtcISO: eng?.cycleAnchorUtc
          ? new Date(eng.cycleAnchorUtc).toISOString()
          : null,
        lastSentDayIndex: eng?.lastSentDayIndex,
        segmentsSent: eng?.segmentsSent,
        currentDueDayIndex: eng?.currentDueDayIndex,
        noDataRetryCount: eng?.noDataRetryCount,
        nextRetryAtISO: eng?.nextRetryAtUtc
          ? new Date(eng.nextRetryAtUtc).toISOString()
          : null,
        graceAppliedForDay: eng?.graceAppliedForDay,
      },
    });
  }, [canAutoTick]);

  // Focus-driven tick/interval: depends ONLY on poll seconds (stable while focused)
  useFocusEffect(
    useCallback(() => {
      if (__DEV__) {
        console.log(
          TAG,
          `focus → ${canAutoTick() ? "tick() + start interval" : "no auto-tick (SIM or inactive)"}`,
          { activePollSeconds }
        );
      }

      logStateSnapshot();

      if (canAutoTick()) {
        // one eager tick on focus
        void tickFn();
        void useShareStore.getState().catchUpIfNeeded(); // sweep any overdue days

        // start interval (once per focus)
        const id = setInterval(() => {
          if (canAutoTick()) {
            if (__DEV__) console.log(TAG, "interval → tick()");
            logStateSnapshot();
            // one eager tick on focus
            void tickFn();
            void useShareStore.getState().catchUpIfNeeded(); // sweep any overdue days
          }
        }, activePollSeconds * 1000) as unknown as number;
        intervalRef.current = id;
      }

      // Cleanup on blur/unmount
      return () => {
        if (intervalRef.current != null) {
          if (__DEV__) console.log(TAG, "cleanup → clearInterval");
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [activePollSeconds, canAutoTick, logStateSnapshot, tickFn])
  );

  // AppState foreground tick: subscribe ONCE, decide at call time
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        if (__DEV__) {
          console.log(
            TAG,
            `AppState active → ${canAutoTick() ? "tick() (NORMAL)" : "no auto-tick (SIM or inactive)"}`
          );
        }
        logStateSnapshot();
        if (canAutoTick()) {
          void tickFn();
          void useShareStore.getState().catchUpIfNeeded(); // sweep backlog when app returns to foreground
        }
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove?.();
    // ⬇️ No store-driven deps here—read from getState() inside handlers
  }, [canAutoTick, logStateSnapshot, tickFn]);
}
