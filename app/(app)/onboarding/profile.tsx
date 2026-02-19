// app/(app)/onboarding/profile.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CompleteProfileForm from "@/src/components/composite/profile/CompleteProfileForm";
import { useCurrentUserId } from "@/src/hooks/useCurrentUserId";
import {
    getUserProfileStatus,
    patchUser,
    ProfileEdit,
    ProfileEditSchema,
} from "@/src/services/profile/api";
import { useThemeColors } from "@/src/theme/useThemeColors";

type StatusState =
  | { kind: "loading" }
  | { kind: "needsProfile" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const PROFILE_FIELD_LABELS: Record<string, string> = {
  BirthYear: "Birth year",
  RaceId: "Race",
  SexId: "Sex",
  HeightNum: "Height",
  HeightUnitId: "Height unit",
  WeightNum: "Weight",
  WeightUnitId: "Weight unit",
  MeasurementSystemId: "Measurement system",
};

function humanizeMissingFields(raw: string[]) {
  const mapped = raw
    .map((k) => PROFILE_FIELD_LABELS[k] ?? null)
    .filter((x): x is string => !!x);

  // If backend returns unexpected keys, don't show them.
  // (We can’t reliably label unknown keys without backend documentation.)
  return Array.from(new Set(mapped));
}

export default function OnboardingProfileScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const userId = useCurrentUserId();

  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);

  // If you want to show backend-missing fields as hints in UI later
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const canLoad = typeof userId === "number";

  const loadStatus = useCallback(async () => {
    if (!canLoad) return;

    setStatus({ kind: "loading" });
    try {
      const s = await getUserProfileStatus(userId);

      if (s.needsProfile) {
        setMissingFields(s.missingProfileFields ?? []);

        setStatus({ kind: "needsProfile" });
        return;
      }

      setMissingFields([]);
      setStatus({ kind: "done" });

      // ✅ Route away if profile is already complete.
      // Adjust route if you want to go somewhere else.
      router.replace("/(app)/(tabs)");
    } catch (e: any) {
      setStatus({
        kind: "error",
        message: e?.message ?? "Failed to check profile status.",
      });
    }
  }, [canLoad, router, userId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const onSubmit = useCallback(
    async (draft: ProfileEdit) => {
      if (!canLoad) return;

      // Soft-validate client-side (you already defined this schema)
      const parsed = ProfileEditSchema.safeParse(draft);
      const values: ProfileEdit = parsed.success ? parsed.data : draft;

      setSaving(true);
      try {
        // Map from UI draft shape → PATCH shape (PascalCase + HealthConditions)
        const payload: any = { userId };

        if (typeof values.Name === "string") payload.Name = values.Name.trim();
        if (values.Email !== undefined) payload.Email = values.Email ?? null;

        if (typeof values.BirthYear === "number")
          payload.BirthYear = values.BirthYear;

        if (values.RaceId !== undefined) payload.RaceId = values.RaceId ?? null;
        if (values.SexId !== undefined) payload.SexId = values.SexId ?? null;

        if (values.HeightNum !== undefined)
          payload.HeightNum = values.HeightNum ?? null;
        if (values.HeightUnitId !== undefined)
          payload.HeightUnitId = values.HeightUnitId ?? null;

        if (values.WeightNum !== undefined)
          payload.WeightNum = values.WeightNum ?? null;
        if (values.WeightUnitId !== undefined)
          payload.WeightUnitId = values.WeightUnitId ?? null;

        if (values.MeasurementSystemId !== undefined)
          payload.MeasurementSystemId = values.MeasurementSystemId ?? null;

        if (values.RoleId !== undefined) payload.RoleId = values.RoleId ?? null;

        // ✅ Health conditions: if empty, you said it can be empty (so send []).
        // If you ever want “no change” semantics, then omit when undefined.
        if (Array.isArray(values.selectedHealthConditionIds)) {
          payload.HealthConditions = values.selectedHealthConditionIds;
        }

        await patchUser(payload);

        // After save, re-check status and route away if now complete
        await loadStatus();
      } catch (e: any) {
        Alert.alert(
          "Could not save profile",
          e?.message ?? "Please try again.",
        );
      } finally {
        setSaving(false);
      }
    },
    [canLoad, loadStatus, userId],
  );

  const body = useMemo(() => {
    if (!canLoad) {
      return (
        <View style={{ padding: 16 }}>
          <Text style={{ color: c.muted }}>
            UserId not available yet. Please try again.
          </Text>
        </View>
      );
    }

    if (status.kind === "loading") {
      return (
        <View style={{ padding: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 12, color: c.muted }}>
            Checking profile…
          </Text>
        </View>
      );
    }

    if (status.kind === "error") {
      return (
        <View style={{ padding: 16, gap: 12 }}>
          <Text
            style={{ color: c.text.primary, fontSize: 16, fontWeight: "600" }}
          >
            Something went wrong
          </Text>
          <Text style={{ color: c.muted }}>{status.message}</Text>
          <Pressable
            onPress={() => {
              loadStatus();
            }}
            style={{
              backgroundColor: c.primary,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: c.text.inverse, fontWeight: "700" }}>
              Retry
            </Text>
          </Pressable>
        </View>
      );
    }

    if (status.kind === "needsProfile") {
      return (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text
            style={{ color: c.text.primary, fontSize: 22, fontWeight: "700" }}
          >
            Complete your profile
          </Text>
          <CompleteProfileForm onSubmit={onSubmit} disabled={saving} />

          {saving && (
            <Text style={{ color: c.muted, marginTop: 8 }}>Saving…</Text>
          )}
        </ScrollView>
      );
    }

    // status.kind === "done" case is handled by router.replace in loadStatus()
    return null;
  }, [
    canLoad,
    c.muted,
    c.text,
    loadStatus,
    missingFields,
    onSubmit,
    saving,
    status,
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {body}
    </SafeAreaView>
  );
}
