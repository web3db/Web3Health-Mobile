import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { Href, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

type Props = {
  label?: string;
  tint?: string;
  fallbackRoute?: Href;
  style?: ViewStyle;
  onPress?: () => void;
};

export default function BackButton({
  label = "Back",
  tint,
  fallbackRoute,
  style,
  onPress,
}: Props) {
  const c = useThemeColors();
  const navigation = useNavigation();

  const color = tint ?? (c as any).link ?? (c as any).accent ?? c.text.primary;

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (fallbackRoute) {
      router.replace(fallbackRoute);
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
      <Ionicons
        name="chevron-back"
        size={22}
        color={color}
        style={styles.icon}
      />
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
  icon: {
    marginRight: 2,
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
  },
});
