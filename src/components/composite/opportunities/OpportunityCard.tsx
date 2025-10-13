// src/components/composite/opportunities/OpportunityCard.tsx
import Button from '@/src/components/ui/Button';
import Chip from '@/src/components/ui/Chip';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Image, Text, View } from 'react-native';

type Props = {
  item: any;
  onPressPrimary?: () => void;
};

export default function OpportunityCard({ item, onPressPrimary }: Props) {
  const c = useThemeColors();

  // Larger “hero” area + bigger title to make the card feel substantial
  const heroUri = item.imageUrl; // optional in your seed
  const tags: string[] = item.tags ?? [];
  const metaLeft = item.category ?? item.topic ?? 'Study';
  const metaMid  = item.duration ?? item.length ?? undefined;
  const metaRight = item.type ?? undefined;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 16,
        overflow: 'hidden',
        padding: 14,
      }}
    >
      {/* HERO */}
      <View
        style={{
          height: 200, // ↑ bump from ~140 to 200 for presence
          borderRadius: 12,
          backgroundColor: c.muted,
          borderColor: c.border,
          borderWidth: 1,
          overflow: 'hidden',
        }}
      >
        {heroUri ? (
          <Image source={{ uri: heroUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      {/* TITLE + SPONSOR */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: '800' }} numberOfLines={2}>
          {item.title}
        </Text>

        {/* Sponsor / meta line (keep subtle) */}
        {(item.sponsor || item.reward?.credits) && (
          <Text style={{ color: c.text.secondary, marginTop: 6 }}>
            {item.sponsor ? `${item.sponsor}` : ''}{item.sponsor && item.reward?.credits ? ' · ' : ''}
            {typeof item.reward?.credits === 'number' ? `+${item.reward.credits} credits` : ''}
          </Text>
        )}
      </View>

      {/* TAGS / META CHIPS */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {metaLeft ? <Chip label={String(metaLeft)} /> : null}
        {metaMid ? <Chip label={String(metaMid)} /> : null}
        {metaRight ? <Chip label={String(metaRight)} /> : null}
        {tags.slice(0, 3).map((t) => <Chip key={t} label={`#${t}`} />)}
      </View>

      {/* DESCRIPTION */}
      {item.description ? (
        <Text style={{ color: c.text.secondary, marginTop: 10 }} numberOfLines={3}>
          {item.description}
        </Text>
      ) : null}

      {/* CTA */}
      <View style={{ marginTop: 14 }}>
        <Button title="Contribute" onPress={onPressPrimary} />
      </View>
    </View>
  );
}
