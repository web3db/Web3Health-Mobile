import Card from '@/src/components/ui/Card';
import { useShareStore } from '@/src/store/useShareStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, View } from 'react-native';

export default function BadgesGrid() {
  const { badges } = useShareStore();
  const c = useThemeColors();
  if (!badges.length) return null;

  return (
    <Card>
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>Badges</Text>
      <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {badges.map(b => (
          <View key={b.id} style={{ width: '46%', gap: 4 }}>
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>{b.name}</Text>
            <Text style={{ color: c.text.secondary }}>
              {new Date(b.earnedAtISO).toDateString()}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
