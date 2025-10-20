import Chip from '@/src/components/ui/Chip';
import { getRaces, getSexes, type Option } from '@/src/services/profile/api';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

export default function IdentityCard() {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  const [sexes, setSexes] = useState<Option[]>([]);
  const [races, setRaces] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // fetch masters once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [sx, rc] = await Promise.all([getSexes(), getRaces()]);
        if (!mounted) return;
        setSexes(sx);
        setRaces(rc);
        setErr(null);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? 'Failed to load identity masters');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // current values (null-safe)
  const sexId  = edits?.SexId  ?? profile?.SexId  ?? null;
  const raceId = edits?.RaceId ?? profile?.RaceId ?? null;

  // map id → label helpers
  const findLabel = (opts: Option[] | undefined, id: number | null) =>
    (id != null ? opts?.find(o => o.id === id)?.label : undefined);

  const sexLabelSelected  = findLabel(sexes, sexId);
  const raceLabelSelected = findLabel(races, raceId);

  // ✅ Use API shape: profile.HealthConditions (capital H)
  // Expected item shape: { HealthConditionId, DisplayName?, Code? ... }
  const hcLabels: string[] = useMemo(() => {
    const list =
      (profile?.HealthConditions as
        | { HealthConditionId: number; DisplayName?: string | null; Code?: string | null }[]
        | undefined) ?? [];

    return list
      .map(o => (o?.DisplayName?.trim() || o?.Code?.trim() || ''))
      .filter(Boolean);
  }, [profile?.HealthConditions]);

  const isReady = !!profile;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 10,
      }}
    >
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '700' }}>
        Identity
      </Text>

      {err ? <Text style={{ color: c.danger }}>{err}</Text> : null}

      {/* Sex */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.secondary, marginBottom: 4 }}>Sex</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {loading && sexes.length === 0 ? (
            <Text style={{ color: c.text.muted }}>Loading…</Text>
          ) : sexes.length === 0 ? (
            <Text style={{ color: c.text.muted }}>Not set</Text>
          ) : (
            sexes.map(s => (
              <Chip
                key={s.id}
                label={s.label}
                selected={sexId === s.id}
                onPress={() => isReady && updateLocal?.({ SexId: s.id })}
              />
            ))
          )}
        </View>
      </View>

      {/* Race */}
      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={{ color: c.text.secondary, marginBottom: 4 }}>Race</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {loading && races.length === 0 ? (
            <Text style={{ color: c.text.muted }}>Loading…</Text>
          ) : races.length === 0 ? (
            <Text style={{ color: c.text.muted }}>Not set</Text>
          ) : (
            races.map(r => (
              <Chip
                key={r.id}
                label={r.label}
                selected={raceId === r.id}
                onPress={() => isReady && updateLocal?.({ RaceId: r.id })}
              />
            ))
          )}
        </View>

        {raceLabelSelected ? (
          <Text style={{ color: c.text.muted, fontSize: 12, marginTop: 2 }}>
            Selected: {raceLabelSelected}
          </Text>
        ) : null}
      </View>

      {/* Health Conditions (show selected labels if present; none otherwise) */}
      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={{ color: c.text.secondary, marginBottom: 4 }}>Health Conditions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {hcLabels.length ? (
            hcLabels.map((lbl, i) => (
              <Chip key={`${lbl}-${i}`} label={lbl} selected={true} onPress={() => {}} />
            ))
          ) : (
            <Text style={{ color: c.text.muted }}>None</Text>
          )}
        </View>
      </View>
    </View>
  );
}
