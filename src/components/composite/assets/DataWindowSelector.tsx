import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

// ✅ Use the single source of truth for the type
import type { WindowKey } from '@/src/store/useTrackingStore';

type Props = {
  value: WindowKey;
  onChange: (w: WindowKey) => void | Promise<void>;
};

const ITEMS: WindowKey[] = ['24h', '7d', '30d', '90d'];

function DataWindowSelector({ value, onChange }: Props) {
  const c = useThemeColors();

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {ITEMS.map(k => {
        const active = value === k;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            android_ripple={{ borderless: false }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? c.primary : c.surface,
              borderWidth: 1,
              borderColor: active ? c.primary : c.border,
            }}
          >
            <Text
              style={{
                color: active ? c.text.inverse : c.text.primary,
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: 0.2,
              }}
            >
              {k}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(DataWindowSelector);
