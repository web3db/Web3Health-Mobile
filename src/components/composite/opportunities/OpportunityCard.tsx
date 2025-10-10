// src/components/composite/opportunities/OpportunityCard.tsx
import Button from '@/src/components/ui/Button';
import Chip from '@/src/components/ui/Chip';
import { useThemeColors } from '@/src/theme/useThemeColors';
import React from 'react';
import { Image, Text, View } from 'react-native';

type CardVariant = 'compact' | 'large';

type Props = {
  item: any;
  onPressPrimary?: () => void;
  variant?: CardVariant;          // NEW
};

const STYLES = {
  compact: { hero: 120, title: 16, radius: 12, pad: 12, descLines: 2, maxTags: 2 },
  large:   { hero: 200, title: 20, radius: 16, pad: 14, descLines: 3, maxTags: 3 },
} as const;

export default function OpportunityCard({ item, onPressPrimary, variant = 'compact' }: Props) {
  const c = useThemeColors();
  const S = STYLES[variant];

  const heroUri = item.imageUrl;
  const tags: string[] = item.tags ?? [];
  const metaLeft = item.category ?? item.topic ?? 'Study';
  const metaMid  = item.duration ?? item.length ?? undefined;
  const metaRight = item.type ?? undefined;

  return (
    <View style={{
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: S.radius,
      overflow: 'hidden',
      padding: S.pad,
    }}>
      {/* HERO */}
      <View style={{
        height: S.hero,
        borderRadius: 12,
        backgroundColor: c.muted,
        borderColor: c.border,
        borderWidth: 1,
        overflow: 'hidden',
      }}>
        {heroUri ? <Image source={{ uri: heroUri }} style={{ width:'100%', height:'100%' }} /> : <View style={{ flex:1 }} />}
      </View>

      {/* TITLE + META */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ color: c.text.primary, fontSize: S.title, fontWeight: '800' }} numberOfLines={2}>
          {item.title}
        </Text>
        {(item.sponsor || item.reward?.credits) && (
          <Text style={{ color: c.text.secondary, marginTop: 6 }}>
            {item.sponsor ? `${item.sponsor}` : ''}{item.sponsor && item.reward?.credits ? ' · ' : ''}
            {typeof item.reward?.credits === 'number' ? `+${item.reward.credits} credits` : ''}
          </Text>
        )}
      </View>

      {/* CHIPS */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {metaLeft ? <Chip label={String(metaLeft)} /> : null}
        {metaMid ? <Chip label={String(metaMid)} /> : null}
        {metaRight ? <Chip label={String(metaRight)} /> : null}
        {tags.slice(0, S.maxTags).map(t => <Chip key={t} label={`#${t}`} />)}
      </View>

      {/* DESCRIPTION */}
      {item.description ? (
        <Text style={{ color: c.text.secondary, marginTop: 10 }} numberOfLines={S.descLines}>
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
