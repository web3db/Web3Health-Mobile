// // app/debug/background.tsx
// import { SHARE_BG_TASK, triggerShareBackgroundTaskForTesting } from '@/src/background/shareTask';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import * as BackgroundTask from 'expo-background-task';
// import * as TaskManager from 'expo-task-manager';
// import React, { useEffect, useState } from 'react';
// import { Button, ScrollView, Text, View } from 'react-native';

// const KEY_LAST_RUN = 'bg.lastRunAt';
// const KEY_SEGMENTS = 'bg.segmentsSent';

// export default function BackgroundDebug() {
//   const [status, setStatus] = useState<string>('—');
//   const [registered, setRegistered] = useState<string>('—');
//   const [lastRunAt, setLastRunAt] = useState<string>('—');
//   const [segmentsSent, setSegmentsSent] = useState<string>('—');

//   async function refresh() {
//     const s = await BackgroundTask.getStatusAsync();
//     const r = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
//     const lr = (await AsyncStorage.getItem(KEY_LAST_RUN)) ?? '—';
//     const seg = (await AsyncStorage.getItem(KEY_SEGMENTS)) ?? '—';
//     setStatus(String(s));
//     setRegistered(String(r));
//     setLastRunAt(lr);
//     setSegmentsSent(seg);
//   }

//   useEffect(() => {
//     refresh();
//   }, []);

//   async function forceRun() {
//     await triggerShareBackgroundTaskForTesting();
//     // Give the worker a moment to write breadcrumbs
//     setTimeout(refresh, 1500);
//   }

//   return (
//     <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
//       <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Background Debug</Text>
//       <Text>Status: {status}</Text>
//       <Text>Registered: {registered}</Text>
//       <Text>Last run: {lastRunAt}</Text>
//       <Text>Segments sent: {segmentsSent}</Text>

//       <View style={{ height: 8 }} />
//       <Button title="Force-run (dev)" onPress={forceRun} />
//       <View style={{ height: 8 }} />
//       <Button title="Refresh" onPress={refresh} />
//       <View style={{ height: 8 }} />
//       <Text style={{ opacity: 0.7 }}>
//         Tip: background logs appear in `adb logcat`, not Metro. Try:
//         {'\n'}adb logcat | grep -i "[BG]\\|WorkManager\\|expo-background-task"
//       </Text>
//     </ScrollView>
//   );
// }

// app/background.tsx
import { SHARE_BG_TASK, triggerShareBackgroundTaskForTesting } from '@/src/background/shareTask';
import { isShareReady, useShareStore } from '@/src/store/useShareStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import React, { useEffect, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';

const KEY_LAST_RUN = 'bg.lastRunAt';
const KEY_SEGMENTS = 'bg.segmentsSent';
const KEY_LAST_SNAPSHOT = 'bg.lastSnapshotJson';

const labelOfMetric = (m: string) => {
  switch (m) {
    case 'STEPS': return 'Steps';
    case 'FLOORS': return 'Floors';
    case 'DISTANCE': return 'Distance';
    case 'KCAL': return 'Active Calories';
    case 'HR': return 'Heart Rate';
    case 'SLEEP': return 'Sleep';
    default: return String(m);
  }
};
const list = (arr?: string[]) =>
  (arr && arr.length ? arr.map(labelOfMetric).join(', ') : '—');

