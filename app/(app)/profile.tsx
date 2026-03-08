import AgeCard from "@/src/components/composite/profile/AgeCard";
import BodyMetricsCard from "@/src/components/composite/profile/BodyMetricsCard";
import ProfileHeader from "@/src/components/composite/profile/Header";
import IdentityCard from "@/src/components/composite/profile/IdentityCard";
import {
  validateBirthYear,
  validateHeight,
  validateWeight,
} from "@/src/components/composite/profile/profileValidation";
import BackButton from "@/src/components/ui/BackButton";
import Button from "@/src/components/ui/Button";
import { useProfileStore } from "@/src/store/useProfileStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const c = useThemeColors();
  const profile = useProfileStore((s) => s.profile);
  const edits = useProfileStore((s) => s.edits);
  const loading = useProfileStore((s) => s.loading);
  const error = useProfileStore((s) => s.error);

  const fetch = useProfileStore((s) => s.fetch);
  const persist = useProfileStore((s) => s.persist);
  const reset = useProfileStore((s) => s.reset);

  const [saving, setSaving] = useState(false);

  const effectiveBirthYear = edits.BirthYear ?? profile?.BirthYear ?? null;
  const effectiveMeasurementSystemId =
    edits.MeasurementSystemId ?? profile?.MeasurementSystemId ?? null;
  const effectiveHeight = edits.HeightNum ?? profile?.HeightNum ?? null;
  const effectiveWeight = edits.WeightNum ?? profile?.WeightNum ?? null;

  const heightUnit = effectiveMeasurementSystemId === 2 ? "in" : "cm";
  const weightUnit = effectiveMeasurementSystemId === 2 ? "lb" : "kg";

  const birthYearValidation = useMemo(() => {
    return validateBirthYear(effectiveBirthYear, { required: false });
  }, [effectiveBirthYear]);

  const heightValidation = useMemo(() => {
    return validateHeight(effectiveHeight, heightUnit, { required: false });
  }, [effectiveHeight, heightUnit]);

  const weightValidation = useMemo(() => {
    return validateWeight(effectiveWeight, weightUnit, { required: false });
  }, [effectiveWeight, weightUnit]);

  const scrollRef = useRef<ScrollView | null>(null);
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

  const anchorsRef = useRef<{ identityY: number; ageY: number; bodyY: number }>(
    {
      identityY: 0,
      ageY: 0,
      bodyY: 0,
    },
  );

  // ---- Profile completion logic ----
  const isProfileComplete = React.useMemo(() => {
    if (!profile) return false;
    return (
      profile.BirthYear != null &&
      profile.SexId != null &&
      profile.MeasurementSystemId != null
    );
  }, [profile]);

  const [cardDismissed, setCardDismissed] = useState(false);

  const showCompleteProfileCard =
    !loading && !isProfileComplete && !cardDismissed;

  const openPrivacy = useCallback(() => {
    Linking.openURL("https://web3db.github.io/Web3Health-Privacy/privacy.html");
  }, []);

  const fetchRef = useRef(fetch);
  useEffect(() => {
    fetchRef.current();
  }, []);

  const onSave = useCallback(async () => {
    const invalidMessages: string[] = [];

    if (
      birthYearValidation.status === "invalid" &&
      birthYearValidation.message
    ) {
      invalidMessages.push(birthYearValidation.message);
    }

    if (heightValidation.status === "invalid" && heightValidation.message) {
      invalidMessages.push(heightValidation.message);
    }

    if (weightValidation.status === "invalid" && weightValidation.message) {
      invalidMessages.push(weightValidation.message);
    }

    if (invalidMessages.length > 0) {
      Alert.alert("Please fix these fields", invalidMessages.join("\n"));
      return;
    }

    try {
      setSaving(true);
      const ok = await persist();

      if (ok) {
        Alert.alert("Saved", "Your profile has been updated.");
      } else if (error) {
        Alert.alert("Error", error);
      }
    } finally {
      setSaving(false);
    }
  }, [persist, error, birthYearValidation, heightValidation, weightValidation]);

  const onReset = useCallback(async () => {
    await reset();
  }, [reset]);

  const onCompleteProfile = useCallback(() => {
    // Priority: Identity (Sex) → Age (BirthYear) → Body (MeasurementSystem)
    let y = anchorsRef.current.identityY;

    if (!profile) {
      y = anchorsRef.current.identityY;
    } else if (profile.SexId == null) {
      y = anchorsRef.current.identityY;
    } else if (profile.BirthYear == null) {
      y = anchorsRef.current.ageY;
    } else if (profile.MeasurementSystemId == null) {
      y = anchorsRef.current.bodyY;
    }

    const nextY = Math.max(0, y - 12);
    scrollRef.current?.scrollTo({ y: nextY, animated: true });
    scrollViewRef.current?.scrollTo({ y: nextY, animated: true });
  }, [profile]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "bottom"]}
    >
      <BackButton />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r;
            scrollViewRef.current = r;
          }}
          style={{ backgroundColor: c.bg }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            gap: 12,
            paddingBottom: 180,
          }}
          refreshControl={
            <RefreshControl refreshing={!!loading} onRefresh={fetch} />
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <Text
            style={{
              color: c.text.primary,
              fontSize: 20,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            Profile
          </Text>

          <ProfileHeader />

          {showCompleteProfileCard && (
            <View
              style={{
                backgroundColor: c.elevated,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: c.border,
                gap: 10,
              }}
            >
              <Text
                style={{
                  color: c.text.primary,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                Finish setting up your profile
              </Text>

              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                Adding these details helps us format and interpret your health
                metrics correctly. You can update or remove them anytime.
              </Text>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Button
                  title="Complete profile"
                  onPress={() => {
                    onCompleteProfile();
                    scrollToInput(120);
                  }}
                />

                <Button
                  title="Not now"
                  variant="secondary"
                  onPress={() => setCardDismissed(true)}
                />
              </View>

              <Text
                onPress={openPrivacy}
                style={{
                  color: c.primary,
                  fontSize: 12,
                  marginTop: 4,
                  textDecorationLine: "underline",
                }}
              >
                Privacy & data use
              </Text>
            </View>
          )}

          <View
            onLayout={(e) => {
              anchorsRef.current.identityY = e.nativeEvent.layout.y;
            }}
          >
            <IdentityCard />
          </View>

          <View
            onLayout={(e) => {
              anchorsRef.current.ageY = e.nativeEvent.layout.y;
            }}
          >
            <AgeCard
              onInputFocus={() => scrollToInput(anchorsRef.current.ageY)}
            />
          </View>

          <View
            onLayout={(e) => {
              anchorsRef.current.bodyY = e.nativeEvent.layout.y;
            }}
          >
            <BodyMetricsCard
              onInputFocus={() => scrollToInput(anchorsRef.current.bodyY)}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <Button
              title={saving ? "Saving…" : "Save"}
              onPress={onSave}
              disabled={saving}
            />
            <Button title="Reset" onPress={onReset} variant="secondary" />
          </View>

          {error ? (
            <Text style={{ color: c.danger, marginTop: 6 }}>{error}</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
