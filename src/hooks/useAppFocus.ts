// src/hooks/useAppFocus.ts
import { getShareRuntimeConfig } from '@/src/services/sharing/constants';
import { useShareStore } from '@/src/store/useShareStore';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

const TAG = '[SHARE][Focus]';

/**
 * Polls tick() only while sharing is ACTIVE and engine is in NORMAL mode.
 * - NORMAL mode: tick on focus + foreground + interval (fast in DEV, slower in PROD).
 * - SIM mode or simulationLock: NO auto-interval and NO auto-tick on focus/foreground.
 *   (User drives progression via the Dev Panel to avoid racing/double-ticks.)
 */
export function useAppFocusSharingTick(activePollSeconds: number = (__DEV__ ? 5 : 60)) {
  const tick = useShareStore((s) => s.tick);
  const sessionId = useShareStore((s) => s.sessionId);
  const storeStatus = useShareStore((s) => s.status); // 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETE'
  const engine = useShareStore((s) => s.engine);

  const isStoreActive = !!sessionId && storeStatus === 'ACTIVE';
  const isNormalMode = engine?.mode === 'NORMAL' && !engine?.simulationLock;
  const shouldRunInterval = isStoreActive && isNormalMode;

  // In React Native, setInterval returns a number (not NodeJS.Timer)
  const intervalRef = useRef<number | null>(null);

  // One-time runtime banner so you know sim knobs are set right
  useEffect(() => {
    if (!(global as any).__SHARE_FOCUS_BANNER__) {
      (global as any).__SHARE_FOCUS_BANNER__ = true;
      console.log(`${TAG} runtime`, getShareRuntimeConfig());
    }
  }, []);

  // Helper: small debug snapshot from store (no re-render)
  const logStateSnapshot = useCallback(() => {
    if (!__DEV__) return;
    const s = useShareStore.getState();
    const eng = s.engine;
    console.log(TAG, shouldRunInterval ? 'snapshot (active)' : 'snapshot (idle)', {
      status: s.status,                 // ACTIVE | PAUSED | CANCELLED | COMPLETE
      sessionId: s.sessionId,
      postingId: s.postingId,
      userId: s.userId,
      segmentsExpected: s.segmentsExpected,
      engine: eng && {
        status: eng.status,
        mode: eng.mode,
        simulationLock: !!eng.simulationLock,
        cycleAnchorUtcISO: new Date(eng.cycleAnchorUtc).toISOString(),
        lastSentDayIndex: eng.lastSentDayIndex,
        segmentsSent: eng.segmentsSent,
        currentDueDayIndex: eng.currentDueDayIndex,
        noDataRetryCount: eng.noDataRetryCount,
        nextRetryAtISO: eng.nextRetryAtUtc ? new Date(eng.nextRetryAtUtc).toISOString() : null,
        graceAppliedForDay: eng.graceAppliedForDay,
      },
    });
  }, [shouldRunInterval]);

  // Run when screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (__DEV__) {
        console.log(
          TAG,
          `focus → ${shouldRunInterval ? 'tick() + start interval' : 'no auto-tick (SIM or inactive)'}`,
          { activePollSeconds }
        );
      }

      logStateSnapshot();

      // Only auto-tick on focus when NORMAL mode (prevents race during SIM/manual steps)
      if (shouldRunInterval) {
        tick();
      }

      // Start interval only while NORMAL mode + ACTIVE
      if (shouldRunInterval) {
        const id = setInterval(() => {
          if (__DEV__) console.log(TAG, 'interval (active,NORMAL) → tick()');
          logStateSnapshot();
          tick();
        }, activePollSeconds * 1000) as unknown as number;
        intervalRef.current = id;
      }

      // Cleanup on blur/unmount
      return () => {
        if (intervalRef.current != null) {
          if (__DEV__) console.log(TAG, 'cleanup → clearInterval');
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [tick, activePollSeconds, shouldRunInterval, logStateSnapshot])
  );

  // Also listen to OS app state (foreground events)
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        if (__DEV__) {
          console.log(
            TAG,
            `AppState active → ${shouldRunInterval ? 'tick() (NORMAL)' : 'no auto-tick (SIM or inactive)'}`
          );
        }
        logStateSnapshot();

        // Only auto-tick on foreground when NORMAL mode
        if (shouldRunInterval) {
          tick();
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      sub.remove?.();
    };
  }, [tick, logStateSnapshot, shouldRunInterval]);
}
