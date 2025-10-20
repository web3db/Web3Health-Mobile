import Chip from '@/src/components/ui/Chip';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export type HCOption = { id: number; label: string; code?: string | null; active?: boolean };

type Props = {
  label?: string;
  options: HCOption[] | null;
  values: number[];
  onToggle: (id: number) => void;
  disabled?: boolean;
  emptyText?: string;
};

export default function HealthConditionsMultiSelect({
  label,
  options,
  values,
  onToggle,
  disabled,
  emptyText = 'No options',
}: Props) {
  const c = useThemeColors();

  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text style={{ color: c.text.primary, fontWeight: '600' }}>{label}</Text>
      ) : null}

      {!options?.length ? (
        <Text style={{ color: c.text.muted }}>{emptyText}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((opt) => {
            const selected = values.includes(opt.id);
            const inactive = opt.active === false;
            return (
              <Pressable
                key={opt.id}
                disabled={disabled}
                onPress={() => onToggle(opt.id)}
              >
                <Chip
                  label={opt.label}
                  selected={selected}
                  style={inactive ? { opacity: 0.6 } : undefined}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
