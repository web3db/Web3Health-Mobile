// app/opportunities/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo } from "react";
import { Alert, Linking, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import { useMarketStore as useMarketplaceStore } from "@/src/store/useMarketStore";
import { useThemeColors } from "@/src/theme/useThemeColors";

export default function OpportunityDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useThemeColors();
  const { getByIdSafe, savedIds, toggleSave, loadAll } = useMarketplaceStore();

  // Ensure list is loaded if deep-linked
  useEffect(() => {
    if (!getByIdSafe(String(id))) {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const item = useMemo(() => getByIdSafe(String(id)), [getByIdSafe, id]);

  const handleApply = useCallback(async () => {
    const url = (item as any)?.applyUrl as string | undefined;
    if (!url) {
      Alert.alert("Coming soon", "Application flow will be enabled once APIs are wired.");
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert("Cannot open link", "This device cannot open the apply URL.");
    } catch {
      Alert.alert("Error", "Failed to open the apply link.");
    }
  }, [item]);

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
        <ScrollView
          style={{ backgroundColor: c.bg }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: "800" }}>Opportunity not found</Text>
          <Text style={{ color: c.text.secondary, marginTop: 8 }}>
            The opportunity you’re looking for isn’t available.
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button title="Back" onPress={() => router.back()} variant="secondary" />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const saved = savedIds.includes(item.id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title + Sponsor */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}>
            {item.title}
          </Text>
          {(item as any).sponsor ? (
            <Text style={{ color: c.text.secondary }}>{(item as any).sponsor}</Text>
          ) : null}
        </View>

        {/* Quick facts card */}
        <View
          style={{
            backgroundColor: c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {typeof item.reward?.credits === "number" ? (
              <Chip label={`+${item.reward.credits} credits`} />
            ) : null}
            {item.reward?.badge ? <Chip label={`Badge: ${item.reward.badge}`} /> : null}
            <Chip label={`Posted: ${new Date(item.createdAt).toLocaleDateString()}`} />
          </View>
        </View>

        {/* Overview card (optional) */}
        {item.description ? (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>
              Overview
            </Text>
            <Text style={{ color: c.text.secondary }}>{item.description}</Text>
          </View>
        ) : null}

        {/* Tags card (optional) */}
        {!!(item.tags?.length) && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>
              Tags
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {item.tags!.map((t: string) => (
                <Chip key={t} label={`#${t}`} />
              ))}
            </View>
          </View>
        )}

        {/* CTAs */}
        <View style={{ flexDirection: "row", columnGap: 12, rowGap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <Button title="Apply" onPress={handleApply} />
          <Button title={saved ? "Unsave" : "Save"} onPress={() => toggleSave(item.id)} variant="secondary" />
          <Button title={Platform.OS === "ios" ? "Back" : "Back"} onPress={() => router.back()} variant="ghost" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
