import { computeAge, useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, TextInput, View } from 'react-native';

export default function AgeCard() {
  const c = useThemeColors();
  const { profile, update } = useProfileStore();
  if (!profile) return null;

  const age = computeAge(profile.birthYear, profile.birthDate);

  return (
    <View style={{
      backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>Age</Text>
        <Text style={{ color: c.text.secondary, fontWeight: '600' }}>
          {age != null ? `${age} yrs` : '—'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>Birth year</Text>
          <TextInput
            value={String(profile.birthYear ?? '')}
            onChangeText={(t) => {
              const n = parseInt(t || '0', 10);
              if (!Number.isNaN(n)) update({ birthYear: n });
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="1999"
            placeholderTextColor={c.text.muted}
            style={{
              color: c.text.primary,
              backgroundColor: c.elevated,
              borderColor: c.border, borderWidth: 1, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 8,
            }}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>Birth date (optional)</Text>
          <TextInput
            value={profile.birthDate ?? ''}
            onChangeText={(t) => update({ birthDate: t })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={c.text.muted}
            autoCapitalize="none"
            style={{
              color: c.text.primary,
              backgroundColor: c.elevated,
              borderColor: c.border, borderWidth: 1, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 8,
            }}
          />
        </View>
      </View>
    </View>
  );
}
