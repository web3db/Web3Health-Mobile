import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useCallback } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

type Props = {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
};

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search studies, sponsors…",
  onClear,
  autoFocus = false,
}: Props) {
  const c = useThemeColors();

  const handleClear = useCallback(() => {
    onChange("");
    onClear?.();
  }, [onChange, onClear]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ ios: 10, android: 6 }),
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.text.muted}
        style={{ flex: 1, color: c.text.primary, paddingVertical: 4 }}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        accessibilityLabel="Search opportunities"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={{ marginLeft: 8 }}
        >
          <Text style={{ color: c.text.secondary }}>Clear</Text>
        </Pressable>
      )}
    </View>
  );
}
