import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { initNotifications } from '@/src/services/notifications';

interface NotificationContextValue {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextValue>({
  expoPushToken: null,
  notification: null,
});

export function useNotifications() {
  return useContext(NotificationContext);
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Notifications] Must use a physical device for push notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted');
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

  if (!projectId) {
    console.log('[Notifications] Project ID not found in app config');
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  console.log('[Notifications] Push token:', token);
  return token;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);

  useEffect(() => {
    initNotifications();

    registerForPushNotificationsAsync()
      .then(setExpoPushToken)
      .catch((err) => console.log('[Notifications] Registration failed:', err));

    const sub1 = Notifications.addNotificationReceivedListener((n) => {
      setNotification(n);
    });

    const sub2 = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[Notifications] User tapped notification:', data);
    });

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification }}>
      {children}
    </NotificationContext.Provider>
  );
}
