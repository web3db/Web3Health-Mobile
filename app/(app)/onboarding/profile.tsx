// app/(app)/onboarding/profile.tsx
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

export default function OnboardingProfileScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const userId = useCurrentUserId();

  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);

  const scrollViewRef = useRef<ScrollView | null>(null);

  const scrollToInput = useCallback((extraOffset = 0) => {
    if (Platform.OS !== "android") return;

    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: extraOffset,
        animated: true,
      });
    }, 100);
  }, []);

  const canLoad = typeof userId === "number";

  const loadStatus = useCallback(async () => {
    if (!canLoad) return;

    setStatus({ kind: "loading" });
    try {
      const s = await getUserProfileStatus(userId);

      if (s.needsProfile) {
        setStatus({ kind: "needsProfile" });
        return;
      }

      setStatus({ kind: "done" });

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

        if (Array.isArray(values.selectedHealthConditionIds)) {
          payload.HealthConditions = values.selectedHealthConditionIds;
        }

        await patchUser(payload);

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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{
              flexGrow: 1,
              padding: 16,
              gap: 12,
              paddingBottom: 180,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            <Text
              style={{ color: c.text.primary, fontSize: 22, fontWeight: "700" }}
              onLayout={() => {
                scrollToInput(0);
              }}
            >
              Complete your profile
            </Text>

            <CompleteProfileForm onSubmit={onSubmit} disabled={saving} />

            {saving && (
              <Text style={{ color: c.muted, marginTop: 8 }}>Saving…</Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      );
    }

    return null;
  }, [
    canLoad,
    c.muted,
    c.text,
    loadStatus,
    onSubmit,
    saving,
    status,
    scrollToInput,
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {body}
    </SafeAreaView>
  );
}
