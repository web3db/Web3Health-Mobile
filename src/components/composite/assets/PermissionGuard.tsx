import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export default function PermissionGuard({
  granted,
  onGrant,
  children,
  metricLabel = 'this dataset',
}: {
  granted: boolean;
  onGrant: () => void | Promise<void>;
  metricLabel?: string;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  const inverse = (c.text as any).inverse ?? '#ffffff';

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleGrant = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onGrant();
    } catch (e: any) {
      // Surface a friendly error; keep it short and non-blocking
      const msg = e?.message ?? String(e ?? 'Something went wrong');
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [busy, onGrant]);

  if (granted) return <>{children}</>;

  return (
    <View
      accessibilityLabel="Permission required"
      testID="permission-guard"
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text style={{ color: c.text.primary, fontWeight: '800' }}>
        Add {metricLabel}
      </Text>

      <Text style={{ color: c.text.secondary, marginTop: 6 }}>
        Grant access to include {metricLabel} in your data assets package.
      </Text>

      <Pressable
        onPress={handleGrant}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Grant access"
        style={{
          alignSelf: 'flex-start',
          marginTop: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 999,
          backgroundColor: c.primary,
          opacity: busy ? 0.8 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {busy ? <ActivityIndicator size="small" color={inverse} /> : null}
        <Text style={{ color: inverse, fontWeight: '800' }}>
          {busy ? 'Requesting…' : 'Grant access'}
        </Text>
      </Pressable>

      {err ? (
        <Text style={{ color: 'tomato', marginTop: 8 }} numberOfLines={2}>
          {err}
        </Text>
      ) : null}
    </View>
  );
}
