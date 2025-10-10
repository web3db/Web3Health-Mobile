import Chip from '@/src/components/ui/Chip';
import { bmiCategory, computeBMI, useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useCallback } from 'react';
import { Text, TextInput, View } from 'react-native';

export default function BodyMetricsCard() {
  const c = useThemeColors();
  const { profile, update, toggleUnits } = useProfileStore();

  // ❗ Hooks must be called before any conditional return
  const setUnits = useCallback((u: 'metric' | 'imperial') => {
    toggleUnits(u);
  }, [toggleUnits]);

  if (!profile) return null;

  const bmi = computeBMI(
    profile.height.value ?? null,
    profile.height.unit,
    profile.weight.value ?? null,
    profile.weight.unit
  );
  const cat = bmiCategory(bmi);

  return (
    <View style={{
      backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>Body metrics</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Metric"   selected={profile.units === 'metric'}   onPress={() => setUnits('metric')} />
          <Chip label="Imperial" selected={profile.units === 'imperial'} onPress={() => setUnits('imperial')} />
        </View>
      </View>

      {/* Inputs */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>
            Height ({profile.height.unit})
          </Text>
          <TextInput
            value={profile.height.value != null ? String(profile.height.value) : ''}
            onChangeText={(t) => {
              const n = Number(t);
              update({ height: { value: Number.isFinite(n) ? n : null, unit: profile.height.unit } });
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={profile.height.unit === 'cm' ? '175' : '69'}
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
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>
            Weight ({profile.weight.unit})
          </Text>
          <TextInput
            value={profile.weight.value != null ? String(profile.weight.value) : ''}
            onChangeText={(t) => {
              const n = Number(t);
              update({ weight: { value: Number.isFinite(n) ? n : null, unit: profile.weight.unit } });
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={profile.weight.unit === 'kg' ? '72' : '159'}
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

      {/* BMI */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: c.elevated, borderColor: c.border, borderWidth: 1,
          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
        }}>
          <Text style={{ color: c.text.primary, fontWeight: '600' }}>
            BMI {bmi ?? '—'} · {cat}
          </Text>
        </View>
      </View>
    </View>
  );
}
