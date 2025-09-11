import Card from '@/src/components/ui/Card';
import Skeleton from '@/src/components/ui/Skeleton';
import type { Asset } from '@/src/services/tracking/types';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

export default function TrackerCarousel({
  data,
  loading,
}: {
  data: Asset[];
  loading?: boolean;
}) {
  const c = useThemeColors();

  if (loading) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} style={{ width: 160 }}>
            <Skeleton style={{ width: 80 }} />
            <Skeleton style={{ width: 120, height: 20, marginTop: 8 }} />
            <Skeleton style={{ width: 60, marginTop: 8 }} />
          </Card>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
      {data.map(a => (
        <Card key={a.id} style={{ width: 160 }}>
          {/* Title + source badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text.secondary, fontSize: 12 }}>{a.name}</Text>
            <Text style={{ color: c.text.muted, fontSize: 10 }}>
              {a.source === 'healthkit' ? 'HK' : 'HC'}
            </Text>
          </View>

          {/* Value */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
            <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '800' }}>
              {formatValue(a.valueToday, a.unit)}
            </Text>
            <Text style={{ color: c.text.secondary, marginLeft: 6 }}>{a.unit}</Text>
          </View>

          {/* Progress / Trend */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
            {a.goalToday != null && a.progressPct != null && (
              <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                {Math.round(a.progressPct)}%
              </Text>
            )}
            {a.trend && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons
                  name={a.trend === 'up' ? 'trending-up-outline' : a.trend === 'down' ? 'trending-down-outline' : 'remove-outline'}
                  size={14}
                  color={a.trend === 'down' ? c.danger : a.trend === 'up' ? c.success : c.text.secondary}
                />
                {typeof a.delta7dPct === 'number' && (
                  <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                    {a.delta7dPct > 0 ? '+' : ''}
                    {Math.round(a.delta7dPct)}%
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Status badges */}
          {a.state !== 'ok' && (
            <Text style={{ color: c.warning, fontSize: 11, marginTop: 6 }}>
              {a.state === 'permission_needed' ? 'Permission needed' : a.state === 'stale' ? 'Stale' : 'Partial'}
            </Text>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

function formatValue(v: number, unit: Asset['unit']) {
  if (unit === 'h') return v.toFixed(1);
  if (unit === 'kg' || unit === 'lb') return v.toFixed(1);
  if (unit === 'bpm') return Math.round(v);
  if (unit === 'min') return Math.round(v);
  if (unit === 'kcal') return Math.round(v);
  return Math.round(v); // steps or others
}
