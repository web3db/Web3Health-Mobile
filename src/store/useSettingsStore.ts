import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettingsState = {
  notificationsEnabled: boolean;
  reminderHour: number;    // local time
  reminderMinute: number;  // local time
  setNotificationsEnabled: (v: boolean) => void;
  setReminderTime: (h: number, m: number) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      notificationsEnabled: false,
      reminderHour: 9,
      reminderMinute: 0,
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setReminderTime: (h, m) => set({ reminderHour: h, reminderMinute: m }),
    }),
    { name: 'settings', storage: createJSONStorage(() => AsyncStorage) }
  )
);
