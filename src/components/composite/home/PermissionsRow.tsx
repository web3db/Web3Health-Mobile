import { useTrackingStore } from '@/src/store/useTrackingStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export default function PermissionsRow() {
  const c = useThemeColors();
  const permissions = useTrackingStore(s => s.permissions);
  const request = useTrackingStore(s => s.requestPermissions);
  const pending = permissions.filter(p => p.status !== 'granted').map(p => p.id);

  if (!pending.length) return null;

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: c.text.secondary }}>
        Permissions needed: {pending.join(', ')}
      </Text>
      <Pressable onPress={() => request(pending)}>
        <Text style={{ color: c.primary, fontWeight: '700' }}>Grant</Text>
      </Pressable>
    </View>
  );
}
