// src/components/marketplace/SkeletonCard.tsx
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { View } from "react-native";

type Props = {
  width?: number;
  height?: number;
  variant?: "card" | "row";
};

export default function SkeletonCard({ width, height, variant = "card" }: Props) {
  const c = useThemeColors();
  const h = height ?? (variant === "row" ? 96 : 140);

  return (
    <View
      style={{
        width,                 
        height: h,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        overflow: "hidden",
        padding: 12,
      }}
    >
      {/* title bar */}
      <View style={{ height: 18, borderRadius: 6, backgroundColor: c.muted }} />
      {/* subtitle bars */}
      <View
        style={{
          height: 14,
          borderRadius: 6,
          backgroundColor: c.muted,
          width: "80%",
          marginTop: 8,
        }}
      />
      <View
        style={{
          height: 12,
          borderRadius: 6,
          backgroundColor: c.muted,
          width: "60%",
          marginTop: 8,
        }}
      />
    </View>
  );
}