export default function BackgroundDebug() {
  // OS/worker state + breadcrumbs
  const [status, setStatus] = useState<string>('—');
  const [registered, setRegistered] = useState<string>('—');
  const [lastRunAt, setLastRunAt] = useState<string>('—');
  const [segmentsSent, setSegmentsSent] = useState<string>('—');
  const [snapshot, setSnapshot] = useState<any>(null);

  // Live store state
  const s = useShareStore();
  const eng = s.engine;
  const diag = s.lastWindowDiag;

  async function refresh() {
    const s0 = await BackgroundTask.getStatusAsync();
    const r0 = await TaskManager.isTaskRegisteredAsync(SHARE_BG_TASK);
    const lr = (await AsyncStorage.getItem(KEY_LAST_RUN)) ?? '—';
    const seg = (await AsyncStorage.getItem(KEY_SEGMENTS)) ?? '—';
    const snapStr = await AsyncStorage.getItem(KEY_LAST_SNAPSHOT);

    setStatus(String(s0));
    setRegistered(String(r0));
    setLastRunAt(lr);
    setSegmentsSent(seg);
    setSnapshot(snapStr ? JSON.parse(snapStr) : null);
  }

  useEffect(() => { refresh(); }, []);

  async function forceRun() {
    try {
      await triggerShareBackgroundTaskForTesting();
    } finally {
      setTimeout(refresh, 1500);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 18 }}>Background Debug</Text>

      {/* OS Worker Section */}
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#14161e', gap: 6 }}>
        <Text style={{ color: '#dbe0ea', fontWeight: '700' }}>OS Worker</Text>
        <Text style={{ color: '#9aa3b2' }}>Status: {status}</Text>
        <Text style={{ color: '#9aa3b2' }}>Registered: {registered}</Text>
        <Text style={{ color: '#9aa3b2' }}>Last run: {lastRunAt}</Text>
        <Text style={{ color: '#9aa3b2' }}>Segments sent: {segmentsSent}</Text>
        <View style={{ height: 8 }} />
        <Button title="Force-run (dev)" onPress={forceRun} />
        <View style={{ height: 8 }} />
        <Button title="Refresh" onPress={refresh} />
      </View>

      {/* Live Store Section */}
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#14161e', gap: 6 }}>
        <Text style={{ color: '#dbe0ea', fontWeight: '700' }}>Live Store</Text>
        <Text style={{ color: '#9aa3b2' }}>Ready: {String(isShareReady())}</Text>
        <Text style={{ color: '#9aa3b2' }}>Store status: {s.status}</Text>
        <Text style={{ color: '#9aa3b2' }}>SessionId: {String(s.sessionId ?? 'null')}</Text>
        <Text style={{ color: '#9aa3b2' }}>
          Engine: {eng?.status} | sent={eng?.segmentsSent ?? 0} | lastIdx={eng?.lastSentDayIndex ?? 'null'}
        </Text>

        <Text style={{ color: '#dbe0ea', fontWeight: '600', marginTop: 6 }}>Last Window Diag (live)</Text>
        <Text style={{ color: '#9aa3b2' }}>Day: {diag?.dayIndex ?? '—'}</Text>
        <Text style={{ color: '#9aa3b2' }}>Unavailable: {list(diag?.unavailable)}</Text>
        <Text style={{ color: '#9aa3b2' }}>No data: {list(diag?.zeroData)}</Text>
        <Text style={{ color: '#9aa3b2' }}>Had any data: {String(diag?.hadAnyData ?? '—')}</Text>
      </View>

      {/* Snapshot Section */}
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#14161e', gap: 6 }}>
        <Text style={{ color: '#dbe0ea', fontWeight: '700' }}>Last Snapshot</Text>
        <Text style={{ color: '#9aa3b2' }}>Label: {snapshot?.label ?? '—'}</Text>
        <Text style={{ color: '#9aa3b2' }}>At: {snapshot?.at ?? '—'}</Text>
        <Text style={{ color: '#9aa3b2' }}>Ready: {String(snapshot?.ready ?? '—')}</Text>
        <Text style={{ color: '#9aa3b2' }}>Store status: {snapshot?.storeStatus ?? '—'}</Text>
        <Text style={{ color: '#9aa3b2' }}>Perm OK: {String(snapshot?.permOk ?? '—')}</Text>
        <Text style={{ color: '#9aa3b2' }}>Missing perms: {list(snapshot?.permMissing)}</Text>
        <Text style={{ color: '#9aa3b2' }}>Metric keys: {list(snapshot?.metricMapKeys)}</Text>
        <Text style={{ color: '#9aa3b2' }}>
          Engine: {snapshot?.engine?.status ?? '—'} | sent={snapshot?.engine?.segmentsSent ?? '—'} | lastIdx={snapshot?.engine?.lastSentDayIndex ?? '—'}
        </Text>

        <Text style={{ color: '#dbe0ea', fontWeight: '600', marginTop: 6 }}>Diag (last window)</Text>
        <Text style={{ color: '#9aa3b2' }}>Day: {snapshot?.lastDiag?.dayIndex ?? '—'}</Text>
        <Text style={{ color: '#9aa3b2' }}>Unavailable: {list(snapshot?.lastDiag?.unavailable)}</Text>
        <Text style={{ color: '#9aa3b2' }}>No data: {list(snapshot?.lastDiag?.zeroData)}</Text>
        <Text style={{ color: '#9aa3b2' }}>Had any data: {String(snapshot?.lastDiag?.hadAnyData ?? '—')}</Text>

        <View style={{ height: 12 }} />
        <Text style={{ color: '#7f8aa3', fontSize: 12 }}>
          Tip: background logs appear in adb logcat, not Metro. Try:
          {'\n'}adb logcat | grep -i "[BG]\\|WorkManager\\|expo-background-task"
        </Text>
      </View>
    </ScrollView>
  );
}

