// Carousel.tsx
import { Opportunity } from "@/src/services/opportunities/types";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useMemo } from "react";
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from "react-native";
import OpportunityCard from "./OpportunityCard";

type Props = {
  data: Opportunity[];
  onPressCard?: (id: string) => void;
  onPressViewAll?: () => void;
  viewAllLabel?: string;

  // NEW (optional)
  loading?: boolean;                 // show placeholders when first loading
  onEndReached?: () => void;         // horizontal "load more" when near the end
  endThresholdPx?: number;           // how close to the end before firing (default 120)
};

export default function Carousel({
  data,
  onPressCard,
  onPressViewAll,
  viewAllLabel = "View All",
  loading = false,
  onEndReached,
  endThresholdPx = 120,
}: Props) {
  const c = useThemeColors();
  // layout constants for consistent card sizing
  const SCREEN_W = Dimensions.get("window").width;
  const SIDE_INSET = 12;
  const GAP = 12;

  // Card width ~80% of screen, capped to stay tidy on tablets
  const CARD_WIDTH = Math.min(360, Math.max(260, Math.round(SCREEN_W * 0.8)));
  const SNAP_INTERVAL = CARD_WIDTH + GAP;

  // cap to 10 so Home stays light; you can bump this if needed
  const items = useMemo(() => data.slice(0, 10), [data]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!onEndReached) return;
    const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
    const distanceFromEnd = contentSize.width - (contentOffset.x + layoutMeasurement.width);
    if (distanceFromEnd <= endThresholdPx) {
      onEndReached();
    }
  };

  // First-load skeletons: only show when loading AND nothing to render yet
  if (loading && items.length === 0) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SIDE_INSET, gap: GAP }}
        decelerationRate="fast"
        snapToAlignment="start"
        snapToInterval={SNAP_INTERVAL}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: CARD_WIDTH,
              height: 180,
              borderRadius: 16,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              overflow: "hidden",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: c.text.secondary, opacity: 0.5 }}>Loading…</Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: SIDE_INSET, gap: GAP }}
      decelerationRate="fast"
      snapToAlignment="start"
      snapToInterval={SNAP_INTERVAL}
      scrollEventThrottle={16}
      onScroll={handleScroll}
    >

      {items.map((op) => (
        <View
          key={String(op.id)}
          style={{
            width: CARD_WIDTH,       // ← hard clamp
            flexShrink: 0,           // ← do not shrink or grow
          }}
        >
          <OpportunityCard
            key={String(op.id)}
            item={op}
            onPress={() => onPressCard?.(String(op.id))}
            variant="carousel"
          />
        </View>
      ))}

      <Pressable
        onPress={onPressViewAll}
        style={{
          width: CARD_WIDTH,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          borderRadius: 16,
          padding: 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "800" }}>{viewAllLabel}</Text>
        <Text style={{ color: c.text.secondary, marginTop: 6 }}>See the full list</Text>
      </Pressable>
    </ScrollView>
  );
}
