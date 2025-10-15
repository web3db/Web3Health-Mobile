// app/opportunities/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import { useMarketStore as useMarketplaceStore } from "@/src/store/useMarketStore";
import { useThemeColors } from "@/src/theme/useThemeColors";

// --- tiny helpers (local to this file to keep it self-contained) ---
const hasAny = (arr?: Array<any>) => Array.isArray(arr) && arr.length > 0;
const hasText = (s?: string | null) => !!(s && s.trim().length > 0);
const formatAgeRange = (min?: number | null, max?: number | null) => {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `≤${max}`;
  return null;
};

export default function OpportunityDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useThemeColors();

  const {
    getByIdSafe,
    savedIds,
    toggleSave,     // currently unused, keep if you plan to enable Save on details
    loadById,
    loading,
  } = useMarketplaceStore();

  // Try cache first so UI has something instantly
  const cached = useMemo(() => (id ? getByIdSafe(String(id)) : undefined), [getByIdSafe, id]);
  const [item, setItem] = useState(cached);

  // Always try to fetch the full detail on mount.
  // If your store supports loadById(id, { force: true }) we'll use it; otherwise we fall back to loadById(id).
  useEffect(() => {
    let mounted = true;
    if (!id) return;
    if (__DEV__) console.log("[OpportunityDetails] id param =", id);

    (async () => {
      try {
        // Try "force" signature first (new store version)
        const maybeForced = await (loadById as unknown as (a: string, b?: { force?: boolean }) => any)(
          String(id),
          { force: true }
        );
        if (mounted && maybeForced) {
          if (__DEV__) console.log("[OpportunityDetails] fetched (force) id=", id);
          setItem(maybeForced);
          return;
        }
        // If store doesn't support force, fallback to old signature
        const fetched = await (loadById as unknown as (a: string) => any)(String(id));
        if (mounted && fetched) {
          if (__DEV__) console.log("[OpportunityDetails] fetched (fallback) id=", id);
          setItem(fetched);
          return;
        }
        // If nothing fetched, keep cached (may be list-level)
        if (mounted && cached && __DEV__) console.log("[OpportunityDetails] using cached list-level item");
      } catch (e) {
        if (__DEV__) console.warn("[OpportunityDetails] fetch error:", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, loadById, cached]);

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

  // Loading / Not Found fallback
  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
        <ScrollView
          style={{ backgroundColor: c.bg }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: "800" }}>
            {loading ? "Loading…" : "Opportunity not found"}
          </Text>
          {!loading && (
            <>
              <Text style={{ color: c.text.secondary, marginTop: 8 }}>
                The opportunity you’re looking for isn’t available.
              </Text>
              <View style={{ marginTop: 16 }}>
                <Button title="Back" onPress={() => router.back()} variant="secondary" />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const saved = savedIds?.includes(item.id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title + Sponsor */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}>{item.title}</Text>
          {item.sponsor ? <Text style={{ color: c.text.secondary }}>{item.sponsor}</Text> : null}
        </View>

        {/* Quick facts */}
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
            {typeof item.reward?.credits === "number" ? <Chip label={`+${item.reward.credits}`} /> : null}
            {item.createdAt ? <Chip label={`Posted: ${new Date(item.createdAt).toLocaleDateString()}`} /> : null}
            {item.applyOpenAt && item.applyCloseAt ? (
              <Chip
                label={`Apply: ${new Date(item.applyOpenAt).toLocaleDateString()} → ${new Date(
                  item.applyCloseAt
                ).toLocaleDateString()}`}
              />
            ) : null}
            {typeof item.daysRemaining === "number" ? <Chip label={`Days left: ${item.daysRemaining}`} /> : null}
            {typeof item.dataCoverageDaysRequired === "number" ? (
              <Chip label={`Requires ${item.dataCoverageDaysRequired} days`} />
            ) : null}
            {(item as any).postingStatusCode ? (
              <Chip label={`Status: ${(item as any).postingStatusCode}`} />
            ) : null}
            {item.reward?.typeName ? <Chip label={item.reward.typeName} /> : null}

          </View>
        </View>

        {/* Overview */}
        {hasText(item.description) && (
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
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>Overview</Text>
            <Text style={{ color: c.text.secondary }}>{item.description}</Text>
          </View>
        )}

        {/* Requested Data */}
        {(hasAny(item.metrics) || hasAny(item.metricIds)) && (
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
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>Requested Data</Text>
            {hasAny(item.metrics) ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.metrics!.map((m) => (
                  <Chip key={`met-${m.id}`} label={m.name} />
                ))}
              </View>
            ) : (
              <Text style={{ color: c.text.secondary }}>Metrics: {item.metricIds!.join(", ")}</Text>
            )}
          </View>
        )}

        {/* Eligibility */}
        {(item.minAge != null ||
          item.maxAge != null ||
          hasAny(item.healthConditions) ||
          hasAny(item.healthConditionIds)) && (
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
              <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>Eligibility</Text>
              {formatAgeRange(item.minAge, item.maxAge) ? (
                <Text style={{ color: c.text.secondary }}>Age: {formatAgeRange(item.minAge, item.maxAge)}</Text>
              ) : null}

              {hasAny(item.healthConditions) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {item.healthConditions!.map((h) => (
                    <Chip key={`hc-${h.id}`} label={h.name} />
                  ))}
                </View>
              ) : hasAny(item.healthConditionIds) ? (
                <Text style={{ color: c.text.secondary }}>
                  Health conditions: {item.healthConditionIds!.join(", ")}
                </Text>
              ) : null}
            </View>
          )}

        {/* Policies */}
        {(hasAny(item.viewPolicies) || hasAny(item.viewPolicyIds)) && (
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
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>Policies</Text>
            {hasAny(item.viewPolicies) ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.viewPolicies!.map((p) => (
                  <Chip key={`vp-${p.id}`} label={p.name} />
                ))}
              </View>
            ) : hasAny(item.viewPolicyIds) ? (
              <Text style={{ color: c.text.secondary }}>Policy IDs: {item.viewPolicyIds!.join(", ")}</Text>
            ) : null}
          </View>
        )}

        {/* Tags */}
        {hasAny(item.tags) && (
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
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>Tags</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {item.tags!.map((t) => (
                <Chip key={t} label={`#${t}`} />
              ))}
            </View>
          </View>
        )}

        {/* Links (optional) */}
        {(item.privacyUrl || item.termsUrl) && (
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
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>Links</Text>
            {item.privacyUrl ? (
              <Text
                style={{ color: c.primary }}
                onPress={() => Linking.openURL(item.privacyUrl!)}
              >
                Privacy Policy
              </Text>
            ) : null}
            {item.termsUrl ? (
              <Text
                style={{ color: c.primary }}
                onPress={() => Linking.openURL(item.termsUrl!)}
              >
                Terms & Conditions
              </Text>
            ) : null}
          </View>
        )}

        {/* CTAs */}
        <View style={{ flexDirection: "row", columnGap: 12, rowGap: 12, flexWrap: "wrap", marginTop: 4 }}>
          <Button title="Apply" onPress={handleApply} />
          {/* <Button title={saved ? "Unsave" : "Save"} onPress={() => toggleSave(item.id)} variant="secondary" /> */}
          <Button title={Platform.OS === "ios" ? "Back" : "Back"} onPress={() => router.back()} variant="ghost" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
