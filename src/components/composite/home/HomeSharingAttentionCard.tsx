// src/components/composite/home/HomeSharingAttentionCard.tsx
import Card from "@/src/components/ui/Card";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { HomeSharingAttentionItem } from "./HomeSharingAttentionSection";

type Props = {
  item: HomeSharingAttentionItem;
  onPress: () => void;
};

function getTone(
  state: HomeSharingAttentionItem["state"],
  c: ReturnType<typeof useThemeColors>,
) {
  if (state === "MISSED") {
    return {
      bg: c.warning + "33",
      text: c.warning,
      border: c.warning + "55",
    };
  }

  return {
    bg: c.danger + "22",
    text: c.danger,
    border: c.danger + "55",
  };
}

export default function HomeSharingAttentionCard({ item, onPress }: Props) {
  const c = useThemeColors();
  const tone = getTone(item.state, c);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ width: 280 }}
    >
      <Card
        style={{
          padding: 14,
          minHeight: 124,
          justifyContent: "space-between",
        }}
      >
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <Text
              style={{
                color: c.text.primary,
                fontSize: 15,
                fontWeight: "700",
                flex: 1,
              }}
              numberOfLines={2}
            >
              {item.title}
            </Text>

            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: tone.border,
                backgroundColor: tone.bg,
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{
                  color: tone.text,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {item.badgeLabel}
              </Text>
            </View>
          </View>

          {item.subtitle ? (
            <Text
              style={{
                color: c.text.secondary,
                fontSize: 12,
                marginTop: 8,
              }}
              numberOfLines={1}
            >
              {item.subtitle}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text
            style={{
              color: c.text.secondary,
              fontSize: 12,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {item.meta ?? "Needs review"}
          </Text>

          <Text
            style={{
              color: c.text.primary,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            View ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}
