import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActiveSharesList from '@/src/components/composite/sharing/ActiveSharesList';
import { useThemeColors } from '@/src/theme/useThemeColors';

import { useShareStore } from '@/src/store/useShareStore';

export default function SharingScreen() {
  const { fetchAll, badges, activeShares, applications, earnings } = useShareStore();
  const [loading, setLoading] = useState(false);
  const c = useThemeColors();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchAll();
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => { load(); }, [load]);

  const showEmpty =
    !loading &&
    (!badges?.length && !activeShares?.length && !applications?.length && (!earnings || earnings.badgesCount === 0));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {showEmpty ? (
          <View style={{ marginTop: 48, alignItems: 'center', gap: 8 }}>
            <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>
              Nothing shared yet
            </Text>
            <Text style={{ color: c.text.secondary, textAlign: 'center' }}>
              Apply to a study or start sharing data to unlock badges.
            </Text>
          </View>
        ) : (
          <>
            {/* <SharingOverviewCard /> */}
            <ActiveSharesList />
            {/* <ApplicationsByStatus /> */}
            {/* <BadgesGrid /> */}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
