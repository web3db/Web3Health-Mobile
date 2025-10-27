import Chip from '@/src/components/ui/Chip';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export type DropdownOption = { id: number; label: string };

type Props = {
  label?: string;
  options: DropdownOption[] | null;
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
  emptyText?: string;
};

export default function Dropdown({
  label,
  options,
  value,
  onChange,
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
          {options.map((opt) => (
            <Pressable
              key={opt.id}
              disabled={disabled}
              onPress={() => onChange(opt.id)}
            >
              <Chip label={opt.label} selected={value === opt.id} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
