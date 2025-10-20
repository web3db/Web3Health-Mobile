import Chip from '@/src/components/ui/Chip';
import { useMasters } from '@/src/hooks/useMasters';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';

export default function ProfileHeader() {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  // Call hooks unconditionally every render
  const { races, sexes, units } = useMasters();

  // live-edit values with backend fallbacks (null-safe)
  const name  = edits?.Name  ?? profile?.Name  ?? '';
  const email = edits?.Email ?? profile?.Email ?? '';

  // helpers to map ids → labels
  const getLabel = (
    opts: { id: number; label: string }[] | null | undefined,
    id?: number | null
  ) => (id != null ? opts?.find(o => o.id === id)?.label : undefined);

  const raceLabel  = getLabel(races, profile?.RaceId ?? null);
  const sexLabel   = getLabel(sexes, profile?.SexId ?? null);
  const hUnitLabel = getLabel(units, profile?.HeightUnitId ?? null);
  const wUnitLabel = getLabel(units, profile?.WeightUnitId ?? null);

  // derive age from BirthYear if present
  const age = useMemo(() => {
    const by = edits?.BirthYear ?? profile?.BirthYear;
    if (!by || typeof by !== 'number') return undefined;
    return new Date().getFullYear() - by;
  }, [edits?.BirthYear, profile?.BirthYear]);

  // formatters
  const heightDisplay =
    profile?.HeightNum != null && hUnitLabel
      ? `${profile.HeightNum} ${hUnitLabel}`
      : undefined;

  const weightDisplay =
    profile?.WeightNum != null && wUnitLabel
      ? `${profile.WeightNum} ${wUnitLabel}`
      : undefined;

  // initials fallback from name or email
  const initials =
    ((name || email || 'U')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase() ?? '')
      .join('')) || 'U';

  // If profile isn't loaded yet, render a lightweight placeholder instead of returning early
  const loading = !profile;

  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      {/* Avatar initials circle */}
      <View
        style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
          alignItems: 'center', justifyContent: 'center'
        }}
      >
        <Text style={{ color: c.text.secondary, fontWeight: '700', fontSize: 18 }}>
          {initials}
        </Text>
      </View>

      {/* Name (editable, prefilled with API value) */}
      <TextInput
        value={name}
        onChangeText={(t) => updateLocal?.({ Name: t })}
        placeholder="Full name"
        placeholderTextColor={c.text.muted}
        editable={!loading}
        style={{
          color: c.text.primary,
          fontSize: 18,
          fontWeight: '700',
          borderBottomColor: c.border,
          borderBottomWidth: 1,
          minWidth: 220,
          textAlign: 'center',
          paddingVertical: 4,
          opacity: loading ? 0.6 : 1,
        }}
      />

      {/* Email (editable, prefilled with API value) */}
      <TextInput
        value={email}
        onChangeText={(t) => updateLocal?.({ Email: t })}
        placeholder="you@example.com"
        placeholderTextColor={c.text.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
        style={{
          color: c.text.secondary,
          borderBottomColor: c.border,
          borderBottomWidth: 1,
          minWidth: 260,
          textAlign: 'center',
          paddingVertical: 4,
          opacity: loading ? 0.6 : 1,
        }}
      />

      {/* Real profile snapshot from API (chips) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, justifyContent: 'center' }}>
        {age != null && <Chip label={`Age ${age}`} selected={false} onPress={() => {}} />}
        {sexLabel && <Chip label={sexLabel} selected={false} onPress={() => {}} />}
        {raceLabel && <Chip label={raceLabel} selected={false} onPress={() => {}} />}
        {heightDisplay && <Chip label={`Ht ${heightDisplay}`} selected={false} onPress={() => {}} />}
        {weightDisplay && <Chip label={`Wt ${weightDisplay}`} selected={false} onPress={() => {}} />}
      </View>

      {/* optional: last updated hint */}
      {profile?.ModifiedOn && (
        <Text style={{ color: c.text.muted, fontSize: 12, marginTop: 4 }}>
          Updated {new Date(profile.ModifiedOn).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
}
