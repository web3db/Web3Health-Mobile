import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { View, ViewProps } from 'react-native';

export default function Card({ style, ...rest }: ViewProps) {
  const c = useThemeColors();
  return (
    <View
      style={[
        { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 12 },
        style,
      ]}
      {...rest}
    />
  );
}
