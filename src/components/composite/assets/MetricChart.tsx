import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { memo, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

export type Bucket = {
  start: string;
  end?: string;
  value: number;
  /** Optional: explicitly mark that a reading existed for this bucket. */
  hasSample?: boolean; // if omitted, we infer from value > 0
};

export type MetricChartProps = {
  buckets: Bucket[];
  granularity: "hourly" | "daily";
  unit?: string; // 'steps'|'kcal'|'m'|'bpm'|'h'|'kg'
  emptyLabel?: string;
};

type InternalItem = {
  start: string;
  end?: string;
  value: number;
  hasSample: boolean;
};

// Helper: axis label formatter (X-axis)
function formatAxisLabel(
  iso: string | undefined,
  granularity: "hourly" | "daily"
): string {
  if (!iso) return "";
  const d = new Date(iso);

  if (granularity === "hourly") {
    // Manual 12-hour format with AM/PM (e.g. "6 AM", "12 PM")
    const hour = d.getHours();
    const hour12 = hour % 12 || 12;
    const suffix = hour < 12 ? "AM" : "PM";
    return `${hour12} ${suffix}`;
  }

  const month = d.toLocaleString(undefined, { month: "short" });
  const day = d.getDate().toString().padStart(2, "0");
  return `${month} ${day}`;
}

// Helper: tooltip label for selected bar
function formatSelectedLabel(
  iso: string,
  value: number,
  granularity: "hourly" | "daily",
  unit?: string
): string {
  const d = new Date(iso);
  const datePart =
    granularity === "hourly"
      ? d.toLocaleString(undefined, {
          month: "short",
          day: "2-digit",
          hour: "numeric",
          minute: "2-digit",
        })
      : d.toLocaleDateString(undefined, {
          month: "short",
          day: "2-digit",
          year: "numeric",
        });

  const rounded = Math.round(value);
  const valuePart = Number.isFinite(rounded) ? rounded.toString() : "0";
  const unitPart = unit ? ` ${unit}` : "";

  return `${datePart} · ${valuePart}${unitPart}`;
}

// Helper: make Y-axis ticks “nice” numbers
function makeNiceTicks(maxVal: number): number[] {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return [0];
  const rawMax = maxVal;

  // Choose 3 ticks: 0, mid, max (evenly spaced)
  const mid = rawMax / 2;

  const roundNice = (v: number): number => {
    if (v <= 0) return 0;
    if (v < 10) return Math.round(v);
    if (v < 100) return Math.round(v / 5) * 5;
    if (v < 1000) return Math.round(v / 10) * 10;
    return Math.round(v / 50) * 50;
  };

  const ticks = [0, mid, rawMax].map(roundNice);
  const deduped = Array.from(new Set(ticks));
  // Ensure ascending order
  deduped.sort((a, b) => a - b);
  return deduped;
}

function MetricChartBase({
  buckets,
  granularity,
  unit,
  emptyLabel = "No data in this window",
}: MetricChartProps) {
  const c = useThemeColors();
  const mutedText = (c.text as any).muted ?? c.text.secondary;

  const { items, max, anySample, yTicks } = useMemo(() => {
    const rows: InternalItem[] = (buckets ?? []).map((b) => {
      const v = Math.max(0, Number(b?.value ?? 0));
      const hasSample = typeof b.hasSample === "boolean" ? b.hasSample : v > 0;
      return { value: v, hasSample, start: b.start, end: b.end };
    });

    const maxVal = Math.max(1, ...rows.map((r) => r.value)); // avoid /0
    const anySample = rows.some((r) => r.hasSample);
    const yTicks = anySample ? makeNiceTicks(maxVal) : [0];

    return {
      items: rows,
      max: maxVal,
      anySample,
      yTicks,
    };
  }, [buckets, granularity]);

  const isEmpty = (buckets?.length ?? 0) === 0 || !anySample;

  // --- Responsive sizing + selection ---
  const [containerW, setContainerW] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Reset selection when data or granularity changes
  useEffect(() => {
    setSelectedIndex(null);
  }, [buckets, granularity]);

  const n = items.length;

  // Bar / gap sizing: dynamic but with comfortable minimums (no needle bars)
  const preferredBar = 10;
  const preferredGap = 6;
  const minBar = 6;
  const minGap = 4;

  // compute total width we'd need with preferred sizes
  const requiredW =
    n > 0 ? n * preferredBar + Math.max(0, n - 1) * preferredGap : 0;

  // if container is wider than required, fit bars into container by scaling gap evenly
  const fitMode = containerW > 0 && requiredW <= containerW;
  const barW = fitMode
    ? Math.max(
        minBar,
        Math.floor(
          containerW /
            (n * (preferredBar / (preferredBar + preferredGap)) + (n - 1))
        )
      )
    : preferredBar;

  const gapW = fitMode
    ? Math.max(minGap, Math.floor((containerW - n * barW) / Math.max(1, n - 1)))
    : preferredGap;

  // each "slot" is bar + surrounding gap → use that as the tap/scroll unit
  const slotW = barW + gapW;

  // if still too wide, we’ll render inside a horizontal ScrollView with contentWidth = n * slotW
  const contentW = fitMode ? containerW : n * slotW;

  // X-axis label density: simple anchor-based rule
  //  - 7-day or fewer: label every bucket
  //  - larger windows: first, last, and a few evenly spaced anchors (~5–6 labels)
  let labelIndices: number[] = [];
  if (n > 0) {
    if (n <= 7) {
      labelIndices = Array.from({ length: n }, (_, i) => i);
    } else {
      const desiredCount = Math.min(6, n); // ~5–6 labels max
      const step = (n - 1) / (desiredCount - 1);
      const rawIndices: number[] = [];
      for (let k = 0; k < desiredCount; k++) {
        rawIndices.push(Math.round(k * step));
      }
      labelIndices = Array.from(new Set(rawIndices)).sort((a, b) => a - b);
    }
  }

  const selected =
    selectedIndex != null && selectedIndex >= 0 && selectedIndex < items.length
      ? items[selectedIndex]
      : null;

  return (
    <View
      accessibilityLabel="Metric chart"
      testID="metric-chart"
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
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
        <View>
          {/* Header: selected value / usage hint */}
          <View style={{ marginBottom: 8 }}>
            {selected && selected.hasSample ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text
                    style={{
                      color: mutedText,
                      fontSize: 11,
                    }}
                    numberOfLines={1}
                  >
                    Selected {granularity === "hourly" ? "interval" : "day"}
                  </Text>
                  <Text
                    style={{
                      color: c.text.primary,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                    numberOfLines={2}
                  >
                    {formatSelectedLabel(
                      selected.start,
                      selected.value,
                      granularity,
                      unit
                    )}
                  </Text>
                </View>

                <Pressable onPress={() => setSelectedIndex(null)} hitSlop={8}>
                  <Text
                    style={{
                      color: c.primary,
                      fontSize: 11,
                      fontWeight: "500",
                    }}
                  >
                    Clear
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text
                style={{
                  color: mutedText,
                  fontSize: 11,
                }}
              >
                Scroll sideways and tap a bar to see the exact value.
              </Text>
            )}
          </View>

          {/* Chart row: Y-axis + bars */}
          <View style={{ flexDirection: "row" }}>
            {/* Y-axis (unchanged logic, just slightly tighter spacing) */}
            <View
              style={{
                width: 32,
                marginRight: 4,
                paddingLeft: 0,
              }}
            >
              <View
                style={{
                  height: 120,
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                {[...yTicks].reverse().map((t, idx) => (
                  <Text
                    key={idx}
                    style={{
                      color: mutedText,
                      fontSize: 10,
                    }}
                  >
                    {t}
                  </Text>
                ))}
              </View>
            </View>

            {/* Bars + X-axis: scroll horizontally when needed */}
            <ScrollView
              horizontal={!fitMode}
              showsHorizontalScrollIndicator={true}
              persistentScrollbar={true}
              bounces={false}
              contentContainerStyle={{
                width: contentW,
                paddingBottom: 12,
              }}
            >
              <View
                style={{
                  width: contentW,
                  paddingHorizontal: 0,
                }}
              >
                {/* Bars row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    height: 120,
                  }}
                >
                  {items.map((r, i) => {
                    // Height rules (unchanged):
                    const scaled = Math.round((r.value / max) * 110); // leave ~10px top padding
                    const isNoSample = !r.hasSample;
                    const isTrueZero = r.hasSample && r.value === 0;
                    const isSelected = selectedIndex === i;
                    const dimmed =
                      selectedIndex != null &&
                      selectedIndex !== i &&
                      !isNoSample;

                    const commonStyle = {
                      width: barW,
                      borderRadius: 4,
                      backgroundColor: c.primary,
                    } as const;

                    // "No sample" → keep empty slot to preserve alignment
                    if (isNoSample) {
                      return (
                        <View
                          key={i}
                          style={{
                            width: slotW,
                          }}
                        />
                      );
                    }

                    // Helper: shared Pressable wrapper for fat-finger target
                    const pressableStyle = {
                      width: slotW,
                      alignItems: "center",
                      justifyContent: "flex-end",
                      opacity: dimmed ? 0.3 : 1,
                    } as const;

                    if (isTrueZero) {
                      // Small solid stub at baseline → "recorded zero"
                      return (
                        <Pressable
                          key={i}
                          onPress={() =>
                            setSelectedIndex((prev) => (prev === i ? null : i))
                          }
                          accessibilityLabel={`Bucket ${i + 1}: value 0`}
                          style={pressableStyle}
                        >
                          <View
                            style={{
                              ...commonStyle,
                              height: 2,
                            }}
                          />
                        </Pressable>
                      );
                    }

                    // Positive value
                    return (
                      <Pressable
                        key={i}
                        onPress={() =>
                          setSelectedIndex((prev) => (prev === i ? null : i))
                        }
                        accessibilityLabel={`Bucket ${i + 1} value ${r.value}`}
                        style={pressableStyle}
                      >
                        <View
                          style={{
                            ...commonStyle,
                            height: scaled,
                            borderWidth: isSelected ? 1 : 0,
                            borderColor: isSelected
                              ? c.text.primary
                              : "transparent",
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Baseline */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: c.border,
                    marginTop: 4,
                  }}
                />

                {/* X-axis labels */}
                <View style={{ flexDirection: "row", marginTop: 6 }}>
                  {items.map((r, i) => {
                    const showLabel = labelIndices.includes(i);

                    return (
                      <View
                        key={`label-${i}`}
                        style={{
                          width: slotW,
                          alignItems: "center",
                          overflow: "visible",
                        }}
                      >
                        {showLabel ? (
                          // Slightly wider label wrapper so text is never "ant size"
                          <View
                            style={{
                              width: 56, // enough for "Nov 30"
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: mutedText,
                                fontSize: 10,
                                textAlign: "center",
                                width: "100%",
                              }}
                              numberOfLines={1}
                            >
                              {formatAxisLabel(r.start, granularity)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Spacer under chart */}
          <View style={{ marginTop: 4 }} />
        </View>
      )}

      {/* Footer: Unit label only (as in your latest code) */}
      {!!unit && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: mutedText, fontSize: 12 }}>
            {granularity === "hourly" ? "Hourly" : "Daily"} · {unit}
          </Text>
        </View>
      )}
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 10,
          height: stub ? 3 : 10,
          borderRadius: 3,
          backgroundColor: outline ? "transparent" : color,
          borderWidth: outline ? 1 : 0,
          borderColor: outline ? color : "transparent",
        }}
      />
      <Text style={{ fontSize: 11 }}>{label}</Text>
    </View>
  );
}

export default memo(MetricChartBase);
