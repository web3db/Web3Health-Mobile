import {
  canShowBMI,
  getBMIMissingHelperText,
  getIncompleteDecimalMessage,
  getMissingHelperText,
  isIncompleteDecimalInput,
  parseOptionalDecimal,
  sanitizeDecimalInput,
  validateHeight,
  validateWeight,
  type HeightUnit,
  type WeightUnit,
} from "@/src/components/composite/profile/profileValidation";
import Chip from "@/src/components/ui/Chip";
import {
  bmiCategory,
  computeBMI,
  useProfileStore,
} from "@/src/store/useProfileStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

function unitLabels(measurementSystemId?: number | null): {
  height: HeightUnit;
  weight: WeightUnit;
} {
  if (measurementSystemId === 2) {
    return { height: "in", weight: "lb" };
  }

  return { height: "cm", weight: "kg" };
}

export default function BodyMetricsCard({
  onInputFocus,
}: {
  onInputFocus?: () => void;
}) {
  const c = useThemeColors();
  const { profile, edits, updateLocal } = useProfileStore();

  const msId = (edits.MeasurementSystemId ??
    profile?.MeasurementSystemId ??
    1) as number;
  const { height: heightUnit, weight: weightUnit } = unitLabels(msId);

  const heightVal = edits.HeightNum ?? profile?.HeightNum ?? null;
  const weightVal = edits.WeightNum ?? profile?.WeightNum ?? null;

  const externalHeightText = heightVal != null ? String(heightVal) : "";
  const externalWeightText = weightVal != null ? String(weightVal) : "";

  const [heightText, setHeightText] = useState(externalHeightText);
  const [weightText, setWeightText] = useState(externalWeightText);

  const [hasLocalHeightOverride, setHasLocalHeightOverride] = useState(false);
  const [hasLocalWeightOverride, setHasLocalWeightOverride] = useState(false);

  const lastExternalHeightTextRef = useRef(externalHeightText);
  const lastExternalWeightTextRef = useRef(externalWeightText);

  useEffect(() => {
    const previousExternal = lastExternalHeightTextRef.current;
    const nextExternal = externalHeightText;

    if (!hasLocalHeightOverride && previousExternal !== nextExternal) {
      setHeightText(nextExternal);
    }

    lastExternalHeightTextRef.current = nextExternal;
  }, [externalHeightText, hasLocalHeightOverride]);

  useEffect(() => {
    const previousExternal = lastExternalWeightTextRef.current;
    const nextExternal = externalWeightText;

    if (!hasLocalWeightOverride && previousExternal !== nextExternal) {
      setWeightText(nextExternal);
    }

    lastExternalWeightTextRef.current = nextExternal;
  }, [externalWeightText, hasLocalWeightOverride]);

  const parsedHeight = useMemo(() => {
    return parseOptionalDecimal(heightText);
  }, [heightText]);

  const parsedWeight = useMemo(() => {
    return parseOptionalDecimal(weightText);
  }, [weightText]);

  const isHeightIncomplete = useMemo(() => {
    return isIncompleteDecimalInput(heightText);
  }, [heightText]);

  const isWeightIncomplete = useMemo(() => {
    return isIncompleteDecimalInput(weightText);
  }, [weightText]);

  const heightValidation = useMemo(() => {
    if (!heightText.trim()) {
      return validateHeight(null, heightUnit);
    }

    if (isHeightIncomplete) {
      return {
        status: "invalid" as const,
        message: getIncompleteDecimalMessage("Height"),
      };
    }

    return validateHeight(parsedHeight, heightUnit);
  }, [heightText, isHeightIncomplete, parsedHeight, heightUnit]);

  const weightValidation = useMemo(() => {
    if (!weightText.trim()) {
      return validateWeight(null, weightUnit);
    }

    if (isWeightIncomplete) {
      return {
        status: "invalid" as const,
        message: getIncompleteDecimalMessage("Weight"),
      };
    }

    return validateWeight(parsedWeight, weightUnit);
  }, [weightText, isWeightIncomplete, parsedWeight, weightUnit]);

  const showBMI = useMemo(() => {
    if (isHeightIncomplete || isWeightIncomplete) return false;

    return canShowBMI({
      heightValue: parsedHeight,
      heightUnit,
      weightValue: parsedWeight,
      weightUnit,
    });
  }, [
    isHeightIncomplete,
    isWeightIncomplete,
    parsedHeight,
    heightUnit,
    parsedWeight,
    weightUnit,
  ]);

  const bmi = useMemo(() => {
    if (!showBMI) return null;

    return computeBMI(parsedHeight, heightUnit, parsedWeight, weightUnit);
  }, [showBMI, parsedHeight, heightUnit, parsedWeight, weightUnit]);

  const cat = bmiCategory(bmi);

  const heightHelperText = useMemo(() => {
    if (heightValidation.status === "invalid") {
      return heightValidation.message;
    }

    if (heightValidation.status === "missing") {
      return getMissingHelperText("Height");
    }

    return heightUnit === "cm" ? "Example: 174.5" : "Example: 68.5";
  }, [heightValidation, heightUnit]);

  const weightHelperText = useMemo(() => {
    if (weightValidation.status === "invalid") {
      return weightValidation.message;
    }

    if (weightValidation.status === "missing") {
      return getMissingHelperText("Weight");
    }

    return weightUnit === "kg" ? "Example: 72.5" : "Example: 159.5";
  }, [weightValidation, weightUnit]);

  const bmiHelperText = useMemo(() => {
    if (showBMI) return null;
    return getBMIMissingHelperText();
  }, [showBMI]);

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
          Body metrics
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip
            label="Metric"
            selected={msId === 1}
            onPress={() => updateLocal({ MeasurementSystemId: 1 })}
          />
          <Chip
            label="Imperial"
            selected={msId === 2}
            onPress={() => updateLocal({ MeasurementSystemId: 2 })}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>
            Height ({heightUnit})
          </Text>

          <TextInput
            value={heightText}
            onChangeText={(t) => {
              const cleaned = sanitizeDecimalInput(t);
              setHasLocalHeightOverride(true);
              setHeightText(cleaned);

              if (!cleaned) {
                updateLocal({ HeightNum: undefined });
                return;
              }

              const parsed = parseOptionalDecimal(cleaned);
              updateLocal({ HeightNum: parsed ?? undefined });
            }}
            onBlur={() => {
              setHasLocalHeightOverride(false);
            }}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder={
              heightUnit === "cm" ? "Example: 174.5" : "Example: 68.5"
            }
            placeholderTextColor={c.text.secondary}
            onFocus={onInputFocus}
            style={{
              color: c.text.primary,
              backgroundColor: c.elevated,
              borderColor:
                heightValidation.status === "invalid" ? c.danger : c.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          />

          {heightHelperText ? (
            <Text
              style={{
                color:
                  heightValidation.status === "invalid"
                    ? c.danger
                    : c.text.muted,
                marginTop: 6,
                fontSize: 12,
              }}
            >
              {heightHelperText}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text.secondary, marginBottom: 6 }}>
            Weight ({weightUnit})
          </Text>

          <TextInput
            value={weightText}
            onChangeText={(t) => {
              const cleaned = sanitizeDecimalInput(t);
              setHasLocalWeightOverride(true);
              setWeightText(cleaned);

              if (!cleaned) {
                updateLocal({ WeightNum: undefined });
                return;
              }

              const parsed = parseOptionalDecimal(cleaned);
              updateLocal({ WeightNum: parsed ?? undefined });
            }}
            onBlur={() => {
              setHasLocalWeightOverride(false);
            }}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder={
              weightUnit === "kg" ? "Example: 72.5" : "Example: 159.5"
            }
            placeholderTextColor={c.text.secondary}
            onFocus={onInputFocus}
            style={{
              color: c.text.primary,
              backgroundColor: c.elevated,
              borderColor:
                weightValidation.status === "invalid" ? c.danger : c.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          />

          {weightHelperText ? (
            <Text
              style={{
                color:
                  weightValidation.status === "invalid"
                    ? c.danger
                    : c.text.muted,
                marginTop: 6,
                fontSize: 12,
              }}
            >
              {weightHelperText}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View
          style={{
            backgroundColor: c.elevated,
            borderColor: c.border,
            borderWidth: 1,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: c.text.primary, fontWeight: "600" }}>
            BMI {bmi ?? "—"} · {cat}
          </Text>
        </View>

        {bmiHelperText ? (
          <Text
            style={{
              color: c.text.muted,
              fontSize: 12,
              textAlign: "right",
            }}
          >
            {bmiHelperText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
