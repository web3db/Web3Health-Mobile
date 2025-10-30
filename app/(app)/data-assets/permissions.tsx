import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useEffect } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PermissionsScreen() {
  const c = useThemeColors();
  const {
    // ANDROID
    hcInitialize,
    hcGrantAll,
    hcOpenSettings,
    hcRefresh,
    hcGrantedKeys,
    hcError,
    hcInitialized,
    hcAvailable,
    hcLoading,

    // iOS
    hkOpenSettings,
    hkRefresh,

    // Cross-platform
    healthAvailable,
    healthGranted,
    probeHealthPlatform,
  } = useTrackingStore();

  // Android: initialize HC once, then refresh
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        if (!hcInitialized) await hcInitialize();
        await hcRefresh();
      } catch {
        /* surfaced via hcError */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hcInitialized]);

  // iOS: silent probe (warm auth check) on mount so the screen reflects reality
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    (async () => {
      try {
        await probeHealthPlatform(); // will set healthAvailable/healthGranted and hk observers if granted
        await hkRefresh();           // populate datasets/keys meta for badges
      } catch {
        /* surfaced via hcError */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAndroid = Platform.OS === 'android';
  const isIOS = Platform.OS === 'ios';

  // Availability & status labels
  const available = isAndroid ? hcAvailable : healthAvailable;
  const grantedCount = hcGrantedKeys?.length ?? 0;

  const statusLabel =
    isAndroid
      ? (!hcInitialized ? 'Initializing…'
         : available ? 'Health Connect ready'
         : 'Health Connect unavailable')
      : (available ? (healthGranted ? 'Apple Health ready' : 'Apple Health detected')
         : 'Apple Health unavailable');

  return (
    <SafeAreaView edges={['top','bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Header title="Permissions" subtitle="Control what data you allow — you’re in charge." />

        <Card>
          <Row>
            <Badge tone={available ? 'success' : 'warning'}>{statusLabel}</Badge>
            <Badge>{grantedCount} grants</Badge>
          </Row>

          <Text style={{ color: c.text.secondary, marginTop: 10 }}>
            Web3Health treats your health signals as data assets. Grant only what you want to
            package and share with buyers. You can revoke access any time in
            {isAndroid ? ' Health Connect settings.' : ' iOS Settings → Health.'}
          </Text>

          <Row style={{ marginTop: 14 }}>
            {isAndroid ? (
              available ? (
                <>
                  <PrimaryButton label="Grant all read permissions" onPress={hcGrantAll} />
                  <GhostButton label={hcLoading ? 'Refreshing…' : 'Refresh'} onPress={hcRefresh} />
                  <GhostButton label="Open Health Connect" onPress={hcOpenSettings} />
                </>
              ) : (
                <>
                  <PrimaryButton label="Open Health Connect" onPress={hcOpenSettings} />
                  <GhostButton label="Refresh" onPress={hcRefresh} />
                </>
              )
            ) : (
              // iOS actions
              <>
                {/* One-tap sheet trigger (silent if already granted) */}
                <PrimaryButton label="Grant all read permissions" onPress={probeHealthPlatform} />
                <GhostButton label="Refresh" onPress={hkRefresh} />
                <GhostButton label="Open Health" onPress={hkOpenSettings} />
              </>
            )}
          </Row>

          {hcError ? <Text style={{ color: 'tomato', marginTop: 10 }}>Error: {hcError}</Text> : null}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '800' }}>
            What we may request
          </Text>
          <Text style={{ color: c.text.secondary, marginTop: 6 }}>
            Steps, Floors climbed, Distance, Active calories, Heart rate, Sleep, Weight, Respiratory rate.
            Read-only. We never write to your health data.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const c = useThemeColors();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}>
      <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '900' }}>{title}</Text>
      {!!subtitle && <Text style={{ color: c.text.secondary, marginTop: 4 }}>{subtitle}</Text>}
    </View>
  );
}

function Card({ children, style }: React.PropsWithChildren<{ style?: any }>) {
  const c = useThemeColors();
  return (
    <View
      style={[
        {
          marginHorizontal: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Row({ children, style }: React.PropsWithChildren<{ style?: any }>) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, style]}>{children}</View>;
}

function Badge({ children, tone }: React.PropsWithChildren<{ tone?: 'success' | 'warning' }>) {
  const c = useThemeColors();
  const bg = tone === 'success' ? c.success : tone === 'warning' ? c.warning : c.muted;
  const color = tone ? c.text.inverse : c.text.primary;
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: bg }}>
      <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{children}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void | Promise<void> }) {
  const c = useThemeColors();
  return (
    <Text
      onPress={() => void onPress()}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: c.primary,
        color: c.text.inverse,
        fontWeight: '800',
        overflow: 'hidden',
      }}
    >
      {label}
    </Text>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void | Promise<void> }) {
  const c = useThemeColors();
  return (
    <Text
      onPress={() => void onPress()}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        color: c.text.primary,
        fontWeight: '800',
        overflow: 'hidden',
      }}
    >
      {label}
    </Text>
  );
}
