import Card from '@/src/components/ui/Card';
import { useShareStore } from '@/src/store/useShareStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, View } from 'react-native';

function Stat({ label, value }: { label: string; value: number }) {
  const c = useThemeColors();
  return (
    <View style={{ alignItems: 'center', minWidth: 80 }}>
      <Text style={{ color: c.text.primary, fontWeight: '700', fontSize: 16 }}>{value}</Text>
      <Text style={{ color: c.text.secondary }}>{label}</Text>
    </View>
  );
}

export default function SharingOverviewCard() {
  const { earnings } = useShareStore();
  const c = useThemeColors();

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <Text style={{ color: c.text.primary, fontWeight: '700', fontSize: 18 }}>
          Sharing Overview
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
          <Stat label="Active shares" value={earnings.activeSharesCount} />
          <Stat label="Badges" value={earnings.badgesCount} />
          <Stat label="Applied" value={earnings.apps.applied} />
          <Stat label="Pending" value={earnings.apps.pending} />
          <Stat label="Accepted" value={earnings.apps.accepted} />
          <Stat label="Rejected" value={earnings.apps.rejected} />
        </View>
      </View>
    </Card>
  );
}
