// app/(tabs)/index.tsx
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ===== Tracking (light) pieces you already have =====
import Header from "@/src/components/composite/home/Header";
import TrackerCarousel from "@/src/components/composite/home/TrackerCarousel";
import { useTrackingStore } from "@/src/store/useTrackingStore";

// ===== Gamification (simple) =====
import GoalsStreakCard from "@/src/components/composite/home/GoalsStreakCard";

function BadgeHighlight() {
  const c = useThemeColors();
  // (Seed-only text for now; later drive from contributions store)
  return (
    <View style={{
      marginHorizontal: 12,
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 12,
    }}>
      <Text style={{ color: c.text.primary, fontWeight: "700", fontSize: 16 }}>Latest Badge</Text>
      <Text style={{ color: c.text.secondary, marginTop: 6 }}>
        🥈 Community Contributor · You shared 5 datasets. 2 more to unlock 🥇 Impact Maker.
      </Text>
    </View>
  );
}

// ===== Marketplace rows =====
import AllRow from "@/src/components/composite/opportunities/AllRow";
import RecommendedRow from "@/src/components/composite/opportunities/RecommendedRow";

export default function HomeScreen() {
  const c = useThemeColors();
  const { assets, status, tileOrder, syncToday } = useTrackingStore();

  // Light sync on mount (seed bumps freshness)
  useEffect(() => { syncToday(); }, [syncToday]);

  const ordered = tileOrder
    .map(id => assets.find(a => a.id === id))
    .filter(Boolean) as typeof assets;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top','bottom']}>
      <ScrollView
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        removeClippedSubviews={false}
      >
        {/* Header */}
        <Header />

        {/* Tracking (small + lightweight) */}
        <View style={{ marginTop: 8 }}>
          <SectionTitle title="Today" />
          <TrackerCarousel data={ordered.slice(0, 3)} loading={status === "loading"} />
        </View>

        {/* Streak (usage) */}
        <View style={{ marginTop: 16 }}>
          <GoalsStreakCard />
        </View>

        {/* Badge highlight (contribution) */}
        <BadgeHighlight />

        {/* Recommended (matching algo → top 10, big horizontal cards) */}
        <RecommendedRow />

        {/* All (recent → top 10, big horizontal cards) */}
        <AllRow />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  const c = useThemeColors();
  return (
    <Text style={{
      color: c.text.primary,
      fontSize: 18,
      fontWeight: "800",
      paddingHorizontal: 16,
      marginBottom: 8
    }}>
      {title}
    </Text>
  );
}
