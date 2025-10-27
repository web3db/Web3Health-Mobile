import Button from "@/src/components/ui/Button";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Text, View } from "react-native";

type Props = {
  onReset?: () => void;
};

export default function EmptyState({ onReset }: Props) {
  const c = useThemeColors();
  return (
    <View style={{ padding: 24, alignItems: "center" }}>
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "600" }}>No results</Text>
      <Text style={{ color: c.text.secondary, marginTop: 6, textAlign: "center" }}>
        Try adjusting your search or clearing filters.
      </Text>
      {onReset && (
        <Button title="Reset filters" onPress={onReset} style={{ marginTop: 12 }} variant="secondary" />
      )}
    </View>
  );
}
