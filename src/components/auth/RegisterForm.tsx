import Button from '@/src/components/ui/Button';
import Chip from '@/src/components/ui/Chip';
import { useMasters } from '@/src/hooks/useMasters';
import { createUser } from '@/src/services/profile/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useRegisterStore } from '@/src/store/useRegisterStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { RegisterFormSchema } from '@/src/utils/validation';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
export default function RegisterForm() {
  const c = useThemeColors();
  const { user } = useUser();
  const router = useRouter();
  const { signOut } = useAuth();
  const {
    name, birthYear,
    email, clerkId,
    raceId, sexId,
    heightNum, heightUnitId,
    weightNum, weightUnitId,
    measurementSystemId,
    healthConditionIds,
    setField, toggleHealthCondition, reset,
  } = useRegisterStore();

  // --- ONE-SHOT Clerk → form hydration (no loops, no no-op sets)
  const didHydrateFromClerk = React.useRef(false);
  React.useEffect(() => {
    // only try once, and only after Clerk has a user id
    if (didHydrateFromClerk.current) return;
    const id = user?.id ?? null;
    const em = user?.primaryEmailAddress?.emailAddress ?? null;
    if (!id && !em) return; // wait until Clerk is actually ready

    // set only if different to avoid no-op state updates
    if (id && clerkId !== id) setField('clerkId', id);
    if (em && email !== em) setField('email', em);

    // mark as done so we never re-run
    didHydrateFromClerk.current = true;
  }, [user?.id, user?.primaryEmailAddress?.emailAddress, clerkId, email, setField]);

  // Masters load only when this screen is mounted
  const { loading, error, races, sexes, measurementSystems, units, healthConditions } = useMasters();

  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(async () => {
    try {
      setSubmitting(true);
      const parsed = RegisterFormSchema.parse({
        clerkId,
        email,
        name,
        birthYear,
        raceId,
        sexId,
        heightNum,
        heightUnitId,
        weightNum,
        weightUnitId,
        measurementSystemId,
        roleId: 1,
        healthConditionIds,
      });

      const created = await createUser(parsed);
      useAuthStore.getState().setUserId(created.userId);
      Alert.alert('Success', 'Your profile has been created.');
      reset();
      await signOut();

    } catch (e: any) {
      Alert.alert('Register failed', e?.message || 'Failed to register.');
    } finally {
      setSubmitting(false);
    }
  }, [
    clerkId, email, name, birthYear,
    raceId, sexId,
    heightNum, heightUnitId,
    weightNum, weightUnitId,
    measurementSystemId, healthConditionIds, reset
  ]);

  const disabled = submitting || loading;

  const section = (label: string, children: React.ReactNode) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: c.text.primary, fontWeight: '600', marginBottom: 8 }}>{label}</Text>
      {children}
    </View>
  );

  const SingleSelectRow = ({
    options,
    value,
    onChange,
  }: {
    options: { id: number; label: string }[];
    value: number | null;
    onChange: (id: number) => void;
  }) => {
    const opts = options ?? [];
    if (!opts.length) return <Text style={{ color: c.text.muted }}>Loading…</Text>;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((opt) => (
          <Chip
            key={opt.id}
            label={opt.label}
            selected={value === opt.id}
            onPress={() => onChange(opt.id)}
          />
        ))}
      </View>
    );
  };

  const MultiSelectRow = ({
    options,
    values,
    toggle,
  }: {
    options: { id: number; label: string }[];
    values: number[];
    toggle: (id: number) => void;
  }) => {
    const opts = options ?? [];
    if (!opts.length) return <Text style={{ color: c.text.muted }}>Loading…</Text>;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((opt) => (
          <Chip
            key={opt.id}
            label={opt.label}
            selected={values.includes(opt.id)}
            onPress={() => toggle(opt.id)}
          />
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '700' }}>
        Create your profile
      </Text>

      {error ? (
        <Text style={{ color: c.danger ?? '#4B5563' }}>
          {error}
        </Text>
      ) : null}

      {section('Identity', (
        <View style={{ gap: 12 }}>
          <TextInput
            placeholder="Full name"
            placeholderTextColor={c.text.muted}
            value={name}
            onChangeText={(t) => setField('name', t)}
            style={{
              color: c.text.primary,
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
            autoCapitalize="words"
          />
          <TextInput
            placeholder="Birth year (e.g., 1995)"
            placeholderTextColor={c.text.muted}
            keyboardType="number-pad"
            value={birthYear != null ? String(birthYear) : ''}
            onChangeText={(t) => setField('birthYear', t ? Number(t) : null)}
            style={{
              color: c.text.primary,
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={c.text.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email ?? ''}
            onChangeText={(t) => setField('email', t || null)}
            style={{
              color: c.text.primary,
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>
      ))}

      {section('Biological', (
        <View style={{ gap: 12 }}>
          <Text style={{ color: c.text.muted, marginBottom: 6 }}>Race</Text>
          <SingleSelectRow
            options={races}
            value={raceId}
            onChange={(id) => setField('raceId', id)}
          />
          <Text style={{ color: c.text.muted, marginTop: 12, marginBottom: 6 }}>Sex</Text>
          <SingleSelectRow
            options={sexes}
            value={sexId}
            onChange={(id) => setField('sexId', id)}
          />
        </View>
      ))}

      {section('Body metrics', (
        <View style={{ gap: 12 }}>
          <TextInput
            placeholder="Height (number)"
            placeholderTextColor={c.text.muted}
            keyboardType="decimal-pad"
            value={heightNum != null ? String(heightNum) : ''}
            onChangeText={(t) => {
              const next = t.trim();
              const num = next === '' ? null : Number(next);
              setField('heightNum', Number.isFinite(num as number) ? (num as number) : null);
            }}
            style={{
              color: c.text.primary,
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <Text style={{ color: c.text.muted, marginBottom: 6 }}>Height Unit</Text>
          <SingleSelectRow
            options={units}
            value={heightUnitId}
            onChange={(id) => setField('heightUnitId', id)}
          />

          <TextInput
            placeholder="Weight (number)"
            placeholderTextColor={c.text.muted}
            keyboardType="decimal-pad"
            value={weightNum != null ? String(weightNum) : ''}
            onChangeText={(t) => setField('weightNum', t ? Number(t) : null)}
            style={{
              color: c.text.primary,
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <Text style={{ color: c.text.muted, marginBottom: 6 }}>Weight Unit</Text>
          <SingleSelectRow
            options={units}
            value={weightUnitId}
            onChange={(id) => setField('weightUnitId', id)}
          />
        </View>
      ))}

      {section('Measurement System', (
        <SingleSelectRow
          options={measurementSystems}
          value={measurementSystemId}
          onChange={(id) => setField('measurementSystemId', id)}
        />
      ))}

      {section('Health conditions (multi-select)', (
        <MultiSelectRow
          options={healthConditions}
          values={healthConditionIds}
          toggle={toggleHealthCondition}
        />
      ))}

      <Button
        title={submitting ? 'Submitting…' : 'Create profile'}
        disabled={disabled}
        onPress={onSubmit}
      />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
