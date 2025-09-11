import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { View, ViewProps } from 'react-native';

export default function Skeleton({ style, ...rest }: ViewProps) {
  const c = useThemeColors();
  return <View style={[{ backgroundColor: c.muted, borderRadius: 8, height: 16, opacity: 0.6 }, style]} {...rest} />;
}
