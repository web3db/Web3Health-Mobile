import Card from '@/src/components/ui/Card';
import Chip from '@/src/components/ui/Chip';
import { useShareStore } from '@/src/store/useShareStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, View } from 'react-native';

export default function SharingOverviewCard() {
  const c = useThemeColors();
  const dashboard = useShareStore(s => s.dashboard);

  if (!dashboard) return null;

  const {
    userDisplayName,
    sharedPostingsCount,
    activeCount,
    completedCount,
    cancelledCount,
  } = dashboard;

  return (
    <Card>
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>
        Sharing Overview{userDisplayName ? ` — ${userDisplayName}` : ''}
      </Text>

      <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={`Studies shared: ${sharedPostingsCount}`} />
        <Chip label={`Active: ${activeCount}`} />
        <Chip label={`Completed: ${completedCount}`} />
        <Chip label={`Cancelled: ${cancelledCount}`} />
      </View>
    </Card>
  );
}
