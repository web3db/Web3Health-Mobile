import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  title: string;
  onPress?: (e?: GestureResponderEvent) => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  testID?: string;
};

function Button({
  title,
  onPress,
  style,
  textStyle,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  testID,
}: ButtonProps) {
  const c = useThemeColors();
  const isDisabled = disabled || loading;

  const paddings: Record<
    ButtonSize,
    { px: number; py: number; radius: number; gap: number; font: number }
  > = {
    sm: { px: 12, py: 8, radius: 10, gap: 6, font: 14 },
    md: { px: 14, py: 12, radius: 12, gap: 8, font: 16 },
    lg: { px: 16, py: 14, radius: 14, gap: 10, font: 18 },
  };
  const S = paddings[size];

  // colors
  const primaryBg = isDisabled ? c.muted : c.primary;
  const primaryText = c.text.inverse;

  const secondaryBg = c.surface;
  const secondaryBorder = c.border;
  const secondaryText = isDisabled ? c.text.muted : c.text.primary;

  const ghostBg = "transparent";
  const ghostBorder = "transparent";
  const ghostText = isDisabled ? c.text.muted : c.text.primary;

  let backgroundColor: string | undefined;
  let borderColor: string | undefined;
  let textColor: string | undefined;

  switch (variant) {
    case "secondary":
      backgroundColor = secondaryBg;
      borderColor = secondaryBorder;
      textColor = secondaryText;
      break;
    case "ghost":
      backgroundColor = ghostBg;
      borderColor = ghostBorder;
      textColor = ghostText;
      break;
    case "primary":
    default:
      backgroundColor = primaryBg;
      borderColor = primaryBg;
      textColor = primaryText;
  }

  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [{ opacity: pressed && !isDisabled ? 0.9 : 1 }]}
      disabled={isDisabled}
    >
      <View
        style={[
          {
            backgroundColor,
            borderColor,
            borderWidth: variant === "secondary" ? 1 : 0,
            paddingHorizontal: S.px,
            paddingVertical: S.py,
            borderRadius: S.radius,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: S.gap,
          },
          style,
        ]}
      >
        {typeof leftIcon === "string" ? (
          <Text style={{ color: textColor }}>{leftIcon}</Text>
        ) : (
          leftIcon
        )}

        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <Text
            style={[
              { color: textColor, fontSize: S.font, fontWeight: "600" },
              textStyle,
            ]}
          >
            {title}
          </Text>
        )}

        {typeof rightIcon === "string" ? (
          <Text style={{ color: textColor }}>{rightIcon}</Text>
        ) : (
          rightIcon
        )}
      </View>
    </Pressable>
  );
}

export default Button;
