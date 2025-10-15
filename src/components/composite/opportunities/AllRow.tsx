// AllRow.tsx
import { useOpportunitiesStore } from "@/src/store/useOpportunitiesStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Carousel from "./Carousel";

export default function AllRow() {
  const c = useThemeColors();
  const { recent, allStatus, fetchRecent } = useOpportunitiesStore();

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // View All → go to Marketplace tab
  const goAll = () => router.push("/marketplace");

  // Tap a card → go directly to the opportunity details
  const goFocus = (id: string) => router.push(`/opportunities/${encodeURIComponent(id)}`);

  return (
    <View style={{ marginTop: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: "800" }}>
          All Opportunities
        </Text>
        {/* Make the header action actually navigate */}
        <Pressable
          onPress={goAll}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Text style={{ color: c.text.secondary, fontWeight: "700" }}>View All Opportunities</Text>
          <Ionicons name="arrow-forward" size={18} color={c.text.secondary} />
        </Pressable>
      </View>

      <Carousel
        data={recent}
        onPressCard={goFocus}
        onPressViewAll={goAll}
        viewAllLabel="View All Opportunities"
      />

      {allStatus === "error" && (
        <Text style={{ color: c.danger, paddingHorizontal: 16, marginTop: 6 }}>
          Failed to load opportunities.
        </Text>
      )}
    </View>
  );
}
