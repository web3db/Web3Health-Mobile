// src/components/composite/profile/CompleteProfileForm.tsx
import {
  getIncompleteDecimalMessage,
  getRawDecimalFormatError,
  getRawIntegerFormatError,
  isIncompleteDecimalInput,
  parseOptionalDecimal,
  parseOptionalInteger,
  sanitizeDecimalInput,
  sanitizeYearInput,
  validateBirthYear,
  validateHeight,
  validateWeight,
} from "@/src/components/composite/profile/profileValidation";
import Chip from "@/src/components/ui/Chip";
import { useMasters } from "@/src/hooks/useMasters";
import type { ProfileEdit } from "@/src/services/profile/api";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

type Props = {
  onSubmit: (draft: ProfileEdit) => void | Promise<void>;
  disabled?: boolean;
};

export default function CompleteProfileForm({ onSubmit, disabled }: Props) {
  const c = useThemeColors();
  const { races, sexes, units, measurementSystems, healthConditions, loading } =
    useMasters();

  const [birthYearText, setBirthYearText] = useState("");

  const [raceId, setRaceId] = useState<number | null>(null);
  const [sexId, setSexId] = useState<number | null>(null);

  const [heightNumText, setHeightNumText] = useState("");
  const [heightUnitId, setHeightUnitId] = useState<number | null>(null);

  const [weightNumText, setWeightNumText] = useState("");
  const [weightUnitId, setWeightUnitId] = useState<number | null>(null);

  const [measurementSystemId, setMeasurementSystemId] = useState<number | null>(
    null,
  );

  const [selectedHealthConditionIds, setSelectedHealthConditionIds] = useState<
    number[]
  >([]);

  // const heightUnits = useMemo(() => {
  //   const allowed = new Set(["CM", "M", "IN"]);
  //   return (units ?? []).filter((u: any) =>
  //     allowed.has(String(u?.code ?? "").toUpperCase()),
  //   );
  // }, [units]);

  // const heightUnits = useMemo(() => {
  //   if (isMetric) return [uCM, uM].filter(Boolean);
  //   if (isImperial) return [uIN].filter(Boolean);
  //   return [uCM, uM, uIN].filter(Boolean);
  // }, [isMetric, isImperial, uCM, uM, uIN]);

  // const weightUnits = useMemo(() => {
  //   const allowed = new Set(["KG", "LB"]);
  //   return (units ?? []).filter((u: any) =>
  //     allowed.has(String(u?.code ?? "").toUpperCase()),
  //   );
  // }, [units]);

  // const weightUnits = useMemo(() => {
  //   if (isMetric) return [uKG].filter(Boolean);
  //   if (isImperial) return [uLB].filter(Boolean);
  //   return [uKG, uLB].filter(Boolean);
  // }, [isMetric, isImperial, uKG, uLB]);

  // const measurementSystemOptions = useMemo(() => {
  //   // Screenshot shows labels: Metric, Imperial, Custom, SI Units, Legacy.
  //   // You want only Metric + Imperial.
  //   const list = measurementSystems ?? [];
  //   const picked = list.filter((m: any) => {
  //     const label = String(m?.label ?? "").toLowerCase();
  //     return label === "metric" || label === "imperial";
  //   });

  //   // If backend doesn’t provide those exact labels for some reason,
  //   // fall back to showing whatever it gives (to avoid blocking users).
  //   return picked.length ? picked : list;
  // }, [measurementSystems]);

  // const measurementSystemLabel = useCallback((raw: string) => {
  //   const s = String(raw ?? "")
  //     .trim()
  //     .toLowerCase();
  //   if (s === "metric") return "Metric (SI units)";
  //   if (s === "imperial") return "Imperial (US/Imperial units)";
  //   return raw;
  // }, []);

  const toggleHealthCondition = useCallback((id: number) => {
    setSelectedHealthConditionIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }, []);

  const isDisabled = !!disabled || loading;

  // ---- helpers
  const norm = useCallback(
    (s: any) =>
      String(s ?? "")
        .trim()
        .toLowerCase(),
    [],
  );

  // Pick only Metric + Imperial (never show Custom/SI/Legacy)
  const metricSystem = useMemo(() => {
    return (measurementSystems ?? []).find(
      (m: any) => norm(m?.label) === "metric",
    );
  }, [measurementSystems, norm]);

  const imperialSystem = useMemo(() => {
    return (measurementSystems ?? []).find(
      (m: any) => norm(m?.label) === "imperial",
    );
  }, [measurementSystems, norm]);

  const measurementSystemOptions = useMemo(() => {
    const opts: any[] = [];
    if (metricSystem) opts.push(metricSystem);
    if (imperialSystem) opts.push(imperialSystem);
    return opts;
  }, [metricSystem, imperialSystem]);

  const isMetric =
    measurementSystemId != null && metricSystem?.id === measurementSystemId;
  const isImperial =
    measurementSystemId != null && imperialSystem?.id === measurementSystemId;

  // Unit lookup by code so we can auto-select ids
  const unitByCode = useMemo(() => {
    const map = new Map<string, any>();
    (units ?? []).forEach((u: any) => {
      const code = String(u?.code ?? "").toUpperCase();
      if (code) map.set(code, u);
    });
    return map;
  }, [units]);

  const uCM = unitByCode.get("CM") ?? null;
  const uM = unitByCode.get("M") ?? null;
  const uIN = unitByCode.get("IN") ?? null;
  const uKG = unitByCode.get("KG") ?? null;
  const uLB = unitByCode.get("LB") ?? null;

  const heightUnits = useMemo(() => {
    if (isMetric) return [uCM, uM].filter(Boolean);
    if (isImperial) return [uIN].filter(Boolean);
    return [uCM, uM, uIN].filter(Boolean);
  }, [isMetric, isImperial, uCM, uM, uIN]);

  const weightUnits = useMemo(() => {
    if (isMetric) return [uKG].filter(Boolean);
    if (isImperial) return [uLB].filter(Boolean);
    return [uKG, uLB].filter(Boolean);
  }, [isMetric, isImperial, uKG, uLB]);

  // Disable body metrics until system chosen
  const bodyMetricsLocked = measurementSystemId == null;

  const BirthYear = useMemo(() => {
    return parseOptionalInteger(birthYearText);
  }, [birthYearText]);

  const HeightNum = useMemo(() => {
    return parseOptionalDecimal(heightNumText);
  }, [heightNumText]);

  const WeightNum = useMemo(() => {
    return parseOptionalDecimal(weightNumText);
  }, [weightNumText]);

  const isHeightIncomplete = useMemo(() => {
    return isIncompleteDecimalInput(heightNumText);
  }, [heightNumText]);

  const isWeightIncomplete = useMemo(() => {
    return isIncompleteDecimalInput(weightNumText);
  }, [weightNumText]);

  const heightUnitLabel = isImperial ? "in" : "cm";
  const weightUnitLabel = isImperial ? "lb" : "kg";

  const birthYearFormatError = useMemo(() => {
    return getRawIntegerFormatError(birthYearText);
  }, [birthYearText]);

  const heightFormatError = useMemo(() => {
    return getRawDecimalFormatError(heightNumText, heightUnitLabel);
  }, [heightNumText, heightUnitLabel]);

  const weightFormatError = useMemo(() => {
    return getRawDecimalFormatError(weightNumText, weightUnitLabel);
  }, [weightNumText, weightUnitLabel]);

  const birthYearValidation = useMemo(() => {
    if (birthYearFormatError) {
      return { status: "invalid" as const, message: birthYearFormatError };
    }
    return validateBirthYear(BirthYear, { required: true });
  }, [BirthYear, birthYearFormatError]);

  const heightValidation = useMemo(() => {
    if (bodyMetricsLocked) {
      return { status: "missing" as const, message: "Height is required." };
    }

    if (heightFormatError) {
      return { status: "invalid" as const, message: heightFormatError };
    }

    if (isHeightIncomplete) {
      return {
        status: "invalid" as const,
        message: getIncompleteDecimalMessage("Height"),
      };
    }

    return validateHeight(HeightNum, heightUnitLabel, { required: true });
  }, [
    bodyMetricsLocked,
    HeightNum,
    heightFormatError,
    isHeightIncomplete,
    heightUnitLabel,
  ]);

  const weightValidation = useMemo(() => {
    if (bodyMetricsLocked) {
      return { status: "missing" as const, message: "Weight is required." };
    }

    if (weightFormatError) {
      return { status: "invalid" as const, message: weightFormatError };
    }

    if (isWeightIncomplete) {
      return {
        status: "invalid" as const,
        message: getIncompleteDecimalMessage("Weight"),
      };
    }

    return validateWeight(WeightNum, weightUnitLabel, { required: true });
  }, [
    bodyMetricsLocked,
    WeightNum,
    weightFormatError,
    isWeightIncomplete,
    weightUnitLabel,
  ]);

  // Auto-pick defaults when system changes (Metric: CM+KG, Imperial: IN+LB)
  useEffect(() => {
    if (measurementSystemId == null) return;

    if (isMetric) {
      const nextHeight = uCM?.id ?? uM?.id ?? null;
      const nextWeight = uKG?.id ?? null;

      if (nextHeight && heightUnitId == null) setHeightUnitId(nextHeight);
      if (nextWeight && weightUnitId == null) setWeightUnitId(nextWeight);

      // If user previously picked Imperial units, snap to Metric defaults
      if (heightUnitId != null && uIN?.id === heightUnitId && nextHeight)
        setHeightUnitId(nextHeight);
      if (weightUnitId != null && uLB?.id === weightUnitId && nextWeight)
        setWeightUnitId(nextWeight);
    }

    if (isImperial) {
      const nextHeight = uIN?.id ?? null;
      const nextWeight = uLB?.id ?? null;

      if (nextHeight && heightUnitId == null) setHeightUnitId(nextHeight);
      if (nextWeight && weightUnitId == null) setWeightUnitId(nextWeight);

      // If user previously picked Metric units, snap to Imperial defaults
      if (
        heightUnitId != null &&
        (uCM?.id === heightUnitId || uM?.id === heightUnitId) &&
        nextHeight
      )
        setHeightUnitId(nextHeight);

      if (weightUnitId != null && uKG?.id === weightUnitId && nextWeight)
        setWeightUnitId(nextWeight);
    }
  }, [
    measurementSystemId,
    isMetric,
    isImperial,
    uCM,
    uM,
    uIN,
    uKG,
    uLB,
    heightUnitId,
    weightUnitId,
  ]);

  const liveMissingLabels = useMemo(() => {
    const missing: string[] = [];

    if (measurementSystemId == null) missing.push("Measurement system");
    if (birthYearValidation.status === "missing") missing.push("Birth year");
    if (raceId == null) missing.push("Race");
    if (sexId == null) missing.push("Sex");

    if (measurementSystemId != null) {
      if (heightValidation.status === "missing") missing.push("Height value");
      if (heightUnitId == null) missing.push("Height unit");
      if (weightValidation.status === "missing") missing.push("Weight value");
      if (weightUnitId == null) missing.push("Weight unit");
    }

    return missing;
  }, [
    measurementSystemId,
    birthYearValidation,
    raceId,
    sexId,
    heightValidation,
    heightUnitId,
    weightValidation,
    weightUnitId,
  ]);

  const liveInvalidLabels = useMemo(() => {
    const invalid: string[] = [];

    if (birthYearValidation.status === "invalid") invalid.push("Birth year");

    if (measurementSystemId != null) {
      if (heightValidation.status === "invalid") invalid.push("Height value");
      if (weightValidation.status === "invalid") invalid.push("Weight value");
    }

    return invalid;
  }, [
    birthYearValidation,
    measurementSystemId,
    heightValidation,
    weightValidation,
  ]);

  const canSubmit =
    liveMissingLabels.length === 0 &&
    liveInvalidLabels.length === 0 &&
    !isDisabled;

  const handleSubmit = useCallback(async () => {
    const missing: string[] = [];
    const invalid: string[] = [];

    if (measurementSystemId == null) missing.push("Measurement system");
    if (birthYearValidation.status === "missing") missing.push("Birth year");
    if (raceId == null) missing.push("Race");
    if (sexId == null) missing.push("Sex");

    if (measurementSystemId != null) {
      if (heightValidation.status === "missing") missing.push("Height value");
      if (heightUnitId == null) missing.push("Height unit");
      if (weightValidation.status === "missing") missing.push("Weight value");
      if (weightUnitId == null) missing.push("Weight unit");
    }

    if (
      birthYearValidation.status === "invalid" &&
      birthYearValidation.message
    ) {
      invalid.push(birthYearValidation.message);
    }

    if (measurementSystemId != null) {
      if (heightValidation.status === "invalid" && heightValidation.message) {
        invalid.push(heightValidation.message);
      }
      if (weightValidation.status === "invalid" && weightValidation.message) {
        invalid.push(weightValidation.message);
      }
    }

    if (missing.length) {
      Alert.alert("Missing info", `Please fill: ${missing.join(", ")}`);
      return;
    }

    if (invalid.length) {
      Alert.alert("Invalid values", invalid.join("\n"));
      return;
    }

    const draft: ProfileEdit = {
      BirthYear: BirthYear!,
      RaceId: raceId,
      SexId: sexId,
      HeightNum: HeightNum!,
      HeightUnitId: heightUnitId,
      WeightNum: WeightNum!,
      WeightUnitId: weightUnitId,
      MeasurementSystemId: measurementSystemId,
      selectedHealthConditionIds,
    };

    await onSubmit(draft);
  }, [
    measurementSystemId,
    birthYearValidation,
    raceId,
    sexId,
    heightValidation,
    heightUnitId,
    weightValidation,
    weightUnitId,
    BirthYear,
    HeightNum,
    WeightNum,
    onSubmit,
    selectedHealthConditionIds,
  ]);
  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: 12,
          padding: 10,
          gap: 8,
        }}
      >
        <Text style={{ color: c.text.primary, fontWeight: "700" }}>
          Required to apply
        </Text>

        {liveMissingLabels.length === 0 && liveInvalidLabels.length === 0 ? (
          <Text style={{ color: c.text.secondary }}>
            All required fields completed.
          </Text>
        ) : (
          <>
            {liveMissingLabels.length > 0 ? (
              <>
                <Text style={{ color: c.text.secondary }}>
                  Please complete:
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {liveMissingLabels.map((label) => (
                    <Chip key={`missing-${label}`} label={label} />
                  ))}
                </View>
              </>
            ) : null}

            {liveInvalidLabels.length > 0 ? (
              <>
                <Text style={{ color: c.text.secondary }}>Please correct:</Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {liveInvalidLabels.map((label) => (
                    <Chip key={`invalid-${label}`} label={label} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>
          Birth year
        </Text>
        <TextInput
          value={birthYearText}
          onChangeText={(t) => setBirthYearText(sanitizeYearInput(t))}
          placeholder="Example: 1999"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          editable={!isDisabled}
          placeholderTextColor={c.text.secondary}
          style={{
            borderWidth: 1,
            borderColor:
              birthYearValidation.status === "invalid" ? c.danger : c.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: c.text.primary,
            backgroundColor: c.surface,
          }}
        />
        {birthYearValidation.status !== "valid" &&
        birthYearValidation.message ? (
          <Text
            style={{
              color:
                birthYearValidation.status === "invalid"
                  ? c.danger
                  : c.text.muted,
              fontSize: 12,
            }}
          >
            {birthYearValidation.message}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>Race</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(races ?? []).map((r) => (
            <Chip
              key={r.id}
              label={r.label}
              selected={raceId === r.id}
              onPress={() => {
                if (isDisabled) return;
                setRaceId(r.id);
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>Sex</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(sexes ?? []).map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              selected={sexId === s.id}
              onPress={() => {
                if (isDisabled) return;
                setSexId(s.id);
              }}
            />
          ))}
        </View>
      </View>

      {/* <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>Height</Text>

        <TextInput
          value={heightNumText}
          onChangeText={setHeightNumText}
          placeholder="Value"
          keyboardType="decimal-pad"
          editable={!isDisabled}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: c.text.primary,
            backgroundColor: c.surface,
          }}
        />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(heightUnits ?? []).map((u: any) => (
            <Chip
              key={u.id}
              label={u.label}
              selected={heightUnitId === u.id}
              onPress={() => {
                if (isDisabled) return;
                setHeightUnitId(u.id);
              }}
            />
          ))}
        </View>

        {(heightUnits ?? []).length === 0 ? (
          <Text style={{ color: c.text.muted }}>
            No height units available.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>Weight</Text>

        <TextInput
          value={weightNumText}
          onChangeText={setWeightNumText}
          placeholder="Value"
          keyboardType="decimal-pad"
          editable={!isDisabled}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: c.text.primary,
            backgroundColor: c.surface,
          }}
        />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(weightUnits ?? []).map((u: any) => (
            <Chip
              key={u.id}
              label={u.label}
              selected={weightUnitId === u.id}
              onPress={() => {
                if (isDisabled) return;
                setWeightUnitId(u.id);
              }}
            />
          ))}
        </View>

        {(weightUnits ?? []).length === 0 ? (
          <Text style={{ color: c.text.muted }}>
            No weight units available.
          </Text>
        ) : null}
      </View> */}

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>
          Measurement system
        </Text>

        {measurementSystemOptions.length === 0 ? (
          <Text style={{ color: c.text.muted }}>
            Measurement system options are unavailable.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {measurementSystemOptions.map((m: any) => (
              <Chip
                key={m.id}
                label={
                  norm(m.label) === "metric" ? "Metric (SI)" : "Imperial (US)"
                }
                selected={measurementSystemId === m.id}
                onPress={() => {
                  if (isDisabled) return;
                  setMeasurementSystemId(m.id);
                }}
              />
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        {bodyMetricsLocked ? (
          <Text style={{ color: c.text.muted, fontSize: 12 }}>
            Select a measurement system first to enter height and weight.
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 12 }}>
          {/* Height */}
          <View
            style={{ flex: 1, gap: 6, opacity: bodyMetricsLocked ? 0.5 : 1 }}
          >
            <Text style={{ color: c.text.primary, fontWeight: "600" }}>
              Height
            </Text>

            <TextInput
              value={heightNumText}
              onChangeText={(t) => setHeightNumText(sanitizeDecimalInput(t))}
              placeholder={isImperial ? "Example: 68.5" : "Example: 174.5"}
              keyboardType="decimal-pad"
              inputMode="decimal"
              editable={!isDisabled && !bodyMetricsLocked}
              placeholderTextColor={c.text.secondary}
              style={{
                borderWidth: 1,
                borderColor:
                  heightValidation.status === "invalid" ? c.danger : c.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: c.text.primary,
                backgroundColor: c.surface,
              }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(heightUnits ?? []).map((u: any) => (
                <Chip
                  key={u.id}
                  label={u.label}
                  selected={heightUnitId === u.id}
                  onPress={() => {
                    if (isDisabled || bodyMetricsLocked) return;
                    setHeightUnitId(u.id);
                  }}
                />
              ))}
            </View>

            {!bodyMetricsLocked && (heightUnits ?? []).length === 0 ? (
              <Text style={{ color: c.text.muted }}>
                No height units available.
              </Text>
            ) : null}

            {measurementSystemId != null ? (
              <Text
                style={{
                  color:
                    heightValidation.status === "invalid"
                      ? c.danger
                      : c.text.muted,
                  fontSize: 12,
                }}
              >
                {heightValidation.status === "valid"
                  ? `Enter height in ${heightUnitLabel}. Decimals are allowed.`
                  : heightValidation.message}
              </Text>
            ) : null}
          </View>

          {/* Weight */}
          <View
            style={{ flex: 1, gap: 6, opacity: bodyMetricsLocked ? 0.5 : 1 }}
          >
            <Text style={{ color: c.text.primary, fontWeight: "600" }}>
              Weight
            </Text>

            <TextInput
              value={weightNumText}
              onChangeText={(t) => setWeightNumText(sanitizeDecimalInput(t))}
              placeholder={isImperial ? "Example: 159.5" : "Example: 72.5"}
              keyboardType="decimal-pad"
              inputMode="decimal"
              editable={!isDisabled && !bodyMetricsLocked}
              placeholderTextColor={c.text.secondary}
              style={{
                borderWidth: 1,
                borderColor:
                  weightValidation.status === "invalid" ? c.danger : c.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: c.text.primary,
                backgroundColor: c.surface,
              }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(weightUnits ?? []).map((u: any) => (
                <Chip
                  key={u.id}
                  label={u.label}
                  selected={weightUnitId === u.id}
                  onPress={() => {
                    if (isDisabled || bodyMetricsLocked) return;
                    setWeightUnitId(u.id);
                  }}
                />
              ))}
            </View>

            {!bodyMetricsLocked && (weightUnits ?? []).length === 0 ? (
              <Text style={{ color: c.text.muted }}>
                No weight units available.
              </Text>
            ) : null}

            {measurementSystemId != null ? (
              <Text
                style={{
                  color:
                    weightValidation.status === "invalid"
                      ? c.danger
                      : c.text.muted,
                  fontSize: 12,
                }}
              >
                {weightValidation.status === "valid"
                  ? `Enter weight in ${weightUnitLabel}. Decimals are allowed.`
                  : weightValidation.message}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>
          Health conditions (optional)
        </Text>

        {(healthConditions ?? []).length === 0 ? (
          <Text style={{ color: c.text.muted }}>
            No health conditions found.
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(healthConditions ?? []).map((h) => (
              <Chip
                key={h.id}
                label={h.label}
                selected={selectedHealthConditionIds.includes(h.id)}
                onPress={() => {
                  if (isDisabled) return;
                  toggleHealthCondition(h.id);
                }}
              />
            ))}
          </View>
        )}
      </View>

      <Pressable
        onPress={() => {
          if (!canSubmit) return;
          handleSubmit();
        }}
        style={{
          opacity: canSubmit ? 1 : 0.6,
          backgroundColor: c.primary,
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: c.text.inverse, fontWeight: "700" }}>
          {isDisabled ? "Saving..." : "Save profile"}
        </Text>
      </Pressable>
    </View>
  );
}
