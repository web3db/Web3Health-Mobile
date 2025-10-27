// src/components/composite/sync/SyncStatusPanel.tsx
import { useShareSyncMonitor } from '@/src/hooks/useShareSyncMonitor';
import React, { useMemo } from 'react';
import { Button, Text, View } from 'react-native';

function fmtBoth(iso: string) {
  const d = new Date(iso);
  const utc = d.toUTCString().replace(' GMT', ' UTC');
  // EDT formatting: use en-US with a fixed timeZone; shows local EDT if device TZ differs.
  const edt = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: true, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return { utc, edt };
}

export default function SyncStatusPanel() {
  const { state, syncNow } = useShareSyncMonitor();

  const last = state.lastRunAtISO ? fmtBoth(state.lastRunAtISO) : undefined;
  const nextStart = fmtBoth(state.nextWindowStartUtcISO);
  const nextEnd = fmtBoth(state.nextWindowEndUtcISO);

  const staleBadge = useMemo(() => (
    <Text style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden',
                   backgroundColor: state.isStale24h ? '#FCE8E6' : '#E6F4EA',
                   color: state.isStale24h ? '#C5221F' : '#137333',
                   alignSelf: 'flex-start', marginBottom: 6 }}>
      {state.isStale24h ? 'Stale (>24h)' : 'Healthy (<24h)'}
    </Text>
  ), [state.isStale24h]);

  return (
    <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e2e2', backgroundColor: '#fff', gap: 6 }}>
      <Text style={{ fontWeight: '700', fontSize: 16 }}>Sync Status</Text>
      {staleBadge}
      <Text>Last tick:</Text>
      <Text style={{ fontFamily: 'monospace' }}>
        {state.lastRunAtISO ? (`EDT: ${last?.edt}\nUTC: ${last?.utc}`) : '— never —'}
      </Text>

      <View style={{ height: 8 }} />

      <Text>Current window:</Text>
      <Text style={{ fontFamily: 'monospace' }}>
        {`Start  → EDT: ${nextStart.edt}\n           UTC: ${nextStart.utc}\nEnd    → EDT: ${nextEnd.edt}\n           UTC: ${nextEnd.utc}`}
      </Text>

      <View style={{ height: 12 }} />
      <Button title="Sync Now (foreground)" onPress={syncNow} />
      <Text style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>
        Tip: Background logs appear in adb logcat, not Metro. Use a dev-only trigger to simulate a background run.
      </Text>
    </View>
  );
}
