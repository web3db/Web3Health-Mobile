// app/data-assets/_layout.tsx
import BackButton from "@/src/components/ui/BackButton";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { Stack } from "expo-router";
import React from "react";

export default function DataAssetsLayout() {
  const c = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.text.primary,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Data Assets",
          headerLeft: () => <BackButton />,
        }}
      />

      <Stack.Screen
        name="[metricId]"
        options={{
          title: "Asset Graph",
          headerLeft: () => <BackButton />,
        }}
      />

      <Stack.Screen
        name="permissions"
        options={{
          title: "Permissions",
        }}
      />
    </Stack>
  );
}
