// Carousel.tsx
import { Opportunity } from "@/src/services/opportunities/types";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Pressable, ScrollView, Text } from "react-native";
import OpportunityCard from "./OpportunityCard";

export default function Carousel({
  data,
  onPressCard,
  onPressViewAll,
  viewAllLabel = "View All",
}: {
  data: Opportunity[];
  onPressCard?: (id: string) => void;
  onPressViewAll?: () => void;
  viewAllLabel?: string;
}) {
  const c = useThemeColors();
  const items = data.slice(0, 10);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      decelerationRate={0} // gentle swipe feel
      snapToAlignment="start"
      scrollEventThrottle={16}
    >
      {items.map((op) => (
        <OpportunityCard
          key={String(op.id)}
          item={op}
          onPress={() => onPressCard?.(String(op.id))}
        />
      ))}

      <Pressable
        onPress={onPressViewAll}
        style={{
          width: 300,
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
