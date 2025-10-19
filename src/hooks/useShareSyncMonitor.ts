// src/hooks/useShareSyncMonitor.ts
import { ensureNotifPermission, sendOpenAppNudge } from '@/src/services/notifications';
import { getShareRuntimeConfig } from '@/src/services/sharing/constants';
import { useShareStore } from '@/src/store/useShareStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';

const KEY_LAST_RUN = 'bg.lastRunAt';
const KEY_SEGMENTS  = 'bg.segmentsSent';

type SyncState = {
  lastRunAtISO?: string;
  segmentsSent?: number;
  isStale24h: boolean;
  nextWindowStartUtcISO: string;
  nextWindowEndUtcISO: string;
};

export function useShareSyncMonitor() {
  const status = useShareStore(s => s.status); // 'ACTIVE' | ...
  const engine = useShareStore(s => s.engine);
  const tick = useShareStore(s => s.tick);

  const [lastRunAtISO, setLastRunAtISO] = useState<string | undefined>();
  const [segmentsSent, setSegmentsSent] = useState<number | undefined>();

  // Read breadcrumbs that the bg task writes
  async function refreshBreadcrumbs() {
    const iso = await AsyncStorage.getItem(KEY_LAST_RUN);
    const seg = await AsyncStorage.getItem(KEY_SEGMENTS);
    setLastRunAtISO(iso ?? undefined);
    setSegmentsSent(seg ? Number(seg) : undefined);
  }

  useEffect(() => {
    // refresh on mount and whenever engine changes (optional)
    refreshBreadcrumbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine?.segmentsSent]);

  // Compute windows using your runtime config
  const state: SyncState = useMemo(() => {
    const { DAY_LENGTH_MS } = getShareRuntimeConfig(); // 86_400_000 in prod; shorter in test mode
    const now = Date.now();

    // NEXT window: [floor(now/DAY)*DAY, +DAY] — or use your own anchor if you have one
    const dayStart = Math.floor(now / DAY_LENGTH_MS) * DAY_LENGTH_MS;
    const nextStart = dayStart;           // current window start
    const nextEnd = dayStart + DAY_LENGTH_MS;

    const last = lastRunAtISO ? Date.parse(lastRunAtISO) : undefined;
    const isStale24h = last ? (now - last) >= (24 * 60 * 60 * 1000) : true;

    return {
      lastRunAtISO: lastRunAtISO,
      segmentsSent: segmentsSent,
      isStale24h,
      nextWindowStartUtcISO: new Date(nextStart).toISOString(),
      nextWindowEndUtcISO: new Date(nextEnd).toISOString(),
    };
  }, [lastRunAtISO, segmentsSent]);

  // Nudge user if stale for >24h and session is ACTIVE
  useEffect(() => {
    if (status === 'ACTIVE' && state.isStale24h) {
      (async () => {
        const ok = await ensureNotifPermission();
        if (!ok) return;
        await sendOpenAppNudge(
          'Open Web3Health to sync',
          'Your sharing session needs an app open to catch up. Tap to sync now.'
        );
      })();
    }
  }, [status, state.isStale24h]);

  // Manual “Sync Now” (foreground tick)
  async function syncNow() {
    await tick();
    await refreshBreadcrumbs();
  }

  return { state, syncNow, refreshBreadcrumbs };
}
