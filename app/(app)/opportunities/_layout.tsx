import BackButton from "@/src/components/ui/BackButton";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { Stack } from "expo-router";
import React from "react";

export default function OpportunitiesLayout() {
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
          title: "Opportunities",
        }}
      />

      <Stack.Screen
        name="[id]"
        options={{
          title: "Opportunity",
          headerLeft: () => <BackButton fallbackRoute="/(app)/opportunities" />,
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
