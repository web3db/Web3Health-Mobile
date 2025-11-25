// src/components/composite/opportunities/OpportunityCard.tsx
import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

type Props = {
  item: any;
  onPress?: () => void; // NEW: tap the whole card
  onPressPrimary?: () => void; // existing CTA

  variant?: "default" | "carousel";
  cardWidth?: number;
};

export default function OpportunityCard({
  item,
  onPress,
  onPressPrimary,
  variant = "default",
  cardWidth,
}: Props) {
  const c = useThemeColors();

  const heroUri = item.imageUrl;
  const tags: string[] = item.tags ?? [];
  const metaLeft = item.category ?? item.topic ?? "Study";
  const metaMid = item.duration ?? item.length ?? undefined;
  const metaRight = item.type ?? undefined;
  const heroHeight = variant === "carousel" ? 140 : 200;
  const bodyText =
    variant === "carousel"
      ? (item.summary ?? item.description) // carousel prefers summary
      : (item.description ?? item.summary); // default prefers description
  const CardBody = (
    <View
      style={{
        width: variant === "carousel" && cardWidth ? cardWidth : undefined,
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 16,
        overflow: "hidden",
        padding: 14,
        flexShrink: 0,
        alignSelf: "stretch",
      }}
    >
      {/* HERO */}
      <View
        style={{
          height: heroHeight,
          borderRadius: 12,
          backgroundColor: c.muted,
          borderColor: c.border,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {heroUri ? (
          <Image
            source={{ uri: heroUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      {/* TITLE + SPONSOR */}
      <View style={{ marginTop: 14 }}>
        <Text
          style={{ color: c.text.primary, fontSize: 20, fontWeight: "800" }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {(item.sponsor || item.reward?.credits) && (
          <Text style={{ color: c.text.secondary, marginTop: 6 }}>
            {item.sponsor ? `${item.sponsor}` : ""}
            {item.sponsor && item.reward?.credits ? " · " : ""}
            {typeof item.reward?.credits === "number"
              ? `+${item.reward.credits} credits`
              : ""}
          </Text>
        )}
      </View>

      {/* TAGS / META CHIPS */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 10,
        }}
      >
        {metaLeft ? <Chip label={String(metaLeft)} /> : null}
        {metaMid ? <Chip label={String(metaMid)} /> : null}
        {metaRight ? <Chip label={String(metaRight)} /> : null}
        {tags.slice(0, 3).map((t) => (
          <Chip key={t} label={`#${t}`} />
        ))}
      </View>

      {/* DESCRIPTION / SUMMARY */}
      {bodyText ? (
        <Text
          style={{ color: c.text.secondary, marginTop: 10 }}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {bodyText}
        </Text>
      ) : null}

      {/* CTA */}
      <View style={{ marginTop: 14 }}>
        <Button title="Contribute" onPress={onPressPrimary ?? onPress} />
      </View>
    </View>
  );

  // If a parent supplies onPress, make the whole card tappable.
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {CardBody}
    </Pressable>
  ) : (
    CardBody
  );
}
