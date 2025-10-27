import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import {
  Pressable,
  View as RNView,
  StyleProp,
  Text,
  TextStyle,
  ViewStyle
} from "react-native";

type ChipProps = {
  label?: string | number | null;      // ← more permissive
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;          // ← allow custom content
  numberOfLines?: number;              // ← clamp text if needed
  accessibilityLabel?: string;
};

export default function Chip({
  label = "",
  selected = false,
  onPress,
  style,
  textStyle,
  children,
  numberOfLines = 1,
  accessibilityLabel,
}: ChipProps) {
  const c = useThemeColors();
  const bg = selected ? c.muted : c.surface;
  const border = selected ? c.primary : c.border;
  const textColor = c.text.primary;

  // Prefer custom children, else render the label as a string
  const inner =
    children ?? (
      <Text
        style={[{ color: textColor, fontSize: 12, fontWeight: selected ? "700" : "500" }, textStyle]}
        numberOfLines={numberOfLines}
      >
        {String(label ?? "")}
      </Text>
    );

  const body = (
    <RNView
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
      {inner}
    </RNView>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (typeof label === "string" ? label : undefined)}
        android_ripple={{ borderless: false }}
      >
        {body}
      </Pressable>
    );
  }

  return body;
}
