// src/services/notifications/index.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SYNC_CHANNEL_ID = 'web3health-sync';

export async function initNotifications() {
  // Foreground handling (per latest docs: no shouldShowAlert; use banner/list)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
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
