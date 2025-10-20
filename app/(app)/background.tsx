// app/debug/background.tsx
import { SHARE_BG_TASK, triggerShareBackgroundTaskForTesting } from '@/src/background/shareTask';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import React, { useEffect, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';

const KEY_LAST_RUN = 'bg.lastRunAt';
const KEY_SEGMENTS = 'bg.segmentsSent';

export default function BackgroundDebug() {
  const [status, setStatus] = useState<string>('—');
  const [registered, setRegistered] = useState<string>('—');
  const [lastRunAt, setLastRunAt] = useState<string>('—');
  const [segmentsSent, setSegmentsSent] = useState<string>('—');

  async function refresh() {
    const s = await BackgroundTask.getStatusAsync();
    const r = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
    const lr = (await AsyncStorage.getItem(KEY_LAST_RUN)) ?? '—';
    const seg = (await AsyncStorage.getItem(KEY_SEGMENTS)) ?? '—';
    setStatus(String(s));
    setRegistered(String(r));
    setLastRunAt(lr);
    setSegmentsSent(seg);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function forceRun() {
    await triggerShareBackgroundTaskForTesting();
    // Give the worker a moment to write breadcrumbs
    setTimeout(refresh, 1500);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Background Debug</Text>
      <Text>Status: {status}</Text>
      <Text>Registered: {registered}</Text>
      <Text>Last run: {lastRunAt}</Text>
      <Text>Segments sent: {segmentsSent}</Text>

      <View style={{ height: 8 }} />
      <Button title="Force-run (dev)" onPress={forceRun} />
      <View style={{ height: 8 }} />
      <Button title="Refresh" onPress={refresh} />
      <View style={{ height: 8 }} />
      <Text style={{ opacity: 0.7 }}>
        Tip: background logs appear in `adb logcat`, not Metro. Try:
        {'\n'}adb logcat | grep -i "[BG]\\|WorkManager\\|expo-background-task"
      </Text>
    </ScrollView>
  );
}
