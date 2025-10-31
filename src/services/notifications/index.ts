// src/services/notifications/index.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
export const SYNC_CHANNEL_ID = 'web3health-sync';

// === [ANCHOR: NOTIFY-DEDUPE] avoid spam and duplicates
const KEY_NOTIFY_LAST = 'notify.last.'; // namespaced key prefix

async function throttleOnce(tag: string, minMs: number): Promise<boolean> {
  try {
    const k = KEY_NOTIFY_LAST + tag;
    const prev = await AsyncStorage.getItem(k);
    const now = Date.now();
    if (prev) {
      const last = Number(prev);
      if (Number.isFinite(last) && now - last < minMs) return false; // too soon
    }
    await AsyncStorage.setItem(k, String(now));
    return true;
  } catch {
    // best-effort
    return true;
  }
}


// === [ANCHOR: NOTIFY-API] high-level notification helpers
export async function sendSessionStarted(postingId: number) {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  const allow = await throttleOnce(`started.${postingId}`, 5 * 60 * 1000);
  if (!allow) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sharing started',
      body: 'We’ll send your first segment when data is available.',
      data: { type: 'session-started', postingId },
      ...(Platform.OS === 'android' ? { channelId: SYNC_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function sendSegmentSuccess(postingId: number, dayIndex: number) {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  const allow = await throttleOnce(`segment.${postingId}.${dayIndex}`, 60 * 1000);
  if (!allow) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Day ${dayIndex} shared`,
      body: `Your data for Day ${dayIndex} was sent successfully.`,
      data: { type: 'segment-success', postingId, dayIndex },
      ...(Platform.OS === 'android' ? { channelId: SYNC_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function sendSessionCompleted(postingId: number) {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  const allow = await throttleOnce(`completed.${postingId}`, 5 * 60 * 1000);
  if (!allow) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sharing complete',
      body: 'All segments were sent. Thanks for participating!',
      data: { type: 'session-completed', postingId },
      ...(Platform.OS === 'android' ? { channelId: SYNC_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function sendSessionCancelled(postingId: number, reason?: string) {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  const allow = await throttleOnce(`cancelled.${postingId}`, 5 * 60 * 1000);
  if (!allow) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sharing cancelled',
      body: reason ? reason : 'We could not send data. Tap to fix and retry.',
      data: { type: 'session-cancelled', postingId, reason },
      ...(Platform.OS === 'android' ? { channelId: SYNC_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}


export async function initNotifications() {
  // Foreground handling (per latest docs: no shouldShowAlert; use banner/list)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    // Create the channel before scheduling any notifications that reference it
    await Notifications.setNotificationChannelAsync(SYNC_CHANNEL_ID, {
      name: 'Sync reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      // Omit "sound" here; use channel sounds only if you add custom files in app.json
      vibrationPattern: [250, 250],
      enableVibrate: true,
    });
  }
}

/**
 * Checks (and if necessary, requests) notification permission.
 * Returns true if notifications are allowed.
 */
export async function ensureNotifPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted || cur.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

/**
 * Schedule a local notification prompting the user to open the app.
 * - Immediate by default; pass { delaySeconds } to schedule later.
 */
export async function sendOpenAppNudge(
  title: string,
  body: string,
  opts?: { delaySeconds?: number }
) {
  // Use discriminated trigger shape for time-interval scheduling
  const trigger: Notifications.NotificationTriggerInput | null =
    opts?.delaySeconds && opts.delaySeconds > 0
      ? {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: opts.delaySeconds,
          repeats: false,
        }
      : null; // null => fire immediately

  const content: Notifications.NotificationContentInput = {
    title,
    body,
    data: { type: 'sync-nudge' },
    // Android-only fields; safely ignored on iOS
    ...(Platform.OS === 'android'
      ? {
          channelId: SYNC_CHANNEL_ID,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        }
      : {}),
  };

  return Notifications.scheduleNotificationAsync({ content, trigger });
}

