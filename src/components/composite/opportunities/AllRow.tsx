import { useOpportunitiesStore } from "@/src/store/useOpportunitiesStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Carousel from "./Carousel";

export default function AllRow() {
  const c = useThemeColors();
  const { recent, allStatus, fetchRecent } = useOpportunitiesStore();

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const goAll = () => router.push("/opportunities/all" as Href);
  const goFocus = (id: string) =>
    router.push((`/opportunities/all?focus=${encodeURIComponent(id)}`) as Href);

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
          Recommended for you
        </Text>
        <Ionicons name="arrow-forward" size={18} color={c.text.secondary} />
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
