import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ViewStyle } from 'react-native';

export default function Avatar({
  size = 36,
  onPress,
  style,
}: {
  size?: number;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, style]}
      hitSlop={10}
    >
      <Ionicons name="person-circle-outline" size={size} color={c.text.primary} />
    </Pressable>
  );
}
