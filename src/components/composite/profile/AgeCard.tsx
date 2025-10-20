import { computeAge, useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

export default function AgeCard() {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  // ✅ Hooks always run in the same order
  const birthYear = (edits.BirthYear ?? profile?.BirthYear) ?? null;
  const age = useMemo(() => (birthYear ? computeAge(birthYear) : null), [birthYear]);

  if (!profile) return null; // ✅ after hooks

  return (
    <View style={{
      backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>Age</Text>
        <Text style={{ color: c.text.secondary, fontWeight: '600' }}>
          {birthYear ? (age != null ? `${age} yrs` : '—') : '—'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>Birth year</Text>
          <TextInput
            value={birthYear != null ? String(birthYear) : ''}
            onChangeText={(t) => {
              const n = parseInt(t || '', 10);
              updateLocal({ BirthYear: Number.isFinite(n) ? n : undefined });
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="1995"
            placeholderTextColor={c.text.muted}
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
