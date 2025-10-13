import { useThemeColors } from "@/src/theme/useThemeColors";
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// ===== Tracking (HC) =====
import Header from "@/src/components/composite/home/Header";
import TrackerCarousel from "@/src/components/composite/home/TrackerCarousel";
import { useTrackingStore } from "@/src/store/useTrackingStore";

// ===== Marketplace rows =====
import AllRow from "@/src/components/composite/opportunities/AllRow";

function BadgeHighlight() {
  const c = useThemeColors();
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

export default function HomeScreen() {
  const c = useThemeColors();
  const router = useRouter();

  const {
    hcDatasets,
    hcLoading,
    hcGrantedKeys,
    hcInitialized,
    hcWindow,
    hcInitialize,
    hcRefresh,
    hcGrantAll,
    hcOpenSettings,
  } = useTrackingStore();

  // Initialize + refresh on Android
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        if (!hcInitialized) await hcInitialize();
        // If already granted, refresh data; harmless if nothing granted yet
        await hcRefresh();
      } catch {
        // errors are surfaced via store.hcError / header status
      }
    })();
  }, [hcInitialized, hcInitialize, hcRefresh]);

  // Map HCDataset -> TrackerCard[] with "true-zero-only" policy
  const cards = useMemo(() => {
    return hcDatasets.map(d => {
      const isHR = d.id === "heartRate";
      const anyBucket = d.buckets?.some(b => Number(b.value || 0) > 0) ?? false;
      const hasLatestHR = isHR ? (d.latest != null && Number(d.latest) > 0) : false;
      const hasAnyDataInWindow = isHR ? (anyBucket || hasLatestHR) : anyBucket;

      const headline = isHR
        ? (d.latest != null ? Number(d.latest) : 0)
        : Math.round(Number(d.total || 0));

      const valueToday = hasAnyDataInWindow ? headline : 0;

      return {
        id: d.id,
        name: d.label,
        unit: d.unit as any,
        valueToday,
        trend: d.trend?.dir ?? "flat",
        trendPct: typeof d.trend?.pct === "number" ? d.trend.pct : undefined,
        freshness: d.freshnessISO,
        source: "healthconnect" as const,
        state: "ok" as const,
      };
    });
  }, [hcDatasets]);

  const hasPerms = (hcGrantedKeys?.length ?? 0) > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top','bottom']}>
      <ScrollView
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        removeClippedSubviews={false}
      >
        {/* Header shows HC status (connected / needs perms / unavailable / etc.) */}
        <Header />

        {/* Tracking (Health Connect-backed) */}
        <View style={{ marginTop: 8 }}>
          <SectionTitle
            title="Your data assets"
            actionLabel="See all"
            onActionPress={() => router.push('/data-assets')}
          />
          <TrackerCarousel
            data={cards}
            loading={hcLoading}
            hasPerms={hasPerms}
            onGrantAll={hcGrantAll}
            onOpenSettings={hcOpenSettings}
            onRefresh={hcRefresh}
            windowKey={hcWindow}
            showViewAll={false}
          />
        </View>

        {/* Badge highlight (contribution) */}
        {/* <BadgeHighlight /> */}

        {/* Recommended (matching algo → top 10) */}
        {/* <RecommendedRow /> */}

        {/* All (recent → top 10) */}
        <AllRow />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, actionLabel,
  onActionPress, }: { title: string , actionLabel?: string;
  onActionPress?: () => void;}) {
  const c = useThemeColors();
 return (
    <View style={{
      paddingHorizontal: 16,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
    }}>
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '800', flex: 1 }}>
        {title}
      </Text>

      {actionLabel && onActionPress ? (
        <Pressable
          onPress={onActionPress}
          accessibilityRole="button"
          hitSlop={8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            // subtle ghost style
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: (c as any).surface ?? 'transparent',
          }}
        >
          <Text style={{ color: c.text.primary, fontWeight: '800' }}>{actionLabel}</Text>
          <Text style={{ color: c.text.muted, marginLeft: 4 }}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

