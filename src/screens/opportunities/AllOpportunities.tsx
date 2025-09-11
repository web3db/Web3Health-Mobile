import OpportunityCard from "@/src/components/composite/opportunities/OpportunityCard";
import { useOpportunitiesStore } from "@/src/store/useOpportunitiesStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AllOpportunitiesScreen() {
  const c = useThemeColors();
  const { recent, recommended } = useOpportunitiesStore();
  const params = useLocalSearchParams<{ focus?: string }>();

  const data = recent.length ? recent : recommended; // simple fallback

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <OpportunityCard item={item} onPress={() => {}} />
        )}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}>
              All Opportunities
            </Text>
            <Text style={{ color: c.text.secondary, marginTop: 4 }}>
              Browse the complete list.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
