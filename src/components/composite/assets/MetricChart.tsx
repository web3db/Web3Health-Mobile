import { useThemeColors } from '@/src/theme/useThemeColors';
import React, { memo, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

export type Bucket = {
  start: string;
  end?: string;
  value: number;
  /** Optional: explicitly mark that a reading existed for this bucket. */
  hasSample?: boolean; // if omitted, we infer from value > 0
};

export type MetricChartProps = {
  buckets: Bucket[];
  granularity: 'hourly' | 'daily';
  unit?: string;             // 'steps'|'kcal'|'m'|'bpm'|'h'|'kg'
  emptyLabel?: string;
};

// Lightweight bar chart with responsive sizing, scroll when needed, and a legend.
function MetricChartBase({
  buckets,
  granularity,
  unit,
  emptyLabel = 'No data in this window',
}: MetricChartProps) {
  const c = useThemeColors();
  const mutedText = (c.text as any).muted ?? c.text.secondary;

  const { items, max, anySample, startLabel, midLabel, endLabel } = useMemo(() => {
    const rows = (buckets ?? []).map(b => {
      const v = Math.max(0, Number(b?.value ?? 0));
      const hasSample = typeof b.hasSample === 'boolean' ? b.hasSample : v > 0;
      return { value: v, hasSample, start: b.start, end: b.end };
    });
    const maxVal = Math.max(1, ...rows.map(r => r.value)); // avoid /0
    const anySample = rows.some(r => r.hasSample);

    const fmt = (iso?: string) =>
      iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

    const startLabel = rows.length ? fmt(rows[0].start) : '';
    const endLabel = rows.length ? fmt(rows[rows.length - 1].start) : '';
    const midLabel = rows.length ? fmt(rows[Math.floor(rows.length / 2)].start) : '';

    return { items: rows, max: maxVal, anySample, startLabel, midLabel, endLabel };
  }, [buckets]);

  const isEmpty = (buckets?.length ?? 0) === 0 || !anySample;

  // --- Responsive sizing ---
  const [containerW, setContainerW] = useState<number>(0);
  const n = items.length;
  // preferred sizes
  const preferredBar = 8;
  const preferredGap = 6;
  const minBar = 3;
  const minGap = 3;

  // compute total width we'd need with preferred sizes
  const requiredW = n > 0 ? n * preferredBar + Math.max(0, n - 1) * preferredGap : 0;

  // if container is wider than required, fit bars into container by scaling gap evenly
  const fitMode = containerW > 0 && requiredW <= containerW;
  const barW = fitMode
    ? Math.max(minBar, Math.floor(containerW / (n * (preferredBar / (preferredBar + preferredGap)) + (n - 1))))
    : preferredBar;

  const gapW = fitMode
    ? Math.max(minGap, Math.floor((containerW - n * barW) / Math.max(1, n - 1)))
    : preferredGap;

  // if still too wide, we’ll render inside a horizontal ScrollView with contentWidth = requiredW
  const contentW = fitMode ? containerW : (n * barW + Math.max(0, n - 1) * gapW);

  return (
    <View
      accessibilityLabel="Metric chart"
      testID="metric-chart"
      onLayout={e => setContainerW(e.nativeEvent.layout.width)}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        padding: 12,
      }}
    >
      {isEmpty ? (
        <Text style={{ color: c.text.secondary }}>{emptyLabel}</Text>
      ) : (
        <View style={{}}>
          {/* Bars: scroll horizontally when needed */}
          <ScrollView
            horizontal={!fitMode}
            showsHorizontalScrollIndicator={!fitMode}
            bounces={false}
            contentContainerStyle={{
              width: contentW,
              height: 128,
              justifyContent: 'flex-end',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: gapW,
                height: 120,
                paddingHorizontal: 2,
                width: contentW,
              }}
            >
              {items.map((r, i) => {
                // Height rules:
                const scaled = Math.round((r.value / max) * 110); // leave ~10px top padding
                const isNoSample = !r.hasSample;
                const isTrueZero = r.hasSample && r.value === 0;

                if (isNoSample) {
                  // Hollow outline → "no sample"
                  return (
                    <View
                      key={i}
                      accessibilityLabel={`Bucket ${i + 1}: no sample`}
                      style={{
                        width: barW,
                        height: 16,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: 'transparent',
                      }}
                    />
                  );
                }

                if (isTrueZero) {
                  // Small solid stub at baseline → "recorded zero"
                  return (
                    <View
                      key={i}
                      accessibilityLabel={`Bucket ${i + 1}: value 0`}
                      style={{
                        width: barW,
                        height: 2,
                        borderRadius: 4,
                        backgroundColor: c.primary,
                      }}
                    />
                  );
                }

                // Positive value
                return (
                  <View
                    key={i}
                    accessibilityLabel={`Bucket ${i + 1} value ${r.value}`}
                    style={{
                      width: barW,
                      height: scaled,
                      borderRadius: 4,
                      backgroundColor: c.primary,
                    }}
                  />
                );
              })}
            </View>

            {/* Baseline */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 8,
                height: 1,
                backgroundColor: c.border,
              }}
            />
          </ScrollView>

          {/* X-axis ticks: first / mid / last */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: mutedText, fontSize: 11 }}>{startLabel}</Text>
            <Text style={{ color: mutedText, fontSize: 11 }}>{midLabel}</Text>
            <Text style={{ color: mutedText, fontSize: 11 }}>{endLabel}</Text>
          </View>
        </View>
      )}

      {/* Footnote + legend */}
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {!!unit && (
          <Text style={{ color: mutedText }}>
            {granularity === 'hourly' ? 'Hourly' : 'Daily'} · {unit}
          </Text>
        )}
        {/* Legend */}
        {!isEmpty && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <LegendSwatch color={c.primary} label="value > 0" solid />
            <LegendSwatch color={c.primary} label="zero" stub />
            <LegendSwatch color={c.border} label="no sample" outline />
          </View>
        )}
      </View>
    </View>
  );
}

function LegendSwatch({
  color,
  label,
  solid,
  stub,
  outline,
}: {
  color: string;
  label: string;
  solid?: boolean;
  stub?: boolean;
  outline?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 10,
          height: stub ? 3 : 10,
          borderRadius: 3,
          backgroundColor: outline ? 'transparent' : color,
          borderWidth: outline ? 1 : 0,
          borderColor: outline ? color : 'transparent',
        }}
      />
      <Text style={{ fontSize: 11 }}>{label}</Text>
    </View>
  );
}

export default memo(MetricChartBase);
