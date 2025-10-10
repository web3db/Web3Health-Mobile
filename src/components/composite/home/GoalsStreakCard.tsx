import Card from '@/src/components/ui/Card';
import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export default function GoalsStreakCard({ onEdit }: { onEdit?: () => void }) {
  const c = useThemeColors();
  const goals = useTrackingStore(s => s.goals);
  const streak = useTrackingStore(s => s.streakDays);

  const met = goals.filter(g => g.met).length;
  const total = goals.filter(g => g.target != null).length;

  return (
    <Card style={{ marginHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text.primary, fontWeight: '700', fontSize: 16 }}>Goals & Streak</Text>
        <Pressable onPress={onEdit}><Text style={{ color: c.text.secondary }}>Edit goals</Text></Pressable>
      </View>
      <Text style={{ color: c.text.secondary, marginTop: 6 }}>
        {met}/{total} goals met today · 🔥 {streak} days
      </Text>
    </Card>
  );
}
