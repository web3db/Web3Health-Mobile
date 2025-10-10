import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Image, Text, TextInput, View } from 'react-native';

export default function ProfileHeader() {
  const c = useThemeColors();
  const { profile, update } = useProfileStore();

  if (!profile) return null;

  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      {/* Avatar (optional) */}
      {profile.avatarUrl ? (
        <Image
          source={{ uri: profile.avatarUrl }}
          style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: c.border }}
        />
      ) : (
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
          alignItems: 'center', justifyContent: 'center'
        }}>
          <Text style={{ color: c.text.secondary, fontWeight: '700', fontSize: 18 }}>
            {profile.displayName?.[0]?.toUpperCase() ?? 'U'}
          </Text>
        </View>
      )}

      {/* Display name */}
      <TextInput
        value={profile.displayName ?? ''}
        onChangeText={(t) => update({ displayName: t })}
        placeholder="Display name"
        placeholderTextColor={c.text.muted}
        style={{
          color: c.text.primary,
          fontSize: 18,
          fontWeight: '700',
          borderBottomColor: c.border,
          borderBottomWidth: 1,
          minWidth: 220,
          textAlign: 'center',
          paddingVertical: 4,
        }}
      />

      {/* Email */}
      <TextInput
        value={profile.email}
        onChangeText={(t) => update({ email: t })}
        placeholder="you@example.com"
        placeholderTextColor={c.text.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          color: c.text.secondary,
          borderBottomColor: c.border,
          borderBottomWidth: 1,
          minWidth: 260,
          textAlign: 'center',
          paddingVertical: 4,
        }}
      />
    </View>
  );
}
