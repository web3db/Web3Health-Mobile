import Card from '@/src/components/ui/Card';
import { Posting } from '@/src/services/api/types';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { ScrollView, Text } from 'react-native';

export default function RecommendationsCarousel({ data }: { data: Posting[] }) {
  const c = useThemeColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
      {data.map((p) => (
        <Card key={p.id} style={{ width: 220 }}>
          <Text style={{ color: c.text.primary, fontWeight: '700' }}>{p.title}</Text>
          {!!p.tag && <Text style={{ color: c.text.secondary, marginTop: 4 }}>{p.tag}</Text>}
          {!!p.price && <Text style={{ color: c.primary, marginTop: 8 }}>{p.price}</Text>}
        </Card>
      ))}
    </ScrollView>
  );
}
