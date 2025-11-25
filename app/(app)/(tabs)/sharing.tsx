import ActiveSharesList from "@/src/components/composite/sharing/ActiveSharesList";
import EarningsCard from "@/src/components/composite/sharing/EarningsCard";
import SharingOverviewCard from "@/src/components/composite/sharing/SharingOverviewCard";
import { useCurrentUserId } from "@/src/hooks/useCurrentUserId";
import { useShareStore } from "@/src/store/useShareStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SharingScreen() {
  const c = useThemeColors();
  const fetchDashboard = useShareStore((s) => s.fetchDashboard);
  const dashboard = useShareStore((s) => s.dashboard);
  const [loading, setLoading] = useState(false);

  const userId = useCurrentUserId();

  const fetchRewards = useShareStore((s) => s.fetchRewards);
  const rewards = useShareStore((s) => s.rewards);

  const fetchActiveSessions = useShareStore((s) => s.fetchActiveSessions);
  const activeSessions = useShareStore((s) => s.activeSessions);

  const load = useCallback(async () => {
    if (userId == null) return;
    let mounted = true;
    setLoading(true);
    try {
      await Promise.all([
        fetchDashboard(userId),
        fetchRewards(userId),
        fetchActiveSessions(userId),
      ]);
    } finally {
      if (mounted) setLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, [fetchDashboard, fetchRewards, fetchActiveSessions, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Only show "Nothing shared yet" if we know the user, fetch is not in-flight,
  // and there is no dashboard, no rewards, and no active sessions.
  const hasAnySharingData =
    !!dashboard ||
    !!rewards ||
    (activeSessions != null && activeSessions.length > 0);

  const showEmpty = userId != null && !loading && !hasAnySharingData;


  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} />
        }
      >
        {userId == null ? (
          <View style={{ marginTop: 48, alignItems: "center", gap: 8 }}>
            <Text
              style={{ color: c.text.primary, fontSize: 18, fontWeight: "700" }}
            >
              Sign in to view sharing
            </Text>
            <Text style={{ color: c.text.secondary, textAlign: "center" }}>
              We’ll load your sharing dashboard once your account is ready.
            </Text>
          </View>
        ) : showEmpty ? (
          <View style={{ marginTop: 48, alignItems: "center", gap: 8 }}>
            <Text
              style={{ color: c.text.primary, fontSize: 18, fontWeight: "700" }}
            >
              Nothing shared yet
            </Text>
            <Text style={{ color: c.text.secondary, textAlign: "center" }}>
              Apply to a study or start sharing data to see your dashboard here.
            </Text>
          </View>
        ) : (
          <>
            <SharingOverviewCard />
            <ActiveSharesList />
            {rewards ? <EarningsCard /> : null}
  
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
