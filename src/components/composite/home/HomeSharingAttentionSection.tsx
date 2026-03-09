//src/components/composite/home/HomeSharingAttentionSection.tsx
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import HomeSharingAttentionCard from "./HomeSharingAttentionCard";

export type HomeSharingAttentionItem = {
  id: string;
  postingId: number;
  title: string;
  badgeLabel: string;
  state: "MISSED" | "BEHIND";
  subtitle?: string;
  meta?: string;
};

type Props = {
  title?: string;
  items: HomeSharingAttentionItem[];
  onPressItem: (item: HomeSharingAttentionItem) => void;
  onPressSeeAll?: () => void;
};

export default function HomeSharingAttentionSection({
  title = "Needs attention",
  items,
  onPressItem,
  onPressSeeAll,
}: Props) {
  const c = useThemeColors();

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <View style={{ marginTop: 12 }}>
      <View
        style={{
          paddingHorizontal: 16,
          marginBottom: 10,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: c.text.primary,
            fontSize: 18,
            fontWeight: "800",
            flex: 1,
          }}
        >
          {title}
        </Text>

        {onPressSeeAll ? (
          <Pressable
            onPress={onPressSeeAll}
            accessibilityRole="button"
            hitSlop={8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: (c as any).surface ?? "transparent",
            }}
          >
            <Text style={{ color: c.text.primary, fontWeight: "800" }}>
              See all
            </Text>
            <Text style={{ color: c.text.muted, marginLeft: 4 }}>›</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingLeft: 16,
          paddingRight: 8,
          gap: 12,
        }}
      >
        {items.map((item) => (
          <HomeSharingAttentionCard
            key={item.id}
            item={item}
            onPress={() => onPressItem(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
