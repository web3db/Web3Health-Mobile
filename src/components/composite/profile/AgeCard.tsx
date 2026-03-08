import {
  canShowAge,
  getMissingHelperText,
  sanitizeYearInput,
  validateBirthYear,
} from "@/src/components/composite/profile/profileValidation";
import { computeAge, useProfileStore } from "@/src/store/useProfileStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
export default function AgeCard({
  onInputFocus,
}: {
  onInputFocus?: () => void;
}) {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  const birthYear = edits.BirthYear ?? profile?.BirthYear ?? null;

  const externalBirthYearText = birthYear != null ? String(birthYear) : "";

  const [birthYearText, setBirthYearText] = useState(externalBirthYearText);
  const [hasLocalOverride, setHasLocalOverride] = useState(false);
  const lastExternalBirthYearTextRef = useRef(externalBirthYearText);

  useEffect(() => {
    const previousExternal = lastExternalBirthYearTextRef.current;
    const nextExternal = externalBirthYearText;

    // Only sync local text when the external source truly changed
    // and the user is not in the middle of a local edit/clear action.
    if (!hasLocalOverride && previousExternal !== nextExternal) {
      setBirthYearText(nextExternal);
    }

    lastExternalBirthYearTextRef.current = nextExternal;
  }, [externalBirthYearText, hasLocalOverride]);

  const parsedBirthYear = useMemo(() => {
    if (!birthYearText.trim()) return null;

    const n = Number(birthYearText);
    return Number.isInteger(n) ? n : null;
  }, [birthYearText]);

  const birthYearValidation = useMemo(() => {
    if (!birthYearText.trim()) {
      return validateBirthYear(null, { required: false });
    }
    return validateBirthYear(parsedBirthYear, { required: false });
  }, [parsedBirthYear, birthYearText]);

  const showAge = useMemo(() => {
    return canShowAge(parsedBirthYear);
  }, [parsedBirthYear]);

  const age = useMemo(() => {
    return showAge && parsedBirthYear != null
      ? computeAge(parsedBirthYear)
      : null;
  }, [parsedBirthYear, showAge]);

  const helperText = useMemo(() => {
    if (birthYearValidation.status === "invalid") {
      return birthYearValidation.message;
    }

    if (birthYearValidation.status === "missing") {
      return getMissingHelperText("Birth year");
    }

    return "Example: 1995";
  }, [birthYearValidation]);

  if (!profile) return null;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: c.text.primary,
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          Age
        </Text>

        <Text style={{ color: c.text.secondary, fontWeight: "600" }}>
          {showAge && age != null ? `${age} yrs` : "—"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>
            Birth year
          </Text>

          <TextInput
            value={birthYearText}
            onChangeText={(t) => {
              const cleaned = sanitizeYearInput(t);
              setHasLocalOverride(true);
              setBirthYearText(cleaned);

              if (!cleaned) {
                updateLocal({ BirthYear: undefined });
                return;
              }

              const n = Number(cleaned);
              updateLocal({ BirthYear: Number.isInteger(n) ? n : undefined });
            }}
            onBlur={() => {
              setHasLocalOverride(false);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            placeholder="Example: 1995"
            placeholderTextColor={c.text.secondary}
            onFocus={onInputFocus}
            style={{
              color: c.text.primary,
              backgroundColor: c.elevated,
              borderColor:
                birthYearValidation.status === "invalid" ? c.danger : c.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          />

          <Text
            style={{
              color:
                birthYearValidation.status === "invalid"
                  ? c.danger
                  : c.text.muted,
              marginTop: 6,
              fontSize: 12,
            }}
          >
            {helperText}
          </Text>
        </View>
      </View>
    </View>
  );
}
