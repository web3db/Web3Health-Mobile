// app/components/.../MetricCard.tsx (your file shown)

import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { memo, useMemo } from 'react';
import { Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';

export type TrendDir = 'up' | 'down' | 'flat';

export type MetricCardProps = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  primaryValueText: string;
  sublabel?: string;
  coverageCount: number;
  coverageTotal: number;
  trend?: { dir: TrendDir; pct?: number | null };
  freshnessText?: string;
  badges?: string[];
  permissionState?: 'granted'|'denied'|'unknown';
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
};

function MetricCardBase({
  id, title, icon, primaryValueText, sublabel,
  coverageCount, coverageTotal, trend, freshnessText,
  badges = [], permissionState = 'granted', style, onPress
}: MetricCardProps) {
  const c = useThemeColors();

  const elevated = (c as any).elevated ?? c.surface;
  const mutedBg  = (c as any).muted ?? c.surface;
  const mutedTxt = (c.text as any).muted ?? c.text.secondary;

  const gated = permissionState !== 'granted';

  const covRatio = useMemo(() => {
    const t = Number(coverageTotal) || 0;
    const n = Number(coverageCount) || 0;
    return t > 0 ? n / t : 0;
  }, [coverageCount, coverageTotal]);

  const covColor =
    covRatio >= 0.8 ? c.success :
    covRatio >= 0.4 ? c.warning :
    mutedTxt;

  const trendGlyph =
    trend?.dir === 'up' ? '▲' :
    trend?.dir === 'down' ? '▼' : '→';

  const trendColor =
    trend?.dir === 'up' ? c.success :
    trend?.dir === 'down' ? c.danger : mutedTxt;

  const pctText =
    typeof trend?.pct === 'number' && Number.isFinite(trend.pct)
      ? `${trend.pct > 0 ? '+' : ''}${Number(trend.pct.toFixed(0))}%`
      : '';

  const coverageLabel = coverageTotal === 24 ? 'Hours with data' : 'Days with data';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: gated }}
      accessibilityLabel={`${title} card`}
      testID={`metric-card-${id}`}
      disabled={gated}
      onPress={onPress}
      android_ripple={{ borderless: false }}
      hitSlop={6}
      style={[{
        padding: 12,
        borderRadius: 16,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        opacity: gated ? 0.7 : 1,
        overflow: 'hidden', // ensure children never paint outside
      }, style]}
    >
      {/* Title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text
          style={{ color: c.text.primary, fontWeight: '800', flexShrink: 1 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
      </View>

      {/* Primary */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '900' }}>
          {primaryValueText}
        </Text>
        {!!sublabel && (
          <Text style={{ color: c.text.secondary, marginTop: 2 }} numberOfLines={1} ellipsizeMode="tail">
            {sublabel}
          </Text>
        )}
      </View>

      {/* Coverage + Trend (no overflow) */}
      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
        {/* Coverage pill — shrinkable */}
        <View
          style={{
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
            borderWidth: 1, borderColor: c.border, backgroundColor: elevated,
            maxWidth: '75%',       // keep room for the trend pill
            flexShrink: 1,
          }}
        >
          <Text
            style={{ color: covColor, fontWeight: '700' }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {coverageLabel} {coverageCount} / {coverageTotal}
          </Text>
        </View>

        {/* Trend pill — pinned to the right */}
        {trend && (
          <View
            style={{
              marginLeft: 'auto',
              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
              borderWidth: 1, borderColor: c.border, backgroundColor: elevated,
              flexShrink: 0,
            }}
          >
            <Text style={{ color: trendColor, fontWeight: '700' }} numberOfLines={1}>
              {trendGlyph}{pctText ? ` ${pctText}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Badges / Freshness */}
      <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {badges.map((b, i) => (
          <Text
            key={`${b}-${i}`}
            style={{
              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
              backgroundColor: mutedBg, color: c.text.primary, fontWeight: '700',
            }}
            numberOfLines={1}
          >
            {b}
          </Text>
        ))}
        {!!freshnessText && (
          <Text style={{ color: mutedTxt, marginLeft: 'auto' }} numberOfLines={1} ellipsizeMode="tail">
            {freshnessText}
          </Text>
        )}
      </View>

      {/* Gate strip */}
      {gated && (
        <View style={{
          marginTop: 10, padding: 8, borderRadius: 12,
          borderWidth: 1, borderColor: c.border, backgroundColor: elevated,
        }}>
          <Text style={{ color: c.text.secondary, fontWeight: '700' }}>
            Grant access to add this dataset
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default memo(MetricCardBase);