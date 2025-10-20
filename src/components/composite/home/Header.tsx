import Avatar from '@/src/components/ui/Avatar';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

export default function Header() {
  const c = useThemeColors();
  const router = useRouter();

  // 🔹 read only what we need to avoid extra re-renders
  const rawName = useProfileStore(s => s.profile?.Name ?? null);
  const rawEmail = useProfileStore(s => s.profile?.Email ?? null);

  // "Welcome, Mohit" if available, else just "Welcome"
  const welcomeLine = useMemo(() => {
    const candidate = (rawName?.trim()?.length ? rawName!.trim() : null)
      ?? (rawEmail && rawEmail.includes('@') ? rawEmail.split('@')[0] : null);
    if (!candidate) return 'Welcome';
    const first = candidate.split(/\s+/)[0]; // first name only
    return `Welcome, ${first}`;
  }, [rawName, rawEmail]);

  const {
    hcInitialized,
    hcAvailable,
    hcLoading,
    hcGrantedKeys,
    hcRefresh,
    hcGrantAll,
    hcError,
  } = useTrackingStore();

  const status = useMemo(() => {
    if (Platform.OS !== 'android') {
      return { label: 'Health Connect is Android-only', tint: c.text.muted, action: null as null | 'none' };
    }
    if (!hcInitialized) {
      return { label: 'Preparing Health Connect…', tint: c.text.secondary, action: null };
    }
    if (hcAvailable === false) {
      return { label: 'Health Connect not available', tint: c.warning, action: 'settings' as const };
    }
    const hasPerms = (hcGrantedKeys?.length ?? 0) > 0;
    if (!hasPerms) {
      return { label: 'Permissions needed', tint: c.warning, action: 'grant' as const };
    }
    if (hcLoading) {
      return { label: 'Syncing…', tint: c.text.secondary, action: 'refresh' as const };
    }
    if (hcError) {
      return { label: `Error: ${hcError}`, tint: 'tomato', action: 'refresh' as const };
    }
    return { label: 'Health Connect: Connected', tint: c.success, action: 'refresh' as const };
  }, [c, hcAvailable, hcError, hcGrantedKeys, hcInitialized, hcLoading]);

  const onPrimaryAction = async () => {
    if (status.action === 'refresh') await hcRefresh();
    if (status.action === 'grant') await hcGrantAll();
  };

  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View>
        <Text style={{ color: c.text.secondary, fontSize: 12 }}>{date}</Text>
        <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '800' }}>
          {welcomeLine}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Dot color={status.tint} />
          <Text style={{ color: c.text.muted, fontSize: 11 }}>{status.label}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {status.action && status.action !== 'none' ? (
          <Pressable onPress={onPrimaryAction} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons
              name={
                status.action === 'refresh' ? 'refresh' :
                status.action === 'grant'   ? 'key-outline' : 'settings-outline'
              }
              size={20}
              color={c.text.secondary}
            />
          </Pressable>
        ) : null}
        <Avatar onPress={() => router.push('/profile')} />
      </View>
    </View>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}
