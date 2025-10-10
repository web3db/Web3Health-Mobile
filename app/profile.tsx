import AgeCard from '@/src/components/composite/profile/AgeCard';
import BodyMetricsCard from '@/src/components/composite/profile/BodyMetricsCard';
import ProfileHeader from '@/src/components/composite/profile/Header';
import IdentityCard from '@/src/components/composite/profile/IdentityCard';
import Button from '@/src/components/ui/Button';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackButton from "../src/components/ui/BackButton";

export default function ProfileScreen() {
  const c = useThemeColors();
  const { profile, loading, error, fetch, persist, reset } = useProfileStore();

  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);

  const onSave = useCallback(async () => {
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (ok) Alert.alert('Saved', 'Your profile has been updated.');
    else if (error) Alert.alert('Error', error);
  }, [persist, error]);

  const onReset = useCallback(async () => {
    await reset();
  }, [reset]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top','bottom']}>
      <BackButton />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetch} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
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

        {error ? (
          <Text style={{ color: c.danger, marginTop: 6 }}>{error}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
