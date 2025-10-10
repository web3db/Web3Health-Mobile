import { useThemeColors } from "@/src/theme/useThemeColors";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, ViewStyle } from "react-native";

type Props = {
  label?: string;                 // text after the chevron
  tint?: string;                  // optional override for color
  fallbackRoute?: string;         // if no history, navigate here
  style?: ViewStyle;              // optional container style
  onPress?: () => void;           // optional custom handler
};

export default function BackButton({
  label = "Back",
  tint,
  fallbackRoute,
  style,
  onPress,
}: Props) {
  // iOS only
  if (Platform.OS !== "ios") return null;

  const c = useThemeColors();
  const navigation = useNavigation();

  const color =
    tint ??
    ((c as any).link ?? (c as any).accent ?? c.text.primary);

  const handlePress = () => {
    if (onPress) return onPress();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (fallbackRoute) {
      navigation.navigate(fallbackRoute as never);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={({ pressed }) => [
        styles.btn,
        { opacity: pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Text style={[styles.chev, { color }]}>{}‹</Text>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chev: { fontSize: 28, marginRight: 2, lineHeight: 28 },
  label: { fontSize: 17, fontWeight: "600" },
});