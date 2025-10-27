import Card from '@/src/components/ui/Card';
import Skeleton from '@/src/components/ui/Skeleton';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

export type HcWindowKey = '24h' | '7d' | '30d' | '90d';

export type TrackerCard = {
  id: string;
  name: string;
  unit: 'steps' | 'min' | 'h' | 'bpm' | 'kcal' | 'm' | 'kg' | 'lb' | string;
  valueToday: number;
  trend?: 'up' | 'down' | 'flat';
  trendPct?: number | null;
  freshness?: string;
  source?: 'healthconnect' | 'healthkit' | string;
  state?: 'ok' | 'permission_needed' | 'stale' | 'partial';
};

export default function TrackerCarousel({
  data,
  loading,
  hasPerms,
  onGrantAll,
  onOpenSettings,
  onRefresh,
  windowKey,
  showViewAll = true,
}: {
  data: TrackerCard[];
  loading?: boolean;
  hasPerms?: boolean;
  onGrantAll?: () => void | Promise<void>;
  onOpenSettings?: () => void;
  onRefresh?: () => void | Promise<void>;
  windowKey?: HcWindowKey;
  showViewAll?: boolean;
}) {
  const c = useThemeColors();
  const router = useRouter();

  // Wider cards for multi-day windows
  const baseMinWidth = windowKey === '24h' ? 160 : 200;

  // ---- Loading skeletons ----
  if (loading) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} style={{ minWidth: baseMinWidth }}>
            <Skeleton style={{ width: 80 }} />
            <Skeleton style={{ width: 120, height: 20, marginTop: 8 }} />
            <Skeleton style={{ width: 60, marginTop: 8 }} />
          </Card>
        ))}
      </ScrollView>
    );
  }

  // ---- No permissions (Android + HC) ----
  if (Platform.OS === 'android' && hasPerms === false) {
    return (
      <View style={{
        marginHorizontal: 12,
        borderRadius: 16, borderWidth: 1, borderColor: c.border,
        backgroundColor: c.surface, padding: 14,
      }}>
        <Text style={{ color: c.text.primary, fontWeight: '800' }}>Share your Health Connect data</Text>
        <Text style={{ color: c.text.secondary, marginTop: 6 }}>
          Choose which metrics to include. You can change this anytime in Health Connect.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {onGrantAll ? (
            <Pressable onPress={onGrantAll} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.primary
            }}>
              <Text style={{ color: c.text.inverse, fontWeight: '800' }}>Grant all</Text>
            </Pressable>
          ) : null}
          {onOpenSettings ? (
            <Pressable onPress={onOpenSettings} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border
            }}>
              <Text style={{ color: c.text.primary, fontWeight: '800' }}>Open HC</Text>
            </Pressable>
          ) : null}
          {onRefresh ? (
            <Pressable onPress={onRefresh} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border
            }}>
              <Text style={{ color: c.text.primary, fontWeight: '800' }}>Refresh</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // ---- No data yet (perms granted or iOS) ----
  if (!data || data.length === 0) {
    return (
      <View style={{
        marginHorizontal: 12,
        borderRadius: 16, borderWidth: 1, borderColor: c.border,
        backgroundColor: c.surface, padding: 14,
      }}>
        <Text style={{ color: c.text.primary, fontWeight: '800' }}>No data yet</Text>
        <Text style={{ color: c.text.secondary, marginTop: 6 }}>
          Connect a source that writes to Health Connect and then refresh.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {onOpenSettings ? (
            <Pressable onPress={onOpenSettings} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border
            }}>
              <Text style={{ color: c.text.primary, fontWeight: '800' }}>Open HC</Text>
            </Pressable>
          ) : null}
          {onRefresh ? (
            <Pressable onPress={onRefresh} style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
              backgroundColor: c.surface, borderWidth: 1, borderColor: c.border
            }}>
              <Text style={{ color: c.text.primary, fontWeight: '800' }}>Refresh</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const windowLabel =
    windowKey === '24h' ? 'today' :
      windowKey ? `last ${windowKey}` : undefined;

  // ---- Normal data row ----
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}>
      {data.map(a => {
        const isTrueZero = windowKey && Number(a.valueToday || 0) === 0;

        const goToDetail = () => {
          // id should match your store MetricKey: 'steps'|'floors'|'distance'|'activeCalories'|'heartRate'|'sleep'
          router.push(`/data-assets/${encodeURIComponent(a.id)}`);
        };

        return (
          <Pressable
            key={a.id}
            onPress={goToDetail}
            accessibilityRole="button"
            accessibilityLabel={`${a.name} details`}
            android_ripple={{ color: c.border, borderless: false }}
            style={{ borderRadius: 16, overflow: 'hidden' }}   // keep ripple inside rounded Card
          >
            <Card style={{ minWidth: baseMinWidth }}>
              {/* Title + source + window badge + chevron */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{ color: c.text.secondary, fontSize: 12, flexShrink: 1 }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {a.name}
                </Text>

                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {!!a.source && (
                    <Text style={{ color: c.text.muted, fontSize: 10 }}>
                      {a.source === 'healthconnect' ? 'HC' : a.source === 'healthkit' ? 'HK' : a.source.toUpperCase().slice(0, 2)}
                    </Text>
                  )}
                  {!!windowKey && (
                    <Text
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: c.border,
                        color: c.text.muted,
                        fontSize: 10,
                      }}
                    >
                      {windowKey}
                    </Text>
                  )}
                  {/* ⮕ Chevron to hint navigation */}
                  <Ionicons name="chevron-forward-outline" size={14} color={c.text.muted} />
                </View>
              </View>

              {/* Value */}
              <View style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '800' }}>
                    {formatValue(a.valueToday, a.unit)}
                  </Text>
                  <Text style={{ color: c.text.secondary, marginLeft: 6 }}>{a.unit}</Text>
                </View>

                {!!windowLabel && (
                  <Text style={{ color: c.text.muted, fontSize: 12, marginTop: 2 }}>
                    {windowLabel}
                  </Text>
                )}

                {isTrueZero && (
                  <Text style={{ color: c.text.muted, fontSize: 11, marginTop: 2 }}>
                    No data in this window
                  </Text>
                )}

                {!!a.freshness && (
                  <Text style={{ color: c.text.muted, fontSize: 11, marginTop: 2 }}>
                    {formatFreshnessText(a.freshness)}
                  </Text>
                )}
              </View>

              {/* Trend */}
              {!!a.trend && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
                  <Ionicons
                    name={
                      a.trend === 'up' ? 'trending-up-outline' :
                        a.trend === 'down' ? 'trending-down-outline' :
                          'remove-outline'
                    }
                    size={14}
                    color={
                      a.trend === 'down' ? c.danger :
                        a.trend === 'up' ? c.success :
                          c.text.secondary
                    }
                  />
                  <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                    {a.trend === 'flat' ? '→' : a.trend === 'up' ? '▲' : '▼'}
                    {typeof a.trendPct === 'number'
                      ? ` ${a.trendPct > 0 ? '+' : ''}${Math.round(a.trendPct)}%`
                      : ''}
                  </Text>
                </View>
              )}

              {/* Status badge (optional) */}
              {a.state && a.state !== 'ok' && (
                <Text style={{ color: c.warning, fontSize: 11, marginTop: 6 }}>
                  {a.state === 'permission_needed' ? 'Permission needed'
                    : a.state === 'stale' ? 'Stale'
                      : 'Partial'}
                </Text>
              )}
            </Card>
          </Pressable>
        );
      })}

      {showViewAll && (
        <Pressable
          onPress={() => router.push('/data-assets')}
          accessibilityRole="button"
          accessibilityLabel="View all data assets"
          android_ripple={{ color: c.border, borderless: false }}
          style={{ borderRadius: 16, overflow: 'hidden' }}
        >
          <Card
            // a bit narrower is fine; keeps the affordance compact
            style={{ minWidth: 140, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="grid-outline" size={16} color={c.text.muted} />
              <Text style={{ color: c.text.primary, fontWeight: '800' }}>View all</Text>
              <Ionicons name="chevron-forward-outline" size={16} color={c.text.muted} />
            </View>
            <Text style={{ color: c.text.muted, fontSize: 12, marginTop: 6 }}>Open data assets</Text>
          </Card>
        </Pressable>
      )}


    </ScrollView>
  );
}

/** Small value formatter for the compact cards */
function formatValue(v: number, unit: TrackerCard['unit']) {
  const n = Number(v) || 0;
  if (unit === 'h') return n.toFixed(1);
  if (unit === 'kg' || unit === 'lb') return n.toFixed(1);
  if (unit === 'bpm') return Math.round(n).toString();
  if (unit === 'min') return Math.round(n).toString();
  if (unit === 'kcal') return Math.round(n).toString();
  if (unit === 'm') return Math.round(n).toString();
  return Math.round(n).toString();
}

function formatFreshnessText(raw?: string) {
  if (!raw) return '';
  const looksISO = /T/.test(raw) && /Z|[+-]\d\d:?\d\d$/.test(raw);
  if (!looksISO) return raw;

  const t = new Date(raw);
  if (isNaN(t.getTime())) return raw;

  const now = Date.now();
  const deltaSec = Math.max(0, Math.floor((now - t.getTime()) / 1000));
  if (deltaSec < 60) return 'Just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;

  const isSameDay = new Date(now).toDateString() === t.toDateString();
  if (isSameDay) return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return t.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
