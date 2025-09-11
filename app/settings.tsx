import { useThemeController } from '@/src/theme/ThemeController';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const c = useThemeColors();
  const { appearanceOverride, setAppearanceOverride } = useThemeController();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
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
      </View>
    </SafeAreaView>
  );
}

/* ---------- UI bits ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, marginBottom: 16 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
        <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '700' }}>{title}</Text>
      </View>
      <View style={{ padding: 8 }}>{children}</View>
    </View>
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
