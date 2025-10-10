import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Pressable, Text, View, ViewStyle } from "react-native";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export default function Chip({ label, selected, onPress, style }: Props) {
  const c = useThemeColors();
  const bg = selected ? c.muted : c.surface;
  const border = selected ? c.primary : c.border;
  const textColor = c.text.primary;

  const content = (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 16,
        },
        style,
      ]}
    >
      <Text style={{ color: textColor }}>{label}</Text>
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  ) : (
    content
  );
}
