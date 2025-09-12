import { useOpportunitiesStore } from "@/src/store/useOpportunitiesStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { router, type Href } from "expo-router";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Carousel from "./Carousel";

export default function ParticipatingRow() {
  const c = useThemeColors();

  // REPLACE WITH USER PARTICIPATING STORE
  const { recommended, recStatus, fetchRecommended } = useOpportunitiesStore();

  useEffect(() => { fetchRecommended(); }, [fetchRecommended]);

  // REPLACE WITH USER PARTICIPATING NAVIGATION
  const goAll = () => {};
  const goFocus = (id: string) =>
    router.push((`/opportunities/all?focus=${encodeURIComponent(id)}`) as Href);

  return (
    <View style={{ marginTop: 16 }}>
      <Text
        style={{
          color: c.text.primary, fontSize: 18, fontWeight: "800",
          paddingHorizontal: 16, marginBottom: 8
        }}
      >
        Studies Joined
      </Text>
      <Carousel
        data={recommended}
        onPressCard={goFocus}
        onPressViewAll={goAll}
        viewAllLabel="View All Studies"
      />
      {recStatus === "error" && (
        <Text style={{ color: c.danger, paddingHorizontal: 16, marginTop: 6 }}>
          Failed to load studies.
        </Text>
      )}
    </View>
  );
}
