import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import React from "react";
import { View } from "react-native";

type Props = {
  categories: string[];
  tags: string[];
  selectedCategories: string[];
  selectedTags: string[];
  minCredits: number | null;
  onToggleCategory: (cat: string) => void;
  onToggleTag: (tag: string) => void;
  onSetMinCredits: (n: number | null) => void;
  onClearAll: () => void;
};

const CREDIT_STEPS = [50, 100, 150];

export default function FiltersRow({
  categories,
  tags,
  selectedCategories,
  selectedTags,
  minCredits,
  onToggleCategory,
  onToggleTag,
  onSetMinCredits,
  onClearAll,
}: Props) {
  return (
    <View style={{ gap: 10 }}>
      {categories.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {categories.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              selected={selectedCategories.includes(cat)}
              onPress={() => onToggleCategory(cat)}
            />
          ))}
        </View>
      )}

      {tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              selected={selectedTags.includes(t)}
              onPress={() => onToggleTag(t)}
            />
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {CREDIT_STEPS.map((n) => (
          <Chip
            key={n}
            label={`${n}+ credits`}
            selected={minCredits === n}
            onPress={() => onSetMinCredits(minCredits === n ? null : n)}
          />
        ))}
        <Button title="Clear" onPress={onClearAll} variant="ghost" />
      </View>
    </View>
  );
}
