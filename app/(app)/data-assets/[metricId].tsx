// app/data-assets/[metricId].tsx
import DataWindowSelector from '@/src/components/composite/assets/DataWindowSelector';
import MetricChart from '@/src/components/composite/assets/MetricChart';
import { useTrackingStore, type MetricKey } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MetricDetails() {
  const { metricId } = useLocalSearchParams<{ metricId?: string | string[] }>();
  const key = decodeURIComponent(Array.isArray(metricId) ? metricId?.[0] ?? '' : metricId ?? '');

  const c = useThemeColors();
  const {
    // shared data
    hcDatasets,
    hcWindow,
    hcLoading,
    hcSetWindow,
    hcError,
    hcInitialized,
    hcAvailable,
    hcGrantedKeys,
    hcTimezoneLabel,

    // iOS bits
    hkRefresh,
    hkOpenSettings,

    // Android bits
    hcRefresh,

    // cross-platform
    healthAvailable,
    healthGranted,
    probeHealthPlatform,
  } = useTrackingStore();

  const isAndroid = Platform.OS === 'android';
  const isIOS = Platform.OS === 'ios';

  const onWindowChange = useCallback(
    async (w: '24h' | '7d' | '30d' | '90d') => {
      if (w === hcWindow) return;
      await hcSetWindow(w); // store routes refresh per platform automatically
      // Optional: extra nudge for iOS to ensure fresh data after window switch
      if (isIOS && healthGranted) {
        try { await hkRefresh(); } catch {}
      }
    },
    [hcSetWindow, hcWindow, isIOS, healthGranted, hkRefresh]
  );

  /** ───────────────────────── Availability & gating ───────────────────────── */
  const available = isAndroid ? hcAvailable : healthAvailable;
  const initialized = isAndroid ? hcInitialized : true; // iOS doesn't use a separate init screen
  const hasPerms = (hcGrantedKeys?.length ?? 0) > 0;

  // Android-only init screen
  if (isAndroid && !initialized) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
        <Text style={{ color: c.text.primary, padding: 16 }}>Initializing Health Connect…</Text>
        {hcError ? <Text style={{ color: 'tomato', paddingHorizontal: 16 }}>Error: {hcError}</Text> : null}
      </SafeAreaView>
    );
  }

  // Not available
  if (available === false) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '800' }}>
            {isAndroid ? 'Health Connect not available' : 'Apple Health not available'}
          </Text>
          <Text style={{ color: c.text.secondary, marginTop: 8 }}>
            {isAndroid
              ? 'Install/enable Health Connect and connect a source (Google Fit, Samsung Health…), then try again.'
              : 'Ensure Apple Health is installed and has sources (e.g., Apple Watch) writing data.'}
          </Text>
          <Pressable
            onPress={isAndroid ? hcRefresh : hkRefresh}
            style={{
              alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface
            }}
          >
            <Text style={{ color: c.text.primary, fontWeight: '800' }}>Refresh</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Missing permissions
  if (!hasPerms) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '800' }}>
            {isAndroid ? 'Grant access to Health Connect' : 'Grant access to Apple Health'}
          </Text>
          <Text style={{ color: c.text.secondary, marginTop: 8 }}>
            Choose which metrics you allow us to read. You can revoke anytime in {isAndroid ? 'Health Connect' : 'iOS Settings › Health'}.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <ChipButton label="Grant all" onPress={probeHealthPlatform} />
            <ChipButton label={isAndroid ? 'Open HC' : 'Open Health'} onPress={isAndroid ? undefined : hkOpenSettings} />
            <ChipButton label="Refresh" onPress={isAndroid ? hcRefresh : hkRefresh} />
          </View>
          {hcError ? <Text style={{ color: 'tomato', marginTop: 8 }}>Error: {hcError}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  /** ───────────────────────── Find dataset ───────────────────────── */
  const d = useMemo(() => hcDatasets.find(x => x.id === (key as MetricKey)), [hcDatasets, key]);

  // Still loading or no datasets yet
  if (!hcDatasets || hcDatasets.length === 0) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
        <Text style={{ color: c.text.primary, padding: 16 }}>Loading dataset…</Text>
        {hcError ? <Text style={{ color: 'tomato', paddingHorizontal: 16 }}>Error: {hcError}</Text> : null}
      </SafeAreaView>
    );
  }

  // Not found
  if (!d) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
        <Text style={{ color: c.text.primary, padding: 16 }}>
          Dataset not found for “{key}”.
        </Text>
      </SafeAreaView>
    );
  }

  /** ───────────────────────── Render dataset ───────────────────────── */
  const numericBuckets = useMemo(
    () => d.buckets.map(b => ({ ...b, value: Number(b.value ?? 0) })),
    [d.buckets]
  );

  const isHourly = hcWindow === '24h';

  const tzLabel = useMemo(() => {
    if (hcTimezoneLabel) return hcTimezoneLabel;
    try {
      const iana = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offsetMinutes = -new Date().getTimezoneOffset(); // minutes east of UTC
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const abs = Math.abs(offsetMinutes);
      const hh = String(Math.floor(abs / 60)).padStart(2, '0');
      const mm = String(abs % 60).padStart(2, '0');
      return `${iana ?? 'Local'} (UTC${sign}${hh}:${mm})`;
    } catch {
      return 'Local time';
    }
  }, [hcTimezoneLabel]);

  const breakdownRows = useMemo(() => {
    const rows = [...numericBuckets].sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );
    return rows;
  }, [numericBuckets]);

  const PAGE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const hasMore = breakdownRows.length > visibleCount;
  const showMore = () => setVisibleCount(c => Math.min(c + PAGE, breakdownRows.length));

  const coverageTotal =
    hcWindow === '24h' ? 24 :
      hcWindow === '7d' ? 7 :
        hcWindow === '30d' ? 30 : 90;

  const coverageCount = useMemo(() => {
    if (d.meta?.coverageCount != null) return d.meta.coverageCount;
    return numericBuckets.filter(b => (Number(b.value) || 0) > 0).length;
  }, [d.meta?.coverageCount, numericBuckets]);

  const isHeartRate = d.id === 'heartRate';
  const headlineNumber = isHeartRate
    ? (d.latest != null ? Number(d.latest) : 0)
    : Math.round(Number(d.total || 0));

  const hasAnyDataInWindow = isHeartRate
    ? (d.latest != null && Number(d.latest) > 0) || numericBuckets.some(b => Number(b.value) > 0)
    : numericBuckets.some(b => Number(b.value) > 0);

  const headlineSafe = hasAnyDataInWindow ? headlineNumber : 0;
  const primaryText = `${headlineSafe} ${d.unit}`;

  const trendLabel = d.trend
    ? (d.trend.dir === 'up' ? '↑' : d.trend.dir === 'down' ? '↓' : '→') +
      (typeof d.trend.pct === 'number' ? ` ${d.trend.pct > 0 ? '+' : ''}${Math.round(d.trend.pct)}%` : '')
    : '→ n/a';

  const freshnessLabel = formatFreshness(d.freshnessISO);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}>
          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '900' }}>{d.label}</Text>
          <View style={{ marginTop: 8 }}>
            <DataWindowSelector value={hcWindow} onChange={onWindowChange} />
          </View>
          <Text
            accessibilityLabel="Current timezone"
            style={{ color: c.text.secondary, opacity: 0.7, fontSize: 12, marginTop: 6 }}
          >
            Using timezone: {tzLabel}
          </Text>
        </View>

        {/* Optional error banner */}
        {hcError ? (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Text style={{ color: 'tomato' }}>Error: {hcError}</Text>
          </View>
        ) : null}

        {/* Hero tiles */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 10 }}>
          <Stat label="Primary" value={primaryText} />
          <Stat
            label={hcWindow === '24h' ? 'Hours with data' : 'Days with data'}
            value={`${coverageCount} / ${coverageTotal}`}
          />
          <Stat label="Trend" value={trendLabel} />
          <Stat label="Freshness" value={freshnessLabel} />
          <Stat label="Timezone" value={tzLabel} />
        </View>

        {/* Chart */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <MetricChart
            buckets={numericBuckets}
            granularity={hcWindow === '24h' ? 'hourly' : 'daily'}
            unit={d.unit}
            emptyLabel={hcLoading ? 'Loading…' : 'No data in this window'}
          />
        </View>

        {/* Breakdown */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <Text style={{ color: c.text.secondary, opacity: 0.7, fontSize: 12, marginBottom: 6 }}>
            Timestamps shown in {tzLabel}
          </Text>
          {breakdownRows.slice(0, visibleCount).map((b, i) => (
            <Text key={i} style={{ color: c.text.secondary, marginBottom: 4 }}>
              {formatBucketStamp(b.start, isHourly)} — {Math.round(Number(b.value || 0))} {d.unit}
            </Text>
          ))}

          {hasMore && (
            <Pressable
              onPress={showMore}
              style={{
                alignSelf: 'flex-start',
                marginTop: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.surface,
              }}
            >
              <Text style={{ color: c.text.primary, fontWeight: '800' }}>
                Load {Math.min(PAGE, breakdownRows.length - visibleCount)} more
              </Text>
            </Pressable>
          )}

          {!hasMore && breakdownRows.length > 0 && (
            <Text style={{ color: c.text.muted ?? c.text.secondary, marginTop: 8 }}>
              End of list · {breakdownRows.length} {isHourly ? 'hours' : 'days'}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useThemeColors();
  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10
    }}>
      <Text style={{ color: c.text.secondary, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: c.text.primary, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

// Simple freshness formatter
function formatFreshness(iso?: string) {
  if (!iso) return '—';
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const deltaSec = Math.max(0, Math.floor((now - t) / 1000));
    if (deltaSec < 60) return 'Just now';
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function formatBucketStamp(iso: string, isHourly: boolean) {
  const d = new Date(iso);
  if (isHourly) {
    return d.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString([], { month: 'short', day: '2-digit' });
}

function ChipButton({ label, onPress }: { label: string; onPress?: () => void | Promise<void> }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={() => void onPress?.()}
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface
      }}
    >
      <Text style={{ color: c.text.primary, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
