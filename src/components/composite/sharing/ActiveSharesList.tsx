import Card from '@/src/components/ui/Card';
import Chip from '@/src/components/ui/Chip';
import { useShareStore } from '@/src/store/useShareStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function ActiveSharesList() {
  const { activeShares } = useShareStore();
  const router = useRouter();
  const c = useThemeColors();

  if (!activeShares.length) return null;

  return (
    <Card>
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: '700' }}>Currently Sharing</Text>
      <View style={{ marginTop: 8, gap: 16 }}>
        {activeShares.map(s => (
          <View key={s.id} style={{ gap: 6 }}>
            <Text
              style={{ color: c.text.primary, fontWeight: '600' }}
              onPress={() => router.push(`/opportunities/${s.studyId}`)}
            >
              {s.studyTitle}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {s.channels.map(cn => <Chip key={cn.id} label={cn.label} />)}
            </View>
            <Text style={{ color: c.text.secondary }}>
              Since {new Date(s.sinceISO).toDateString()}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
