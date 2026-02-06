// src/components/composite/profile/CompleteProfileForm.tsx
import Chip from "@/src/components/ui/Chip";
import { useMasters } from "@/src/hooks/useMasters";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import type { ProfileEdit } from "@/src/services/profile/api";

type Props = {
  onSubmit: (draft: ProfileEdit) => void | Promise<void>;
  disabled?: boolean;
};

function toNumberOrNull(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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
    const BirthYear = toNumberOrNull(birthYearText);
    const HeightNum = toNumberOrNull(heightNumText);
    const WeightNum = toNumberOrNull(weightNumText);

    // const missing: string[] = [];
    // if (BirthYear == null) missing.push("Birth year");
    // if (raceId == null) missing.push("Race");
    // if (sexId == null) missing.push("Sex");
    // if (HeightNum == null) missing.push("Height value");
    // if (heightUnitId == null) missing.push("Height unit");
    // if (WeightNum == null) missing.push("Weight value");
    // if (weightUnitId == null) missing.push("Weight unit");
    // if (measurementSystemId == null) missing.push("Measurement system");
    const missing: string[] = [];
    if (measurementSystemId == null) missing.push("Measurement system");
    if (BirthYear == null) missing.push("Birth year");
    if (raceId == null) missing.push("Race");
    if (sexId == null) missing.push("Sex");

    if (measurementSystemId != null) {
      if (HeightNum == null) missing.push("Height value");
      if (heightUnitId == null) missing.push("Height unit");
      if (WeightNum == null) missing.push("Weight value");
      if (weightUnitId == null) missing.push("Weight unit");
    }

    return missing;
  }, [
    birthYearText,
    heightNumText,
    weightNumText,
    raceId,
    sexId,
    heightUnitId,
    weightUnitId,
    measurementSystemId,
  ]);

  const canSubmit = liveMissingLabels.length === 0 && !isDisabled;

  const handleSubmit = useCallback(async () => {
    const BirthYear = toNumberOrNull(birthYearText);
    const HeightNum = toNumberOrNull(heightNumText);
    const WeightNum = toNumberOrNull(weightNumText);

    // const missing: string[] = [];
    // if (BirthYear == null) missing.push("BirthYear");
    // if (raceId == null) missing.push("RaceId");
    // if (sexId == null) missing.push("SexId");
    // if (HeightNum == null) missing.push("HeightNum");
    // if (heightUnitId == null) missing.push("HeightUnitId");
    // if (WeightNum == null) missing.push("WeightNum");
    // if (weightUnitId == null) missing.push("WeightUnitId");
    // if (measurementSystemId == null) missing.push("MeasurementSystemId");

    const missing: string[] = [];
    if (measurementSystemId == null) missing.push("Measurement system");
    if (BirthYear == null) missing.push("Birth year");
    if (raceId == null) missing.push("Race");
    if (sexId == null) missing.push("Sex");

    if (measurementSystemId != null) {
      if (HeightNum == null) missing.push("Height value");
      if (heightUnitId == null) missing.push("Height unit");
      if (WeightNum == null) missing.push("Weight value");
      if (weightUnitId == null) missing.push("Weight unit");
    }

    if (missing.length) {
      Alert.alert("Missing info", `Please fill: ${missing.join(", ")}`);
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
      selectedHealthConditionIds, // can be []
    };

    await onSubmit(draft);
  }, [
    birthYearText,
    heightNumText,
    measurementSystemId,
    onSubmit,
    raceId,
    selectedHealthConditionIds,
    sexId,
    heightUnitId,
    weightNumText,
    weightUnitId,
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

        {liveMissingLabels.length === 0 ? (
          <Text style={{ color: c.text.secondary }}>
            All required fields completed.
          </Text>
        ) : (
          <>
            <Text style={{ color: c.text.secondary }}>Please complete:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {liveMissingLabels.map((label) => (
                <Chip key={label} label={label} />
              ))}
            </View>
          </>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.text.primary, fontWeight: "600" }}>
          Birth year
        </Text>
        <TextInput
          value={birthYearText}
          onChangeText={setBirthYearText}
          placeholder="e.g., 1999"
          keyboardType="number-pad"
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

      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Height */}
        <View style={{ flex: 1, gap: 6, opacity: bodyMetricsLocked ? 0.5 : 1 }}>
          <Text style={{ color: c.text.primary, fontWeight: "600" }}>
            Height
          </Text>

          <TextInput
            value={heightNumText}
            onChangeText={setHeightNumText}
            placeholder="Value"
            keyboardType="decimal-pad"
            editable={!isDisabled && !bodyMetricsLocked}
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
        </View>

        {/* Weight */}
        <View style={{ flex: 1, gap: 6, opacity: bodyMetricsLocked ? 0.5 : 1 }}>
          <Text style={{ color: c.text.primary, fontWeight: "600" }}>
            Weight
          </Text>

          <TextInput
            value={weightNumText}
            onChangeText={setWeightNumText}
            placeholder="Value"
            keyboardType="decimal-pad"
            editable={!isDisabled && !bodyMetricsLocked}
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
