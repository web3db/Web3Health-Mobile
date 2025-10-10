import Card from '@/src/components/ui/Card';
import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, View } from 'react-native';

export default function InsightsCard() {
  const c = useThemeColors();
  const insights = useTrackingStore(s => s.insights);

  if (!insights.length) return null;

  return (
    <Card style={{ marginHorizontal: 12 }}>
      <Text style={{ color: c.text.primary, fontWeight: '700', fontSize: 16 }}>Insights</Text>
      <View style={{ marginTop: 8, gap: 6 }}>
        {insights.map(i => (
          <Text key={i.id} style={{ color: c.text.secondary, fontSize: 13 }}>
            • {i.title}{i.meta ? ` — ${i.meta}` : ''}
          </Text>
        ))}
      </View>
    </Card>
  );
}
