import Chip from '@/src/components/ui/Chip';
import { getHealthConditions, getRaces, getSexes, type Option } from '@/src/services/profile/api';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

type HCRow = { HealthConditionId: number; DisplayName?: string | null; Code?: string | null };

export default function IdentityCard() {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  const [sexes, setSexes] = useState<Option[]>([]);
  const [races, setRaces] = useState<Option[]>([]);
  const [healthConds, setHealthConds] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // fetch masters once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [sx, rc, hc] = await Promise.all([
          getSexes(),
          getRaces(),
          getHealthConditions(), // must return Option[]
        ]);
        if (!mounted) return;
        setSexes(sx);
        setRaces(rc);
        setHealthConds(hc);
        setErr(null);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message ?? 'Failed to load identity masters');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // current values (null-safe)
  const sexId = edits?.SexId ?? profile?.SexId ?? null;
  const raceId = edits?.RaceId ?? profile?.RaceId ?? null;
  const isReady = !!profile;
  // selected HealthCondition ids from store.edits (fallback to profile)
  const selectedHCIds: number[] = useMemo(() => {
    if (Array.isArray(edits?.selectedHealthConditionIds)) {
      return edits.selectedHealthConditionIds!;
    }
    const list = (profile?.HealthConditions as { HealthConditionId: number }[] | undefined) ?? [];
    return list.map(r => r.HealthConditionId).filter((n): n is number => Number.isFinite(n));
  }, [edits?.selectedHealthConditionIds, profile?.HealthConditions]);

  const toggleHC = (id: number) => {
    if (!isReady) return;
    const set = new Set(selectedHCIds);
    set.has(id) ? set.delete(id) : set.add(id);
    updateLocal?.({ selectedHealthConditionIds: Array.from(set) });
  };

  const findLabel = (opts: Option[] | undefined, id: number | null) =>
    (id != null ? opts?.find(o => o.id === id)?.label : undefined);

  const raceLabelSelected = findLabel(races, raceId);

  const selectedHCLabels = useMemo(() => {
    if (!selectedHCIds.length) return [];
    const map = new Map(healthConds.map(o => [o.id, o.label]));
    return selectedHCIds.map(id => map.get(id)).filter(Boolean) as string[];
  }, [selectedHCIds, healthConds]);

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

      {/* Health Conditions — now editable multi-select */}
      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={{ color: c.text.secondary, marginBottom: 4 }}>Health Conditions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {loading && healthConds.length === 0 ? (
            <Text style={{ color: c.text.muted }}>Loading…</Text>
          ) : healthConds.length === 0 ? (
            <Text style={{ color: c.text.muted }}>None available</Text>
          ) : (
            healthConds.map(h => (
              <Chip
                key={h.id}
                label={h.label}
                selected={selectedHCIds.includes(h.id)}
                onPress={() => toggleHC(h.id)}
              />
            ))
          )}
        </View>

        {selectedHCLabels.length > 0 ? (
          <Text style={{ color: c.text.muted, fontSize: 12, marginTop: 2 }}>
            Selected: {selectedHCLabels.join(', ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
