import Chip from '@/src/components/ui/Chip';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Text, TextInput, View } from 'react-native';

const SEXES = ['female','male','intersex','prefer_not_to_say'] as const;

export default function IdentityCard() {
  const c = useThemeColors();
  const { profile, update } = useProfileStore();
  if (!profile) return null;

  return (
    <View style={{
      backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10
    }}>
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>Identity</Text>

      {/* Sex at birth chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SEXES.map(s => (
          <Chip
            key={s}
            label={s === 'prefer_not_to_say' ? 'Prefer not to say' : s[0].toUpperCase()+s.slice(1)}
            selected={profile.sexAtBirth === s}
            onPress={() => update({ sexAtBirth: s })}
          />
        ))}
      </View>

      {/* Optional gender identity */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.secondary }}>Gender identity (optional)</Text>
        <TextInput
          value={profile.genderIdentity ?? ''}
          onChangeText={(t) => update({ genderIdentity: t })}
          placeholder="e.g., Woman, Man, Non-binary…"
          placeholderTextColor={c.text.muted}
          style={{
            color: c.text.primary,
            backgroundColor: c.elevated,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        />
      </View>
    </View>
  );
}
