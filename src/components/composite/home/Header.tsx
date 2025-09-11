import Avatar from '@/src/components/ui/Avatar';
import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export default function Header() {
  const c = useThemeColors();
  const router = useRouter();
  const syncToday = useTrackingStore(s => s.syncToday);
  const lastSyncedAt = useTrackingStore(s => s.lastSyncedAt);

  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const freshness = lastSyncedAt ? timeAgo(new Date(lastSyncedAt)) : 'never';

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View>
        <Text style={{ color: c.text.secondary, fontSize: 12 }}>{date}</Text>
        <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '800' }}>Welcome</Text>
        <Text style={{ color: c.text.muted, fontSize: 11, marginTop: 4 }}>Synced {freshness} ago</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={syncToday} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={20} color={c.text.secondary} />
        </Pressable>
        <Avatar onPress={() => router.push('/profile')} />
      </View>
    </View>
  );
}

function timeAgo(d: Date) {
  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
