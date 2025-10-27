import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useEffect } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PermissionsScreen() {
  const c = useThemeColors();
  const {
    hcInitialize,
    hcGrantAll,
    hcOpenSettings,
    hcRefresh,
    hcGrantedKeys,
    hcError,
    hcInitialized,
    hcAvailable,
    hcLoading,
  } = useTrackingStore();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        if (!hcInitialized) await hcInitialize();
        await hcRefresh();
      } catch {
        // surfaced via hcError
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hcInitialized]);

  const grantedCount = hcGrantedKeys?.length ?? 0;

  const statusLabel =
    Platform.OS !== 'android' ? 'iOS (HC unavailable)'
    : !hcInitialized ? 'Initializing…'
    : hcAvailable ? 'Health Connect ready'
    : 'Health Connect unavailable';

  return (
    <SafeAreaView edges={['top','bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Header title="Permissions" subtitle="Control what data you allow — you’re in charge." />

        <Card>
          <Row>
            <Badge tone={hcAvailable ? 'success' : 'warning'}>{statusLabel}</Badge>
            <Badge>{grantedCount} grants</Badge>
          </Row>

          <Text style={{ color: c.text.secondary, marginTop: 10 }}>
            Web3Health treats your health signals as data assets. Grant only what you want to
            package and share with buyers. You can revoke anytime in Health Connect settings.
          </Text>

          <Row style={{ marginTop: 14 }}>
            {Platform.OS === 'android' ? (
              hcAvailable ? (
                <>
                  <PrimaryButton label="Grant all read permissions" onPress={hcGrantAll} />
                  <GhostButton label={hcLoading ? 'Refreshing…' : 'Refresh'} onPress={hcRefresh} />
                </>
              ) : (
                <>
                  <PrimaryButton label="Open Health Connect" onPress={hcOpenSettings} />
                  <GhostButton label="Refresh" onPress={hcRefresh} />
                </>
              )
            ) : (
              <>
                <GhostButton label="Open Health Connect" onPress={hcOpenSettings} />
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
            Steps, Floors climbed, Distance, Active calories, Heart rate, Sleep sessions, Weight.
            Read-only. No writes.
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

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <Text
      onPress={onPress}
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

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useThemeColors();
  return (
    <Text
      onPress={onPress}
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
