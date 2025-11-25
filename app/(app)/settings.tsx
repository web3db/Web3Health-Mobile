import { hkStopBackgroundObservers } from '@/src/services/tracking/healthkit';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useThemeController } from '@/src/theme/ThemeController';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useAuth, useUser } from '@clerk/clerk-expo';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackButton from '../../src/components/ui/BackButton';
export default function SettingsScreen() {
  const c = useThemeColors();
  const { appearanceOverride, setAppearanceOverride } = useThemeController();
  const { signOut } = useAuth();
  const { user, isLoaded } = useUser();

  // const onLogout = async () => {
  //   try {
  //     await signOut();                // end Clerk session
  //   } finally {
  //     useAuthStore.getState().clear(); // clear local app auth state
  //   }
  // };

  const onLogout = async () => {
  try {
    // iOS: stop HealthKit observers first so background wakes stop immediately
    if (Platform.OS === 'ios') {
      try { await hkStopBackgroundObservers(); } catch {}
    }
    await signOut();                 // end Clerk session
  } finally {
    useAuthStore.getState().clear(); // clear local app auth state
  }
};

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <BackButton />
      <View style={{ padding: 16 }}>
        <Section title="Appearance">
          <Segmented3
            options={[
              { key: 'system', label: 'System', icon: 'phone-portrait-outline' as const },
              { key: 'light',  label: 'Light',  icon: 'sunny-outline' as const },
              { key: 'dark',   label: 'Dark',   icon: 'moon-outline' as const },
            ]}
            value={appearanceOverride as 'system' | 'light' | 'dark'}
            onChange={(v) => setAppearanceOverride(v)}
          />
        </Section>

        <Section title="Account">
          <View style={{ paddingHorizontal: 8, gap: 8 }}>
            {!isLoaded ? (
              <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : (
              <SettingRow
                icon="person-circle-outline"
                label={user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
                disabled
              />
            )}

            <SettingRow
              icon="log-out-outline"
              label="Sign out"
              destructive
              onPress={onLogout}
            />
          </View>
        </Section>
      </View>
    </SafeAreaView>
  );
}

/* ---------- UI bits (unchanged) ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View style={{
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      marginBottom: 16
    }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
        <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      </View>
      <View style={{ padding: 8 }}>{children}</View>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  destructive,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const c = useThemeColors();
  const color = destructive ? (c.danger ?? '#ef4444') : c.text.primary;

  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: c.surface,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={{ color, fontSize: 15, fontWeight: destructive ? '700' : '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Segmented3<T extends 'system' | 'light' | 'dark'>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.muted, borderRadius: 12, padding: 4, marginHorizontal: 8 }}>
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: selected ? c.primary : 'transparent',
            }}
          >
            <Ionicons name={opt.icon} size={16} color={selected ? (c.text.inverse ?? '#fff') : c.text.secondary} />
            <Text style={{ color: selected ? (c.text.inverse ?? '#fff') : c.text.secondary, fontWeight: '700', fontSize: 13 }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
