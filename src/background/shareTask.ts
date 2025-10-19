// src/background/shareTask.ts
import { ensureInitialized } from '@/src/services/tracking/healthconnect';
import { useShareStore } from '@/src/store/useShareStore';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

// NEW
import { ensureNotifPermission, sendOpenAppNudge } from '@/src/services/notifications';
import { getShareRuntimeConfig } from '@/src/services/sharing/constants';

export const SHARE_BG_TASK = 'SHARE_BACKGROUND_TICK';

// Breadcrumb keys
const KEY_LAST_RUN = 'bg.lastRunAt';
const KEY_SEGMENTS = 'bg.segmentsSent';
// NEW nudge keys + thresholds
const KEY_LAST_NUDGE = 'bg.lastNudgeAt';
const STALE_MS = 24 * 60 * 60 * 1000;           // 24h
const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;  // 12h

async function maybeNudgeIfStale(now = Date.now()) {
  const lastRunISO = await AsyncStorage.getItem(KEY_LAST_RUN);
  const lastRun = lastRunISO ? Date.parse(lastRunISO) : undefined;

  const lastNudgeISO = await AsyncStorage.getItem(KEY_LAST_NUDGE);
  const lastNudge = lastNudgeISO ? Date.parse(lastNudgeISO) : 0;

  const isStale = !lastRun || (now - lastRun) >= STALE_MS;
  const cooledDown = (now - lastNudge) >= NUDGE_COOLDOWN_MS;
  if (!isStale || !cooledDown) return;

  // Optional: be smarter near the end of the current window
  const { DAY_LENGTH_MS } = getShareRuntimeConfig();
  const dayStart = Math.floor(now / DAY_LENGTH_MS) * DAY_LENGTH_MS;
  const millisIntoDay = now - dayStart;
  const nearEnd = millisIntoDay > DAY_LENGTH_MS * 0.9;

  const allowed = await ensureNotifPermission();
  if (!allowed) return;

  const body = nearEnd
    ? 'Today’s sharing window is ending soon. Open Web3Health to sync now.'
    : 'Open Web3Health to sync your data. Your sharing session needs an app open to catch up.';

  await sendOpenAppNudge('Open Web3Health to sync', body);
  await AsyncStorage.setItem(KEY_LAST_NUDGE, new Date(now).toISOString());

  if (__DEV__) console.log('[BG] nudge sent (stale/cooldown/nearEnd):', { isStale, cooledDown, nearEnd });
}

// MUST be module scope
TaskManager.defineTask(SHARE_BG_TASK, async () => {
  try {
    await ensureInitialized();
    const s = useShareStore.getState();

    // Always update breadcrumbs so UI reflects "last seen" even when idle
    const nowISO = new Date().toISOString();

    if (!s.sessionId || s.status !== 'ACTIVE') {
      if (__DEV__) console.log('[BG] skip: no active session');
      await AsyncStorage.setItem(KEY_LAST_RUN, nowISO);
      await AsyncStorage.setItem(KEY_SEGMENTS, String(s.engine?.segmentsSent ?? 0));
      // Even when inactive, consider nudging if somehow very stale (rare, but harmless)
      await maybeNudgeIfStale(Date.parse(nowISO));
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const before = s.engine?.segmentsSent ?? 0;
    if (__DEV__) console.log('[BG] tick() start', { before });

    await s.tick();

    const after = useShareStore.getState().engine?.segmentsSent ?? 0;

    if (__DEV__) console.log('[BG] tick() done', { after, changed: after > before });

    // Write breadcrumbs
    await AsyncStorage.setItem(KEY_LAST_RUN, nowISO);
    await AsyncStorage.setItem(KEY_SEGMENTS, String(after));

    // If we *still* look stale (e.g., tick did nothing), consider a nudge
    await maybeNudgeIfStale(Date.parse(nowISO));

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e: any) {
    console.warn('[BG] task error:', e?.message ?? e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerShareBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (__DEV__) console.log('[BG] getStatusAsync →', status);

    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      console.warn('[BG] Background task not available; relying on foreground polling.');
      return;
    }

    const already = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
    if (already) {
      if (__DEV__) console.log('[BG] task already registered');
      return;
    }

    await BackgroundTask.registerTaskAsync(SHARE_BG_TASK, {
      minimumInterval: __DEV__ ? 15 : 30, // minutes; OS treats as minimum
    });

    if (__DEV__) console.log('[BG] registerTaskAsync → success');
  } catch (e: any) {
    console.warn('[BG] registerTaskAsync → error:', e?.message ?? e);
    throw e;
  }
}

export async function unregisterShareBackgroundTask() {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
    if (already) {
      await BackgroundTask.unregisterTaskAsync(SHARE_BG_TASK);
      if (__DEV__) console.log('[BG] unregisterTaskAsync → success');
    }
  } catch (e: any) {
    console.warn('[BG] unregisterShareBackgroundTask → error:', e?.message ?? e);
  }
}

// DEV-only helper to force immediate run (Android dev client supported)
export async function triggerShareBackgroundTaskForTesting() {
  if (!__DEV__) return;
  try {
    await BackgroundTask.triggerTaskWorkerForTestingAsync();
    console.log('[BG] triggerTaskWorkerForTestingAsync → invoked');
  } catch (e: any) {
    console.warn('[BG] triggerTaskWorkerForTestingAsync → error:', e?.message ?? e);
  }
}
