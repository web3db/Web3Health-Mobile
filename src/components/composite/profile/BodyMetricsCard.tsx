import Chip from '@/src/components/ui/Chip';
import { bmiCategory, computeBMI, useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

function unitLabels(measurementSystemId?: number | null) {
  // Fallback to Metric if unknown
  if (measurementSystemId === 2) return { height: 'in', weight: 'lb' };
  return { height: 'cm', weight: 'kg' };
}

export default function BodyMetricsCard() {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  // ✅ Hooks (and all derived values used by hooks) must run before any early return
  const msId = (edits.MeasurementSystemId ?? profile?.MeasurementSystemId ?? 1) as number;
  const { height: heightUnit, weight: weightUnit } = unitLabels(msId);

  const heightVal = edits.HeightNum ?? profile?.HeightNum ?? null;
  const weightVal = edits.WeightNum ?? profile?.WeightNum ?? null;

  const bmi = useMemo(() => {
    return computeBMI(
      heightVal,
      heightUnit as 'cm' | 'in',
      weightVal,
      weightUnit as 'kg' | 'lb'
    );
  }, [heightVal, heightUnit, weightVal, weightUnit]);

  const cat = bmiCategory(bmi);

  // You can still bail from rendering after hooks have run
  if (!profile) return null;

  return (
    <View style={{
      backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>Body metrics</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip
            label="Metric"
            selected={msId === 1}
            onPress={() => updateLocal({ MeasurementSystemId: 1 /* optionally set HeightUnitId/WeightUnitId here */ })}
          />
          <Chip
            label="Imperial"
            selected={msId === 2}
            onPress={() => updateLocal({ MeasurementSystemId: 2 /* optionally set HeightUnitId/WeightUnitId here */ })}
          />
        </View>
      </View>

      {/* Inputs */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>
            Height ({heightUnit})
          </Text>
          <TextInput
            value={heightVal != null ? String(heightVal) : ''}
            onChangeText={(t) => {
              const n = Number(t);
              updateLocal({ HeightNum: Number.isFinite(n) ? n : undefined });
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={heightUnit === 'cm' ? '175' : '69'}
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
            Weight ({weightUnit})
          </Text>
          <TextInput
            value={weightVal != null ? String(weightVal) : ''}
            onChangeText={(t) => {
              const n = Number(t);
              updateLocal({ WeightNum: Number.isFinite(n) ? n : undefined });
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={weightUnit === 'kg' ? '72' : '159'}
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
