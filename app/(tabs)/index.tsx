// app/(tabs)/index.tsx
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ===== Tracking (light) pieces you already have =====
import Header from "@/src/components/composite/home/Header";
import TrackerCarousel from "@/src/components/composite/home/TrackerCarousel";
import { useTrackingStore } from "@/src/store/useTrackingStore";

// ===== Gamification (simple) =====
import GoalsStreakCard from "@/src/components/composite/home/GoalsStreakCard";

function BadgeHighlight() {
  const c = useThemeColors();
  const [flipped, setFlipped] = useState<{ [key: number]: boolean }>({});
  // Mock: number of datasets shared
  const shared = 12;
  const badges = [
    { count: 5, name: 'Community Contributor', color: '#A0C4FF' },
    { count: 10, name: 'Impact Maker', color: '#B9FBC0' },
    { count: 15, name: 'Data Hero', color: '#FFD6A5' },
    { count: 20, name: 'Health Champion', color: '#FFADAD' },
  ];
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
      <Text style={{ color: c.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 10 }}>Badges</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        {badges.filter(badge => shared >= badge.count).map((badge, idx) => {
          const medal = idx === 0 ? '🥉' : idx === 1 ? '🥈' : idx === 2 ? '🥇' : '🏅';
          const isFlipped = flipped[badge.count];
          return (
            <View key={badge.count} style={{ alignItems: 'center' }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setFlipped(f => ({ ...f, [badge.count]: !f[badge.count] }))}
              >
                <View style={{
                  width: 130,
                  height: 130,
                  borderRadius: 65,
                  backgroundColor: badge.color,
                  borderWidth: 3,
                  borderColor: c.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 0,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 6,
                  elevation: 4,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {!isFlipped && (
                    <Text style={{ fontSize: 52, textAlign: 'center' }}>{medal}</Text>
                  )}
                  {isFlipped && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: badge.color }}>
                      <Text style={{ color: c.text.primary, fontWeight: 'bold', fontSize: 18, textAlign: 'center', marginBottom: 4 }}>{badge.name}</Text>
                      <Text style={{ color: c.text.secondary, fontSize: 15, textAlign: 'center' }}>{`Shared: ${badge.count}`}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      {/* Exciting next badge card */}
      {badges.find(b => shared < b.count) && (
        <View style={{
          marginTop: 18,
          marginHorizontal: 24,
          backgroundColor: c.muted,
          borderRadius: 14,
          paddingVertical: 18,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.7,
        }}>
          <Text style={{
            color: c.text.primary,
            fontWeight: 'bold',
            fontSize: 18,
            textAlign: 'center',
            letterSpacing: 0.2,
          }}>
            {`🎉 Only ${badges.find(b => shared < b.count)!.count - shared} more to unlock `}
            <Text style={{ color: c.primary }}>{badges.find(b => shared < b.count)!.name}!</Text>
          </Text>
        </View>
      )}
      {/* All badges unlocked message */}
      {!badges.find(b => shared < b.count) && (
        <Text style={{ color: c.text.secondary, marginTop: 18, fontSize: 15, textAlign: 'center', fontWeight: 'bold' }}>
          🏆 All badges unlocked! Keep sharing to inspire others.
        </Text>
      )}
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
