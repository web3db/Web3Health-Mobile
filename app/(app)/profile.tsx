import AgeCard from '@/src/components/composite/profile/AgeCard';
import BodyMetricsCard from '@/src/components/composite/profile/BodyMetricsCard';
import ProfileHeader from '@/src/components/composite/profile/Header';
import IdentityCard from '@/src/components/composite/profile/IdentityCard';
import BackButton from '@/src/components/ui/BackButton';
import Button from '@/src/components/ui/Button';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function ProfileScreen() {
  const c = useThemeColors();
  const profile = useProfileStore((s) => s.profile);
  const loading = useProfileStore((s) => s.loading);
  const error   = useProfileStore((s) => s.error);

  const fetch   = useProfileStore((s) => s.fetch);
  const persist = useProfileStore((s) => s.persist);
  const reset   = useProfileStore((s) => s.reset);

  const [saving, setSaving] = useState(false);

  const fetchRef = useRef(fetch);
  useEffect(() => {
    fetchRef.current();
  }, []);

  const onSave = useCallback(async () => {
    try {
      setSaving(true);
      const ok = await persist();
      if (ok) Alert.alert('Saved', 'Your profile has been updated.');
      else if (error) Alert.alert('Error', error);
    } finally {
      setSaving(false);
    }
  }, [persist, error]);

  const onReset = useCallback(async () => {
    await reset();
  }, [reset]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <BackButton />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={!!loading} onRefresh={fetch} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            color: c.text.primary,
            fontSize: 20,
            fontWeight: '800',
            textAlign: 'center',
          }}
        >
          Profile
        </Text>

        <ProfileHeader />
        <IdentityCard />
        <AgeCard />
        <BodyMetricsCard />

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          <Button title={saving ? 'Saving…' : 'Save'} onPress={onSave} disabled={saving} />
          <Button title="Reset" onPress={onReset} variant="secondary" />
        </View>

        {error ? <Text style={{ color: c.danger, marginTop: 6 }}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
